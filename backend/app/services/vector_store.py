"""ChromaDB PersistentClient collection with the embedding-model guard (schema §4, D-16, D-26).

Vectors are always supplied by our embedder; Chroma's own embedding function is disabled
so a second model can never be mixed into the collection.
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import chromadb
from chromadb.config import Settings as ChromaSettings

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1


@dataclass(frozen=True)
class Candidate:
    chunk_id: str
    document_id: str
    file_hash: str
    filename: str
    page_number: int
    chunk_index: int
    distance: float  # cosine distance, lower is closer
    text: str


class ModelMismatchError(RuntimeError):
    """The collection was built with a different embedding model or dimension."""


class VectorStore:
    def __init__(self, persist_dir: Path, collection_name: str, model_id: str, dimension: int):
        persist_dir.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(
            path=str(persist_dir), settings=ChromaSettings(anonymized_telemetry=False)
        )
        self._collection = self._client.get_or_create_collection(
            name=collection_name,
            configuration={"hnsw": {"space": "cosine"}},
            metadata={
                "embedding_model": model_id,
                "embedding_dimension": dimension,
                "schema_version": SCHEMA_VERSION,
            },
            embedding_function=None,
        )
        meta = self._collection.metadata or {}
        if meta.get("embedding_model") != model_id or int(meta.get("embedding_dimension", -1)) != dimension:
            raise ModelMismatchError(
                f"collection built with {meta.get('embedding_model')} ({meta.get('embedding_dimension')})"
            )

    def add(
        self,
        ids: list[str],
        embeddings: list[list[float]],
        documents: list[str],
        metadatas: list[dict[str, Any]],
    ) -> None:
        self._collection.add(ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas)

    def delete_document(self, document_id: str) -> None:
        self._collection.delete(where={"document_id": document_id})

    def count(self) -> int:
        return self._collection.count()

    def count_document(self, document_id: str) -> int:
        return len(self._collection.get(where={"document_id": document_id}, include=[])["ids"])

    def query(self, embedding: list[float], top_k: int, document_ids: list[str]) -> list[Candidate]:
        """Nearest chunks, restricted to the given searchable documents (DD-17)."""
        if not document_ids:
            return []
        where: dict[str, Any] = (
            {"document_id": document_ids[0]} if len(document_ids) == 1 else {"document_id": {"$in": document_ids}}
        )
        result = self._collection.query(
            query_embeddings=[embedding],
            n_results=top_k,
            where=where,
            include=["documents", "metadatas", "distances"],
        )
        candidates: list[Candidate] = []
        for chunk_id, text, meta, distance in zip(
            result["ids"][0],
            result["documents"][0],
            result["metadatas"][0],
            result["distances"][0],
            strict=True,
        ):
            candidates.append(
                Candidate(
                    chunk_id=chunk_id,
                    document_id=str(meta["document_id"]),
                    file_hash=str(meta["file_hash"]),
                    filename=str(meta["filename"]),
                    page_number=int(meta["page_number"]),
                    chunk_index=int(meta["chunk_index"]),
                    distance=float(distance),
                    text=text or "",
                )
            )
        return candidates


def chunk_id_for(document_id: str, page_number: int, chunk_index: int) -> str:
    """Deterministic chunk ID (schema §4.2)."""
    return f"{document_id}:p{page_number}:c{chunk_index}"
