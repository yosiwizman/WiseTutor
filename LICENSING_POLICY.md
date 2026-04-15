# LICENSING_POLICY — WiseTutor

Founder-approved 2026-04-15 (Gate G1 + Gate G6 closed). Canonical for
the boundary between what WiseTutor may automatically download and
ingest versus what must be link-only.

This file is the single source of truth on acquisition licensing. If
any other doc (SSOT.md, DECISIONS_LOG.md, FEATURE_REQUESTS_*,
roadmap/spec files, commit messages) disagrees, this file wins and the
other doc must be updated to match.

## Scope

This policy governs **automatic acquisition behavior** only — i.e.,
any WiseTutor component that would fetch, download, store, or ingest
third-party material on behalf of a user (current substrate: URL
ingestion v1; future substrate: the AI Librarian free-fetch pipeline
planned in `FEATURE_REQUESTS_2026_04_15.md`).

It does not govern:
- user-supplied uploads (the user asserts their own right to use those
  materials; preflight + dedup contracts apply);
- purely linking / referencing URLs in the UI for the user to open
  themselves;
- outbound LLM/API calls (governed separately).

## Allowed licenses (auto-download + ingest permitted)

WiseTutor may fetch and ingest a source only when the declared source
license is one of the following:

- `public-domain`
- `cc0`
- `cc-by`
- `cc-by-sa`
- `mit`
- `bsd` (any standard variant: 2-clause, 3-clause)
- `apache` (Apache-2.0)
- `gfdl`
- `openstax` (unless a specific OpenStax page states otherwise)
- `arxiv` pre-prints (per arXiv's stated terms)

A source that carries any of the licenses above may be fetched,
normalized, stored in the caller's knowledge base, and indexed.

## Ambiguous or paid material — link-only

If the source's license is missing, unclear, mixed, all-rights-reserved,
commercial, or behind a paywall, the system must treat it as **paid
/ ambiguous** and:

- surface a purchase / access link to the user,
- not fetch the material,
- not cache the material,
- not persist the material in the knowledge base,
- wait for the user to supply the material themselves (e.g., via the
  shipped upload path), at which point the upload is governed by the
  user's own rights assertion, not by this policy.

## Hard prohibitions

Regardless of any other signal, WiseTutor must never:

1. **Auto-purchase.** No automatic payment, no checkout automation, no
   credential-required billing flow.
2. **Assume redistribution rights.** "The user already bought a copy"
   does not grant WiseTutor the right to fetch, cache, or redistribute
   the material on the user's behalf.
3. **Bypass access controls.** No login-walled, DRM-protected, or
   geofenced content may be fetched through credential reuse,
   scraping-around, or cookie handoff.
4. **Ingest under the wrong license.** If a page declares a
   non-allowed license, the material is treated as paid/ambiguous
   (above) regardless of whether it is technically reachable.

## Operator note

Approval to fetch is **license-bound, not usefulness-bound**. A
material being highly relevant to the learner's goal is not, by
itself, grounds to acquire it. When a source is relevant but not
license-eligible, the system's correct behavior is to hand the user a
link and stop.
