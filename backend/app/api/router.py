from fastapi import APIRouter

from app.api.routes import documents, evaluations, health, queries

API_PREFIX = "/api/v1"

api_router = APIRouter(prefix=API_PREFIX)
api_router.include_router(health.router)
api_router.include_router(documents.router)
api_router.include_router(queries.router)
api_router.include_router(evaluations.router)
