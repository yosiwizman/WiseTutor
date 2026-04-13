# WiseTutor — Family-alpha automation-first verification (2026-04-13)

## Why this file
Supersedes the earlier 8-step manual shakedown runbook for the current app state.
Automation covers nearly every family-alpha check; only one subjective family-use
observation remains.

## Automated coverage (what is proven by tools)

| # | Family-alpha check | How it is proven | Result |
|---|---|---|---|
| 1 | First-screen branding shows "WiseTutor", never "DeepTutor" | `family-alpha-smoke` test 1 (`toHaveText` "WiseTutor" + `toHaveCount(0)` for "DeepTutor") + `family-alpha-screenshots` visual scan + saved PNG | **PASS** |
| 2 | Document `<title>` contains "WiseTutor" | `family-alpha-smoke` test 1 asserts `toHaveTitle(/WiseTutor/)` | **PASS** |
| 3 | Sign-in works for Mr W (PIN 2468) and Bella (PIN 1357) | Every voice suite (`voice-stt`, `voice-stt-fallback`, `tts`, `tts-fallback`, `voice-turn`, `voice-turn-real`) signs in with one or both PINs and passes | **PASS** |
| 4 | Composer reachable and empty after sign-in | `family-alpha-smoke` test 3 | **PASS** |
| 5 | Text chat UI path alive | Composer + Send button asserted present; `voice-turn-real` happy-path proves the chat-submit → reply-capture loop deterministically; real chat was exercised in the 2026-04-13 Slice 4B Tier 1 founder audible-conversation check (commit `0ff36bb`) | **PASS** |
| 6 | PTT control present + stateful | `family-alpha-smoke` test 4 (`data-voice-turn-state` attr + click doesn't crash) | **PASS** |
| 7 | Voice cancel path stable | `voice-turn` cancel cases (3) + `voice-turn-real` "cancel while awaiting_assistant" | **PASS** |
| 8 | Settings / nav do not expose "DeepTutor" | `family-alpha-smoke` test 5 + `family-alpha-screenshots` settings shot + locator sweep | **PASS** |
| 9 | No blocking console / runtime errors on family-facing flows | `family-alpha-smoke` PTT test registers `page.on("pageerror")`; `family-alpha-screenshots` scope registers pageerror at spec level; both clean | **PASS** |

## Raw evidence

- **Full voice + smoke regression: 48 / 48 passed in 40.8 s** (repeated twice in this session — identical result).
  - `family-alpha-smoke`: 5 / 5
  - `voice-stt`: 7 / 7
  - `voice-stt-fallback`: 9 / 9
  - `tts`: 5 / 5
  - `tts-fallback`: 7 / 7
  - `voice-turn`: 8 / 8
  - `voice-turn-real`: 7 / 7
- **Screenshot pass: 3 / 3 passed in 2.5 s.**
  - `artifacts/family_alpha_shakedown/family-alpha-first-screen.png` — 47 162 B
  - `artifacts/family_alpha_shakedown/family-alpha-composer.png` — 49 967 B
  - `artifacts/family_alpha_shakedown/family-alpha-settings.png` — 90 753 B
- Re-run command:
  `cd /home/ai-desktop/projects/WiseTutor/web && PW_SERIAL=1 WT_MRW_PIN=2468 WT_BELLA_PIN=1357 DEEPTUTOR_APP=http://localhost:3782 NEXT_PUBLIC_API_BASE=http://localhost:8001 npx playwright test --project=family-alpha-smoke --project=family-alpha-screenshots --project=voice-turn-real --project=voice-turn --project=voice-stt --project=voice-stt-fallback --project=tts --project=tts-fallback --reporter=list`

## Minimum remaining founder ask

Only this (asynchronous, no structured script):

> After Bella (or another family member) actually uses the app for a few minutes, reply with one line:
> **"Bella confusion: yes / no — `<one sentence>`"**

No 8-step checklist. No DOM inspection. No file editing. No screenshots to take. The prior `SHAKEDOWN_RUNBOOK_20260413.md` stays in this folder as historical reference; it is NOT the active recommendation.

## What is still unprovable by tools

- Subjective confusion / friction for a non-technical family member (the single remaining ask above).
- Long-term reliability over days of real use — out of scope for a 10-minute family alpha.

## Sign-off

- Agent: Claude Code (Opus 4.6) — automation-first pass.
- Founder: Yosi.
