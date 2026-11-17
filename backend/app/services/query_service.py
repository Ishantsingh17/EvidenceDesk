"""User query lifecycle (schema §5.5, TRD §8). Evaluation never uses these tables (D-09)."""

import logging
from typing import Any

from app.core.errors import AppError
from app.db.sqlite import dumps, loads, new_id, now_iso, transaction
from app.runtime import Runtime
from app.services.rag_pipeline import PipelineResult, run_pipeline
from app.services.retrieval_service import searchable_document_ids

logger = logging.getLogger(__name__)

STAGE_LABEL = {
    "query_received": "Question received",
    "query_embedding": "Embedding the question",
    "retrieval": "Searching documents",
    "context_preparation": "Preparing supporting context",
    "generation": "Generating answer",
    "citation_validation": "Checking references",
}


def submit(runtime: Runtime, question: str, document_ids: list[str] | None, top_k: int | None) -> dict[str, Any]:
    settings = runtime.settings
    question = question.strip()
    if not 3 <= len(question) <= settings.query_max_chars:
        raise AppError(
            "VALIDATION_ERROR",
            f"Questions must be 3 to {settings.query_max_chars} characters.",
            422,
            {"fields": ["question"]},
        )
    k = top_k or settings.retrieval_top_k
    if not 1 <= k <= settings.retrieval_top_k_max:
        raise AppError(
            "VALIDATION_ERROR",
            f"top_k must be 1 to {settings.retrieval_top_k_max}.",
            422,
            {"fields": ["top_k"]},
        )
    embedder, _ = runtime.require_ready()
    with transaction(settings.sqlite_path) as conn:
        searchable = searchable_document_ids(conn)
        if document_ids is not None:
            unknown = set(document_ids) - set(searchable)
            if unknown or not document_ids:
                raise AppError(
                    "VALIDATION_ERROR",
                    "Every document_id must reference a searchable document.",
                    422,
                    {"fields": ["document_ids"]},
                )
        if not searchable:
            raise AppError("NO_INDEXED_DOCUMENTS", "There are no indexed documents to search yet.", 409)
        query_id = new_id()
        conn.execute(
            "INSERT INTO queries (id, question, status, document_ids_json, embedding_model, "
            "retrieval_top_k, retrieval_max_distance, created_at) VALUES (?, ?, 'queued', ?, ?, ?, ?, ?)",
            (
                query_id,
                question,
                dumps(document_ids),
                embedder.model_id,
                k,
                settings.retrieval_max_distance,
                now_iso(),
            ),
        )
    runtime.bus.publish(
        "query",
        query_id,
        status="queued",
        stage="query_received",
        stage_status="completed",
        message="Question received",
    )
    runtime.query_executor.submit(_run, runtime, query_id, question, document_ids, k)
    return {
        "query_id": query_id,
        "status": "queued",
        "events_url": f"/api/v1/queries/{query_id}/events",
        "result_url": f"/api/v1/queries/{query_id}",
    }


def _run(runtime: Runtime, query_id: str, question: str, document_ids: list[str] | None, top_k: int) -> None:
    db = runtime.settings.sqlite_path
    with transaction(db) as conn:
        conn.execute("UPDATE queries SET status = 'running' WHERE id = ?", (query_id,))

    def emit(stage: str, stage_status: str, details: dict[str, Any] | None, message: str | None) -> None:
        label = STAGE_LABEL.get(stage, stage)
        runtime.bus.publish(
            "query",
            query_id,
            status="running",
            stage=stage,
            stage_status=stage_status,
            message=message or (label if stage_status == "started" else f"{label}: {stage_status}"),
            details=details,
            error_code=(details or {}).get("error_code") if stage_status == "failed" else None,
        )

    def generate(messages: list[dict[str, str]]) -> tuple[Any, int]:
        return runtime.llm().generate(messages), 1  # user queries are never retried (DD-26)

    result = run_pipeline(runtime, question, top_k, document_ids, emit, generate)
    _persist(db, query_id, result)
    runtime.bus.publish(
        "query",
        query_id,
        event_type="terminal",
        status=result.status,
        message={"completed": "Answer ready", "insufficient_evidence": "Insufficient evidence"}.get(
            result.status, result.error_message or "Failed"
        ),
        details={"total_duration_ms": result.total_ms},
        error_code=result.error_code,
    )
    logger.info("Query finished query=%s status=%s ms=%s", query_id, result.status, result.total_ms)


def _persist(db: Any, query_id: str, r: PipelineResult) -> None:
    with transaction(db) as conn:
        conn.execute(
            "UPDATE queries SET status = ?, answer = ?, insufficient_evidence = ?, abstention_reason = ?, "
            "flag_for_review = ?, review_reasons_json = ?, model_name = ?, retrieved_count = ?, "
            "evidence_count = ?, citation_count = ?, query_embedding_duration_ms = ?, "
            "retrieval_duration_ms = ?, generation_duration_ms = ?, total_duration_ms = ?, "
            "prompt_tokens = ?, completion_tokens = ?, error_code = ?, error_message = ?, completed_at = ? "
            "WHERE id = ?",
            (
                r.status,
                r.answer,
                int(r.status == "insufficient_evidence"),
                r.abstention_reason,
                int(r.flag_for_review),
                dumps(r.review_reasons),
                r.model_name,
                r.retrieved_count,
                r.evidence_count,
                r.citation_count,
                r.query_embedding_ms,
                r.retrieval_ms,
                r.generation_ms,
                r.total_ms,
                r.prompt_tokens,
                r.completion_tokens,
                r.error_code,
                r.error_message,
                now_iso(),
                query_id,
            ),
        )
        save_retrievals(conn, "query_retrievals", "query_id", query_id, r)


def save_retrievals(conn: Any, table: str, owner_column: str, owner_id: str, r: PipelineResult) -> None:
    """Snapshots of every candidate (cited or not) in rank order (schema §3.6, §3.13)."""
    conn.executemany(
        f"INSERT INTO {table} (id, {owner_column}, rank, chunk_id, document_id, file_hash, filename, "
        "page_number, chunk_index, distance, passed_threshold, source_label, is_cited, excerpt) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            (
                new_id(),
                owner_id,
                x.rank,
                x.candidate.chunk_id,
                x.candidate.document_id,
                x.candidate.file_hash,
                x.candidate.filename,
                x.candidate.page_number,
                x.candidate.chunk_index,
                x.candidate.distance,
                int(x.passed_threshold),
                x.source_label,
                int(x.is_cited),
                x.candidate.text,
            )
            for x in r.ranked
        ],
    )


def retrieval_rows(conn: Any, table: str, owner_column: str, owner_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        f"SELECT r.*, (SELECT 1 FROM documents d WHERE d.id = r.document_id) AS available "
        f"FROM {table} r WHERE r.{owner_column} = ? ORDER BY r.rank",
        (owner_id,),
    ).fetchall()
    return [
        {
            "rank": r["rank"],
            "source_label": r["source_label"],
            "is_cited": bool(r["is_cited"]),
            "passed_threshold": bool(r["passed_threshold"]),
            "document_id": r["document_id"],
            "document_available": bool(r["available"]),
            "file_hash": r["file_hash"],
            "filename": r["filename"],
            "page_number": r["page_number"],
            "chunk_index": r["chunk_index"],
            "distance": r["distance"],
            "excerpt": r["excerpt"],
        }
        for r in rows
    ]


def citations_from(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Final citations: only cited, validated labels, built from retrieval metadata (rule 6)."""
    return [
        {
            "citation_id": c["source_label"],
            "document_id": c["document_id"],
            "document_available": c["document_available"],
            "filename": c["filename"],
            "page_number": c["page_number"],
            "chunk_index": c["chunk_index"],
            "excerpt": c["excerpt"],
            "retrieval_rank": c["rank"],
            "distance": c["distance"],
        }
        for c in chunks
        if c["is_cited"]
    ]


def get_query(runtime: Runtime, query_id: str) -> dict[str, Any]:
    settings = runtime.settings
    with transaction(settings.sqlite_path) as conn:
        q = conn.execute("SELECT * FROM queries WHERE id = ?", (query_id,)).fetchone()
        if q is None:
            raise AppError("QUERY_NOT_FOUND", "This question does not exist.", 404)
        chunks = retrieval_rows(conn, "query_retrievals", "query_id", query_id)
    for c in chunks:
        c.pop("file_hash")
    return {
        "id": q["id"],
        "status": q["status"],
        "question": q["question"],
        "answer": q["answer"],
        "insufficient_evidence": bool(q["insufficient_evidence"]),
        "abstention_reason": q["abstention_reason"],
        "flag_for_review": bool(q["flag_for_review"]),
        "review_reasons": loads(q["review_reasons_json"], []),
        "citations": citations_from(chunks),
        "retrieval_details": {
            "top_k": q["retrieval_top_k"],
            "threshold_applied": q["retrieval_max_distance"] is not None,
            "max_distance": q["retrieval_max_distance"],
            "evidence_threshold_calibrated": q["retrieval_max_distance"] is not None,
            "chunks": chunks,
        },
        "metrics": {
            "query_embedding_duration_ms": q["query_embedding_duration_ms"],
            "retrieval_duration_ms": q["retrieval_duration_ms"],
            "generation_duration_ms": q["generation_duration_ms"],
            "total_duration_ms": q["total_duration_ms"],
            "retrieved_count": q["retrieved_count"] or 0,
            "evidence_count": q["evidence_count"] or 0,
            "model_name": q["model_name"],
        },
        "error_code": q["error_code"],
        "error_message": q["error_message"],
        "created_at": q["created_at"],
        "completed_at": q["completed_at"],
    }


def list_queries(runtime: Runtime, status: str | None, page: int, page_size: int) -> dict[str, Any]:
    where, params = ("WHERE status = ?", [status]) if status else ("", [])
    with transaction(runtime.settings.sqlite_path) as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM queries {where}", params).fetchone()[0]
        rows = conn.execute(
            f"SELECT * FROM queries {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            [*params, page_size, (page - 1) * page_size],
        ).fetchall()
    items = [
        {
            "id": r["id"],
            "question": r["question"],
            "status": r["status"],
            "insufficient_evidence": bool(r["insufficient_evidence"]),
            "flag_for_review": bool(r["flag_for_review"]),
            "citation_count": r["citation_count"] or 0,
            "total_duration_ms": r["total_duration_ms"],
            "created_at": r["created_at"],
            "completed_at": r["completed_at"],
        }
        for r in rows
    ]
    return {"items": items, "page": page, "page_size": page_size, "total": total}


def record_feedback(runtime: Runtime, query_id: str, rating: str, comment: str | None) -> dict[str, Any]:
    with transaction(runtime.settings.sqlite_path) as conn:
        if conn.execute("SELECT 1 FROM queries WHERE id = ?", (query_id,)).fetchone() is None:
            raise AppError("QUERY_NOT_FOUND", "This question does not exist.", 404)
        feedback_id = new_id()
        conn.execute(
            "INSERT INTO answer_feedback (id, query_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)",
            (feedback_id, query_id, rating, comment, now_iso()),
        )
    return {"feedback_id": feedback_id, "status": "recorded"}
