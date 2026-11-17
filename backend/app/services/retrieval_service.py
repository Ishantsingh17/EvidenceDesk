"""Semantic retrieval, independent of answer generation (TRD §8 steps 3–5).

Only fully indexed documents (`completed`, `completed_with_warnings`) are searched (DD-17);
deleted documents have no rows and no vectors, so they can never be retrieved.
"""

import sqlite3
import time
from dataclasses import dataclass

from app.services.embedding_service import Embedder
from app.services.vector_store import Candidate, VectorStore

SEARCHABLE = ("completed", "completed_with_warnings")


@dataclass
class RetrievalResult:
    candidates: list[Candidate]  # top-k in rank order, before the evidence threshold
    retained: list[Candidate]  # candidates that pass the threshold (all, if uncalibrated)
    threshold_applied: bool
    max_distance: float | None
    query_embedding_ms: int
    retrieval_ms: int


def searchable_document_ids(conn: sqlite3.Connection, only: list[str] | None = None) -> list[str]:
    rows = conn.execute(
        f"SELECT id FROM documents WHERE status IN {SEARCHABLE!r}"  # constant tuple, not user input
    ).fetchall()
    ids = [r["id"] for r in rows]
    if only is not None:
        allowed = set(only)
        ids = [i for i in ids if i in allowed]
    return ids


def apply_threshold(candidates: list[Candidate], max_distance: float | None) -> list[Candidate]:
    """Cosine distance: lower is closer. No threshold configured means every candidate is kept."""
    if max_distance is None:
        return list(candidates)
    return [c for c in candidates if c.distance <= max_distance]


def retrieve(
    embedder: Embedder,
    store: VectorStore,
    question: str,
    document_ids: list[str],
    top_k: int,
    max_distance: float | None,
) -> RetrievalResult:
    t0 = time.perf_counter()
    embedding = embedder.encode([question])[0]
    t1 = time.perf_counter()
    candidates = store.query(embedding, top_k, document_ids)
    t2 = time.perf_counter()
    return RetrievalResult(
        candidates=candidates,
        retained=apply_threshold(candidates, max_distance),
        threshold_applied=max_distance is not None,
        max_distance=max_distance,
        query_embedding_ms=int((t1 - t0) * 1000),
        retrieval_ms=int((t2 - t1) * 1000),
    )
