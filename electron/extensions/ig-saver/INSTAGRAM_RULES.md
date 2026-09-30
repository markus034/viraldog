# Regras de Funcionamento e Arquitetura — Modo Instagram (Dog Saver)

Este documento define detalhadamente como o **Dog Saver** opera no Instagram Web, detalhando o fluxo de dados, a comunicação entre camadas, os mecanismos de extração de mídia e as **regras obrigatórias para evitar que as funcionalidades quebrem**.

---

## 1. Visão Geral da Arquitetura

O funcionamento no Instagram é distribuído em quatro camadas complementares:

```mermaid
graph TD
    A[Instagram Web Page / DOM] -->|XHR / Fetch Interception| B[instagram/interceptor.js\n(MAIN World)]
    B -->|window.postMessage| C[instagram/content.js\n(ISOLATED World)]
    A -->|DOM / Scripts Extraction| C
    C -->|chrome.runtime.sendMessage| D[background.js / instagram/background.js\n(Service Worker)]
    D -->|chrome.runtime.sendMessage| E[offscreen.js\n(Offscreen Document - ZIP Engine)]
    E -->|chrome.downloads.download| F[Disco Local do Usuário]
    D -->|chrome.downloads.download| F
```

| Arquivo | Mundo / Contexto | Responsabilidade Principal |
| :--- | :--- | :--- |
| `instagram/interceptor.js` | `MAIN` | Intercepta requisições `fetch` e `XMLHttpRequest` (GraphQL, feed, reels, stories), extrai dados brutos e mantém cache em memória. |
| `instagram/content.js` | `ISOLATED` | Injeta botões no DOM, detecta slides de Stories ativos, gerencia modais e diálogos de download, processa filtros e coordena requisições. |
| `instagram/worker.js` | Web Worker | Normalizador assíncrono para posts e carrosséis interceptados. |
| `instagram/background.js` / `background.js` | Service Worker | Orquestrador de tarefas em segundo plano, fila de downloads, detecção de duplicatas e comunicação com o offscreen. |
| `offscreen.js` | Offscreen Document | Criação e compactação de arquivos ZIP (`JSZip`) e acionamento nativo de downloads via `chrome.downloads.download`. |

---

## 2. Fluxos de Download

### 2.1. Download de Stories e Destaques (Highlights)
Para garantir 100% de taxa de sucesso mesmo quando o Instagram altera APIs ou usa vídeos em streaming, o sistema utiliza **4 camadas de extração em cascata**:

1. **Camada 1 — Cache de Interceptação (`interceptor.js`)**:
   - Intercepta respostas de `reels_media`, `xdt_api__v1__feed__reels_media`, `user_story` e `highlight_reel`.
   - Armazena os itens em `cachedStoryItemsByUser` organizados pelo nome de usuário.
   - O `content.js` solicita esses itens via mensagem `IG_SAVER_REQUEST_INTERCEPTED_STORIES`.

2. **Camada 2 — Extração Direta dos Scripts da Página (`extractStoriesFromPageScripts`)**:
   - Escaneia todas as tags `<script type="application/json">` presentes no DOM.
   - Realiza busca profunda por objetos que contenham `video_versions` (vídeos em alta qualidade) ou `image_versions2` (fotos).
   - Filtra os itens pertencentes ao criador atualmente ativo (`getActiveStoryCreator()`).

3. **Camada 3 — Requisição às APIs REST / GraphQL (`fetchUserStories`)**:
   - Tenta sucessivamente:
     - `api/v1/feed/reels_media/?reel_ids=<userId>`
     - `api/v1/feed/reels_media/?reel_ids=<username>`
     - `api/v1/feed/user/<userId>/story/`
     - GraphQL Query Hash de Stories com cabeçalhos autenticados (`X-IG-App-ID: 936619743392459`, `csrftoken`, `ds_user_id`).

4. **Camada 4 — Inspeção Visual do Slide Ativo (`Qt()`)**:
   - Detecta o container do story posicionado no **centro exato do viewport** (`ln()`).
   - Se for um elemento `<video>`, captura `currentSrc` ou `src` (aceitando tanto URLs `http/https` quanto URLs `blob:https://www.instagram.com/...`).
   - Se for imagem, captura a tag `<img>` de maior área e resolução visível.

---

### 2.2. Download de Vídeos Únicos e Reels
1. O usuário clica no botão de download individual injetado no post, reel ou story.
2. `content.js` resolve os dados da mídia (`postId`, `url`, `type`, `creator`).
3. O envio é despachado via `relaySingleMediaToElectron` com ação `DOWNLOAD_SINGLE_MEDIA`.
4. O `background.js` recebe a mensagem e dispara o download nativo com o caminho organizado:
   - Formato de salvamento: `Dog_Saver/Instagram/<creator>/<sanitized_filename>`.

---

### 2.3. Download em Massa de Perfil (Bulk Profile Download)
1. O usuário abre o modal de download e configura: Tipo de mídia, Filtros de engajamento (curtidas/views/comentários/palavra-chave), Intervalo de datas e Inclusão de Stories/Destaques.
2. É criada uma tarefa em segundo plano (`START_BULK_DOWNLOAD`).
3. A extensão busca os posts sequencialmente via API GraphQL / Web Profile Info.
4. Caso a API atinja limite de requisições (429), o sistema transiciona suavemente para o **Modo Scroll Automático** (`runScrollScan`), rolando a tela e ingerindo posts do feed diretamente.
5. Os arquivos são agrupados em pacotes ZIP divididos pelo tamanho configurado (`zipChunkSize`), salvando os arquivos no disco através do `offscreen.js`.

---

## 3. Regras Mandatórias de Integridade (Anti-Falhas)

Para que a extensão **NUNCA deixe de funcionar** e não sofra regressões em futuras atualizações, as seguintes regras devem ser rigorosamente seguidas:

### ⚠️ Regra 1: Isolamento Estrito de Contexto em Aplicação SPA
* **Problema evitado**: O Instagram não recarrega a página ao navegar. As tags `<meta property="...user_id">` no cabeçalho pertencem ao primeiro perfil acessado.
* **Diretriz**: Nunca leia meta tags globais de ID de usuário sem antes verificar se `window.location.pathname` é exatamente a página de perfil daquele criador e não uma página de `/stories/` ou `/explore/`.

### ⚠️ Regra 2: Detecção Espacial do Slide Ativo nos Stories
* **Problema evitado**: O carrossel de stories do Instagram mantém slides pré-carregados fora da tela com conteúdos de outros perfis.
* **Diretriz**: As funções de captura (`Qt()` e `ln()`) devem sempre filtrar elementos posicionados no centro da tela (`window.innerWidth / 2`, `window.innerHeight / 2`). Nunca use seletores globais sem escopo como `document.querySelector("video")`.

### ⚠️ Regra 3: Suporte Obrigatório a URLs `blob:` e CDN
* **Problema evitado**: Vídeos de stories são reproduzidos via MediaSource Extensions e possuem `video.src = "blob:https://www.instagram.com/..."`.
* **Diretriz**: As validações de URL de mídia em stories devem aceitar tanto `http/https` quanto `blob:`. O sistema deve primeiro tentar encontrar a URL CDN original em alta definição nas tags `<script>` ou cache interceptado; se não encontrar, deve permitir o download da URL `blob:` em reprodução.

### ⚠️ Regra 4: Downloads Nativos sem Dependência de Cliques em Links Sintéticos
* **Problema evitado**: Scripts de conteúdo ou documentos offscreen podem ser descartados pelo navegador se o download for disparado via `a.click()` em tarefas assíncronas.
* **Diretriz**: Todos os arquivos finais (sejam arquivos individuais ou arquivos `.zip`) devem ser salvos usando a API nativa `chrome.downloads.download({ url, filename, conflictAction: "uniquify" })`.

### ⚠️ Regra 5: Fallback Gracioso nas Requisições de Stories
* **Problema evitado**: O usuário estar assistindo a um story legítimo e a extensão exibir "Este usuário não tem stories no momento" devido a uma falha na API REST.
* **Diretriz**: Na função `_n(i)` ("Salvar tudo"), se a chamada da API retornar vazia, a extensão DEVE consultar os scripts JSON da página e, em última instância, capturar a mídia ativa no player (`Qt()`) antes de declarar ausência de stories.

### ⚠️ Regra 6: Compatibilidade de Mensageria Dupla (Chrome Extension + Electron)
* **Problema evitado**: Falhas de comunicação quando o código é executado em navegadores padrão sem o ambiente desktop do Electron.
* **Diretriz**: Funções como `relaySingleMediaToElectron` e `triggerBlobDownload` devem sempre verificar `if (window.electronAPI)` e, caso ausente, utilizar `chrome.runtime.sendMessage` ou a API do DOM de forma compatível com a extensão web.

### ⚠️ Regra 7: Validação Contínua via Testes Automatizados
* **Diretriz**: Toda alteração no código do Instagram ou TikTok deve ser validada executando `npm test`. Todos os 11 arquivos de teste da suite devem passar com código de saída 0 antes de qualquer publicação ou deploy.

---

## 4. Estrutura de Arquivos Gerados no Disco

Os downloads são organizados automaticamente nas pastas do usuário da seguinte forma:

```
Downloads/
  └── Dog_Saver/
       └── Instagram/
            ├── <nome_do_criador>/
            │    ├── <nome_do_criador>_<postId>_1.mp4
            │    ├── <nome_do_criador>_<postId>_2.jpg
            │    ├── <nome_do_criador>_story_<storyId>.mp4
            │    └── <nome_do_criador>_stories_2026-09-17.zip
            └── Destaques/
                 └── <nome_do_criador>_highlight_<titulo>_2026-09-17.zip
```
