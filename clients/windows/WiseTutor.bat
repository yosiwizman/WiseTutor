@echo off
REM WiseTutor launcher — opens the hosted app in a standalone window.
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://100.109.173.59:3782
if errorlevel 1 (
  start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --app=http://100.109.173.59:3782
)
if errorlevel 1 (
  start "" msedge.exe --app=http://100.109.173.59:3782
)
