#!/usr/bin/env bash
REPO="/home/ai-desktop/projects/DeepTutor"
LOGS="$REPO/logs"
check() {
  local name=$1 port=$2
  if curl -sf -o /dev/null "http://localhost:$port"; then
    echo "  $name (:$port) — UP"
  else
    echo "  $name (:$port) — DOWN"
  fi
}
echo "DeepTutor status:"
check Backend 8001
check Frontend 3782
echo
echo "Ports in use:"
ss -ltnp 2>/dev/null | grep -E ":(8001|3782) " || echo "  (none)"
echo
echo "Logs: $LOGS/"
ls -la "$LOGS" 2>/dev/null | tail -n +2
