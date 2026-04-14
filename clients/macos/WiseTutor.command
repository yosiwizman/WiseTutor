#!/bin/bash
URL="https://ai-desktop-system-product-name.tail1f13f5.ts.net"
if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --app="$URL" &
else
  open "$URL"
fi
