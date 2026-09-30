# ☁️ ViralDog Cloud Worker (Agendador 24/7 na Nuvem)

Este serviço permite que o **ViralDog publique automaticamente no Instagram** no horário agendado, **mesmo com o seu computador completamente desligado**.

---

## 🛠️ Como Funciona
1. Ao agendar um post no app ViralDog (com API Oficial conectada e Cloud Storage R2/S3 configurado), o app envia o vídeo para a nuvem e cadastra a tarefa no **Cloud Worker**.
2. O **Cloud Worker** roda 24 horas por dia em segundo plano na nuvem (Railway, Render ou VPS).
3. No minuto exato do agendamento, o Worker cria o container na **Meta Graph API v22.0**, aguarda o processamento e executa o `media_publish`.
4. Ao ligar o computador e reabrir o ViralDog, o app sincroniza o status do post (Marcando como *Publicado* com o link/ID do Instagram).

---

## 🚀 Opção 1: Deploy Rápido no Railway (Recomendado - 2 Minutos)

1. Acesse **[railway.app](https://railway.app/)** e crie uma conta gratuita.
2. Clique em **New Project** → **Deploy from GitHub repo** (ou suba via CLI `railway up` na pasta `cloud_worker`).
3. Nas variáveis de ambiente (**Variables**) do Railway, adicione:
   - `WORKER_SECRET_KEY`: crie uma senha/chave secreta (ex: `viraldog-minha-chave-2026`)
   - `PORT`: `8000`
4. Na aba **Settings** do serviço no Railway, clique em **Generate Domain** (ex: `https://viraldog-production.up.railway.app`).
5. Copie a URL gerada e a Chave Secreta e cole nas **Configurações > Agendamento em Nuvem** dentro do ViralDog.

---

## 🌐 Opção 2: Deploy no Render (Gratuito)

1. Acesse **[render.com](https://render.com/)** e faça login.
2. Clique em **New +** → **Web Service**.
3. Selecione o repositório do ViralDog e configure:
   - **Root Directory:** `cloud_worker`
   - **Runtime:** `Docker`
   - **Plan:** Free
4. Em **Environment Variables**, adicione:
   - `WORKER_SECRET_KEY`: `sua-chave-secreta`
5. Clique em **Create Web Service**.
6. Copie a URL pública (ex: `https://viraldog-cloud.onrender.com`) e insira no app ViralDog.

---

## 💻 Opção 3: Deploy em VPS Própria (Docker / Docker Compose)

Se você tem um servidor Linux (Ubuntu/Debian com Docker):
```bash
cd cloud_worker
docker compose up -d --build
```
A API ficará disponível na porta `8000`.

---

## 🔒 Variáveis de Ambiente

| Variável | Descrição | Padrão |
|---|---|---|
| `WORKER_SECRET_KEY` | Chave de segurança para autorizar o app ViralDog | `viraldog-cloud-secret-2026` |
| `PORT` | Porta HTTP do servidor | `8000` |
| `DATABASE_URL` | String de conexão com banco de dados | `sqlite:///./worker.db` |
