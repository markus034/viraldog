import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const API = 'http://localhost:8000';

export default function PostPreviewTooltip({
  post,
  accounts = [],
  children,
  className = '',
  disabled = false
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, placement: 'top' });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const timeoutRef = useRef(null);

  const matchedAcc = accounts.find(
    a => a.username === post.account_username ||
         a.display_name === post.account_username ||
         String(a.id) === String(post.account_username)
  );
  const displayUsername = matchedAcc ? (matchedAcc.display_name || matchedAcc.username) : post.account_username;
  const avatarUrl = matchedAcc?.avatar_url
    ? (matchedAcc.avatar_url.startsWith('http') ? matchedAcc.avatar_url : `${API}${matchedAcc.avatar_url}`)
    : null;

  const handleMouseEnter = () => {
    if (disabled) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const tooltipWidth = 310;
        const tooltipHeight = 440;

        // Tentar posicionar à direita do card primeiro para não cobrir o item e botão de excluir
        let left = rect.right + 14;
        let placement = 'right';

        if (left + tooltipWidth > window.innerWidth - 16) {
          // Se não couber à direita, posiciona à esquerda
          left = rect.left - tooltipWidth - 14;
          placement = 'left';
        }

        // Fallback para telas estreitas: centraliza com clamp
        if (left < 16) {
          left = Math.max(16, Math.min(window.innerWidth - tooltipWidth - 16, rect.left + rect.width / 2 - tooltipWidth / 2));
        }

        // Alinha o topo com o elemento disparador, garantindo limite dentro da viewport
        let top = rect.top - 8;
        if (top + tooltipHeight > window.innerHeight - 16) {
          top = Math.max(16, window.innerHeight - tooltipHeight - 16);
        }
        if (top < 16) {
          top = 16;
        }

        setPosition({ top, left, placement });
        setIsVisible(true);
      }
    }, 200);
  };

  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100);
  };

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  const videoUrl = post.video_path ? `${API}/api/videos/file?path=${encodeURIComponent(post.video_path)}` : null;
  const firstCarouselImage = post.carousel_image_paths && post.carousel_image_paths.length > 0
    ? (post.carousel_image_paths[0].startsWith('http') || post.carousel_image_paths[0].startsWith('blob:')
        ? post.carousel_image_paths[0]
        : `${API}/api/videos/file?path=${encodeURIComponent(post.carousel_image_paths[0])}`)
    : null;

  const formattedDate = post.scheduled_time
    ? new Date(post.scheduled_time).toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Sem data';

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative inline-block w-full ${className}`}
    >
      {children}

      {isVisible && createPortal(
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            top: `${position.top}px`,
            left: `${position.left}px`,
            zIndex: 99999
          }}
          className="w-[310px] max-w-[90vw] bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_24px_50px_rgba(0,0,0,0.22)] border border-[#E8E8ED] p-3.5 flex flex-col gap-3 text-left animate-fadeIn pointer-events-none select-none"
        >
          {/* Header with Account & Status */}
          <div className="flex items-center justify-between gap-2 border-b border-surface-container-high/60 pb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayUsername}
                  className="w-7 h-7 rounded-full object-cover border border-outline-variant/30 shrink-0 shadow-2xs"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center font-bold text-[10px] shrink-0">
                  {displayUsername ? displayUsername[0].toUpperCase() : '@'}
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-bold text-text-primary truncate">
                  @{displayUsername}
                </span>
                <span className="text-[9px] text-text-secondary font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-[11px] text-[#0071E3]">schedule</span>
                  {formattedDate}
                </span>
              </div>
            </div>

            {/* Status Pill */}
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border shrink-0 ${
              post.status === 'posted'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : post.status === 'failed'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : post.status === 'processing'
                ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                : 'bg-blue-50 text-[#0071E3] border-blue-200'
            }`}>
              {post.status === 'posted' ? 'Publicado' : post.status === 'failed' ? 'Falhou' : post.status === 'processing' ? 'Processando' : 'Agendado'}
            </span>
          </div>

          {/* Media Preview Area — Formato vertical para ver o vídeo/imagem completo sem cortes */}
          <div className="relative rounded-xl overflow-hidden bg-black/95 border border-outline-variant/20 aspect-[9/16] max-h-[260px] w-full flex items-center justify-center group/media mx-auto">
            {videoUrl ? (
              <video
                src={videoUrl}
                className="w-full h-full object-contain"
                muted
                autoPlay
                loop
                playsInline
                preload="metadata"
              />
            ) : firstCarouselImage ? (
              <img
                src={firstCarouselImage}
                alt="Preview"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-1 text-text-tertiary">
                <span className="material-symbols-outlined text-[28px] text-[#0071E3]/50">
                  {post.post_type === 'carousel' ? 'photo_library' : 'movie'}
                </span>
                <span className="text-[9px] font-medium text-white/70">Sem mídia local disponível</span>
              </div>
            )}

            {/* Format overlay badge */}
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-white text-[9px] font-bold flex items-center gap-1 shadow-sm">
              <span className="material-symbols-outlined text-[11px]">
                {post.post_type === 'carousel' ? 'photo_library' : 'movie'}
              </span>
              {post.post_type === 'carousel' ? `Carrossel (${post.carousel_image_paths?.length || 0})` : 'Reels'}
            </div>
          </div>

          {/* Caption preview with styled tags and generous reading area */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">
              Legenda
            </span>
            <div className="text-[11px] text-text-primary leading-relaxed bg-[#F5F5F7] p-2.5 rounded-xl border border-outline-variant/15 text-xs font-normal max-h-[110px] overflow-y-auto custom-scrollbar">
              {post.caption ? (
                post.caption.split(' ').map((word, i) => {
                  if (word.startsWith('#') || word.startsWith('@')) {
                    return <span key={i} className="text-[#0071E3] font-semibold">{word} </span>;
                  }
                  return word + ' ';
                })
              ) : (
                <span className="text-text-tertiary italic">Sem legenda configurada</span>
              )}
            </div>
          </div>

          {/* Error notice if failed */}
          {post.status === 'failed' && post.error_message && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[10px] p-2 rounded-lg leading-tight flex items-start gap-1.5">
              <span className="material-symbols-outlined text-[14px] shrink-0 text-rose-600">error</span>
              <span className="line-clamp-2">{post.error_message}</span>
            </div>
          )}

          {/* Drag & Drop Hint */}
          <div className="flex items-center justify-between text-[9px] text-text-tertiary pt-1 border-t border-surface-container-high/40">
            <span className="flex items-center gap-1 font-medium text-text-secondary">
              <span className="material-symbols-outlined text-[12px] text-[#0071E3]">drag_indicator</span>
              Arraste para mudar de dia
            </span>
            <span className="text-[9px] font-bold text-[#0071E3]">ViralDog</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
