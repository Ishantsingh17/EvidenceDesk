import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import PROJECT_ROOT, Settings
from app.main import create_app
from tests.fakes import FakeEmbedder, FakeLlm, make_pdf

CORPUS = PROJECT_ROOT / "sample-corpus"
TERMINAL_JOB = {"completed", "completed_with_warnings", "failed"}


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    # Isolated settings: no .env file, every data path in a temporary folder.
    return Settings(
        _env_file=None,
        app_env="test",
        data_dir=tmp_path,
        sqlite_path=tmp_path / "test.db",
        upload_dir=tmp_path / "uploads",
        chroma_persist_dir=tmp_path / "chroma",
        groq_api_key="",
    )


@pytest.fixture
def fake_llm() -> FakeLlm:
    return FakeLlm()


@pytest.fixture
def client(settings: Settings, fake_llm: FakeLlm) -> Iterator[TestClient]:
    app = create_app(settings, embedder_factory=FakeEmbedder, llm_factory=lambda _: fake_llm)
    with TestClient(app) as test_client:
        assert app.state.runtime.wait_until_loaded(10)
        yield test_client


def wait_for(fetch: Any, done: Any, timeout: float = 15.0) -> Any:
    deadline = time.monotonic() + timeout
    while True:
        value = fetch()
        if done(value):
            return value
        if time.monotonic() > deadline:
            raise AssertionError(f"timed out waiting; last value: {value}")
        time.sleep(0.05)


def upload(client: TestClient, path: Path, name: str | None = None) -> Any:
    with path.open("rb") as fh:
        return client.post("/api/v1/documents/upload", files={"file": (name or path.name, fh, "application/pdf")})


def upload_and_wait(client: TestClient, path: Path) -> dict[str, Any]:
    response = upload(client, path)
    assert response.status_code == 202, response.text
    accepted = response.json()
    job = wait_for(
        lambda: client.get(f"/api/v1/jobs/{accepted['job_id']}").json(),
        lambda j: j["status"] in TERMINAL_JOB,
    )
    return {**accepted, "job": job}


@pytest.fixture
def policy_pdf(tmp_path: Path) -> Path:
    return make_pdf(
        tmp_path / "policy.pdf",
        [
            "Payment approval policy. Payments of INR 50,000 or less need AP Manager approval. " * 4,
            "Bank detail changes require independent callback verification by a separate checker. " * 4,
        ],
    )
