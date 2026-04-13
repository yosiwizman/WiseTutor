#!/bin/bash
URL="http://192.168.1.133:3782"
if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --app="$URL" &
else
  open "$URL"
fi
