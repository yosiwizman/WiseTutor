#!/usr/bin/env bash
set -euo pipefail

REPO=/home/ai-desktop/projects/WiseTutor
DRY_RUN=false

usage() {
  echo "Usage: $0 [--dry-run] <backup-file.tar.gz>"
  exit 1
}

# Parse args
POSITIONAL=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -*) echo "Unknown flag: $arg"; usage ;;
    *) POSITIONAL+=("$arg") ;;
  esac
done

if [[ ${#POSITIONAL[@]} -ne 1 ]]; then
  usage
fi

BACKUP_FILE="${POSITIONAL[0]}"

# Validate backup file exists and is a gzip tar
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: backup file not found: $BACKUP_FILE"
  exit 1
fi

if ! file "$BACKUP_FILE" | grep -q 'gzip'; then
  echo "ERROR: file does not appear to be a gzip archive: $BACKUP_FILE"
  exit 1
fi

# Show manifest if present
MANIFEST="${BACKUP_FILE%.tar.gz}.manifest"
if [[ -f "$MANIFEST" ]]; then
  echo "=== MANIFEST ==="
  cat "$MANIFEST"
  echo "=== END MANIFEST ==="
else
  echo "NOTE: no sidecar manifest found for this backup"
fi

TS=$(date -u +%Y%m%dT%H%M%SZ)
DATA_ASIDE="$REPO/data.pre-restore-$TS"
ENV_ASIDE="$REPO/.env.pre-restore-$TS"

echo ""
echo "Restore plan:"
echo "  Backup file : $BACKUP_FILE"
echo "  Move data/  : $REPO/data/ -> $DATA_ASIDE"
echo "  Copy .env   : $REPO/.env  -> $ENV_ASIDE"
echo "  Extract to  : $REPO"

if $DRY_RUN; then
  echo ""
  echo "DRY-RUN mode: no changes made."
  exit 0
fi

# Move current data/ aside
if [[ -d "$REPO/data" ]]; then
  mv "$REPO/data" "$DATA_ASIDE"
  echo "Moved data/ to $DATA_ASIDE"
fi

# Copy current .env aside (preserve mode)
if [[ -f "$REPO/.env" ]]; then
  cp -p "$REPO/.env" "$ENV_ASIDE"
  chmod 600 "$ENV_ASIDE"
  echo "Copied .env to $ENV_ASIDE"
fi

# Extract backup
tar -xzf "$BACKUP_FILE" -C "$REPO"
echo "Extraction complete."

# Verify post-restore
if [[ ! -f "$REPO/data/users.json" ]]; then
  echo "ERROR: post-restore verification failed: data/users.json not found"
  exit 1
fi

# Ensure .env is mode 600
if [[ -f "$REPO/.env" ]]; then
  chmod 600 "$REPO/.env"
fi

echo ""
echo "RESTORED FROM $BACKUP_FILE"
echo "Pre-restore data sidecar : $DATA_ASIDE"
echo "Pre-restore .env sidecar : $ENV_ASIDE"
echo "(To roll back manually: rm -rf $REPO/data && mv $DATA_ASIDE $REPO/data)"
