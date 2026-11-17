from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    # Isolated settings: no .env file, data in a temporary folder.
    return Settings(
        _env_file=None,
        app_env="test",
        data_dir=tmp_path,
        sqlite_path=tmp_path / "test.db",
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client
