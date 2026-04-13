#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Ensure executables have +x before zipping
chmod +x WiseTutor.app/Contents/MacOS/WiseTutor
chmod +x WiseTutor.command

ZIP_PATH="../../dist/wisetutor-macos-launcher.zip"

# Remove stale zip if present
rm -f "$ZIP_PATH"

# -r recursive, -y preserve symlinks, -X no extra file attributes
zip -r -y -X "$ZIP_PATH" WiseTutor.app WiseTutor.command README.txt

FULL_PATH="$(cd "$(dirname "$ZIP_PATH")" && pwd)/$(basename "$ZIP_PATH")"
SIZE=$(stat -c%s "$FULL_PATH")
echo "Built: $FULL_PATH ($SIZE bytes)"

# Smoke-check: verify plist is readable inside the zip
echo ""
echo "Plist smoke-check (first 3 lines):"
unzip -p "$ZIP_PATH" WiseTutor.app/Contents/Info.plist | head -3
