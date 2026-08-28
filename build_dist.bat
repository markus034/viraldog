@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ===================================================================
echo     VIRALDOG - GERADOR DE INSTALADOR EXECUTAVEL COMERCIAL
echo ===================================================================
echo.

:: ── Verificar dependencias do sistema ────────────────────────────────
echo [1/5] Verificando dependencias locais do sistema...

set PYTHON_CMD=python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe" (
        set PYTHON_CMD="%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe"
    ) else if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python311\python.exe" (
        set PYTHON_CMD="%USERPROFILE%\AppData\Local\Programs\Python\Python311\python.exe"
    ) else (
        echo [ERRO] Python nao encontrado no sistema.
        pause
        exit /b 1
    )
)
echo [OK] Python detectado: %PYTHON_CMD%

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado. Instale Node.js 18+ em https://nodejs.org
    pause
    exit /b 1
)
echo [OK] Node.js detectado.

:: ── Passo 1: Build do Frontend React (Vite) ──────────────────────────
echo.
echo [2/5] Compilando Frontend React...
cd frontend
call npm install --silent
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar dependencias do Frontend.
    cd ..
    pause
    exit /b 1
)
call npm run build
if %errorlevel% neq 0 (
    echo [ERRO] Falha na compilacao do Frontend.
    cd ..
    pause
    exit /b 1
)
cd ..
echo [OK] Frontend compilado com sucesso em frontend\dist\

:: ── Passo 2: Build do Backend Python (PyInstaller) ────────────────────
echo.
echo [3/5] Compilando Backend Python com PyInstaller...
if not exist "backend\venv\Scripts\python.exe" (
    echo [INFO] Criando ambiente virtual Python backend\venv...
    %PYTHON_CMD% -m venv backend\venv
)
backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar dependencias Python.
    pause
    exit /b 1
)

call backend\build_backend.bat
if %errorlevel% neq 0 (
    echo [ERRO] Falha na compilacao do Backend com PyInstaller.
    pause
    exit /b 1
)
echo [OK] Backend compilado com sucesso em backend\dist\main\

:: ── Passo 3: Build do Instalador Electron com electron-builder ────────
echo.
echo [4/5] Empacotando Instalador Comercial do Windows...
cd electron
call npm install --silent
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar dependencias do Electron.
    cd ..
    pause
    exit /b 1
)

:: Limpar build anterior
if exist "dist" rmdir /s /q dist

set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run dist
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao gerar instalador com electron-builder.
    cd ..
    pause
    exit /b 1
)
cd ..

:: ── Passo 4: Gerar Pacote ZIP de Distribuicao e Guia do Cliente ───────
echo.
echo [5/5] Gerando Pacote ZIP de Distribuicao e Guia do Cliente...
set "DIST_DIR=dist_release"
if exist "%DIST_DIR%" rmdir /s /q "%DIST_DIR%"
mkdir "%DIST_DIR%"

:: Copiar instalador
copy /y "electron\dist\*.exe" "%DIST_DIR%\" >nul

:: Copiar Guia do Usuario
if exist "dist_release\COMO_INSTALAR.txt" (
    rem ok
) else (
    echo 1. Clique duas vezes no instalador ViralDog Setup para instalar o aplicativo. > "%DIST_DIR%\COMO_INSTALAR.txt"
)

:: Criar arquivo ZIP usando PowerShell
powershell -Command "Compress-Archive -Path '%DIST_DIR%\*.exe', '%DIST_DIR%\COMO_INSTALAR.txt' -DestinationPath '%DIST_DIR%\ViralDog-Setup-v1.1.0.zip' -Force"

echo.
echo ===================================================================
echo   BUILD CONCLUIDO COM SUCESSO! PACOTE PRONTO PARA DISTRIBUICAO!
echo.
echo   [1] Instalador EXE: dist_release\ViralDog Setup 1.1.0.exe
echo   [2] Pacote ZIP:     dist_release\ViralDog-Setup-v1.1.0.zip
echo   [3] Guia Cliente:   dist_release\COMO_INSTALAR.txt
echo ===================================================================
echo.
pause
