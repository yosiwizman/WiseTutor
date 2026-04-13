#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Ensure CRLF line endings on Windows files
for f in WiseTutor.bat WiseTutor.url install-wisetutor.ps1 README.txt; do
  if command -v unix2dos &>/dev/null; then
    unix2dos "$f" 2>/dev/null || true
  else
    # Convert LF to CRLF via sed if not already CRLF
    sed -i 's/\r$//' "$f"          # strip any existing CR
    sed -i 's/$/\r/' "$f"          # add CR before every LF
  fi
done

DIST_DIR="$SCRIPT_DIR/../../dist"
mkdir -p "$DIST_DIR"
ZIP_PATH="$(realpath "$DIST_DIR")/wisetutor-windows-launcher.zip"

rm -f "$ZIP_PATH"
zip -r "$ZIP_PATH" WiseTutor.bat WiseTutor.url install-wisetutor.ps1 README.txt

BYTES=$(wc -c < "$ZIP_PATH")
echo "Built: $ZIP_PATH ($BYTES bytes)"
