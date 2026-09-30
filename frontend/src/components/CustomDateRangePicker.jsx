import React, { useState, useEffect } from 'react';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function formatDateISO(date) {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateISO(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export default function CustomDateRangePicker({
  startDate,
  endDate,
  activeShortcut,
  onApply,
  onClose
}) {
  const parsedStart = parseDateISO(startDate) || new Date();
  const parsedEnd = parseDateISO(endDate) || new Date();

  const [tempStart, setTempStart] = useState(parsedStart);
  const [tempEnd, setTempEnd] = useState(parsedEnd);
  const [hoverDate, setHoverDate] = useState(null);
  const [selectingStep, setSelectingStep] = useState('start'); // 'start' | 'end'
  const [viewDate, setViewDate] = useState(new Date(parsedEnd.getFullYear(), parsedEnd.getMonth(), 1));

  useEffect(() => {
    if (startDate) setTempStart(parseDateISO(startDate));
    if (endDate) setTempEnd(parseDateISO(endDate));
  }, [startDate, endDate]);

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

  const prevMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleDayClick = (date) => {
    if (!date) return;

    if (selectingStep === 'start') {
      setTempStart(date);
      setTempEnd(null);
      setSelectingStep('end');
    } else {
      if (tempStart && date < tempStart) {
        setTempStart(date);
        setTempEnd(tempStart);
      } else {
        setTempEnd(date);
      }
      setSelectingStep('start');
    }
  };

  const SHORTCUTS = [
    {
      id: '24h',
      label: '24 horas',
      getRange: () => {
        const today = new Date();
        const start = new Date(today);
        start.setDate(start.getDate() - 1);
        return { start, end: today, periodDays: 1 };
      }
    },
    {
      id: 'today',
      label: 'Hoje',
      getRange: () => {
        const today = new Date();
        return { start: today, end: today, periodDays: 1 };
      }
    },
    {
      id: 'yesterday',
      label: 'Ontem',
      getRange: () => {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        return { start: y, end: y };
      }
    },
    {
      id: 'last7',
      label: 'Últimos 7d',
      getRange: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 6);
        return { start, end, periodDays: 7 };
      }
    },
    {
      id: 'last30',
      label: 'Últimos 30d',
      getRange: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 29);
        return { start, end, periodDays: 30 };
      }
    },
    {
      id: 'last90',
      label: 'Últimos 90d',
      getRange: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 89);
        return { start, end, periodDays: 90 };
      }
    },
    {
      id: 'thisMonth',
      label: 'Este Mês',
      getRange: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return { start, end };
      }
    },
    {
      id: 'lastMonth',
      label: 'Mês Passado',
      getRange: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        return { start, end };
      }
    },
  ];

  const handleShortcutClick = (shortcut) => {
    const range = shortcut.getRange();
    setTempStart(range.start);
    setTempEnd(range.end);
    setViewDate(new Date(range.end.getFullYear(), range.end.getMonth(), 1));
    setSelectingStep('start');
    onApply(formatDateISO(range.start), formatDateISO(range.end), shortcut.label, range.periodDays);
  };

  const isSameDay = (d1, d2) => {
    if (!d1 || !d2) return false;
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const isInRange = (d) => {
    if (!d) return false;
    const currentEnd = tempEnd || (selectingStep === 'end' ? hoverDate : null);
    if (!tempStart || !currentEnd) return false;

    const start = tempStart < currentEnd ? tempStart : currentEnd;
    const end = tempStart < currentEnd ? currentEnd : tempStart;

    const t = d.getTime();
    const st = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const et = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();

    return t >= st && t <= et;
  };

  const isRangeStart = (d) => {
    if (!d || !tempStart) return false;
    const currentEnd = tempEnd || (selectingStep === 'end' ? hoverDate : null);
    if (!currentEnd) return isSameDay(d, tempStart);

    const actualStart = tempStart < currentEnd ? tempStart : currentEnd;
    return isSameDay(d, actualStart);
  };

  const isRangeEnd = (d) => {
    if (!d) return false;
    const currentEnd = tempEnd || (selectingStep === 'end' ? hoverDate : null);
    if (!tempStart || !currentEnd) return false;

    const actualEnd = tempStart < currentEnd ? tempStart : currentEnd;
    return isSameDay(d, actualEnd);
  };

  const handleConfirm = () => {
    const s = tempStart || new Date();
    const e = tempEnd || s;
    const actualStart = s < e ? s : e;
    const actualEnd = s < e ? e : s;

    // Passing null for shortcut label means manual date selection
    onApply(formatDateISO(actualStart), formatDateISO(actualEnd), null, null);
  };

  // Count selected days
  const daysDiff = tempStart && tempEnd 
    ? Math.max(1, Math.round(Math.abs(tempEnd - tempStart) / (1000 * 60 * 60 * 24)) + 1)
    : 1;

  return (
    <div className="w-[336px] bg-white border border-[#E8E8ED] rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.18)] flex flex-col gap-3.5 select-none animate-in fade-in zoom-in-95 duration-150">
      
      {/* 1. Shortcuts Header */}
      <div className="flex flex-col gap-1.5 pb-2.5 border-b border-[#F5F5F7]">
        <span className="text-[9px] font-bold text-[#86868B] uppercase tracking-[0.08em] px-0.5">
          Atalhos de Período
        </span>
        <div className="grid grid-cols-4 gap-1">
          {SHORTCUTS.map(shortcut => {
            const isActive = activeShortcut === shortcut.label;
            return (
              <button
                key={shortcut.id}
                type="button"
                onClick={() => handleShortcutClick(shortcut)}
                className={`py-1.5 px-1 rounded-lg text-[10px] font-bold transition-all text-center cursor-pointer active:scale-95 truncate ${
                  isActive
                    ? 'bg-[#0071E3] text-white shadow-xs'
                    : 'bg-[#F5F5F7] hover:bg-[#0071E3]/10 hover:text-[#0071E3] text-[#1D1D1F]'
                }`}
                title={shortcut.label}
              >
                {shortcut.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Month Navigation */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-extrabold text-[#1D1D1F]">
          {MONTH_NAMES[month]} {year}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prevMonth}
            className="w-7 h-7 rounded-lg hover:bg-[#F5F5F7] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="w-7 h-7 rounded-lg hover:bg-[#F5F5F7] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
        </div>
      </div>

      {/* 3. Weekdays Header */}
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map(w => (
          <span key={w} className="text-[10px] font-bold text-[#86868B] uppercase py-0.5">
            {w}
          </span>
        ))}
      </div>

      {/* 4. Days Grid */}
      <div className="grid grid-cols-7 gap-y-1 text-center" onMouseLeave={() => setHoverDate(null)}>
        {calendarDays.map((d, idx) => {
          if (!d) return <div key={`empty-${idx}`} className="w-9 h-8" />;

          const inRange = isInRange(d);
          const isStart = isRangeStart(d);
          const isEnd = isRangeEnd(d);
          const isSingleSelected = isStart && isEnd;

          return (
            <div
              key={d.toISOString()}
              className={`relative flex items-center justify-center py-0.5 ${
                inRange && !isSingleSelected
                  ? isStart
                    ? 'bg-[#0071E3]/15 rounded-l-xl'
                    : isEnd
                    ? 'bg-[#0071E3]/15 rounded-r-xl'
                    : 'bg-[#0071E3]/15'
                  : ''
              }`}
            >
              <button
                type="button"
                onClick={() => handleDayClick(d)}
                onMouseEnter={() => {
                  if (selectingStep === 'end') setHoverDate(d);
                }}
                className={`w-8 h-8 rounded-xl text-xs font-semibold flex items-center justify-center transition-all duration-150 cursor-pointer ${
                  isStart || isEnd
                    ? 'bg-[#0071E3] text-white font-extrabold shadow-sm scale-105 z-10'
                    : inRange
                    ? 'text-[#0071E3] font-bold hover:bg-[#0071E3]/20'
                    : 'text-[#1D1D1F] hover:bg-[#F5F5F7]'
                }`}
              >
                {d.getDate()}
              </button>
            </div>
          );
        })}
      </div>

      {/* 5. Date Summary & Actions Footer */}
      <div className="pt-2.5 border-t border-[#F5F5F7] flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] bg-[#F5F5F7] px-2.5 py-1.5 rounded-xl">
          <div className="flex items-center gap-1.5 text-[#1D1D1F] font-bold">
            <span className="material-symbols-outlined text-[15px] text-[#0071E3]">date_range</span>
            <span>
              {tempStart ? tempStart.toLocaleDateString('pt-BR') : '--/--'} 
              {' → '} 
              {tempEnd ? tempEnd.toLocaleDateString('pt-BR') : (selectingStep === 'end' ? 'Selecione o fim' : '--/--')}
            </span>
          </div>
          {tempStart && tempEnd && (
            <span className="text-[10px] font-extrabold text-[#0071E3] bg-white px-2 py-0.5 rounded-md shadow-2xs">
              {daysDiff} {daysDiff === 1 ? 'dia' : 'dias'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 py-2 bg-[#0071E3] hover:bg-[#005cbb] active:scale-98 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md shadow-[#0071E3]/25 text-center"
          >
            Aplicar Período
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] rounded-xl text-xs font-semibold transition-all cursor-pointer text-center"
          >
            Cancelar
          </button>
        </div>
      </div>

    </div>
  );
}
