import React from 'react';

/**
 * DayLoadIndicator — renders a top capacity bar and post count badge.
 */
export default function DayLoadIndicator({ count = 0, compact = false }) {
  if (count === 0) return null;

  let colorBar = 'bg-emerald-500';
  let badgeStyle = 'text-emerald-700 bg-emerald-50 border-emerald-200';
  let label = count === 1 ? '1 post' : `${count} posts`;
  let barWidth = 'w-1/3';

  if (count >= 5) {
    colorBar = 'bg-amber-500';
    badgeStyle = 'text-amber-700 bg-amber-50 border-amber-200';
    label = `${count} posts (alta carga)`;
    barWidth = 'w-full';
  } else if (count >= 3) {
    colorBar = 'bg-[#0071E3]';
    badgeStyle = 'text-[#0071E3] bg-blue-50 border-blue-200';
    label = `${count} posts`;
    barWidth = 'w-2/3';
  }

  if (compact) {
    // Compact version for Monthly view cell
    return (
      <div className="w-full flex items-center justify-between gap-1 mb-1 pointer-events-none">
        <div className="h-1 flex-1 bg-surface-container-high/60 rounded-full overflow-hidden">
          <div className={`h-full ${colorBar} ${barWidth} rounded-full transition-all duration-300`} />
        </div>
        <span className={`text-[8px] font-bold px-1 py-0.2 rounded border leading-none shrink-0 ${badgeStyle}`}>
          {count}
        </span>
      </div>
    );
  }

  // Standard version for Weekly view cell header
  return (
    <div className="w-full flex flex-col gap-1 pb-1 px-1 pointer-events-none">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold text-text-tertiary">Carga:</span>
        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border leading-none ${badgeStyle}`}>
          {label}
        </span>
      </div>
      <div className="h-1 w-full bg-surface-container-high/60 rounded-full overflow-hidden">
        <div className={`h-full ${colorBar} ${barWidth} rounded-full transition-all duration-300`} />
      </div>
    </div>
  );
}
