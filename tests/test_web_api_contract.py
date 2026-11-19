"""Проверка контракта, который использует web-клиент: идентификатор установки.

Фронтенду нужен `id` из GET /api/v1/installations, чтобы вызывать
DELETE /api/v1/installations/{id} для ручного ведения фактов установки (ТЗ).
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from services.backend.app import api
from services.backend.app.api import DeviceInput, Installation
from services.backend.app.db import Base


def test_installation_view_exposes_id_for_delete():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        api.add_device(DeviceInput(computer_id="web-pc"), db)
        created = api.add_installation(Installation(computer_id="web-pc", name="chrome.exe"), db)

        assert isinstance(created["id"], int)
        page = api.get_installations(status=None, limit=10, offset=0, db=db)
        assert page["items"][0]["id"] == created["id"]
        assert "observed_at" in page["items"][0]

        api.delete_installation(created["id"], db)
        assert api.get_installations(status=None, limit=10, offset=0, db=db)["total"] == 0
