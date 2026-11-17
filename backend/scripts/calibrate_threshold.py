"""Calibrates RETRIEVAL_MAX_DISTANCE on the labelled dataset (D-24, TRD §7.4).

Indexes the committed sample corpus with the real embedding model and production chunking
settings into a throwaway ChromaDB, runs every v1.1.0 question through retrieval only (no
LLM), and prints the cosine distances per case plus the threshold the method selects.

Method: the threshold is the smallest distance that still keeps at least one expected
(document, page) chunk for every case that should be answered. A larger value lets more
off-topic questions reach the LLM; a smaller value would wrongly abstain on a labelled
answerable case. Cases whose top-k contains no expected page cannot be helped by any
threshold and are reported separately.

Usage (from backend/):  .venv\\Scripts\\python.exe -m scripts.calibrate_threshold
"""

import json
import math
import sys
import tempfile
from pathlib import Path

from app.core.config import PROJECT_ROOT, Settings
from app.schemas.evaluation_dataset import EvaluationSeed
from app.services.chunking_service import chunk_pages
from app.services.embedding_service import SentenceTransformerEmbedder
from app.services.pdf_service import extract_pages
from app.services.vector_store import VectorStore, chunk_id_for

DATASET = "ap-policies-v1.1.0.json"


def main() -> int:
    settings = Settings()
    seed = EvaluationSeed.model_validate_json((settings.evaluation_dataset_dir / DATASET).read_bytes())
    embedder = SentenceTransformerEmbedder(settings.embedding_model)
    top_k = settings.retrieval_top_k
    hash_by_key = {d.document_key: d.file_hash for d in seed.documents}

    # ChromaDB keeps index files open on Windows, so cleanup errors are ignored.
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        store = VectorStore(Path(tmp), "calibration", embedder.model_id, embedder.dimension)
        for doc in seed.documents:
            pages = extract_pages(PROJECT_ROOT / "sample-corpus" / doc.filename, settings.min_page_text_chars)
            chunks, _ = chunk_pages(pages, embedder, settings.chunk_size_tokens, settings.chunk_overlap_tokens)
            ids = [chunk_id_for(doc.document_key, c.page_number, c.chunk_index) for c in chunks]
            store.add(
                ids,
                embedder.encode([c.text for c in chunks]),
                [c.text for c in chunks],
                [
                    {"document_id": doc.document_key, "chunk_id": i, "filename": doc.filename,
                     "page_number": c.page_number, "chunk_index": c.chunk_index, "file_hash": doc.file_hash,
                     "embedding_model": embedder.model_id, "created_at": ""}
                    for i, c in zip(ids, chunks, strict=True)
                ],
            )
        all_docs = [d.document_key for d in seed.documents]
        rows = []
        for case in seed.cases:
            expected = {(hash_by_key[s.document_key], s.page_number) for s in case.expected_sources}
            candidates = store.query(embedder.encode([case.question])[0], top_k, all_docs)
            relevant = [c.distance for c in candidates if (c.file_hash, c.page_number) in expected]
            rows.append({
                "case_key": case.case_key,
                "category": case.category,
                "expected_behavior": case.expected_behavior,
                "top1_distance": round(candidates[0].distance, 4) if candidates else None,
                "best_relevant_distance": round(min(relevant), 4) if relevant else None,
                "distances": [round(c.distance, 4) for c in candidates],
            })

    must_keep = [r for r in rows if r["expected_behavior"] in ("answer", "qualified_answer")]
    covered = [r for r in must_keep if r["best_relevant_distance"] is not None]
    missed = [r["case_key"] for r in must_keep if r["best_relevant_distance"] is None]
    boundary = max(r["best_relevant_distance"] for r in covered)
    threshold = math.ceil(boundary * 100) / 100  # two decimals, rounded up so the boundary case passes
    gated = [r["case_key"] for r in rows if r["expected_behavior"] == "abstain" and r["top1_distance"] > threshold]
    report = {
        "dataset": f"{seed.dataset.name} {seed.dataset.version}",
        "embedding_model": embedder.model_id,
        "chunking": [settings.chunk_size_tokens, settings.chunk_overlap_tokens],
        "top_k": top_k,
        "cases": rows,
        "answerable_cases": len(must_keep),
        "answerable_cases_without_expected_page_in_top_k": missed,
        "boundary_best_relevant_distance": boundary,
        "selected_threshold": threshold,
        "abstain_cases_rejected_by_threshold": gated,
        "abstain_cases": [r["case_key"] for r in rows if r["expected_behavior"] == "abstain"],
    }
    json.dump(report, sys.stdout, indent=2)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
