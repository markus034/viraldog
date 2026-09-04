"""
Public Legal & Compliance Endpoints for Meta App Review.
Serves /privacidade, /termos, and /exclusao-de-dados.
"""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["legal"])

_PAGE_STYLE = """
<style>
    :root {
        --bg: #090a0f;
        --card-bg: #12151f;
        --border: #1e2433;
        --text: #e2e8f0;
        --text-muted: #94a3b8;
        --primary: #f59e0b;
        --primary-hover: #d97706;
    }
    body {
        margin: 0;
        padding: 40px 20px;
        background-color: var(--bg);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.7;
    }
    .container {
        max-width: 800px;
        margin: 0 auto;
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 48px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    h1 {
        font-size: 28px;
        font-weight: 700;
        color: #fff;
        margin-top: 0;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 12px;
    }
    .badge {
        display: inline-block;
        font-size: 12px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(245, 158, 11, 0.15);
        color: var(--primary);
        margin-bottom: 24px;
    }
    h2 {
        font-size: 18px;
        font-weight: 600;
        color: #f8fafc;
        margin-top: 32px;
        margin-bottom: 12px;
        border-bottom: 1px solid var(--border);
        padding-bottom: 8px;
    }
    p, li {
        color: var(--text-muted);
        font-size: 15px;
    }
    ul {
        padding-left: 20px;
        margin: 12px 0;
    }
    li {
        margin-bottom: 8px;
    }
    a {
        color: var(--primary);
        text-decoration: none;
    }
    a:hover {
        text-decoration: underline;
    }
    .footer {
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid var(--border);
        text-align: center;
        font-size: 13px;
        color: #64748b;
    }
</style>
"""


@router.get("/privacidade", response_class=HTMLResponse)
def privacy_policy():
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Política de Privacidade — ViralDog</title>
    {_PAGE_STYLE}
</head>
<body>
    <div class="container">
        <span class="badge">Privacidade & Proteção de Dados</span>
        <h1>Política de Privacidade do ViralDog</h1>
        <p><em>Última atualização: Março de 2026</em></p>

        <p>O <strong>ViralDog</strong> valoriza e respeita a privacidade de seus usuários. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos as informações quando você utiliza nosso aplicativo e integrações com a Meta (Instagram Graph API).</p>

        <h2>1. Dados que Coletamos</h2>
        <ul>
            <li><strong>Informações de Autenticação da Meta:</strong> Identificador de usuário do Instagram (Instagram User ID), ID da Página do Facebook vinculada, nome de usuário público (@) e tokens de acesso temporários concedidos via OAuth oficial da Meta.</li>
            <li><strong>Conteúdo de Publicação:</strong> Mídias (vídeos, imagens) e legendas que você escolhe agendar e publicar através do aplicativo.</li>
            <li><strong>Métricas de Desempenho Públicas:</strong> Contagem de visualizações, curtidas, comentários e seguidores para exibição nos painéis de analytics locais.</li>
        </ul>

        <h2>2. Não Coletamos Senhas</h2>
        <p>O ViralDog <strong>nunca</strong> solicita, armazena ou tem acesso à sua senha do Instagram ou Facebook. Todas as autorizações ocorrem exclusivamente através do diálogo oficial de login da Meta (OAuth 2.0).</p>

        <h2>3. Finalidade do Uso dos Dados</h2>
        <ul>
            <li>Executar a publicação automatizada de fotos, carrosséis e vídeos Reels nos horários agendados por você.</li>
            <li>Exibir o status de conexão das contas e estatísticas de engajamento no painel da aplicação.</li>
            <li>Renovar periodicamente os tokens de longa duração para garantir a continuidade dos agendamentos programados.</li>
        </ul>

        <h2>4. Compartilhamento e Armazenamento</h2>
        <p>Não vendemos, transferimos ou compartilhamos nenhum dado com terceiros para fins de marketing. Os dados das contas e agendamentos ficam armazenados localmente no seu banco de dados ou no servidor privado configurado por você.</p>

        <h2>5. Revogação e Exclusão</h2>
        <p>Você pode a qualquer momento revogar o acesso do ViralDog através das Configurações do seu Perfil no Facebook/Instagram ou clicando em excluir conta dentro do próprio aplicativo. Para mais detalhes, consulte nossas <a href="/exclusao-de-dados">Instruções de Exclusão de Dados</a>.</p>

        <div class="footer">
            ViralDog &copy; 2026 — Plataforma de Automação & Agendamento de Mídias
        </div>
    </div>
</body>
</html>"""


@router.get("/termos", response_class=HTMLResponse)
def terms_of_service():
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Termos de Uso — ViralDog</title>
    {_PAGE_STYLE}
</head>
<body>
    <div class="container">
        <span class="badge">Termos Legais</span>
        <h1>Termos de Uso do ViralDog</h1>
        <p><em>Última atualização: Março de 2026</em></p>

        <p>Ao utilizar o <strong>ViralDog</strong>, você concorda em cumprir estes Termos de Uso e todas as leis e regulamentos aplicáveis, incluindo os Termos da Plataforma Meta.</p>

        <h2>1. Uso Permitido</h2>
        <p>O ViralDog é uma ferramenta voltada para criadores de conteúdo, produtores e empresas gerenciarem e agendarem publicações legítimas em suas próprias contas profissionais do Instagram e páginas do Facebook.</p>

        <h2>2. Conformidade com as Políticas da Meta</h2>
        <p>O usuário se compromete a não utilizar o ViralDog para:</p>
        <ul>
            <li>Envio de spam, mensagens abusivas ou publicações em massa que violem as Diretrizes da Comunidade do Instagram.</li>
            <li>Violação de direitos autorais de terceiros sem a devida autorização ou direito legal de uso.</li>
            <li>Ultrapassar maliciosamente os limites de taxa (rate limits) estabelecidos pela Meta (máximo de 100 posts por 24h).</li>
        </ul>

        <h2>3. Responsabilidade sobre o Conteúdo</h2>
        <p>O usuário é o único responsável pelo conteúdo (vídeos, fotos, textos e hashtags) preparado e publicado através do ViralDog em suas respectivas contas de mídia social.</p>

        <h2>4. Modificações do Serviço</h2>
        <p>Reservamo-nos o direito de aprimorar, atualizar ou descontinuar funcionalidades da aplicação a qualquer momento para garantir a melhor conformidade com as APIs oficiais dos parceiros.</p>

        <div class="footer">
            ViralDog &copy; 2026 — Plataforma de Automação & Agendamento de Mídias
        </div>
    </div>
</body>
</html>"""


@router.get("/exclusao-de-dados", response_class=HTMLResponse)
def data_deletion_instructions():
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Instruções de Exclusão de Dados — ViralDog</title>
    {_PAGE_STYLE}
</head>
<body>
    <div class="container">
        <span class="badge">Conformidade com a Meta & LGPD</span>
        <h1>Instruções de Exclusão de Dados</h1>
        <p><em>Como solicitar ou executar a remoção completa dos seus dados no ViralDog</em></p>

        <p>Em conformidade com a Plataforma Meta e regulamentações de proteção de dados, o ViralDog disponibiliza mecanismos simples e automáticos para você excluir todas as suas informações e tokens vinculados.</p>

        <h2>Opção 1: Exclusão Direta pelo Aplicativo (Imediata)</h2>
        <ul>
            <li>Abra o aplicativo <strong>ViralDog</strong>.</li>
            <li>Navegue até a aba <strong>Perfis / MultiLogin</strong>.</li>
            <li>Localize a conta do Instagram desejada e clique no ícone de <strong>Lixeira / Excluir Perfil</strong>.</li>
            <li>Todos os tokens de acesso, identificadores da Meta e posts agendados vinculados àquela conta serão permanentemente removidos do banco de dados local.</li>
        </ul>

        <h2>Opção 2: Revogação via Facebook / Instagram (Automática via Webhook)</h2>
        <ul>
            <li>Acesse o aplicativo ou site do Facebook e vá em <strong>Configurações & Privacidade &rarr; Configurações</strong>.</li>
            <li>No menu lateral esquerdo, clique em <strong>Aplicativos e Sites</strong>.</li>
            <li>Localize o aplicativo <strong>ViralDog</strong> na lista e clique em <strong>Remover</strong>.</li>
            <li>A Meta enviará automaticamente uma notificação segura ao nosso servidor através do webhook de desautorização (<code>/webhooks/deauthorize</code>), marcando a conta como desvinculada e revogando imediatamente todos os tokens.</li>
        </ul>

        <h2>Código de Confirmação e Suporte</h2>
        <p>Caso precise de uma confirmação formal de exclusão de dados ou assistência adicional, envie um e-mail para <strong>suporte@viraldog.app</strong> informando o nome de usuário do Instagram (@) que deseja remover.</p>

        <div class="footer">
            ViralDog &copy; 2026 — Plataforma de Automação & Agendamento de Mídias
        </div>
    </div>
</body>
</html>"""
