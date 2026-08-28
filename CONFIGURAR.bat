@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo =====================================================
2: echo   VIRALDOG - CONFIGURADOR DE AMBIENTE LOCAL
3: echo =====================================================
echo.
echo Este script configurara todas as dependencias necessarias
echo para rodar o ViralDog localmente no seu computador.
echo.

:: 1. Verificar instalacao do Node.js
echo [1/5] Verificando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao foi encontrado no seu computador!
    echo Por favor, instale o Node.js v18 ou superior.
    echo Baixe em: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js detectado.

:: 2. Verificar instalacao do Python
echo.
echo [2/5] Verificando Python...
set PYTHON_CMD=python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe" (
        set PYTHON_CMD="%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe"
        echo [OK] Python detectado localmente em AppData.
    ) else (
        echo [ERRO] Python nao foi encontrado no seu computador!
        echo Por favor, instale o Python 3.10 ou superior e marque a opcao "Add Python to PATH".
        echo Baixe em: https://www.python.org/
        echo.
        pause
        exit /b 1
    )
) else (
    echo [OK] Python detectado.
)

:: 3. Configurar ambiente Python (venv) e dependencias do Backend
echo.
echo [3/5] Configurando ambiente virtual Python e dependencias...
if not exist "backend\venv" (
    echo [INFO] Criando ambiente virtual Python...
    %PYTHON_CMD% -m venv backend\venv
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao criar ambiente virtual Python.
        pause
        exit /b 1
    )
)

echo [INFO] Instalando pacotes do backend (requirements.txt)...
call backend\venv\Scripts\activate.bat
pip install -r backend\requirements.txt
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar dependencias do backend.
    pause
    exit /b 1
)
echo [OK] Dependencias do backend configuradas.

:: 4. Instalar dependencias do Frontend e Electron, e gerar o build
echo.
echo [4/5] Instalando dependencias do Frontend e Electron...
echo [INFO] Instalando dependencias do frontend...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo [ERRO] Falha no npm install do frontend.
    cd ..
    pause
    exit /b 1
)
echo [INFO] Compilando frontend (Vite)...
call npm run build
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao compilar o frontend.
    cd ..
    pause
    exit /b 1
)
cd ..

echo [INFO] Instalando dependencias do Electron...
cd electron
call npm install
if %errorlevel% neq 0 (
    echo [ERRO] Falha no npm install do Electron.
    cd ..
    pause
    exit /b 1
)
cd ..
echo [OK] Frontend e Electron configurados.

:: 5. Criar os atalhos locais na Area de Trabalho e na Inicializacao
echo.
echo [5/5] Configurando atalhos locais...
node configurar_atalhos.js
if %errorlevel% neq 0 (
    echo [AVISO] Nao foi possivel criar os atalhos automaticamente, mas a configuracao foi concluida.
) else (
    echo [OK] Atalhos de inicializacao configurados.
)

echo.
echo =====================================================
echo  CONFIGURACAO CONCLUIDA COM SUCESSO!
echo =====================================================
echo.
echo Agora voce pode abrir o aplicativo a partir do atalho
echo "ViralDog" na sua Area de Trabalho ou executando:
echo.
echo   - ViralDog.vbs (inicia em segundo plano)
echo   - iniciar.bat (inicia com janela de logs)
echo.
pause
