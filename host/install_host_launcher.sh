#!/usr/bin/env bash
# install_host_launcher.sh — Install WiseTutor desktop launchers and user systemd unit.
# Idempotent: safe to re-run. Does NOT start the service.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_DIR="${REPO_DIR}/host"

DESKTOP_FILE="${HOST_DIR}/wisetutor.desktop"
STOP_DESKTOP_FILE="${HOST_DIR}/wisetutor-stop.desktop"
SERVICE_FILE="${HOST_DIR}/wisetutor.service"

DESKTOP_DEST="${HOME}/Desktop"
APP_DEST="${HOME}/.local/share/applications"
SYSTEMD_DEST="${HOME}/.config/systemd/user"

echo "=== WiseTutor Host Launcher Installer ==="

# --- Desktop icons ---
mkdir -p "${DESKTOP_DEST}" "${APP_DEST}"

for src in "${DESKTOP_FILE}" "${STOP_DESKTOP_FILE}"; do
    fname="$(basename "${src}")"

    cp "${src}" "${DESKTOP_DEST}/${fname}"
    chmod +x "${DESKTOP_DEST}/${fname}"
    echo "Installed: ${DESKTOP_DEST}/${fname}"

    cp "${src}" "${APP_DEST}/${fname}"
    chmod +x "${APP_DEST}/${fname}"
    echo "Installed: ${APP_DEST}/${fname}"

    # Mark as trusted so GNOME won't show the "untrusted launcher" dialog
    if command -v gio &>/dev/null; then
        gio set "${DESKTOP_DEST}/${fname}" metadata::trusted true 2>/dev/null \
            && echo "  trusted: ${DESKTOP_DEST}/${fname}" \
            || echo "  gio trust failed (non-fatal): ${DESKTOP_DEST}/${fname}"
        gio set "${APP_DEST}/${fname}" metadata::trusted true 2>/dev/null \
            && echo "  trusted: ${APP_DEST}/${fname}" \
            || echo "  gio trust failed (non-fatal): ${APP_DEST}/${fname}"
    else
        echo "  gio not available — skipping trust flag (non-fatal)"
    fi
done

# --- User systemd unit ---
mkdir -p "${SYSTEMD_DEST}"
cp "${SERVICE_FILE}" "${SYSTEMD_DEST}/wisetutor.service"
echo "Installed: ${SYSTEMD_DEST}/wisetutor.service"

systemctl --user daemon-reload
echo "systemd user daemon reloaded"

systemctl --user enable wisetutor.service
echo "Unit enabled: wisetutor.service (will auto-start on graphical login)"

echo ""
echo "=== Installation complete ==="
echo "  Desktop icons : ${DESKTOP_DEST}/"
echo "  App grid      : ${APP_DEST}/"
echo "  Systemd unit  : ${SYSTEMD_DEST}/wisetutor.service"
echo ""
echo "NOTE: To start WiseTutor NOW, run:"
echo "  systemctl --user start wisetutor.service"
echo "  -- or --"
echo "  Double-click the 'WiseTutor' icon on the Desktop"
