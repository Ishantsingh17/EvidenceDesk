"""FastAPI application entry point.

Run with a single worker (TRD §6.3):
    python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging
from app.db.sqlite import init_database

logger = logging.getLogger("app")

APP_TITLE = "EvidenceDesk AI API"
APP_DESCRIPTION = (
    "AI-Powered Enterprise Document Retrieval & Evidence Assistant — local-first proof of concept."
)
APP_VERSION = "0.1.0"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        init_database(settings.sqlite_path)
        logger.info("Startup complete env=%s", settings.app_env)
        yield
        logger.info("Shutdown complete")

    app = FastAPI(
        title=APP_TITLE,
        description=APP_DESCRIPTION,
        version=APP_VERSION,
        lifespan=lifespan,
    )
    app.state.settings = settings

    # CORS is restricted to the single configured frontend origin (TRD §13).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "Last-Event-ID"],
        allow_credentials=False,
    )
    register_error_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()
