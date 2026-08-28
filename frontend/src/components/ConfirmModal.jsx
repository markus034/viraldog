import React, { useEffect } from 'react';

/**
 * ConfirmModal — Universal modern confirmation dialog (Apple Glassmorphism style).
 * 
 * @param {boolean} isOpen - Controls visibility
 * @param {function} onClose - Cancel handler
 * @param {function} onConfirm - Confirm handler
 * @param {string} title - Header title
 * @param {string} description - Explanation message
 * @param {string} confirmText - Label for confirm action button
 * @param {string} cancelText - Label for cancel/keep button
 * @param {'danger' | 'warning' | 'info'} type - Color theme variant
 * @param {string} icon - Material icon name
 * @param {boolean} isLoading - Loading state for async operations
 * @param {object} itemDetails - Optional contextual summary card { title, subtitle, account, time, icon }
 */
export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Tem certeza?',
  description = 'Esta ação não poderá ser desfeita.',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  type = 'danger',
  icon = 'delete_forever',
  isLoading = false,
  itemDetails = null,
  children
}) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      } else if (e.key === 'Enter' && !isLoading && e.target.tagName !== 'BUTTON') {
        onConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose, onConfirm]);

  if (!isOpen) return null;

  const isDanger = type === 'danger';
  const isWarning = type === 'warning';

  const iconBg = isDanger
    ? 'bg-rose-50 border-rose-100 text-rose-600 dark:bg-rose-950/40 dark:border-rose-900/50 dark:text-rose-400'
    : isWarning
    ? 'bg-amber-50 border-amber-100 text-amber-600 dark:bg-amber-950/40 dark:border-amber-900/50 dark:text-amber-400'
    : 'bg-blue-50 border-blue-100 text-[#0071E3] dark:bg-blue-950/40 dark:border-blue-900/50 dark:text-blue-400';

  const confirmBtnBg = isDanger
    ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-sm hover:shadow-rose-500/20'
    : isWarning
    ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-sm hover:shadow-amber-500/20'
    : 'bg-[#0071E3] hover:bg-[#005cbb] active:bg-[#004ca0] text-white shadow-sm hover:shadow-blue-500/20';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/45 backdrop-blur-md animate-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-white border border-[#E5E5EA] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.18)] p-6 flex flex-col gap-5 animate-modal-content relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top subtle highlight banner */}
        <div
          className={`absolute top-0 left-0 right-0 h-1 ${
            isDanger ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-[#0071E3]'
          }`}
        />

        {/* Header Icon + Titles */}
        <div className="flex items-start gap-4">
          <div
            className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 shadow-xs ${iconBg}`}
          >
            <span className="material-symbols-outlined text-[24px]">
              {icon || (isDanger ? 'delete_forever' : isWarning ? 'warning' : 'info')}
            </span>
          </div>

          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="text-base font-bold text-[#1D1D1F] tracking-tight leading-snug">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-[#86868B] mt-1 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Optional Item Details Card (Preview of the post or entity) */}
        {itemDetails && (
          <div className="bg-[#F5F5F7] border border-[#E5E5EA] rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white border border-[#E5E5EA] flex items-center justify-center text-[#86868B] shrink-0 shadow-2xs">
              <span className="material-symbols-outlined text-[20px]">
                {itemDetails.icon || (itemDetails.type === 'carousel' ? 'photo_library' : 'movie')}
              </span>
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span
                className="text-xs font-bold text-[#1D1D1F] truncate"
                title={itemDetails.title}
              >
                {itemDetails.title || 'Publicação'}
              </span>

              <div className="flex items-center gap-2 text-[10px] text-[#86868B]">
                {itemDetails.account && (
                  <span className="font-semibold text-[#1D1D1F] truncate">
                    @{itemDetails.account}
                  </span>
                )}
                {itemDetails.time && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-[#86868B]/50 shrink-0" />
                    <span className="text-[#0071E3] font-semibold shrink-0">
                      {itemDetails.time}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {children}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2.5 px-4 bg-[#F5F5F7] hover:bg-[#E5E5EA] active:bg-[#D1D1D6] text-[#1D1D1F] font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border border-transparent"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 py-2.5 px-4 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 ${confirmBtnBg}`}
          >
            {isLoading ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin">
                  progress_activity
                </span>
                <span>Processando...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">
                  {isDanger ? 'delete' : 'check'}
                </span>
                <span>{confirmText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
