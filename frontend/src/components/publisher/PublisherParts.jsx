import React, { useState, useRef, useEffect } from 'react';
import PostPreviewTooltip from './PostPreviewTooltip';

/**
 * QuickTimePopover — tiny inline popover for quick time changes.
 */
function QuickTimePopover({ post, onReschedule, onClose }) {
  const popoverRef = useRef(null);
  const currentDt = post.scheduled_time ? new Date(post.scheduled_time) : new Date();
  const currentH = String(currentDt.getHours()).padStart(2, '0');
  const currentM = String(currentDt.getMinutes()).padStart(2, '0');

  const [timeValue, setTimeValue] = useState(`${currentH}:${currentM}`);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleSave = (e) => {
    e.stopPropagation();
    const [h, m] = timeValue.split(':').map(Number);
    const newDate = new Date(currentDt);
    newDate.setHours(isNaN(h) ? 12 : h, isNaN(m) ? 0 : m, 0, 0);
    if (onReschedule) {
      onReschedule(post, newDate);
    }
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-outline-variant/30 p-2.5 flex flex-col gap-2 min-w-[170px] animate-fadeIn"
    >
      <span className="text-[10px] font-bold text-text-primary flex items-center gap-1">
        <span className="material-symbols-outlined text-[13px] text-[#0071E3]">schedule</span>
        Ajustar Horário
      </span>
      <div className="flex items-center gap-1.5">
        <input
          type="time"
          value={timeValue}
          onChange={(e) => setTimeValue(e.target.value)}
          className="px-2 py-1 bg-surface-off-white border border-outline-variant/20 rounded-lg text-xs font-bold text-text-primary focus:outline-hidden focus:border-[#0071E3]"
        />
        <button
          onClick={handleSave}
          className="p-1 bg-[#0071E3] hover:bg-[#005cbb] text-white rounded-lg text-xs font-bold transition-all"
          title="Salvar novo horário"
        >
          <span className="material-symbols-outlined text-[14px]">check</span>
        </button>
      </div>
      <div className="flex justify-between text-[8px] text-text-tertiary">
        <span>Horário atual: {currentH}:{currentM}</span>
        <button onClick={onClose} className="hover:underline text-rose-500 font-bold">Fechar</button>
      </div>
    </div>
  );
}

/**
 * PostCard — renders a single scheduled post in calendar cells with drag & drop and hover preview.
 */
export function PostCard({ post, accounts = [], onDelete, onRetry, onReschedule }) {
  const [showTimePopover, setShowTimePopover] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const matchedAcc = accounts.find(
    a => a.username === post.account_username ||
         a.display_name === post.account_username ||
         String(a.id) === String(post.account_username)
  );
  const displayUsername = matchedAcc ? (matchedAcc.display_name || matchedAcc.username) : post.account_username;

  const isDraggable = post.status !== 'posted';

  const handleDragStart = (e) => {
    if (!isDraggable) return;
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({
      id: post.id,
      scheduled_time: post.scheduled_time
    }));
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <PostPreviewTooltip post={post} accounts={accounts} disabled={showTimePopover || isDragging}>
      <div
        draggable={isDraggable}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={(e) => e.stopPropagation()}
        className={`p-2.5 border rounded-xl hover:shadow-md transition-all relative group/post flex flex-col gap-1 text-left select-none ${
          isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
        } ${
          isDragging ? 'opacity-40 scale-95 border-dashed border-[#0071E3]' : ''
        } ${
          post.status === 'failed' ? 'border-rose-200 bg-rose-50/20' : 'border-outline-variant/15 bg-surface-off-white hover:bg-surface-white'
        }`}
      >
        <div className="flex justify-between items-start gap-1">
          {/* Scheduled Time Pill with Quick-Edit and Cloud Badge */}
          <div className="relative flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (post.status !== 'posted') setShowTimePopover(!showTimePopover);
              }}
              className="text-[9px] font-bold text-[#0071E3] hover:bg-[#0071E3]/10 px-1 py-0.5 rounded transition-all leading-none flex items-center gap-0.5 cursor-pointer"
              title="Clique para ajustar horário rapidamente"
            >
              <span className="material-symbols-outlined text-[10px]">schedule</span>
              {post.scheduled_time ? new Date(post.scheduled_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
            </button>

            {post.is_cloud_scheduled && (
              <span className="text-[8px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-1 py-0.2 rounded flex items-center gap-0.5" title="Agendado no Cloud Worker 24/7 (Publica com PC desligado)">
                <span className="material-symbols-outlined text-[9px] text-sky-600">cloud_done</span>
                Nuvem
              </span>
            )}

            {showTimePopover && (
              <QuickTimePopover
                post={post}
                onReschedule={onReschedule}
                onClose={() => setShowTimePopover(false)}
              />
            )}
          </div>

          <div className="flex items-center gap-1">
            {post.status === 'failed' && onRetry && (
              <button
                onClick={(e) => onRetry(post.id, e)}
                className="text-[9px] text-[#0071E3] hover:text-[#005cbb] font-bold flex items-center gap-0.5 bg-[#0071E3]/10 hover:bg-[#0071E3]/20 px-1.5 py-0.5 rounded transition-all cursor-pointer"
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

        {/* Media / Post Title */}
        <div className="flex items-center gap-1 min-w-0">
          <span className="material-symbols-outlined text-[12px] text-text-tertiary shrink-0">
            {post.post_type === 'carousel' ? 'photo_library' : 'movie'}
          </span>
          <span className="text-[10px] font-bold text-text-primary truncate max-w-full block" title={post.video_path ? post.video_path.split(/[\\/]/).pop() : 'Post de Feed'}>
            {post.video_path ? post.video_path.split(/[\\/]/).pop() : 'Post de Feed'}
          </span>
        </div>

        {/* Caption Snippet */}
        <span className="text-[9px] text-text-secondary leading-normal truncate" title={post.caption}>
          {post.caption || 'Sem legenda'}
        </span>

        {post.status === 'failed' && post.error_message && (
          <div className="text-[8px] text-rose-600 font-semibold leading-tight line-clamp-2 bg-rose-100/60 p-1 rounded border border-rose-200/50 mt-0.5" title={post.error_message}>
            ⚠️ {post.error_message}
          </div>
        )}

        <div className="flex items-center justify-between gap-1.5 mt-1 border-t border-surface-container-high/50 pt-1 text-[8px] font-bold text-text-secondary uppercase">
          <span className="truncate">@{displayUsername}</span>
          <span className={`px-1 rounded ${
            post.status === 'posted' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
            post.status === 'failed' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
            post.status === 'processing' ? 'bg-amber-50 text-amber-600 border border-amber-100 animate-pulse' :
            'bg-blue-50 text-blue-600 border border-blue-100'
          }`}>
            {post.status}
          </span>
        </div>
      </div>
    </PostPreviewTooltip>
  );
}

/**
 * MonthlyPostPill — compact post indicator for monthly view with drag & drop and hover preview.
 */
export function MonthlyPostPill({ post, accounts = [], onRetry, onDelete, onReschedule }) {
  const [isDragging, setIsDragging] = useState(false);

  const matchedAcc = accounts.find(
    a => a.username === post.account_username ||
         a.display_name === post.account_username ||
         String(a.id) === String(post.account_username)
  );
  const displayUsername = matchedAcc ? (matchedAcc.display_name || matchedAcc.username) : post.account_username;

  const isDraggable = post.status !== 'posted';

  const handleDragStart = (e) => {
    if (!isDraggable) return;
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({
      id: post.id,
      scheduled_time: post.scheduled_time
    }));
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const timeStr = post.scheduled_time
    ? new Date(post.scheduled_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <PostPreviewTooltip post={post} accounts={accounts} disabled={isDragging}>
      <div
        draggable={isDraggable}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={(e) => e.stopPropagation()}
        className={`group/pill px-1.5 py-0.5 text-[8px] font-bold rounded truncate flex items-center justify-between gap-1 border select-none transition-all ${
          isDraggable ? 'cursor-grab active:cursor-grabbing hover:shadow-2xs' : 'cursor-default'
        } ${
          isDragging ? 'opacity-40 border-dashed border-[#0071E3]' : ''
        } ${
          post.status === 'posted' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
          post.status === 'failed' ? 'bg-rose-50 text-rose-700 border-rose-100' :
          'bg-blue-50 text-blue-700 border-blue-100'
        }`}
      >
        <div className="flex items-center gap-1 min-w-0">
          <span className="w-1 h-1 rounded-full bg-current shrink-0"></span>
          {timeStr && <span className="opacity-75">{timeStr}</span>}
          {post.is_cloud_scheduled && (
            <span className="material-symbols-outlined text-[10px] text-sky-600 shrink-0" title="Agendado no Cloud Worker 24/7">cloud_done</span>
          )}
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
    </PostPreviewTooltip>
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
