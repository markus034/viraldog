@echo off

setlocal
cd /d %~dp0

echo ===================================================
echo               VIRALDOG - INICIALIZADOR
echo ===================================================
echo.

:: 1. Verificar instalacao do Python (Global ou Local)
set PYTHON_CMD=python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe" (
        set PYTHON_CMD="%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe"
        echo [INFO] Python detectado localmente em AppData.
    ) else (
        echo [ERRO] Python nao foi encontrado no PATH ou no local padrao.
        echo Por favor, verifique se a instalacao do Python foi concluida com sucesso.
        echo.
        pause
        exit /b 1
    )
)

:: 2. Criar ambiente virtual se nao existir
if not exist "backend\venv" (
    echo [INFO] Criando ambiente virtual Python [venv] no backend...
    %PYTHON_CMD% -m venv backend\venv
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao criar o ambiente virtual Python.
        pause
        exit /b 1
      )
)

:: 3. Ativar venv e instalar/atualizar dependencias
echo [INFO] Instalando/Atualizando dependencias do backend (requirements.txt)...
call backend\venv\Scripts\activate
pip install -r backend\requirements.txt
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar as dependencias do backend.
    pause
    exit /b 1
)


:: 4. Iniciar o Backend FastAPI em segundo plano
echo [INFO] Iniciando servidor do Backend FastAPI em http://localhost:8000...
start "ViralDog Backend" /b cmd /c "backend\venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000"

:: 5. Iniciar o Frontend React (Vite)
echo [INFO] Iniciando servidor de desenvolvimento do Frontend React...
echo [INFO] O aplicativo devera abrir em seu navegador em http://localhost:5173
cd frontend
cmd /c npm run dev

pause
