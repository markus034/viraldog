// Salve como: app/privacidade/page.tsx

export default function PrivacidadePage() {
  return (
    <main style={{ maxWidth: 760, margin: "60px auto", padding: "0 24px", lineHeight: 1.7, color: "#1a1a1a", fontFamily: "-apple-system, Inter, Arial, sans-serif" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Política de Privacidade</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 40 }}>Última atualização: 2 de setembro de 2026</p>

      <p>Esta Política de Privacidade descreve como o ViralDog (&quot;nós&quot;, &quot;nosso&quot; ou &quot;aplicativo&quot;) coleta, usa, armazena e protege as informações dos usuários que utilizam nossos serviços de agendamento e publicação automática de conteúdo em redes sociais.</p>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>1. Quem somos</h2>
      <p>O ViralDog é operado por Vilzane Martins Batista, inscrita no CNPJ 11.583.398/0001-52, com sede em Avenida Vinte e Nove, 720, Santa Vitória — MG, CEP 38.320-000, Brasil.</p>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>2. Quais dados coletamos</h2>
      <ul style={{ paddingLeft: 22 }}>
        <li><strong>Dados de conta:</strong> nome de usuário e ID da conta do Instagram Business/Creator que você conecta ao serviço.</li>
        <li><strong>Tokens de acesso:</strong> tokens OAuth fornecidos pela Meta, usados exclusivamente para publicar conteúdo em seu nome, mediante sua autorização.</li>
        <li><strong>Conteúdo agendado:</strong> imagens, vídeos e legendas que você envia para agendamento.</li>
        <li><strong>Dados técnicos:</strong> logs de uso, horários de publicação, status de sucesso ou falha das publicações.</li>
      </ul>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>3. Como usamos seus dados</h2>
      <ul style={{ paddingLeft: 22 }}>
        <li>Para publicar, em seu nome e mediante sua autorização, o conteúdo que você agendou, nos horários definidos por você.</li>
        <li>Para manter seu login e sessão ativos no serviço.</li>
        <li>Para diagnosticar falhas técnicas e melhorar a confiabilidade do agendamento.</li>
      </ul>
      <p>Não vendemos, alugamos ou compartilhamos seus dados com terceiros para fins de marketing.</p>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>4. Compartilhamento de dados</h2>
      <p>Seus dados são compartilhados apenas com a Meta Platforms, Inc., na medida necessária para publicar o conteúdo autorizado por você através da API oficial do Instagram (Graph API). Não compartilhamos dados com nenhum outro terceiro, exceto quando exigido por lei.</p>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>5. Armazenamento e segurança</h2>
      <p>Os tokens de acesso e demais dados são armazenados em servidores próprios com controles de acesso restritos. Tokens expirados ou revogados são invalidados automaticamente.</p>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>6. Retenção de dados</h2>
      <p>Mantemos seus dados enquanto sua conta estiver ativa no serviço. Ao desconectar sua conta do Instagram ou solicitar a exclusão, seus dados são removidos em até 30 dias.</p>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>7. Seus direitos</h2>
      <p>Você pode, a qualquer momento:</p>
      <ul style={{ paddingLeft: 22 }}>
        <li>Revogar o acesso do ViralDog à sua conta do Instagram diretamente nas configurações da Meta.</li>
        <li>Solicitar a exclusão de seus dados armazenados enviando um e-mail para o contato abaixo.</li>
        <li>Solicitar uma cópia dos dados que mantemos sobre você.</li>
      </ul>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>8. Alterações nesta política</h2>
      <p>Podemos atualizar esta Política de Privacidade periodicamente. Alterações relevantes serão comunicadas por e-mail ou aviso no próprio serviço.</p>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>9. Contato</h2>
      <p>Dúvidas sobre esta política podem ser enviadas para: <strong>markusviniciusmartins2005@gmail.com</strong></p>

      <div style={{ marginTop: 56, paddingTop: 24, borderTop: "1px solid #ddd", fontSize: 13, color: "#666" }}>
        Vilzane Martins Batista — CNPJ 11.583.398/0001-52<br />
        Avenida Vinte e Nove, 720 — Santa Vitória, MG — CEP 38.320-000, Brasil
      </div>
    </main>
  );
}
