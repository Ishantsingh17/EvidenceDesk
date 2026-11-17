"""DD-02 activity checks: ingestion and evaluation never run at the same time."""

import sqlite3

from app.core.errors import AppError


def ingestion_active(conn: sqlite3.Connection) -> bool:
    return (
        conn.execute("SELECT 1 FROM processing_jobs WHERE status IN ('queued', 'running') LIMIT 1").fetchone()
        is not None
    )


def evaluation_active(conn: sqlite3.Connection) -> bool:
    return (
        conn.execute("SELECT 1 FROM evaluation_runs WHERE status IN ('queued', 'running') LIMIT 1").fetchone()
        is not None
    )


def refuse_if_evaluating(conn: sqlite3.Connection) -> None:
    if evaluation_active(conn):
        raise AppError(
            "EVALUATION_IN_PROGRESS",
            "Uploads, reprocessing and deletion are paused while an evaluation run is in progress.",
            409,
        )
