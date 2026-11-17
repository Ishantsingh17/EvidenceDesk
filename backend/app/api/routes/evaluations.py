from typing import Any

from fastapi import APIRouter, Query, Request

from app.api.deps import runtime_of
from app.api.sse import event_stream, last_seen
from app.core.errors import AppError
from app.db.sqlite import transaction
from app.schemas.api import ReviewOut, ReviewRequest, RunAccepted, RunRequest
from app.services.evaluation import evaluation_service

router = APIRouter(prefix="/evaluations", tags=["evaluation"])


@router.get("/datasets")
def list_datasets(request: Request) -> Any:
    return evaluation_service.list_datasets(runtime_of(request))


@router.post("/run", status_code=202, response_model=RunAccepted)
def start_run(request: Request, body: RunRequest) -> Any:
    return evaluation_service.start_run(runtime_of(request), body.dataset_id, body.top_k)


@router.get("/runs")
def list_runs(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Any:
    return evaluation_service.list_runs(runtime_of(request), page, page_size)


@router.get("/runs/{run_id}")
def get_run(request: Request, run_id: str) -> Any:
    return evaluation_service.get_run(runtime_of(request), run_id)


@router.get("/runs/{run_id}/results/{result_id}")
def get_result(request: Request, run_id: str, result_id: str) -> Any:
    return evaluation_service.get_result(runtime_of(request), run_id, result_id)


@router.put("/results/{result_id}/review", response_model=ReviewOut)
def save_review(request: Request, result_id: str, body: ReviewRequest) -> Any:
    return evaluation_service.save_review(runtime_of(request), result_id, body.model_dump())


@router.get("/runs/{run_id}/events")
def run_events(request: Request, run_id: str, last_event_id: int | None = Query(default=None, ge=0)) -> Any:
    runtime = runtime_of(request)
    with transaction(runtime.settings.sqlite_path) as conn:
        if conn.execute("SELECT 1 FROM evaluation_runs WHERE id = ?", (run_id,)).fetchone() is None:
            raise AppError("EVALUATION_RUN_NOT_FOUND", "This evaluation run does not exist.", 404)
    return event_stream(
        request,
        runtime.bus,
        "evaluation_run",
        run_id,
        last_seen(request, last_event_id),
        runtime.settings.sse_heartbeat_seconds,
    )
