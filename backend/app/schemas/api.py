"""Typed request and response models for the API (schema §5)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---- requests -------------------------------------------------------------------------


class QueryRequest(_Strict):
    question: str = Field(min_length=1, max_length=5000)
    document_ids: list[str] | None = None
    top_k: int | None = None


class FeedbackRequest(_Strict):
    rating: Literal["helpful", "not_helpful"]
    comment: str | None = Field(default=None, max_length=2000)


class RunRequest(_Strict):
    dataset_id: str
    top_k: int | None = None


class ReviewRequest(_Strict):
    correctness_rating: Literal["correct", "partially_correct", "incorrect", "not_applicable"]
    faithfulness_rating: Literal["faithful", "partially_faithful", "unfaithful", "not_applicable"]
    citation_validity: Literal["valid", "partially_valid", "invalid", "not_applicable"]
    reviewer_comment: str | None = Field(default=None, max_length=4000)
    reviewer_label: str | None = Field(default=None, max_length=40)


# ---- responses ------------------------------------------------------------------------


class UploadAccepted(BaseModel):
    document_id: str
    filename: str
    status: Literal["queued"]
    job_id: str
    events_url: str


class ReprocessAccepted(BaseModel):
    document_id: str
    job_id: str
    attempt_number: int
    status: Literal["queued"]
    events_url: str


class DeleteResult(BaseModel):
    document_id: str
    result: Literal["deleted", "partially_deleted"]
    vectors_removed: bool
    file_removed: bool
    metadata_removed: bool
    warnings: list[str]


class QueryAccepted(BaseModel):
    query_id: str
    status: Literal["queued"]
    events_url: str
    result_url: str


class FeedbackRecorded(BaseModel):
    feedback_id: str
    status: Literal["recorded"]


class RunAccepted(BaseModel):
    run_id: str
    status: Literal["queued"]
    events_url: str
    result_url: str


class ReviewOut(ReviewRequest):
    model_config = ConfigDict(extra="ignore")
    result_id: str
    created_at: str
    updated_at: str


class SettingsStatus(BaseModel):
    environment: str
    backend_status: Literal["starting", "healthy", "degraded"]
    vector_store_status: Literal["available", "unavailable", "model_mismatch"]
    embedding_model: str
    embedding_dimension: int | None
    embedding_model_loaded: bool
    llm_provider: str
    llm_model: str
    upload_limit_mb: int
    retrieval_top_k_default: int
    retrieval_top_k_max: int
    retrieval_max_distance: float | None
    evidence_threshold_calibrated: bool


class LatestEvaluation(BaseModel):
    run_id: str
    status: str
    case_count: int
    created_at: str


class DashboardSummary(BaseModel):
    documents_total: int
    documents_indexed: int
    documents_with_warnings: int
    documents_failed: int
    documents_needs_ocr: int
    queries_total: int
    queries_insufficient_evidence: int
    median_query_latency_ms: int | None
    query_latency_sample_count: int
    latest_evaluation: LatestEvaluation | None
