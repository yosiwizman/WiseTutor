#!/usr/bin/env bash
set -euo pipefail

REPO=/home/ai-desktop/projects/WiseTutor
LOGS="$REPO/logs"

stop_pid() {
  local pidfile="$1"
  local label="$2"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping $label (PID $pid)..."
      kill -TERM "$pid" 2>/dev/null || true
      sleep 2
      if kill -0 "$pid" 2>/dev/null; then
        echo "  $label still alive, sending SIGKILL..."
        kill -KILL "$pid" 2>/dev/null || true
      fi
    else
      echo "$label not running (stale pidfile)"
    fi
    rm -f "$pidfile"
  else
    echo "No pidfile for $label"
  fi
}

stop_pid "$LOGS/backend.pid"  "backend"
stop_pid "$LOGS/frontend.pid" "frontend"

# Sweep stragglers by port
sweep_port() {
  local port="$1"
  local pids
  pids=$(lsof -ti "tcp:$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "Sweeping stragglers on :$port ($pids)"
    echo "$pids" | xargs -r kill -TERM 2>/dev/null || true
    sleep 1
    pids=$(lsof -ti "tcp:$port" 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
      echo "$pids" | xargs -r kill -KILL 2>/dev/null || true
    fi
  fi
}

sweep_port 8001
sweep_port 3782

echo "Done."
