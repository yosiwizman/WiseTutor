#!/usr/bin/env bash
# DeepTutor — local launcher (backend + frontend + Ollama check)
set -u
REPO="/home/ai-desktop/projects/DeepTutor"
cd "$REPO"
LOGS="$REPO/logs"
mkdir -p "$LOGS"
BACKEND_PID="$LOGS/backend.pid"
FRONTEND_PID="$LOGS/frontend.pid"

log() { echo "[$(date +%H:%M:%S)] $*"; }

is_running() {
  local pidfile=$1
  [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

# Ollama
if ! curl -sf http://localhost:11434/api/tags >/dev/null; then
  log "Starting Ollama service..."
  systemctl --user start ollama 2>/dev/null || sudo -n systemctl start ollama 2>/dev/null || nohup ollama serve >>"$LOGS/ollama.log" 2>&1 &
  for i in {1..20}; do
    curl -sf http://localhost:11434/api/tags >/dev/null && break
    sleep 1
  done
fi

# Backend
if is_running "$BACKEND_PID"; then
  log "Backend already running (PID $(cat $BACKEND_PID))"
else
  log "Starting backend on :8001..."
  source "$REPO/.venv/bin/activate"
  set -a; source "$REPO/.env"; set +a
  nohup python -m deeptutor.api.run_server >>"$LOGS/backend.log" 2>&1 &
  echo $! > "$BACKEND_PID"
fi

# Frontend
if is_running "$FRONTEND_PID"; then
  log "Frontend already running (PID $(cat $FRONTEND_PID))"
else
  log "Starting frontend on :3782..."
  cd "$REPO/web"
  set -a; source "$REPO/.env"; set +a
  export NEXT_PUBLIC_API_BASE="http://localhost:8001"
  nohup npm run dev -- --port 3782 >>"$LOGS/frontend.log" 2>&1 &
  echo $! > "$FRONTEND_PID"
  cd "$REPO"
fi

# Wait for frontend
log "Waiting for frontend..."
for i in {1..90}; do
  curl -sf -o /dev/null http://localhost:3782 && { log "Frontend up"; break; }
  sleep 2
done

# Open browser
if command -v xdg-open >/dev/null; then
  xdg-open http://localhost:3782 >/dev/null 2>&1 &
fi

log "DeepTutor started. Logs: $LOGS/"
log "Backend:  http://localhost:8001"
log "Frontend: http://localhost:3782"
