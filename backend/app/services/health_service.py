"""Builds the health report from real checks.

Phase 1 checks only what exists: the SQLite database. The embedding model
(``starting`` while loading) and vector-store checks are added in Phase 4.
"""

from datetime import UTC, datetime

from app.core.config import Settings
from app.db.sqlite import check_database
from app.schemas.health import HealthActivity, HealthResponse

SERVICE_NAME = "enterprise-document-retrieval-api"


def get_health(settings: Settings) -> HealthResponse:
    database_ok = check_database(settings.sqlite_path)
    return HealthResponse(
        status="healthy" if database_ok else "degraded",
        service=SERVICE_NAME,
        # No job or evaluation system exists yet, so nothing can be active.
        activity=HealthActivity(ingestion_active=False, evaluation_active=False),
        timestamp=datetime.now(UTC),
    )
