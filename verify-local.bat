@echo off
cd /d "%~dp0"
(
echo === Verification run %date% %time% ===
curl -sS -o nul -w "FRONTEND localhost:3000 status=%%{http_code}\n" --max-time 90 http://localhost:3000 2>&1
curl -sS -o nul -w "FRONTEND 127.0.0.1:3000 status=%%{http_code}\n" --max-time 90 http://127.0.0.1:3000 2>&1
curl -sS -o nul -w "FRONTEND [::1]:3000 status=%%{http_code}\n" --max-time 90 "http://[::1]:3000" 2>&1
curl -sS -o nul -w "BACKEND  localhost:8000 status=%%{http_code}\n" --max-time 30 http://localhost:8000 2>&1
netstat -ano | findstr ":3000" | findstr "LISTENING"
curl -s --max-time 90 http://127.0.0.1:3000 -o .frontend_home.html 2>&1
echo Done
) > .local-verify.txt 2>&1
exit
