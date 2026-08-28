import React from 'react';

/**
 * PostCard — renders a single scheduled post in calendar cells.
 */
export function PostCard({ post, accounts = [], onDelete, onRetry }) {
  const matchedAcc = accounts.find(a => a.username === post.account_username || a.display_name === post.account_username || String(a.id) === String(post.account_username));
  const displayUsername = matchedAcc ? (matchedAcc.display_name || matchedAcc.username) : post.account_username;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`p-2.5 border rounded-xl hover:shadow-xs transition-all relative group/post flex flex-col gap-1 text-left ${
        post.status === 'failed' ? 'border-rose-200 bg-rose-50/20' : 'border-outline-variant/10 bg-surface-off-white'
      }`}
    >
      <div className="flex justify-between items-start gap-1">
        <span className="text-[9px] font-bold text-[#0071E3] leading-none">
          {post.scheduled_time ? new Date(post.scheduled_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
        </span>
        <div className="flex items-center gap-1">
          {post.status === 'failed' && onRetry && (
            <button
              onClick={(e) => onRetry(post.id, e)}
              className="text-[9px] text-[#0071E3] hover:text-[#005cbb] font-bold flex items-center gap-0.5 bg-[#0071E3]/10 hover:bg-[#0071E3]/20 px-1.5 py-0.5 rounded transition-all"
              title="Tentar novamente a publicação"
            >
              <span className="material-symbols-outlined text-[10px]">refresh</span> Tentar
            </button>
          )}
          <button
            onClick={(e) => onDelete(post, e)}
            className="opacity-0 group-hover/post:opacity-100 text-[10px] text-rose-500 hover:text-rose-700 transition-opacity font-bold cursor-pointer"
            title="Cancelar agendamento"
          >
            <span className="material-symbols-outlined text-[12px]">delete</span>
          </button>
        </div>
      </div>
      <span className="text-[10px] font-bold text-text-primary truncate max-w-full block" title={post.video_path ? post.video_path.split(/[\\/]/).pop() : 'Feed Post'}>
        {post.video_path ? post.video_path.split(/[\\/]/).pop() : 'Post de Feed'}
      </span>
      <span className="text-[9px] text-text-secondary leading-normal truncate" title={post.caption}>
        {post.caption}
      </span>
      {post.status === 'failed' && post.error_message && (
        <div className="text-[8px] text-rose-600 font-semibold leading-tight line-clamp-2 bg-rose-100/60 p-1 rounded border border-rose-200/50 mt-0.5" title={post.error_message}>
          ⚠️ {post.error_message}
        </div>
      )}
      <div className="flex items-center justify-between gap-1.5 mt-1 border-t border-surface-container-high/50 pt-1 text-[8px] font-bold text-text-secondary uppercase">
        <span className="truncate">@{displayUsername}</span>
        <span className={`px-1 rounded ${post.status === 'posted' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
            post.status === 'failed' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
              post.status === 'processing' ? 'bg-amber-50 text-amber-600 border border-amber-100 animate-pulse' :
                'bg-blue-50 text-blue-600 border border-blue-100'
          }`}>
          {post.status}
        </span>
      </div>
    </div>
  );
}

/**
 * MonthlyPostPill — compact post indicator for monthly view.
 */
export function MonthlyPostPill({ post, accounts = [], onRetry, onDelete }) {
  const matchedAcc = accounts.find(a => a.username === post.account_username || a.display_name === post.account_username || String(a.id) === String(post.account_username));
  const displayUsername = matchedAcc ? (matchedAcc.display_name || matchedAcc.username) : post.account_username;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`group/pill px-1.5 py-0.5 text-[8px] font-bold rounded truncate flex items-center justify-between gap-1 border ${post.status === 'posted' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
          post.status === 'failed' ? 'bg-rose-50 text-rose-700 border-rose-100' :
            'bg-blue-50 text-blue-700 border-blue-100'
        }`}
      title={`[${post.status}] @${displayUsername}: ${post.caption}${post.error_message ? `\nErro: ${post.error_message}` : ''}`}
    >
      <div className="flex items-center gap-1 min-w-0">
        <span className="w-1 h-1 rounded-full bg-current shrink-0"></span>
        <span className="truncate">{post.video_path ? post.video_path.split(/[\\/]/).pop() : 'Post Feed'}</span>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {post.status === 'failed' && onRetry && (
          <button
            onClick={(e) => onRetry(post.id, e)}
            className="text-rose-700 hover:text-rose-900 shrink-0 cursor-pointer"
            title="Tentar novamente"
          >
            <span className="material-symbols-outlined text-[10px]">refresh</span>
          </button>
        )}
        {onDelete && post.status !== 'posted' && (
          <button
            onClick={(e) => onDelete(post, e)}
            className="opacity-0 group-hover/pill:opacity-100 text-rose-500 hover:text-rose-700 transition-opacity shrink-0 cursor-pointer"
            title="Cancelar agendamento"
          >
            <span className="material-symbols-outlined text-[10px]">close</span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * StatCard — reusable stat card for Dashboard tab.
 */
export function StatCard({ label, value, subLabel, subIcon, icon }) {
  return (
    <div className="bg-surface-white border border-outline-variant/20 p-5 rounded-2xl shadow-sm flex items-center justify-between hover:shadow-[0_10px_40px_rgba(0,0,0,0.06)] hover:scale-[1.01] transition-all duration-300 cursor-default">
      <div className="flex flex-col">
        <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">{label}</span>
        <span className="text-title-md font-bold text-[#1D1D1F] mt-1">{value}</span>
        {subLabel && (
          <span className="text-[9px] text-[#0071E3] mt-1.5 font-semibold flex items-center gap-0.5">
            {subIcon && <span className="material-symbols-outlined text-[10px]">{subIcon}</span>}
            {subLabel}
          </span>
        )}
      </div>
      <div className="w-11 h-11 bg-[#F5F5F7] text-[#1D1D1F] rounded-xl flex items-center justify-center">
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </div>
    </div>
  );
}

/**
 * Renders caption text with highlighted hashtags and @mentions.
 */
export function CaptionText({ text, className = '', hashtagClass = '' }) {
  if (!text) return <span className="text-white/40 italic">A legenda aparecerá aqui...</span>;
  return text.split(' ').map((word, i) => {
    if (word.startsWith('#') || word.startsWith('@')) {
      return <span key={i} className={hashtagClass || "text-white font-bold"}>{word} </span>;
    }
    return word + ' ';
  });
}
