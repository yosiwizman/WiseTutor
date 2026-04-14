@echo off
REM WiseTutor launcher — opens the hosted app in a standalone window.
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=https://ai-desktop-system-product-name.tail1f13f5.ts.net
if errorlevel 1 (
  start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --app=https://ai-desktop-system-product-name.tail1f13f5.ts.net
)
if errorlevel 1 (
  start "" msedge.exe --app=https://ai-desktop-system-product-name.tail1f13f5.ts.net
)
