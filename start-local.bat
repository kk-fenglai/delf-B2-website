@echo off
REM DELFluent local dev launcher
REM   backend  -> http://localhost:4000
REM   frontend -> http://localhost:5180 (fixed port so it never collides with other Vite projects on 5173)
REM Close the two opened cmd windows to stop the servers.

cd /d "%~dp0"

if not exist backend\node_modules (
  echo [setup] backend\node_modules missing, running npm install...
  pushd backend
  call npm install
  popd
)
if not exist frontend\node_modules (
  echo [setup] frontend\node_modules missing, running npm install...
  pushd frontend
  call npm install
  popd
)

start "DELFluent backend :4000" cmd /k "cd /d %~dp0backend && npm run dev"
start "DELFluent frontend :5180" cmd /k "cd /d %~dp0frontend && npm run dev -- --port 5180 --strictPort"

echo Waiting for dev servers to boot...
timeout /t 8 /nobreak >nul
start http://localhost:5180/
echo Browser opened at http://localhost:5180 - close the two cmd windows to stop.
