"""Stage 3F: metrics, runs, failure types, human review, concurrency, SSE replay and recovery."""

from fastapi.testclient import TestClient

from app.db.sqlite import new_id, now_iso, transaction
from app.services.evaluation import metrics
from app.services.recovery_service import recover
from tests.conftest import CORPUS, upload_and_wait, wait_for
from tests.fakes import answer, failing

# ---------------------------------------------------------------- metric formulas (schema §9)


def test_retrieval_metrics_deduplicate_pages_and_follow_the_formulas() -> None:
    ranked = metrics.dedupe_pairs([("a", 1), ("a", 1), ("b", 2), ("c", 1)])
    assert ranked == [("a", 1), ("b", 2), ("c", 1)]  # duplicate page counted once
    p, r, rr = metrics.retrieval_scores(ranked, {("b", 2), ("z", 9)})
    assert (p, r, rr) == (1 / 3, 1 / 2, 1 / 2)
    assert metrics.retrieval_scores([], {("a", 1)}) == (0.0, 0.0, 0.0)
    assert metrics.retrieval_scores(ranked, set()) == (None, None, None)  # abstain: not applicable


def test_behaviour_rules_and_summary_exclusions() -> None:
    assert metrics.abstention_correct("abstain", True) is True
    assert metrics.abstention_correct("qualified_answer", True) is False
    assert metrics.abstention_correct("refuse_unsafe_request", False) is None
    assert metrics.must_not_contain_passed("Here is gsk_123", ["GSK_"]) is False
    assert metrics.percentile_nearest_rank(list(range(1, 21)), 0.95) == 19

    rows = [
        {
            "execution_status": "completed",
            "category": "direct",
            "precision_at_k": 1.0,
            "recall_at_k": 1.0,
            "reciprocal_rank": 1.0,
            "abstention_correct": True,
            "citation_source_match": True,
            "must_not_contain_passed": None,
            "latency_ms": 100,
            "failure_type": None,
        },
        {
            "execution_status": "completed",
            "category": "unanswerable",
            "precision_at_k": None,
            "recall_at_k": None,
            "reciprocal_rank": None,
            "abstention_correct": False,
            "citation_source_match": None,
            "must_not_contain_passed": None,
            "latency_ms": 300,
            "failure_type": None,
        },
        {
            "execution_status": "failed",
            "category": "direct",
            "precision_at_k": None,
            "recall_at_k": None,
            "reciprocal_rank": None,
            "abstention_correct": None,
            "citation_source_match": None,
            "must_not_contain_passed": None,
            "latency_ms": None,
            "failure_type": "infrastructure",
        },
    ]
    s = metrics.summarize(rows)
    assert s["retrieval"]["precision_at_k"] == {"value": 1.0, "sample_count": 1, "excluded_count": 1}
    assert s["abstention"]["abstention_correctness"] == {"value": 0.5, "numerator": 1, "sample_count": 2}
    assert s["latency"]["sample_count"] == 2 and s["latency"]["median_ms"] == 200
    review = metrics.human_review_summary(
        [
            {
                "correctness_rating": "partially_correct",
                "faithfulness_rating": "not_applicable",
                "citation_validity": "valid",
            }
        ],
        eligible_count=2,
    )
    assert review["correctness"] == {"value": 0.5, "sample_count": 1}
    assert review["faithfulness"] == {"value": None, "sample_count": 0}


# ---------------------------------------------------------------- full run on the real corpus


def _index_corpus(client: TestClient) -> None:
    for pdf in sorted(CORPUS.glob("*.pdf")):
        assert upload_and_wait(client, pdf)["job"]["status"] == "completed"


def _dataset(client: TestClient) -> dict:
    items = client.get("/api/v1/evaluations/datasets").json()["items"]
    assert [(d["name"], d["version"]) for d in items] == [("ap-policies", "1.1.0")]  # v1.0.0 is not loaded
    return items[0]


def test_preflight_requires_the_full_corpus(client: TestClient) -> None:
    dataset = _dataset(client)
    assert dataset["case_count"] == 20 and dataset["corpus_ready"] is False
    response = client.post("/api/v1/evaluations/run", json={"dataset_id": dataset["id"]})
    assert response.status_code == 409 and response.json()["error"]["code"] == "EVALUATION_CORPUS_INCOMPLETE"
    assert len(response.json()["error"]["details"]["missing"]) == 7


def test_run_scores_cases_separates_failures_and_accepts_reviews(client: TestClient, fake_llm) -> None:
    _index_corpus(client)
    dataset = _dataset(client)
    assert dataset["corpus_ready"] is True

    def behaviour(messages: list[dict[str, str]]):
        question = messages[1]["content"]
        if "Reserve Bank" in question:  # infrastructure failure: Retry-After over 15 s
            return failing("GROQ_RATE_LIMITED", transient=True, retry_after=30)(messages)
        if "spring animation" in question:  # pipeline failure
            return failing("LLM_RESPONSE_INVALID")(messages)
        if "bank account number" in question or "GSTIN" in question or "Groq API key" in question:
            return answer("Not in the documents.", [], insufficient=True)
        return answer("Supported by the policy [S1].", ["S1"])

    fake_llm.behaviour = behaviour
    run = client.post("/api/v1/evaluations/run", json={"dataset_id": dataset["id"]}).json()
    detail = wait_for(
        lambda: client.get(f"/api/v1/evaluations/runs/{run['run_id']}").json(),
        lambda r: r["status"] in ("completed", "completed_with_errors", "failed"),
        timeout=60,
    )
    assert detail["status"] == "completed_with_errors"
    assert (detail["completed_case_count"], detail["failed_case_count"]) == (18, 2)
    assert (detail["infrastructure_failure_count"], detail["pipeline_failure_count"]) == (1, 1)
    by_key = {r["case_key"]: r for r in detail["results"]}
    assert by_key["AP-OOS-002"]["failure_type"] == "infrastructure" and by_key["AP-OOS-002"]["llm_attempt_count"] == 1
    assert by_key["AP-UN-001"]["abstention_correct"] is True
    assert by_key["AP-PI-002"]["abstention_correct"] is None  # refuse_unsafe_request is excluded
    assert by_key["AP-DIR-001"]["recall_at_k"] is not None
    summary = detail["summary"]
    assert summary["abstention"]["abstention_correctness"]["sample_count"] == 17  # 18 completed minus 1 refuse case
    assert summary["latency"]["sample_count"] == 18
    # Evaluation never writes user query records (D-09).
    assert client.get("/api/v1/queries").json()["total"] == 0

    # Human review: completed results only.
    result = by_key["AP-DIR-002"]
    review = {
        "correctness_rating": "correct",
        "faithfulness_rating": "partially_faithful",
        "citation_validity": "valid",
        "reviewer_comment": "Good",
        "reviewer_label": "QA",
    }
    saved = client.put(f"/api/v1/evaluations/results/{result['result_id']}/review", json=review)
    assert saved.status_code == 200 and saved.json()["correctness_rating"] == "correct"
    blocked = client.put(f"/api/v1/evaluations/results/{by_key['AP-OOS-002']['result_id']}/review", json=review)
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "REVIEW_NOT_ALLOWED"
    human = client.get(f"/api/v1/evaluations/runs/{run['run_id']}").json()["summary"]["human_review"]
    assert human["reviewed_count"] == 1 and human["eligible_count"] == 18
    assert human["faithfulness"] == {"value": 0.5, "sample_count": 1}

    case = client.get(f"/api/v1/evaluations/runs/{run['run_id']}/results/{result['result_id']}").json()
    assert case["citations"] and case["retrieved_chunks"] and case["review"]["reviewer_label"] == "QA"


# ---------------------------------------------------------------- DD-02 concurrency


def _insert(client: TestClient, table: str) -> None:
    db = client.app.state.settings.sqlite_path
    now = now_iso()
    with transaction(db) as conn:
        if table == "job":
            doc = new_id()
            conn.execute(
                "INSERT INTO documents (id, filename, storage_name, file_path, mime_type, file_size_bytes, file_hash, "
                "status, created_at, updated_at) "
                "VALUES (?, 'x.pdf', 's', 's', 'application/pdf', 1, ?, 'queued', ?, ?)",
                (doc, new_id(), now, now),
            )
            conn.execute(
                "INSERT INTO processing_jobs "
                "(id, document_id, attempt_number, trigger, status, created_at, updated_at) "
                "VALUES (?, ?, 1, 'upload', 'queued', ?, ?)",
                (new_id(), doc, now, now),
            )
        else:
            dataset = conn.execute("SELECT id FROM evaluation_datasets").fetchone()[0]
            conn.execute(
                "INSERT INTO evaluation_runs (id, dataset_id, status, configuration_json, case_count, created_at) "
                "VALUES (?, ?, 'running', '{}', 20, ?)",
                (new_id(), dataset, now),
            )


def test_ingestion_and_evaluation_never_overlap(client: TestClient, policy_pdf) -> None:
    dataset = _dataset(client)
    _insert(client, "job")
    response = client.post("/api/v1/evaluations/run", json={"dataset_id": dataset["id"]})
    assert response.json()["error"]["code"] == "INGESTION_IN_PROGRESS"


def test_uploads_and_second_runs_are_blocked_during_evaluation(client: TestClient, policy_pdf) -> None:
    dataset = _dataset(client)
    _insert(client, "run")
    with policy_pdf.open("rb") as fh:
        response = client.post("/api/v1/documents/upload", files={"file": ("p.pdf", fh, "application/pdf")})
    assert response.status_code == 409 and response.json()["error"]["code"] == "EVALUATION_IN_PROGRESS"
    second = client.post("/api/v1/evaluations/run", json={"dataset_id": dataset["id"]})
    assert second.json()["error"]["code"] == "EVALUATION_ALREADY_RUNNING"
    assert client.get("/api/v1/health").json()["activity"]["evaluation_active"] is True


# ---------------------------------------------------------------- SSE replay and recovery


def test_sse_replays_persisted_events_after_last_event_id(client: TestClient, policy_pdf) -> None:
    job_id = upload_and_wait(client, policy_pdf)["job_id"]
    with client.stream("GET", f"/api/v1/jobs/{job_id}/events") as stream:
        body = "".join(stream.iter_text())
    ids = [int(line[4:]) for line in body.splitlines() if line.startswith("id: ")]
    assert ids == list(range(1, len(ids) + 1)) and "event: terminal" in body
    with client.stream("GET", f"/api/v1/jobs/{job_id}/events", headers={"Last-Event-ID": str(ids[-3])}) as stream:
        replay = "".join(stream.iter_text())
    assert [int(line[4:]) for line in replay.splitlines() if line.startswith("id: ")] == ids[-2:]
    assert client.get("/api/v1/jobs/unknown/events").json()["error"]["code"] == "JOB_NOT_FOUND"


def test_startup_recovery_ends_interrupted_work_truthfully(client: TestClient) -> None:
    _insert(client, "job")
    _insert(client, "run")
    runtime = client.app.state.runtime
    recovered = recover(runtime.settings.sqlite_path, runtime.bus)
    assert len(recovered) == 1
    with transaction(runtime.settings.sqlite_path) as conn:
        job = conn.execute("SELECT status, error_code FROM processing_jobs").fetchone()
        run = conn.execute("SELECT status, error_code FROM evaluation_runs").fetchone()
        terminal = conn.execute("SELECT COUNT(*) FROM workflow_events WHERE event_type = 'terminal'").fetchone()[0]
    assert tuple(job) == ("failed", "JOB_INTERRUPTED") and tuple(run) == ("failed", "EVALUATION_INTERRUPTED")
    assert terminal == 2
