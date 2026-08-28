# Regras do Projeto ViralDog

## 🔄 Frontend — Sempre fornecer link de teste após alterações

**Após qualquer alteração em arquivos dentro de `frontend/src/`:**

1. Iniciar ou confirmar que o servidor Vite dev está rodando com `--host`:
   ```
   cmd /c "cd c:\Users\marku\PROJETOS\VIRALDOG\frontend && npm run dev -- --host"
   ```
   O Vite sobe em **http://localhost:5173** e também expõe na rede local.

2. **Sempre informar o link ao usuário ao final da resposta:**
   > 🌐 **Teste agora:** http://localhost:5173

3. Se o servidor já estiver rodando como task em background, apenas confirmar o link — não iniciar outro processo.

4. Para alterações **somente** em arquivos Electron (`electron/`) ou backend (`backend/`), não subir o dev server — apenas informar que precisa reiniciar o Electron.

## 📦 Build de produção

Quando o usuário pedir build explicitamente ou precisar testar no Electron empacotado:
```
cmd /c "cd c:\Users\marku\PROJETOS\VIRALDOG\frontend && npm run build"
```
Confirmar que os arquivos foram gerados em `frontend/dist/`.

## ⚙️ Execução de Comandos no Windows
- Ao executar comandos npm via PowerShell no Windows, utilize sempre `npm.cmd` (ex: `npm.cmd run dev -- --host`) ou envolva com `cmd /c "npm ..."` para evitar bloqueios de política de execução de scripts (.ps1).

## 📱 Arquitetura da API Oficial (Instagram Graph API)
- **Desacoplamento do Downloader:** A página de Baixar (Downloader) é estritamente isolada e não utiliza nem depende de tokens da API Oficial da Meta.
- **Tokens por Conta Individual:** Cada perfil/conta no MultiLogin possui seu próprio token de acesso (`fb_access_token`) e ID de conta de negócios (`fb_ig_account_id`).
- **Criação e Edição de Perfis:** O modal de criação de novos perfis deve oferecer botão direto para conectar via API Oficial da Meta e importar/vincular a conta.
- **Agendamento Multi-Contas:** O Agendador deve identificar visualmente as contas com API Oficial e despachar as publicações utilizando os tokens individuais de cada conta selecionada.

