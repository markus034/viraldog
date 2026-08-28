@echo off
setlocal
cd /d "%~dp0"

echo [BUILD] ViralDog Backend - PyInstaller Build
echo =============================================

:: Verify venv exists
if not exist "venv\Scripts\python.exe" (
    echo [ERRO] venv nao encontrado. Rode build.bat da raiz do projeto para criar o venv.
    exit /b 1
)

:: Install/upgrade pyinstaller
echo [INFO] Instalando PyInstaller...
venv\Scripts\python.exe -m pip install pyinstaller --quiet
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar PyInstaller.
    exit /b 1
)

:: Clean previous build
echo [INFO] Limpando builds anteriores...
if exist "dist\main" rmdir /s /q "dist\main"
if exist "build\main" rmdir /s /q "build\main"

:: Run PyInstaller
echo [INFO] Rodando PyInstaller (pode demorar alguns minutos)...
venv\Scripts\python.exe -m PyInstaller viraldog.spec --noconfirm
if %errorlevel% neq 0 (
    echo [ERRO] Falha no build do PyInstaller.
    exit /b 1
)

:: Copy initial empty database (if not exists in output)
if not exist "dist\main\database.db" (
    echo [INFO] Copiando database.db inicial vazio...
    if exist "database.db" copy /y "database.db" "dist\main\database.db" >nul
)

:: Copy routers directory (in case PyInstaller misses it)
echo [INFO] Copiando routers...
if not exist "dist\main\routers" mkdir "dist\main\routers"
xcopy /e /y /q "routers\*" "dist\main\routers\" >nul

:: Copy templates directory (overlay images, etc.)
echo [INFO] Copiando templates...
if not exist "dist\main\templates" mkdir "dist\main\templates"
if exist "templates" xcopy /e /y /q "templates\*" "dist\main\templates\" >nul

:: Copy fonts directory
echo [INFO] Copiando fonts...
if not exist "dist\main\fonts" mkdir "dist\main\fonts"
if exist "fonts" xcopy /e /y /q "fonts\*" "dist\main\fonts\" >nul
if not exist "dist\main\_internal\fonts" mkdir "dist\main\_internal\fonts"
if exist "fonts" xcopy /e /y /q "fonts\*" "dist\main\_internal\fonts\" >nul

:: Ensure ffmpeg.exe exists directly in dist/main and dist/main/_internal
echo [INFO] Garantindo binario FFmpeg no pacote...
for /r "venv\Lib\site-packages\imageio_ffmpeg\binaries" %%f in (*ffmpeg*.exe) do (
    copy /y "%%f" "dist\main\ffmpeg.exe" >nul
    copy /y "%%f" "dist\main\_internal\ffmpeg.exe" >nul
)

echo.
echo [OK] Backend compilado com sucesso em: dist\main\
echo      Arquivo principal: dist\main\main.exe
echo.

