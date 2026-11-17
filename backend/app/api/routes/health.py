from typing import Any

from fastapi import APIRouter, Request

from app.api.deps import runtime_of
from app.schemas.api import DashboardSummary, SettingsStatus
from app.schemas.health import HealthResponse
from app.services import health_service

router = APIRouter(tags=["system"])


# Plain ``def``: SQLite checks are blocking, so FastAPI runs them in a worker thread.
@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    return health_service.get_health(runtime_of(request))


@router.get("/settings/status", response_model=SettingsStatus)
def settings_status(request: Request) -> Any:
    return health_service.get_settings_status(runtime_of(request))


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(request: Request) -> Any:
    return health_service.get_dashboard_summary(runtime_of(request))
