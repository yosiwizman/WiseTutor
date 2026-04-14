#!/usr/bin/env bash
# wt_launch.sh — Start WiseTutor and open Chrome in app mode (no-terminal launch path)
# Usage: double-click or run from GNOME launcher. Do NOT run with 'bash' in a terminal if
# you want the GUI experience; it still works, just shows logs in the terminal.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${REPO_DIR}/logs/launcher.log"
TARGET_URL="http://100.109.173.59:3782"
START_SCRIPT="${REPO_DIR}/scripts_local/wt_start.sh"

mkdir -p "${REPO_DIR}/logs"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

fail_dialog() {
    local msg="$1"
    log "ERROR: ${msg}"
    if command -v zenity &>/dev/null; then
        zenity --error --text="${msg}" &
    else
        echo "ERROR: ${msg}" >&2
    fi
    exit 1
}

log "=== WiseTutor launch started ==="

# --- Step 1: Start backend/frontend ---
log "Running wt_start.sh ..."
START_OUTPUT="$("${START_SCRIPT}" 2>&1)"
log "wt_start.sh output: ${START_OUTPUT}"

if echo "${START_OUTPUT}" | grep -q "^OK"; then
    log "wt_start.sh reported OK"
else
    fail_dialog "WiseTutor did not start. Run wt_health.sh for details."
fi

# --- Step 2: Poll until service is reachable (up to 30 s) ---
log "Polling ${TARGET_URL} ..."
WAIT=0
MAX_WAIT=30
until curl -sf "${TARGET_URL}/" &>/dev/null; do
    if [ "${WAIT}" -ge "${MAX_WAIT}" ]; then
        fail_dialog "WiseTutor did not start. Run wt_health.sh for details."
    fi
    sleep 1
    WAIT=$((WAIT + 1))
done
log "Service is up after ${WAIT}s"

# --- Step 3: Open Chrome in app mode, detached ---
if [[ "${WT_LAUNCH_SKIP_BROWSER:-0}" == "1" ]]; then
  echo "WT_LAUNCH_SKIP_BROWSER=1 — skipping Chrome open (launcher-proof test)"
  exit 0
fi
log "Opening Chrome: ${TARGET_URL}"
google-chrome --app="${TARGET_URL}" >> "${LOG_FILE}" 2>&1 &

log "=== Launch complete. Chrome opened in app mode. ==="
exit 0
