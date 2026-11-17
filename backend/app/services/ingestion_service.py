"""Background ingestion job: extract -> chunk -> embed -> index (TRD §7.2).

Runs on the single-thread ingestion executor, outside the event loop. A document becomes
searchable (`completed` / `completed_with_warnings`) only after indexing succeeds; any
failure removes the vectors already written for the job.
"""

import logging
import time
from typing import Any

from app.core.errors import AppError
from app.db.sqlite import new_id, now_iso, transaction
from app.services.chunking_service import chunk_pages
from app.services.pdf_service import extract_pages
from app.services.vector_store import chunk_id_for

logger = logging.getLogger(__name__)

STAGES = ["validation", "text_extraction", "chunking", "embedding_generation", "vector_indexing"]
STAGE_ERROR = {
    "text_extraction": "PDF_PARSE_FAILED",
    "chunking": "CHUNKING_FAILED",
    "embedding_generation": "EMBEDDING_FAILED",
    "vector_indexing": "VECTOR_STORE_UNAVAILABLE",
}
STAGE_LABEL = {
    "text_extraction": "Extracting text",
    "chunking": "Preparing content",
    "embedding_generation": "Generating embeddings",
    "vector_indexing": "Indexing",
}


def _ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


def run_job(runtime: Any, job_id: str) -> None:  # runtime: app.runtime.Runtime
    settings = runtime.settings
    db = settings.sqlite_path
    bus = runtime.bus
    with transaction(db) as conn:
        job = conn.execute("SELECT * FROM processing_jobs WHERE id = ?", (job_id,)).fetchone()
        doc = conn.execute("SELECT * FROM documents WHERE id = ?", (job["document_id"],)).fetchone() if job else None
    if job is None or doc is None or job["status"] != "queued":
        return
    document_id = doc["id"]
    started = time.perf_counter()
    stage = "text_extraction"
    vectors_written = False

    def set_stage(name: str) -> None:
        with transaction(db) as conn:
            conn.execute(
                "UPDATE processing_jobs SET current_stage = ?, updated_at = ? WHERE id = ?",
                (name, now_iso(), job_id),
            )

    def emit(
        name: str,
        stage_status: str,
        details: dict[str, Any] | None = None,
        message: str | None = None,
    ) -> None:
        bus.publish(
            "document_job",
            job_id,
            status="running",
            stage=name,
            stage_status=stage_status,
            message=message or f"{STAGE_LABEL[name]}{'' if stage_status == 'started' else ': done'}",
            details=details,
        )

    try:
        embedder, store = runtime.require_ready()
        now = now_iso()
        with transaction(db) as conn:
            conn.execute(
                "UPDATE processing_jobs SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?",
                (now, now, job_id),
            )
            conn.execute(
                "UPDATE documents SET status = 'processing', updated_at = ? WHERE id = ?",
                (now, document_id),
            )

        # 1. Text extraction, page by page.
        set_stage(stage)
        emit(stage, "started")
        t = time.perf_counter()
        path = settings.upload_dir / doc["storage_name"]
        if not path.is_file():
            raise AppError("DOCUMENT_FILE_MISSING", "The stored file is missing.", 409)
        pages = extract_pages(path, settings.min_page_text_chars)
        warnings = [p for p in pages if p.text_status != "ok"]
        emit(
            stage,
            "completed",
            {
                "page_count": len(pages),
                "pages_ok": len(pages) - len(warnings),
                "warning_count": len(warnings),
                "duration_ms": _ms(t),
            },
        )
        if all(p.text_status == "no_text" for p in pages):
            raise AppError(
                "NO_EXTRACTABLE_TEXT",
                "No page contains extractable text. Scanned PDFs need OCR, which is not supported.",
                422,
            )

        # 2. Token-aware chunking within each page.
        stage = "chunking"
        set_stage(stage)
        emit(stage, "started")
        t = time.perf_counter()
        chunks, per_page = chunk_pages(pages, embedder, settings.chunk_size_tokens, settings.chunk_overlap_tokens)
        if not chunks:
            raise AppError("CHUNKING_FAILED", "No text chunks could be created.", 500)
        created = now_iso()
        with transaction(db) as conn:
            conn.execute("DELETE FROM document_pages WHERE document_id = ?", (document_id,))
            for p in pages:
                tokens, page_chunks = per_page.get(p.page_number, (0, 0))
                code = message = None
                if p.text_status == "low_text":
                    code = "LOW_TEXT_PAGE"
                    message = f"Page {p.page_number} contains very little extractable text."
                elif p.text_status == "no_text":
                    code = "NO_TEXT_PAGE"
                    message = f"Page {p.page_number} has no extractable text (it may be scanned)."
                conn.execute(
                    "INSERT INTO document_pages (id, document_id, page_number, char_count, word_count, "
                    "token_count, chunk_count, text_status, warning_code, warning_message, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        new_id(),
                        document_id,
                        p.page_number,
                        p.char_count,
                        p.word_count,
                        tokens,
                        page_chunks,
                        p.text_status,
                        code,
                        message,
                        created,
                    ),
                )
        emit(stage, "completed", {"chunk_count": len(chunks), "duration_ms": _ms(t)})

        # 3. Embeddings in batches, off the event loop.
        stage = "embedding_generation"
        set_stage(stage)
        total = len(chunks)
        emit(stage, "started", {"completed_items": 0, "total_items": total})
        t = time.perf_counter()
        vectors: list[list[float]] = []
        batch = settings.embedding_batch_size
        for i in range(0, total, batch):
            vectors.extend(embedder.encode([c.text for c in chunks[i : i + batch]], batch_size=batch))
            if i + batch < total:
                emit(stage, "started", {"completed_items": len(vectors), "total_items": total})
        emit(
            stage,
            "completed",
            {"completed_items": total, "total_items": total, "duration_ms": _ms(t)},
        )

        # 4. Vector indexing with source metadata.
        stage = "vector_indexing"
        set_stage(stage)
        emit(stage, "started")
        t = time.perf_counter()
        store.delete_document(document_id)  # never keep stale vectors from an earlier attempt
        ids = [chunk_id_for(document_id, c.page_number, c.chunk_index) for c in chunks]
        metadatas = [
            {
                "document_id": document_id,
                "chunk_id": cid,
                "filename": doc["filename"],
                "page_number": c.page_number,
                "chunk_index": c.chunk_index,
                "file_hash": doc["file_hash"],
                "embedding_model": embedder.model_id,
                "created_at": created,
            }
            for cid, c in zip(ids, chunks, strict=True)
        ]
        vectors_written = True
        store.add(ids, vectors, [c.text for c in chunks], metadatas)
        emit(stage, "completed", {"indexed_count": len(ids), "duration_ms": _ms(t)})

        # Only now is the document searchable.
        final = "completed_with_warnings" if warnings else "completed"
        message = (
            f"{len(warnings)} page{'s' if len(warnings) != 1 else ''} contained little or no extractable text."
            if warnings
            else None
        )
        done = now_iso()
        duration = _ms(started)
        with transaction(db) as conn:
            conn.execute(
                "UPDATE documents SET status = ?, status_message = ?, chunk_count = ?, "
                "pages_with_warnings = ?, embedding_model = ?, embedding_dimension = ?, "
                "chunk_size_tokens = ?, chunk_overlap_tokens = ?, indexed_at = ?, updated_at = ? "
                "WHERE id = ?",
                (
                    final,
                    message,
                    len(chunks),
                    len(warnings),
                    embedder.model_id,
                    embedder.dimension,
                    settings.chunk_size_tokens,
                    settings.chunk_overlap_tokens,
                    done,
                    done,
                    document_id,
                ),
            )
            conn.execute(
                "UPDATE processing_jobs SET status = ?, current_stage = NULL, completed_at = ?, "
                "duration_ms = ?, updated_at = ? WHERE id = ?",
                (final, done, duration, done, job_id),
            )
        bus.publish(
            "document_job",
            job_id,
            event_type="terminal",
            status=final,
            message="Document indexed" if final == "completed" else "Document indexed with warnings",
            details={"chunk_count": len(chunks), "duration_ms": duration},
        )
        logger.info("Job completed job=%s chunks=%s duration_ms=%s", job_id, len(chunks), duration)
    except Exception as exc:
        _fail(runtime, job_id, document_id, stage, exc, vectors_written, started)


def _fail(
    runtime: Any,
    job_id: str,
    document_id: str,
    stage: str,
    exc: Exception,
    vectors_written: bool,
    started: float,
) -> None:
    if isinstance(exc, AppError):
        code, message = exc.code, exc.message
    else:
        code = STAGE_ERROR.get(stage, "INTERNAL_ERROR")
        message = "Processing failed. Reprocess the document to try again."
        logger.error("Job failed job=%s stage=%s type=%s", job_id, stage, type(exc).__name__)
    if vectors_written and runtime.store is not None:
        try:
            runtime.store.delete_document(document_id)
        except Exception:
            logger.warning("Could not remove partial vectors job=%s", job_id)
    doc_status = "needs_ocr" if code == "NO_EXTRACTABLE_TEXT" else "failed"
    done = now_iso()
    with transaction(runtime.settings.sqlite_path) as conn:
        conn.execute(
            "UPDATE documents SET status = ?, status_message = ?, updated_at = ? WHERE id = ?",
            (doc_status, message, done, document_id),
        )
        conn.execute(
            "UPDATE processing_jobs SET status = 'failed', current_stage = NULL, error_code = ?, "
            "error_message = ?, completed_at = ?, duration_ms = ?, updated_at = ? WHERE id = ?",
            (code, message, done, _ms(started), done, job_id),
        )
    if stage != "validation":
        runtime.bus.publish(
            "document_job",
            job_id,
            status="running",
            stage=stage,
            stage_status="failed",
            message=message,
            error_code=code,
        )
    runtime.bus.publish(
        "document_job",
        job_id,
        event_type="terminal",
        status="failed",
        message=message,
        error_code=code,
    )
