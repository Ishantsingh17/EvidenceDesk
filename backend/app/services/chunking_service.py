"""Token-aware, per-page chunking with the embedding model's tokenizer (TRD §7.2 step 4)."""

from dataclasses import dataclass

from app.core.errors import AppError
from app.services.embedding_service import Embedder
from app.services.pdf_service import ExtractedPage

# [CLS] and [SEP] are added by the model at encode time.
SPECIAL_TOKENS = 2


@dataclass(frozen=True)
class Chunk:
    chunk_index: int  # position within the document
    page_number: int  # one-based; a chunk never spans pages
    text: str
    token_count: int


def validate_chunk_settings(embedder: Embedder, size: int, overlap: int) -> None:
    if overlap >= size:
        raise AppError("CHUNKING_FAILED", "Chunk overlap must be smaller than the chunk size.", 500)
    if size + SPECIAL_TOKENS > embedder.max_seq_length:
        # Prevents silent truncation inside the embedding model.
        raise AppError(
            "CHUNKING_FAILED",
            f"Chunk size {size} does not fit the model's {embedder.max_seq_length}-token limit.",
            500,
        )


def chunk_pages(
    pages: list[ExtractedPage], embedder: Embedder, size: int, overlap: int
) -> tuple[list[Chunk], dict[int, tuple[int, int]]]:
    """Returns the chunks and, per page number, (token_count, chunk_count)."""
    validate_chunk_settings(embedder, size, overlap)
    chunks: list[Chunk] = []
    per_page: dict[int, tuple[int, int]] = {}
    step = size - overlap
    for page in pages:
        if not page.text:
            per_page[page.page_number] = (0, 0)
            continue
        spans = embedder.token_offsets(page.text)
        before = len(chunks)
        start = 0
        while start < len(spans):
            window = spans[start : start + size]
            text = page.text[window[0][0] : window[-1][1]].strip()
            if text:
                chunks.append(
                    Chunk(
                        chunk_index=len(chunks),
                        page_number=page.page_number,
                        text=text,
                        token_count=len(window),
                    )
                )
            if start + size >= len(spans):
                break
            start += step
        per_page[page.page_number] = (len(spans), len(chunks) - before)
    return chunks, per_page
