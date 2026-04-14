@echo off
REM WiseTutor launcher — opens the hosted app in a standalone window.
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://ai-desktop-system-product-name:3782
if errorlevel 1 (
  start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --app=http://ai-desktop-system-product-name:3782
)
if errorlevel 1 (
  start "" msedge.exe --app=http://ai-desktop-system-product-name:3782
)
