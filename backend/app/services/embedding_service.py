"""Local embeddings with Sentence Transformers, loaded once (TRD §6.3, D-17).

`Embedder` is the small interface the rest of the backend uses, so tests can inject a
deterministic fake while production uses the real model.
"""

import logging
import threading
from typing import Protocol

logger = logging.getLogger(__name__)


class Embedder(Protocol):
    model_id: str
    dimension: int
    max_seq_length: int

    def token_offsets(self, text: str) -> list[tuple[int, int]]:
        """Character spans of the model's word-piece tokens (no special tokens)."""

    def encode(self, texts: list[str], batch_size: int = 32) -> list[list[float]]:
        """Unit-normalised embeddings, one per text."""


class SentenceTransformerEmbedder:
    """The configured Sentence Transformers model. Load it once per process."""

    def __init__(self, model_id: str) -> None:
        from sentence_transformers import SentenceTransformer  # heavy import, load lazily

        self.model_id = model_id
        self._model = SentenceTransformer(model_id, device="cpu")
        self.dimension = int(self._model.get_embedding_dimension())
        self.max_seq_length = int(self._model.max_seq_length)
        self._tokenizer = self._model.tokenizer
        # torch inference is not guaranteed thread-safe; queries and jobs share one model.
        self._lock = threading.Lock()
        logger.info("Embedding model loaded dimension=%s max_seq=%s", self.dimension, self.max_seq_length)

    def token_offsets(self, text: str) -> list[tuple[int, int]]:
        # Whole pages are tokenized only to find offsets; chunks stay within the model limit, so the
        # "longer than the maximum sequence length" warning does not apply and is silenced.
        encoded = self._tokenizer(
            text, add_special_tokens=False, return_offsets_mapping=True, truncation=False, verbose=False
        )
        return [tuple(span) for span in encoded["offset_mapping"]]

    def encode(self, texts: list[str], batch_size: int = 32) -> list[list[float]]:
        with self._lock:
            vectors = self._model.encode(
                texts,
                batch_size=batch_size,
                normalize_embeddings=True,
                convert_to_numpy=True,
                show_progress_bar=False,
            )
        return [v.tolist() for v in vectors]
