from __future__ import annotations

import os
from pathlib import Path

from app.core.config import get_settings
from app.events.file_store import FileEventStore
from app.events.memory import InMemoryEventStore
from app.events.store import EventStore
from app.services.app_data import resolve_data_dir


def persist_events_enabled() -> bool:
    mode = os.environ.get("TOVA_EVENT_STORE", "file").strip().lower()
    return mode != "memory"


def create_event_store() -> EventStore:
    if not persist_events_enabled():
        return InMemoryEventStore()
    settings = get_settings()
    root = (
        Path(settings.data_dir).expanduser().resolve()
        if settings.data_dir
        else resolve_data_dir()
    )
    return FileEventStore(root / "mission-events")
