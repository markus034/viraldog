import React from 'react';

export default function PostList({ pubState }) {
  const { scheduledPosts, accounts = [] } = pubState;
  const postedPosts = scheduledPosts.filter(p => p.status === 'posted');

  return (
    <div className="bg-surface-white border border-outline-variant/20 rounded-2xl p-6 shadow-sm flex flex-col gap-4 animate-fadeIn">
      <div className="flex justify-between items-center border-b border-surface-container-high pb-3">
        <div>
          <h3 className="text-sm font-bold text-text-primary">Meus Posts Publicados</h3>
          <p className="text-[11px] text-text-secondary">Lista histórica de publicações enviadas ao Instagram.</p>
        </div>
        <span className="px-2.5 py-1 bg-surface-off-white border border-outline-variant/20 rounded-md text-[10px] font-bold text-text-primary uppercase tracking-wide">
          Total: {postedPosts.length}
        </span>
      </div>

      {postedPosts.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-text-secondary gap-1.5 text-center">
          <span className="material-symbols-outlined text-[36px] opacity-40 text-[#0071E3]">grid_on</span>
          <p className="text-xs font-bold">Nenhum post publicado encontrado no banco de dados.</p>
          <p className="text-[10px] text-text-tertiary">Posts mudarão para esta lista após a publicação ser executada.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {postedPosts.map(post => {
            const matchedAcc = accounts.find(a => a.username === post.account_username || a.display_name === post.account_username || String(a.id) === String(post.account_username));
            const displayUsername = matchedAcc ? (matchedAcc.display_name || matchedAcc.username) : post.account_username;

            return (
              <div key={post.id} className="p-4 bg-surface-off-white border border-outline-variant/20 rounded-xl hover:shadow-sm transition-all duration-200 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[8px] font-bold uppercase tracking-wider">
                    Postado
                  </span>
                  <span className="text-[10px] font-semibold text-text-secondary">
                    {post.scheduled_time ? new Date(post.scheduled_time).toLocaleDateString('pt-BR') : ''}
                  </span>
                </div>
                <div className="text-xs font-bold text-text-primary truncate" title={post.video_path ? post.video_path.split(/[\\/]/).pop() : 'Post de Feed'}>
                  {post.video_path ? post.video_path.split(/[\\/]/).pop() : 'Post de Feed'}
                </div>
                <p className="text-[11px] text-text-secondary leading-normal line-clamp-2">
                  {post.caption}
                </p>
                <div className="flex justify-between items-center gap-2 mt-2 pt-2 border-t border-outline-variant/10 text-[9px] font-bold text-text-secondary uppercase">
                  <span>@{displayUsername}</span>
                  {post.engagement_score ? (
                    <span className="text-[#0071E3]">Engajamento: {post.engagement_score.toFixed(1)}%</span>
                  ) : (
                    <span className="text-text-tertiary font-medium">Sem métricas</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
