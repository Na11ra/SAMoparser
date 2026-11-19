from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from collections import Counter
from typing import Annotated, Any
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

from fastapi import (
    Depends,
    FastAPI,
    File,
    Header,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .db import get_db
from .models import Device, ImportBatch, SoftwareProduct
from .models import Installation as InstallationRow

app = FastAPI(
    title="SAMoparser — API учёта программного обеспечения",
    description=(
        "API прототипа системы управления программными активами. "
        "Позволяет вести каталог ПО, загружать установки, сопоставлять названия "
        "и выявлять лицензионные и внутренние риски."
    ),
    version="1.0.0",
)
MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024
MAX_XLSX_UNCOMPRESSED_SIZE = 50 * 1024 * 1024
XLSX_NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


class CatalogSoftware(BaseModel):
    name: str = Field(min_length=1, max_length=200, description="Каноническое название программного продукта")
    publisher: str = Field(default="", description="Издатель или разработчик ПО")
    version: str = Field(default="", description="Версия продукта")
    license_type: str = Field(default="free", description="Тип лицензии: free, paid или условно-бесплатная")
    policy_status: str = Field(default="current", description="Статус политики: current, outdated или prohibited")
    license_count: int | None = Field(default=None, ge=0, description="Количество доступных лицензий")


class Installation(BaseModel):
    computer_id: str = Field(min_length=1, max_length=200, description="Идентификатор компьютера")
    name: str = Field(min_length=1, max_length=300, description="Исходное название установленного ПО")
    publisher: str = Field(default="", description="Издатель из источника инвентаризации")
    version: str = Field(default="", description="Версия из источника инвентаризации")


class DeviceInput(BaseModel):
    computer_id: str = Field(min_length=1, max_length=200, description="Уникальный идентификатор компьютера")
    display_name: str = Field(default="", max_length=200, description="Отображаемое имя компьютера")
    department: str = Field(default="", max_length=200, description="Подразделение")
    user_name: str = Field(default="", max_length=200, description="Пользователь компьютера")
    operating_system: str = Field(default="", max_length=100, description="Операционная система")


class ReviewDecision(BaseModel):
    software_name: str = Field(min_length=1, description="Исходное название, которое нужно подтвердить")
    catalog_name: str = Field(min_length=1, description="Название продукта из каталога")


def normalize_name(value: str) -> str:
    """Создать стабильный ключ для вариантов названий процессов и программ."""
    value = value.lower().replace("_", " ").replace("-", " ")
    value = re.sub(r"\.(exe|com)$", "", value)
    value = re.sub(r"\b(v\d+(?:\.\d+)*|version\s+\S+)\b", "", value)
    value = re.sub(r"\s+", " ", value).strip()
    normalized = {"google chrome": "chrome", "chrome": "chrome"}.get(value, value)
    if not normalized:
        raise ValueError("Название ПО не может быть пустым после нормализации")
    return normalized


def catalog_view(row: SoftwareProduct) -> dict[str, Any]:
    return {"name": row.name, "publisher": row.publisher, "version": row.version, "license_type": row.license_type, "policy_status": row.policy_status, "license_count": row.license_count}


def installation_view(row: InstallationRow) -> dict[str, Any]:
    # `id` нужен web-клиенту для DELETE /api/v1/installations/{id}; `observed_at`
    # отображает время регистрации факта в интерфейсе. Поля аддитивные: контракт
    # списка установок расширяется без изменения существующих ключей.
    return {"id": row.id, "computer_id": row.computer_id, "name": row.raw_name, "publisher": row.publisher, "version": row.version, "canonical_name": row.canonical_name, "match_status": row.match_status, "match_score": row.match_score, "observed_at": row.observed_at}


def match_installation(item: Installation, products: list[SoftwareProduct]) -> dict[str, Any]:
    key = normalize_name(item.name)
    candidate = next((entry for entry in products if entry.normalized_name == key), None)
    return {**item.model_dump(), "canonical_name": candidate.name if candidate else None, "match_status": "matched" if candidate else "unknown", "match_score": 1.0 if candidate else 0.0, "software_id": candidate.id if candidate else None}


def risk_for(item: InstallationRow, used: int, products_by_id: dict[int, SoftwareProduct]) -> dict[str, Any] | None:
    if item.canonical_name is None:
        return {"computer_id": item.computer_id, "software": item.raw_name, "risk": "unknown", "severity": "medium", "reason": "ПО не найдено в каталоге"}
    entry = products_by_id.get(item.software_id) if item.software_id is not None else None
    if entry is None:
        return None
    if entry.policy_status == "prohibited":
        return {"computer_id": item.computer_id, "software": entry.name, "risk": "prohibited", "severity": "critical", "reason": "ПО запрещено внутренней политикой"}
    if entry.policy_status == "outdated":
        return {"computer_id": item.computer_id, "software": entry.name, "risk": "outdated", "severity": "medium", "reason": "Версия ПО устарела"}
    if entry.license_count is not None and used > entry.license_count:
        return {"computer_id": item.computer_id, "software": entry.name, "risk": "license_shortage", "severity": "high", "reason": f"Установок: {used}, лицензий: {entry.license_count}"}
    return None


@app.get("/health", summary="Проверка работоспособности сервиса", tags=["Служебные"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready", summary="Проверка готовности сервиса и базы данных", tags=["Служебные"])
def ready(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get("/metrics", response_class=PlainTextResponse, summary="Метрики сервиса", tags=["Служебные"])
def metrics() -> str:
    return "# SAMoparser metrics placeholder\n"


@app.post("/api/v1/devices", status_code=201, summary="Зарегистрировать компьютер", tags=["Компьютеры"])
def add_device(item: DeviceInput, db: Session = Depends(get_db)) -> dict[str, Any]:
    device = db.scalar(select(Device).where(Device.computer_id == item.computer_id))
    if device is None:
        device = Device(computer_id=item.computer_id)
        db.add(device)
    device.display_name = item.display_name
    device.department = item.department
    device.user_name = item.user_name
    device.operating_system = item.operating_system
    db.commit()
    return device_view(device)


def device_view(device: Device) -> dict[str, Any]:
    return {"computer_id": device.computer_id, "display_name": device.display_name, "department": device.department, "user_name": device.user_name, "operating_system": device.operating_system}


@app.get("/api/v1/devices", summary="Получить зарегистрированные компьютеры", tags=["Компьютеры"])
def get_devices(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    return [device_view(device) for device in db.scalars(select(Device).order_by(Device.id))]


@app.delete("/api/v1/devices/{computer_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить компьютер", tags=["Компьютеры"])
def delete_device(computer_id: str, db: Session = Depends(get_db)) -> Response:
    device = db.scalar(select(Device).where(Device.computer_id == computer_id))
    if device is None:
        raise HTTPException(status_code=404, detail="Компьютер не найден")
    db.delete(device)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/v1/catalog", status_code=201, summary="Добавить или обновить ПО в каталоге", tags=["Каталог ПО"])
def add_catalog_item(item: CatalogSoftware, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        normalized = normalize_name(item.name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    row = db.scalar(select(SoftwareProduct).where(SoftwareProduct.normalized_name == normalized))
    if row is None:
        row = SoftwareProduct(normalized_name=normalized)
        db.add(row)
    row.name, row.publisher, row.version = item.name, item.publisher, item.version
    row.license_type, row.policy_status, row.license_count = item.license_type, item.policy_status, item.license_count
    db.commit()
    return catalog_view(row)


@app.get("/api/v1/catalog", summary="Получить каталог разрешённого ПО", tags=["Каталог ПО"])
def get_catalog(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    return [catalog_view(row) for row in db.scalars(select(SoftwareProduct).order_by(SoftwareProduct.id))]


@app.delete("/api/v1/catalog/{name}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить ПО из каталога", tags=["Каталог ПО"])
def delete_catalog_item(name: str, db: Session = Depends(get_db)) -> Response:
    try:
        normalized = normalize_name(name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    product = db.scalar(select(SoftwareProduct).where(SoftwareProduct.normalized_name == normalized))
    if product is None:
        raise HTTPException(status_code=404, detail="Продукт не найден в каталоге")
    for installation in db.scalars(select(InstallationRow).where(InstallationRow.software_id == product.id)):
        installation.software_id = None
        installation.canonical_name = None
        installation.match_status = "unknown"
        installation.match_score = 0.0
    db.delete(product)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def import_rows(
    payload: list[Installation],
    db: Session,
    idempotency_key: str | None = None,
) -> tuple[dict[str, Any], list[InstallationRow]]:
    serialized = json.dumps(
        [item.model_dump(mode="json") for item in payload],
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    fingerprint = hashlib.sha256(serialized).hexdigest()
    if idempotency_key:
        previous_batch = db.scalar(
            select(ImportBatch).where(ImportBatch.idempotency_key == idempotency_key)
        )
        if previous_batch is not None:
            if previous_batch.payload_fingerprint != fingerprint:
                raise HTTPException(
                    status_code=409,
                    detail="Idempotency-Key уже использован с другим содержимым файла",
                )
            return {
                "accepted": previous_batch.accepted_count,
                "unknown": previous_batch.unknown_count,
                "replayed": True,
            }, []

    products = list(db.scalars(select(SoftwareProduct)))
    devices = {device.computer_id: device for device in db.scalars(select(Device))}
    missing_devices = sorted({item.computer_id for item in payload if item.computer_id not in devices})
    if missing_devices:
        raise HTTPException(status_code=422, detail={"message": "Компьютеры не зарегистрированы", "computer_ids": missing_devices})
    records = [match_installation(item, products) for item in payload]
    inserted: list[InstallationRow] = []
    for record in records:
        row = InstallationRow(computer_id=record["computer_id"], raw_name=record["name"], publisher=record["publisher"], version=record["version"], canonical_name=record["canonical_name"], match_status=record["match_status"], match_score=record["match_score"], software_id=record["software_id"], device_id=devices[record["computer_id"]].id)
        db.add(row)
        inserted.append(row)
    result = {
        "accepted": len(records),
        "unknown": sum(x["match_status"] == "unknown" for x in records),
        "replayed": False,
    }
    if idempotency_key:
        batch = ImportBatch(
            idempotency_key=idempotency_key,
            payload_fingerprint=fingerprint,
            accepted_count=result["accepted"],
            unknown_count=result["unknown"],
        )
        db.add(batch)
        db.flush()
        for row in inserted:
            row.import_batch_id = batch.id
    db.commit()
    return result, inserted


@app.post("/api/v1/installations", status_code=201, summary="Добавить одну установку", tags=["Установки"])
def add_installation(item: Installation, db: Session = Depends(get_db)) -> dict[str, Any]:
    _, inserted = import_rows([item], db)
    return installation_view(inserted[0])


async def read_import_file(file: UploadFile) -> tuple[str, bytes]:
    filename = file.filename or ""
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in {"csv", "json", "xlsx"}:
        raise HTTPException(status_code=415, detail="Поддерживаются только файлы .csv, .json и .xlsx")
    content = await file.read(MAX_IMPORT_FILE_SIZE + 1)
    if len(content) > MAX_IMPORT_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Размер файла превышает 10 МБ")
    if not content:
        raise HTTPException(status_code=400, detail="Файл пуст")
    return extension, content


def parse_csv_installations(content: bytes) -> list[Installation]:
    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail="CSV-файл должен быть в кодировке UTF-8") from exc
    reader = csv.DictReader(io.StringIO(decoded))
    if not reader.fieldnames:
        raise HTTPException(status_code=422, detail="В CSV-файле отсутствует строка заголовков")
    try:
        return [
            Installation(
                computer_id=row.get("computer_id") or row.get("serial_number") or row.get("COMPUTERS.SERIAL_NUMBER") or "",
                name=row.get("name") or row.get("displayname") or row.get("SOFTWARE.DISPLAYNAME") or "",
                publisher=row.get("publisher") or row.get("SOFTWARE.PUBLISHER") or "",
                version=row.get("version") or row.get("SOFTWARE.VERSION") or "",
            )
            for row in reader
        ]
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Строки CSV не соответствуют формату установок") from exc


def parse_xlsx_installations(content: bytes) -> list[Installation]:
    """Прочитать установки с первого листа XLSX без сторонних библиотек."""
    try:
        with ZipFile(io.BytesIO(content)) as archive:
            members = [info for info in archive.infolist() if not info.is_dir()]
            if sum(info.file_size for info in members) > MAX_XLSX_UNCOMPRESSED_SIZE:
                raise HTTPException(status_code=413, detail="Распакованный XLSX-файл слишком большой")

            shared_strings: list[str] = []
            if "xl/sharedStrings.xml" in archive.namelist():
                shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
                shared_strings = [
                    "".join(node.text or "" for node in item.findall(".//m:t", XLSX_NS))
                    for item in shared_root.findall("m:si", XLSX_NS)
                ]

            workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
            relationships_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
            targets = {
                node.attrib["Id"]: node.attrib["Target"]
                for node in relationships_root
            }
            sheet = workbook_root.find(".//m:sheets/m:sheet", XLSX_NS)
            if sheet is None:
                raise HTTPException(status_code=422, detail="В XLSX-файле нет листов")
            relationship_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            worksheet_path = targets.get(relationship_id)
            if worksheet_path is None:
                raise HTTPException(status_code=422, detail="Не найден XML первого листа XLSX")
            worksheet_path = "xl/" + worksheet_path.lstrip("/")
            worksheet_root = ET.fromstring(archive.read(worksheet_path))

            rows: list[list[str]] = []
            for row in worksheet_root.findall(".//m:sheetData/m:row", XLSX_NS):
                values: list[str] = []
                for cell in row.findall("m:c", XLSX_NS):
                    value = cell.find("m:v", XLSX_NS)
                    text_value = "" if value is None else value.text or ""
                    if cell.attrib.get("t") == "s" and text_value:
                        text_value = shared_strings[int(text_value)]
                    elif cell.attrib.get("t") == "inlineStr":
                        text_value = "".join(node.text or "" for node in cell.findall(".//m:t", XLSX_NS))
                    values.append(text_value.strip())
                rows.append(values)
    except BadZipFile as exc:
        raise HTTPException(status_code=422, detail="Файл не является корректным XLSX") from exc
    except (ET.ParseError, KeyError, IndexError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Структура XLSX-файла не поддерживается") from exc

    if not rows or not rows[0]:
        raise HTTPException(status_code=422, detail="В XLSX-файле отсутствует строка заголовков")
    headers = [header.strip() for header in rows[0]]
    if not {"COMPUTERS.SERIAL_NUMBER", "SOFTWARE.DISPLAYNAME"}.issubset(headers) and not {"computer_id", "name"}.issubset(headers):
        raise HTTPException(status_code=422, detail="В XLSX-файле нет обязательных колонок компьютера и названия ПО")

    result: list[Installation] = []
    for values in rows[1:]:
        row = dict(zip(headers, values))
        result.append(
            Installation(
                computer_id=row.get("computer_id") or row.get("serial_number") or row.get("COMPUTERS.SERIAL_NUMBER") or "",
                name=row.get("name") or row.get("displayname") or row.get("SOFTWARE.DISPLAYNAME") or "",
                publisher=row.get("publisher") or row.get("SOFTWARE.PUBLISHER") or "",
                version=row.get("version") or row.get("SOFTWARE.VERSION") or "",
            )
        )
    return result


@app.post("/api/v1/import/installations", status_code=201, summary="Импортировать установки из файла JSON или CSV", tags=["Импорт"])
async def import_installations(
    file: UploadFile = File(..., description="Файл .json или .csv с установками"),
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key", max_length=200)] = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    extension, content = await read_import_file(file)
    try:
        if extension == "json":
            try:
                parsed = json.loads(content.decode("utf-8-sig"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise HTTPException(status_code=422, detail="Некорректный JSON-файл в кодировке UTF-8") from exc
            if not isinstance(parsed, list):
                raise HTTPException(status_code=422, detail="JSON должен содержать массив установок")
            payload = [Installation.model_validate(item) for item in parsed]
        elif extension == "csv":
            payload = parse_csv_installations(content)
        else:
            payload = parse_xlsx_installations(content)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="Записи файла не соответствуют формату установок") from exc
    return import_rows(payload, db, idempotency_key)[0]


@app.post("/api/v1/import/installations/csv", status_code=201, summary="Импортировать установки из CSV-файла", tags=["Импорт"])
async def import_installations_csv(
    file: UploadFile = File(..., description="CSV-файл с заголовками компьютер, название, издатель и версия"),
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key", max_length=200)] = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    extension, content = await read_import_file(file)
    if extension != "csv":
        raise HTTPException(status_code=415, detail="Для этой ручки требуется CSV-файл")
    return import_rows(parse_csv_installations(content), db, idempotency_key)[0]


@app.get("/api/v1/installations", summary="Получить страницу установок", tags=["Установки"])
def get_installations(
    status: Annotated[str | None, Query(description="Фильтр по статусу сопоставления: matched или unknown")] = None,
    limit: Annotated[int, Query(ge=1, le=500, description="Число записей на странице (от 1 до 500)")] = 100,
    offset: Annotated[int, Query(ge=0, description="Число записей, которые нужно пропустить")] = 0,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if not 1 <= limit <= 500 or offset < 0:
        raise HTTPException(status_code=422, detail="Параметры страницы вне допустимого диапазона")
    query = select(InstallationRow).order_by(InstallationRow.id)
    count_query = select(func.count()).select_from(InstallationRow)
    if status is not None:
        query = query.where(InstallationRow.match_status == status)
        count_query = count_query.where(InstallationRow.match_status == status)
    total = db.scalar(count_query) or 0
    items = [installation_view(row) for row in db.scalars(query.limit(limit).offset(offset))]
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@app.delete("/api/v1/installations/{installation_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить установку", tags=["Установки"])
def delete_installation(installation_id: int, db: Session = Depends(get_db)) -> Response:
    installation = db.get(InstallationRow, installation_id)
    if installation is None:
        raise HTTPException(status_code=404, detail="Установка не найдена")
    db.delete(installation)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def collect_risks(db: Session) -> list[dict[str, Any]]:
    rows = list(db.scalars(select(InstallationRow).order_by(InstallationRow.id)))
    products = {row.id: row for row in db.scalars(select(SoftwareProduct))}
    counts = Counter(row.canonical_name or row.raw_name for row in rows)
    return [risk for row in rows if (risk := risk_for(row, counts[row.canonical_name or row.raw_name], products)) is not None]


@app.get("/api/v1/risks", summary="Получить выявленные риски", tags=["Риски"])
def get_risks(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    return collect_risks(db)


@app.get("/api/v1/dashboard/summary", summary="Получить сводку для панели управления", tags=["Панель управления"])
def dashboard_summary(db: Session = Depends(get_db)) -> dict[str, int]:
    risks = collect_risks(db)
    rows = list(db.scalars(select(InstallationRow)))
    return {"catalog_software": len(list(db.scalars(select(SoftwareProduct)))), "installations": len(rows), "matched": sum(x.match_status == "matched" for x in rows), "unknown": sum(x.match_status == "unknown" for x in rows), "critical_risks": sum(x["severity"] == "critical" for x in risks), "high_risks": sum(x["severity"] == "high" for x in risks), "medium_risks": sum(x["severity"] == "medium" for x in risks)}


@app.post("/api/v1/review", summary="Подтвердить сопоставление ПО", tags=["Проверка"])
def review_match(decision: ReviewDecision, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        normalized = normalize_name(decision.catalog_name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    product = db.scalar(select(SoftwareProduct).where(SoftwareProduct.normalized_name == normalized))
    if product is None:
        raise HTTPException(status_code=422, detail="Продукт не найден в каталоге")
    rows = list(db.scalars(select(InstallationRow).where(InstallationRow.raw_name == decision.software_name)))
    if not rows:
        raise HTTPException(status_code=404, detail="installation not found")
    for row in rows:
        row.canonical_name, row.match_status, row.match_score, row.software_id = product.name, "matched", 1.0, product.id
    db.commit()
    return {"updated": len(rows)}
