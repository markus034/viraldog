import React, { useState, useRef, useEffect, useCallback } from 'react';

function getAvatarGradient(username) {
  if (!username) return 'from-[#0071E3] to-[#4da3ff]';
  const gradients = [
    'from-[#F58529] via-[#DD2A7B] to-[#8134AF]', // Instagram classic
    'from-[#FF416C] to-[#FF4B2B]', // Sunset
    'from-[#0071E3] to-[#4da3ff]', // Tech Blue
    'from-[#11998e] to-[#38ef7d]', // Emerald
    'from-[#FC466B] to-[#3F5EFB]', // Neon Pink-Blue
    'from-[#7F00FF] to-[#E100FF]', // Purple Passion
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
}

function isImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('/') ||
    /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url)
  );
}

function CustomAvatar({ avatar, username = '', sizeClasses = 'w-5.5 h-5.5', textClasses = 'text-[8px]' }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [avatar]);

  if (!avatar && !username) return null;

  const hasImage = isImageUrl(avatar) && !imgError;
  const rawName = username || (typeof avatar === 'string' && !isImageUrl(avatar) ? avatar : '');
  const initial = rawName.replace(/^@/, '').charAt(0).toUpperCase() || 'U';
  const gradient = getAvatarGradient(rawName || 'default');

  return (
    <div className={`${sizeClasses} rounded-full bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] p-[1.5px] flex items-center justify-center shrink-0 shadow-xs`}>
      <div className="w-full h-full rounded-full bg-white p-[0.5px] overflow-hidden flex items-center justify-center relative">
        {hasImage ? (
          <img
            key={avatar}
            src={avatar}
            alt=""
            className="w-full h-full rounded-full object-cover relative z-10"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={`w-full h-full rounded-full bg-gradient-to-tr ${gradient} flex items-center justify-center text-white ${textClasses} font-extrabold`}>
            {initial}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * CustomSelect — Dropdown premium que substitui o <select> nativo.
 *
 * Props:
 *  - options: Array<{ value: string, label: string, icon?: string }>
 *  - value: string (valor selecionado)
 *  - onChange: (value: string) => void
 *  - placeholder?: string
 *  - label?: string
 *  - icon?: string (Material Symbol no trigger)
 *  - disabled?: boolean
 *  - required?: boolean
 *  - size?: 'sm' | 'md' (default 'md')
 *  - className?: string (classes extras no wrapper)
 */
export default function CustomSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Selecione...',
  label,
  icon,
  disabled = false,
  required = false,
  size = 'md',
  align = 'left',
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const triggerRef = useRef(null);

  const selectedOption = options.find(opt => opt.value === value);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-option]');
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Reset highlight when opening
  useEffect(() => {
    if (isOpen) {
      const idx = options.findIndex(opt => opt.value === value);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    }
  }, [isOpen]);

  const handleSelect = useCallback((optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  }, [onChange]);

  const handleKeyDown = useCallback((e) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0) {
          handleSelect(options[highlightedIndex].value);
        } else {
          setIsOpen(true);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex(prev =>
            prev < options.length - 1 ? prev + 1 : 0
          );
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex(prev =>
            prev > 0 ? prev - 1 : options.length - 1
          );
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        if (isOpen) {
          setIsOpen(false);
        }
        break;
      default:
        break;
    }
  }, [disabled, isOpen, highlightedIndex, options, handleSelect]);

  const sizeClasses = size === 'sm'
    ? 'py-1 px-2.5 text-[11px] h-[30px]'
    : size === 'filter'
    ? 'py-1.5 px-3 text-xs h-[36px]'
    : 'py-2 px-3.5 text-xs h-10';

  const listSizeClasses = (size === 'sm' || size === 'filter')
    ? 'py-1'
    : 'py-1.5';

  const itemSizeClasses = (size === 'sm' || size === 'filter')
    ? 'px-3 py-2 text-xs'
    : 'px-3.5 py-2.5 text-xs';

  const avatarSize = size === 'filter' ? 'w-6 h-6' : 'w-5.5 h-5.5';

  const alignClasses = align === 'right'
    ? 'right-0 left-auto min-w-full w-max'
    : 'left-0 min-w-full';

  return (
    <div className={`custom-select-wrapper relative ${className}`} ref={containerRef}>
      {label && (
        <label className="text-xs font-semibold text-text-primary block mb-1.5">
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`
          custom-select-trigger
          w-full flex items-center justify-between gap-2
          bg-white border border-[#E8E8ED] rounded-xl font-semibold shadow-xs
          transition-all duration-200 text-left
          ${sizeClasses}
          ${isOpen
            ? 'border-[#0071E3] bg-white shadow-[0_0_0_4px_rgba(0,113,227,0.15)]'
            : 'hover:border-[#86868B]/40'
          }
          ${disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer'
          }
        `}
      >
        <span className="flex items-center gap-2 min-w-0 flex-1">
          {selectedOption?.dotColor ? (
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs ring-1 ring-black/5"
              style={{ backgroundColor: selectedOption.dotColor }}
            />
          ) : selectedOption?.avatar || selectedOption?.username ? (
            <CustomAvatar avatar={selectedOption.avatar} username={selectedOption.username || selectedOption.label} sizeClasses={avatarSize} textClasses="text-[9px]" />
          ) : selectedOption?.isTag ? (
            <span className="text-[14px] font-bold text-[#86868B] shrink-0 select-none">#</span>
          ) : (
            <>
              {(selectedOption?.icon || icon) && (
                <span className="material-symbols-outlined text-[16px] text-[#86868B] shrink-0">
                  {selectedOption?.icon || icon}
                </span>
              )}
            </>
          )}
          <span
            className={`truncate ${selectedOption ? 'text-[#1D1D1F]' : 'text-[#86868B]'}`}
            style={selectedOption?.style || (selectedOption?.fontFamily ? { fontFamily: selectedOption.fontFamily } : {})}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <span
          className={`material-symbols-outlined text-[16px] text-[#86868B] shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#0071E3]' : ''
          }`}
        >
          expand_more
        </span>
      </button>

      {/* Dropdown List */}
      {isOpen && (
        <>
          {/* Invisible overlay to capture clicks */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div
            ref={listRef}
            role="listbox"
            className={`
              custom-select-dropdown
              absolute z-50 mt-1.5
              ${alignClasses}
              bg-white/95 backdrop-blur-md border border-[#E8E8ED]
              rounded-2xl p-1.5
              shadow-[0_16px_40px_rgba(0,0,0,0.12)]
              max-h-[220px] overflow-y-auto
              custom-scrollbar
            `}
            style={{ animation: 'selectDropIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlightedIndex;

              return (
                <div
                  key={option.value || `opt-${index}`}
                  data-option
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`
                    flex items-center justify-between gap-2.5
                    px-3 py-2 rounded-xl text-xs
                    font-medium cursor-pointer
                    transition-all duration-150
                    ${isHighlighted && !isSelected ? 'bg-[#F5F5F7]' : ''}
                    ${isSelected ? 'bg-[#0071E3]/10 text-[#0071E3] font-bold' : 'text-[#1D1D1F]'}
                  `}
                >
                  <span className="flex items-center gap-2.5 min-w-0 flex-1">
                    {option.dotColor ? (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs ring-1 ring-black/5"
                        style={{ backgroundColor: option.dotColor }}
                      />
                    ) : option.avatar || option.username ? (
                      <CustomAvatar avatar={option.avatar} username={option.username || option.label} sizeClasses="w-5.5 h-5.5" textClasses="text-[9px]" />
                    ) : (
                      !option.isTag && option.icon && (
                        <span className={`material-symbols-outlined text-[16px] shrink-0 ${isSelected ? 'text-[#0071E3]' : 'text-[#86868B]'}`}>
                          {option.icon}
                        </span>
                      )
                    )}
                    {option.isTag ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-[13px] font-bold select-none ${isSelected ? 'text-[#0071E3]' : 'text-[#86868B]'}`}>
                          #
                        </span>
                        <span className={`truncate text-xs ${isSelected ? 'text-[#0071E3] font-bold' : 'text-[#1D1D1F] font-semibold'}`}>
                          {option.label}
                        </span>
                      </div>
                    ) : (
                      <span
                        className="truncate"
                        style={option.style || (option.fontFamily ? { fontFamily: option.fontFamily } : {})}
                      >
                        {option.label}
                      </span>
                    )}
                  </span>
                  {isSelected && (
                    <span className="material-symbols-outlined text-[15px] text-[#0071E3] shrink-0 font-bold">check</span>
                  )}
                </div>
              );
            })}

            {options.length === 0 && (
              <div className="px-3 py-2 text-xs text-[#86868B] text-center italic">
                Nenhuma opção disponível
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
