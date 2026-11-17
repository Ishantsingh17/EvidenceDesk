"""Document upload, listing, detail, reprocess and deletion (schema §5.3, TRD §7.1, §7.3)."""

import hashlib
import logging
import re
import sqlite3
from pathlib import Path
from typing import Any, BinaryIO

from app.core.errors import AppError
from app.db.sqlite import new_id, now_iso, transaction
from app.runtime import Runtime
from app.services import ingestion_service
from app.services.activity import evaluation_active, refuse_if_evaluating
from app.services.pdf_service import validate_pdf

logger = logging.getLogger(__name__)

COPY_CHUNK = 1024 * 1024
PDF_SIGNATURE = b"%PDF-"
BUSY_STATUSES = {"queued", "processing"}
REPROCESSABLE = {"completed", "completed_with_warnings", "failed", "needs_ocr"}
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def safe_filename(name: str | None) -> str:
    """Display name only: basename, no control characters, at most 255 characters."""
    base = re.split(r"[\\/]", name or "")[-1]
    base = _CONTROL.sub("", base).strip() or "document.pdf"
    return base[:255]


def _events_url(job_id: str) -> str:
    return f"/api/v1/jobs/{job_id}/events"


# --------------------------------------------------------------------- upload


def upload(runtime: Runtime, stream: BinaryIO, original_name: str | None) -> dict[str, Any]:
    settings = runtime.settings
    runtime.require_ready()
    filename = safe_filename(original_name)
    with transaction(settings.sqlite_path) as conn:
        refuse_if_evaluating(conn)  # checked before the file is stored (DD-02)
    if not filename.lower().endswith(".pdf"):
        raise AppError("INVALID_FILE_TYPE", "Only PDF files are supported.", 400)

    upload_dir = settings.upload_dir
    upload_dir.mkdir(parents=True, exist_ok=True)
    temp_path = upload_dir / f".upload-{new_id()}.part"  # generated name: no user input in paths
    limit = settings.max_upload_size_mb * 1024 * 1024
    digest = hashlib.sha256()
    size = 0
    try:
        with temp_path.open("wb") as out:
            first = True
            while chunk := stream.read(COPY_CHUNK):
                if first:
                    if not chunk.startswith(PDF_SIGNATURE):
                        raise AppError("INVALID_FILE_TYPE", "The file is not a valid PDF.", 400)
                    first = False
                size += len(chunk)
                if size > limit:
                    raise AppError(
                        "FILE_TOO_LARGE",
                        f"The file is larger than {settings.max_upload_size_mb} MB.",
                        413,
                    )
                digest.update(chunk)
                out.write(chunk)
        if size == 0:
            raise AppError("INVALID_FILE_TYPE", "The file is empty.", 400)
        file_hash = digest.hexdigest()

        with transaction(settings.sqlite_path) as conn:
            existing = conn.execute("SELECT id, filename FROM documents WHERE file_hash = ?", (file_hash,)).fetchone()
        if existing:
            raise AppError(
                "DUPLICATE_DOCUMENT",
                "This file has already been uploaded.",
                409,
                {"existing_document_id": existing["id"], "existing_filename": existing["filename"]},
            )
        page_count = validate_pdf(temp_path)

        document_id, job_id = new_id(), new_id()
        storage_name = f"{new_id()}.pdf"
        final_path = upload_dir / storage_name
        temp_path.replace(final_path)
        now = now_iso()
        with runtime.activity_lock:
            try:
                with transaction(settings.sqlite_path) as conn:
                    refuse_if_evaluating(conn)
                    conn.execute(
                        "INSERT INTO documents (id, filename, storage_name, file_path, mime_type, "
                        "file_size_bytes, file_hash, page_count, status, latest_job_id, created_at, "
                        "updated_at) VALUES (?, ?, ?, ?, 'application/pdf', ?, ?, ?, 'queued', ?, ?, ?)",
                        (
                            document_id,
                            filename,
                            storage_name,
                            storage_name,
                            size,
                            file_hash,
                            page_count,
                            job_id,
                            now,
                            now,
                        ),
                    )
                    conn.execute(
                        "INSERT INTO processing_jobs (id, document_id, attempt_number, trigger, "
                        "status, created_at, updated_at) VALUES (?, ?, 1, 'upload', 'queued', ?, ?)",
                        (job_id, document_id, now, now),
                    )
            except sqlite3.IntegrityError as exc:
                final_path.unlink(missing_ok=True)
                raise AppError("DUPLICATE_DOCUMENT", "This file has already been uploaded.", 409) from exc
            except AppError:
                final_path.unlink(missing_ok=True)
                raise
    finally:
        temp_path.unlink(missing_ok=True)

    runtime.bus.publish(
        "document_job",
        job_id,
        status="queued",
        stage="validation",
        stage_status="completed",
        message="File validated",
        details={"page_count": page_count, "file_size_bytes": size},
    )
    runtime.ingestion_executor.submit(ingestion_service.run_job, runtime, job_id)
    logger.info("Upload accepted document=%s job=%s", document_id, job_id)
    return {
        "document_id": document_id,
        "filename": filename,
        "status": "queued",
        "job_id": job_id,
        "events_url": _events_url(job_id),
    }


# --------------------------------------------------------------------- read


def list_documents(
    runtime: Runtime, status: str | None, search: str | None, page: int, page_size: int
) -> dict[str, Any]:
    clauses, params = [], []
    if status:
        clauses.append("d.status = ?")
        params.append(status)
    if search:
        clauses.append("LOWER(d.filename) LIKE ? ESCAPE '\\'")
        escaped = search.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        params.append(f"%{escaped}%")
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with transaction(runtime.settings.sqlite_path) as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM documents d {where}", params).fetchone()[0]
        rows = conn.execute(
            f"SELECT d.*, j.current_stage AS job_stage FROM documents d "
            f"LEFT JOIN processing_jobs j ON j.id = d.latest_job_id {where} "
            "ORDER BY d.created_at DESC LIMIT ? OFFSET ?",
            [*params, page_size, (page - 1) * page_size],
        ).fetchall()
    items = [
        {
            "id": r["id"],
            "filename": r["filename"],
            "file_size_bytes": r["file_size_bytes"],
            "page_count": r["page_count"],
            "chunk_count": r["chunk_count"],
            "pages_with_warnings": r["pages_with_warnings"],
            "status": r["status"],
            "status_message": r["status_message"],
            "current_stage": r["job_stage"] if r["status"] == "processing" else None,
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
        }
        for r in rows
    ]
    return {"items": items, "page": page, "page_size": page_size, "total": total}


def _job_summary(job: sqlite3.Row | None) -> dict[str, Any] | None:
    if job is None:
        return None
    return {
        "job_id": job["id"],
        "attempt_number": job["attempt_number"],
        "trigger": job["trigger"],
        "status": job["status"],
        "current_stage": job["current_stage"],
        "started_at": job["started_at"],
        "completed_at": job["completed_at"],
        "duration_ms": job["duration_ms"],
        "error_code": job["error_code"],
        "error_message": job["error_message"],
        "events_url": _events_url(job["id"]),
    }


def _actions(status: str, evaluating: bool) -> dict[str, Any]:
    if evaluating:
        return {
            "can_reprocess": False,
            "can_delete": False,
            "disabled_reason": "Evaluation run in progress",
        }
    if status in BUSY_STATUSES:
        return {
            "can_reprocess": False,
            "can_delete": False,
            "disabled_reason": "Document is processing",
        }
    if status == "delete_failed":
        return {
            "can_reprocess": False,
            "can_delete": True,
            "disabled_reason": "Finish the deletion first",
        }
    return {"can_reprocess": status in REPROCESSABLE, "can_delete": True, "disabled_reason": None}


def get_document(runtime: Runtime, document_id: str) -> dict[str, Any]:
    with transaction(runtime.settings.sqlite_path) as conn:
        doc = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
        if doc is None:
            raise AppError("DOCUMENT_NOT_FOUND", "This document does not exist.", 404)
        pages = conn.execute(
            "SELECT * FROM document_pages WHERE document_id = ? ORDER BY page_number",
            (document_id,),
        ).fetchall()
        job = conn.execute("SELECT * FROM processing_jobs WHERE id = ?", (doc["latest_job_id"],)).fetchone()
        evaluating = evaluation_active(conn)
    page_items = [
        {
            "page_number": p["page_number"],
            "char_count": p["char_count"],
            "word_count": p["word_count"],
            "token_count": p["token_count"],
            "chunk_count": p["chunk_count"],
            "text_status": p["text_status"],
            "warning_code": p["warning_code"],
            "warning_message": p["warning_message"],
        }
        for p in pages
    ]
    warnings = [
        {
            "page_number": p["page_number"],
            "code": p["warning_code"],
            "message": p["warning_message"],
        }
        for p in pages
        if p["warning_code"]
    ]
    return {
        "id": doc["id"],
        "filename": doc["filename"],
        "mime_type": doc["mime_type"],
        "file_size_bytes": doc["file_size_bytes"],
        "file_hash": doc["file_hash"],
        "page_count": doc["page_count"],
        "chunk_count": doc["chunk_count"],
        "status": doc["status"],
        "status_message": doc["status_message"],
        "embedding_model": doc["embedding_model"],
        "embedding_dimension": doc["embedding_dimension"],
        "chunk_size_tokens": doc["chunk_size_tokens"],
        "chunk_overlap_tokens": doc["chunk_overlap_tokens"],
        "created_at": doc["created_at"],
        "updated_at": doc["updated_at"],
        "indexed_at": doc["indexed_at"],
        "diagnostics": {
            "pages_total": len(pages),
            "pages_ok": sum(1 for p in pages if p["text_status"] == "ok"),
            "pages_low_text": sum(1 for p in pages if p["text_status"] == "low_text"),
            "pages_no_text": sum(1 for p in pages if p["text_status"] == "no_text"),
            "total_characters": sum(p["char_count"] for p in pages),
            "warnings": warnings,
        },
        "pages": page_items,
        "latest_job": _job_summary(job),
        "actions": _actions(doc["status"], evaluating),
    }


def get_job(runtime: Runtime, job_id: str) -> dict[str, Any]:
    from app.services.ingestion_service import STAGES  # local import avoids a cycle

    with transaction(runtime.settings.sqlite_path) as conn:
        job = conn.execute("SELECT * FROM processing_jobs WHERE id = ?", (job_id,)).fetchone()
    if job is None:
        raise AppError("JOB_NOT_FOUND", "This processing job does not exist.", 404)
    events = runtime.bus.events_after(("document_job", job_id), 0)
    stages = []
    for stage in STAGES:
        state, started, completed, details = "pending", None, None, None
        for ev in events:
            if ev["stage"] != stage:
                continue
            details = ev["details"] or details
            if ev["stage_status"] == "started":
                state, started = "active", started or ev["timestamp"]
            elif ev["stage_status"] in ("completed", "failed", "skipped"):
                state, completed = ev["stage_status"], ev["timestamp"]
                started = started or ev["timestamp"]
        duration = None
        if started and completed:
            duration = (details or {}).get("duration_ms")
        stages.append(
            {
                "stage": stage,
                "state": state,
                "started_at": started,
                "completed_at": completed,
                "duration_ms": duration,
                "details": details,
            }
        )
    summary = _job_summary(job)
    assert summary is not None
    return {
        **summary,
        "document_id": job["document_id"],
        "stages": stages,
        "last_sequence_number": events[-1]["sequence_number"] if events else 0,
    }


# --------------------------------------------------------------------- reprocess and delete


def reprocess(runtime: Runtime, document_id: str) -> dict[str, Any]:
    settings = runtime.settings
    _, store = runtime.require_ready()
    with runtime.activity_lock:
        with transaction(settings.sqlite_path) as conn:
            doc = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
            if doc is None:
                raise AppError("DOCUMENT_NOT_FOUND", "This document does not exist.", 404)
            refuse_if_evaluating(conn)
            if doc["status"] in BUSY_STATUSES or doc["status"] == "delete_failed":
                raise AppError("DOCUMENT_BUSY", "This document cannot be reprocessed right now.", 409)
        path = settings.upload_dir / doc["storage_name"]
        if not path.is_file():
            raise AppError("DOCUMENT_FILE_MISSING", "The stored file is missing.", 409)
        page_count = validate_pdf(path)
        store.delete_document(document_id)  # not searchable until the new job succeeds
        job_id = new_id()
        now = now_iso()
        with transaction(settings.sqlite_path) as conn:
            attempt = conn.execute(
                "SELECT COALESCE(MAX(attempt_number), 0) + 1 FROM processing_jobs WHERE document_id = ?",
                (document_id,),
            ).fetchone()[0]
            conn.execute("DELETE FROM document_pages WHERE document_id = ?", (document_id,))
            conn.execute(
                "UPDATE documents SET status = 'queued', status_message = NULL, chunk_count = NULL, "
                "pages_with_warnings = NULL, indexed_at = NULL, latest_job_id = ?, updated_at = ? "
                "WHERE id = ?",
                (job_id, now, document_id),
            )
            conn.execute(
                "INSERT INTO processing_jobs (id, document_id, attempt_number, trigger, status, "
                "created_at, updated_at) VALUES (?, ?, ?, 'reprocess', 'queued', ?, ?)",
                (job_id, document_id, attempt, now, now),
            )
    runtime.bus.publish(
        "document_job",
        job_id,
        status="queued",
        stage="validation",
        stage_status="completed",
        message="File validated",
        details={"page_count": page_count},
    )
    runtime.ingestion_executor.submit(ingestion_service.run_job, runtime, job_id)
    return {
        "document_id": document_id,
        "job_id": job_id,
        "attempt_number": attempt,
        "status": "queued",
        "events_url": _events_url(job_id),
    }


def delete(runtime: Runtime, document_id: str) -> dict[str, Any]:
    settings = runtime.settings
    _, store = runtime.require_ready()
    with runtime.activity_lock:
        with transaction(settings.sqlite_path) as conn:
            doc = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
            if doc is None:
                raise AppError("DOCUMENT_NOT_FOUND", "This document does not exist.", 404)
            refuse_if_evaluating(conn)
            if doc["status"] in BUSY_STATUSES:
                raise AppError("DOCUMENT_BUSY", "This document is still processing.", 409)
        # 1. vectors; on failure nothing else changes.
        try:
            store.delete_document(document_id)
        except Exception as exc:
            raise AppError("VECTOR_DELETE_FAILED", "The search index entries could not be removed.", 503) from exc
        # 2. file; on failure report a partial deletion honestly.
        path: Path = settings.upload_dir / doc["storage_name"]
        try:
            path.unlink(missing_ok=True)
        except OSError:
            with transaction(settings.sqlite_path) as conn:
                conn.execute(
                    "UPDATE documents SET status = 'delete_failed', status_message = ?, updated_at = ? WHERE id = ?",
                    ("The file could not be removed. Try deleting again.", now_iso(), document_id),
                )
            return {
                "document_id": document_id,
                "result": "partially_deleted",
                "vectors_removed": True,
                "file_removed": False,
                "metadata_removed": False,
                "warnings": ["The file could not be removed. Try deleting again."],
            }
        # 3. metadata, pages, jobs and job events. Query/evaluation snapshots stay.
        with transaction(settings.sqlite_path) as conn:
            job_ids = [
                r["id"] for r in conn.execute("SELECT id FROM processing_jobs WHERE document_id = ?", (document_id,))
            ]
            conn.executemany(
                "DELETE FROM workflow_events WHERE resource_type = 'document_job' AND resource_id = ?",
                [(j,) for j in job_ids],
            )
            conn.execute("DELETE FROM documents WHERE id = ?", (document_id,))
    logger.info("Document deleted document=%s", document_id)
    return {
        "document_id": document_id,
        "result": "deleted",
        "vectors_removed": True,
        "file_removed": True,
        "metadata_removed": True,
        "warnings": [],
    }
