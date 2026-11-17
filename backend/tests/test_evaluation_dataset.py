"""Validates the committed evaluation seed datasets against schema §8 and the real corpus."""

import hashlib
import json
from collections import Counter
from pathlib import Path

import pymupdf
import pytest
from pydantic import ValidationError

from app.core.config import PROJECT_ROOT, Settings
from app.schemas.evaluation_dataset import ALLOWED_BEHAVIORS, EvaluationSeed

DATASET_DIR = Settings(_env_file=None).evaluation_dataset_dir
CORPUS_DIR = PROJECT_ROOT / "sample-corpus"
V100 = DATASET_DIR / "ap-policies-v1.0.0.json"
V110 = DATASET_DIR / "ap-policies-v1.1.0.json"
# v1.0.0 is immutable (DD-14): this is its SHA-256 as committed in 819a596.
V100_SHA256 = "0fbe38636a09a387ebe19d837a43230e66d93398d6ec4a0fef33f3b903c38727"
# v1.1.0 is published (DD-42): any change needs a new version, not an edit.
V110_SHA256 = "0cbe2ab59e4da729ba2a6ba67a397f429c08ed8015a101c5d56d433ff8156c27"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture(scope="module")
def seed() -> EvaluationSeed:
    return EvaluationSeed.model_validate_json(V110.read_text(encoding="utf-8"))


def test_v110_matches_the_schema_and_metadata(seed: EvaluationSeed) -> None:
    assert sha256_file(V110) == V110_SHA256
    assert seed.dataset.name == "ap-policies"
    assert seed.dataset.version == "1.1.0"
    assert V110.name == f"{seed.dataset.name}-v{seed.dataset.version}.json"
    assert len(seed.cases) == 20
    assert len(seed.documents) == 7


def test_v110_covers_every_category_with_allowed_behaviours(seed: EvaluationSeed) -> None:
    counts = Counter(c.category for c in seed.cases)
    assert counts == {
        "direct": 5,
        "multi_document": 3,
        "ambiguous": 2,
        "conflicting_documents": 3,
        "unanswerable": 3,
        "out_of_scope": 2,
        "prompt_injection": 2,
    }
    for case in seed.cases:
        assert case.expected_behavior in ALLOWED_BEHAVIORS[case.category]


def test_behaviour_decisions_for_the_three_former_mismatches(seed: EvaluationSeed) -> None:
    by_key = {c.case_key: c for c in seed.cases}
    assert by_key["AP-AMB-001"].expected_behavior == "qualified_answer"
    assert by_key["AP-AMB-002"].expected_behavior == "qualified_answer"
    assert by_key["AP-PI-002"].expected_behavior == "refuse_unsafe_request"
    # Document-level injection where the user only asks whether to comply is answered, not refused.
    assert by_key["AP-PI-001"].expected_behavior == "answer"


def test_document_hashes_match_the_committed_pdfs(seed: EvaluationSeed) -> None:
    for doc in seed.documents:
        pdf = CORPUS_DIR / doc.filename
        assert pdf.is_file(), doc.filename
        assert sha256_file(pdf) == doc.file_hash, doc.filename


def test_corpus_hash_manifest_agrees(seed: EvaluationSeed) -> None:
    manifest = {}
    for line in (PROJECT_ROOT / "evaluation" / "corpus-hashes.sha256").read_text().splitlines():
        digest, path = line.split(maxsplit=1)
        manifest[Path(path).name] = digest
    assert manifest == {d.filename: d.file_hash for d in seed.documents}


def test_every_expected_page_exists_in_its_pdf(seed: EvaluationSeed) -> None:
    page_counts = {}
    for doc in seed.documents:
        with pymupdf.open(CORPUS_DIR / doc.filename) as pdf:
            page_counts[doc.document_key] = pdf.page_count
    for case in seed.cases:
        for source in case.expected_sources:
            assert 1 <= source.page_number <= page_counts[source.document_key], (
                case.case_key,
                source,
            )


def test_forbidden_strings_are_absent_from_reference_answers(seed: EvaluationSeed) -> None:
    for case in seed.cases:
        answer = (case.expected_answer or "").lower()
        for forbidden in case.must_not_contain:
            assert forbidden.lower() not in answer, (case.case_key, forbidden)


def test_v110_keeps_the_same_questions_as_v100(seed: EvaluationSeed) -> None:
    original = json.loads(V100.read_text(encoding="utf-8"))
    assert [(c["case_id"], c["question"], c["category"]) for c in original["cases"]] == [
        (c.case_key, c.question, c.category) for c in seed.cases
    ]


def test_v100_is_unchanged_and_does_not_match_the_schema() -> None:
    assert sha256_file(V100) == V100_SHA256
    with pytest.raises(ValidationError):
        EvaluationSeed.model_validate_json(V100.read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        (lambda d: d["cases"][0].update(case_id="X"), "Extra inputs"),
        (lambda d: d["cases"][0].update(expected_behavior="clarify"), "expected_behavior"),
        (
            lambda d: d["cases"][13]["expected_sources"].append({"document_key": "ap_sop", "page_number": 1}),
            "abstain",
        ),
        (
            lambda d: d["cases"][0]["expected_sources"][0].update(page_number=0),
            "greater than or equal to 1",
        ),
        (
            lambda d: d["cases"][0]["expected_sources"][0].update(document_key="nope"),
            "unknown document_key",
        ),
        (lambda d: d["cases"][19].update(must_not_contain=[]), "must_not_contain"),
        (lambda d: d["documents"][0].update(file_hash="ABC"), "String should match pattern"),
    ],
)
def test_validator_rejects_schema_violations(mutation, message: str) -> None:
    data = json.loads(V110.read_text(encoding="utf-8"))
    mutation(data)
    with pytest.raises(ValidationError, match=message):
        EvaluationSeed.model_validate(data)
