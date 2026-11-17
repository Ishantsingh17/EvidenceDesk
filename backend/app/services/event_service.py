"""Workflow events (schema §6): persist first, then notify SSE subscribers.

Workers run in threads; the SSE handlers run on the event loop. `publish` writes the event
in its own short transaction and then hands a wake-up signal to the loop with
`call_soon_threadsafe`. Subscribers always re-read from SQLite, so a missed signal never
loses an event and reconnecting clients replay by sequence number.
"""

import asyncio
import logging
import threading
from pathlib import Path
from typing import Any

from app.db.sqlite import dumps, loads, now_iso, transaction

logger = logging.getLogger(__name__)

Key = tuple[str, str]  # (resource_type, resource_id)


def row_to_event(row: Any) -> dict[str, Any]:
    return {
        "event_id": row["id"],
        "sequence_number": row["sequence_number"],
        "resource_type": row["resource_type"],
        "resource_id": row["resource_id"],
        "event_type": row["event_type"],
        "status": row["status"],
        "stage": row["stage"],
        "stage_status": row["stage_status"],
        "message": row["message"],
        "details": loads(row["details_json"]),
        "error_code": row["error_code"],
        "timestamp": row["created_at"],
    }


class EventBus:
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._loop: asyncio.AbstractEventLoop | None = None
        self._subscribers: dict[Key, set[asyncio.Queue[None]]] = {}
        self._lock = threading.Lock()  # serialises sequence numbers and subscriber sets

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def publish(
        self,
        resource_type: str,
        resource_id: str,
        *,
        status: str,
        event_type: str = "stage",
        stage: str | None = None,
        stage_status: str | None = None,
        message: str | None = None,
        details: dict[str, Any] | None = None,
        error_code: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            with transaction(self._db_path) as conn:
                seq = conn.execute(
                    "SELECT COALESCE(MAX(sequence_number), 0) + 1 FROM workflow_events "
                    "WHERE resource_type = ? AND resource_id = ?",
                    (resource_type, resource_id),
                ).fetchone()[0]
                cur = conn.execute(
                    "INSERT INTO workflow_events (resource_type, resource_id, sequence_number, "
                    "event_type, status, stage, stage_status, message, details_json, error_code, "
                    "created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        resource_type,
                        resource_id,
                        seq,
                        event_type,
                        status,
                        stage,
                        stage_status,
                        message,
                        dumps(details),
                        error_code,
                        now_iso(),
                    ),
                )
                row = conn.execute("SELECT * FROM workflow_events WHERE id = ?", (cur.lastrowid,)).fetchone()
            queues = list(self._subscribers.get((resource_type, resource_id), ()))
        event = row_to_event(row)
        if self._loop is not None:
            for queue in queues:
                self._loop.call_soon_threadsafe(queue.put_nowait, None)
        return event

    def subscribe(self, key: Key) -> asyncio.Queue[None]:
        queue: asyncio.Queue[None] = asyncio.Queue()
        with self._lock:
            self._subscribers.setdefault(key, set()).add(queue)
        return queue

    def unsubscribe(self, key: Key, queue: asyncio.Queue[None]) -> None:
        with self._lock:
            subscribers = self._subscribers.get(key)
            if subscribers:
                subscribers.discard(queue)
                if not subscribers:
                    del self._subscribers[key]

    def events_after(self, key: Key, after_sequence: int) -> list[dict[str, Any]]:
        with transaction(self._db_path) as conn:
            rows = conn.execute(
                "SELECT * FROM workflow_events WHERE resource_type = ? AND resource_id = ? "
                "AND sequence_number > ? ORDER BY sequence_number",
                (key[0], key[1], after_sequence),
            ).fetchall()
        return [row_to_event(r) for r in rows]
