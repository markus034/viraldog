# ☁️ Guia de Instalação e Deploy da VPS 24/7 (ViralDog)

Este guia ensina como rodar o backend do **ViralDog na Nuvem (VPS)** em 5 minutos para que seus vídeos e agendamentos sejam publicados no Instagram/TikTok **24 horas por dia, 7 dias por semana, mesmo quando seu computador estiver desligado**.

---

## 🖥️ 1. Requisitos da VPS
Você pode contratar uma VPS em qualquer provedor (ex: **Hostinger, DigitalOcean, Hetzner, AWS, Oracle Cloud ou Contabo**):
- **Sistema Operacional**: Ubuntu 22.04 LTS ou Ubuntu 24.04 LTS
- **Configuração mínima**: 1 vCPU, 1 GB ou 2 GB de RAM, 20 GB SSD
- **Preço médio**: ~$4 a $5/mês

---

## 🚀 2. Instalando o Docker na sua VPS

Acesse sua VPS via terminal/SSH:
```bash
ssh root@SEU_IP_DA_VPS
```

Instale o Docker e o Docker Compose com um único comando:
```bash
curl -fsSL https://get.docker.com | sh
```

---

## 📦 3. Subindo o Backend do ViralDog

1. Crie uma pasta para o projeto e copie a pasta `backend/` para sua VPS:
```bash
mkdir -p /root/viraldog
cd /root/viraldog
```

*(Você pode clonar seu repositório Git ou copiar os arquivos do backend)*

2. Dentro da pasta `backend/`, inicie o serviço com Docker Compose:
```bash
cd backend
docker compose up -d --build
```

Pronto! O backend do ViralDog e o **Scheduler Daemon 24/7** já estão rodando em background na porta `8000`.

---

## 🔒 4. (Opcional) Configurar Chave de Segurança

Para proteger sua VPS de acessos externos não autorizados, edite o arquivo `.env` ou o `docker-compose.yml`:
```yaml
environment:
  - VIRALDOG_API_KEY=minha_senha_super_secreta_123
```
E reinicie o container:
```bash
docker compose up -d
```

---

## ⚙️ 5. Conectando o ViralDog Desktop à sua VPS

1. No seu computador, abra o **ViralDog**.
2. Vá na aba **Definições** (Configurações).
3. Na seção **Nuvem 24/7 (Publicar com PC Desligado)**:
   - Ative o botão do switch.
   - Digite a **URL da VPS**: `http://SEU_IP_DA_VPS:8000` (ou seu domínio HTTPS se tiver configurado Nginx/SSL).
   - Digite sua **Chave de Segurança** (caso tenha configurado `VIRALDOG_API_KEY`).
   - Clique em **"Testar Conexão"** (deve aparecer 🟢 *VPS Online*).
   - Clique em **"Salvar & Sincronizar"** (as contas cadastradas e cookies serão enviados para a VPS).

---

## 🎬 6. Como Agendar Posts

Agora, sempre que você usar o **Agendamento em Massa IA** ou agendar um post:
1. O ViralDog faz o upload dos arquivos de vídeo `.mp4` para o disco da VPS com barra de progresso em tempo real.
2. Os agendamentos são registrados no banco de dados da nuvem.
3. Você pode **desligar o seu computador** normalmente!
4. O daemon na VPS irá publicar cada post exatamente no dia e horário agendados.

---

## 📋 Comandos Úteis na VPS

- **Ver logs de publicação em tempo real**:
  ```bash
  docker logs -f viraldog-cloud
  ```
- **Reiniciar o servidor**:
  ```bash
  docker restart viraldog-cloud
  ```
- **Parar o servidor**:
  ```bash
  docker compose down
  ```
