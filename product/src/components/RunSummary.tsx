import React, { useState } from 'react';
import { Loader2, ChevronDown, ChevronUp, AlertCircle, Sparkles, Play, Clock, RefreshCw } from 'lucide-react';

export const WalletDisplay = ({ credits, isLoading }: { credits: number | null, isLoading?: boolean }) => {
  return (
    <div className="flex items-center gap-2">
      {isLoading ? (
        <div className="h-6 w-24 bg-surface-secondary/50 rounded animate-pulse" />
      ) : (
        <span className="font-mono text-sm text-text-primary font-bold">
          {credits !== null ? `${credits} credits` : '—'}
        </span>
      )}
    </div>
  );
};

export const CostBreakdown = ({
  items,
  estimatedTotal,
}: {
  items: Array<{ code: string; label: string; credits: string }>;
  estimatedTotal: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`mt-4 rounded-xl border transition-all duration-200 ${
      isOpen
        ? 'border-accent-cyan/25 bg-canvas/45 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_8px_24px_rgba(0,0,0,0.16)]'
        : 'border-transparent border-t-border-subtle pt-4'
    }`}>
      <button 
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full rounded-lg px-1 py-1 text-xs text-text-muted hover:text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-accent-cyan"
      >
        <span>{isOpen ? 'Hide cost breakdown' : 'View cost breakdown'}</span>
        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {isOpen && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-border-subtle/70 pt-3 text-xs font-mono">
          {items.map((item) => (
            <div
              key={item.code}
              className="flex justify-between gap-4 rounded-lg bg-surface-secondary/35 px-2.5 py-2 text-text-secondary"
            >
              <span>{item.label}</span>
              <span className="shrink-0 text-text-primary">{item.credits}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between rounded-lg border border-accent-cyan/20 bg-accent-cyan/5 px-2.5 py-2.5 font-bold text-text-primary">
            <span>Estimated total</span>
            <span>{estimatedTotal}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const RunActionGate = ({
  credits,
  estimatedCost,
  canRun,
  missingCredits,
  isGenerating,
  onGenerate,
  onNavigateToStore,
  isProModeActive = false
}: {
  credits: number | null;
  estimatedCost: number;
  canRun: boolean;
  missingCredits: number;
  isGenerating: boolean;
  onGenerate: () => void;
  onNavigateToStore,
  isProModeActive?: boolean;
}) => {
  if (credits === null) { return <button disabled className="w-full relative px-6 py-3 rounded-xl bg-surface-secondary text-text-muted flex items-center justify-center gap-2 cursor-not-allowed border border-border-subtle"><Loader2 className="w-4 h-4 animate-spin" /><span className="font-display text-sm tracking-widest font-bold uppercase">Loading balance...</span></button>; }
  const isConfirming = false; // Could be true if backend check is in progress

  if (isConfirming) {
    return (
      <button 
        disabled
        className="w-full relative px-6 py-3 rounded-xl bg-surface-secondary text-text-muted flex items-center justify-center gap-2 cursor-not-allowed border border-border-subtle"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="font-display text-sm tracking-widest font-bold uppercase">Confirming final cost...</span>
      </button>
    );
  }

  if (isGenerating) {
    return (
      <button 
        disabled
        className="w-full relative px-6 py-3 rounded-xl bg-accent-cyan/50 text-canvas flex items-center justify-center gap-2 cursor-not-allowed"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="font-display text-sm tracking-widest font-bold uppercase">Analysis running</span>
      </button>
    );
  }

  if (!canRun) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" />
          <span>You need {missingCredits} more credits.</span>
        </div>
        <button 
          onClick={onNavigateToStore}
          className="w-full relative px-6 py-3 rounded-xl bg-surface-secondary text-text-primary border border-border-subtle hover:bg-surface-primary transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent-cyan flex items-center justify-center gap-2"
        >
          <span className="font-display text-sm tracking-widest font-bold uppercase">Get credits</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center text-xs font-sans text-text-secondary">
        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 opacity-70" /> Estimated Time: ~2 mins</span>
        <span className="font-bold text-accent-cyan">{estimatedCost} credits</span>
      </div>
      <button 
        onClick={onGenerate}
        disabled={isGenerating}
        className="w-full relative px-6 py-3 rounded-xl overflow-hidden group hover:shadow-[0_0_20px_rgba(0,240,255,0.4)] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:ring-offset-2 focus:ring-offset-surface-primary btn-cyber-gradient"
      >
        <div className="relative z-10 flex items-center justify-center gap-2 font-display text-sm tracking-widest font-bold uppercase">
          <Play className="w-4 h-4 fill-current" />
          Run analysis
        </div>
      </button>
    </div>
  );
};

export const RunSummaryPanel = ({
  drawCount,
  analysisScope,
  selectedMode,
  activeLayerCount,
  activeRuleCount,
  credits,
  isGenerating,
  runCooldownLabel = null,
  onGenerate,
  onNavigateToStore,
  isProModeActive = false,
  isDeepEvidenceActive = false,
  quotedCost,
  quoteCanRun,
  quoteMissingCredits,
  quoteBreakdown = [],
  quoteError = null,
  isQuoteLoading = false,
  onRetryQuote,
}: {
  drawCount: number;
  analysisScope: 'forecast' | 'historical';
  selectedMode: string;
  activeLayerCount: number;
  activeRuleCount: number;
  credits: number | null;
  isGenerating: boolean;
  runCooldownLabel?: string | null;
  onGenerate: () => void;
  onNavigateToStore: () => void;
  isProModeActive?: boolean;
  isDeepEvidenceActive?: boolean;
  quotedCost: number | null;
  quoteCanRun: boolean | null;
  quoteMissingCredits: number | null;
  quoteBreakdown?: Array<{ code: string; label: string; credits: string }>;
  quoteError?: string | null;
  isQuoteLoading?: boolean;
  onRetryQuote?: () => void;
}) => {
  const estimatedCost = quotedCost;
  const currentCredits = credits ?? 0;
  const projectedBalance = credits !== null && estimatedCost !== null
    ? Math.max(0, currentCredits - estimatedCost)
    : 0;


  return (
    <div className="bg-surface-primary border border-border-subtle rounded-xl p-6 flex flex-col h-fit sticky top-6 shadow-lg shadow-black/20">
      {isProModeActive && (
        <div className="mb-4 inline-flex items-center justify-center py-1.5 px-3 rounded text-[10px] font-bold tracking-widest text-white shadow-lg bg-gradient-to-r from-[#00E6FF] to-[#FF00F3] uppercase">
          <Sparkles className="w-3 h-3 mr-1" /> Pro Mode Active
        </div>
      )}

      <h3 className="text-lg font-display font-medium text-text-primary uppercase tracking-wide mb-6 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent-cyan" />
        Run summary
      </h3>

      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col">
          <span className="text-xs font-sans text-text-muted">Data range</span>
          <span className="text-sm font-medium text-text-primary">{drawCount} draws</span>
        </div>

        <div className="flex flex-col">
          <span className="text-xs font-sans text-text-muted">Analysis type</span>
          <span className="text-sm font-medium text-text-primary">
            {analysisScope === 'forecast' ? 'Forecast' : 'Historical'}
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-xs font-sans text-text-muted">Tone</span>
          <span className="text-sm font-medium text-text-primary">{selectedMode}</span>
        </div>

        <div className="flex flex-col">
          <span className="text-xs font-sans text-text-muted">Signal layers</span>
          <span className="text-sm font-medium text-text-primary">{activeLayerCount} selected</span>
        </div>

        <div className="flex flex-col">
          <span className="text-xs font-sans text-text-muted">Quality rules</span>
          <span className="text-sm font-medium text-text-primary">{activeRuleCount} active</span>
        </div>

        <div className="flex flex-col">
          <span className="text-xs font-sans text-text-muted">Evidence depth</span>
          <span className={`text-sm font-medium ${isDeepEvidenceActive ? 'text-accent-cyan' : 'text-text-primary'}`}>
            {isDeepEvidenceActive ? 'Deep · 3×' : 'Standard · 1×'}
          </span>
        </div>
      </div>

      <div className="border-t border-border-subtle pt-4 pb-6 flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <span className="text-sm font-sans text-text-muted">Estimated cost</span>
          <span className="text-sm font-mono text-text-primary font-bold">
            {estimatedCost === null
              ? (isGenerating ? 'Cost locked' : '—')
              : `${estimatedCost} credits`}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm font-sans text-text-muted">Current balance</span>
          <WalletDisplay credits={credits} />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm font-sans text-text-muted">Projected balance</span>
          <span className="text-sm font-mono text-text-secondary">
            {credits !== null && estimatedCost !== null ? `${projectedBalance} credits` : '---'}
          </span>
        </div>
      </div>

      {isGenerating ? (
        <div
          role="status"
          className="w-full relative px-4 py-3 rounded-xl bg-accent-cyan/10 text-accent-cyan flex items-center justify-center gap-2 border border-accent-cyan/30"
        >
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span className="font-display text-xs tracking-wide font-bold text-center uppercase">
            Cost locked · Analysis running
          </span>
        </div>
      ) : runCooldownLabel ? (
        <button
          type="button"
          disabled
          className="w-full relative px-4 py-3 rounded-xl bg-amber-400/10 text-amber-300 flex items-center justify-center gap-2 border border-amber-400/30 cursor-not-allowed"
        >
          <Clock className="w-4 h-4 shrink-0" />
          <span className="font-display text-xs tracking-wide font-bold text-center uppercase">
            {runCooldownLabel}
          </span>
        </button>
      ) : estimatedCost === null ? (
        <div className="flex flex-col gap-3">
          <div
            role={quoteError ? 'alert' : 'status'}
            className="w-full relative px-4 py-3 rounded-xl bg-surface-secondary text-text-muted flex items-center justify-center gap-2 border border-border-subtle"
          >
            {isQuoteLoading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
            <span className="font-display text-xs tracking-wide font-bold text-center">
              {quoteError ?? 'Loading server quote...'}
            </span>
          </div>
          {quoteError && onRetryQuote && (
            <button
              type="button"
              onClick={onRetryQuote}
              disabled={isQuoteLoading}
              className="w-full relative px-6 py-3 rounded-xl bg-surface-secondary text-text-primary border border-border-subtle hover:bg-surface-primary disabled:text-text-muted disabled:cursor-not-allowed transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent-cyan flex items-center justify-center gap-2"
            >
              <RefreshCw
                className={`w-4 h-4 ${isQuoteLoading ? 'animate-spin' : ''}`}
              />
              <span className="font-display text-sm tracking-widest font-bold uppercase">
                Retry advisor data
              </span>
            </button>
          )}
        </div>
      ) : (
        <RunActionGate
          credits={credits}
          estimatedCost={estimatedCost}
          canRun={quoteCanRun === true}
          missingCredits={quoteMissingCredits ?? 0}
          isGenerating={isGenerating}
          onGenerate={onGenerate}
          onNavigateToStore={onNavigateToStore}
        />
      )}

      {estimatedCost !== null && quoteBreakdown.length > 0 && (
        <CostBreakdown
          items={quoteBreakdown}
          estimatedTotal={String(estimatedCost)}
        />
      )}
    </div>
  );
};
