# Plano Arquitetural: ViralDog SaaS Multi-Tenant na Nuvem 24/7

Este documento consolida a arquitetura completa do **ViralDog como SaaS 100% Online**, acessível via Web (`app.viraldog.com.br`) e App Desktop, garantindo isolamento absoluto de dados entre clientes e integração com o Instagram Login da Meta.

---

## 1. Análise das 3 Telas do Meta for Developers

### 📸 Imagem 1 — Configurações Básicas do Aplicativo
- **ID do Aplicativo (Meta Business):** `1532052538134583`
- **Nome de Exibição:** `viraldog`
- **Domínios de Aplicativos:** `www.viraldog.com.br` (Recomendação: adicionar também `viraldog.com.br` sem www para cobrir automaticamente subdomínios como `api.` e `app.`).
- **URLs de Política, Termos e Exclusão:** Preenchidas corretamente.

### ⚠️ Imagem 2 — Erro ao Salvar URI de Redirecionamento
- **Erro:** *"Erro ao salvar os URIs de redirecionamento. Verifique seus URIs de redirecionamento e tente novamente."*
- **Causa:** O campo foi preenchido com `http://127.0.0.1:8000/auth/callback`. A Meta rejeita HTTP simples e endereços IP locais neste produto ("Login Comercial do Instagram"). Ela exige obrigatoriamente **HTTPS** em um domínio público autorizado.

### ✅ Imagem 3 — Sucesso no Login Comercial do Instagram
- **Status:** O item **4. Configure o login comercial do Instagram** já está verde com check (`✔`).
- **Client ID do Instagram:** `1313148545209043`
- **Redirect URI cadastrado:** `https://www.viraldog.com.br/auth/callback`
- **URL de incorporação gerada:**
  `https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=1313148545209043&redirect_uri=https://www.viraldog.com.br/auth/callback&response_type=code`

#### Dúvidas sobre os itens restantes da Imagem 3:
- **Item 3 — Configurar webhooks:** O aviso da Meta diz expressamente: *"Para receber webhooks, seu aplicativo precisa estar publicado"*. **Webhooks NÃO são obrigatórios para agendar e publicar posts/reels**. Você pode ignorar esta etapa por enquanto.
- **Item 5 — Análise completa do aplicativo:** Em modo de desenvolvimento, você e qualquer conta adicionada em **Funções ➔ Testadores do Instagram** conseguem conectar e postar sem aprovação da Meta. A Análise é necessária apenas quando você for disponibilizar o aplicativo para o público geral cadastrar contas desconhecidas.

---

## 2. Arquitetura de Domínios e Nuvem (Oracle Cloud + Vercel)

| Domínio | Destino / Provedor | Função |
| :--- | :--- | :--- |
| `www.viraldog.com.br` | **Vercel** (existente) | Landing Page de vendas, marketing e links legais. |
| `app.viraldog.com.br` | **Vercel** ou **Oracle Cloud** | Aplicação Web do ViralDog (Painel do cliente/SaaS). |
| `api.viraldog.com.br` | **Oracle Cloud (VPS Ubuntu)** | Backend FastAPI 24/7 com publicador e OAuth. |

### Configuração de DNS necessária (no seu provedor de DNS):
1. **Tipo A:** `api.viraldog.com.br` ➔ IP Público da sua VPS Oracle Cloud (ex: `129.148.xx.xx`).
2. **Tipo CNAME:** `app.viraldog.com.br` ➔ Apontamento do Vercel ou IP da VPS.
3. **No painel da Meta (Imagem 1):** Em "Domínios de aplicativos", adicione `viraldog.com.br` (assim cobre tanto `www.`, `app.` quanto `api.`).

---

## 3. Isolamento Estrito de Dados Multi-Tenant (Segurança SaaS)

Para que clientes terceiros utilizem a ferramenta sem cruzar dados:

1. **Separação por `owner_user_id`:**
   - Toda conta conectada (`Account`), agendamento (`Post`), upload e histórico pertence a um único `User.id`.
   - Consultas (`GET /api/accounts`, `GET /api/posts`, `GET /api/dashboard`) filtram estritamente por `owner_user_id == user.id`.
   - Modificações (`PATCH /api/accounts/{id}`, `DELETE /api/accounts/{id}`, `DELETE /api/posts/{id}`) barram com `HTTP 403 Forbidden` qualquer tentativa de manipular recursos de outro usuário.

2. **Isolamento de Arquivos e Mídias:**
   - Uploads de vídeos salvos na nuvem são organizados em diretórios isolados: `uploads/{owner_user_id}/{filename}`.

3. **Autenticação:**
   - Tokens JWT com algoritmo `HS256`, expiração automática e assinatura com `JWT_SECRET`.
   - Header HTTP: `Authorization: Bearer <token>`.
