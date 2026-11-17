"""Stage 3A/3B: upload validation, duplicates, extraction, chunking, indexing, reprocess, delete."""

from pathlib import Path

from fastapi.testclient import TestClient

from tests.conftest import upload, upload_and_wait
from tests.fakes import make_pdf


def test_upload_extracts_pages_and_indexes_chunks_with_page_metadata(client: TestClient, policy_pdf: Path) -> None:
    result = upload_and_wait(client, policy_pdf)
    assert result["job"]["status"] == "completed"
    assert [s["state"] for s in result["job"]["stages"]] == ["completed"] * 5

    doc = client.get(f"/api/v1/documents/{result['document_id']}").json()
    assert doc["status"] == "completed"
    assert doc["page_count"] == 2 and doc["chunk_count"] >= 2
    assert [p["page_number"] for p in doc["pages"]] == [1, 2]
    assert all(p["text_status"] == "ok" and p["chunk_count"] >= 1 for p in doc["pages"])
    assert "file_path" not in doc and "storage_name" not in doc  # never exposed

    store = client.app.state.runtime.store
    got = store._collection.get(where={"document_id": result["document_id"]}, include=["metadatas", "documents"])
    pages = {m["page_number"] for m in got["metadatas"]}
    assert pages == {1, 2}
    for meta, text in zip(got["metadatas"], got["documents"], strict=True):
        assert meta["file_hash"] == doc["file_hash"] and meta["embedding_model"] == "fake/bag-of-words"
        # Chunks never cross pages: page-2 text never appears in a page-1 chunk.
        if meta["page_number"] == 1:
            assert "callback" not in text


def test_duplicate_upload_is_rejected_with_409(client: TestClient, policy_pdf: Path) -> None:
    first = upload_and_wait(client, policy_pdf)
    response = upload(client, policy_pdf, name="renamed.pdf")
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "DUPLICATE_DOCUMENT"
    assert error["details"]["existing_document_id"] == first["document_id"]


def test_invalid_files_are_rejected_before_processing(client: TestClient, tmp_path: Path) -> None:
    text = tmp_path / "notes.txt"
    text.write_text("hello")
    assert upload(client, text).json()["error"]["code"] == "INVALID_FILE_TYPE"

    fake = tmp_path / "fake.pdf"
    fake.write_bytes(b"not a pdf at all")
    assert upload(client, fake).json()["error"]["code"] == "INVALID_FILE_TYPE"

    broken = tmp_path / "broken.pdf"
    broken.write_bytes(b"%PDF-1.7\nthis is not a real pdf body")
    response = upload(client, broken)
    assert response.status_code == 422 and response.json()["error"]["code"] == "PDF_PARSE_FAILED"

    assert client.get("/api/v1/documents").json()["total"] == 0
    uploads = client.app.state.settings.upload_dir
    assert list(uploads.iterdir()) == []  # rejected files are removed


def test_file_size_limit_returns_413(client: TestClient, tmp_path: Path) -> None:
    client.app.state.runtime.settings.max_upload_size_mb = 1
    big = tmp_path / "big.pdf"
    big.write_bytes(b"%PDF-1.7\n" + b"0" * (1024 * 1024 + 10))
    response = upload(client, big)
    assert response.status_code == 413 and response.json()["error"]["code"] == "FILE_TOO_LARGE"


def test_path_traversal_names_are_neutralised(client: TestClient, policy_pdf: Path) -> None:
    response = upload(client, policy_pdf, name="../../secret/evil.pdf")
    assert response.status_code == 202
    assert response.json()["filename"] == "evil.pdf"
    stored = list(client.app.state.settings.upload_dir.iterdir())
    assert len(stored) == 1 and stored[0].name != "evil.pdf" and stored[0].suffix == ".pdf"
    assert not (client.app.state.settings.data_dir / "secret").exists()


def test_no_text_pdf_needs_ocr_and_low_text_page_warns(client: TestClient, tmp_path: Path) -> None:
    blank = upload_and_wait(client, make_pdf(tmp_path / "scan.pdf", ["", ""]))
    assert blank["job"]["status"] == "failed" and blank["job"]["error_code"] == "NO_EXTRACTABLE_TEXT"
    doc = client.get(f"/api/v1/documents/{blank['document_id']}").json()
    assert doc["status"] == "needs_ocr"
    assert client.app.state.runtime.store.count_document(blank["document_id"]) == 0

    mixed = upload_and_wait(client, make_pdf(tmp_path / "mixed.pdf", ["Enough readable policy text here. " * 5, "x"]))
    doc = client.get(f"/api/v1/documents/{mixed['document_id']}").json()
    assert doc["status"] == "completed_with_warnings"
    assert doc["diagnostics"]["pages_low_text"] == 1
    assert doc["diagnostics"]["warnings"][0]["code"] == "LOW_TEXT_PAGE"


def test_reprocess_creates_a_new_job_and_delete_removes_everything(client: TestClient, policy_pdf: Path) -> None:
    first = upload_and_wait(client, policy_pdf)
    doc_id = first["document_id"]
    response = client.post(f"/api/v1/documents/{doc_id}/reprocess")
    assert response.status_code == 202
    second = response.json()
    assert second["attempt_number"] == 2 and second["job_id"] != first["job_id"]

    from tests.conftest import wait_for

    wait_for(lambda: client.get(f"/api/v1/jobs/{second['job_id']}").json()["status"], lambda s: s == "completed")
    runtime = client.app.state.runtime
    assert runtime.store.count_document(doc_id) > 0

    deleted = client.delete(f"/api/v1/documents/{doc_id}")
    assert deleted.status_code == 200 and deleted.json()["result"] == "deleted"
    assert client.get(f"/api/v1/documents/{doc_id}").status_code == 404
    assert client.get(f"/api/v1/jobs/{second['job_id']}").status_code == 404
    assert runtime.store.count_document(doc_id) == 0
    assert list(client.app.state.settings.upload_dir.iterdir()) == []
