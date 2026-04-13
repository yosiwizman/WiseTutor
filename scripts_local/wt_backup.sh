#!/usr/bin/env bash
set -euo pipefail

REPO=/home/ai-desktop/projects/WiseTutor
BACKUP_DIR="$REPO/backups"
mkdir -p "$BACKUP_DIR"

TS=$(date -u +%Y%m%dT%H%M%SZ)
ARCHIVE="$BACKUP_DIR/wt-backup-$TS.tar.gz"
MANIFEST="$BACKUP_DIR/wt-backup-$TS.manifest"

echo "Creating backup: $ARCHIVE"

# Build archive from REPO root, include data/ (excluding *.log) and .env
tar -czf "$ARCHIVE" -C "$REPO" \
  --exclude='data/*.log' \
  --exclude='data/**/*.log' \
  data/ \
  .env

BYTESIZE=$(stat -c%s "$ARCHIVE")

if (( BYTESIZE < 1024 )); then
  echo "WARN backup unusually small ($BYTESIZE bytes)"
fi

# Write manifest sidecar
{
  echo "# WiseTutor backup manifest"
  echo "date: $TS"
  echo "git_head: $(git -C "$REPO" rev-parse HEAD)"
  echo "tar_size_bytes: $BYTESIZE"
  echo "archive: $ARCHIVE"
  echo "--- contents ---"
  tar -tzf "$ARCHIVE"
} > "$MANIFEST"

echo "Archive : $ARCHIVE"
echo "Manifest: $MANIFEST"
echo "Size    : $BYTESIZE bytes"

# Retention: prune backups older than 14 days unless backups/keep.txt exists
if [[ ! -f "$BACKUP_DIR/keep.txt" ]]; then
  find "$BACKUP_DIR" -name 'wt-backup-*.tar.gz' -mtime +14 -delete
  find "$BACKUP_DIR" -name 'wt-backup-*.manifest' -mtime +14 -delete
fi

exit 0
