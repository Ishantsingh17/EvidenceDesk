"""Health response model (schema §5.1)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

HealthStatus = Literal["starting", "healthy", "degraded"]


class HealthActivity(BaseModel):
    ingestion_active: bool
    evaluation_active: bool


class HealthResponse(BaseModel):
    status: HealthStatus
    service: str
    activity: HealthActivity
    timestamp: datetime
