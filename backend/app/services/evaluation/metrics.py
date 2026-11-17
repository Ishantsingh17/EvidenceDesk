"""Evaluation metric definitions (docs/04-BACKEND-SCHEMA.md §9). Pure functions, no I/O."""

import math
from statistics import mean, median
from typing import Any

Pair = tuple[str, int]  # (file_hash, page_number)

RATING_SCORES: dict[str, float] = {
    "correct": 1.0,
    "partially_correct": 0.5,
    "incorrect": 0.0,
    "faithful": 1.0,
    "partially_faithful": 0.5,
    "unfaithful": 0.0,
    "valid": 1.0,
    "partially_valid": 0.5,
    "invalid": 0.0,
}  # not_applicable is excluded (DD-12)


def dedupe_pairs(pairs: list[Pair]) -> list[Pair]:
    """Unique (file_hash, page) pairs, keeping the first (best) rank (§9.1 step 2)."""
    seen: set[Pair] = set()
    ranked: list[Pair] = []
    for pair in pairs:
        if pair not in seen:
            seen.add(pair)
            ranked.append(pair)
    return ranked


def retrieval_scores(ranked: list[Pair], expected: set[Pair]) -> tuple[float | None, float | None, float | None]:
    """Precision@k, Recall@k and reciprocal rank; all None when G is empty (not applicable)."""
    if not expected:
        return None, None, None
    hits = [p for p in ranked if p in expected]
    precision = len(hits) / len(ranked) if ranked else 0.0
    recall = len(set(hits)) / len(expected)
    rr = 0.0
    for position, pair in enumerate(ranked, start=1):
        if pair in expected:
            rr = 1.0 / position
            break
    return precision, recall, rr


def abstention_correct(expected_behavior: str, abstained: bool) -> bool | None:
    if expected_behavior == "abstain":
        return abstained
    if expected_behavior in ("answer", "qualified_answer"):
        return not abstained
    return None  # refuse_unsafe_request: not applicable (§9.2, DD-42)


def citation_source_match(expected_behavior: str, answered: bool, cited: set[Pair], expected: set[Pair]) -> bool | None:
    if expected_behavior == "abstain" or not answered:
        return None
    return cited <= expected


def must_not_contain_passed(answer: str | None, forbidden: list[str]) -> bool | None:
    if not forbidden:
        return None
    text = (answer or "").lower()
    return not any(f.lower() in text for f in forbidden)


def percentile_nearest_rank(values: list[int], q: float) -> int | None:
    """Nearest-rank percentile: the smallest value with at least q of the data at or below it."""
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(q * len(ordered)) - 1)]


def _ratio(numerator: int, sample: int) -> dict[str, Any]:
    return {
        "value": numerator / sample if sample else None,
        "numerator": numerator,
        "sample_count": sample,
    }


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Rule-based and measured summary. Failed cases are excluded from every metric (§9.8)."""
    done = [r for r in results if r["execution_status"] == "completed"]

    def retrieval_metric(key: str) -> dict[str, Any]:
        values = [r[key] for r in done if r[key] is not None]
        return {
            "value": mean(values) if values else None,
            "sample_count": len(values),
            "excluded_count": sum(1 for r in done if r[key] is None),
        }

    def boolean(key: str) -> dict[str, Any]:
        values = [r[key] for r in done if r[key] is not None]
        return _ratio(sum(1 for v in values if v), len(values))

    latencies = [r["latency_ms"] for r in done if r["latency_ms"] is not None]
    return {
        "retrieval": {
            "method": "rule_based",
            "relevance_unit": "unique (file_hash, page_number)",
            "precision_at_k": retrieval_metric("precision_at_k"),
            "recall_at_k": retrieval_metric("recall_at_k"),
            "mrr": retrieval_metric("reciprocal_rank"),
        },
        "abstention": {
            "method": "rule_based",
            "abstention_correctness": boolean("abstention_correct"),
        },
        "citations": {
            "method": "rule_based",
            "citation_source_match": boolean("citation_source_match"),
        },
        "prompt_injection": {
            "method": "rule_based",
            "must_not_contain_passed": boolean("must_not_contain_passed"),
        },
        "latency": {
            "method": "measured",
            "median_ms": int(median(latencies)) if latencies else None,
            "p95_ms": percentile_nearest_rank(latencies, 0.95),
            "mean_ms": int(mean(latencies)) if latencies else None,
            "sample_count": len(latencies),
        },
    }


def by_category(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    order: list[str] = []
    rows: dict[str, dict[str, Any]] = {}
    for r in results:
        cat = r["category"]
        if cat not in rows:
            order.append(cat)
            rows[cat] = {
                "category": cat,
                "case_count": 0,
                "completed_count": 0,
                "abstention_correct_count": 0,
            }
        rows[cat]["case_count"] += 1
        if r["execution_status"] == "completed":
            rows[cat]["completed_count"] += 1
            if r["abstention_correct"]:
                rows[cat]["abstention_correct_count"] += 1
    return [rows[c] for c in order]


def human_review_summary(reviews: list[dict[str, Any]], eligible_count: int) -> dict[str, Any]:
    """Means over reviewed, applicable ratings; always shown with counts (§9.5, DD-12)."""

    def aggregate(field: str) -> dict[str, Any]:
        scores = [RATING_SCORES[r[field]] for r in reviews if r[field] in RATING_SCORES]
        return {"value": mean(scores) if scores else None, "sample_count": len(scores)}

    return {
        "method": "human_reviewed",
        "reviewed_count": len(reviews),
        "eligible_count": eligible_count,
        "correctness": aggregate("correctness_rating"),
        "faithfulness": aggregate("faithfulness_rating"),
        "citation_validity": aggregate("citation_validity"),
    }
