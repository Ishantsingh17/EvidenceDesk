from typing import Any

from fastapi import APIRouter, Query, Request

from app.api.deps import runtime_of
from app.api.sse import event_stream, last_seen
from app.core.errors import AppError
from app.db.sqlite import transaction
from app.schemas.api import FeedbackRecorded, FeedbackRequest, QueryAccepted, QueryRequest
from app.services import query_service

router = APIRouter(tags=["queries"])


@router.post("/queries", status_code=202, response_model=QueryAccepted)
def submit_query(request: Request, body: QueryRequest) -> Any:
    return query_service.submit(runtime_of(request), body.question, body.document_ids, body.top_k)


@router.get("/queries")
def list_queries(
    request: Request,
    status: str | None = Query(default=None, pattern="^(queued|running|completed|insufficient_evidence|failed)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Any:
    return query_service.list_queries(runtime_of(request), status, page, page_size)


@router.get("/queries/{query_id}")
def get_query(request: Request, query_id: str) -> Any:
    return query_service.get_query(runtime_of(request), query_id)


@router.get("/queries/{query_id}/events")
def query_events(request: Request, query_id: str, last_event_id: int | None = Query(default=None, ge=0)) -> Any:
    runtime = runtime_of(request)
    with transaction(runtime.settings.sqlite_path) as conn:
        if conn.execute("SELECT 1 FROM queries WHERE id = ?", (query_id,)).fetchone() is None:
            raise AppError("QUERY_NOT_FOUND", "This question does not exist.", 404)
    return event_stream(
        request,
        runtime.bus,
        "query",
        query_id,
        last_seen(request, last_event_id),
        runtime.settings.sse_heartbeat_seconds,
    )


@router.post("/queries/{query_id}/feedback", status_code=201, response_model=FeedbackRecorded)
def give_feedback(request: Request, query_id: str, body: FeedbackRequest) -> Any:
    return query_service.record_feedback(runtime_of(request), query_id, body.rating, body.comment)
