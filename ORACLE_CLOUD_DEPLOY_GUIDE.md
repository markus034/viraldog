# ☁️ Guia Completo: ViralDog 24/7 na Oracle Cloud Free Tier (100% Gratuito)

Este guia ensina o passo a passo para criar e configurar seu servidor na nuvem gratuito na **Oracle Cloud (Always Free)** para que o **ViralDog publique seus vídeos no Instagram/TikTok 24 horas por dia, 7 dias por semana, mesmo com seu computador desligado**.

---

## 🎯 Por que a Oracle Cloud Free Tier?
- **100% Gratuita para sempre** (sem cobranças automáticas se você usar os recursos Always Free).
- Até 4 OCPUs e 24 GB de RAM (arquitetura ARM Ampere A1) ou 1 vCPU e 1 GB RAM (AMD).
- IP Público fixo gratuito e 200 GB de armazenamento em disco.

---

## 📋 Sumário
1. [Criar a Máquina Virtual (Instância)](#1-criar-a-máquina-virtual-instância)
2. [Liberar a Porta 8000 no Painel da Oracle (VCN Ingress)](#2-liberar-a-porta-8000-no-painel-da-oracle-vcn-ingress)
3. [Conectar via SSH e Liberar o Firewall do Ubuntu](#3-conectar-via-ssh-e-liberar-o-firewall-do-ubuntu)
4. [Instalar Docker & Docker Compose](#4-instalar-docker--docker-compose)
5. [Subir o Backend do ViralDog](#5-subir-o-backend-do-viraldog)
6. [Conectar o ViralDog Desktop à sua Nuvem](#6-conectar-o-viraldog-desktop-à-sua-nuvem)

---

## 🖥️ 1. Criar a Máquina Virtual (Instância)

1. Acesse [cloud.oracle.com](https://cloud.oracle.com) e crie/acesse sua conta.
2. No menu lateral (☰), vá em **Compute (Computação)** ➔ **Instances (Instâncias)**.
3. Clique em **Create Instance (Criar Instância)**:
   - **Nome**: `viraldog-server`
   - **Image and shape (Imagem e Tipo)**:
     - Clique em **Edit (Editar)**.
     - Imagem: Escolha **Canonical Ubuntu** (versão `22.04` ou `24.04 Minimal`).
     - Shape: Escolha **VM.Standard.A1.Flex** (ARM Always Free com 2 a 4 OCPUs e 8 a 12 GB RAM) ou **VM.Standard.E2.1.Micro** (Always Free).
   - **Networking (Rede)**: Deixe a VCN padrão e garanta que **Assign a public IPv4 address** esteja marcado.
   - **Add SSH keys (Chaves SSH)**:
     - Selecione **Generate a key pair for me (Gerar par de chaves)**.
     - Clique em **Save Private Key (Salvar Chave Privada)** e guarde o arquivo `.key` no seu computador (você precisará dele para acessar o servidor).
4. Clique em **Create (Criar)** no final da página e aguarde o status ficar 🟢 **Running**.
5. Anote o **Public IP (IP Público)** exibido na tela da sua instância (ex: `129.148.xx.xx`).

---

## 🛡️ 2. Liberar a Porta 8000 no Painel da Oracle (VCN Ingress)

> [!IMPORTANT]
> A Oracle Cloud bloqueia todas as portas externas por padrão. É obrigatório liberar a porta `8000` na VCN para que o aplicativo consiga enviar os vídeos e agendamentos.

1. Na página da sua Instância, em **Instance Details**, clique no link da sua **Subnet** (ex: `subnet-xxx`).
2. Clique na **Default Security List for...**
3. Em **Ingress Rules (Regras de Entrada)**, clique em **Add Ingress Rules (Adicionar Regras de Entrada)**:
   - **Source CIDR**: `0.0.0.0/0`
   - **IP Protocol**: `TCP`
   - **Destination Port Range**: `8000`
   - **Description**: `ViralDog API 24/7`
4. Clique em **Add Ingress Rules**.

---

## 🔑 3. Conectar via SSH e Liberar o Firewall do Ubuntu

Abra o **PowerShell** ou Terminal no seu computador (na pasta onde você salvou o arquivo `.key` da chave SSH):

### Conectar via SSH:
```bash
ssh -i "caminho_da_sua_chave.key" ubuntu@SEU_IP_PUBLICO
```
*(Substitua `SEU_IP_PUBLICO` pelo IP da sua VM)*

### Liberar a Porta 8000 no Firewall Interno do Ubuntu:
Cole estes comandos no terminal da Oracle Cloud:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8000 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

---

## 🐳 4. Instalar Docker & Docker Compose

Dentro do terminal da sua VPS, execute o comando abaixo para instalar o Docker automaticamente:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

Verifique se instalou corretamente:
```bash
docker --version
docker compose version
```

---

## 📦 5. Subir o Backend do ViralDog

1. Crie a pasta do projeto e entre nela:
```bash
mkdir -p ~/viraldog
cd ~/viraldog
```

2. Você pode enviar a pasta `backend/` do seu computador para a VPS via SCP:
   
   *No seu computador (PowerShell local):*
   ```powershell
   scp -i "caminho_da_sua_chave.key" -r c:\Users\marku\PROJETOS\VIRALDOG\backend ubuntu@SEU_IP_PUBLICO:~/viraldog/
   ```

3. No terminal da VPS, entre na pasta `backend` e inicie o container:
```bash
cd ~/viraldog/backend
docker compose up -d --build
```

4. Verifique se o container está rodando:
```bash
docker ps
```
*(Deve aparecer `viraldog-cloud` com status `Up` e porta `0.0.0.0:8000->8000/tcp`)*

---

## ⚙️ 6. Conectar o ViralDog Desktop à sua Nuvem

1. No seu computador, abra o **ViralDog**.
2. Vá na aba **Definições** (Configurações).
3. Na seção **Nuvem 24/7 (Publicar com PC Desligado)**:
   - Ative o switch **"Ativar Publicação 24/7 na Nuvem"**.
   - **URL da VPS**: `http://SEU_IP_PUBLICO:8000` (ex: `http://129.148.50.12:8000`)
   - **Chave de Segurança**: (Deixe em branco ou preencha se configurou `VIRALDOG_API_KEY` no `.env`).
   - Clique no botão **"Testar Conexão"** (deve aparecer 🟢 **VPS Online**).
   - Clique em **"Salvar & Sincronizar"** (as contas salvas e sessões serão sincronizadas na VPS).

---

## 🚀 Como Funciona a Publicação com PC Desligado?

A partir de agora:
1. **Agendamento em Massa IA ou Post Individual**:
   - O ViralDog faz o upload dos vídeos selecionados para o armazenamento da sua VPS.
   - O agendamento é registrado no banco de dados da VPS.
2. **Pode desligar o computador**:
   - O daemon da VPS monitora os horários 24h por dia e publica automaticamente no Instagram/TikTok.

---

## 📊 Comandos Úteis na VPS

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
