"""Server-Sent Events with replay (schema §6.2, DD-07, DD-08)."""

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import Request
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from app.services.event_service import EventBus


def last_seen(request: Request, last_event_id: int | None) -> int:
    """Last-Event-ID header (automatic reconnect) wins over the query parameter (fresh load)."""
    header = request.headers.get("last-event-id")
    if header and header.isdigit():
        return int(header)
    return last_event_id or 0


def _format(event: dict) -> str:
    data = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event['event_type']}\nid: {event['sequence_number']}\ndata: {data}\n\n"


def event_stream(
    request: Request,
    bus: EventBus,
    resource_type: str,
    resource_id: str,
    after: int,
    heartbeat_seconds: int,
) -> StreamingResponse:
    key = (resource_type, resource_id)

    async def generate() -> AsyncIterator[str]:
        queue = bus.subscribe(key)  # subscribe before replay so nothing is missed in between
        last = after
        try:
            while True:
                for event in await run_in_threadpool(bus.events_after, key, last):
                    yield _format(event)
                    last = event["sequence_number"]
                    if event["event_type"] == "terminal":
                        return  # exactly one terminal event, then close
                if await request.is_disconnected():
                    return
                try:
                    await asyncio.wait_for(queue.get(), timeout=heartbeat_seconds)
                except TimeoutError:
                    yield ": heartbeat\n\n"  # comment line: not persisted, no id (DD-07)
        finally:
            bus.unsubscribe(key, queue)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
