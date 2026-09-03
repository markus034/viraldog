// Salve como: app/exclusao-de-dados/page.tsx

export default function ExclusaoDeDadosPage() {
  const box: React.CSSProperties = { background: "#f6f4ec", border: "1px solid #ddd", borderRadius: 8, padding: "20px 24px", margin: "24px 0" };

  return (
    <main style={{ maxWidth: 760, margin: "60px auto", padding: "0 24px", lineHeight: 1.7, color: "#1a1a1a", fontFamily: "-apple-system, Inter, Arial, sans-serif" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Exclusão de Dados</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 40 }}>Última atualização: 2 de setembro de 2026</p>

      <p>Esta página explica como solicitar a exclusão dos seus dados armazenados pelo ViralDog.</p>

      <h2 style={{ fontSize: 19, marginTop: 32, marginBottom: 12 }}>O que fazemos com seus dados</h2>
      <p>O ViralDog armazena apenas os dados necessários para agendar e publicar conteúdo em sua conta do Instagram: o ID da sua conta profissional, o token de acesso autorizado por você via login da Meta, e o conteúdo que você agenda para publicação.</p>

      <h2 style={{ fontSize: 19, marginTop: 32, marginBottom: 12 }}>Como solicitar a exclusão</h2>
      <p>Você pode solicitar a exclusão completa dos seus dados de duas formas:</p>

      <div style={box}>
        <strong>Opção 1 — Revogar acesso pela Meta</strong>
        <p>Acesse suas configurações do Facebook/Instagram em <strong>Configurações → Aplicativos e Sites</strong>, localize o ViralDog e remova o acesso. Isso invalida automaticamente o token armazenado em nosso sistema.</p>
      </div>

      <div style={box}>
        <strong>Opção 2 — Solicitação direta</strong>
        <p>Envie um e-mail para <strong>markusviniciusmartins2005@gmail.com</strong> com o assunto &quot;Exclusão de dados&quot;, informando o nome de usuário da conta do Instagram conectada. Processamos a exclusão em até 30 dias e enviamos uma confirmação por e-mail.</p>
      </div>

      <h2 style={{ fontSize: 19, marginTop: 32, marginBottom: 12 }}>O que é excluído</h2>
      <ul style={{ paddingLeft: 22 }}>
        <li>Token de acesso à sua conta do Instagram</li>
        <li>Histórico de posts agendados e publicados através do serviço</li>
        <li>Quaisquer dados de identificação associados à sua conta conectada</li>
      </ul>

      <div style={{ marginTop: 56, paddingTop: 24, borderTop: "1px solid #ddd", fontSize: 13, color: "#666" }}>
        Vilzane Martins Batista — CNPJ 11.583.398/0001-52<br />
        Avenida Vinte e Nove, 720 — Santa Vitória, MG — CEP 38.320-000, Brasil
      </div>
    </main>
  );
}
