@echo off
title MEAT CITY - Executive Dashboard
color 0A
echo ================================================================
echo        MEAT CITY - Ta'sischilar Moliyaviy Dashboardi
echo ================================================================
echo.
echo [1/3] Modullarni tekshirish...
cd backend
if not exist node_modules (
    echo Modullar yuklanmoqda (npm install)...
    call npm.cmd install
)
echo.
echo [2/3] Cloudflare Global Tunnel ishga tushirilmoqda...
cd ..
start "Cloudflare Global Tunnel" /min cloudflared.exe tunnel --url http://localhost:3000
echo.
echo [3/3] Dashboard Server ishga tushirilmoqda...
start http://localhost:3000
cd backend
node server.js
pause
