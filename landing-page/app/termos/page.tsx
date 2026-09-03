// Salve como: app/termos/page.tsx

export default function TermosPage() {
  return (
    <main style={{ maxWidth: 760, margin: "60px auto", padding: "0 24px", lineHeight: 1.7, color: "#1a1a1a", fontFamily: "-apple-system, Inter, Arial, sans-serif" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Termos de Uso</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 40 }}>Última atualização: 2 de setembro de 2026</p>

      <p>Ao utilizar o ViralDog, você concorda com os termos descritos abaixo. Leia atentamente antes de conectar sua conta do Instagram.</p>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>1. Sobre o serviço</h2>
      <p>O ViralDog é uma ferramenta que permite agendar e publicar automaticamente conteúdo (imagens e vídeos) em contas profissionais do Instagram (Business ou Creator), por meio da API oficial da Meta (Instagram Graph API).</p>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>2. Requisitos para uso</h2>
      <ul style={{ paddingLeft: 22 }}>
        <li>Você precisa ter uma conta do Instagram no modo Business ou Creator, vinculada a uma Página do Facebook.</li>
        <li>Você declara ser o titular ou representante autorizado da conta que está conectando ao serviço.</li>
        <li>Você é responsável pelo conteúdo que agenda para publicação.</li>
      </ul>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>3. Autorização de acesso</h2>
      <p>Ao conectar sua conta via login da Meta, você autoriza o ViralDog a publicar conteúdo em seu nome, exclusivamente conforme os agendamentos que você mesmo configurar. Não publicamos nenhum conteúdo sem sua ação prévia de agendamento.</p>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>4. Responsabilidades do usuário</h2>
      <ul style={{ paddingLeft: 22 }}>
        <li>Não utilizar o serviço para publicar conteúdo ilegal, discurso de ódio, spam, ou qualquer material que viole as Políticas de Uso da Meta e do Instagram.</li>
        <li>Manter a veracidade das informações fornecidas ao criar sua conta.</li>
        <li>Assumir total responsabilidade pelo conteúdo publicado através do serviço.</li>
      </ul>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>5. Limitações do serviço</h2>
      <p>O ViralDog depende da disponibilidade e das políticas da API oficial do Instagram. Não garantimos publicação em horário exato quando houver instabilidade, mudanças na API da Meta, expiração de token de acesso, ou limites de taxa impostos pela própria plataforma.</p>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>6. Revogação de acesso</h2>
      <p>Você pode revogar o acesso do ViralDog à sua conta a qualquer momento, diretamente nas configurações de aplicativos conectados da Meta. Após a revogação, nenhum novo conteúdo será publicado em seu nome.</p>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>7. Isenção de responsabilidade</h2>
      <p>O ViralDog não se responsabiliza por penalidades, suspensões ou bloqueios aplicados pela Meta/Instagram à sua conta em decorrência do uso indevido do serviço ou de violações às políticas da própria plataforma.</p>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>8. Alterações nos termos</h2>
      <p>Estes Termos podem ser atualizados periodicamente. O uso continuado do serviço após alterações implica concordância com a nova versão.</p>

      <h2 style={{ fontSize: 19, marginTop: 40, marginBottom: 12 }}>9. Contato</h2>
      <p>Dúvidas sobre estes termos podem ser enviadas para: <strong>markusviniciusmartins2005@gmail.com</strong></p>

      <div style={{ marginTop: 56, paddingTop: 24, borderTop: "1px solid #ddd", fontSize: 13, color: "#666" }}>
        Vilzane Martins Batista — CNPJ 11.583.398/0001-52<br />
        Avenida Vinte e Nove, 720 — Santa Vitória, MG — CEP 38.320-000, Brasil
      </div>
    </main>
  );
}
