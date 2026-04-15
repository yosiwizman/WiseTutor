"""Qdrant adoption v1 — indexing + query-time retrieval proof.

Exercises the real LlamaIndexPipeline in ``vector_backend="qdrant"``
mode against an on-disk Qdrant store. No Docker, no external service,
no network. CI-safe.

The embedding model is replaced with ``MockEmbedding`` at test time
because the goal of this slice is to prove the *vector-store
integration* path — that a Qdrant-backed KB can be indexed, that
vectors land in a real Qdrant collection, and that retrieval pulls
the ingested text back out. Live embedding quality is a separate
concern covered by the already-proven local Ollama path in prior
PDF/URL ingestion slices.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from llama_index.core import Settings
from llama_index.core.embeddings.mock_embed_model import MockEmbedding

from deeptutor.services.rag.factory import (
    get_pipeline,
    has_pipeline,
    list_pipelines,
    normalize_provider_name,
)
from deeptutor.services.rag.pipelines.llamaindex import LlamaIndexPipeline


@pytest.fixture(autouse=True)
def _mock_embeddings(monkeypatch):
    """Replace the network-dependent embedding model and connectivity
    probe with deterministic mocks so the test runs offline."""
    mock = MockEmbedding(embed_dim=16)
    monkeypatch.setattr(Settings, "embed_model", mock, raising=False)

    async def _noop(self):  # _verify_embedding_connectivity
        return None

    monkeypatch.setattr(
        LlamaIndexPipeline, "_verify_embedding_connectivity", _noop
    )

    # Prevent _configure_settings from overwriting the mock
    monkeypatch.setattr(LlamaIndexPipeline, "_configure_settings", lambda self: None)
    yield


def _write_text_source(dir_: Path, name: str, text: str) -> Path:
    p = dir_ / name
    p.write_text(text, encoding="utf-8")
    return p


def test_qdrant_provider_is_registered():
    assert has_pipeline("qdrant") is True
    assert normalize_provider_name("qdrant") == "qdrant"
    ids = [p["id"] for p in list_pipelines()]
    assert "qdrant" in ids


def test_qdrant_backed_kb_indexes_and_retrieves(tmp_path: Path):
    """Caller-owned KB using Qdrant ingests one source, indexes to
    Qdrant, and a query-time retrieval returns the ingested text."""
    kb_base = tmp_path / "mrw_kb_root"
    kb_base.mkdir()
    kb_name = "qdrant_adoption_v1"
    kb_dir = kb_base / kb_name
    kb_dir.mkdir()
    raw_dir = kb_dir / "raw"
    raw_dir.mkdir()

    needle = "BRIDGETON is the capital of fictionland."
    haystack = (
        "Cats are smaller than elephants. "
        "Oceans cover most of the planet. "
        "The library closes at nine."
    )
    _write_text_source(raw_dir, "needle.txt", needle)
    _write_text_source(raw_dir, "haystack.txt", haystack)

    pipeline = get_pipeline("qdrant", kb_base_dir=str(kb_base))
    assert isinstance(pipeline, LlamaIndexPipeline)
    assert pipeline.vector_backend == "qdrant"

    ok = asyncio.run(
        pipeline.initialize(
            kb_name,
            [str(raw_dir / "needle.txt"), str(raw_dir / "haystack.txt")],
        )
    )
    assert ok is True, "Qdrant-backed initialize must succeed"

    # Proof A: a real Qdrant on-disk collection exists with vectors in it.
    qdrant_dir = kb_dir / "qdrant_storage"
    assert qdrant_dir.exists(), f"expected {qdrant_dir} to exist"

    from qdrant_client import QdrantClient

    client = QdrantClient(path=str(qdrant_dir))
    try:
        collection_name = pipeline._qdrant_collection_name(kb_name)
        collections = [c.name for c in client.get_collections().collections]
        assert collection_name in collections, collections
        count = client.count(collection_name=collection_name, exact=True).count
        assert count >= 1, f"expected >= 1 vector, got {count}"
    finally:
        client.close()

    # Proof B: query-time retrieval pulls the ingested text back.
    result = asyncio.run(pipeline.search(query="BRIDGETON capital", kb_name=kb_name))
    assert result.get("provider") == "llamaindex"
    sources_text = " ".join(s.get("content", "") for s in result.get("sources", []))
    assert "BRIDGETON" in sources_text or "BRIDGETON" in result.get("content", ""), (
        result
    )


def test_qdrant_add_documents_extends_existing_index(tmp_path: Path):
    kb_base = tmp_path / "root"
    kb_base.mkdir()
    kb_name = "qdrant_extend"
    kb_dir = kb_base / kb_name
    raw_dir = kb_dir / "raw"
    raw_dir.mkdir(parents=True)

    _write_text_source(raw_dir, "a.txt", "alpha content one")
    pipeline = get_pipeline("qdrant", kb_base_dir=str(kb_base))
    assert asyncio.run(pipeline.initialize(kb_name, [str(raw_dir / "a.txt")])) is True

    # Extend.
    _write_text_source(raw_dir, "b.txt", "beta content two BETAMARK")
    assert (
        asyncio.run(pipeline.add_documents(kb_name, [str(raw_dir / "b.txt")]))
        is True
    )

    from qdrant_client import QdrantClient

    client = QdrantClient(path=str(kb_dir / "qdrant_storage"))
    try:
        collection_name = pipeline._qdrant_collection_name(kb_name)
        count = client.count(collection_name=collection_name, exact=True).count
        assert count >= 2, f"expected >= 2 vectors after extend, got {count}"
    finally:
        client.close()

    result = asyncio.run(pipeline.search(query="BETAMARK", kb_name=kb_name))
    joined = " ".join(s.get("content", "") for s in result.get("sources", []))
    assert "BETAMARK" in joined or "BETAMARK" in result.get("content", ""), result


def test_qdrant_scope_is_per_kb_directory(tmp_path: Path):
    """Foreign user (different per-user kb_base_dir) cannot reach the
    caller's Qdrant-backed KB — scoping is filesystem-enforced by the
    existing per-user manager contract."""
    mrw_base = tmp_path / "mrw_kbs"
    bella_base = tmp_path / "bella_kbs"
    mrw_base.mkdir()
    bella_base.mkdir()

    kb_name = "owner_only_kb"
    mrw_kb = mrw_base / kb_name
    (mrw_kb / "raw").mkdir(parents=True)
    _write_text_source(mrw_kb / "raw", "s.txt", "SECRETCANARY known only to mrw")

    pipeline_mrw = get_pipeline("qdrant", kb_base_dir=str(mrw_base))
    assert asyncio.run(
        pipeline_mrw.initialize(kb_name, [str(mrw_kb / "raw" / "s.txt")])
    ) is True

    # Bella's per-user manager points at a different kb_base_dir. The
    # same kb_name under her root does not exist on disk, so a
    # pipeline bound to her root sees no storage and retrieval must
    # return the "no documents indexed" shape — NOT the owner's data.
    # Fresh pipeline instance because the factory caches per-base-dir.
    pipeline_bella = LlamaIndexPipeline(
        kb_base_dir=str(bella_base), vector_backend="qdrant"
    )
    result = asyncio.run(pipeline_bella.search(query="SECRETCANARY", kb_name=kb_name))
    assert result.get("content") == "" or "No documents indexed" in result.get(
        "answer", ""
    ), result


def test_default_backend_still_works(tmp_path: Path):
    """Existing (non-Qdrant) LlamaIndex path is not regressed."""
    kb_base = tmp_path / "default_root"
    kb_base.mkdir()
    kb_name = "default_kb"
    kb_dir = kb_base / kb_name
    raw_dir = kb_dir / "raw"
    raw_dir.mkdir(parents=True)
    _write_text_source(raw_dir, "x.txt", "DEFAULTMARK present in this document")

    pipeline = get_pipeline("llamaindex", kb_base_dir=str(kb_base))
    assert asyncio.run(pipeline.initialize(kb_name, [str(raw_dir / "x.txt")])) is True
    assert (kb_dir / "llamaindex_storage" / "docstore.json").exists()
    result = asyncio.run(pipeline.search(query="DEFAULTMARK", kb_name=kb_name))
    joined = " ".join(s.get("content", "") for s in result.get("sources", []))
    assert "DEFAULTMARK" in joined or "DEFAULTMARK" in result.get("content", ""), (
        result
    )
