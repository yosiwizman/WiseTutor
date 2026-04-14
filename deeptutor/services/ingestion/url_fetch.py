"""URL ingestion v1 — narrow safety + HTML text extraction.

One URL → one persisted text artifact staged into a KB's `raw/` dir.
No crawling, no sitemap, no dynamic rendering, no batch.

Safety gates (reject BEFORE any network call):
  - scheme must be http or https
  - host must NOT resolve to a private / loopback / link-local /
    multicast / reserved / ipv6-mapped address
  - URL path must NOT end in a PDF-ish extension (.pdf / .PDF); PDF
    content types are rejected after fetch by inspecting headers

Fetch constraints:
  - hard timeout
  - hard response-size cap (1 MiB)
  - Content-Type must start with text/html or application/xhtml+xml
  - any redirect target re-validates via the same safety gate

No third-party deps: stdlib only (urllib + html.parser + ipaddress).
Extraction: strip <script>/<style> and emit visible-text-only with a
title. Good enough for textual article pages; not a general
boilerplate remover.
"""

from __future__ import annotations

import hashlib
import ipaddress
import socket
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from html.parser import HTMLParser

_UA = "WiseTutor-URL-Ingest/1.0"
_MAX_BYTES = 1_048_576  # 1 MiB response cap
_DEFAULT_TIMEOUT_S = 10


class UrlIngestError(Exception):
    """Raised for any fetch/validation failure. `.code` is a stable
    machine-readable token the router maps to HTTP status / detail."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class FetchResult:
    url: str
    final_url: str
    title: str
    text: str  # visible text
    content_type: str


# ── safety validation ──────────────────────────────────────────────────

_PDF_SUFFIXES = (".pdf",)


def _is_private_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True  # be conservative
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _resolve_safe(host: str) -> None:
    """Resolve host and raise UrlIngestError if ANY address is private.
    Blocks DNS rebinding attempts where one A record is public and
    another is internal."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise UrlIngestError("dns_failure", f"could not resolve host: {host}")
    seen = set()
    for family, _type, _proto, _canon, sockaddr in infos:
        ip = sockaddr[0]
        if ip in seen:
            continue
        seen.add(ip)
        if _is_private_ip(ip):
            raise UrlIngestError(
                "unsafe_target",
                f"host {host} resolves to non-public address {ip}",
            )


def validate_url(url: str) -> urllib.parse.ParseResult:
    """Raise UrlIngestError unless url is a safe public http(s) page
    that does not obviously point at a PDF. Returns the parsed URL."""
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception:
        raise UrlIngestError("invalid_url", f"url is not parseable: {url!r}")
    if parsed.scheme not in ("http", "https"):
        raise UrlIngestError(
            "unsupported_scheme",
            f"only http/https are allowed; got {parsed.scheme!r}",
        )
    if not parsed.netloc or not parsed.hostname:
        raise UrlIngestError("invalid_url", "url has no host")
    host = parsed.hostname.lower()
    if host in ("localhost", "localhost.localdomain", ""):
        raise UrlIngestError("unsafe_target", f"host {host!r} is not public")
    # Reject obvious PDF URLs up-front.
    path = (parsed.path or "").lower()
    if any(path.endswith(s) for s in _PDF_SUFFIXES):
        raise UrlIngestError(
            "pdf_not_supported",
            "PDF URLs are not supported in URL ingestion v1",
        )
    # If the host is already a literal IP, reject private ones without
    # a DNS lookup.
    try:
        ip = ipaddress.ip_address(host)
        if _is_private_ip(str(ip)):
            raise UrlIngestError("unsafe_target", f"host {host} is a non-public IP")
    except ValueError:
        # It's a hostname; resolve and check all addresses.
        _resolve_safe(host)
    return parsed


# ── HTML text extraction ───────────────────────────────────────────────


class _TextExtractor(HTMLParser):
    """Minimal visible-text extractor. Drops <script>/<style>/<noscript>
    and keeps text runs separated by whitespace."""

    _SKIP = {"script", "style", "noscript", "template", "svg"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        self._skip_depth = 0
        self._in_title = False
        self.title = ""

    def handle_starttag(self, tag, attrs):
        t = tag.lower()
        if t in self._SKIP:
            self._skip_depth += 1
        elif t == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        t = tag.lower()
        if t in self._SKIP:
            self._skip_depth = max(0, self._skip_depth - 1)
        elif t == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._skip_depth:
            return
        if self._in_title:
            self.title = (self.title + " " + data.strip()).strip()
            return
        text = data.strip()
        if text:
            self._parts.append(text)

    @property
    def text(self) -> str:
        return "\n".join(self._parts).strip()


def extract_html_text(html: str) -> tuple[str, str]:
    ext = _TextExtractor()
    try:
        ext.feed(html)
    except Exception:
        # Malformed HTML is acceptable — return whatever we parsed.
        pass
    return ext.title.strip(), ext.text


# ── fetch ──────────────────────────────────────────────────────────────


def fetch_public_html(
    url: str, timeout: float = _DEFAULT_TIMEOUT_S, max_bytes: int = _MAX_BYTES
) -> FetchResult:
    """Fetch the URL, enforce safety gates, return extracted text.

    Raises UrlIngestError for any safety-relevant failure; the router
    maps `.code` to HTTP status:
      unsupported_scheme / invalid_url / pdf_not_supported -> 400
      unsafe_target / dns_failure                          -> 400
      fetch_failed                                         -> 502
      too_large                                            -> 413
      not_html                                             -> 415
    """
    validate_url(url)

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": _UA,
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            final_url = resp.geturl()
            # Re-validate the resolved URL in case of redirect chain.
            # Private-range redirects must be refused.
            if final_url != url:
                validate_url(final_url)
            ctype = (resp.headers.get_content_type() or "").lower()
            if ctype == "application/pdf":
                raise UrlIngestError(
                    "pdf_not_supported",
                    "PDF content-type is not supported in URL ingestion v1",
                )
            if not (ctype.startswith("text/html") or ctype == "application/xhtml+xml"):
                raise UrlIngestError(
                    "not_html",
                    f"content-type {ctype!r} is not supported; only HTML",
                )
            data = resp.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise UrlIngestError(
                    "too_large",
                    f"response exceeds {max_bytes} byte cap",
                )
            # Best-effort charset detection: urllib already decoded
            # headers but the body is bytes. Use header-declared charset.
            charset = resp.headers.get_content_charset() or "utf-8"
            try:
                html = data.decode(charset, errors="replace")
            except LookupError:
                html = data.decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise UrlIngestError("fetch_failed", f"HTTP {exc.code} from {url}")
    except urllib.error.URLError as exc:
        raise UrlIngestError("fetch_failed", f"cannot reach {url}: {exc.reason}")
    except OSError as exc:
        raise UrlIngestError("fetch_failed", f"network error fetching {url}: {exc}")
    except UrlIngestError:
        raise
    except Exception as exc:
        raise UrlIngestError("fetch_failed", f"unexpected error fetching {url}: {exc}")

    title, text = extract_html_text(html)
    return FetchResult(
        url=url,
        final_url=final_url,
        title=title or url,
        text=text,
        content_type=ctype,
    )


def staged_filename_for(url: str, title: str) -> str:
    """Stable filename under raw/ keyed on URL + title. Uses .txt so
    the existing DocumentAdder text pipeline consumes it as a text
    artifact attributable to its source URL."""
    slug = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in (title or "url"))[:40]
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:10]
    return f"{slug}_{digest}.txt"


def render_artifact(result: FetchResult) -> str:
    """Shape of the persisted text artifact: a small attribution
    preamble followed by the extracted body. The preamble makes the
    origin traceable inside the KB even when the raw filename is
    content-hashed."""
    head = [
        f"# {result.title}",
        f"Source URL: {result.url}",
        f"Content-Type: {result.content_type}",
        "",
    ]
    return "\n".join(head) + result.text + "\n"
