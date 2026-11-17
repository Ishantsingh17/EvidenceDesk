"""Shared, non-persisting RAG pipeline used by user queries and evaluation cases (TRD §8).

It never writes to the database. Callers pass `emit` (stage events) and `generate`
(how to call the LLM: once for queries, with retries for evaluation) and persist the result.
"""

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.core.errors import AppError
from app.db.sqlite import transaction
from app.services.citation_service import ABSTENTION_MESSAGE, validate_answer
from app.services.llm_service import LlmError, LlmResponse, SourcePassage, build_messages
from app.services.retrieval_service import apply_threshold, searchable_document_ids
from app.services.vector_store import Candidate

logger = logging.getLogger(__name__)

INFRASTRUCTURE_CODES = {
    "GROQ_RATE_LIMITED",
    "GROQ_TIMEOUT",
    "GROQ_AUTHENTICATION_FAILED",
    "LLM_PROVIDER_ERROR",
    "VECTOR_STORE_UNAVAILABLE",
    "SERVICE_NOT_READY",
    "EMBEDDING_MODEL_MISMATCH",
}

Emit = Callable[[str, str, dict[str, Any] | None, str | None], None]
Generate = Callable[[list[dict[str, str]]], tuple[LlmResponse, int]]


@dataclass
class RankedCandidate:
    rank: int
    candidate: Candidate
    passed_threshold: bool
    source_label: str | None = None
    is_cited: bool = False


@dataclass
class PipelineResult:
    status: str  # completed | insufficient_evidence | failed
    answer: str | None = None
    abstention_reason: str | None = None
    flag_for_review: bool = False
    review_reasons: list[str] = field(default_factory=list)
    ranked: list[RankedCandidate] = field(default_factory=list)
    threshold_applied: bool = False
    max_distance: float | None = None
    query_embedding_ms: int | None = None
    retrieval_ms: int | None = None
    generation_ms: int | None = None
    total_ms: int = 0
    model_name: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    llm_attempts: int | None = None
    error_code: str | None = None
    error_message: str | None = None

    @property
    def failure_type(self) -> str | None:
        if self.status != "failed":
            return None
        return "infrastructure" if self.error_code in INFRASTRUCTURE_CODES else "pipeline"

    @property
    def retrieved_count(self) -> int:
        return len(self.ranked)

    @property
    def evidence_count(self) -> int:
        return sum(1 for r in self.ranked if r.source_label)

    @property
    def citation_count(self) -> int:
        return sum(1 for r in self.ranked if r.is_cited)


def run_pipeline(
    runtime: Any,  # app.runtime.Runtime
    question: str,
    top_k: int,
    document_filter: list[str] | None,
    emit: Emit,
    generate: Generate,
) -> PipelineResult:
    settings = runtime.settings
    start = time.perf_counter()
    result = PipelineResult(status="failed", max_distance=settings.retrieval_max_distance)
    result.threshold_applied = settings.retrieval_max_distance is not None
    stage = "query_embedding"
    try:
        embedder, store = runtime.require_ready()
        with transaction(settings.sqlite_path) as conn:
            document_ids = searchable_document_ids(conn, document_filter)

        # Query embedding with the same model as the document chunks.
        emit(stage, "started", None, None)
        t = time.perf_counter()
        try:
            embedding = embedder.encode([question])[0]
        except Exception as exc:
            raise AppError("EMBEDDING_FAILED", "The question could not be embedded.", 500) from exc
        result.query_embedding_ms = int((time.perf_counter() - t) * 1000)
        emit(stage, "completed", {"duration_ms": result.query_embedding_ms}, None)

        # Top-k similarity search over searchable documents only.
        stage = "retrieval"
        emit(stage, "started", None, None)
        t = time.perf_counter()
        try:
            candidates = store.query(embedding, top_k, document_ids)
        except Exception as exc:
            raise AppError("VECTOR_STORE_UNAVAILABLE", "The vector store could not be searched.", 503) from exc
        result.retrieval_ms = int((time.perf_counter() - t) * 1000)
        emit(
            stage,
            "completed",
            {"retrieved_count": len(candidates), "duration_ms": result.retrieval_ms},
            None,
        )

        # Evidence threshold and S1..Sn labels in rank order.
        stage = "context_preparation"
        emit(stage, "started", None, None)
        retained_ids = {c.chunk_id for c in apply_threshold(candidates, settings.retrieval_max_distance)}
        label = 0
        for rank, c in enumerate(candidates, start=1):
            passed = c.chunk_id in retained_ids
            ranked = RankedCandidate(rank=rank, candidate=c, passed_threshold=passed)
            if passed:
                label += 1
                ranked.source_label = f"S{label}"
            result.ranked.append(ranked)
        emit(
            stage,
            "completed",
            {
                "evidence_count": result.evidence_count,
                "threshold_applied": result.threshold_applied,
            },
            None,
        )

        if result.evidence_count == 0:
            # Abstain before calling the LLM (TRD §8 step 6).
            result.status = "insufficient_evidence"
            result.answer = ABSTENTION_MESSAGE
            result.abstention_reason = "no_retrieval_results" if not candidates else "below_evidence_threshold"
            emit("generation", "skipped", None, "Skipped: not enough evidence")
            emit("citation_validation", "skipped", None, "Skipped: not enough evidence")
            return result

        # Grounded generation.
        stage = "generation"
        emit(stage, "started", None, None)
        sources = [
            SourcePassage(r.source_label, r.candidate.filename, r.candidate.page_number, r.candidate.text)
            for r in result.ranked
            if r.source_label
        ]
        response, attempts = generate(build_messages(question, sources))
        result.llm_attempts = attempts
        result.generation_ms = response.duration_ms
        result.model_name = response.model_name
        result.prompt_tokens = response.prompt_tokens
        result.completion_tokens = response.completion_tokens
        emit(
            stage,
            "completed",
            {"model_name": response.model_name, "duration_ms": response.duration_ms},
            None,
        )

        # Citation validation against the labels actually supplied.
        stage = "citation_validation"
        emit(stage, "started", None, None)
        outcome = validate_answer(response.answer, {s.label for s in sources})
        for r in result.ranked:
            r.is_cited = r.source_label in outcome.cited_labels
        result.status = outcome.status
        result.answer = outcome.answer
        result.abstention_reason = outcome.abstention_reason
        result.flag_for_review = outcome.flag_for_review
        result.review_reasons = outcome.review_reasons
        emit(
            stage,
            "completed",
            {
                "citation_count": result.citation_count,
                "flag_for_review": result.flag_for_review,
            },
            None,
        )
        return result
    except LlmError as exc:
        result.llm_attempts = exc.attempts
        _fail(result, stage, exc.code, exc.message, emit)
        return result
    except AppError as exc:
        _fail(result, stage, exc.code, exc.message, emit)
        return result
    except Exception as exc:
        logger.error("Pipeline error stage=%s type=%s", stage, type(exc).__name__)
        _fail(result, stage, "INTERNAL_ERROR", "The question could not be answered.", emit)
        return result
    finally:
        result.total_ms = int((time.perf_counter() - start) * 1000)


def _fail(result: PipelineResult, stage: str, code: str, message: str, emit: Emit) -> None:
    result.status = "failed"
    result.error_code = code
    result.error_message = message
    result.answer = None
    try:
        emit(stage, "failed", {"error_code": code}, message)
    except Exception:
        logger.warning("Could not publish the failed stage event")
