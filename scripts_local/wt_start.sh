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
    --host ${BACKEND_HOST:-127.0.0.1} --port ${BACKEND_PORT:-8001} \
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

# --- Frontend (production runtime) ---
# Serve the family-facing UI via Next.js standalone production server,
# not `next dev`. Production mode removes the floating dev indicator /
# DevTools badge and is the correct runtime for real users. A build is
# produced on first launch (and re-produced if sources are newer than
# the cached BUILD_ID); set WT_SKIP_BUILD=1 to skip.
build_frontend_if_needed() {
  local build_id=".next/BUILD_ID"
  local needs_build=0
  if [[ "${WT_SKIP_BUILD:-0}" = "1" ]]; then
    return 0
  fi
  if [[ ! -f "$build_id" ]] || [[ ! -f ".next/standalone/server.js" ]]; then
    needs_build=1
  else
    # Rebuild if any tracked source file is newer than BUILD_ID.
    if [[ -n "$(find app components lib context hooks next.config.js package.json -newer "$build_id" -print -quit 2>/dev/null)" ]]; then
      needs_build=1
    fi
  fi
  if (( needs_build )); then
    echo "Building frontend (next build)..."
    node ./node_modules/next/dist/bin/next build > "$LOGS/frontend-build.log" 2>&1 || {
      echo "FAIL: next build (see logs/frontend-build.log)" >&2
      return 1
    }
  fi
  # Standalone output needs .next/static and public copied in.
  rm -rf .next/standalone/.next/static .next/standalone/public
  cp -r .next/static .next/standalone/.next/static
  [[ -d public ]] && cp -r public .next/standalone/public
}

start_frontend() {
  setsid nohup env PORT=3782 HOSTNAME=0.0.0.0 \
    node .next/standalone/server.js \
    > "$LOGS/frontend.log" 2>&1 < /dev/null &
  local pid=$!
  disown "$pid" 2>/dev/null || disown || true
  echo "$pid" > "$LOGS/frontend.pid"
  echo "Frontend started (PID $pid, production)"
}

if [[ -f "$LOGS/frontend.pid" ]] && kill -0 "$(cat "$LOGS/frontend.pid")" 2>/dev/null; then
  echo "Frontend already running (PID $(cat "$LOGS/frontend.pid"))"
else
  (cd "$REPO/web" && build_frontend_if_needed && start_frontend)
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
