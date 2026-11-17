from typing import Annotated, Any

from fastapi import APIRouter, File, Query, Request, UploadFile

from app.api.deps import runtime_of
from app.api.sse import event_stream, last_seen
from app.core.errors import AppError
from app.db.sqlite import transaction
from app.schemas.api import DeleteResult, ReprocessAccepted, UploadAccepted
from app.services import document_service

router = APIRouter(tags=["documents"])

DocumentStatusParam = Query(
    default=None,
    pattern="^(queued|processing|completed|completed_with_warnings|failed|needs_ocr|delete_failed)$",
)


@router.post("/documents/upload", status_code=202, response_model=UploadAccepted)
def upload_document(request: Request, file: Annotated[UploadFile, File()]) -> Any:
    runtime = runtime_of(request)
    limit = runtime.settings.max_upload_size_mb * 1024 * 1024
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > limit + 1024 * 1024:  # multipart overhead allowance
        raise AppError(
            "FILE_TOO_LARGE",
            f"The file is larger than {runtime.settings.max_upload_size_mb} MB.",
            413,
        )
    return document_service.upload(runtime, file.file, file.filename)


@router.get("/documents")
def list_documents(
    request: Request,
    status: str | None = DocumentStatusParam,
    search: str | None = Query(default=None, max_length=255),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Any:
    return document_service.list_documents(runtime_of(request), status, search, page, page_size)


@router.get("/documents/{document_id}")
def get_document(request: Request, document_id: str) -> Any:
    return document_service.get_document(runtime_of(request), document_id)


@router.post("/documents/{document_id}/reprocess", status_code=202, response_model=ReprocessAccepted)
def reprocess_document(request: Request, document_id: str) -> Any:
    return document_service.reprocess(runtime_of(request), document_id)


@router.delete("/documents/{document_id}", response_model=DeleteResult)
def delete_document(request: Request, document_id: str) -> Any:
    return document_service.delete(runtime_of(request), document_id)


@router.get("/jobs/{job_id}")
def get_job(request: Request, job_id: str) -> Any:
    return document_service.get_job(runtime_of(request), job_id)


@router.get("/jobs/{job_id}/events")
def job_events(request: Request, job_id: str, last_event_id: int | None = Query(default=None, ge=0)) -> Any:
    runtime = runtime_of(request)
    with transaction(runtime.settings.sqlite_path) as conn:
        if conn.execute("SELECT 1 FROM processing_jobs WHERE id = ?", (job_id,)).fetchone() is None:
            raise AppError("JOB_NOT_FOUND", "This processing job does not exist.", 404)
    return event_stream(
        request,
        runtime.bus,
        "document_job",
        job_id,
        last_seen(request, last_event_id),
        runtime.settings.sse_heartbeat_seconds,
    )
