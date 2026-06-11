@echo off
echo === WB Output Monitor — Build ===

call npm run build
if errorlevel 1 (
    echo BUILD FAILED
    pause
    exit /b 1
)

echo.
echo BUILD COMPLETE
echo.
echo Copy this folder to the server:
echo   FROM: %~dp0.svelte-kit\adapter-iis\app\
echo   TO:   D:\wire bond output\wire bond output\  (on mth-dk-b12416)
echo.
echo Then restart the Node.js process on the server.
pause
