"""Startup recovery (TRD §6.3, DD-03): interrupted work ends in a truthful terminal state.

Runs before requests are accepted. Nothing is restarted automatically.
"""

import logging

from app.db.sqlite import now_iso, transaction
from app.services.event_service import EventBus

logger = logging.getLogger(__name__)

JOB_MESSAGE = "Processing was interrupted by a server restart. Reprocess the document to try again."


def recover(db_path, bus: EventBus) -> list[str]:
    """Returns document IDs whose partially written vectors must be removed."""
    now = now_iso()
    with transaction(db_path) as conn:
        jobs = conn.execute(
            "SELECT id, document_id FROM processing_jobs WHERE status IN ('queued', 'running')"
        ).fetchall()
        for job in jobs:
            conn.execute(
                "UPDATE processing_jobs SET status = 'failed', current_stage = NULL, error_code = 'JOB_INTERRUPTED', "
                "error_message = ?, completed_at = ?, updated_at = ? WHERE id = ?",
                (JOB_MESSAGE, now, now, job["id"]),
            )
            conn.execute(
                "UPDATE documents SET status = 'failed', status_message = ?, updated_at = ? WHERE id = ?",
                (JOB_MESSAGE, now, job["document_id"]),
            )
        queries = conn.execute("SELECT id FROM queries WHERE status IN ('queued', 'running')").fetchall()
        conn.execute(
            "UPDATE queries SET status = 'failed', error_code = 'QUERY_INTERRUPTED', "
            "error_message = 'The backend restarted while answering. Ask the question again.', completed_at = ? "
            "WHERE status IN ('queued', 'running')",
            (now,),
        )
        runs = conn.execute("SELECT id FROM evaluation_runs WHERE status IN ('queued', 'running')").fetchall()
        conn.execute(
            "UPDATE evaluation_runs SET status = 'failed', error_code = 'EVALUATION_INTERRUPTED', "
            "error_message = 'The backend restarted during the run. Start a new run.', completed_at = ? "
            "WHERE status IN ('queued', 'running')",
            (now,),
        )
    for job in jobs:
        bus.publish(
            "document_job",
            job["id"],
            event_type="terminal",
            status="failed",
            message=JOB_MESSAGE,
            error_code="JOB_INTERRUPTED",
        )
    for q in queries:
        bus.publish(
            "query",
            q["id"],
            event_type="terminal",
            status="failed",
            message="The backend restarted while answering.",
            error_code="QUERY_INTERRUPTED",
        )
    for r in runs:
        bus.publish(
            "evaluation_run",
            r["id"],
            event_type="terminal",
            status="failed",
            message="The backend restarted during the run.",
            error_code="EVALUATION_INTERRUPTED",
        )
    if jobs or queries or runs:
        logger.warning(
            "Recovered interrupted work jobs=%s queries=%s runs=%s",
            len(jobs),
            len(queries),
            len(runs),
        )
    return [j["document_id"] for j in jobs]
