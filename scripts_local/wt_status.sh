#!/usr/bin/env bash
set -euo pipefail

REPO=/home/ai-desktop/projects/WiseTutor
LOGS="$REPO/logs"

check_service() {
  local label="$1"
  local pidfile="$2"
  local port="$3"

  local pid="(no pidfile)"
  local proc_status="dead"
  local port_status="unreachable"

  if [[ -f "$pidfile" ]]; then
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      proc_status="alive"
    else
      proc_status="dead (stale pidfile)"
    fi
  fi

  if curl -sf "http://localhost:$port/" > /dev/null 2>&1 || \
     curl -sf "http://localhost:$port/docs" > /dev/null 2>&1; then
    port_status="reachable"
  fi

  printf "%-10s  PID=%-8s  process=%-20s  port:%s=%s\n" \
    "$label" "$pid" "$proc_status" "$port" "$port_status"
}

check_service "backend"  "$LOGS/backend.pid"  8001
check_service "frontend" "$LOGS/frontend.pid" 3782

# Ollama informational
if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo "ollama     :11434 reachable (informational)"
else
  echo "ollama     :11434 unreachable (informational)"
fi

# Exit code: 0 if both reachable
BACKEND_OK=0
FRONTEND_OK=0
curl -sf http://localhost:8001/docs > /dev/null 2>&1  && BACKEND_OK=1
curl -sf http://localhost:3782/    > /dev/null 2>&1  && FRONTEND_OK=1

if [[ $BACKEND_OK -eq 1 && $FRONTEND_OK -eq 1 ]]; then
  exit 0
else
  exit 1
fi
