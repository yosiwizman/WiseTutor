#!/usr/bin/env bash
set -euo pipefail

REPO=/home/ai-desktop/projects/WiseTutor
LOGS="$REPO/logs"
mkdir -p "$LOGS"

# Source env vars without echoing values
if [[ -f "$REPO/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO/.env"
  set +a
fi

# --- Backend ---
start_backend() {
  export WISETUTOR_PIPER_BIN="$REPO/.venv/bin/piper"
  export WISETUTOR_PIPER_VOICE_PATH=/mnt/models/piper/en_US-lessac-low.onnx

  setsid nohup "$REPO/.venv/bin/python" -m uvicorn deeptutor.api.main:app \
    --host 0.0.0.0 --port 8001 \
    > "$LOGS/backend.log" 2>&1 < /dev/null &
  disown
  echo $! > "$LOGS/backend.pid"
  echo "Backend started (PID $!)"
}

if [[ -f "$LOGS/backend.pid" ]] && kill -0 "$(cat "$LOGS/backend.pid")" 2>/dev/null; then
  echo "Backend already running (PID $(cat "$LOGS/backend.pid"))"
else
  (cd "$REPO" && start_backend)
fi

# --- Frontend ---
# Invoke the next binary directly instead of `npm run dev`. npm wraps
# the node child and the child does not always survive the parent
# shell exiting — calling node+next directly puts the Next.js server
# itself at the head of the new session created by setsid.
start_frontend() {
  setsid nohup node ./node_modules/next/dist/bin/next dev --port 3782 \
    > "$LOGS/frontend.log" 2>&1 < /dev/null &
  local pid=$!
  disown "$pid" 2>/dev/null || disown || true
  echo "$pid" > "$LOGS/frontend.pid"
  echo "Frontend started (PID $pid)"
}

if [[ -f "$LOGS/frontend.pid" ]] && kill -0 "$(cat "$LOGS/frontend.pid")" 2>/dev/null; then
  echo "Frontend already running (PID $(cat "$LOGS/frontend.pid"))"
else
  (cd "$REPO/web" && start_frontend)
fi

# --- Poll for readiness ---
BACKEND_READY=0
FRONTEND_READY=0
DEADLINE=$(( SECONDS + 60 ))

while (( SECONDS < DEADLINE )); do
  if [[ $BACKEND_READY -eq 0 ]] && curl -sf http://localhost:8001/docs > /dev/null 2>&1; then
    echo "backend ready"
    BACKEND_READY=1
  fi
  if [[ $FRONTEND_READY -eq 0 ]] && curl -sf http://localhost:3782/ > /dev/null 2>&1; then
    echo "frontend ready"
    FRONTEND_READY=1
  fi
  [[ $BACKEND_READY -eq 1 && $FRONTEND_READY -eq 1 ]] && break
  sleep 2
done

# --- Final status ---
if [[ $BACKEND_READY -eq 1 && $FRONTEND_READY -eq 1 ]]; then
  echo "OK"
elif [[ $BACKEND_READY -eq 0 && $FRONTEND_READY -eq 0 ]]; then
  echo "FAIL: neither backend nor frontend ready" >&2
  exit 2
else
  MISSING=""
  [[ $BACKEND_READY -eq 0 ]]  && MISSING="backend"
  [[ $FRONTEND_READY -eq 0 ]] && MISSING="${MISSING:+$MISSING, }frontend"
  echo "PARTIAL: missing $MISSING"
  exit 1
fi
