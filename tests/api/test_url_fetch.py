"""Unit tests for deeptutor.services.ingestion.url_fetch.

Pure-logic tests: validate_url gate + HTML extractor. No network calls
(fetch_public_html is covered by the integration suite against the
live backend)."""

from __future__ import annotations

import pytest

from deeptutor.services.ingestion.url_fetch import (
    UrlIngestError,
    extract_html_text,
    render_artifact,
    staged_filename_for,
    validate_url,
    FetchResult,
)


# ── validate_url safety gate ───────────────────────────────────────────

@pytest.mark.parametrize("url", [
    "ftp://example.com/file",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,<h1>x</h1>",
    "gopher://example.com",
])
def test_non_http_schemes_are_refused(url):
    with pytest.raises(UrlIngestError) as ei:
        validate_url(url)
    assert ei.value.code == "unsupported_scheme"


@pytest.mark.parametrize("url", [
    "http://localhost/",
    "https://127.0.0.1/",
    "http://127.0.0.1:8001/api/v1/users",
    "http://10.0.0.1/",
    "http://192.168.1.1/admin",
    "http://169.254.169.254/",  # AWS IMDS
    "http://0.0.0.0/",
    "https://[::1]/",
])
def test_private_and_loopback_hosts_are_refused(url):
    with pytest.raises(UrlIngestError) as ei:
        validate_url(url)
    assert ei.value.code == "unsafe_target"


@pytest.mark.parametrize("url", [
    "https://example.com/file.pdf",
    "http://some-site.example/docs/whitepaper.PDF",
])
def test_pdf_urls_are_refused_upfront(url):
    with pytest.raises(UrlIngestError) as ei:
        validate_url(url)
    assert ei.value.code == "pdf_not_supported"


def test_missing_host_is_invalid():
    with pytest.raises(UrlIngestError) as ei:
        validate_url("http:///no-host")
    # Either invalid_url or unsafe_target; both refuse the request.
    assert ei.value.code in ("invalid_url", "unsafe_target")


# ── HTML extraction ────────────────────────────────────────────────────

def test_extract_strips_script_style_and_keeps_title():
    html = """<html><head><title>  Demo Page  </title>
    <style>body { color: red; }</style>
    </head><body>
    <script>window.x = 1;</script>
    <h1>Hello</h1>
    <p>Article body text.</p>
    <noscript>js-off</noscript>
    </body></html>"""
    title, text = extract_html_text(html)
    assert title == "Demo Page"
    assert "Hello" in text
    assert "Article body text." in text
    assert "window.x" not in text
    assert "color: red" not in text
    assert "js-off" not in text


def test_extract_handles_malformed_html_gracefully():
    title, text = extract_html_text("<html><h1>Broken</h1><p>No close")
    assert "Broken" in text
    assert "No close" in text


def test_render_artifact_preserves_source_url_header():
    r = FetchResult(
        url="https://example.com/a",
        final_url="https://example.com/a",
        title="Demo",
        text="body",
        content_type="text/html; charset=utf-8",
    )
    rendered = render_artifact(r)
    assert rendered.startswith("# Demo\nSource URL: https://example.com/a\n")
    assert "body" in rendered


def test_staged_filename_is_stable_and_safe():
    f1 = staged_filename_for("https://example.com/page", "Demo")
    f2 = staged_filename_for("https://example.com/page", "Demo")
    f3 = staged_filename_for("https://example.com/other", "Demo")
    assert f1 == f2
    assert f1 != f3
    assert all(ch.isalnum() or ch in "-_." for ch in f1)
    assert f1.endswith(".txt")
