import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Format helper for ISO string YYYY-MM-DDTHH:mm to Date object
 */
function parseISO(str) {
  if (!str) return new Date();
  const [dPart, tPart] = str.split('T');
  if (!dPart) return new Date();
  const [year, month, day] = dPart.split('-').map(Number);
  const [hours, minutes] = (tPart || '00:00').split(':').map(Number);
  return new Date(year, month - 1, day, hours || 0, minutes || 0);
}

/**
 * Format Date object to ISO string YYYY-MM-DDTHH:mm
 */
function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export default function CustomDateTimePicker({ value, onChange, onSuggestTime, suggestingTime, mode = 'datetime', compact = false, renderTrigger }) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 288 });
  const containerRef = useRef(null);
  const portalRef = useRef(null);

  const parsedDate = parseISO(value);
  const [viewDate, setViewDate] = useState(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1));

  // Calculate fixed portal coordinates relative to trigger button
  const calculateCoords = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const popoverWidth = mode === 'date' ? 288 : 340;
      const popoverHeight = mode === 'date' ? 310 : 510;
      
      // Horizontal positioning
      let left = rect.right - popoverWidth;
      if (left < 10) left = rect.left;
      if (left + popoverWidth > window.innerWidth - 10) {
        left = Math.max(10, window.innerWidth - popoverWidth - 10);
      }
      
      // Vertical positioning: try below, then above, then clamp within viewport
      let top = rect.bottom + 6;
      if (top + popoverHeight > window.innerHeight - 10) {
        const topAbove = rect.top - popoverHeight - 6;
        if (topAbove >= 10) {
          top = topAbove;
        } else {
          top = Math.max(10, window.innerHeight - popoverHeight - 10);
        }
      }

      return {
        top: Math.max(10, Math.round(top)),
        left: Math.max(10, Math.round(left)),
        width: popoverWidth
      };
    }
    return null;
  }, [mode]);

  const updateCoords = useCallback(() => {
    const next = calculateCoords();
    if (next) setCoords(next);
  }, [calculateCoords]);

  const toggleOpen = () => {
    if (!isOpen) {
      const next = calculateCoords();
      if (next) setCoords(next);
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Sync viewDate when value changes
  useEffect(() => {
    const dt = parseISO(value);
    setViewDate(new Date(dt.getFullYear(), dt.getMonth(), 1));
  }, [value]);

  // Position listener when open
  useLayoutEffect(() => {
    if (isOpen) {
      updateCoords();
      window.addEventListener('resize', updateCoords);
      window.addEventListener('scroll', updateCoords, true);
    }
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [isOpen, updateCoords]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        if (portalRef.current && portalRef.current.contains(e.target)) return;
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Month navigation
  const prevMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Calendar generation
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarDays.push(null);
  }
  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    calendarDays.push(new Date(year, month, dayNum));
  }

  // Handle day click
  const handleSelectDay = (dateObj) => {
    if (!dateObj) return;
    const current = parseISO(value);
    const updated = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), current.getHours(), current.getMinutes());
    onChange(toISO(updated));
    if (mode === 'date') {
      setIsOpen(false);
    }
  };

  // Handle time change
  const handleTimeChange = (type, val) => {
    const current = parseISO(value);
    let h = current.getHours();
    let m = current.getMinutes();

    if (type === 'hours') h = Math.max(0, Math.min(23, Number(val)));
    if (type === 'minutes') m = Math.max(0, Math.min(59, Number(val)));

    const updated = new Date(current.getFullYear(), current.getMonth(), current.getDate(), h, m);
    onChange(toISO(updated));
  };

  // Handle set time
  const handleSetTime = (h, m) => {
    const current = parseISO(value);
    const updated = new Date(current.getFullYear(), current.getMonth(), current.getDate(), Number(h), Number(m));
    onChange(toISO(updated));
  };

  // Quick Preset Actions
  const applyPresetToday = () => {
    const now = new Date();
    const current = parseISO(value);
    const updated = new Date(now.getFullYear(), now.getMonth(), now.getDate(), current.getHours(), current.getMinutes());
    onChange(toISO(updated));
    if (mode === 'date') setIsOpen(false);
  };

  const applyPresetTomorrow = () => {
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    const current = parseISO(value);
    const updated = new Date(tom.getFullYear(), tom.getMonth(), tom.getDate(), current.getHours(), current.getMinutes());
    onChange(toISO(updated));
    if (mode === 'date') setIsOpen(false);
  };

  const applyPresetPlus1Hour = () => {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    onChange(toISO(now));
  };

  const applyPresetToday18 = () => {
    const now = new Date();
    if (now.getHours() >= 18) {
      now.setDate(now.getDate() + 1);
    }
    now.setHours(18, 0, 0, 0);
    onChange(toISO(now));
  };

  const applyPresetTomorrow9 = () => {
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    tom.setHours(9, 0, 0, 0);
    onChange(toISO(tom));
  };

  const applyPresetNextMonday = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = (day === 0 ? 1 : 8 - day);
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    const current = parseISO(value);
    monday.setHours(current.getHours(), current.getMinutes());
    onChange(toISO(monday));
    if (mode === 'date') setIsOpen(false);
  };

  // Formatted Label
  const formatTriggerText = () => {
    if (!value) return 'Selecione a data';
    const dt = parseISO(value);
    
    const dayStr = String(dt.getDate()).padStart(2, '0');
    const monthShort = MONTH_NAMES[dt.getMonth()].slice(0, 3);
    const weekdayShort = WEEKDAYS[dt.getDay()];
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');

    // Relative day check
    const checkDate = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    const diffTime = checkDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

    let relativeBadge = '';
    if (diffDays === 0) relativeBadge = 'Hoje';
    else if (diffDays === 1) relativeBadge = 'Amanhã';
    else if (diffDays > 1 && diffDays <= 7) relativeBadge = `${weekdayShort}`;

    if (mode === 'date') {
      return {
        formatted: `${weekdayShort}, ${dayStr} de ${monthShort}`,
        badge: relativeBadge
      };
    }

    return {
      formatted: `${weekdayShort}, ${dayStr} de ${monthShort} • ${hh}:${mm}`,
      badge: relativeBadge
    };
  };

  const labelInfo = formatTriggerText();

  return (
    <div className={`relative ${renderTrigger ? 'w-full' : compact ? 'inline-block' : 'w-full'}`} ref={containerRef}>
      {/* Trigger Button */}
      {renderTrigger ? (
        renderTrigger({ open: toggleOpen, isOpen, labelInfo, value })
      ) : compact ? (
        <button
          type="button"
          onClick={toggleOpen}
          className={`px-2.5 py-1.5 rounded-xl bg-[#0071E3]/10 hover:bg-[#0071E3]/20 text-[#0071E3] text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer border ${
            isOpen ? 'border-[#0071E3] ring-2 ring-[#0071E3]/20 shadow-2xs' : 'border-transparent hover:shadow-2xs'
          }`}
          title="Clique para alterar data e horário"
        >
          <span className="material-symbols-outlined text-[15px]">event</span>
          <span>{typeof labelInfo === 'object' ? labelInfo.formatted : labelInfo}</span>
          <span className="material-symbols-outlined text-[13px] opacity-70 ml-0.5">edit_calendar</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={toggleOpen}
          className={`w-full ${mode === 'date' ? 'p-2.5' : 'p-3.5'} bg-white border transition-all duration-200 rounded-xl flex items-center justify-between shadow-xs text-left group cursor-pointer ${
            isOpen
              ? 'border-[#0071E3] ring-2 ring-[#0071E3]/20'
              : 'border-[#E8E8ED] hover:border-[#86868B]/40'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-[18px]">calendar_month</span>
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-[9px] font-bold text-[#86868B] uppercase tracking-[0.08em]">
                {mode === 'date' ? 'Data de Início' : 'Data e Horário'}
              </span>
              <span className="text-xs font-bold text-[#1D1D1F] truncate">
                {typeof labelInfo === 'object' ? labelInfo.formatted : labelInfo}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {typeof labelInfo === 'object' && labelInfo.badge && (
              <span className="px-2 py-0.5 rounded-full bg-[#0071E3]/10 text-[#0071E3] text-[10px] font-extrabold">
                {labelInfo.badge}
              </span>
            )}
            <span className={`material-symbols-outlined text-[#86868B] text-[18px] transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#0071E3]' : ''}`}>
              expand_more
            </span>
          </div>
        </button>
      )}

      {/* Popover Dropdown Portal (Floats outside any scroll container) */}
      {isOpen && createPortal(
        <div
          ref={portalRef}
          id="custom-datetime-portal"
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: mode === 'date' ? '288px' : `${coords.width}px`,
            maxHeight: 'calc(100vh - 20px)',
            zIndex: 9999999,
          }}
          className="bg-white border border-[#E8E8ED] rounded-2xl p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.25)] animate-in fade-in zoom-in-95 duration-150 flex flex-col gap-3 overflow-y-auto custom-scrollbar"
        >
          {/* Quick Presets Section */}
          <div className="flex flex-col gap-1 pb-2 border-b border-[#F5F5F7]">
            <span className="text-[9px] font-bold text-[#86868B] uppercase tracking-[0.08em] px-0.5">Atalhos Rápidos</span>
            <div className="flex flex-wrap gap-1">
              {mode === 'date' ? (
                <>
                  <button
                    type="button"
                    onClick={applyPresetToday}
                    className="px-2.5 py-1 rounded-lg bg-[#F5F5F7] hover:bg-[#0071E3]/10 hover:text-[#0071E3] text-[11px] font-bold text-[#1D1D1F] transition-colors cursor-pointer"
                  >
                    Hoje
                  </button>
                  <button
                    type="button"
                    onClick={applyPresetTomorrow}
                    className="px-2.5 py-1 rounded-lg bg-[#F5F5F7] hover:bg-[#0071E3]/10 hover:text-[#0071E3] text-[11px] font-bold text-[#1D1D1F] transition-colors cursor-pointer"
                  >
                    Amanhã
                  </button>
                  <button
                    type="button"
                    onClick={applyPresetNextMonday}
                    className="px-2.5 py-1 rounded-lg bg-[#F5F5F7] hover:bg-[#0071E3]/10 hover:text-[#0071E3] text-[11px] font-bold text-[#1D1D1F] transition-colors cursor-pointer"
                  >
                    Segunda
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={applyPresetPlus1Hour}
                    className="px-2.5 py-1 rounded-lg bg-[#F5F5F7] hover:bg-[#0071E3]/10 hover:text-[#0071E3] text-xs font-semibold text-[#1D1D1F] transition-colors cursor-pointer"
                  >
                    ⚡ +1h
                  </button>
                  <button
                    type="button"
                    onClick={applyPresetToday18}
                    className="px-2.5 py-1 rounded-lg bg-[#F5F5F7] hover:bg-[#0071E3]/10 hover:text-[#0071E3] text-xs font-semibold text-[#1D1D1F] transition-colors cursor-pointer"
                  >
                    🌙 Hoje 18h
                  </button>
                  <button
                    type="button"
                    onClick={applyPresetTomorrow9}
                    className="px-2.5 py-1 rounded-lg bg-[#F5F5F7] hover:bg-[#0071E3]/10 hover:text-[#0071E3] text-xs font-semibold text-[#1D1D1F] transition-colors cursor-pointer"
                  >
                    🌅 Amanhã 9h
                  </button>
                  {onSuggestTime && (
                    <button
                      type="button"
                      onClick={() => { onSuggestTime(); }}
                      disabled={suggestingTime}
                      className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-500/10 to-[#0071E3]/10 text-[#0071E3] border border-[#0071E3]/20 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span>✨</span> {suggestingTime ? 'Calculando...' : 'IA Sugerir'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Month Header Navigation */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-extrabold text-[#1D1D1F]">
              {MONTH_NAMES[month]} {year}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevMonth}
                className="w-6 h-6 rounded-lg hover:bg-[#F5F5F7] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="w-6 h-6 rounded-lg hover:bg-[#F5F5F7] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 text-center">
            {WEEKDAYS.map(w => (
              <span key={w} className="text-[10px] font-bold text-[#86868B] uppercase py-0.5">
                {w}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarDays.map((d, idx) => {
              if (!d) return <div key={`empty-${idx}`} className="w-8 h-8" />;

              const isPast = d.getTime() < today.getTime();
              const isSelected =
                parsedDate.getDate() === d.getDate() &&
                parsedDate.getMonth() === d.getMonth() &&
                parsedDate.getFullYear() === d.getFullYear();

              const isTodayDay =
                today.getDate() === d.getDate() &&
                today.getMonth() === d.getMonth() &&
                today.getFullYear() === d.getFullYear();

              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  disabled={isPast}
                  onClick={() => handleSelectDay(d)}
                  className={`w-8 h-8 mx-auto rounded-lg text-xs font-semibold flex items-center justify-center transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? 'bg-[#0071E3] text-white shadow-sm font-extrabold scale-105'
                      : isPast
                      ? 'text-gray-300 opacity-40 cursor-not-allowed'
                      : isTodayDay
                      ? 'bg-[#0071E3]/10 text-[#0071E3] font-bold border border-[#0071E3]/30 hover:bg-[#0071E3]/20'
                      : 'text-[#1D1D1F] hover:bg-[#F5F5F7]'
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Time Picker Section (Only when mode === 'datetime') */}
          {mode === 'datetime' && (
            <>
              <div className="pt-3 border-t border-[#F5F5F7] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-[0.08em]">Horário da Publicação</span>
                  <span className="text-xs font-bold text-[#0071E3]">
                    {String(parsedDate.getHours()).padStart(2, '0')}:{String(parsedDate.getMinutes()).padStart(2, '0')}
                  </span>
                </div>

                {/* Time Pickers (Hours & Minutes) */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center bg-[#F5F5F7] rounded-xl p-1.5 border border-[#E8E8ED]">
                    <span className="text-xs font-medium text-[#86868B] px-2">Hora</span>
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={String(parsedDate.getHours()).padStart(2, '0')}
                      onChange={e => handleTimeChange('hours', e.target.value)}
                      className="w-full text-center text-sm font-bold text-[#1D1D1F] bg-transparent border-0 outline-none focus:outline-none focus:ring-0 focus:border-0 shadow-none ring-0 focus:ring-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      style={{ outline: 'none', border: 'none', boxShadow: 'none', WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                    />
                  </div>

                  <span className="text-sm font-bold text-[#86868B]">:</span>

                  <div className="flex-1 flex items-center bg-[#F5F5F7] rounded-xl p-1.5 border border-[#E8E8ED]">
                    <span className="text-xs font-medium text-[#86868B] px-2">Min</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      step="5"
                      value={String(parsedDate.getMinutes()).padStart(2, '0')}
                      onChange={e => handleTimeChange('minutes', e.target.value)}
                      className="w-full text-center text-sm font-bold text-[#1D1D1F] bg-transparent border-0 outline-none focus:outline-none focus:ring-0 focus:border-0 shadow-none ring-0 focus:ring-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      style={{ outline: 'none', border: 'none', boxShadow: 'none', WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                    />
                  </div>
                </div>

                {/* Quick Hours Chips */}
                <div className="flex justify-between gap-1 mt-1">
                  {['09:00', '12:00', '15:00', '18:00', '21:00'].map(t => {
                    const [h, m] = t.split(':').map(Number);
                    const isActive = parsedDate.getHours() === h && parsedDate.getMinutes() === m;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleSetTime(h, m)}
                        className={`flex-1 py-1.5 rounded-xl text-[11px] font-semibold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#0071E3] text-white font-bold shadow-xs'
                            : 'bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#86868B] hover:text-[#1D1D1F]'
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Confirm Button */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full py-2.5 rounded-2xl bg-[#0071E3] hover:bg-[#005cbb] active:scale-98 text-white font-bold text-xs shadow-md shadow-[#0071E3]/25 transition-all text-center cursor-pointer"
              >
                Confirmar Horário
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
