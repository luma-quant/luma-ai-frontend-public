import React from 'react';

export const TicketGrid = ({
  numbers = [],
  cores = [],
  winningNumbers = [],
  winningCores = [],
  isReadOnly = false,
  compact = false,
  onToggleNumber,
  onToggleCore
}: {
  numbers?: number[];
  cores?: number[];
  winningNumbers?: number[];
  winningCores?: number[];
  isReadOnly?: boolean;
  compact?: boolean;
  onToggleNumber?: (n: number) => void;
  onToggleCore?: (n: number) => void;
}) => {
  return (
    <div className={compact
      ? 'flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start'
      : 'flex flex-col gap-6 xl:flex-row'}>
      <div className="flex flex-col gap-2">
        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Main Numbers (5 out of 50)</span>
        <div className={compact
          ? 'grid grid-cols-5 gap-1 sm:grid-cols-10'
          : 'grid grid-cols-5 gap-1.5 sm:grid-cols-10'}>
          {Array.from({ length: 50 }, (_, i) => i + 1).map(n => {
            const isSelected = numbers.includes(n);
            const isWinning = winningNumbers.includes(n);
            const isHit = isSelected && isWinning;
            
            let bgClass = "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700";
            if (isReadOnly) {
               if (isHit) bgClass = "bg-emerald-900/50 text-emerald-400 border-emerald-400";
               else if (isSelected) bgClass = "bg-cyan-900/50 text-cyan-400 border-cyan-400";
               else if (isWinning) bgClass = "bg-slate-800 text-emerald-500/50 border-emerald-900/30"; // subtle highlight for missed winning numbers
               else bgClass = "bg-slate-900 text-slate-600 border-slate-800";
            } else {
               if (isSelected) bgClass = "bg-cyan-900/50 text-cyan-400 border-cyan-400 hover:bg-cyan-900/70";
            }

            return (
              <button
                type="button"
                key={`num-${n}`}
                disabled={isReadOnly}
                onClick={() => onToggleNumber && onToggleNumber(n)}
                aria-label={`Main number ${n}${isSelected ? ', selected' : ''}`}
                aria-pressed={isSelected}
                className={`${compact ? 'h-7 w-7 text-[11px]' : 'h-7 w-7 text-xs sm:h-8 sm:w-8'} rounded flex items-center justify-center font-mono font-bold border transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300 ${bgClass} ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
              >
                {n}
              </button>
            )
          })}
        </div>
      </div>
      
      <div className="flex flex-col gap-2">
        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Cores (2 out of 12)</span>
        <div className={compact
          ? 'grid grid-cols-6 gap-1 sm:grid-cols-4'
          : 'grid grid-cols-4 gap-1.5 sm:grid-cols-6 xl:w-[136px] xl:grid-cols-4'}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(n => {
            const isSelected = cores.includes(n);
            const isWinning = winningCores.includes(n);
            const isHit = isSelected && isWinning;
            
            let bgClass = "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700";
            if (isReadOnly) {
               if (isHit) bgClass = "bg-emerald-900/50 text-emerald-400 border-emerald-400";
               else if (isSelected) bgClass = "bg-fuchsia-900/50 text-fuchsia-400 border-fuchsia-400";
               else if (isWinning) bgClass = "bg-slate-800 text-emerald-500/50 border-emerald-900/30";
               else bgClass = "bg-slate-900 text-slate-600 border-slate-800";
            } else {
               if (isSelected) bgClass = "bg-fuchsia-900/50 text-fuchsia-400 border-fuchsia-400 hover:bg-fuchsia-900/70";
            }

            return (
              <button
                type="button"
                key={`core-${n}`}
                disabled={isReadOnly}
                onClick={() => onToggleCore && onToggleCore(n)}
                aria-label={`Core number ${n}${isSelected ? ', selected' : ''}`}
                aria-pressed={isSelected}
                className={`${compact ? 'h-7 w-7 text-[11px]' : 'h-7 w-7 text-xs sm:h-8 sm:w-8'} rounded flex items-center justify-center font-mono font-bold border transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300 ${bgClass} ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
              >
                {n}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  );
};
