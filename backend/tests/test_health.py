from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_health_reports_healthy(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["service"] == "enterprise-document-retrieval-api"
    assert body["activity"] == {"ingestion_active": False, "evaluation_active": False}
    assert body["timestamp"].endswith("Z") or body["timestamp"].endswith("+00:00")
    assert set(body) == {"status", "service", "activity", "timestamp"}


def test_health_exposes_no_secrets_or_paths(settings: Settings) -> None:
    secret = "gsk_test_secret_value_123"
    app = create_app(settings.model_copy(update={"groq_api_key": secret}))
    with TestClient(app) as client:
        text = client.get("/api/v1/health").text
    assert secret not in text
    assert str(settings.sqlite_path) not in text
    assert "GROQ" not in text.upper()


def test_health_reports_degraded_when_database_fails(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr("app.services.health_service.check_database", lambda _: False)
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "degraded"


def test_cors_allows_only_configured_origin(client: TestClient) -> None:
    allowed = client.get("/api/v1/health", headers={"Origin": "http://localhost:5173"})
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"

    blocked = client.get("/api/v1/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in blocked.headers


def test_validation_errors_use_standard_shape(client: TestClient) -> None:
    # No real route takes input yet, so add a test-only route with a typed parameter.
    from fastapi import Query

    @client.app.get("/_test_validation")
    def _probe(n: int = Query(...)) -> dict:
        return {"n": n}

    response = client.get("/_test_validation", params={"n": "abc"})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert set(error) == {"code", "message", "details", "request_id"}
