"""Health, safe settings and dashboard summary (schema §5.1, §5.2, §5.8)."""

from datetime import UTC, datetime
from statistics import median
from typing import Any

from app.db.sqlite import check_database, transaction
from app.schemas.health import HealthActivity, HealthResponse
from app.services.activity import evaluation_active, ingestion_active

SERVICE_NAME = "enterprise-document-retrieval-api"


def _status(runtime: Any, database_ok: bool) -> str:
    if not database_ok or runtime.load_error or runtime.vector_store_status in ("model_mismatch",):
        return "degraded"
    if not runtime.loaded:
        return "starting"
    if runtime.vector_store_status != "available":
        return "degraded"
    return "healthy"


def get_health(runtime: Any) -> HealthResponse:
    settings = runtime.settings
    database_ok = check_database(settings.sqlite_path)
    ingesting = evaluating = False
    if database_ok:
        with transaction(settings.sqlite_path) as conn:
            ingesting, evaluating = ingestion_active(conn), evaluation_active(conn)
    return HealthResponse(
        status=_status(runtime, database_ok),  # type: ignore[arg-type]
        service=SERVICE_NAME,
        activity=HealthActivity(ingestion_active=ingesting, evaluation_active=evaluating),
        timestamp=datetime.now(UTC),
    )


def get_settings_status(runtime: Any) -> dict[str, Any]:
    """Safe, non-secret configuration only. Never keys, paths or connection strings."""
    s = runtime.settings
    embedder = runtime.embedder
    return {
        "environment": s.app_env,
        "backend_status": _status(runtime, check_database(s.sqlite_path)),
        "vector_store_status": runtime.vector_store_status,
        "embedding_model": s.embedding_model,
        "embedding_dimension": embedder.dimension if embedder else None,
        "embedding_model_loaded": embedder is not None,
        "llm_provider": "Groq",
        "llm_model": s.groq_model,
        "upload_limit_mb": s.max_upload_size_mb,
        "retrieval_top_k_default": s.retrieval_top_k,
        "retrieval_top_k_max": s.retrieval_top_k_max,
        "retrieval_max_distance": s.retrieval_max_distance,
        "evidence_threshold_calibrated": s.retrieval_max_distance is not None,
    }


def get_dashboard_summary(runtime: Any) -> dict[str, Any]:
    """Query statistics come from user queries only; evaluation never writes `queries`."""
    with transaction(runtime.settings.sqlite_path) as conn:
        counts = {
            r["status"]: r["n"] for r in conn.execute("SELECT status, COUNT(*) AS n FROM documents GROUP BY status")
        }
        queries_total = conn.execute("SELECT COUNT(*) FROM queries").fetchone()[0]
        insufficient = conn.execute("SELECT COUNT(*) FROM queries WHERE status = 'insufficient_evidence'").fetchone()[0]
        latencies = [
            r[0]
            for r in conn.execute(
                "SELECT total_duration_ms FROM queries WHERE status IN ('completed', 'insufficient_evidence') "
                "AND total_duration_ms IS NOT NULL"
            )
        ]
        run = conn.execute(
            "SELECT id, status, case_count, created_at FROM evaluation_runs ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
    return {
        "documents_total": sum(counts.values()),
        "documents_indexed": counts.get("completed", 0) + counts.get("completed_with_warnings", 0),
        "documents_with_warnings": counts.get("completed_with_warnings", 0),
        "documents_failed": counts.get("failed", 0),
        "documents_needs_ocr": counts.get("needs_ocr", 0),
        "queries_total": queries_total,
        "queries_insufficient_evidence": insufficient,
        "median_query_latency_ms": int(median(latencies)) if latencies else None,
        "query_latency_sample_count": len(latencies),
        "latest_evaluation": (
            {
                "run_id": run["id"],
                "status": run["status"],
                "case_count": run["case_count"],
                "created_at": run["created_at"],
            }
            if run
            else None
        ),
    }
