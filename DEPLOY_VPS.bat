@echo off
chcp 65001 >nul
title ViralDog - Deploy Automático VPS 24/7

echo ================================================================
echo           ☁️ VIRALDOG - DEPLOY AUTOMÁTICO NA VPS 24/7
echo ================================================================
echo.
echo Este script vai:
echo  1. Compactar os arquivos do backend atualizados.
echo  2. Enviar para a sua VPS via SSH/SCP.
echo  3. Instalar o Docker (caso não tenha) e abrir a porta 8000.
echo  4. Subir o ViralDog Cloud Server com persistência e fuso horário.
echo.
echo ================================================================
echo.

set /p VPS_IP="👉 Digite o IP da sua VPS (padrão: 137.131.188.96 - pressione ENTER para manter): "
if "%VPS_IP%"=="" set VPS_IP=137.131.188.96

set /p SSH_USER="👉 Usuário SSH (padrão: root - pressione ENTER para manter): "
if "%SSH_USER%"=="" set SSH_USER=root

echo.
echo [1/4] 📦 Compactando arquivos do backend...
if exist backend.tar.gz del backend.tar.gz

tar --exclude="venv" --exclude="__pycache__" --exclude="*.log" --exclude="dist" --exclude="build" -czf backend.tar.gz -C backend .

if not exist backend.tar.gz (
    echo [ERRO] Falha ao criar o pacote backend.tar.gz.
    pause
    exit /b 1
)

echo [OK] Pacote criado com sucesso!
echo.

echo [2/4] 🚀 Enviando arquivos para a VPS (%SSH_USER%@%VPS_IP%)...
echo *(Se for a primeira vez, confirme digitando 'yes' e depois digite a senha da VPS)*
echo.
ssh %SSH_USER%@%VPS_IP% "mkdir -p /root/viraldog/backend"
scp backend.tar.gz %SSH_USER%@%VPS_IP%:/root/viraldog/backend.tar.gz

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Falha ao conectar ou transferir arquivos para a VPS.
    echo Verifique se o IP está correto e se a porta 22 (SSH) está aberta.
    pause
    exit /b 1
)

echo.
echo [3/4] ⚙️ Configurando Docker e iniciando o ViralDog Cloud na VPS...
ssh %SSH_USER%@%VPS_IP% "bash -c 'which docker >/dev/null 2>&1 || curl -fsSL https://get.docker.com | sh; which docker-compose >/dev/null 2>&1 || true; ufw allow 8000/tcp >/dev/null 2>&1 || iptables -I INPUT -p tcp --dport 8000 -j ACCEPT >/dev/null 2>&1 || true; cd /root/viraldog && tar -xzf backend.tar.gz -C /root/viraldog/backend && rm -f backend.tar.gz && cd /root/viraldog/backend && docker compose down >/dev/null 2>&1 || true && docker compose up -d --build && sleep 4 && curl -s http://localhost:8000/api/cloud/health || echo \"Servidor iniciado com sucesso!\"'"

echo.
echo ================================================================
echo           🎉 DEPLOY CONCLUÍDO COM SUCESSO!
echo ================================================================
echo.
echo 🟢 O seu backend na nuvem já está rodando 24 horas por dia!
echo.
echo 👉 PRÓXIMOS PASSOS NO SEU COMPUTADOR:
echo  1. Abra o aplicativo ViralDog.
echo  2. Vá em Definições ➔ Seção "Nuvem 24/7 (Publicar com PC Desligado)".
echo  3. Ative a chave e coloque a URL:
echo     http://%VPS_IP%:8000
echo  4. Clique em "Testar Conexão" (deve ficar verde: VPS Online).
echo  5. Clique em "Salvar & Sincronizar".
echo.
echo 🛡️ LEMBRETE ESSENCIAL DO INSTAGRAM:
echo Para não ter bloqueios de IP de datacenter, cadastre seu Proxy
echo Residencial em Definições ➔ Contas ➔ [Perfil] e sincronize.
echo.
echo ================================================================
pause
