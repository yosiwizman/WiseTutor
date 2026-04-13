#!/usr/bin/env bash
set -euo pipefail

PASS=0
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local extra_check="${3:-}"  # optional: additional validation on response body

  local body
  if body=$(curl -sf "$url" 2>/dev/null); then
    if [[ -n "$extra_check" ]]; then
      # extra_check is a pattern that must NOT appear in the body
      if echo "$body" | grep -q "$extra_check"; then
        echo "FAIL $name: response contains '$extra_check'"
        (( FAIL++ )) || true
        return
      fi
    fi
    echo "PASS $name"
    (( PASS++ )) || true
  else
    echo "FAIL $name: curl returned non-200 or connection refused"
    (( FAIL++ )) || true
  fi
}

check "backend_docs"    "http://localhost:8001/docs"
check "backend_stt"     "http://localhost:8001/api/v1/voice/status"
check "backend_tts"     "http://localhost:8001/api/v1/voice/tts-status" "piper_unavailable"
check "frontend"        "http://localhost:3782/"
check "ollama"          "http://localhost:11434/api/tags"

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [[ $FAIL -eq 0 ]]; then
  exit 0
else
  exit 1
fi
