from fastapi import APIRouter, Request

from app.schemas.health import HealthResponse
from app.services.health_service import get_health

router = APIRouter(tags=["health"])


# Plain ``def``: the SQLite check is blocking, so FastAPI runs it in a worker thread.
@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    return get_health(request.app.state.settings)
