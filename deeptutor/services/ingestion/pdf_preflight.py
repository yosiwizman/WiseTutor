"""PDF preflight for knowledge upload.

Classifies an uploaded PDF into one of four states BEFORE the background
pipeline runs, so the product returns a truthful error shape instead of
silently succeeding with an empty index.

States:
  - text_ok            -> pipeline may proceed
  - encrypted          -> 400 encrypted_pdf_unsupported
  - no_extractable_text -> 415 pdf_no_extractable_text (image-only / scanned)
  - malformed          -> 400 malformed_pdf

Only PyMuPDF (fitz) is used — already a declared dependency. No OCR,
no headless browsers, no second parser. If PyMuPDF itself is missing
the preflight returns `text_ok` and defers to the downstream parser's
own failure mode; this avoids hard-failing on minimal envs.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

_MIN_EXTRACTABLE_CHARS = 20  # threshold for "has text"; a cover page may be blank


@dataclass(frozen=True)
class PdfPreflightResult:
    kind: str  # "text_ok" | "encrypted" | "no_extractable_text" | "malformed"
    page_count: int
    extracted_char_count: int
    message: str


def classify_pdf(path: Path) -> PdfPreflightResult:
    try:
        import fitz  # type: ignore
    except Exception:
        return PdfPreflightResult("text_ok", 0, 0, "fitz unavailable; preflight skipped")

    try:
        doc = fitz.open(path)
    except Exception as exc:
        return PdfPreflightResult(
            "malformed", 0, 0, f"cannot open PDF: {type(exc).__name__}: {exc}"
        )

    try:
        # Encrypted check. needs_pass is True when a password is required
        # for read access; is_encrypted is a broader hint.
        is_encrypted = bool(getattr(doc, "needs_pass", False)) or bool(
            getattr(doc, "is_encrypted", False)
        )
        if is_encrypted:
            # Some PDFs report is_encrypted=True but are actually readable
            # with an empty password (e.g. permissions-only encryption).
            # Try to authenticate with "" — if that still fails, it's
            # truly password-protected.
            try:
                if hasattr(doc, "authenticate") and doc.authenticate(""):
                    is_encrypted = bool(getattr(doc, "needs_pass", False))
            except Exception:
                pass
        if is_encrypted:
            return PdfPreflightResult(
                "encrypted", doc.page_count, 0, "PDF is password-protected"
            )

        total_chars = 0
        page_count = doc.page_count
        for page in doc:
            try:
                text = page.get_text() or ""
            except Exception:
                text = ""
            total_chars += len(text.strip())
            if total_chars >= _MIN_EXTRACTABLE_CHARS:
                break  # short-circuit; we have enough signal

        if total_chars < _MIN_EXTRACTABLE_CHARS:
            return PdfPreflightResult(
                "no_extractable_text",
                page_count,
                total_chars,
                f"PDF has {total_chars} extractable chars across {page_count} pages — "
                "looks image-only or scanned",
            )
        return PdfPreflightResult(
            "text_ok", page_count, total_chars, "text-based PDF accepted"
        )
    finally:
        try:
            doc.close()
        except Exception:
            pass
