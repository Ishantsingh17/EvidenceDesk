"""PDF validation and page-by-page text extraction with PyMuPDF (TRD §7)."""

import re
from dataclasses import dataclass
from pathlib import Path

import pymupdf

from app.core.errors import AppError

_WHITESPACE = re.compile(r"\s+")


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int  # one-based
    text: str  # whitespace-normalised page text
    char_count: int
    word_count: int
    text_status: str  # ok | low_text | no_text


def normalise(text: str) -> str:
    return _WHITESPACE.sub(" ", text).strip()


def validate_pdf(path: Path) -> int:
    """Opens the file with PyMuPDF and returns the page count, or raises PDF_PARSE_FAILED."""
    try:
        # Opened from memory so a broken file never leaves a handle that blocks its cleanup on Windows.
        with pymupdf.open(stream=path.read_bytes(), filetype="pdf") as doc:
            if doc.needs_pass or doc.is_encrypted:
                raise AppError("PDF_PARSE_FAILED", "The PDF is encrypted.", 422)
            if doc.page_count < 1:
                raise AppError("PDF_PARSE_FAILED", "The PDF has no pages.", 422)
            return doc.page_count
    except AppError:
        raise
    except Exception as exc:  # PyMuPDF raises several error types for broken files
        raise AppError("PDF_PARSE_FAILED", "The PDF could not be read.", 422) from exc


def extract_pages(path: Path, min_page_text_chars: int) -> list[ExtractedPage]:
    """Extracts each page separately so every chunk keeps one unambiguous page number."""
    pages: list[ExtractedPage] = []
    with pymupdf.open(path) as doc:
        for index, page in enumerate(doc, start=1):
            text = normalise(page.get_text("text"))
            chars = len(text)
            if chars == 0:
                status = "no_text"
            elif chars < min_page_text_chars:
                status = "low_text"
            else:
                status = "ok"
            pages.append(
                ExtractedPage(
                    page_number=index,
                    text=text,
                    char_count=chars,
                    word_count=len(text.split()) if text else 0,
                    text_status=status,
                )
            )
    return pages
