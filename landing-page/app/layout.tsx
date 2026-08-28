import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://viraldog.com.br"),
  title: "ViralDog — Transforme Perfis no Instagram em Renda Extra no Piloto Automático",
  description:
    "Crie, edite e publique Reels virais em massa no Instagram sem precisar aparecer. A ferramenta definitiva para lucrar com Páginas Dark, Afiliados e Infoprodutos.",
  keywords: [
    "ViralDog",
    "viraldog.com.br",
    "renda extra instagram",
    "pagina dark instagram",
    "ganhar dinheiro no instagram",
    "automacao reels",
    "editor de reels em lote",
    "postagem automatica instagram",
  ],
  openGraph: {
    title: "ViralDog — Automação e Postagem de Reels Virais",
    description: "Crie, edite e publique Reels virais em massa no Instagram no piloto automático.",
    url: "https://viraldog.com.br",
    siteName: "ViralDog",
    locale: "pt_BR",
    type: "website",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="scroll-smooth">
      <body className={`${inter.variable} bg-[#F5F5F7] text-[#1D1D1F] font-sans antialiased min-h-screen selection:bg-[#0071E3]/20 selection:text-[#0071E3]`}>
        {children}
      </body>
    </html>
  );
}
