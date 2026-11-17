from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import PROJECT_ROOT, Settings


def test_project_root_is_repository_root() -> None:
    assert (PROJECT_ROOT / "CLAUDE.md").is_file()
    assert (PROJECT_ROOT / "backend" / "app").is_dir()


def test_relative_paths_resolve_from_project_root(tmp_path: Path, monkeypatch) -> None:
    # Change the working directory: paths must not depend on it.
    monkeypatch.chdir(tmp_path)
    settings = Settings(_env_file=None)
    assert settings.data_dir == (PROJECT_ROOT / "data").resolve()
    assert settings.sqlite_path == (PROJECT_ROOT / "data" / "app.db").resolve()
    assert settings.upload_dir == (PROJECT_ROOT / "data" / "uploads").resolve()
    assert settings.chroma_persist_dir == (PROJECT_ROOT / "data" / "chroma").resolve()
    assert settings.evaluation_dataset_dir == (PROJECT_ROOT / "evaluation" / "datasets").resolve()


def test_blank_retrieval_max_distance_is_none() -> None:
    settings = Settings(_env_file=None, retrieval_max_distance="")
    assert settings.retrieval_max_distance is None


def test_groq_retry_defaults_match_decision_log() -> None:
    settings = Settings(_env_file=None)
    assert settings.groq_max_attempts == 3
    assert settings.groq_retry_base_seconds == 1
    assert settings.groq_max_retry_wait_seconds == 15


@pytest.mark.parametrize("level", ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"])
def test_log_level_accepts_approved_levels(level: str) -> None:
    assert Settings(_env_file=None, log_level=level).log_level == level


def test_log_level_defaults_to_info_and_rejects_unknown() -> None:
    assert Settings(_env_file=None).log_level == "INFO"
    with pytest.raises(ValidationError):
        Settings(_env_file=None, log_level="TRACE")


def test_placeholder_groq_key_is_not_configured() -> None:
    assert not Settings(_env_file=None, groq_api_key="replace_me").groq_configured
    assert not Settings(_env_file=None, groq_api_key="").groq_configured
    assert Settings(_env_file=None, groq_api_key="gsk_example").groq_configured


def test_groq_key_is_masked_in_repr() -> None:
    settings = Settings(_env_file=None, groq_api_key="gsk_example_secret")
    assert "gsk_example_secret" not in repr(settings)


def test_overlap_must_be_smaller_than_chunk_size() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, chunk_size_tokens=40, chunk_overlap_tokens=40)


def test_env_example_lists_every_setting() -> None:
    example = (PROJECT_ROOT / "backend" / ".env.example").read_text(encoding="utf-8")
    keys = {
        line.split("=", 1)[0].strip()
        for line in example.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }
    expected = {name.upper() for name in Settings.model_fields}
    assert keys == expected
    assert "GROQ_API_KEY=replace_me" in example
