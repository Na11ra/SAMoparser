import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  KeyRound,
  UploadCloud,
} from 'lucide-react';
import { useAppData } from '../app/AppDataContext';
import { useMutation } from '../app/useMutation';
import { describeError } from '../components/ui';
import {
  Badge,
  Button,
  Card,
  Field,
  Note,
  PageHeader,
} from '../components/ui';
import { formatDate, formatNumber } from '../lib/format';

const ALLOWED = ['csv', 'json', 'xlsx'];
const TEMPLATE_HEADERS = 'COMPUTERS.SERIAL_NUMBER,SOFTWARE.DISPLAYNAME,SOFTWARE.PUBLISHER,SOFTWARE.VERSION';

export default function Import() {
  const { api, devices } = useAppData();
  const { busy, run } = useMutation();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  const extension = file?.name?.split('.').pop()?.toLowerCase();
  const fileValid = Boolean(file) && ALLOWED.includes(extension) && file.size <= 10 * 1024 * 1024;

  function pick(selected) {
    if (!selected) return;
    setFile(selected);
    setResult(null);
    setError(null);
  }

  function downloadTemplate() {
    const firstDevice = devices.data?.[0]?.computer_id || 'WS-001';
    const content = `\uFEFF${TEMPLATE_HEADERS}\n${firstDevice},Google Chrome,Google LLC,130.0\n${firstDevice},Microsoft Office LTSC 2021,Microsoft,2021\n${firstDevice},studio_visual_2022.exe,Unknown,2022\n`;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sam-installations-template.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function upload() {
    if (!fileValid) return;
    setError(null);
    setResult(null);
    const response = await run(
      () => api.importInstallations(file, idempotencyKey.trim() || undefined),
      { success: null },
    );
    if (response.ok) {
      setResult(response.result);
      setHistory((items) => [{
        id: `${Date.now()}-${Math.random()}`,
        at: new Date().toISOString(),
        filename: file.name,
        size: file.size,
        key: idempotencyKey.trim() || null,
        ...response.result,
      }, ...items]);
    } else {
      setError(describeError(response.error));
      setHistory((items) => [{
        id: `${Date.now()}-${Math.random()}`,
        at: new Date().toISOString(),
        filename: file.name,
        size: file.size,
        key: idempotencyKey.trim() || null,
        failed: true,
      }, ...items]);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Данные"
        title="Импорт данных об установках"
        description="Коннектор сбора данных: загрузка готового CSV / JSON / XLSX с хостов."
        actions={<Button variant="outline" icon={Download} onClick={downloadTemplate}>Скачать шаблон CSV</Button>}
      />

      <div className="grid-2 import-grid">
        <Card title="Загрузить файл" subtitle="multipart/form-data · до 10 МБ · UTF-8 для CSV">
          <div
            className={`dropzone ${dragging ? 'dropzone-active' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              pick(event.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => event.key === 'Enter' && inputRef.current?.click()}
          >
            <UploadCloud size={28} />
            <b>{file ? file.name : 'Перетащите файл сюда или нажмите для выбора'}</b>
            <span>{file ? `${formatNumber(Math.round(file.size / 1024))} КБ · .${extension}` : 'Поддерживаются .csv, .json, .xlsx'}</span>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.json,.xlsx"
              hidden
              onChange={(event) => pick(event.target.files?.[0])}
            />
          </div>

          {file && !ALLOWED.includes(extension) ? <Note tone="danger">Недопустимое расширение файла. Backend принимает только .csv, .json, .xlsx.</Note> : null}
          {file && file.size > 10 * 1024 * 1024 ? <Note tone="danger">Файл больше 10 МБ — API вернёт 413.</Note> : null}

          <div className="form-grid form-grid-single">
            <Field label="Idempotency-Key (необязательно)" hint="Повтор с тем же ключом и содержимым не создаёт дубли; другой файл с тем же ключом даст 409.">
              <div className="input-with-button">
                <input className="input mono" value={idempotencyKey} onChange={(event) => setIdempotencyKey(event.target.value)} placeholder="batch-2026-11-19-01" />
                <Button variant="outline" size="sm" icon={KeyRound} onClick={() => setIdempotencyKey(`batch-${crypto.randomUUID().slice(0, 12)}`)}>Сгенерировать</Button>
              </div>
            </Field>
          </div>

          <div className="form-actions">
            <Button icon={UploadCloud} onClick={upload} disabled={!fileValid || busy}>{busy ? 'Загружаем…' : 'Загрузить в систему'}</Button>
            <span className="muted small">POST /api/v1/import/installations</span>
          </div>

          {error ? <Note tone="danger" title="Импорт отклонён">{error}. Если в ошибке перечислены computer_id — <Link className="link" to="/devices">зарегистрируйте компьютеры</Link> и повторите загрузку.</Note> : null}

          {result ? (
            <div className="import-result">
              <CheckCircle2 size={20} />
              <div>
                <b>Импорт завершён{result.replayed ? ' (повтор запроса, дубли не созданы)' : ''}</b>
                <div className="import-result-stats">
                  <span>Принято: <b>{formatNumber(result.accepted)}</b></span>
                  <span>Не распознано: <b>{formatNumber(result.unknown)}</b></span>
                  <span>Replayed: <b>{result.replayed ? 'да' : 'нет'}</b></span>
                </div>
                <Link className="link" to="/matching">Перейти к проверке имён <ArrowRight size={13} /></Link>
              </div>
            </div>
          ) : null}
        </Card>

        <div className="stack">
          <Card title="Формат файла" subtitle="Гибкий маппер заголовков backend">
            <div className="code-block">{TEMPLATE_HEADERS}{'\n'}WS-001,Google Chrome,Google LLC,130.0</div>
            <ul className="bullets">
              <li>Обязательные колонки: <code>COMPUTERS.SERIAL_NUMBER</code> (или <code>computer_id</code>) и <code>SOFTWARE.DISPLAYNAME</code> (или <code>name</code>).</li>
              <li>Необязательные: <code>SOFTWARE.PUBLISHER</code> / <code>publisher</code>, <code>SOFTWARE.VERSION</code> / <code>version</code>.</li>
              <li>CSV читается в UTF-8 (BOM допустим), XLSX — первый лист, JSON — массив объектов.</li>
              <li>«Грязные» имена процессов сохраняются как есть и попадают в очередь ручной проверки.</li>
            </ul>
          </Card>

          <Card title="Загрузки этой сессии" subtitle="Локальный журнал браузера (серверный /ingest/v1/batches в плане)">
            {history.length ? (
              <div className="history-list">
                {history.map((entry) => (
                  <div key={entry.id} className="history-item">
                    <FileSpreadsheet size={16} />
                    <div>
                      <b>{entry.filename}</b>
                      <small>{formatDate(entry.at)} · {formatNumber(Math.round(entry.size / 1024))} КБ {entry.key ? `· ${entry.key}` : ''}</small>
                    </div>
                    {entry.failed ? <Badge tone="danger">Ошибка</Badge> : <Badge tone="success">+{formatNumber(entry.accepted)}</Badge>}
                  </div>
                ))}
              </div>
            ) : <p className="muted">Загрузок ещё не было.</p>}
          </Card>

          <Note tone="warning" title="Ограничения контракта">
            Зарегистрировано компьютеров: <b>{formatNumber(devices.data?.length)}</b>. Все <code>computer_id</code> из файла должны существовать в справочнике, иначе backend вернёт 422 со списком неизвестных ID. Сервисный журнал batch/статусы обработки и приём отчётов агентов описаны в docs/backend-plan.md, но в текущем прототипе не реализованы.
          </Note>
        </div>
      </div>
    </>
  );
}
