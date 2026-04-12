#!/usr/bin/env bash
REPO="/home/ai-desktop/projects/DeepTutor"
LOGS="$REPO/logs"
for name in backend frontend; do
  pidfile="$LOGS/$name.pid"
  if [[ -f "$pidfile" ]]; then
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping $name (PID $pid)..."
      pkill -P "$pid" 2>/dev/null
      kill "$pid" 2>/dev/null
      sleep 1
      kill -9 "$pid" 2>/dev/null
    fi
    rm -f "$pidfile"
  fi
done
# Kill any stragglers bound to our ports
for port in 8001 3782; do
  pid=$(lsof -ti tcp:$port 2>/dev/null)
  [[ -n "$pid" ]] && kill $pid 2>/dev/null
done
echo "DeepTutor stopped."
