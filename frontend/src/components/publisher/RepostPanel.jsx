import React from 'react';

export default function RepostPanel({ pubState }) {
  const { scheduledPosts, accounts = [], repostEligible, handleDeleteSchedule, handleRepost } = pubState;
  const pendingPosts = scheduledPosts.filter(p => p.status === 'pending');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
      {/* Left Column: Scheduled pending approval */}
      <div className="bg-surface-white border border-outline-variant/20 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
        <div className="border-b border-surface-container-high pb-3">
          <h3 className="text-sm font-bold text-text-primary">Agendamentos Pendentes</h3>
          <p className="text-[11px] text-text-secondary">Posts programados aguardando publicação.</p>
        </div>

        {pendingPosts.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-text-secondary gap-1.5 text-center">
            <span className="material-symbols-outlined text-[36px] opacity-40 text-[#0071E3]">checklist</span>
            <p className="text-xs font-bold">Nenhum post pendente na fila.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
            {pendingPosts.map(post => {
              const matchedAcc = accounts.find(a => a.username === post.account_username || a.display_name === post.account_username || String(a.id) === String(post.account_username));
              const displayUsername = matchedAcc ? (matchedAcc.display_name || matchedAcc.username) : post.account_username;

              return (
                <div key={post.id} className="p-4 bg-surface-off-white border border-outline-variant/20 rounded-xl hover:shadow-xs transition-all flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs font-bold text-text-primary truncate max-w-[180px]">
                        {post.video_path ? post.video_path.split(/[\\/]/).pop() : 'Post de Feed'}
                      </div>
                      <div className="text-[10px] text-text-secondary mt-0.5">
                        @{displayUsername} • {post.post_type === 'carousel' ? 'Feed' : 'Reels'}
                      </div>
                    </div>
                    <button onClick={(e) => handleDeleteSchedule(post.id, e)} className="text-[10px] text-rose-600 hover:text-rose-700 font-bold">
                      Cancelar
                    </button>
                  </div>
                  <p className="text-[11px] text-text-secondary leading-normal line-clamp-2">{post.caption}</p>
                  <div className="text-[9px] font-bold text-text-secondary border-t border-outline-variant/10 pt-2 flex justify-between">
                    <span>Data: {new Date(post.scheduled_time).toLocaleString('pt-BR')}</span>
                    <span className="text-[#0071E3]">Pendente</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right Column: Repost suggestions */}
      <div className="bg-surface-white border border-outline-variant/20 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
        <div className="border-b border-surface-container-high pb-3 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold text-text-primary">Elegíveis para Repostagem</h3>
            <p className="text-[11px] text-text-secondary">Posts com engajamento alto para repostar.</p>
          </div>
          <span className="px-2 py-0.5 bg-[#eeeef0] text-text-primary rounded-full text-[9px] font-bold">IA Ativa</span>
        </div>

        {repostEligible.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-text-secondary gap-1.5 text-center">
            <span className="material-symbols-outlined text-[36px] opacity-40">sync_problem</span>
            <p className="text-xs font-bold">Nenhum post elegível para repost automático.</p>
            <p className="text-[9px] text-text-tertiary max-w-[250px]">Requisitos: postado há mais de 30 dias com engajamento superior a 5%.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
            {repostEligible.map(post => (
              <div key={post.id} className="p-4 bg-surface-off-white border border-outline-variant/20 rounded-xl hover:shadow-xs transition-all flex flex-col gap-2.5">
                <div className="flex justify-between items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-text-primary truncate">{post.video_path?.split(/[\\/]/).pop()}</div>
                    <div className="text-[10px] text-text-secondary mt-1 flex items-center gap-2">
                      <span>Engajamento: <strong className="text-[#0071E3]">{post.engagement_score?.toFixed(1)}%</strong></span>
                      <span>•</span>
                      <span>Postado em: {post.posted_at ? new Date(post.posted_at).toLocaleDateString('pt-BR') : ''}</span>
                    </div>
                  </div>
                  <button onClick={() => handleRepost(post.id)} className="px-3 py-1.5 bg-[#0071E3] hover:bg-[#005cbb] text-white text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 shadow-xs shrink-0">
                    <span className="material-symbols-outlined text-[12px]">sync</span> Repostar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
