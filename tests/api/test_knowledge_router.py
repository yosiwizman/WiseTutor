from __future__ import annotations

import importlib
from pathlib import Path

import pytest

try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
except Exception:  # pragma: no cover - optional dependency in lightweight envs
    FastAPI = None
    TestClient = None

pytestmark = pytest.mark.skipif(FastAPI is None or TestClient is None, reason="fastapi not installed")

if FastAPI is not None and TestClient is not None:
    knowledge_router_module = importlib.import_module("deeptutor.api.routers.knowledge")
    router = knowledge_router_module.router
else:  # pragma: no cover - optional dependency in lightweight envs
    knowledge_router_module = None
    router = None


def _build_app() -> FastAPI:
    if FastAPI is None or router is None:  # pragma: no cover - guarded by pytestmark
        raise RuntimeError("fastapi is not installed")
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/knowledge")
    return app


class _FakeKBManager:
    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.config_file = self.base_dir / "kb_config.json"
        self.config: dict[str, dict] = {"knowledge_bases": {}}

    def _load_config(self) -> dict:
        return self.config

    def _save_config(self) -> None:
        pass

    def list_knowledge_bases(self) -> list[str]:
        return sorted(self.config.get("knowledge_bases", {}).keys())

    def update_kb_status(self, name: str, status: str, progress: dict | None = None) -> None:
        entry = self.config.setdefault("knowledge_bases", {}).setdefault(name, {"path": name})
        entry["status"] = status
        entry["progress"] = progress or {}

    def get_knowledge_base_path(self, name: str) -> Path:
        kb_dir = self.base_dir / name
        kb_dir.mkdir(parents=True, exist_ok=True)
        return kb_dir


class _FakeInitializer:
    def __init__(self, kb_name: str, base_dir: str, **_kwargs) -> None:
        self.kb_name = kb_name
        self.base_dir = base_dir
        self.kb_dir = Path(base_dir) / kb_name
        self.raw_dir = self.kb_dir / "raw"
        self.progress_tracker = _kwargs.get("progress_tracker")

    def create_directory_structure(self) -> None:
        self.raw_dir.mkdir(parents=True, exist_ok=True)

    def _register_to_config(self) -> None:
        pass


def _upload_payload() -> list[tuple[str, tuple[str, bytes, str]]]:
    return [("files", ("demo.txt", b"hello", "text/plain"))]


def test_rag_providers_returns_llamaindex_and_qdrant() -> None:
    with TestClient(_build_app()) as client:
        response = client.get("/api/v1/knowledge/rag-providers")

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "providers": [
            {
                "id": "llamaindex",
                "name": "LlamaIndex",
                "description": "Pure vector retrieval, fastest processing speed.",
            },
            {
                "id": "qdrant",
                "name": "LlamaIndex + Qdrant",
                "description": (
                    "LlamaIndex ingestion with a Qdrant vector store "
                    "(on-disk local mode by default)."
                ),
            },
        ]
    }


def test_create_kb_does_not_require_llm_precheck(monkeypatch, tmp_path: Path) -> None:
    manager = _FakeKBManager(tmp_path / "knowledge_bases")
    monkeypatch.setattr(knowledge_router_module, "get_kb_manager", lambda *_a, **_k: manager)
    monkeypatch.setattr(knowledge_router_module, "_require_uid", lambda *_a, **_k: "test-uid")
    monkeypatch.setattr(knowledge_router_module, "_kb_base_dir_for_user", lambda *_a, **_k: manager.base_dir)
    monkeypatch.setattr(knowledge_router_module, "KnowledgeBaseInitializer", _FakeInitializer)
    monkeypatch.setattr(knowledge_router_module, "get_llm_config", lambda: (_ for _ in ()).throw(RuntimeError("should not be called")), raising=False)

    async def _noop_init_task(*_args, **_kwargs):
        return None

    monkeypatch.setattr(knowledge_router_module, "run_initialization_task", _noop_init_task)
    monkeypatch.setattr(knowledge_router_module, "_kb_base_dir", tmp_path / "knowledge_bases")

    with TestClient(_build_app()) as client:
        response = client.post(
            "/api/v1/knowledge/create",
            data={"name": "kb-new", "rag_provider": "llamaindex"},
            files=_upload_payload(),
        )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "kb-new"
    assert isinstance(body.get("task_id"), str) and body["task_id"]
    assert manager.config["knowledge_bases"]["kb-new"]["rag_provider"] == "llamaindex"
    assert manager.config["knowledge_bases"]["kb-new"]["needs_reindex"] is False


def test_create_rejects_unregistered_provider(monkeypatch, tmp_path: Path) -> None:
    manager = _FakeKBManager(tmp_path / "knowledge_bases")
    monkeypatch.setattr(knowledge_router_module, "get_kb_manager", lambda *_a, **_k: manager)
    monkeypatch.setattr(knowledge_router_module, "_require_uid", lambda *_a, **_k: "test-uid")
    monkeypatch.setattr(knowledge_router_module, "_kb_base_dir_for_user", lambda *_a, **_k: manager.base_dir)
    monkeypatch.setattr(knowledge_router_module, "_kb_base_dir", tmp_path / "knowledge_bases")

    with TestClient(_build_app()) as client:
        response = client.post(
            "/api/v1/knowledge/create",
            data={"name": "kb-invalid", "rag_provider": "lightrag"},
            files=_upload_payload(),
        )

    assert response.status_code == 400
    assert "Unsupported RAG provider" in response.json()["detail"]


def test_upload_returns_409_when_kb_needs_reindex(monkeypatch, tmp_path: Path) -> None:
    manager = _FakeKBManager(tmp_path / "knowledge_bases")
    manager.config["knowledge_bases"]["legacy-kb"] = {
        "path": "legacy-kb",
        "rag_provider": "llamaindex",
        "needs_reindex": True,
        "status": "needs_reindex",
    }
    monkeypatch.setattr(knowledge_router_module, "get_kb_manager", lambda *_a, **_k: manager)
    monkeypatch.setattr(knowledge_router_module, "_require_uid", lambda *_a, **_k: "test-uid")
    monkeypatch.setattr(knowledge_router_module, "_kb_base_dir_for_user", lambda *_a, **_k: manager.base_dir)

    with TestClient(_build_app()) as client:
        response = client.post("/api/v1/knowledge/legacy-kb/upload", files=_upload_payload())

    assert response.status_code == 409
    assert "needs reindex" in response.json()["detail"].lower()


def test_upload_ready_kb_returns_task_id(monkeypatch, tmp_path: Path) -> None:
    manager = _FakeKBManager(tmp_path / "knowledge_bases")
    manager.config["knowledge_bases"]["ready-kb"] = {
        "path": "ready-kb",
        "rag_provider": "llamaindex",
        "needs_reindex": False,
        "status": "ready",
    }
    monkeypatch.setattr(knowledge_router_module, "get_kb_manager", lambda *_a, **_k: manager)
    monkeypatch.setattr(knowledge_router_module, "_require_uid", lambda *_a, **_k: "test-uid")
    monkeypatch.setattr(knowledge_router_module, "_kb_base_dir_for_user", lambda *_a, **_k: manager.base_dir)
    monkeypatch.setattr(knowledge_router_module, "_kb_base_dir", tmp_path / "knowledge_bases")

    async def _noop_upload_task(*_args, **_kwargs):
        return None

    monkeypatch.setattr(knowledge_router_module, "run_upload_processing_task", _noop_upload_task)

    with TestClient(_build_app()) as client:
        response = client.post("/api/v1/knowledge/ready-kb/upload", files=_upload_payload())

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body.get("task_id"), str) and body["task_id"]


def test_ingest_url_writes_staged_artifact_and_queues_task(monkeypatch, tmp_path: Path) -> None:
    """Router-level proof that /ingest-url, given a valid fetch result,
    stages a .txt artifact into raw/ and queues run_upload_processing_task.
    We monkeypatch fetch_public_html to return a canned FetchResult so
    this unit test never hits the network AND never fights the SSRF
    gate (which correctly refuses localhost in the live backend)."""
    from deeptutor.services.ingestion import url_fetch as _uf

    manager = _FakeKBManager(tmp_path / "knowledge_bases")
    manager.config["knowledge_bases"]["ready-kb"] = {
        "path": "ready-kb",
        "rag_provider": "llamaindex",
        "needs_reindex": False,
        "status": "ready",
    }
    monkeypatch.setattr(knowledge_router_module, "get_kb_manager", lambda *_a, **_k: manager)
    monkeypatch.setattr(knowledge_router_module, "_require_uid", lambda *_a, **_k: "test-uid")
    monkeypatch.setattr(knowledge_router_module, "_kb_base_dir_for_user", lambda *_a, **_k: manager.base_dir)

    async def _noop_upload_task(*_args, **_kwargs):
        return None

    queued: list[dict] = []

    def _capture_add_task(func, **kwargs):
        queued.append(kwargs)

    monkeypatch.setattr(knowledge_router_module, "run_upload_processing_task", _noop_upload_task)

    # Canned successful fetch result.
    fake_result = _uf.FetchResult(
        url="https://example.org/article",
        final_url="https://example.org/article",
        title="Article",
        text="Body text line 1.\nBody text line 2.",
        content_type="text/html; charset=utf-8",
    )
    monkeypatch.setattr(_uf, "fetch_public_html", lambda url, **_k: fake_result)

    with TestClient(_build_app()) as client:
        response = client.post(
            "/api/v1/knowledge/ready-kb/ingest-url",
            json={"url": "https://example.org/article"},
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source_url"] == "https://example.org/article"
    assert body["title"] == "Article"
    assert isinstance(body["task_id"], str) and body["task_id"]

    # Staged file lives in the expected per-user KB raw/ dir.
    raw_dir = manager.base_dir / "ready-kb" / "raw"
    assert raw_dir.exists(), f"raw dir was not created at {raw_dir}"
    staged = list(raw_dir.iterdir())
    assert len(staged) == 1, f"expected exactly one staged artifact, got {staged}"
    content = staged[0].read_text(encoding="utf-8")
    assert "Source URL: https://example.org/article" in content
    assert "Body text line 1." in content


def test_ingest_url_rejects_private_host_without_staging(monkeypatch, tmp_path: Path) -> None:
    """Safety regression: the router must NOT write any staged artifact
    or queue any task when the safety gate refuses the URL."""
    manager = _FakeKBManager(tmp_path / "knowledge_bases")
    manager.config["knowledge_bases"]["ready-kb"] = {
        "path": "ready-kb",
        "rag_provider": "llamaindex",
        "needs_reindex": False,
        "status": "ready",
    }
    monkeypatch.setattr(knowledge_router_module, "get_kb_manager", lambda *_a, **_k: manager)
    monkeypatch.setattr(knowledge_router_module, "_require_uid", lambda *_a, **_k: "test-uid")
    monkeypatch.setattr(knowledge_router_module, "_kb_base_dir_for_user", lambda *_a, **_k: manager.base_dir)

    with TestClient(_build_app()) as client:
        response = client.post(
            "/api/v1/knowledge/ready-kb/ingest-url",
            json={"url": "http://127.0.0.1/admin"},
        )
    assert response.status_code == 400
    body = response.json()
    assert body["detail"]["code"] == "unsafe_target"

    # No file should have been staged.
    raw_dir = manager.base_dir / "ready-kb" / "raw"
    assert not raw_dir.exists() or list(raw_dir.iterdir()) == []


def test_update_config_rejects_unregistered_provider() -> None:
    class _FakeConfigService:
        def set_kb_config(self, kb_name: str, config: dict) -> None:
            self.kb_name = kb_name
            self.config = config

        def get_kb_config(self, _kb_name: str) -> dict:
            return {"rag_provider": "llamaindex"}

    fake_service = _FakeConfigService()

    config_module = importlib.import_module("deeptutor.services.config")
    app = _build_app()

    with pytest.MonkeyPatch.context() as monkeypatch:
        monkeypatch.setattr(config_module, "get_kb_config_service", lambda *_a, **_k: fake_service)
        # Knowledge isolation v2 added a per-user import path inside the
        # router for the kb_config service; patch it there too so the
        # unit test's fake_service is honored regardless of which
        # import the router uses.
        monkeypatch.setattr(
            "deeptutor.services.config.knowledge_base_config.get_kb_config_service",
            lambda *_a, **_k: fake_service,
        )
        # The router now requires a session uid; stub it to a fake.
        monkeypatch.setattr(knowledge_router_module, "_require_uid", lambda *_a, **_k: "test-uid")
        with TestClient(app) as client:
            response = client.put(
                "/api/v1/knowledge/demo/config",
                json={"rag_provider": "raganything"},
            )

    assert response.status_code == 400
    assert "Unsupported RAG provider" in response.json()["detail"]
