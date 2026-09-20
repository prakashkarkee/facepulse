@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo FacePulse needs Node.js 18 or newer. Download it from https://nodejs.org/
  pause
  exit /b 1
)
echo Open http://127.0.0.1:8765 in Chrome after the server starts.
node server.mjs
pause
