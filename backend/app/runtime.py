"""Process-wide runtime: one embedding model, one vector store, the executors and gates.

Created once per app (single Uvicorn worker, TRD §6.3). The embedding model loads in a
background thread so `GET /health` can report `starting` while it loads.
"""

import logging
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.core.config import Settings
from app.core.errors import AppError
from app.services.embedding_service import Embedder
from app.services.event_service import EventBus
from app.services.vector_store import ModelMismatchError, VectorStore

logger = logging.getLogger(__name__)

EmbedderFactory = Callable[[str], Embedder]
LlmFactory = Callable[[Settings], Any]


class Runtime:
    def __init__(self, settings: Settings, embedder_factory: EmbedderFactory, llm_factory: LlmFactory):
        self.settings = settings
        self.bus = EventBus(settings.sqlite_path)
        self._embedder_factory = embedder_factory
        self._llm_factory = llm_factory
        self.embedder: Embedder | None = None
        self.store: VectorStore | None = None
        self.vector_store_status = "unavailable"  # available | unavailable | model_mismatch
        self.load_error: str | None = None
        self._ready = threading.Event()
        self._llm: Any = None
        self._llm_lock = threading.Lock()
        # DD-02: one job at a time, one run at a time, never both.
        self.ingestion_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ingestion")
        self.evaluation_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="evaluation")
        self.query_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="query")
        self.activity_lock = threading.Lock()
        self.pending_vector_cleanup: list[str] = []

    # ---- startup -------------------------------------------------------------------
    def load_models(self) -> None:
        """Loads the embedder once, opens the guarded collection, then runs deferred cleanup."""
        try:
            embedder = self._embedder_factory(self.settings.embedding_model)
            self.embedder = embedder
            try:
                self.store = VectorStore(
                    self.settings.chroma_persist_dir,
                    self.settings.chroma_collection_name,
                    embedder.model_id,
                    embedder.dimension,
                )
                self.vector_store_status = "available"
            except ModelMismatchError as exc:
                self.vector_store_status = "model_mismatch"
                logger.error("Embedding model mismatch: %s", exc)
            except Exception as exc:
                self.vector_store_status = "unavailable"
                logger.error("Vector store unavailable: %s", type(exc).__name__)
            if self.store is not None:
                for document_id in self.pending_vector_cleanup:
                    try:
                        self.store.delete_document(document_id)
                    except Exception:
                        logger.warning("Partial-vector cleanup failed for a recovered document")
                self.pending_vector_cleanup.clear()
        except Exception as exc:
            self.load_error = type(exc).__name__
            logger.error("Embedding model failed to load: %s", type(exc).__name__)
        finally:
            self._ready.set()

    def wait_until_loaded(self, timeout: float | None = None) -> bool:
        return self._ready.wait(timeout)

    @property
    def loaded(self) -> bool:
        return self._ready.is_set() and self.embedder is not None

    # ---- gates ---------------------------------------------------------------------
    def require_ready(self) -> tuple[Embedder, VectorStore]:
        """Raises the schema §10.1 error for any reason the RAG services cannot run."""
        if not self._ready.is_set():
            raise AppError("SERVICE_NOT_READY", "The embedding model is still loading.", 503)
        if self.embedder is None:
            raise AppError("SERVICE_NOT_READY", "The embedding model could not be loaded.", 503)
        if self.vector_store_status == "model_mismatch":
            raise AppError(
                "EMBEDDING_MODEL_MISMATCH",
                "The search index was built with a different embedding model.",
                503,
            )
        if self.store is None:
            raise AppError("VECTOR_STORE_UNAVAILABLE", "The vector store is unavailable.", 503)
        return self.embedder, self.store

    def llm(self) -> Any:
        with self._llm_lock:
            if self._llm is None:
                self._llm = self._llm_factory(self.settings)
            return self._llm

    def shutdown(self) -> None:
        for executor in (self.ingestion_executor, self.evaluation_executor, self.query_executor):
            executor.shutdown(wait=False, cancel_futures=True)
