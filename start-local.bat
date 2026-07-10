@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Creativals OS - Local Development Startup
echo ============================================
echo.

where php >nul 2>nul
if errorlevel 1 (
    echo [ERROR] PHP not found in PATH.
    echo Install PHP 8.3+ ^(e.g. Laravel Herd: https://herd.laravel.com^) and retry.
    pause
    exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found in PATH. Install Node.js 20+ and retry.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('php -r "echo PHP_VERSION;"') do set PHP_VER=%%v
echo Found PHP %PHP_VER%
for /f "delims=" %%v in ('node -v') do echo Found Node %%v
echo.

if not exist "frontend\node_modules\next\package.json" (
    echo Installing frontend dependencies...
    pushd frontend
    call npm install
    popd
)

echo Running database migrations...
pushd backend
php artisan migrate --force
if errorlevel 1 (
    echo [WARNING] Migrations reported an error - check output above.
)
popd
echo.

echo Starting backend on http://localhost:8000 ...
start "Creativals Backend - php artisan serve" cmd /k "cd /d %~dp0backend && php artisan serve --host=127.0.0.1 --port=8000"

echo Waiting for backend to become ready...
set /a HEALTH_TRIES=0
:wait_backend
set /a HEALTH_TRIES+=1
curl -s -o nul -f http://localhost:8000/api/v1/health >nul 2>nul
if not errorlevel 1 goto backend_ready
if %HEALTH_TRIES% geq 30 goto backend_timeout
timeout /t 1 /nobreak >nul
goto wait_backend

:backend_timeout
echo [WARNING] Backend did not respond within 30 seconds.
echo Check the "Creativals Backend" window for errors - login will fail
echo until the backend is running.
goto start_frontend

:backend_ready
echo [OK] Backend is up and responding.

:start_frontend
echo.
echo Starting frontend on http://localhost:3000 ...
start "Creativals Frontend - next dev" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ============================================
echo   Backend  API : http://localhost:8000
echo   Frontend App : http://localhost:3000
echo ============================================
echo Two terminal windows opened - keep BOTH running.
echo IMPORTANT: Login fails if the backend window is closed.
echo Close this window anytime.
pause
