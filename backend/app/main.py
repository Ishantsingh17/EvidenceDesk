"""FastAPI application entry point.

Run with a single worker (TRD §6.3):
    python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
"""

import asyncio
import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging
from app.db.sqlite import init_database
from app.runtime import EmbedderFactory, LlmFactory, Runtime
from app.services.embedding_service import SentenceTransformerEmbedder
from app.services.evaluation.evaluation_service import load_datasets
from app.services.llm_service import GroqLlmClient
from app.services.recovery_service import recover

logger = logging.getLogger("app")

APP_TITLE = "EvidenceDesk AI API"
APP_DESCRIPTION = "AI-Powered Enterprise Document Retrieval & Evidence Assistant — local-first proof of concept."
APP_VERSION = "0.2.0"


def create_app(
    settings: Settings | None = None,
    embedder_factory: EmbedderFactory | None = None,
    llm_factory: LlmFactory | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    runtime = Runtime(
        settings,
        embedder_factory or SentenceTransformerEmbedder,
        llm_factory or GroqLlmClient,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        for directory in (settings.data_dir, settings.upload_dir, settings.chroma_persist_dir):
            directory.mkdir(parents=True, exist_ok=True)
        init_database(settings.sqlite_path)
        runtime.bus.bind_loop(asyncio.get_running_loop())
        # Recovery runs before requests are accepted; vector cleanup waits for the store.
        runtime.pending_vector_cleanup = recover(settings.sqlite_path, runtime.bus)
        load_datasets(settings)
        threading.Thread(target=runtime.load_models, name="model-loader", daemon=True).start()
        logger.info("Startup complete env=%s (embedding model loading in background)", settings.app_env)
        yield
        runtime.shutdown()
        logger.info("Shutdown complete")

    app = FastAPI(title=APP_TITLE, description=APP_DESCRIPTION, version=APP_VERSION, lifespan=lifespan)
    app.state.settings = settings
    app.state.runtime = runtime

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
