#!/bin/bash
URL="http://100.109.173.59:3782"
if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --app="$URL" &
else
  open "$URL"
fi
