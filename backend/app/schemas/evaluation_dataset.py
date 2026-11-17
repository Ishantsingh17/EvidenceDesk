"""Evaluation seed dataset format (docs/04-BACKEND-SCHEMA.md §8, §2.8).

Strict: unknown fields are rejected, so a seed file cannot drift from the schema.
Used by the dataset tests now and by the dataset loader in Phase 4.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

EvaluationCategory = Literal[
    "direct",
    "multi_document",
    "ambiguous",
    "conflicting_documents",
    "unanswerable",
    "out_of_scope",
    "prompt_injection",
]

# Evaluation-only values; the live query response contract is unaffected (DD-42).
ExpectedBehavior = Literal["answer", "qualified_answer", "abstain", "refuse_unsafe_request"]

ALLOWED_BEHAVIORS: dict[str, frozenset[str]] = {
    "direct": frozenset({"answer"}),
    "multi_document": frozenset({"answer"}),
    "ambiguous": frozenset({"qualified_answer"}),
    "conflicting_documents": frozenset({"qualified_answer"}),
    "unanswerable": frozenset({"abstain"}),
    "out_of_scope": frozenset({"abstain"}),
    "prompt_injection": frozenset({"answer", "abstain", "refuse_unsafe_request"}),
}

_STRICT = ConfigDict(extra="forbid", str_strip_whitespace=True)


class DatasetInfo(BaseModel):
    model_config = _STRICT

    name: str = Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    description: str | None = None


class DatasetDocument(BaseModel):
    model_config = _STRICT

    document_key: str = Field(pattern=r"^[a-z0-9]+(_[a-z0-9]+)*$")
    filename: str = Field(pattern=r"^[^/\\]+\.pdf$")
    file_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


class ExpectedSource(BaseModel):
    model_config = _STRICT

    document_key: str
    page_number: int = Field(ge=1)  # one-based PDF page


class EvaluationCase(BaseModel):
    model_config = _STRICT

    case_key: str = Field(pattern=r"^[A-Z0-9]+(-[A-Z0-9]+)*$")
    question: str = Field(min_length=3)
    category: EvaluationCategory
    expected_behavior: ExpectedBehavior
    expected_answer: str | None = None
    answer_criteria: list[str] = Field(default_factory=list)
    expected_sources: list[ExpectedSource] = Field(default_factory=list)
    must_not_contain: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    review_notes: str | None = None

    @field_validator("must_not_contain", "answer_criteria", "tags")
    @classmethod
    def _no_blank_strings(cls, values: list[str]) -> list[str]:
        if any(not v.strip() for v in values):
            raise ValueError("entries must not be blank")
        return values

    @model_validator(mode="after")
    def _check_rules(self) -> "EvaluationCase":
        if self.expected_behavior not in ALLOWED_BEHAVIORS[self.category]:
            raise ValueError(
                f"{self.case_key}: expected_behavior {self.expected_behavior!r} "
                f"is not allowed for category {self.category!r}"
            )
        if self.expected_behavior == "abstain" and self.expected_sources:
            raise ValueError(f"{self.case_key}: abstain cases must have no expected_sources")
        if self.expected_behavior != "abstain" and not self.expected_sources:
            raise ValueError(f"{self.case_key}: non-abstain cases need at least one expected source")
        needs_forbidden = self.category == "prompt_injection" or self.expected_behavior == "refuse_unsafe_request"
        if needs_forbidden and not self.must_not_contain:
            raise ValueError(f"{self.case_key}: must_not_contain is required for this case")
        pairs = [(s.document_key, s.page_number) for s in self.expected_sources]
        if len(pairs) != len(set(pairs)):
            raise ValueError(f"{self.case_key}: duplicate expected source pages")
        return self


class EvaluationSeed(BaseModel):
    """A complete seed file: `{dataset, documents, cases}`."""

    model_config = _STRICT

    dataset: DatasetInfo
    documents: list[DatasetDocument] = Field(min_length=1)
    cases: list[EvaluationCase] = Field(min_length=1)

    @model_validator(mode="after")
    def _check_references(self) -> "EvaluationSeed":
        keys = [d.document_key for d in self.documents]
        hashes = [d.file_hash for d in self.documents]
        if len(keys) != len(set(keys)) or len(hashes) != len(set(hashes)):
            raise ValueError("document_key and file_hash must be unique")
        case_keys = [c.case_key for c in self.cases]
        if len(case_keys) != len(set(case_keys)):
            raise ValueError("case_key values must be unique")
        known = set(keys)
        for case in self.cases:
            unknown = {s.document_key for s in case.expected_sources} - known
            if unknown:
                raise ValueError(f"{case.case_key}: unknown document_key {sorted(unknown)}")
        return self
