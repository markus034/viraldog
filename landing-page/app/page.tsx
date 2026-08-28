"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Sparkles,
  Download,
  Layers,
  Calendar,
  ShieldCheck,
  Zap,
  ArrowRight,
  TrendingUp,
  Bot,
  Monitor,
  ChevronDown,
  DollarSign,
  Check,
  Eye,
  ShoppingBag,
  Clock,
  Award,
  HelpCircle,
  HardDrive,
  CheckCircle2,
} from "lucide-react";

// ── Link de Download Direto do Instalador (.zip / .exe) ──────────────────────────────
const DOWNLOAD_URL = "https://drive.google.com/uc?export=download&id=1D8v3HFDj6nKZescpCXBmgmFjsR75i727";

export default function LandingPage() {
  const [profilesCount, setProfilesCount] = useState<number>(3);
  const [salesPerDay, setSalesPerDay] = useState<number>(2);
  const [productPrice, setProductPrice] = useState<number>(97);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Cálculo da estimativa mensal
  const monthlyRevenue = profilesCount * salesPerDay * productPrice * 30;

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const handleDownload = () => {
    window.open(DOWNLOAD_URL, "_blank");
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] flex flex-col selection:bg-[#0071E3]/15 selection:text-[#0071E3]">
      {/* Top Banner */}
      <div className="bg-[#1D1D1F] text-white py-2.5 px-4 text-center text-xs sm:text-sm font-medium tracking-wide">
        <span className="text-[#0071E3] font-bold mr-2">DISPONÍVEL PARA WINDOWS</span>
        Software desktop autônomo com todas as dependências embutidas. Pronto para uso imediato.
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-[#F5F5F7]/80 backdrop-blur-xl border-b border-black/[0.06]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl overflow-hidden shadow-sm border border-black/[0.08] bg-white flex items-center justify-center">
              <Image
                src="/logo.png"
                alt="ViralDog Logo"
                width={40}
                height={40}
                className="object-cover"
                priority
              />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight text-[#1D1D1F]">
                ViralDog
              </span>
              <span className="text-[10px] text-[#86868B] font-medium -mt-1">
                Instagram Automation Studio
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#86868B]">
            <a href="#como-funciona" className="hover:text-[#1D1D1F] transition-colors">
              Como Funciona
            </a>
            <a href="#simulador" className="hover:text-[#1D1D1F] transition-colors">
              Simulador de Renda
            </a>
            <a href="#monetizacao" className="hover:text-[#1D1D1F] transition-colors">
              Monetização
            </a>
            <a href="#recursos" className="hover:text-[#1D1D1F] transition-colors">
              Recursos
            </a>
            <a href="#faq" className="hover:text-[#1D1D1F] transition-colors">
              Dúvidas
            </a>
          </nav>

          <a
            href="#download"
            className="px-5 py-2.5 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white font-semibold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Baixar App (.exe)
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-16 pb-24 px-4 sm:px-6 lg:px-8 max-w-[1200px] mx-auto text-center flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFFFFF] border border-black/[0.08] text-[#0071E3] text-xs font-semibold uppercase tracking-wider mb-6 apple-shadow">
          <Sparkles className="w-3.5 h-3.5" />
          Método 100% Prático • Sem Precisar Aparecer
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-[-0.03em] max-w-4xl text-[#1D1D1F] leading-[1.08] mb-6">
          Transforme Páginas no Instagram em uma{" "}
          <span className="text-[#0071E3]">Máquina de Renda Extra</span>
        </h1>

        <p className="text-lg sm:text-xl text-[#86868B] max-w-2xl font-normal leading-relaxed mb-10">
          O software definitivo para baixar vídeos virais, aplicar molduras de retenção em lote, gerar legendas com Inteligência Artificial e publicar Reels automaticamente 24 horas por dia.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto mb-16">
          <a
            href="#download"
            className="w-full sm:w-auto px-8 py-4 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white font-semibold text-base transition-all hover:scale-[1.02] shadow-sm flex items-center justify-center gap-2"
          >
            <Download className="w-5 h-5" />
            Baixar ViralDog para Windows
          </a>
          <a
            href="#simulador"
            className="w-full sm:w-auto px-8 py-4 rounded-full bg-white hover:bg-white/80 border border-black/[0.08] text-[#1D1D1F] font-semibold text-base transition-colors apple-shadow flex items-center justify-center gap-2"
          >
            <DollarSign className="w-4 h-4 text-[#0071E3]" />
            Simular Potencial de Ganhos
          </a>
        </div>

        {/* 3 Pillars Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl text-left">
          <div className="p-8 rounded-2xl bg-white border border-black/[0.06] apple-shadow">
            <div className="w-12 h-12 rounded-xl bg-[#F5F5F7] flex items-center justify-center text-[#0071E3] mb-5">
              <Eye className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-[#1D1D1F] mb-2">100% Sem Aparecer</h3>
            <p className="text-sm text-[#86868B] leading-relaxed">
              Você não precisa gravar stories nem mostrar seu rosto. Crie perfis temáticos de nichos altamente lucrativos (finanças, pets, saúde, curiosidades, etc.).
            </p>
          </div>

          <div className="p-8 rounded-2xl bg-white border border-black/[0.06] apple-shadow">
            <div className="w-12 h-12 rounded-xl bg-[#F5F5F7] flex items-center justify-center text-[#0071E3] mb-5">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-[#1D1D1F] mb-2">Trabalhe 15 Minutos por Dia</h3>
            <p className="text-sm text-[#86868B] leading-relaxed">
              Com o robô de postagens e edição em massa, você agenda o conteúdo da semana inteira em minutos e deixa o ViralDog postar no piloto automático.
            </p>
          </div>

          <div className="p-8 rounded-2xl bg-white border border-black/[0.06] apple-shadow">
            <div className="w-12 h-12 rounded-xl bg-[#F5F5F7] flex items-center justify-center text-[#0071E3] mb-5">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-[#1D1D1F] mb-2">Múltiplas Fontes de Lucro</h3>
            <p className="text-sm text-[#86868B] leading-relaxed">
              Monetize vendendo produtos como afiliado, seus próprios infoprodutos ou fechando parcerias e publiposts com marcas interessadas na sua audiência.
            </p>
          </div>
        </div>
      </section>

      {/* Interactive Income Simulator */}
      <section id="simulador" className="py-20 px-4 sm:px-6 lg:px-8 bg-white border-y border-black/[0.06]">
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-12">
            <span className="text-[#0071E3] text-xs font-bold uppercase tracking-widest">
              Simulador Interativo
            </span>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#1D1D1F] mt-2">
              Quanto Você Pode Faturar com Páginas no Instagram?
            </h2>
            <p className="text-[#86868B] text-sm max-w-xl mx-auto mt-2">
              Ajuste as opções abaixo para simular seu potencial de renda extra mensal utilizando a estrutura automatizada do ViralDog.
            </p>
          </div>

          <div className="p-8 sm:p-12 rounded-3xl bg-[#F5F5F7] border border-black/[0.06] apple-shadow">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
              {/* Sliders */}
              <div className="space-y-8">
                {/* Profiles Slider */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-semibold text-[#1D1D1F]">
                      Quantidade de Perfis Dark
                    </label>
                    <span className="text-sm font-bold text-[#0071E3] bg-white px-3 py-1 rounded-full border border-black/[0.06]">
                      {profilesCount} {profilesCount === 1 ? "perfil" : "perfis"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={profilesCount}
                    onChange={(e) => setProfilesCount(Number(e.target.value))}
                    className="w-full h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-[#0071E3]"
                  />
                  <span className="text-xs text-[#86868B] mt-1 block">
                    Cada perfil pode postar de 2 a 4 Reels virais por dia automaticamente.
                  </span>
                </div>

                {/* Sales Per Day Slider */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-semibold text-[#1D1D1F]">
                      Vendas Diárias por Perfil
                    </label>
                    <span className="text-sm font-bold text-[#0071E3] bg-white px-3 py-1 rounded-full border border-black/[0.06]">
                      {salesPerDay} {salesPerDay === 1 ? "venda / dia" : "vendas / dia"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={salesPerDay}
                    onChange={(e) => setSalesPerDay(Number(e.target.value))}
                    className="w-full h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-[#0071E3]"
                  />
                  <span className="text-xs text-[#86868B] mt-1 block">
                    Vendas geradas pelo link na bio e chamadas de ação nos Reels.
                  </span>
                </div>

                {/* Product Ticket Slider */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-semibold text-[#1D1D1F]">
                      Comissão / Valor do Produto
                    </label>
                    <span className="text-sm font-bold text-[#0071E3] bg-white px-3 py-1 rounded-full border border-black/[0.06]">
                      R$ {productPrice}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="47"
                    max="297"
                    step="10"
                    value={productPrice}
                    onChange={(e) => setProductPrice(Number(e.target.value))}
                    className="w-full h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-[#0071E3]"
                  />
                  <span className="text-xs text-[#86868B] mt-1 block">
                    Exemplo de comissão de e-book ou curso digital como afiliado.
                  </span>
                </div>
              </div>

              {/* Total Card */}
              <div className="p-8 rounded-2xl bg-white border border-black/[0.06] text-center flex flex-col justify-between apple-shadow">
                <span className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">
                  Estimativa de Lucro Mensal
                </span>

                <div className="my-6">
                  <div className="text-4xl sm:text-5xl font-extrabold text-[#0071E3] tracking-tight">
                    R$ {monthlyRevenue.toLocaleString("pt-BR")}
                  </div>
                  <span className="text-xs text-[#86868B] mt-2 block">
                    no mês ({profilesCount * salesPerDay * 30} vendas totais)
                  </span>
                </div>

                <div className="space-y-2 text-xs text-[#86868B] text-left border-t border-black/[0.06] pt-4 mb-6">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Sem custos com anúncios pagos (tráfego 100% orgânico)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Postagens automáticas nos horários de maior pico</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Escalável para quantos perfis você quiser</span>
                  </div>
                </div>

                <a
                  href="#download"
                  className="w-full py-3.5 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white font-semibold text-sm transition-all hover:scale-[1.02] shadow-sm flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Baixar o ViralDog e Começar
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Step by Step Workflow */}
      <section id="como-funciona" className="py-24 px-4 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
        <div className="text-center mb-16">
          <span className="text-[#0071E3] text-xs font-bold uppercase tracking-widest">
            Fluxo Descomplicado
          </span>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[#1D1D1F] mt-2">
            Como Funciona o Método ViralDog
          </h2>
          <p className="text-[#86868B] text-sm max-w-xl mx-auto mt-2">
            Um processo validado em 4 etapas simples que transforma vídeos brutos em máquinas de vendas diárias.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Step 1 */}
          <div className="p-6 rounded-2xl bg-white border border-black/[0.06] apple-shadow flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#0071E3]/10 text-[#0071E3] font-bold text-sm flex items-center justify-center mb-4">
                01
              </div>
              <h3 className="text-base font-semibold text-[#1D1D1F] mb-2">
                Minerar Vídeos Validados
              </h3>
              <p className="text-xs text-[#86868B] leading-relaxed">
                Baixe os Reels mais curtidos e compartilhados do Instagram em alta definição sem marca d&apos;água.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-6 rounded-2xl bg-white border border-black/[0.06] apple-shadow flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#0071E3]/10 text-[#0071E3] font-bold text-sm flex items-center justify-center mb-4">
                02
              </div>
              <h3 className="text-base font-semibold text-[#1D1D1F] mb-2">
                Aplicar Molduras Virais
              </h3>
              <p className="text-xs text-[#86868B] leading-relaxed">
                Aplique molduras e layouts de alta retenção em lote com 1 clique, tornando o vídeo único para o algoritmo.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-6 rounded-2xl bg-white border border-black/[0.06] apple-shadow flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#0071E3]/10 text-[#0071E3] font-bold text-sm flex items-center justify-center mb-4">
                03
              </div>
              <h3 className="text-base font-semibold text-[#1D1D1F] mb-2">
                Gerar Legendas com IA
              </h3>
              <p className="text-xs text-[#86868B] leading-relaxed">
                A Inteligência Artificial redige legendas persuasivas com chamadas irresistíveis para o seu link de vendas.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="p-6 rounded-2xl bg-white border border-black/[0.06] apple-shadow flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#0071E3]/10 text-[#0071E3] font-bold text-sm flex items-center justify-center mb-4">
                04
              </div>
              <h3 className="text-base font-semibold text-[#1D1D1F] mb-2">
                Agendamento Automático 24/7
              </h3>
              <p className="text-xs text-[#86868B] leading-relaxed">
                Programe datas e horários. O ViralDog faz os envios automaticamente sem você precisar estar no PC.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Forms of Monetization */}
      <section id="monetizacao" className="py-20 px-4 sm:px-6 lg:px-8 bg-white border-y border-black/[0.06]">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16">
            <span className="text-[#0071E3] text-xs font-bold uppercase tracking-widest">
              Monetização Real
            </span>
            <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[#1D1D1F] mt-2">
              3 Maneiras Comprovadas de Ganhar Dinheiro com o ViralDog
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl bg-[#F5F5F7] border border-black/[0.06] apple-shadow flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-white border border-black/[0.06] flex items-center justify-center text-[#0071E3] mb-6">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold text-[#1D1D1F] mb-3">
                  1. Venda como Afiliado
                </h3>
                <p className="text-sm text-[#86868B] leading-relaxed mb-6">
                  Cadastre-se gratuitamente em plataformas como Kiwify, Hotmart ou Monetizze. Coloque o link do produto na bio do seu perfil dark e ganhe comissões de 50% a 80% em cada venda gerada pelas visualizações orgânicas dos seus Reels.
                </p>
              </div>
              <div className="text-xs font-semibold text-[#0071E3] bg-white p-3 rounded-xl border border-black/[0.06]">
                💰 Ganhos médios: R$ 1.500 a R$ 6.000 / mês
              </div>
            </div>

            <div className="p-8 rounded-3xl bg-[#F5F5F7] border border-black/[0.06] apple-shadow flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-white border border-black/[0.06] flex items-center justify-center text-[#0071E3] mb-6">
                  <Award className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold text-[#1D1D1F] mb-3">
                  2. Crie seus Próprios Infoprodutos
                </h3>
                <p className="text-sm text-[#86868B] leading-relaxed mb-6">
                  Com a ajuda do ChatGPT ou Gemini, crie e-books ou mini-guias simples de R$ 27 a R$ 97. Como o produto é seu, 100% do lucro das vendas fica no seu bolso, sem intermediários.
                </p>
              </div>
              <div className="text-xs font-semibold text-[#0071E3] bg-white p-3 rounded-xl border border-black/[0.06]">
                💰 Ganhos médios: R$ 3.000 a R$ 12.000 / mês
              </div>
            </div>

            <div className="p-8 rounded-3xl bg-[#F5F5F7] border border-black/[0.06] apple-shadow flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-white border border-black/[0.06] flex items-center justify-center text-[#0071E3] mb-6">
                  <Zap className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold text-[#1D1D1F] mb-3">
                  3. Parcerias & Publiposts
                </h3>
                <p className="text-sm text-[#86868B] leading-relaxed mb-6">
                  Conforme seus perfis acumulam milhares de seguidores orgânicos, empresas e outros criadores de conteúdo pagarão para divulgar links e perfis nos seus Stories e Reels.
                </p>
              </div>
              <div className="text-xs font-semibold text-[#0071E3] bg-white p-3 rounded-xl border border-black/[0.06]">
                💰 Ganhos médios: R$ 100 a R$ 500 por publicação
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Software Features */}
      <section id="recursos" className="py-24 px-4 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
        <div className="text-center mb-16">
          <span className="text-[#0071E3] text-xs font-bold uppercase tracking-widest">
            Tecnologia de Ponta
          </span>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[#1D1D1F] mt-2">
            Construído para Segurança e Escala
          </h2>
          <p className="text-[#86868B] text-sm max-w-xl mx-auto mt-2">
            Todas as ferramentas necessárias reunidas em uma interface moderna, rápida e confiável.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-8 rounded-3xl bg-white border border-black/[0.06] apple-shadow">
            <ShieldCheck className="w-8 h-8 text-[#0071E3] mb-4" />
            <h3 className="text-lg font-semibold text-[#1D1D1F] mb-2">
              Isolamento Anti-Bloqueio
            </h3>
            <p className="text-xs text-[#86868B] leading-relaxed">
              Cada perfil do Instagram roda em uma sessão isolada e independente com suporte a proxies dedicados, simulando a navegação humana e protegendo suas contas.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-white border border-black/[0.06] apple-shadow">
            <Monitor className="w-8 h-8 text-[#0071E3] mb-4" />
            <h3 className="text-lg font-semibold text-[#1D1D1F] mb-2">
              100% Desktop & Privado
            </h3>
            <p className="text-xs text-[#86868B] leading-relaxed">
              Seus dados, contas, vídeos e configurações ficam salvos com segurança no seu próprio computador.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-white border border-black/[0.06] apple-shadow">
            <Bot className="w-8 h-8 text-[#0071E3] mb-4" />
            <h3 className="text-lg font-semibold text-[#1D1D1F] mb-2">
              Inteligência Artificial Integrada
            </h3>
            <p className="text-xs text-[#86868B] leading-relaxed">
              Conecte sua chave de IA para gerar legendas e ganchos virais que aumentam a taxa de retenção e as chances de engajamento no Instagram.
            </p>
          </div>
        </div>
      </section>

      {/* Download Section (Direct .exe Download Box) */}
      <section id="download" className="py-20 px-4 sm:px-6 lg:px-8 max-w-[1000px] mx-auto w-full">
        <div className="p-10 sm:p-14 rounded-3xl bg-[#1D1D1F] text-white text-center flex flex-col items-center shadow-2xl relative overflow-hidden">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 text-white text-xs font-semibold uppercase tracking-wider mb-6">
            <HardDrive className="w-3.5 h-3.5 text-[#0071E3]" />
            Instalador Executável Oficial (.exe)
          </div>

          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight max-w-2xl mb-4">
            Baixe o ViralDog para Windows
          </h2>
          <p className="text-slate-400 text-sm max-w-xl mb-8 leading-relaxed">
            Instalação rápida com 1 clique. O pacote já contém todas as dependências embutidas (Frontend, Backend, FFmpeg e Isolamento de Perfis).
          </p>

          {/* Download Button */}
          <div className="flex flex-col items-center gap-4 w-full max-w-md">
            <a
              href={DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white font-semibold text-base transition-all hover:scale-[1.02] shadow-lg shadow-[#0071E3]/30 flex items-center justify-center gap-3 cursor-pointer"
            >
              <Download className="w-5 h-5" />
              Download ViralDog Setup v1.1.0 (.zip / .exe)
            </a>

            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400 mt-2">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Windows 10 / 11 (64-bits)
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ~223 MB
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Livre de Vírus & Malware
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8 max-w-[800px] mx-auto w-full">
        <div className="text-center mb-12">
          <span className="text-[#0071E3] text-xs font-bold uppercase tracking-widest">
            Dúvidas Frequentes
          </span>
          <h2 className="text-3xl font-semibold text-[#1D1D1F] mt-2">
            Perguntas & Respostas
          </h2>
        </div>

        <div className="space-y-4">
          {[
            {
              q: "Eu realmente não preciso mostrar o meu rosto?",
              a: "Exatamente! O método de Páginas Dark e Perfis de Nicho consiste em criar contas voltadas a temas específicos (pets, curiosidades, finanças, saúde, etc.). O ViralDog edita e publica vídeos que prendem a atenção sem nenhuma necessidade de você gravar ou aparecer.",
            },
            {
              q: "Preciso ter computador potente para rodar o ViralDog?",
              a: "Não! O software foi otimizado para Windows 10 e 11 de 64-bits e roda com leveza em computadores e notebooks convencionais.",
            },
            {
              q: "Como o ViralDog me ajuda a ganhar renda extra?",
              a: "Ele automatiza a parte mais demorada do trabalho: encontrar vídeos que já viralizaram, colocar molduras de retenção em lote, criar legendas persuasivas e fazer as postagens nos melhores horários. Com mais vídeos postados e mais visualizações, você converte mais vendas de produtos e afiliados.",
            },
            {
              q: "Quantas contas do Instagram posso conectar?",
              a: "Você pode conectar múltiplos perfis. Cada perfil conta com isolamento seguro de cookies e suporte a proxies para total tranquilidade.",
            },
            {
              q: "Como instalo após baixar o arquivo .exe?",
              a: "Basta dar um duplo clique no arquivo 'ViralDog Setup 1.1.0.exe' (ou extrair o ZIP) e avançar. O assistente instalará automaticamente o aplicativo e criará o ícone na sua Área de Trabalho.",
            },
          ].map((item, idx) => (
            <div
              key={idx}
              onClick={() => toggleFaq(idx)}
              className="p-6 rounded-2xl bg-white border border-black/[0.06] cursor-pointer apple-shadow transition-all"
            >
              <div className="flex items-center justify-between gap-4 font-semibold text-[#1D1D1F] text-sm sm:text-base">
                <span>{item.q}</span>
                <ChevronDown
                  className={`w-5 h-5 text-[#0071E3] transition-transform duration-200 ${
                    openFaq === idx ? "rotate-180" : ""
                  }`}
                />
              </div>
              {openFaq === idx && (
                <p className="mt-3 text-xs sm:text-sm text-[#86868B] leading-relaxed border-t border-black/[0.06] pt-3">
                  {item.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-black/[0.06] py-10 px-4 text-center text-xs text-[#86868B] bg-white">
        <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="ViralDog Logo"
              width={24}
              height={24}
              className="rounded-md"
            />
            <span className="font-bold text-[#1D1D1F]">ViralDog</span>
            <span>— © {new Date().getFullYear()} Todos os direitos reservados.</span>
          </div>
          <p className="text-[11px]">
            Software de automação para criadores e páginas no Instagram.
          </p>
        </div>
      </footer>
    </div>
  );
}
