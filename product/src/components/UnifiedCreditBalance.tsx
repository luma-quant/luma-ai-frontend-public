import apiClient from '@/src/api/apiClient';
import React from 'react';

export const UnifiedCreditBalance = ({ credits }: { credits: number | null }) => {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-surface-secondary/50 rounded-md border border-border-subtle shrink-0">
      <img src="/credits.webp" alt="Credits" className="w-3.5 h-3.5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      <span className="font-mono text-xs font-bold text-accent-cyan">
        {credits !== null ? `${credits.toLocaleString()} CR` : '...'}
      </span>
    </div>
  );
};
