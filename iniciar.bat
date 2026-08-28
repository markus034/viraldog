@echo off
cd /d "%~dp0"

:: 1. Finalizar processos antigos nas portas 8000 e 8001 para evitar conflitos
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Encerra processos antigos do Node e Electron
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im electron.exe >nul 2>&1

:: 2. Rodar build do frontend para aplicar as modificacoes
cd frontend
cmd /c npm run build
cd ..

:: 3. Iniciar o Electron
cd electron
cmd /c npm start
