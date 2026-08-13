import React from 'react';
import {
  Check,
  ChevronRight,
  Cpu,
  Download,
  Loader2,
  Sparkles,
} from 'lucide-react';

import type {
  AdvisorReportListItem,
  AdvisorTipScenarioQuoteResponse,
} from '../api/backendData';
import { advisorReportScopeLabel } from '../api/advisorReportPresentation';
import {
  formatAdvisorTipScenarioRetryCountdown,
} from '../api/advisorTipScenarioErrors';
import { formatAnalyticsTimestamp } from '../api/analyticsFilters';
import type { PendingAdvisorTipScenarioGeneration } from '../api/advisorTipScenarioRecovery';

export interface GeneratedTicketDraft {
  id: string;
  position: number;
  main_numbers: [number, number, number, number, number];
  star_numbers: [number, number];
}

interface ReportTicketGeneratorProps {
  drawId: number;
  reports: AdvisorReportListItem[];
  selectedReportIds: string[];
  ticketCount: number;
  quote: AdvisorTipScenarioQuoteResponse | null;
  generatedTickets: GeneratedTicketDraft[];
  creditsCharged: string | null;
  balanceAfter: string | null;
  pendingRequest: PendingAdvisorTipScenarioGeneration | null;
  error: string | null;
  isQuoting: boolean;
  isGenerating: boolean;
  retryRemainingSeconds: number;
  onToggleReport: (report: AdvisorReportListItem) => void;
  onTicketCountChange: (count: number) => void;
  onReviewQuote: () => void;
  onGenerate: () => void;
  onReadReport: (reportId: string) => void;
  onDownloadCsv: () => void;
}

export function ReportTicketGenerator({
  drawId,
  reports,
  selectedReportIds,
  ticketCount,
  quote,
  generatedTickets,
  creditsCharged,
  balanceAfter,
  pendingRequest,
  error,
  isQuoting,
  isGenerating,
  retryRemainingSeconds,
  onToggleReport,
  onTicketCountChange,
  onReviewQuote,
  onGenerate,
  onReadReport,
  onDownloadCsv,
}: ReportTicketGeneratorProps) {
  const selectionLocked = pendingRequest !== null || isGenerating;

  return (
    <section
      aria-label="AI ticket generator"
      className="overflow-hidden rounded-xl border border-accent-cyan/20 bg-canvas-elevated"
    >
      <div className="flex flex-col gap-5 border-b border-white/5 p-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent-cyan" />
            <h2 className="text-base font-semibold text-white">AI Ticket Generator</h2>
          </div>
          <p className="text-sm leading-relaxed text-slate-400">
            Select up to five completed reports for Draw {drawId}. LUMA uses their verified
            evidence to create 20-120 editable manual tickets per batch.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Need more tickets? Run another batch. New batches add unique rows that are not
            already saved for this draw, so you can build larger sets - including 1,000 tickets
            across repeated batches.
          </p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
            Always 1 CR per ticket / exact total confirmed first / nothing is submitted or played automatically
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
              Tickets
            </span>
            <input
              aria-label="Number of AI-generated tickets"
              type="number"
              min={20}
              max={120}
              step={1}
              value={ticketCount}
              disabled={selectionLocked}
              onChange={(event) => onTicketCountChange(Number(event.target.value))}
              className="h-10 w-28 rounded-lg border border-white/10 bg-black/20 px-3 font-mono text-sm text-white outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/30 disabled:cursor-not-allowed disabled:opacity-40"
            />
          </label>
          <button
            type="button"
            onClick={onReviewQuote}
            disabled={
              selectedReportIds.length === 0
              || isQuoting
              || isGenerating
              || pendingRequest !== null
              || retryRemainingSeconds > 0
            }
            className="h-10 rounded-lg border border-accent-cyan/30 bg-accent-cyan/10 px-4 text-xs font-bold uppercase tracking-wider text-accent-cyan transition-colors hover:bg-accent-cyan/15 focus:outline-none focus:ring-2 focus:ring-accent-cyan disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isQuoting
              ? 'Preparing quote…'
              : retryRemainingSeconds > 0
                ? `Retry in ${formatAdvisorTipScenarioRetryCountdown(retryRemainingSeconds)}`
                : 'Review credit quote'}
          </button>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs text-slate-300">
            {selectedReportIds.length}/5 reports selected
          </span>
          <span className="rounded border border-accent-cyan/20 bg-accent-cyan/5 px-2 py-1 font-mono text-[10px] text-accent-cyan">
            Draw {drawId}
          </span>
          {reports.length === 0 && (
            <span className="text-xs text-slate-500">
              Complete an Advisor report for this draw to unlock AI ticket generation.
            </span>
          )}
        </div>

        {reports.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {reports.map((report) => {
              const isSelected = selectedReportIds.includes(report.id);
              const disabled = selectionLocked
                || (!isSelected && selectedReportIds.length >= 5);
              return (
                <article
                  key={report.id}
                  className={`group relative flex min-h-[170px] flex-col overflow-hidden rounded-xl border bg-canvas p-5 transition-all duration-300 hover:-translate-y-1 focus-within:ring-2 focus-within:ring-accent-cyan focus-within:ring-offset-2 focus-within:ring-offset-canvas ${
                    isSelected
                      ? 'border-accent-cyan/50 shadow-[0_10px_30px_-10px_rgba(0,240,255,0.2)]'
                      : 'border-white/5 hover:border-accent-cyan/30 hover:shadow-[0_10px_30px_-10px_rgba(0,240,255,0.15)]'
                  }`}
                >
                  <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-bl-full bg-accent-cyan/5 transition-colors group-hover:bg-accent-cyan/10" />
                  <div className="relative z-10 flex items-start justify-between gap-3">
                    <span className={`flex items-center gap-2 rounded border px-2 py-1 font-mono text-[10px] font-bold uppercase ${report.luma_pro
                      ? 'border-accent-magenta/25 bg-accent-magenta/10 text-accent-magenta'
                      : 'border-accent-cyan/20 bg-accent-cyan/10 text-accent-cyan'}`}
                    >
                      <Cpu className="h-3 w-3" />
                      {report.luma_pro ? 'LUMA PRO' : report.tone}
                    </span>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onToggleReport(report)}
                      disabled={disabled}
                      className={`rounded border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider transition-colors focus:outline-none focus:ring-2 focus:ring-accent-cyan disabled:cursor-not-allowed disabled:opacity-30 ${
                        isSelected
                          ? 'border-accent-cyan/45 bg-accent-cyan/15 text-accent-cyan'
                          : 'border-white/10 bg-black/20 text-slate-400 hover:border-accent-cyan/30 hover:text-accent-cyan'
                      }`}
                    >
                      {isSelected ? 'Selected' : 'Select'}
                    </button>
                  </div>
                  <span className="relative z-10 mt-3 font-mono text-[10px] text-slate-500">
                    {formatAnalyticsTimestamp(report.completed_at)}
                  </span>
                  <p className="relative z-10 mt-3 flex-1 text-xs leading-relaxed text-slate-300">
                    {advisorReportScopeLabel(report)} · {report.signal_layers.length > 0
                      ? `${report.signal_layers.length} signal layers`
                      : 'Base contract'} · {report.deep_evidence ? 'Deep evidence' : 'Standard evidence'}
                  </p>
                  <button
                    type="button"
                    onClick={() => onReadReport(report.id)}
                    className="relative z-10 mt-4 flex w-fit items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-accent-cyan transition-transform hover:translate-x-1 focus:outline-none focus:ring-2 focus:ring-accent-cyan"
                  >
                    Review report <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </article>
              );
            })}
          </div>
        )}

        {error && (
          <div role="alert" className="mt-5 rounded-lg border border-red-400/25 bg-red-400/5 px-4 py-3 text-sm text-red-200">
            {error}
            {retryRemainingSeconds > 0 && (
              <span className="mt-1 block font-mono text-xs text-red-100">
                Retry available in {formatAdvisorTipScenarioRetryCountdown(retryRemainingSeconds)}
              </span>
            )}
          </div>
        )}

        {pendingRequest && generatedTickets.length === 0 && (
          <div role="status" className="mt-5 flex flex-col gap-3 rounded-xl border border-amber-300/25 bg-amber-300/[0.045] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-amber-100">
                {pendingRequest.generation_id === null
                  ? 'Exact paid request saved'
                  : 'Tickets are being saved to My Tickets'}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
                {pendingRequest.generation_id === null
                  ? 'Resume the original request with the same quote and security key. It will not be charged twice.'
                  : 'Your credits were charged once. LUMA is reconciling delivery automatically; no duplicate charge or duplicate ticket set will be created.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onGenerate}
              disabled={isGenerating || retryRemainingSeconds > 0}
              className="flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-200/30 bg-amber-200/10 px-4 text-xs font-bold uppercase tracking-wider text-amber-100 transition-colors hover:bg-amber-200/15 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isGenerating && <Loader2 className="h-4 w-4 animate-spin" />}
              {isGenerating
                ? pendingRequest.generation_id === null
                  ? 'Resuming…'
                  : 'Checking delivery…'
                : retryRemainingSeconds > 0
                  ? `Check in ${formatAdvisorTipScenarioRetryCountdown(retryRemainingSeconds)}`
                  : pendingRequest.generation_id === null
                    ? 'Resume exact request'
                    : 'Check delivery now'}
            </button>
          </div>
        )}

        {quote && generatedTickets.length === 0 && pendingRequest === null && (
          <div className="mt-5 flex flex-col gap-4 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs sm:grid-cols-4">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-slate-500">Tickets</div>
                <div className="mt-1 font-mono font-bold text-white">{quote.scenario_count}</div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-slate-500">Price</div>
                <div className="mt-1 font-mono font-bold text-white">{quote.total_credits} CR</div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-slate-500">Balance</div>
                <div className="mt-1 font-mono text-slate-300">{quote.current_balance} CR</div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-slate-500">After</div>
                <div className="mt-1 font-mono text-slate-300">{quote.projected_balance} CR</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onGenerate}
              disabled={!quote.can_generate || isGenerating || retryRemainingSeconds > 0}
              className="btn-cyber-glass flex min-h-10 items-center justify-center gap-2 rounded px-5 py-2 text-xs font-bold uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {quote.can_generate
                ? isGenerating
                  ? 'Generating tickets…'
                  : `Generate ${quote.scenario_count} tickets for ${quote.total_credits} CR`
                : `Missing ${quote.missing_credits} CR`}
            </button>
          </div>
        )}

        {generatedTickets.length > 0 && (
          <div className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.025] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Check className="h-4 w-4 text-emerald-300" />
                  {generatedTickets.length} generated manual tickets
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  {creditsCharged ? `${creditsCharged} CR charged` : 'Generation complete'}
                  {balanceAfter ? ` / ${balanceAfter} CR remaining` : ''}. These tickets are saved
                  to My Tickets. Edit or delete them here, then export the current set.
                </p>
              </div>
              <button
                type="button"
                onClick={onDownloadCsv}
                className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-accent-cyan/30 bg-accent-cyan/10 px-4 text-xs font-bold uppercase tracking-wider text-accent-cyan transition-colors hover:bg-accent-cyan/15 focus:outline-none focus:ring-2 focus:ring-accent-cyan"
              >
                <Download className="h-4 w-4" />
                Download CSV
              </button>
            </div>

            <p className="mt-4 rounded-lg border border-accent-cyan/15 bg-accent-cyan/[0.035] px-4 py-3 text-xs leading-relaxed text-slate-300">
              The generated rows now live in the Manual Ticket Set below. That is the single
              place to review, edit, or delete them.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
