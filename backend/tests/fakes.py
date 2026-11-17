"""Deterministic test doubles: no model download and no Groq calls."""

import hashlib
import math
import re
from collections.abc import Callable
from pathlib import Path

import pymupdf

from app.services.llm_service import LlmError, LlmResponse, ModelAnswer

_WORD = re.compile(r"\S+")


class FakeEmbedder:
    """Bag-of-words hashing embedder: texts sharing words get close vectors."""

    model_id = "fake/bag-of-words"
    dimension = 64
    max_seq_length = 256

    def __init__(self, _model_id: str = "") -> None:
        self.encode_calls = 0

    def token_offsets(self, text: str) -> list[tuple[int, int]]:
        return [m.span() for m in _WORD.finditer(text)]

    def encode(self, texts: list[str], batch_size: int = 32) -> list[list[float]]:
        self.encode_calls += 1
        vectors = []
        for text in texts:
            v = [0.0] * self.dimension
            for word in re.findall(r"[a-z0-9]+", text.lower()):
                v[int(hashlib.md5(word.encode()).hexdigest(), 16) % self.dimension] += 1.0
            norm = math.sqrt(sum(x * x for x in v)) or 1.0
            vectors.append([x / norm for x in v])
        return vectors


Behaviour = Callable[[list[dict[str, str]]], LlmResponse]


class FakeLlm:
    """Scriptable LLM: by default cites the first supplied source."""

    def __init__(self, behaviour: Behaviour | None = None) -> None:
        self.calls = 0
        self.behaviour = behaviour
        self.structured_output_mode = "strict"
        self.model = "fake-llm"

    def generate(self, messages: list[dict[str, str]]) -> LlmResponse:
        self.calls += 1
        if self.behaviour is not None:
            return self.behaviour(messages)
        return answer("The documents say so [S1].", ["S1"])


def answer(text: str, cited: list[str], *, insufficient: bool = False, flag: bool = False) -> LlmResponse:
    return LlmResponse(
        answer=ModelAnswer(
            answer=text,
            insufficient_evidence=insufficient,
            cited_sources=cited,
            flag_for_review=flag,
            review_reason="conflict" if flag else None,
        ),
        model_name="fake-llm",
        prompt_tokens=10,
        completion_tokens=5,
        duration_ms=3,
    )


def failing(code: str, *, transient: bool = False, retry_after: float | None = None) -> Behaviour:
    def behaviour(_: list[dict[str, str]]) -> LlmResponse:
        raise LlmError(code, f"{code} for test", transient=transient, retry_after=retry_after)

    return behaviour


def make_pdf(path: Path, pages: list[str]) -> Path:
    """Writes a PDF with one text block per page; an empty string makes a blank page."""
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        if text:
            page.insert_textbox(pymupdf.Rect(50, 50, 550, 800), text, fontsize=10)
    doc.save(path)
    doc.close()
    return path
