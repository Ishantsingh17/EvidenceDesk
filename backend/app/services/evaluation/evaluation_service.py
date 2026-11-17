"""Evaluation datasets, runs, per-case scoring and human review (schema §5.7, §8, §9)."""

import hashlib
import logging
import time
from typing import Any

from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import AppError
from app.db.sqlite import dumps, loads, new_id, now_iso, transaction
from app.runtime import Runtime
from app.schemas.evaluation_dataset import EvaluationSeed
from app.services.activity import evaluation_active, ingestion_active
from app.services.evaluation import metrics
from app.services.llm_service import call_with_retries
from app.services.query_service import citations_from, retrieval_rows, save_retrievals
from app.services.rag_pipeline import PipelineResult, run_pipeline
from app.services.retrieval_service import SEARCHABLE

logger = logging.getLogger(__name__)

PROMPT_VERSION = "v1"
TERMINAL = {"completed", "completed_with_errors", "failed"}


# --------------------------------------------------------------------- dataset loading


def load_datasets(settings: Settings) -> list[str]:
    """Loads every valid seed file (idempotent). Invalid files, such as v1.0.0, are skipped."""
    loaded: list[str] = []
    directory = settings.evaluation_dataset_dir
    if not directory.is_dir():
        return loaded
    for path in sorted(directory.glob("*.json")):
        raw = path.read_bytes()
        try:
            seed = EvaluationSeed.model_validate_json(raw)
        except ValidationError:
            logger.warning("Seed file %s does not match schema §8 and is not loaded", path.name)
            continue
        checksum = hashlib.sha256(raw).hexdigest()
        with transaction(settings.sqlite_path) as conn:
            existing = conn.execute(
                "SELECT id, seed_checksum FROM evaluation_datasets WHERE name = ? AND version = ?",
                (seed.dataset.name, seed.dataset.version),
            ).fetchone()
            if existing:
                if existing["seed_checksum"] != checksum:
                    logger.error("Seed file %s changed without a new version; refusing to load it", path.name)
                else:
                    loaded.append(existing["id"])
                continue
            dataset_id = new_id()
            conn.execute(
                "INSERT INTO evaluation_datasets (id, name, version, description, seed_file, seed_checksum, "
                "case_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    dataset_id,
                    seed.dataset.name,
                    seed.dataset.version,
                    seed.dataset.description,
                    path.name,
                    checksum,
                    len(seed.cases),
                    now_iso(),
                ),
            )
            hash_by_key = {d.document_key: d.file_hash for d in seed.documents}
            conn.executemany(
                "INSERT INTO evaluation_dataset_documents (dataset_id, document_key, filename, file_hash) "
                "VALUES (?, ?, ?, ?)",
                [(dataset_id, d.document_key, d.filename, d.file_hash) for d in seed.documents],
            )
            conn.executemany(
                "INSERT INTO evaluation_cases (id, dataset_id, case_key, question, category, expected_behavior, "
                "expected_answer, answer_criteria_json, expected_sources_json, must_not_contain_json, tags_json, "
                "review_notes, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (
                        new_id(),
                        dataset_id,
                        c.case_key,
                        c.question,
                        c.category,
                        c.expected_behavior,
                        c.expected_answer,
                        dumps(c.answer_criteria),
                        dumps(
                            [
                                {
                                    "file_hash": hash_by_key[s.document_key],
                                    "page_number": s.page_number,
                                }
                                for s in c.expected_sources
                            ]
                        ),
                        dumps(c.must_not_contain),
                        dumps(c.tags),
                        c.review_notes,
                        position,
                    )
                    for position, c in enumerate(seed.cases)
                ],
            )
            loaded.append(dataset_id)
            logger.info(
                "Loaded evaluation dataset %s %s (%s cases)",
                seed.dataset.name,
                seed.dataset.version,
                len(seed.cases),
            )
    return loaded


def _corpus(conn: Any, dataset_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT dd.document_key, dd.filename, dd.file_hash, "
        f"EXISTS(SELECT 1 FROM documents d WHERE d.file_hash = dd.file_hash AND d.status IN {SEARCHABLE!r}) "
        "AS indexed FROM evaluation_dataset_documents dd WHERE dd.dataset_id = ? ORDER BY dd.filename",
        (dataset_id,),
    ).fetchall()
    return [
        {
            "document_key": r["document_key"],
            "filename": r["filename"],
            "file_hash": r["file_hash"],
            "indexed": bool(r["indexed"]),
        }
        for r in rows
    ]


def list_datasets(runtime: Runtime) -> dict[str, Any]:
    with transaction(runtime.settings.sqlite_path) as conn:
        datasets = conn.execute("SELECT * FROM evaluation_datasets ORDER BY name, version DESC").fetchall()
        items = []
        for d in datasets:
            categories: dict[str, int] = {}
            for row in conn.execute(
                "SELECT category, COUNT(*) AS n FROM evaluation_cases WHERE dataset_id = ? GROUP BY category",
                (d["id"],),
            ):
                categories[row["category"]] = row["n"]
            corpus = _corpus(conn, d["id"])
            items.append(
                {
                    "id": d["id"],
                    "name": d["name"],
                    "version": d["version"],
                    "description": d["description"] or "",
                    "case_count": d["case_count"],
                    "categories": categories,
                    "corpus": corpus,
                    "corpus_ready": all(c["indexed"] for c in corpus),
                }
            )
    return {"items": items}


# --------------------------------------------------------------------- runs


def start_run(runtime: Runtime, dataset_id: str, top_k: int | None) -> dict[str, Any]:
    settings = runtime.settings
    k = top_k or settings.retrieval_top_k
    if not 1 <= k <= settings.retrieval_top_k_max:
        raise AppError("VALIDATION_ERROR", f"top_k must be 1 to {settings.retrieval_top_k_max}.", 422)
    embedder, _ = runtime.require_ready()
    with runtime.activity_lock:  # DD-02: the checks and the insert are one atomic step
        with transaction(settings.sqlite_path) as conn:
            dataset = conn.execute("SELECT * FROM evaluation_datasets WHERE id = ?", (dataset_id,)).fetchone()
            if dataset is None:
                raise AppError("EVALUATION_DATASET_NOT_FOUND", "This dataset does not exist.", 404)
            if evaluation_active(conn):
                raise AppError("EVALUATION_ALREADY_RUNNING", "An evaluation run is already in progress.", 409)
            if ingestion_active(conn):
                raise AppError("INGESTION_IN_PROGRESS", "Wait for document processing to finish.", 409)
            missing = [c for c in _corpus(conn, dataset_id) if not c["indexed"]]
            if missing:
                raise AppError(
                    "EVALUATION_CORPUS_INCOMPLETE",
                    "Some documents this dataset needs are not indexed.",
                    409,
                    {"missing": [{"filename": m["filename"], "file_hash": m["file_hash"]} for m in missing]},
                )
            run_id = new_id()
            configuration = {
                "top_k": k,
                "retrieval_max_distance": settings.retrieval_max_distance,
                "evidence_threshold_calibrated": settings.retrieval_max_distance is not None,
                "llm_model": settings.groq_model,
                "embedding_model": embedder.model_id,
                "chunk_size_tokens": settings.chunk_size_tokens,
                "chunk_overlap_tokens": settings.chunk_overlap_tokens,
                "prompt_version": PROMPT_VERSION,
            }
            conn.execute(
                "INSERT INTO evaluation_runs (id, dataset_id, status, configuration_json, case_count, created_at) "
                "VALUES (?, ?, 'queued', ?, ?, ?)",
                (run_id, dataset_id, dumps(configuration), dataset["case_count"], now_iso()),
            )
    runtime.bus.publish(
        "evaluation_run",
        run_id,
        status="queued",
        stage="preflight",
        stage_status="completed",
        message="Preflight passed",
        details={"case_count": dataset["case_count"]},
    )
    runtime.evaluation_executor.submit(_execute, runtime, run_id)
    return {
        "run_id": run_id,
        "status": "queued",
        "events_url": f"/api/v1/evaluations/runs/{run_id}/events",
        "result_url": f"/api/v1/evaluations/runs/{run_id}",
    }


def _score(case: Any, result: PipelineResult) -> dict[str, Any]:
    expected = {(s["file_hash"], s["page_number"]) for s in loads(case["expected_sources_json"], [])}
    behavior = case["expected_behavior"]
    if result.status == "failed":
        return {
            "retrieved_pairs": [],
            "precision_at_k": None,
            "recall_at_k": None,
            "reciprocal_rank": None,
            "abstention_correct": None,
            "citation_source_match": None,
            "must_not_contain_passed": None,
        }
    # Retrieval metrics use top-k candidates before the threshold (DD-11).
    ranked = metrics.dedupe_pairs([(r.candidate.file_hash, r.candidate.page_number) for r in result.ranked])
    precision, recall, rr = metrics.retrieval_scores(ranked, expected)
    abstained = result.status == "insufficient_evidence"
    cited = {(r.candidate.file_hash, r.candidate.page_number) for r in result.ranked if r.is_cited}
    return {
        "retrieved_pairs": ranked,
        "precision_at_k": precision,
        "recall_at_k": recall,
        "reciprocal_rank": rr,
        "abstention_correct": metrics.abstention_correct(behavior, abstained),
        "citation_source_match": metrics.citation_source_match(behavior, not abstained, cited, expected),
        "must_not_contain_passed": metrics.must_not_contain_passed(
            result.answer, loads(case["must_not_contain_json"], [])
        ),
    }


def _execute(runtime: Runtime, run_id: str) -> None:
    settings = runtime.settings
    db = settings.sqlite_path
    bus = runtime.bus
    start = time.perf_counter()
    try:
        with transaction(db) as conn:
            run = conn.execute("SELECT * FROM evaluation_runs WHERE id = ?", (run_id,)).fetchone()
            cases = conn.execute(
                "SELECT * FROM evaluation_cases WHERE dataset_id = ? ORDER BY position",
                (run["dataset_id"],),
            ).fetchall()
            conn.execute(
                "UPDATE evaluation_runs SET status = 'running', started_at = ? WHERE id = ?",
                (now_iso(), run_id),
            )
        top_k = loads(run["configuration_json"])["top_k"]
        total = len(cases)
        completed = failed = 0
        for index, case in enumerate(cases):
            bus.publish(
                "evaluation_run",
                run_id,
                status="running",
                stage="case_execution",
                stage_status="started",
                message=f"Running case {case['case_key']}",
                details={
                    "completed_items": index,
                    "total_items": total,
                    "case_key": case["case_key"],
                },
            )

            def on_retry(next_attempt: int, code: str, key: str = case["case_key"], i: int = index) -> None:
                bus.publish(
                    "evaluation_run",
                    run_id,
                    status="running",
                    stage="case_execution",
                    stage_status="started",
                    message=f"Retrying (attempt {next_attempt} of {settings.groq_max_attempts})",
                    details={
                        "completed_items": i,
                        "total_items": total,
                        "case_key": key,
                        "llm_attempt": next_attempt,
                        "max_attempts": settings.groq_max_attempts,
                        "retry_reason": code,
                    },
                )

            def generate(messages: list[dict[str, str]], retry=on_retry) -> tuple[Any, int]:
                return call_with_retries(
                    lambda: runtime.llm().generate(messages),
                    max_attempts=settings.groq_max_attempts,
                    base_seconds=settings.groq_retry_base_seconds,
                    max_wait_seconds=settings.groq_max_retry_wait_seconds,
                    on_retry=retry,
                )

            result = run_pipeline(runtime, case["question"], top_k, None, lambda *a: None, generate)
            scores = _score(case, result)
            ok = result.status != "failed"
            completed += ok
            failed += not ok
            _save_result(db, run_id, case, index, result, scores)
            with transaction(db) as conn:
                conn.execute(
                    "UPDATE evaluation_runs SET completed_case_count = ?, failed_case_count = ? WHERE id = ?",
                    (completed, failed, run_id),
                )
            bus.publish(
                "evaluation_run",
                run_id,
                status="running",
                stage="case_execution",
                stage_status="completed",
                message=f"Case {case['case_key']} {'completed' if ok else 'failed'}",
                details={
                    "completed_items": index + 1,
                    "total_items": total,
                    "case_key": case["case_key"],
                    "execution_status": "completed" if ok else "failed",
                    "failure_type": result.failure_type,
                },
                error_code=result.error_code,
            )

        bus.publish(
            "evaluation_run",
            run_id,
            status="running",
            stage="metric_aggregation",
            stage_status="started",
            message="Calculating metrics",
        )
        rows = _result_rows(db, run_id)
        summary = metrics.summarize(rows)
        status = "completed" if failed == 0 else ("failed" if completed == 0 else "completed_with_errors")
        duration = int((time.perf_counter() - start) * 1000)
        error_code = "EVALUATION_FAILED" if status == "failed" else None
        with transaction(db) as conn:
            conn.execute(
                "UPDATE evaluation_runs SET status = ?, summary_metrics_json = ?, completed_at = ?, duration_ms = ?, "
                "error_code = ?, error_message = ? WHERE id = ?",
                (
                    status,
                    dumps(summary),
                    now_iso(),
                    duration,
                    error_code,
                    "Every case failed." if status == "failed" else None,
                    run_id,
                ),
            )
        bus.publish(
            "evaluation_run",
            run_id,
            status="running",
            stage="metric_aggregation",
            stage_status="completed",
            message="Metrics calculated",
        )
        bus.publish(
            "evaluation_run",
            run_id,
            event_type="terminal",
            status=status,
            message={
                "completed": "Evaluation completed",
                "completed_with_errors": "Completed with errors",
                "failed": "Evaluation failed",
            }[status],
            details={
                "completed_case_count": completed,
                "failed_case_count": failed,
                "duration_ms": duration,
            },
            error_code=error_code,
        )
        logger.info(
            "Evaluation finished run=%s status=%s completed=%s failed=%s",
            run_id,
            status,
            completed,
            failed,
        )
    except Exception as exc:
        logger.error("Evaluation run failed run=%s type=%s", run_id, type(exc).__name__)
        with transaction(db) as conn:
            conn.execute(
                "UPDATE evaluation_runs SET status = 'failed', error_code = 'EVALUATION_FAILED', "
                "error_message = 'The evaluation run stopped unexpectedly.', completed_at = ? WHERE id = ?",
                (now_iso(), run_id),
            )
        bus.publish(
            "evaluation_run",
            run_id,
            event_type="terminal",
            status="failed",
            message="The evaluation run stopped unexpectedly.",
            error_code="EVALUATION_FAILED",
        )


def _save_result(db: Any, run_id: str, case: Any, position: int, r: PipelineResult, s: dict[str, Any]) -> None:
    result_id = new_id()
    methods = {
        "retrieval": "rule_based",
        "abstention": "rule_based",
        "citation_source_match": "rule_based",
        "must_not_contain": "rule_based",
        "latency": "measured",
    }

    def b(v: bool | None) -> int | None:
        return None if v is None else int(v)

    with transaction(db) as conn:
        conn.execute(
            "INSERT INTO evaluation_results (id, run_id, case_id, execution_status, error_code, error_message, "
            "failure_type, llm_attempt_count, answer, insufficient_evidence, abstention_reason, flag_for_review, "
            "review_reasons_json, retrieved_pairs_json, precision_at_k, recall_at_k, reciprocal_rank, "
            "abstention_correct, citation_source_match, must_not_contain_passed, retrieval_duration_ms, "
            "generation_duration_ms, latency_ms, scoring_method_json, position, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                result_id,
                run_id,
                case["id"],
                "failed" if r.status == "failed" else "completed",
                r.error_code,
                r.error_message,
                r.failure_type,
                r.llm_attempts,
                r.answer,
                b(r.status == "insufficient_evidence") if r.status != "failed" else None,
                r.abstention_reason,
                b(r.flag_for_review),
                dumps(r.review_reasons),
                dumps([{"file_hash": h, "page_number": p} for h, p in s["retrieved_pairs"]]),
                s["precision_at_k"],
                s["recall_at_k"],
                s["reciprocal_rank"],
                b(s["abstention_correct"]),
                b(s["citation_source_match"]),
                b(s["must_not_contain_passed"]),
                r.retrieval_ms,
                r.generation_ms,
                r.total_ms if r.status != "failed" else None,
                dumps(methods),
                position,
                now_iso(),
            ),
        )
        save_retrievals(conn, "evaluation_result_retrievals", "result_id", result_id, r)


def _result_rows(db: Any, run_id: str) -> list[dict[str, Any]]:
    with transaction(db) as conn:
        rows = conn.execute(
            "SELECT r.*, c.category FROM evaluation_results r JOIN evaluation_cases c ON c.id = r.case_id "
            "WHERE r.run_id = ? ORDER BY r.position",
            (run_id,),
        ).fetchall()
    return [
        {
            "execution_status": r["execution_status"],
            "failure_type": r["failure_type"],
            "category": r["category"],
            "precision_at_k": r["precision_at_k"],
            "recall_at_k": r["recall_at_k"],
            "reciprocal_rank": r["reciprocal_rank"],
            "abstention_correct": None if r["abstention_correct"] is None else bool(r["abstention_correct"]),
            "citation_source_match": None if r["citation_source_match"] is None else bool(r["citation_source_match"]),
            "must_not_contain_passed": None
            if r["must_not_contain_passed"] is None
            else bool(r["must_not_contain_passed"]),
            "latency_ms": r["latency_ms"],
        }
        for r in rows
    ]


# --------------------------------------------------------------------- read views


def _bool(v: Any) -> bool | None:
    return None if v is None else bool(v)


def _review(row: Any) -> dict[str, Any] | None:
    if row is None or row["review_id"] is None:
        return None
    return {
        "correctness_rating": row["correctness_rating"],
        "faithfulness_rating": row["faithfulness_rating"],
        "citation_validity": row["citation_validity"],
        "reviewer_comment": row["reviewer_comment"],
        "reviewer_label": row["reviewer_label"],
        "created_at": row["review_created_at"],
        "updated_at": row["review_updated_at"],
    }


_RESULT_SELECT = (
    "SELECT r.*, c.case_key, c.question, c.category, c.expected_behavior, c.expected_sources_json, "
    "c.expected_answer, c.answer_criteria_json, c.must_not_contain_json, c.review_notes, "
    "v.id AS review_id, v.correctness_rating, v.faithfulness_rating, v.citation_validity, v.reviewer_comment, "
    "v.reviewer_label, v.created_at AS review_created_at, v.updated_at AS review_updated_at "
    "FROM evaluation_results r JOIN evaluation_cases c ON c.id = r.case_id "
    "LEFT JOIN evaluation_reviews v ON v.result_id = r.id "
)


def _result_item(row: Any, filenames: dict[str, str]) -> dict[str, Any]:
    expected = loads(row["expected_sources_json"], [])
    retrieved = loads(row["retrieved_pairs_json"], [])
    return {
        "result_id": row["id"],
        "case_id": row["case_id"],
        "case_key": row["case_key"],
        "question": row["question"],
        "category": row["category"],
        "expected_behavior": row["expected_behavior"],
        "expected_sources": [{**s, "filename": filenames.get(s["file_hash"], "")} for s in expected],
        "execution_status": row["execution_status"],
        "error_code": row["error_code"],
        "failure_type": row["failure_type"],
        "llm_attempt_count": row["llm_attempt_count"],
        "insufficient_evidence": _bool(row["insufficient_evidence"]),
        "flag_for_review": _bool(row["flag_for_review"]),
        "retrieved_sources": [
            {"rank": i, **p, "filename": filenames.get(p["file_hash"], "")} for i, p in enumerate(retrieved, start=1)
        ],
        "precision_at_k": row["precision_at_k"],
        "recall_at_k": row["recall_at_k"],
        "reciprocal_rank": row["reciprocal_rank"],
        "abstention_correct": _bool(row["abstention_correct"]),
        "citation_source_match": _bool(row["citation_source_match"]),
        "must_not_contain_passed": _bool(row["must_not_contain_passed"]),
        "latency_ms": row["latency_ms"],
        "review": _review(row),
    }


def _filenames(conn: Any, dataset_id: str) -> dict[str, str]:
    return {
        r["file_hash"]: r["filename"]
        for r in conn.execute(
            "SELECT file_hash, filename FROM evaluation_dataset_documents WHERE dataset_id = ?",
            (dataset_id,),
        )
    }


def _run_base(run: Any, dataset: Any) -> dict[str, Any]:
    return {
        "run_id": run["id"],
        "dataset": {"id": dataset["id"], "name": dataset["name"], "version": dataset["version"]},
        "status": run["status"],
        "case_count": run["case_count"],
        "completed_case_count": run["completed_case_count"],
        "failed_case_count": run["failed_case_count"],
        "created_at": run["created_at"],
        "duration_ms": run["duration_ms"],
    }


def list_runs(runtime: Runtime, page: int, page_size: int) -> dict[str, Any]:
    with transaction(runtime.settings.sqlite_path) as conn:
        total = conn.execute("SELECT COUNT(*) FROM evaluation_runs").fetchone()[0]
        runs = conn.execute(
            "SELECT * FROM evaluation_runs ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (page_size, (page - 1) * page_size),
        ).fetchall()
        items = []
        for run in runs:
            dataset = conn.execute("SELECT * FROM evaluation_datasets WHERE id = ?", (run["dataset_id"],)).fetchone()
            summary = loads(run["summary_metrics_json"], {})
            items.append(
                {
                    **_run_base(run, dataset),
                    "summary": {k: summary.get(k) for k in ("retrieval", "abstention", "citations")},
                }
            )
    return {"items": items, "page": page, "page_size": page_size, "total": total}


def get_run(runtime: Runtime, run_id: str) -> dict[str, Any]:
    with transaction(runtime.settings.sqlite_path) as conn:
        run = conn.execute("SELECT * FROM evaluation_runs WHERE id = ?", (run_id,)).fetchone()
        if run is None:
            raise AppError("EVALUATION_RUN_NOT_FOUND", "This evaluation run does not exist.", 404)
        dataset = conn.execute("SELECT * FROM evaluation_datasets WHERE id = ?", (run["dataset_id"],)).fetchone()
        filenames = _filenames(conn, dataset["id"])
        rows = conn.execute(_RESULT_SELECT + "WHERE r.run_id = ? ORDER BY r.position", (run_id,)).fetchall()
    results = [_result_item(r, filenames) for r in rows]
    summary = loads(run["summary_metrics_json"])
    if summary is not None:
        reviews = [r["review"] for r in results if r["review"]]
        eligible = sum(1 for r in results if r["execution_status"] == "completed")
        summary["human_review"] = metrics.human_review_summary(reviews, eligible)  # computed at read time
    failures = [r["failure_type"] for r in results if r["failure_type"]]
    return {
        **_run_base(run, dataset),
        "configuration": loads(run["configuration_json"]),
        "infrastructure_failure_count": failures.count("infrastructure"),
        "pipeline_failure_count": failures.count("pipeline"),
        "started_at": run["started_at"],
        "completed_at": run["completed_at"],
        "error_code": run["error_code"],
        "error_message": run["error_message"],
        "summary": summary,
        "by_category": metrics.by_category(
            [
                {
                    "category": r["category"],
                    "execution_status": r["execution_status"],
                    "abstention_correct": r["abstention_correct"],
                }
                for r in results
            ]
        ),
        "results": results,
    }


def get_result(runtime: Runtime, run_id: str, result_id: str) -> dict[str, Any]:
    with transaction(runtime.settings.sqlite_path) as conn:
        row = conn.execute(_RESULT_SELECT + "WHERE r.run_id = ? AND r.id = ?", (run_id, result_id)).fetchone()
        if row is None:
            raise AppError("EVALUATION_RESULT_NOT_FOUND", "This evaluation result does not exist.", 404)
        dataset_id = conn.execute("SELECT dataset_id FROM evaluation_runs WHERE id = ?", (run_id,)).fetchone()[0]
        filenames = _filenames(conn, dataset_id)
        chunks = retrieval_rows(conn, "evaluation_result_retrievals", "result_id", result_id)
    return {
        **_result_item(row, filenames),
        "expected_answer": row["expected_answer"],
        "answer_criteria": loads(row["answer_criteria_json"], []),
        "must_not_contain": loads(row["must_not_contain_json"], []),
        "review_notes": row["review_notes"],
        "answer": row["answer"],
        "abstention_reason": row["abstention_reason"],
        "review_reasons": loads(row["review_reasons_json"], []),
        "error_message": row["error_message"],
        "citations": citations_from(chunks),
        "retrieved_chunks": chunks,
        "scoring_method": loads(row["scoring_method_json"], {}),
        "llm_judge": None,
    }


def save_review(runtime: Runtime, result_id: str, review: dict[str, Any]) -> dict[str, Any]:
    with transaction(runtime.settings.sqlite_path) as conn:
        row = conn.execute(
            "SELECT r.execution_status, run.status AS run_status FROM evaluation_results r "
            "JOIN evaluation_runs run ON run.id = r.run_id WHERE r.id = ?",
            (result_id,),
        ).fetchone()
        if row is None:
            raise AppError("EVALUATION_RESULT_NOT_FOUND", "This evaluation result does not exist.", 404)
        if row["run_status"] not in TERMINAL or row["execution_status"] != "completed":
            raise AppError("REVIEW_NOT_ALLOWED", "Only completed cases of a finished run can be reviewed.", 409)
        now = now_iso()
        existing = conn.execute(
            "SELECT id, created_at FROM evaluation_reviews WHERE result_id = ?", (result_id,)
        ).fetchone()
        fields = (
            review["correctness_rating"],
            review["faithfulness_rating"],
            review["citation_validity"],
            review.get("reviewer_comment"),
            review.get("reviewer_label"),
        )
        if existing:
            conn.execute(
                "UPDATE evaluation_reviews SET correctness_rating = ?, faithfulness_rating = ?, citation_validity = ?, "
                "reviewer_comment = ?, reviewer_label = ?, updated_at = ? WHERE result_id = ?",
                (*fields, now, result_id),
            )
            created = existing["created_at"]
        else:
            conn.execute(
                "INSERT INTO evaluation_reviews (id, result_id, correctness_rating, faithfulness_rating, "
                "citation_validity, reviewer_comment, reviewer_label, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (new_id(), result_id, *fields, now, now),
            )
            created = now
    return {"result_id": result_id, **review, "created_at": created, "updated_at": now}
