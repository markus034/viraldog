import React from 'react';
import { StatCard } from './PublisherParts';

export default function DashboardMetrics({ pubState }) {
  const { scheduledPosts, repostEligible } = pubState;
  
  const totalPosts = scheduledPosts.length;
  const postedPosts = scheduledPosts.filter(p => p.status === 'posted');
  const failedPosts = scheduledPosts.filter(p => p.status === 'failed');
  const pendingPosts = scheduledPosts.filter(p => p.status === 'pending');
  const processingPosts = scheduledPosts.filter(p => p.status === 'processing');

  const successRate = totalPosts > 0
    ? ((postedPosts.length / (postedPosts.length + failedPosts.length || 1)) * 100).toFixed(0)
    : 0;

  const avgEngagement = postedPosts.length > 0
    ? (postedPosts.reduce((acc, curr) => acc + (curr.engagement_score || 0), 0) / postedPosts.length).toFixed(1)
    : 0;

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      {/* Stat Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 stagger-children">
        <StatCard 
          label="Posts Agendados" 
          value={totalPosts} 
          subLabel={`Pendente: ${pendingPosts.length}`} 
          subIcon="schedule" 
          icon="calendar_today" 
        />
        <StatCard 
          label="Postados" 
          value={postedPosts.length} 
          subLabel="Publicados no IG" 
          subIcon="check_circle" 
          icon="task_alt" 
        />
        <StatCard 
          label="Taxa de Sucesso" 
          value={`${successRate}%`} 
          subLabel="Média do sistema" 
          subIcon="trending_up" 
          icon="bar_chart" 
        />
        <StatCard 
          label="Engajamento Médio" 
          value={`${avgEngagement}%`} 
          subLabel="Com base nas curtidas/comentários" 
          subIcon="" 
          icon="favorite" 
        />
      </div>

      {/* Detail section — Estatísticas Gerais */}
      <div className="bg-surface-white border border-outline-variant/20 p-6 rounded-2xl shadow-sm flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#1D1D1F] tracking-[-0.01em]">Estatísticas Gerais</h3>
            <p className="text-[11px] text-[#86868B] mt-0.5">Visão geral do pipeline de publicações automáticas.</p>
          </div>
          <div className="w-9 h-9 bg-[#F5F5F7] rounded-lg flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px] text-[#86868B]">analytics</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#F5F5F7] rounded-xl p-4 flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#86868B]">queue</span>
            <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Total na Fila</span>
            <span className="text-xl font-bold text-[#1D1D1F]">{scheduledPosts.length}</span>
          </div>
          <div className="bg-[#F5F5F7] rounded-xl p-4 flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#86868B]">sync</span>
            <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Processando</span>
            <span className="text-xl font-bold text-[#1D1D1F]">{processingPosts.length}</span>
          </div>
          <div className="bg-[#F5F5F7] rounded-xl p-4 flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#0071E3]">autorenew</span>
            <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Elegíveis Repost</span>
            <span className="text-xl font-bold text-[#0071E3]">{repostEligible.length}</span>
          </div>
          <div className="bg-[#F5F5F7] rounded-xl p-4 flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#86868B]">error_outline</span>
            <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Falhados</span>
            <span className="text-xl font-bold text-rose-600">{failedPosts.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
