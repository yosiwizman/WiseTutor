from __future__ import annotations

from pathlib import Path

import pytest

from deeptutor.services.config.loader import PROJECT_ROOT, load_config_with_main, resolve_config_path


def test_resolve_config_path_returns_existing_config(tmp_path: Path) -> None:
    settings_dir = tmp_path / "data" / "user" / "settings"
    settings_dir.mkdir(parents=True)
    (settings_dir / "custom.yaml").write_text("system:\n  language: en\n", encoding="utf-8")

    resolved, used_alias = resolve_config_path("custom.yaml", tmp_path)

    assert resolved == settings_dir / "custom.yaml"
    assert used_alias is False


def test_load_config_with_main_loads_named_file_and_injects_runtime_paths(
    tmp_path: Path,
) -> None:
    # Current loader contract (deeptutor/services/config/loader.py::
    # load_config_with_main at lines 116-131) reads the named config
    # file and runs _inject_runtime_paths on it. It does NOT merge with
    # a sibling main.yaml, despite the docstring's aspirational wording:
    # every live caller passes "main.yaml" as the config_file, so the
    # merge path was never exercised in production and was dropped. This
    # test asserts the actual contract (named-file load + runtime-path
    # injection) rather than the vestigial merge.
    settings_dir = tmp_path / "data" / "user" / "settings"
    settings_dir.mkdir(parents=True)
    (settings_dir / "main.yaml").write_text(
        "system:\n  language: en\nsolve:\n  max_replans: 2\n",
        encoding="utf-8",
    )
    (settings_dir / "custom.yaml").write_text(
        "solve:\n  max_replans: 5\nlogging:\n  level: INFO\n",
        encoding="utf-8",
    )

    config = load_config_with_main("custom.yaml", tmp_path)

    # Named file contents round-trip.
    assert config["solve"]["max_replans"] == 5
    assert config["logging"]["level"] == "INFO"
    # Sibling main.yaml is NOT merged in: its keys must be absent.
    assert "system" not in config
    # Runtime paths are injected even for non-main files.
    assert "paths" in config
    assert "solve_output_dir" in config["paths"]


def test_load_config_with_main_raises_for_unknown_missing_config(tmp_path: Path) -> None:
    settings_dir = tmp_path / "data" / "user" / "settings"
    settings_dir.mkdir(parents=True)
    (settings_dir / "main.yaml").write_text("system:\n  language: en\n", encoding="utf-8")

    with pytest.raises(FileNotFoundError):
        load_config_with_main("nonexistent_module.yaml", tmp_path)


def test_load_config_with_main_uses_explicit_project_root() -> None:
    config = load_config_with_main("main.yaml", PROJECT_ROOT)

    assert "system" in config
    assert config["paths"]["solve_output_dir"].endswith("data/user/workspace/chat/deep_solve")
