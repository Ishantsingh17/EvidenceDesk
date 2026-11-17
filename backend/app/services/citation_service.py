"""Structured-output validation and citation rules (schema §7.3, DD-05, DD-06).

The model only returns labels such as S1. Filenames, pages and excerpts for citations are
always built by the backend from the retrieved chunks (rule 6).
"""

import re
from dataclasses import dataclass, field

from app.services.llm_service import ModelAnswer

ABSTENTION_MESSAGE = "The uploaded documents do not contain enough evidence to answer this question."
LABEL_PATTERN = re.compile(r"\[(S\d+)\]")
_LABEL_ONLY = re.compile(r"^\[?(S\d+)\]?$")


@dataclass
class CitationOutcome:
    status: str  # completed | insufficient_evidence
    answer: str
    abstention_reason: str | None
    flag_for_review: bool
    review_reasons: list[str] = field(default_factory=list)
    cited_labels: set[str] = field(default_factory=set)


def _normalise_label(raw: str) -> str | None:
    match = _LABEL_ONLY.match(raw.strip())
    return match.group(1) if match else None


def _tidy(text: str) -> str:
    text = re.sub(r"[ \t]{2,}", " ", text)
    return re.sub(r"\s+([.,;:])", r"\1", text).strip()


def validate_answer(model: ModelAnswer, supplied_labels: set[str]) -> CitationOutcome:
    reasons: list[str] = []
    if model.insufficient_evidence:  # rule 2
        if model.flag_for_review:
            reasons.append("MODEL_FLAGGED")
        return CitationOutcome(
            status="insufficient_evidence",
            answer=ABSTENTION_MESSAGE,
            abstention_reason="model_reported_insufficient",
            flag_for_review=bool(reasons),
            review_reasons=reasons,
        )

    # Rule 3: the cited set is the union of cited_sources and inline markers.
    inline = set(LABEL_PATTERN.findall(model.answer))
    listed = {label for raw in model.cited_sources if (label := _normalise_label(raw))}
    cited = inline | listed
    unknown = cited - supplied_labels
    valid = cited & supplied_labels
    answer = model.answer
    if unknown:
        answer = LABEL_PATTERN.sub(lambda m: m.group(0) if m.group(1) in supplied_labels else "", answer)
        answer = _tidy(answer)
        reasons.append("UNKNOWN_SOURCE_LABEL")

    if model.flag_for_review:  # rule 5
        reasons.insert(0, "MODEL_FLAGGED")

    if not valid:  # rule 4: an uncited answer is not presented as grounded
        reasons.append("UNCITED_ANSWER")
        return CitationOutcome(
            status="insufficient_evidence",
            answer=ABSTENTION_MESSAGE,
            abstention_reason="no_valid_citations",
            flag_for_review=True,
            review_reasons=reasons,
        )

    return CitationOutcome(
        status="completed",
        answer=answer,
        abstention_reason=None,
        flag_for_review=bool(reasons),
        review_reasons=reasons,
        cited_labels=valid,
    )
