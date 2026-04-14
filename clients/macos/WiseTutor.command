#!/bin/bash
URL="http://ai-desktop-system-product-name:3782"
if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --app="$URL" &
else
  open "$URL"
fi
