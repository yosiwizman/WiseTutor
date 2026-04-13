# WiseTutor Family Alpha — Triage Map
# Generated: 2026-04-13
# Usage: If the founder reports "Step N: fail", check these files first.

---

### Step 1 — Open app + branding check
- **Likely area:** Layout/sidebar rendering; locale string substitution
- **Files to check first:**
  - `/home/ai-desktop/projects/WiseTutor/web/app/layout.tsx`
  - `/home/ai-desktop/projects/WiseTutor/web/components/sidebar/SidebarShell.tsx`
  - `/home/ai-desktop/projects/WiseTutor/web/locales/en/app.json`
- **Existing proof that should still pass:** `family-alpha-smoke`
- **Likely classification if it fails:** BLOCKING
- **Quick diagnostic command:** `grep -r "WiseTutor\|DeepTutor\|appName" /home/ai-desktop/projects/WiseTutor/web/locales/en/app.json`

---

### Step 2 — Sign in as Mr W (PIN 2468)
- **Likely area:** PIN validation, user-context hydration, session token storage
- **Files to check first:**
  - `/home/ai-desktop/projects/WiseTutor/web/components/chat/home/UserSwitcher.tsx`
  - `/home/ai-desktop/projects/WiseTutor/web/components/chat/home/UserGate.tsx`
  - `/home/ai-desktop/projects/WiseTutor/web/context/UnifiedChatContext.tsx`
  - `/home/ai-desktop/projects/WiseTutor/deeptutor/api/routers/users.py`
- **Existing proof that should still pass:** `family-alpha-smoke`
- **Likely classification if it fails:** BLOCKING
- **Quick diagnostic command:** `curl -s -X POST http://localhost:8001/api/v1/users/login -H 'Content-Type: application/json' -d '{"pin":"2468"}' | python3 -m json.tool`

---

### Step 3 — Text chat → one reply
- **Likely area:** WebSocket message dispatch; LLM response pipeline
- **Files to check first:**
  - `/home/ai-desktop/projects/WiseTutor/web/context/UnifiedChatContext.tsx`
  - `/home/ai-desktop/projects/WiseTutor/deeptutor/api/routers/unified_ws.py`
- **Existing proof that should still pass:** `family-alpha-smoke`
- **Likely classification if it fails:** BLOCKING
- **Quick diagnostic command:** `curl -s http://localhost:8001/api/v1/health | python3 -m json.tool`

---

### Step 4 — PTT voice turn → reply spoken aloud
- **Likely area:** STT capture → LLM → TTS synthesis → audio playback chain
- **Files to check first:**
  - `/home/ai-desktop/projects/WiseTutor/web/hooks/useVoiceTurnProduction.ts`
  - `/home/ai-desktop/projects/WiseTutor/web/lib/tts.ts`
  - `/home/ai-desktop/projects/WiseTutor/deeptutor/api/routers/voice.py`
  - `/home/ai-desktop/projects/WiseTutor/.venv/bin/piper` (binary present + executable)
- **Existing proof that should still pass:** `voice-turn-real`, `voice-turn`, `tts`, `voice-stt`
- **Likely classification if it fails:** BLOCKING
- **Quick diagnostic command:** `curl -s http://localhost:8001/api/v1/voice/tts-status`

---

### Step 5 — Cancel voice turn mid-flow
- **Likely area:** `cancel()` call in voice hook; button state in composer
- **Files to check first:**
  - `/home/ai-desktop/projects/WiseTutor/web/hooks/useVoiceTurn.ts`
  - `/home/ai-desktop/projects/WiseTutor/web/components/chat/home/ChatComposer.tsx`
- **Existing proof that should still pass:** `voice-turn`
- **Likely classification if it fails:** SHOULD-FIX-SOON
- **Quick diagnostic command:** `grep -n "cancel\|abort\|stop" /home/ai-desktop/projects/WiseTutor/web/hooks/useVoiceTurn.ts | head -20`

---

### Step 6 — Switch to Bella (PIN 1357)
- **Likely area:** `wt:user-switched` event propagation; voice/TTS state reset across hooks
- **Files to check first:**
  - `/home/ai-desktop/projects/WiseTutor/web/components/chat/home/UserSwitcher.tsx`
  - `/home/ai-desktop/projects/WiseTutor/web/hooks/useVoiceTurn.ts`
  - `/home/ai-desktop/projects/WiseTutor/web/hooks/useAssistantTts.ts`
  - `/home/ai-desktop/projects/WiseTutor/web/components/chat/home/MicButton.tsx`
- **Existing proof that should still pass:** `family-alpha-smoke`
- **Likely classification if it fails:** BLOCKING
- **Quick diagnostic command:** `curl -s -X POST http://localhost:8001/api/v1/users/login -H 'Content-Type: application/json' -d '{"pin":"1357"}' | python3 -m json.tool`

---

### Step 7 — Error recovery after a voice failure
- **Likely area:** Error + reset state paths in voice hook; button reverts to idle in composer
- **Files to check first:**
  - `/home/ai-desktop/projects/WiseTutor/web/hooks/useVoiceTurn.ts`
  - `/home/ai-desktop/projects/WiseTutor/web/components/chat/home/ChatComposer.tsx`
- **Existing proof that should still pass:** `voice-turn`, `tts-fallback`, `voice-stt-fallback`
- **Likely classification if it fails:** SHOULD-FIX-SOON
- **Quick diagnostic command:** `curl -s http://localhost:8001/api/v1/voice/status`

---

### Step 8 — Settings / navigation branding
- **Likely area:** Settings page render; locale strings for nav labels
- **Files to check first:**
  - `/home/ai-desktop/projects/WiseTutor/web/app/(utility)/settings/page.tsx`
  - `/home/ai-desktop/projects/WiseTutor/web/locales/en/app.json`
- **Existing proof that should still pass:** `family-alpha-smoke`
- **Likely classification if it fails:** FUTURE POLISH
- **Quick diagnostic command:** `grep -n "settings\|Settings\|nav" /home/ai-desktop/projects/WiseTutor/web/locales/en/app.json | head -20`

---

## Commands for a clean re-run

```bash
# Full Playwright suite (do not run during shakedown — use after founder reports results)
cd /home/ai-desktop/projects/WiseTutor/web && PW_SERIAL=1 WT_MRW_PIN=2468 WT_BELLA_PIN=1357 DEEPTUTOR_APP=http://localhost:3782 NEXT_PUBLIC_API_BASE=http://localhost:8001 npx playwright test --project=family-alpha-smoke --project=voice-turn-real --project=voice-turn --project=voice-stt --project=voice-stt-fallback --project=tts --project=tts-fallback --reporter=list

# TTS engine health
curl -s http://localhost:8001/api/v1/voice/tts-status

# Voice pipeline health
curl -s http://localhost:8001/api/v1/voice/status
```
