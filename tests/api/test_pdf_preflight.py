"""PDF preflight classifier — deterministic fixtures via fitz.

Builds PDFs at test time so the repo doesn't carry binary fixtures
and every run is reproducible."""

from __future__ import annotations

from pathlib import Path

import pytest

fitz = pytest.importorskip("fitz")

from deeptutor.services.ingestion.pdf_preflight import classify_pdf


def _make_text_pdf(path: Path, text: str, pages: int = 1) -> Path:
    doc = fitz.open()
    try:
        for _ in range(pages):
            page = doc.new_page()
            page.insert_text((72, 100), text, fontsize=11)
        doc.save(str(path))
    finally:
        doc.close()
    return path


def _make_image_only_pdf(path: Path, pages: int = 1) -> Path:
    """A PDF with a page that contains NO text objects — just a
    solid-color rectangle. A real 'scanned' PDF would contain an
    embedded image; for preflight, the signal we care about is
    `page.get_text()` returning empty, which this achieves."""
    doc = fitz.open()
    try:
        for _ in range(pages):
            page = doc.new_page()
            rect = fitz.Rect(72, 100, 300, 300)
            page.draw_rect(rect, color=(0, 0, 0), fill=(1, 1, 1))
        doc.save(str(path))
    finally:
        doc.close()
    return path


def _make_encrypted_pdf(path: Path, text: str, password: str = "secret") -> Path:
    doc = fitz.open()
    try:
        page = doc.new_page()
        page.insert_text((72, 100), text, fontsize=11)
        doc.save(
            str(path),
            encryption=fitz.PDF_ENCRYPT_AES_256,
            owner_pw=password,
            user_pw=password,
        )
    finally:
        doc.close()
    return path


def _make_malformed_pdf(path: Path) -> Path:
    path.write_bytes(b"%PDF-1.4\nnot-a-real-pdf\n%%EOF\n")
    return path


def test_text_pdf_classifies_text_ok(tmp_path: Path) -> None:
    p = _make_text_pdf(tmp_path / "ok.pdf", "Hello world. " * 40)
    r = classify_pdf(p)
    assert r.kind == "text_ok", r
    assert r.page_count == 1
    assert r.extracted_char_count >= 20


def test_encrypted_pdf_is_rejected(tmp_path: Path) -> None:
    p = _make_encrypted_pdf(tmp_path / "locked.pdf", "Secret body.")
    r = classify_pdf(p)
    assert r.kind == "encrypted", r


def test_image_only_pdf_is_rejected(tmp_path: Path) -> None:
    p = _make_image_only_pdf(tmp_path / "scanned.pdf")
    r = classify_pdf(p)
    assert r.kind == "no_extractable_text", r
    assert r.extracted_char_count < 20


def test_malformed_pdf_is_rejected(tmp_path: Path) -> None:
    p = _make_malformed_pdf(tmp_path / "broken.pdf")
    r = classify_pdf(p)
    assert r.kind == "malformed", r
