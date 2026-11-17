"""Validated application settings.

All values come from environment variables (or ``backend/.env``). Relative data
paths are resolved from the project root, never from the process working
directory (TRD §12, decision D-04).
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> parents: core, app, backend, <project root>
PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_DIR = PROJECT_ROOT / "backend"


def resolve_project_path(value: Path) -> Path:
    """Return an absolute path; relative values are anchored at the project root."""
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return path.resolve()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    app_env: Literal["development", "test", "production"] = "development"
    api_host: str = "127.0.0.1"
    api_port: int = Field(default=8000, ge=1, le=65535)
    frontend_origin: str = "http://localhost:5173"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # Groq (LLM inference only). The key is never returned by any endpoint.
    groq_api_key: SecretStr | None = None
    groq_model: str = "openai/gpt-oss-20b"
    groq_temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    groq_timeout_seconds: float = Field(default=45, gt=0)
    groq_max_attempts: int = Field(default=3, ge=1)
    groq_retry_base_seconds: float = Field(default=1, ge=0)
    groq_max_retry_wait_seconds: float = Field(default=15, ge=0)

    # Embeddings, chunking and retrieval
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_batch_size: int = Field(default=32, ge=1)
    chunk_size_tokens: int = Field(default=220, ge=1)
    chunk_overlap_tokens: int = Field(default=40, ge=0)
    min_page_text_chars: int = Field(default=30, ge=0)
    retrieval_top_k: int = Field(default=4, ge=1)
    retrieval_top_k_max: int = Field(default=10, ge=1)
    retrieval_max_distance: float | None = None  # blank until calibrated (D-24)
    query_max_chars: int = Field(default=1000, ge=1)

    # Storage (relative values resolve from the project root)
    data_dir: Path = Path("data")
    sqlite_path: Path = Path("data/app.db")
    upload_dir: Path = Path("data/uploads")
    chroma_persist_dir: Path = Path("data/chroma")
    chroma_collection_name: str = "enterprise_document_chunks"
    evaluation_dataset_dir: Path = Path("evaluation/datasets")
    max_upload_size_mb: int = Field(default=20, ge=1)
    sse_heartbeat_seconds: int = Field(default=15, ge=1)

    @field_validator("retrieval_max_distance", "groq_api_key", mode="before")
    @classmethod
    def _blank_to_none(cls, value: object) -> object:
        # An empty .env value means "not set"; it must not be parsed as a number.
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator(
        "data_dir",
        "sqlite_path",
        "upload_dir",
        "chroma_persist_dir",
        "evaluation_dataset_dir",
    )
    @classmethod
    def _resolve_paths(cls, value: Path) -> Path:
        return resolve_project_path(value)

    @model_validator(mode="after")
    def _check_consistency(self) -> "Settings":
        if self.chunk_overlap_tokens >= self.chunk_size_tokens:
            raise ValueError("CHUNK_OVERLAP_TOKENS must be less than CHUNK_SIZE_TOKENS")
        if self.retrieval_top_k > self.retrieval_top_k_max:
            raise ValueError("RETRIEVAL_TOP_K must not exceed RETRIEVAL_TOP_K_MAX")
        return self

    @property
    def groq_configured(self) -> bool:
        """True when a non-placeholder key is present. Never exposes the key."""
        if self.groq_api_key is None:
            return False
        key = self.groq_api_key.get_secret_value().strip()
        return bool(key) and key != "replace_me"


@lru_cache
def get_settings() -> Settings:
    return Settings()
