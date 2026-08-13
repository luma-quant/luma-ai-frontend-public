import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Database,
  Download,
  FileText,
  Check,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/Dialog';
import {
  canRequestAdvisorReportPdf,
  downloadAdvisorReportPdf,
  deleteManualTicket,
  fetchAdvisorReport,
  fetchAdvisorTipScenarioQuote,
  fetchAllAdvisorReports,
  fetchAllEvaluationDraws,
  fetchAllUserTips,
  fetchEngineStatus,
  fetchEvaluationModule,
  fetchEvaluationSummary,
  fetchTicketEvaluation,
  fetchTicketScoreboard,
  fetchUniverseAnalytics,
  generateAdvisorTipScenarios,
  reconcileAdvisorTipScenarioTickets,
  resolveHitPyramid,
  saveManualTicket,
  selectEngineUniverseDraws,
  type AdvisorReportListItem,
  type AdvisorRunResponse,
  type AdvisorTipScenarioGenerateResponse,
  type AdvisorTipScenarioDeliveredResponse,
  type AdvisorTipScenarioQuoteResponse,
  type EvaluationDrawListItem,
  type EvaluationModuleResponse,
  type EvaluationSummaryResponse,
  type TicketEvaluationItem,
  type TicketScoreboardResponse,
  type UniverseAnalyticsResponse,
  updateManualTicket,
} from '../api/backendData';
import { readEnginePresentationDrawId } from '../api/enginePipeline';
import {
  advisorTipScenarioErrorMessage,
  advisorTipScenarioRetryAfterMs,
  formatAdvisorTipScenarioRetryCountdown,
} from '../api/advisorTipScenarioErrors';
import {
  advisorTipDeliveryAutoRetryDelayMs,
  clearCompletedAdvisorTipScenarioGeneration,
  createPendingAdvisorTipScenarioGeneration,
  readCompletedAdvisorTipScenarioGeneration,
  readPendingAdvisorTipScenarioGeneration,
  submitPendingAdvisorTipScenarioGeneration,
  type PendingAdvisorTipScenarioGeneration,
} from '../api/advisorTipScenarioRecovery';
import {
  advisorReportDialogTitle,
  advisorReportPdfFilename,
  advisorReportScopeLabel,
} from '../api/advisorReportPresentation';
import {
  filterAdvisorReports,
  filterEngineUniverseDraws,
  filterTicketDrawGroups,
  formatAnalyticsTimestamp,
  type AnalyticsDateWindow,
  type AnalyticsSortOrder,
  type ReportKindFilter,
  type ReportScopeFilter,
} from '../api/analyticsFilters';
import {
  buildTicketDrawSections,
  buildTicketScoreboard,
  canManageManualTicket,
  mergeTicketPresentationItems,
  selectTopQualifyingManualTicketHits,
  type TicketDrawGroup,
  type TicketPresentationItem,
} from '../api/ticketPresentation';
import {
  buildManualTicketsCsv,
  selectManualTicketsForCsv,
} from '../api/manualTicketCsv';

import { TicketGrid } from './AnalyticsLedgerTicketGrid';
import { AdvisorReportView } from './AdvisorReportView';
import {
  ReportTicketGenerator,
  type GeneratedTicketDraft,
} from './ReportTicketGenerator';

const LazyHitPyramidChart = lazy(() => import('./AnalyticsHitPyramidChart').then(
  ({ AnalyticsHitPyramidChart }) => ({ default: AnalyticsHitPyramidChart }),
));

type Tab = 'draws' | 'tips' | 'reports';

type Tip = TicketPresentationItem;

type SelectedDraw = EvaluationDrawListItem | { draw_id: number };

const isCatalogDraw = (
  draw: SelectedDraw | null,
): draw is EvaluationDrawListItem => Boolean(draw && 'availability' in draw);

function toTip(item: Awaited<ReturnType<typeof fetchAllUserTips>>[number]): Tip {
  return {
    id: item.id,
    draw_id: item.draw_id,
    numbers: item.numbers_snapshot.main,
    cores: item.numbers_snapshot.stars,
    label: `Universe #${item.universe_tip_index}`,
    source: 'purchased',
  };
}

function toEvaluatedTip(item: TicketEvaluationItem): Tip {
  return {
    id: item.id,
    draw_id: item.draw_id,
    numbers: item.main_numbers,
    cores: item.core_numbers,
    label: item.source_type === 'manual'
      ? 'Manual ticket'
      : item.source_type === 'purchased'
        ? 'Purchased ticket'
        : 'Imported ticket',
    source: item.source_type,
    hit_category: item.match_category ?? undefined,
  };
}

function toGeneratedTicketDraft(
  scenario: AdvisorTipScenarioGenerateResponse['scenarios'][number],
): GeneratedTicketDraft {
  if (scenario.ticket_id === null) {
    throw new Error('Generated ticket delivery is still pending.');
  }
  return {
    id: scenario.ticket_id,
    position: scenario.position,
    main_numbers: [...scenario.main_numbers],
    star_numbers: [...scenario.star_numbers],
  };
}

function formatMetricValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString('en-US') : String(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function metricLabel(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isMetricRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function metricCollectionSummary(value: readonly unknown[] | Record<string, unknown>): string {
  const count = Array.isArray(value) ? value.length : Object.keys(value).length;
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

function MetricValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="font-mono text-xs text-slate-500">No values</span>;
    }
    if (value.every((item) => (
      item === null
      || ['string', 'number', 'boolean'].includes(typeof item)
    ))) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item, index) => (
            <span
              key={`${String(item)}-${index}`}
              className="rounded border border-accent-cyan/15 bg-accent-cyan/5 px-2 py-1 font-mono text-xs text-slate-300"
            >
              {formatMetricValue(item)}
            </span>
          ))}
        </div>
      );
    }
    return (
      <div className="grid gap-2">
        {value.map((item, index) => (
          <MetricEntry
            key={index}
            label={`Item ${index + 1}`}
            value={item}
            depth={depth + 1}
          />
        ))}
      </div>
    );
  }

  if (isMetricRecord(value)) {
    return (
      <div className="grid gap-2">
        {Object.entries(value).map(([key, item]) => (
          <MetricEntry
            key={key}
            label={key}
            value={item}
            depth={depth + 1}
          />
        ))}
      </div>
    );
  }

  return (
    <span className="min-w-0 break-words font-mono text-xs text-slate-300">
      {formatMetricValue(value)}
    </span>
  );
}

function MetricEntry({
  label,
  value,
  depth = 0,
}: {
  label: string;
  value: unknown;
  depth?: number;
}) {
  const isCollection = Array.isArray(value) || isMetricRecord(value);
  if (isCollection) {
    return (
      <details className="group/metric rounded-lg border border-white/5 bg-white/[0.025]">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 outline-none transition-colors hover:bg-white/[0.035] focus-visible:ring-1 focus-visible:ring-accent-cyan/60">
          <span className="min-w-0 flex-1 text-xs text-slate-400">
            {metricLabel(label)}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-slate-600">
            {metricCollectionSummary(value)}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition-transform group-open/metric:rotate-180" />
        </summary>
        <div className={`${depth > 1 ? 'px-3 pb-3' : 'border-t border-white/5 px-3 py-3'}`}>
          <MetricValue value={value} depth={depth} />
        </div>
      </details>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] gap-3 border-b border-white/5 px-1 py-2 last:border-0">
      <span className="text-xs text-slate-500">{metricLabel(label)}</span>
      <span className="min-w-0 text-right">
        <MetricValue value={value} depth={depth} />
      </span>
    </div>
  );
}

function EvaluationModuleAccordion({ module }: { module: EvaluationModuleResponse }) {
  const moduleLabel = metricLabel(module.module_name);
  const metricCount = Object.keys(module.metrics).length;
  return (
    <details className="group/module overflow-hidden rounded-xl border border-white/5 bg-black/20">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 outline-none transition-colors hover:bg-white/[0.035] focus-visible:ring-1 focus-visible:ring-accent-cyan/60">
        <span className="min-w-0 flex-1 font-mono text-xs font-bold uppercase tracking-widest text-accent-magenta">
          {moduleLabel}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-slate-600">
          {metricCount} {metricCount === 1 ? 'metric' : 'metrics'}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open/module:rotate-180" />
      </summary>
      <div className="border-t border-white/5 p-4">
        <div className="grid gap-2">
          {Object.entries(module.metrics).map(([key, value]) => (
            <MetricEntry key={key} label={key} value={value} />
          ))}
        </div>
      </div>
    </details>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === 'object'
    && error !== null
    && 'response' in error
    && typeof (error as { response?: { data?: { detail?: unknown } } }).response
      ?.data?.detail === 'string'
  ) {
    const detail = (error as { response: { data: { detail: string } } }).response.data.detail;
    const knownMessages: Record<string, string> = {
      analytics_bigquery_unavailable:
        'Analytics are temporarily unavailable. Please try again shortly.',
      analytics_incomplete:
        'This draw evaluation is not complete yet.',
      universe_database_unavailable:
        'Draw data are temporarily unavailable. Please try again shortly.',
      analytics_summary_unavailable:
        'The evaluation summary is temporarily unavailable.',
      analytics_module_unavailable:
        'This evaluation module is temporarily unavailable.',
      advisor_tip_source_report_not_found:
        'One of the selected reports is no longer available.',
        advisor_tip_source_draw_mismatch:
          'Selected reports must belong to the same forecast draw.',
        advisor_tip_source_evidence_unavailable:
          'A selected report does not contain enough verified numeric evidence for AI ticket generation.',
        advisor_tip_source_evidence_insufficient:
          'The selected reports do not contain enough distinct verified numbers for this ticket set.',
        advisor_tip_draw_not_open:
          'AI ticket generation is unavailable because this draw is not currently open.',
        advisor_tip_quote_rate_limited:
          'Too many new quotes were requested. Please wait a few minutes and try again.',
        advisor_tip_quote_expired:
          'This quote expired. Request a fresh quote to continue.',
        advisor_tip_quote_not_found:
          'This quote is no longer available. Request a fresh quote to continue.',
        advisor_tip_quote_already_consumed:
          'This quote has already been used. Request a fresh quote to generate more tickets.',
        advisor_tip_quote_request_mismatch:
          'The report selection changed. Request a fresh quote to continue.',
        advisor_tip_quote_evidence_mismatch:
          'The report evidence changed. Request a fresh quote to continue.',
        advisor_tip_quote_price_mismatch:
          'The quoted price is no longer current. Request a fresh quote to continue.',
      advisor_tip_unique_scenarios_exhausted:
        'No additional unique tickets are available for this draw and evidence set.',
      advisor_tip_insufficient_credits:
        'Your credit balance is too low for this ticket set.',
      advisor_tip_database_unavailable:
        'AI ticket generation is temporarily unavailable. Please try again shortly.',
    };
    if (knownMessages[detail]) return knownMessages[detail];
    return /^[a-z0-9_]+$/u.test(detail) ? fallback : detail;
  }
  if (error instanceof Error && error.message) {
    return /^[a-z0-9_]+$/u.test(error.message) ? fallback : error.message;
  }
  return fallback;
}

function ticketErrorMessage(error: unknown, fallback: string): string {
  const detail = ticketErrorDetail(error);

  const knownMessages: Record<string, string> = {
    ticket_draw_closed: 'This draw is closed. Tickets can no longer be changed.',
    ticket_numbers_conflict: 'You already have a manual ticket with these numbers.',
    ticket_not_found: 'This manual ticket is no longer available.',
    ticket_draw_window_unavailable: 'The ticket window could not be verified. Please try again.',
    ticket_database_unavailable: 'Ticket storage is temporarily unavailable. Please try again.',
    user_tips_database_unavailable: 'Manual tickets are temporarily unavailable. Please try again.',
    ticket_scoreboard_unavailable: 'The manual player scoreboard is temporarily unavailable.',
  };
  return detail && knownMessages[detail]
    ? knownMessages[detail]
    : error instanceof Error && error.message && !detail
      ? error.message
      : fallback;
}

function ticketErrorDetail(error: unknown): string | null {
  return (
    typeof error === 'object'
    && error !== null
    && 'response' in error
    && typeof (error as { response?: { data?: { detail?: unknown } } }).response
      ?.data?.detail === 'string'
  )
    ? (error as { response: { data: { detail: string } } }).response.data.detail
    : null;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'response' in error
    && (error as { response?: { status?: unknown } }).response?.status === 404
  );
}

function TicketDrawCard({
  group,
  isUpcoming,
  isPreparing = false,
  onOpen,
}: {
  group: TicketDrawGroup;
  isUpcoming: boolean;
  isPreparing?: boolean;
  onOpen: () => void;
}) {
  const displayedItems = isUpcoming
    ? group.items
    : selectTopQualifyingManualTicketHits(group.items, 3);

  return (
    <div
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open draw ${group.draw_id} with ${group.items.length} tickets`}
      className="group relative flex min-h-[180px] cursor-pointer flex-col overflow-hidden rounded-xl border border-white/5 bg-canvas-elevated p-5 transition-all duration-300 hover:-translate-y-1 hover:border-accent-cyan/30 hover:shadow-[0_10px_30px_-10px_rgba(0,240,255,0.18)] focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:ring-offset-2 focus:ring-offset-canvas"
    >
      <div className="absolute right-0 top-0 h-28 w-28 rounded-bl-full bg-accent-cyan/5 transition-colors group-hover:bg-accent-cyan/10" />
      <div className="relative z-10 mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-accent-cyan">
            Draw {group.draw_id}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {isUpcoming
              ? isPreparing
                ? 'Preparing / upcoming draw'
                : 'Upcoming draw'
              : 'Evaluated draw'}
          </div>
        </div>
        <div className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-300">
          {group.items.length} {group.items.length === 1 ? 'ticket' : 'tickets'}
        </div>
      </div>

      {!isUpcoming && (
        <div className="relative z-10 mb-2 flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">
          <span>Top 3 winning tickets</span>
          <span>Manual · 2+0 or better</span>
        </div>
      )}

      {displayedItems.length > 0 ? (
        <div className={`relative z-10 flex flex-col gap-2 pr-1 ${
          isUpcoming ? 'max-h-44 overflow-y-auto' : ''
        }`}>
          {displayedItems.map((tip, index) => (
            <div
              key={tip.id}
              className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2"
            >
              <span className="min-w-5 text-[10px] font-mono text-slate-600">#{index + 1}</span>
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                {tip.numbers.map((number) => (
                  <span key={number} className="font-mono text-[10px] font-bold text-slate-200">
                    {number}
                  </span>
                ))}
                <span className="mx-0.5 text-slate-700">/</span>
                {tip.cores.map((number) => (
                  <span key={number} className="font-mono text-[10px] font-bold text-accent-cyan">
                    {number}
                  </span>
                ))}
              </div>
              {tip.hit_category && (
                <span className={`rounded border px-2 py-0.5 text-[10px] font-mono font-bold ${
                  tip.hit_category === '0+0'
                    ? 'border-white/10 bg-white/5 text-slate-500'
                    : 'border-accent-cyan/25 bg-accent-cyan/10 text-accent-cyan'
                }`}>
                  {tip.hit_category}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="relative z-10 flex flex-1 items-center text-sm text-slate-500">
          {isUpcoming
            ? 'No tickets entered yet.'
            : 'No winning ticket at 2+0 or better.'}
        </div>
      )}

      <div className="relative z-10 mt-5 h-5 overflow-hidden">
        <div className="absolute inset-0 flex items-center font-mono text-[10px] uppercase tracking-widest text-slate-500 transition-all duration-200 group-hover:-translate-y-1 group-hover:opacity-0 group-focus:-translate-y-1 group-focus:opacity-0 [@media(hover:none)]:hidden">
          {isUpcoming ? 'Ticket workspace' : 'Results available'}
        </div>
        <div className="absolute inset-0 flex translate-y-1 items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent-cyan opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus:translate-y-0 group-focus:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100">
          {isUpcoming ? 'Add / view tickets' : 'View evaluated tickets'}
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export function ManualPlayerScoreboard({
  drawId,
  scoreboard,
  isLoading,
  error,
  compact = false,
}: {
  drawId: number;
  scoreboard: TicketScoreboardResponse | null;
  isLoading: boolean;
  error: string | null;
  compact?: boolean;
}) {
  const isCompleted = scoreboard?.status === 'completed';
  const engineBestHit = isCompleted ? scoreboard.best_engine_hit : null;
  const visiblePlayers = useMemo(() => {
    if (!scoreboard || isCompleted) return scoreboard?.players ?? [];
    return [...scoreboard.players].sort((left, right) => (
      right.ticket_count - left.ticket_count
      || Number(right.is_current_user) - Number(left.is_current_user)
      || left.player_name.localeCompare(right.player_name)
    ));
  }, [isCompleted, scoreboard]);

  return (
    <section
      aria-label="Manual player scoreboard"
      className={`overflow-hidden rounded-xl border border-white/5 bg-canvas-elevated ${
        compact ? 'shrink-0' : ''
      }`}
    >
      <div className={`flex flex-col gap-3 border-b border-white/5 sm:flex-row sm:items-center sm:justify-between ${
        compact ? 'px-4 py-3' : 'px-5 py-4'
      }`}>
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white">
            <Users className="h-4 w-4 text-accent-cyan" />
            {isCompleted
              ? `Hit Quality Ranking · Draw ${drawId}`
              : `Submission Ranking · Draw ${drawId}`}
          </div>
          <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-slate-500">
            {isCompleted
              ? 'Engine Universe benchmark · players ranked by best hit'
              : 'Ranked by tickets submitted'}
          </p>
        </div>
        {scoreboard && (
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-wider">
            <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-300">
              {scoreboard.player_count} {scoreboard.player_count === 1 ? 'player' : 'players'}
            </span>
            <span className="rounded border border-accent-cyan/20 bg-accent-cyan/5 px-2 py-1 text-accent-cyan">
              {scoreboard.total_tickets} {scoreboard.total_tickets === 1 ? 'ticket' : 'tickets'}
            </span>
            {isCompleted && scoreboard.has_more && (
              <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-400">
                Showing {scoreboard.returned_player_count} of {scoreboard.player_count}
              </span>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 px-5 py-5 text-xs font-mono uppercase tracking-widest text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {isCompleted ? 'Loading player comparison...' : 'Loading draw submissions...'}
        </div>
      ) : error ? (
        <div className="px-5 py-5 text-sm text-amber-200">
          {error}
        </div>
      ) : scoreboard && (visiblePlayers.length > 0 || engineBestHit) ? (
        <div className={compact ? 'max-h-40 overflow-y-auto' : ''}>
          {engineBestHit && (
            <div
              aria-label="Engine Universe best hit benchmark"
              className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-accent-cyan/15 bg-gradient-to-r from-accent-cyan/[0.09] to-transparent ${
                compact ? 'px-4 py-2.5' : 'px-5 py-4'
              } sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan">
                <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">
                  Engine Universe
                </span>
                <span className="block font-mono text-[9px] uppercase tracking-widest text-accent-cyan">
                  Best-hit benchmark
                </span>
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                {engineBestHit.hit_count.toLocaleString()} {engineBestHit.hit_count === 1 ? 'hit' : 'hits'}
              </span>
              <span className="min-w-[78px] rounded border border-accent-cyan/35 bg-accent-cyan/10 px-2 py-1 text-center text-[10px] font-mono font-bold uppercase tracking-wider text-accent-cyan">
                Best {engineBestHit.match_category}
              </span>
            </div>
          )}
          {visiblePlayers.length > 0 ? (
            <div className="divide-y divide-white/5">
              {visiblePlayers.map((player, index) => (
                <div
                  key={`${scoreboard.draw_id}-${player.player_name}`}
                  className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 ${
                    compact ? 'px-4 py-2' : 'px-5 py-3'
                  } ${
                    isCompleted
                      ? 'sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]'
                      : ''
                  } ${
                    player.is_current_user ? 'bg-accent-cyan/[0.045]' : 'bg-transparent'
                  }`}
                >
                  <span className="min-w-7 text-[10px] font-mono text-slate-500">
                    #{isCompleted ? player.rank : index + 1}
                  </span>
                  <span className="truncate text-sm font-medium text-slate-200" title={player.player_name}>
                    {player.player_name}
                    {player.is_current_user && (
                      <span className="ml-2 text-[9px] font-mono uppercase tracking-widest text-accent-cyan">
                        Current
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    {player.ticket_count} {player.ticket_count === 1 ? 'ticket' : 'tickets'}
                  </span>
                  {isCompleted && (
                    <span className={`min-w-[78px] rounded border px-2 py-1 text-center text-[10px] font-mono font-bold uppercase tracking-wider ${
                      player.best_hit
                        ? 'border-accent-cyan/25 bg-accent-cyan/10 text-accent-cyan'
                        : 'border-white/10 bg-white/5 text-slate-500'
                    }`}>
                      Best {player.best_hit ?? 'None'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-5 text-sm text-slate-500">
              No manual player results are available for this draw.
            </div>
          )}
        </div>
      ) : (
        <div className="px-5 py-5 text-sm text-slate-500">
          No manual tickets have been submitted for this draw.
        </div>
      )}
    </section>
  );
}

const themeVariables = {
  "--ag-background-color": "var(--color-canvas)",
  "--ag-header-background-color": "var(--color-canvas)",
  "--ag-odd-row-background-color": "rgba(255, 255, 255, 0.02)",
  "--ag-row-hover-color": "rgba(255, 255, 255, 0.05)",
  "--ag-border-color": "rgba(255, 255, 255, 0.1)",
  "--ag-header-foreground-color": "var(--color-text-muted)",
  "--ag-data-color": "var(--color-text-secondary)",
  "--ag-row-border-color": "rgba(255, 255, 255, 0.05)",
  "--ag-font-family": "monospace",
} as React.CSSProperties;

export const AnalyticsLedger = ({ ownerSub }: { ownerSub: string }) => {
  const [activeTab, setActiveTab] = useState<Tab>('draws');
  const [drawQuery, setDrawQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<AnalyticsSortOrder>('latest');
  const [dateWindow, setDateWindow] = useState<AnalyticsDateWindow>('all');
  const [ticketView, setTicketView] = useState<'all' | 'upcoming' | 'evaluated'>('all');
  const [reportKind, setReportKind] = useState<ReportKindFilter>('all');
  const [reportScope, setReportScope] = useState<ReportScopeFilter>('all');
  
  // Data states
  const [draws, setDraws] = useState<EvaluationDrawListItem[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);
  const [reports, setReports] = useState<AdvisorReportListItem[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [selectedDraw, setSelectedDraw] = useState<SelectedDraw | null>(null);
  const [ticketTargetDraw, setTicketTargetDraw] = useState<number | null>(null);
  const [isTicketTargetPreparing, setIsTicketTargetPreparing] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<EvaluationSummaryResponse | null>(null);
  const [selectedAnalytics, setSelectedAnalytics] = useState<UniverseAnalyticsResponse | null>(null);
  const [selectedModules, setSelectedModules] = useState<EvaluationModuleResponse[]>([]);
  const [moduleErrors, setModuleErrors] = useState<Record<string, string>>({});
  const [isDrawDetailLoading, setIsDrawDetailLoading] = useState(false);
  const [drawDetailError, setDrawDetailError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<AdvisorRunResponse | null>(null);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isPdfDownloading, setIsPdfDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const restoredScenarioState = useMemo(() => {
    if (typeof window === 'undefined') {
      return { pending: null, completed: null };
    }
    try {
      const pending = readPendingAdvisorTipScenarioGeneration(
        window.localStorage,
        ownerSub,
      );
      return {
        pending,
        completed: pending
          ? null
          : readCompletedAdvisorTipScenarioGeneration(
            window.localStorage,
            ownerSub,
          ),
      };
    } catch {
      return { pending: null, completed: null };
    }
  }, [ownerSub]);
  const [scenarioReportIds, setScenarioReportIds] = useState<string[]>(() => (
    [...(
      restoredScenarioState.pending?.request.source_report_ids
      ?? restoredScenarioState.completed?.request.source_report_ids
      ?? []
    )]
  ));
  const [scenarioCount, setScenarioCount] = useState(() => (
    restoredScenarioState.pending?.request.scenario_count
    ?? restoredScenarioState.completed?.request.scenario_count
    ?? 20
  ));
  const [scenarioQuote, setScenarioQuote] = useState<AdvisorTipScenarioQuoteResponse | null>(null);
  const [scenarioResult, setScenarioResult] = useState<AdvisorTipScenarioDeliveredResponse | null>(
    restoredScenarioState.completed?.result ?? null,
  );
  const [generatedTicketDrafts, setGeneratedTicketDrafts] = useState<GeneratedTicketDraft[]>(
    () => restoredScenarioState.completed?.result.scenarios.map(toGeneratedTicketDraft) ?? [],
  );
  const [isScenarioQuoting, setIsScenarioQuoting] = useState(false);
  const [isScenarioGenerating, setIsScenarioGenerating] = useState(false);
  const [isTicketGeneratorOpen, setIsTicketGeneratorOpen] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [pendingScenarioGeneration, setPendingScenarioGeneration] = useState<
    PendingAdvisorTipScenarioGeneration | null
  >(restoredScenarioState.pending);
  const [scenarioRetryNotBeforeMs, setScenarioRetryNotBeforeMs] = useState<
    number | null
  >(null);
  const [scenarioRetryRemainingSeconds, setScenarioRetryRemainingSeconds] =
    useState(0);
  const [scenarioDeliveryRetryPending, setScenarioDeliveryRetryPending] =
    useState(false);
  const ticketTargetDrawRef = useRef<number | null>(null);
  const scenarioDeliveryAutoRetryRef = useRef<{
    generationId: string | null;
    completedRetries: number;
  }>({ generationId: null, completedRetries: 0 });
  const initialScenarioResumeAttemptedRef = useRef(false);
  
  const [offcanvasTips, setOffcanvasTips] = useState<Tip[]>([]);
  const [isOffcanvasTipsLoading, setIsOffcanvasTipsLoading] = useState(false);
  const [offcanvasTipsError, setOffcanvasTipsError] = useState<string | null>(null);
  const [activeTicketScoreboard, setActiveTicketScoreboard] = useState<TicketScoreboardResponse | null>(null);
  const [isActiveTicketScoreboardLoading, setIsActiveTicketScoreboardLoading] = useState(false);
  const [activeTicketScoreboardError, setActiveTicketScoreboardError] = useState<string | null>(null);
  const [selectedTicketScoreboard, setSelectedTicketScoreboard] = useState<TicketScoreboardResponse | null>(null);
  const [isSelectedTicketScoreboardLoading, setIsSelectedTicketScoreboardLoading] = useState(false);
  const [selectedTicketScoreboardError, setSelectedTicketScoreboardError] = useState<string | null>(null);

  const [newTicketNumbers, setNewTicketNumbers] = useState<number[]>([]);
  const [newTicketCores, setNewTicketCores] = useState<number[]>([]);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [deleteConfirmationTicketId, setDeleteConfirmationTicketId] = useState<string | null>(null);
  const [ticketMutationId, setTicketMutationId] = useState<string | null>(null);
  const [isTicketSaving, setIsTicketSaving] = useState(false);
  const [ticketSaveNotice, setTicketSaveNotice] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleToggleNumber = useCallback((n: number) => {
    setNewTicketNumbers(prev => 
      prev.includes(n) ? prev.filter(x => x !== n) : (prev.length < 5 ? [...prev, n] : prev)
    );
  }, []);

  const handleToggleCore = useCallback((n: number) => {
    setNewTicketCores(prev => 
      prev.includes(n) ? prev.filter(x => x !== n) : (prev.length < 2 ? [...prev, n] : prev)
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setNewTicketNumbers([]);
    setNewTicketCores([]);
    setEditingTicketId(null);
    setDeleteConfirmationTicketId(null);
    setTicketMutationId(null);
    setTicketSaveNotice(null);
    setSelectedSummary(null);
    setSelectedAnalytics(null);
    setSelectedModules([]);
    setModuleErrors({});
    setDrawDetailError(null);
    setSummaryError(null);
    setOffcanvasTipsError(null);
    setSelectedTicketScoreboard(null);
    setSelectedTicketScoreboardError(null);

    if (!selectedDraw) {
      setOffcanvasTips([]);
      setIsOffcanvasTipsLoading(false);
      setIsSelectedTicketScoreboardLoading(false);
      setIsDrawDetailLoading(false);
      return () => controller.abort();
    }

    const loadSelectedDraw = async () => {
      setIsOffcanvasTipsLoading(true);
      setIsSelectedTicketScoreboardLoading(true);
      setIsDrawDetailLoading(activeTab === 'draws' && isCatalogDraw(selectedDraw));

      const detailRequests: Array<Promise<void>> = [];
      if (
        activeTab === 'draws'
        && isCatalogDraw(selectedDraw)
        && selectedDraw.availability.summary
      ) {
        detailRequests.push(
          fetchEvaluationSummary(selectedDraw.draw_id, controller.signal)
            .then(setSelectedSummary)
            .catch((error) => {
              if (!controller.signal.aborted) {
                setSummaryError(isNotFound(error)
                  ? 'Evaluation summary unavailable'
                  : errorMessage(
                      error,
                      'Evaluation summary is currently unavailable.',
                    ));
              }
            }),
        );
      }
      if (
        activeTab === 'draws'
        && isCatalogDraw(selectedDraw)
        && selectedDraw.availability.analytics
      ) {
        detailRequests.push(
          fetchUniverseAnalytics(selectedDraw.draw_id, controller.signal)
            .then(setSelectedAnalytics)
            .catch((error) => {
              if (!controller.signal.aborted) {
                setDrawDetailError(errorMessage(
                  error,
                  'Draw analytics are currently unavailable.',
                ));
              }
            }),
        );
      }

      if (
        activeTab === 'draws'
        && isCatalogDraw(selectedDraw)
        && selectedDraw.evaluation.modules.length > 0
      ) {
        detailRequests.push(
          Promise.allSettled(
            selectedDraw.evaluation.modules.map(async (moduleName) => {
              try {
                const module = await fetchEvaluationModule(
                  selectedDraw.draw_id,
                  moduleName,
                  controller.signal,
                );
                return { moduleName, module };
              } catch (error) {
                return {
                  moduleName,
                  error: errorMessage(
                    error,
                    `${moduleName} is currently unavailable.`,
                  ),
                };
              }
            }),
          ).then((results) => {
            if (controller.signal.aborted) return;
            const modules: EvaluationModuleResponse[] = [];
            const errors: Record<string, string> = {};
            for (const result of results) {
              if (result.status === 'rejected') continue;
              if ('module' in result.value) {
                modules.push(result.value.module);
              } else {
                errors[result.value.moduleName] = result.value.error;
              }
            }
            setSelectedModules(modules);
            setModuleErrors(errors);
          }),
        );
      }

      const [detailResults, purchasedResult, manualResult, scoreboardResult] = await Promise.all([
        Promise.allSettled(detailRequests),
        fetchAllUserTips(selectedDraw.draw_id, controller.signal)
          .then((items) => ({ items, error: null as string | null }))
          .catch((error) => ({
            items: [],
            error: errorMessage(
              error,
              'Purchased tips are currently unavailable.',
            ),
          })),
        fetchTicketEvaluation(selectedDraw.draw_id, controller.signal)
          .then((value) => ({ items: value.items, error: null as string | null }))
          .catch((error) => ({
            items: [],
            error: ticketErrorMessage(
              error,
              'Manual tickets are currently unavailable.',
            ),
          })),
        fetchTicketScoreboard(
          selectedDraw.draw_id,
          controller.signal,
          activeTab === 'tips' && isCatalogDraw(selectedDraw)
            ? { includeAllPlayers: true }
            : undefined,
        )
          .then((value) => ({ value, error: null as string | null }))
          .catch((error) => ({
            value: null,
            error: ticketErrorMessage(
              error,
              'The manual player scoreboard is currently unavailable.',
            ),
          })),
      ]);
      if (controller.signal.aborted) return;

      const failedDetail = detailResults.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      if (failedDetail) {
        setDrawDetailError(errorMessage(
          failedDetail.reason,
          'Draw analytics are currently unavailable.',
        ));
      }
      setOffcanvasTips(mergeTicketPresentationItems(
        purchasedResult.items.map(toTip),
        manualResult.items.map(toEvaluatedTip),
      ));
      const tipErrors = [purchasedResult.error, manualResult.error].filter(
        (value): value is string => value !== null,
      );
      setOffcanvasTipsError(tipErrors.length > 0 ? tipErrors.join(' ') : null);
      setSelectedTicketScoreboard(scoreboardResult.value);
      setSelectedTicketScoreboardError(scoreboardResult.error);
      setIsSelectedTicketScoreboardLoading(false);
      setIsOffcanvasTipsLoading(false);
      setIsDrawDetailLoading(false);
    };

    void loadSelectedDraw();
    return () => controller.abort();
  }, [activeTab, selectedDraw]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      setIsLoading(true);
      setDataError(null);
      if (activeTab === 'tips') {
        setActiveTicketScoreboard(null);
        setActiveTicketScoreboardError(null);
        setIsActiveTicketScoreboardLoading(true);
      }
      
      try {
        if (activeTab === 'draws') {
          setDraws(await fetchAllEvaluationDraws(controller.signal));
        } else if (activeTab === 'tips') {
          const [engineStatus, catalog, completedReports] = await Promise.all([
            fetchEngineStatus(controller.signal),
            fetchAllEvaluationDraws(controller.signal),
            fetchAllAdvisorReports(controller.signal),
          ]);
          const nextTicketTargetDraw = readEnginePresentationDrawId(engineStatus);
          setDraws(catalog);
          setReports(completedReports);
          setTicketTargetDraw(nextTicketTargetDraw);
          setIsTicketTargetPreparing(
            engineStatus.lifecycle_status === 'WAITING_FOR_SPRINTSTATE',
          );
          const activeScoreboardPromise = nextTicketTargetDraw === null
            ? Promise.resolve({ value: null, error: null as string | null })
            : fetchTicketScoreboard(
                nextTicketTargetDraw,
                controller.signal,
              )
                .then((value) => ({ value, error: null as string | null }))
                .catch((error) => ({
                  value: null,
                  error: ticketErrorMessage(
                    error,
                    'The manual player scoreboard is currently unavailable.',
                  ),
                }));
          const evaluatedDrawIds = selectEngineUniverseDraws(catalog)
            .map((draw) => draw.draw_id);
          const drawIds = [...new Set([
            ...(nextTicketTargetDraw === null
              ? []
              : [nextTicketTargetDraw]),
            ...evaluatedDrawIds,
          ])];

          const history = await Promise.all(drawIds.map(async (drawId) => {
            const [purchasedResult, manualResult] = await Promise.allSettled([
              fetchAllUserTips(drawId, controller.signal),
              fetchTicketEvaluation(drawId, controller.signal)
                .then((value) => value.items),
            ]);
            return { purchasedResult, manualResult };
          }));

          const allTips: Tip[] = [];
          let partialHistory = false;
          for (const { purchasedResult, manualResult } of history) {
            if (purchasedResult.status === 'fulfilled') {
              allTips.push(...purchasedResult.value.map(toTip));
            } else {
              partialHistory = true;
            }
            if (manualResult.status === 'fulfilled') {
              allTips.push(...manualResult.value.map(toEvaluatedTip));
            } else {
              partialHistory = true;
            }
          }
          setTips(mergeTicketPresentationItems(allTips));
          if (partialHistory) {
            setDataError('Some historical ticket sources are currently unavailable.');
          }
          const activeScoreboardResult = await activeScoreboardPromise;
          if (!controller.signal.aborted) {
            setActiveTicketScoreboard(activeScoreboardResult.value);
            setActiveTicketScoreboardError(activeScoreboardResult.error);
            setIsActiveTicketScoreboardLoading(false);
          }
        } else if (activeTab === 'reports') {
          setReports(await fetchAllAdvisorReports(controller.signal));
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setDataError(errorMessage(err, 'Backend data are currently unavailable.'));
          if (activeTab === 'draws') setDraws([]);
          if (activeTab === 'tips') {
            setTips([]);
            setReports([]);
          }
          if (activeTab === 'reports') setReports([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          if (activeTab === 'tips') setIsActiveTicketScoreboardLoading(false);
        }
      }
    };
    void fetchData();
    return () => controller.abort();
  }, [activeTab]);

  const handleReadReport = useCallback(async (reportId: string) => {
    setSelectedReport(null);
    setReportError(null);
    setPdfError(null);
    setIsReportLoading(true);
    try {
      setSelectedReport(await fetchAdvisorReport(reportId));
    } catch (error) {
      setReportError(errorMessage(error, 'The report is currently unavailable.'));
    } finally {
      setIsReportLoading(false);
    }
  }, []);

  useEffect(() => {
    if (scenarioRetryNotBeforeMs === null) {
      setScenarioRetryRemainingSeconds(0);
      return undefined;
    }
    const update = () => {
      const remaining = Math.max(
        0,
        Math.ceil((scenarioRetryNotBeforeMs - Date.now()) / 1_000),
      );
      setScenarioRetryRemainingSeconds(remaining);
      if (remaining === 0) setScenarioRetryNotBeforeMs(null);
    };
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [scenarioRetryNotBeforeMs]);

  const applyScenarioRetryDelay = useCallback((error: unknown) => {
    const retryAfterMs = advisorTipScenarioRetryAfterMs(error);
    if (retryAfterMs !== null) {
      setScenarioRetryNotBeforeMs(Date.now() + retryAfterMs);
    }
  }, []);

  const executePendingScenarioGeneration = useCallback(async (
    pending: PendingAdvisorTipScenarioGeneration,
  ) => {
    const belongsToCurrentDraw = ticketTargetDrawRef.current === null
      || pending.request.draw_id === ticketTargetDrawRef.current;
    setPendingScenarioGeneration(pending);
    if (belongsToCurrentDraw) {
      setScenarioReportIds([...pending.request.source_report_ids]);
      setScenarioCount(pending.request.scenario_count);
    } else {
      setScenarioReportIds([]);
      setScenarioQuote(null);
      setScenarioResult(null);
      setGeneratedTicketDrafts([]);
      setScenarioError(
        `Finishing the saved Draw ${pending.request.draw_id} ticket delivery before a new batch can start.`,
      );
    }
    setIsScenarioGenerating(true);
    setScenarioDeliveryRetryPending(false);
    if (belongsToCurrentDraw) setScenarioError(null);
    try {
      const result = await submitPendingAdvisorTipScenarioGeneration(
        window.localStorage,
        pending,
        (request, idempotencyKey, expectedQuote) => (
          pending.generation_id === null
            ? generateAdvisorTipScenarios(
                request,
                idempotencyKey,
                expectedQuote,
              )
            : reconcileAdvisorTipScenarioTickets(
                pending.generation_id,
                request,
                expectedQuote,
              )
        ),
      );
      if (result.status === 'pending_delivery') {
        const saved = readPendingAdvisorTipScenarioGeneration(
          window.localStorage,
          ownerSub,
        );
        setPendingScenarioGeneration(saved);
        setScenarioQuote(null);
        setScenarioResult(null);
        setGeneratedTicketDrafts([]);
        const currentRetry = scenarioDeliveryAutoRetryRef.current;
        const completedRetries = currentRetry.generationId === result.generation_id
          ? currentRetry.completedRetries
          : 0;
        const retryDelayMs = advisorTipDeliveryAutoRetryDelayMs(completedRetries);
        scenarioDeliveryAutoRetryRef.current = {
          generationId: result.generation_id,
          completedRetries: retryDelayMs === null
            ? completedRetries
            : completedRetries + 1,
        };
        if (retryDelayMs === null) {
          setScenarioRetryNotBeforeMs(null);
          setScenarioDeliveryRetryPending(false);
          setScenarioError(
            'Tickets are still being saved. Use Check delivery now to resume safely.',
          );
        } else {
          setScenarioRetryNotBeforeMs(Date.now() + retryDelayMs);
          setScenarioDeliveryRetryPending(true);
        }
        window.dispatchEvent(new Event('luma:credits-changed'));
        return;
      }
      if (!result.saved_to_tickets) {
        throw new Error('Generated tickets were not delivered to My Tickets.');
      }
      const generatedDrafts = result.scenarios.map(toGeneratedTicketDraft);
      if (
        ticketTargetDrawRef.current === null
        || result.draw_id === ticketTargetDrawRef.current
      ) {
        setScenarioResult(result);
        setGeneratedTicketDrafts(generatedDrafts);
      } else {
        try {
          clearCompletedAdvisorTipScenarioGeneration(window.localStorage);
        } catch {
          // Delivery is authoritative; stale presentation recovery may be cleared later.
        }
        setScenarioResult(null);
        setGeneratedTicketDrafts([]);
        setScenarioReportIds([]);
        setScenarioError(null);
      }
      const generatedTips: Tip[] = generatedDrafts.map((ticket) => ({
        id: ticket.id,
        draw_id: result.draw_id,
        numbers: [...ticket.main_numbers],
        cores: [...ticket.star_numbers],
        label: 'AI-generated manual ticket',
        source: 'manual',
      }));
      setOffcanvasTips((current) => mergeTicketPresentationItems(current, generatedTips));
      setTips((current) => mergeTicketPresentationItems(current, generatedTips));
      void fetchTicketScoreboard(result.draw_id)
        .then((scoreboard) => {
          setSelectedTicketScoreboard(scoreboard);
          setActiveTicketScoreboard(scoreboard);
        })
        .catch(() => undefined);
      setScenarioQuote(null);
      setPendingScenarioGeneration(null);
      setScenarioRetryNotBeforeMs(null);
      setScenarioDeliveryRetryPending(false);
      scenarioDeliveryAutoRetryRef.current = {
        generationId: null,
        completedRetries: 0,
      };
      window.dispatchEvent(new Event('luma:credits-changed'));
    } catch (error) {
      let saved: PendingAdvisorTipScenarioGeneration | null = null;
      try {
        saved = readPendingAdvisorTipScenarioGeneration(
          window.localStorage,
          ownerSub,
        );
      } catch {
        // The original storage-aware error below remains authoritative.
      }
      setPendingScenarioGeneration(saved);
      setScenarioDeliveryRetryPending(false);
      applyScenarioRetryDelay(error);
      setScenarioError(advisorTipScenarioErrorMessage(
        error,
        saved
          ? 'The exact AI ticket request remains saved. Resume it after resolving the issue.'
          : 'AI tickets could not be generated. No ticket was created.',
      ));
    } finally {
      setIsScenarioGenerating(false);
    }
  }, [applyScenarioRetryDelay, ownerSub]);

  useEffect(() => {
    ticketTargetDrawRef.current = ticketTargetDraw;
    if (ticketTargetDraw === null) return;

    const pendingDraw = pendingScenarioGeneration?.request.draw_id ?? null;
    const completedDraw = scenarioResult?.draw_id ?? null;
    const quoteDraw = scenarioQuote?.draw_id ?? null;
    const presentationDraw = pendingDraw ?? completedDraw ?? quoteDraw;
    if (presentationDraw === null || presentationDraw === ticketTargetDraw) return;

    setScenarioReportIds([]);
    setScenarioQuote(null);
    setScenarioResult(null);
    setGeneratedTicketDrafts([]);
    setScenarioRetryNotBeforeMs(null);
    setScenarioDeliveryRetryPending(false);
    scenarioDeliveryAutoRetryRef.current = {
      generationId: null,
      completedRetries: 0,
    };
    if (pendingDraw !== null) {
      setScenarioError(
        `Finishing the saved Draw ${pendingDraw} ticket delivery before a new batch can start.`,
      );
      return;
    }
    try {
      clearCompletedAdvisorTipScenarioGeneration(window.localStorage);
    } catch {
      // The saved tickets remain authoritative even if stale UI recovery cannot be removed.
    }
    setScenarioError(null);
  }, [
    pendingScenarioGeneration,
    scenarioQuote,
    scenarioResult,
    ticketTargetDraw,
  ]);

  useEffect(() => {
    if (
      !scenarioDeliveryRetryPending
      || pendingScenarioGeneration === null
      || pendingScenarioGeneration.generation_id === null
      || isScenarioGenerating
      || scenarioRetryNotBeforeMs !== null
      || scenarioRetryRemainingSeconds > 0
    ) {
      return;
    }
    void executePendingScenarioGeneration(pendingScenarioGeneration);
  }, [
    executePendingScenarioGeneration,
    isScenarioGenerating,
    pendingScenarioGeneration,
    scenarioDeliveryRetryPending,
    scenarioRetryNotBeforeMs,
    scenarioRetryRemainingSeconds,
  ]);

  useEffect(() => {
    if (initialScenarioResumeAttemptedRef.current) return;
    initialScenarioResumeAttemptedRef.current = true;
    let pending: PendingAdvisorTipScenarioGeneration | null = null;
    try {
      pending = readPendingAdvisorTipScenarioGeneration(
        window.localStorage,
        ownerSub,
      );
    } catch (error) {
      setScenarioError(advisorTipScenarioErrorMessage(error));
      return;
    }
    if (!pending) return;
    void executePendingScenarioGeneration(pending);
  }, [executePendingScenarioGeneration, ownerSub]);

  const resetScenarioOutput = useCallback(() => {
    if (pendingScenarioGeneration !== null) return;
    try {
      try {
        clearCompletedAdvisorTipScenarioGeneration(window.localStorage);
      } catch {
        // The persisted ticket remains authoritative even if local recovery cleanup fails.
      }
    } catch {
      setScenarioError('The saved ticket generation result could not be cleared safely.');
      return;
    }
    setScenarioQuote(null);
    setScenarioResult(null);
    setGeneratedTicketDrafts([]);
    setScenarioError(null);
  }, [pendingScenarioGeneration]);

  const handleToggleScenarioReport = useCallback((report: AdvisorReportListItem) => {
    if (pendingScenarioGeneration !== null) return;
    resetScenarioOutput();
    setScenarioReportIds((current) => {
      if (current.includes(report.id)) {
        return current.filter((reportId) => reportId !== report.id);
      }
      if (current.length >= 5) {
        setScenarioError('Select no more than five reports.');
        return current;
      }
      const selectedDraw = current.length === 0
        ? report.forecast_draw
        : reports.find((item) => item.id === current[0])?.forecast_draw;
      if (selectedDraw !== report.forecast_draw) {
        setScenarioError('Select reports from the same forecast draw.');
        return current;
      }
      return [...current, report.id];
    });
  }, [pendingScenarioGeneration, reports, resetScenarioOutput]);

  const handleScenarioCountChange = useCallback((value: number) => {
    if (pendingScenarioGeneration !== null) return;
    const normalized = Number.isFinite(value)
      ? Math.min(120, Math.max(20, Math.trunc(value)))
      : 20;
    setScenarioCount(normalized);
    resetScenarioOutput();
  }, [pendingScenarioGeneration, resetScenarioOutput]);

  const handleScenarioQuote = useCallback(async () => {
    if (
      scenarioReportIds.length === 0
      || isScenarioQuoting
      || isScenarioGenerating
      || pendingScenarioGeneration !== null
      || scenarioRetryRemainingSeconds > 0
    ) return;
    const selectedReports = scenarioReportIds
      .map((reportId) => reports.find((report) => report.id === reportId))
      .filter((report): report is AdvisorReportListItem => report !== undefined);
    const targetDraw = selectedReports[0]?.forecast_draw;
    if (
      selectedReports.length !== scenarioReportIds.length
      || targetDraw === undefined
      || selectedReports.some((report) => report.forecast_draw !== targetDraw)
    ) {
      setScenarioError('Select one to five available reports from the same forecast draw.');
      return;
    }
    if (
      ticketTargetDrawRef.current === null
      || targetDraw !== ticketTargetDrawRef.current
    ) {
      setScenarioError('The selected reports no longer match the currently open draw. Reopen the ticket workspace and select current reports.');
      return;
    }

    setIsScenarioQuoting(true);
    setScenarioError(null);
    setScenarioQuote(null);
    try {
      clearCompletedAdvisorTipScenarioGeneration(window.localStorage);
      setScenarioResult(null);
      setScenarioQuote(await fetchAdvisorTipScenarioQuote({
        source_report_ids: [...scenarioReportIds].sort(),
        draw_id: targetDraw,
        scenario_count: scenarioCount,
      }));
      setScenarioRetryNotBeforeMs(null);
    } catch (error) {
      applyScenarioRetryDelay(error);
      setScenarioError(advisorTipScenarioErrorMessage(
        error,
        'An AI ticket quote could not be prepared. Please review the selected reports.',
      ));
    } finally {
      setIsScenarioQuoting(false);
    }
  }, [
    isScenarioGenerating,
    isScenarioQuoting,
    pendingScenarioGeneration,
    reports,
    applyScenarioRetryDelay,
    scenarioCount,
    scenarioReportIds,
    scenarioRetryRemainingSeconds,
  ]);

  const handleGenerateScenarios = useCallback(async () => {
    if (isScenarioGenerating) return;
    try {
      const saved = readPendingAdvisorTipScenarioGeneration(
        window.localStorage,
        ownerSub,
      );
      if (saved) {
        await executePendingScenarioGeneration(saved);
        return;
      }
      if (scenarioQuote === null || !scenarioQuote.can_generate) return;
      if (
        ticketTargetDrawRef.current === null
        || scenarioQuote.draw_id !== ticketTargetDrawRef.current
      ) {
        setScenarioQuote(null);
        setScenarioReportIds([]);
        setScenarioError('This quote belongs to a previous draw. Select reports for the currently open draw and request a new quote.');
        return;
      }
      const pending = createPendingAdvisorTipScenarioGeneration(
        scenarioQuote,
        ownerSub,
        crypto.randomUUID(),
      );
      await executePendingScenarioGeneration(pending);
    } catch (error) {
      setScenarioError(advisorTipScenarioErrorMessage(
        error,
        'The paid request could not be prepared safely. Nothing was sent.',
      ));
    }
  }, [executePendingScenarioGeneration, isScenarioGenerating, ownerSub, scenarioQuote]);

  const handleDownloadScenarioCsv = useCallback(() => {
    if (scenarioResult === null || generatedTicketDrafts.length === 0) return;
    const header = [
      'ticket_id',
      'draw_id',
      'main_1',
      'main_2',
      'main_3',
      'main_4',
      'main_5',
      'star_1',
      'star_2',
    ].join(',');
    const rows = generatedTicketDrafts.map((ticket) => [
      ticket.id,
      scenarioResult.draw_id,
      ...ticket.main_numbers,
      ...ticket.star_numbers,
    ].join(','));
    const csv = `${header}\r\n${rows.join('\r\n')}\r\n`;
    const file = new Blob([csv], { type: 'text/csv; charset=utf-8' });
    const objectUrl = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `luma-manual-tickets-D${scenarioResult.draw_id}-${scenarioResult.generation_id}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }, [generatedTicketDrafts, scenarioResult]);

  const handleDownloadAllManualTicketsCsv = useCallback(() => {
    const manualTickets = selectManualTicketsForCsv(tips);
    if (manualTickets.length === 0) return;

    const file = new Blob(
      [buildManualTicketsCsv(manualTickets)],
      { type: 'text/csv; charset=utf-8' },
    );
    const objectUrl = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = 'luma-manual-tickets-all-draws.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }, [tips]);

  const refreshTicketScoreboard = useCallback(async (drawId: number) => {
    try {
      const scoreboard = await fetchTicketScoreboard(drawId);
      if (selectedDraw?.draw_id === drawId) {
        setSelectedTicketScoreboard(scoreboard);
        setSelectedTicketScoreboardError(null);
      }
      if (ticketTargetDraw === drawId) {
        setActiveTicketScoreboard(scoreboard);
        setActiveTicketScoreboardError(null);
      }
    } catch (error) {
      const message = ticketErrorMessage(
        error,
        'The manual player scoreboard is currently unavailable.',
      );
      if (selectedDraw?.draw_id === drawId) {
        setSelectedTicketScoreboardError(message);
      }
      if (ticketTargetDraw === drawId) {
        setActiveTicketScoreboardError(message);
      }
    }
  }, [selectedDraw, ticketTargetDraw]);

  const synchronizeTicketTargetDraw = useCallback(async (
    signal?: AbortSignal,
  ) => {
    const engineStatus = await fetchEngineStatus(signal);
    const nextDraw = readEnginePresentationDrawId(engineStatus);
    const nextIsPreparing =
      engineStatus.lifecycle_status === 'WAITING_FOR_SPRINTSTATE';
    const drawChanged = nextDraw !== ticketTargetDraw;
    setIsTicketTargetPreparing(nextIsPreparing);
    if (!drawChanged) return;

    const previousDraw = ticketTargetDraw;
    ticketTargetDrawRef.current = nextDraw;
    setTicketTargetDraw(nextDraw);
    setEditingTicketId(null);
    setDeleteConfirmationTicketId(null);
    setTicketMutationId(null);
    setNewTicketNumbers([]);
    setNewTicketCores([]);
    setTicketSaveNotice(null);
    setActiveTicketScoreboard(null);
    setActiveTicketScoreboardError(null);
    if (
      selectedDraw !== null
      && !isCatalogDraw(selectedDraw)
      && selectedDraw.draw_id === previousDraw
    ) {
      setSelectedDraw(null);
    }
    if (nextDraw !== null) {
      setIsActiveTicketScoreboardLoading(true);
      try {
        setActiveTicketScoreboard(await fetchTicketScoreboard(nextDraw, signal));
      } catch (error) {
        if (!signal?.aborted) {
          setActiveTicketScoreboardError(ticketErrorMessage(
            error,
            'The manual player scoreboard is currently unavailable.',
          ));
        }
      } finally {
        if (!signal?.aborted) setIsActiveTicketScoreboardLoading(false);
      }
    }
  }, [selectedDraw, ticketTargetDraw]);

  useEffect(() => {
    if (activeTab !== 'tips') return undefined;
    const controller = new AbortController();
    const synchronize = () => {
      void synchronizeTicketTargetDraw(controller.signal).catch(() => {
        // The next scheduled or focus-triggered refresh retries automatically.
      });
    };
    const intervalId = window.setInterval(synchronize, 30_000);
    const handleFocus = () => synchronize();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') synchronize();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      controller.abort();
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [activeTab, synchronizeTicketTargetDraw]);

  const handleStartTicketEdit = useCallback((tip: Tip) => {
    if (
      !canManageManualTicket(tip, ticketTargetDraw)
      || selectedDraw?.draw_id !== ticketTargetDraw
      || ticketMutationId !== null
      || isTicketSaving
    ) return;
    setEditingTicketId(tip.id);
    setDeleteConfirmationTicketId(null);
    setNewTicketNumbers([...tip.numbers]);
    setNewTicketCores([...tip.cores]);
    setTicketSaveNotice(null);
  }, [isTicketSaving, selectedDraw, ticketMutationId, ticketTargetDraw]);

  const handleCancelTicketEdit = useCallback(() => {
    if (ticketMutationId !== null) return;
    setEditingTicketId(null);
    setNewTicketNumbers([]);
    setNewTicketCores([]);
    setTicketSaveNotice(null);
  }, [ticketMutationId]);

  const handleSaveTicket = useCallback(async () => {
    if (
      selectedDraw === null
      || isCatalogDraw(selectedDraw)
      || selectedDraw.draw_id !== ticketTargetDraw
      || newTicketNumbers.length !== 5
      || newTicketCores.length !== 2
      || isTicketSaving
    ) {
      return;
    }


    setIsTicketSaving(true);
    if (editingTicketId !== null) setTicketMutationId(editingTicketId);
    setTicketSaveNotice(null);
    try {
      const mainNumbers = [...newTicketNumbers].sort((a, b) => a - b) as [
        number,
        number,
        number,
        number,
        number,
      ];
      const coreNumbers = [...newTicketCores].sort((a, b) => a - b) as [
        number,
        number,
      ];
      if (editingTicketId !== null) {
        const updated = await updateManualTicket(editingTicketId, {
          main_numbers: mainNumbers,
          core_numbers: coreNumbers,
        });
        const applyUpdate = (current: Tip[]) => current.map((tip) => (
          tip.id === updated.ticket.id
            ? {
                ...tip,
                numbers: [...updated.ticket.main_numbers],
                cores: [...updated.ticket.core_numbers],
              }
            : tip
        ));
        setOffcanvasTips(applyUpdate);
        setTips(applyUpdate);
        if (generatedTicketDrafts.some((ticket) => ticket.id === updated.ticket.id)) {
          setGeneratedTicketDrafts((current) => current.map((ticket) => (
            ticket.id === updated.ticket.id
              ? {
                  ...ticket,
                  main_numbers: [...updated.ticket.main_numbers],
                  star_numbers: [...updated.ticket.core_numbers],
                }
              : ticket
          )));
          try {
            clearCompletedAdvisorTipScenarioGeneration(window.localStorage);
          } catch {
            // The persisted ticket remains authoritative even if local recovery cleanup fails.
          }
        }
        setTicketSaveNotice({
          tone: 'success',
          message: 'Ticket updated securely.',
        });
        setEditingTicketId(null);
      } else {
        const saved = await saveManualTicket({
          request_id: crypto.randomUUID(),
          draw_id: selectedDraw.draw_id,
          main_numbers: mainNumbers,
          core_numbers: coreNumbers,
        });
        const savedTip: Tip = {
          id: saved.ticket.id,
          draw_id: saved.ticket.draw_id,
          numbers: saved.ticket.main_numbers,
          cores: saved.ticket.core_numbers,
          label: 'Manual ticket',
          source: 'manual',
        };
        setOffcanvasTips((current) => mergeTicketPresentationItems(current, [savedTip]));
        setTips((current) => mergeTicketPresentationItems(current, [savedTip]));
        setTicketSaveNotice({
          tone: 'success',
          message: saved.idempotent
            ? 'This ticket was already saved.'
            : 'Ticket saved securely.',
        });
      }
      setNewTicketNumbers([]);
      setNewTicketCores([]);

      const [purchasedResult, manualResult] = await Promise.allSettled([
        fetchAllUserTips(selectedDraw.draw_id),
        fetchTicketEvaluation(selectedDraw.draw_id),
      ]);
      const purchased = purchasedResult.status === 'fulfilled'
        ? purchasedResult.value.map(toTip)
        : [];
      const manual = manualResult.status === 'fulfilled'
        ? manualResult.value.items.map(toEvaluatedTip)
        : [];
      setOffcanvasTips((current) => (
        mergeTicketPresentationItems(current, purchased, manual)
      ));
      await refreshTicketScoreboard(selectedDraw.draw_id);
    } catch (error) {
      if (ticketErrorDetail(error) === 'ticket_draw_closed') {
        await synchronizeTicketTargetDraw().catch(() => undefined);
      }
      setTicketSaveNotice({
        tone: 'error',
        message: ticketErrorMessage(error, 'Ticket could not be saved.'),
      });
    } finally {
      setIsTicketSaving(false);
      setTicketMutationId(null);
    }
  }, [
    editingTicketId,
    generatedTicketDrafts,
    isTicketSaving,
    newTicketCores,
    newTicketNumbers,
    refreshTicketScoreboard,
    selectedDraw,
    synchronizeTicketTargetDraw,
    ticketTargetDraw,
  ]);

  const handleDeleteTicket = useCallback(async (tip: Tip) => {
    if (
      selectedDraw === null
      || isCatalogDraw(selectedDraw)
      || selectedDraw.draw_id !== ticketTargetDraw
      || !canManageManualTicket(tip, ticketTargetDraw)
      || ticketMutationId !== null
      || isTicketSaving
    ) {
      return;
    }

    setTicketMutationId(tip.id);
    setTicketSaveNotice(null);
    try {
      const deleted = await deleteManualTicket(tip.id);
      const removeDeleted = <T extends { id: string }>(current: T[]) => current.filter(
        (item) => item.id !== deleted.ticket_id,
      );
      setOffcanvasTips(removeDeleted);
      setTips(removeDeleted);
      if (generatedTicketDrafts.some((ticket) => ticket.id === deleted.ticket_id)) {
        setGeneratedTicketDrafts(removeDeleted);
        try {
          clearCompletedAdvisorTipScenarioGeneration(window.localStorage);
        } catch {
          // The persisted ticket remains authoritative even if local recovery cleanup fails.
        }
      }
      if (editingTicketId === tip.id) {
        setEditingTicketId(null);
        setNewTicketNumbers([]);
        setNewTicketCores([]);
      }
      setDeleteConfirmationTicketId(null);
      setTicketSaveNotice({
        tone: 'success',
        message: 'Ticket deleted.',
      });
      await refreshTicketScoreboard(deleted.draw_id);
    } catch (error) {
      if (ticketErrorDetail(error) === 'ticket_draw_closed') {
        await synchronizeTicketTargetDraw().catch(() => undefined);
      }
      setTicketSaveNotice({
        tone: 'error',
        message: ticketErrorMessage(error, 'Ticket could not be deleted.'),
      });
    } finally {
      setTicketMutationId(null);
    }
  }, [
    editingTicketId,
    generatedTicketDrafts,
    isTicketSaving,
    refreshTicketScoreboard,
    selectedDraw,
    synchronizeTicketTargetDraw,
    ticketTargetDraw,
    ticketMutationId,
  ]);

  const handleDownloadPdf = useCallback(async () => {
    if (
      selectedReport === null
      || !canRequestAdvisorReportPdf(selectedReport)
      || isPdfDownloading
    ) {
      return;
    }
    setIsPdfDownloading(true);
    setPdfError(null);
    try {
      const pdf = await downloadAdvisorReportPdf(selectedReport.id);
      const objectUrl = URL.createObjectURL(pdf);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = advisorReportPdfFilename(selectedReport);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      setSelectedReport((current) => (
        current?.id === selectedReport.id
          ? {
              ...current,
              pdf_status: 'ready',
              pdf_download_url:
                `/api/v1/advisor/reports/${selectedReport.id}/pdf`,
            }
          : current
      ));
    } catch (error) {
      setPdfError(errorMessage(error, 'PDF could not be downloaded.'));
    } finally {
      setIsPdfDownloading(false);
    }
  }, [isPdfDownloading, selectedReport]);

  const selectedPyramid = useMemo(() => resolveHitPyramid(
    selectedAnalytics?.hit_pyramid,
    selectedSummary?.total_hits
      ?? (isCatalogDraw(selectedDraw)
        ? selectedDraw.evaluation.summary?.total_hits
        : undefined),
  ), [selectedAnalytics, selectedDraw, selectedSummary]);

  const hasPublishedPyramid = isCatalogDraw(selectedDraw) && Boolean(
    selectedAnalytics
      || selectedSummary
      || selectedDraw.evaluation.summary,
  );

  const isForecastTicketPanel = selectedDraw !== null
    && !isCatalogDraw(selectedDraw)
    && selectedDraw.draw_id === ticketTargetDraw;

  const isMyTicketEvaluationPanel = activeTab === 'tips'
    && isCatalogDraw(selectedDraw);
  const visibleOffcanvasTips = useMemo(() => (
    isMyTicketEvaluationPanel
      ? selectTopQualifyingManualTicketHits(offcanvasTips, 10)
      : offcanvasTips
  ), [isMyTicketEvaluationPanel, offcanvasTips]);

  useEffect(() => {
    if (!isForecastTicketPanel) setIsTicketGeneratorOpen(false);
  }, [isForecastTicketPanel]);

  const engineUniverseDraws = useMemo(
    () => selectEngineUniverseDraws(draws),
    [draws],
  );

  const ticketDrawSections = useMemo(
    () => buildTicketDrawSections(tips, ticketTargetDraw),
    [ticketTargetDraw, tips],
  );
  const upcomingTicketGroup = ticketDrawSections.upcoming;
  const pastTicketGroups = ticketDrawSections.past;
  const ticketScoreboard = useMemo(() => buildTicketScoreboard(tips), [tips]);
  const manualTicketExportCount = useMemo(
    () => selectManualTicketsForCsv(tips).length,
    [tips],
  );
  const filteredEngineUniverseDraws = useMemo(
    () => filterEngineUniverseDraws(engineUniverseDraws, {
      query: drawQuery,
      dateWindow,
      sortOrder,
    }),
    [dateWindow, drawQuery, engineUniverseDraws, sortOrder],
  );
  const filteredUpcomingTicketGroup = useMemo(() => {
    if (!upcomingTicketGroup || ticketView === 'evaluated') return null;
    return filterTicketDrawGroups([upcomingTicketGroup], {
      query: drawQuery,
      sortOrder,
    })[0] ?? null;
  }, [drawQuery, sortOrder, ticketView, upcomingTicketGroup]);
  const filteredPastTicketGroups = useMemo(() => (
    ticketView === 'upcoming'
      ? []
      : filterTicketDrawGroups(pastTicketGroups, {
          query: drawQuery,
          sortOrder,
        })
  ), [drawQuery, pastTicketGroups, sortOrder, ticketView]);
  const filteredReports = useMemo(
    () => filterAdvisorReports(reports, {
      query: drawQuery,
      kind: reportKind,
      scope: reportScope,
      dateWindow,
      sortOrder,
    }),
    [dateWindow, drawQuery, reportKind, reportScope, reports, sortOrder],
  );
  const ticketWorkspaceReports = useMemo(() => {
    if (!isForecastTicketPanel || selectedDraw === null) return [];
    return reports
      .filter((report) => report.forecast_draw === selectedDraw.draw_id)
      .sort((left, right) => (
        new Date(right.completed_at).getTime() - new Date(left.completed_at).getTime()
      ));
  }, [isForecastTicketPanel, reports, selectedDraw]);
  const filteredDetailDraws = useMemo<SelectedDraw[]>(() => {
    if (activeTab === 'draws') return filteredEngineUniverseDraws;
    if (activeTab !== 'tips') return [];

    const drawIds = [
      ...(filteredUpcomingTicketGroup ? [filteredUpcomingTicketGroup.draw_id] : []),
      ...filteredPastTicketGroups.map((group) => group.draw_id),
    ].sort((left, right) => (
      sortOrder === 'latest' ? right - left : left - right
    ));
    return drawIds.map((drawId) => (
      draws.find((draw) => draw.draw_id === drawId) ?? { draw_id: drawId }
    ));
  }, [
    activeTab,
    draws,
    filteredEngineUniverseDraws,
    filteredPastTicketGroups,
    filteredUpcomingTicketGroup,
    sortOrder,
  ]);
  const selectedDetailDrawIndex = selectedDraw === null
    ? -1
    : filteredDetailDraws.findIndex((draw) => draw.draw_id === selectedDraw.draw_id);
  const previousDetailDraw = selectedDetailDrawIndex > 0
    ? filteredDetailDraws[selectedDetailDrawIndex - 1]
    : null;
  const nextDetailDraw = (
    selectedDetailDrawIndex >= 0
    && selectedDetailDrawIndex < filteredDetailDraws.length - 1
  )
    ? filteredDetailDraws[selectedDetailDrawIndex + 1]
    : null;
  const filtersActive = Boolean(
    drawQuery.trim()
    || sortOrder !== 'latest'
    || dateWindow !== 'all'
    || ticketView !== 'all'
    || reportKind !== 'all'
    || reportScope !== 'all',
  );

  const clearFilters = () => {
    setDrawQuery('');
    setSortOrder('latest');
    setDateWindow('all');
    setTicketView('all');
    setReportKind('all');
    setReportScope('all');
  };

  return (
    <div className="w-full h-full flex flex-col p-4 md:p-8 bg-transparent min-h-[calc(100vh-6rem)] relative overflow-hidden">
      
      {/* Top Navigation */}
      <div className="flex items-center gap-8 border-b border-white/10 pb-4 mb-8">
        <button
          onClick={() => setActiveTab('draws')}
          className={`text-lg font-sans tracking-wide transition-colors relative pb-4 -mb-4 focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:ring-offset-2 focus:ring-offset-canvas ${activeTab === 'draws' ? 'text-white' : 'text-text-muted hover:text-text-secondary'}`}
        >
          Engine Universe
          {activeTab === 'draws' && (
            <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('tips')}
          className={`text-lg font-sans tracking-wide transition-colors relative pb-4 -mb-4 focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:ring-offset-2 focus:ring-offset-canvas ${activeTab === 'tips' ? 'text-white' : 'text-text-muted hover:text-text-secondary'}`}
        >
          My Tickets
          {activeTab === 'tips' && (
            <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`text-lg font-sans tracking-wide transition-colors relative pb-4 -mb-4 focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:ring-offset-2 focus:ring-offset-canvas ${activeTab === 'reports' ? 'text-white' : 'text-text-muted hover:text-text-secondary'}`}
        >
          Reports
          {activeTab === 'reports' && (
            <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />
          )}
        </button>
      </div>

      {!isForecastTicketPanel && (
      <div
        aria-label="Analytics filters"
        className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-canvas-elevated/70 p-3"
      >
        <label className="min-w-[150px] flex-1 sm:max-w-[220px]">
          <span className="sr-only">Filter by draw</span>
          <input
            type="search"
            inputMode="numeric"
            value={drawQuery}
            onChange={(event) => setDrawQuery(event.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Find draw"
            className="h-9 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-xs text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/40"
          />
        </label>

        {activeTab === 'tips' && (
          <label>
            <span className="sr-only">Ticket status</span>
            <select
              value={ticketView}
              onChange={(event) => setTicketView(event.target.value as typeof ticketView)}
              className="h-9 rounded-lg border border-white/10 bg-[#111722] pl-3 pr-9 text-xs text-slate-300 outline-none focus:border-accent-cyan/50"
            >
              <option value="all">All tickets</option>
              <option value="upcoming">Upcoming</option>
              <option value="evaluated">Evaluated</option>
            </select>
          </label>
        )}

        {activeTab === 'reports' && (
          <>
            <label>
              <span className="sr-only">Report type</span>
              <select
                value={reportKind}
                onChange={(event) => setReportKind(event.target.value as ReportKindFilter)}
                className="h-9 rounded-lg border border-white/10 bg-[#111722] pl-3 pr-9 text-xs text-slate-300 outline-none focus:border-accent-cyan/50"
              >
                <option value="all">All report types</option>
                <option value="pro">LUMA Pro</option>
                <option value="standard">Standard</option>
                <option value="expert">Expert</option>
                <option value="analytical">Analytical</option>
                <option value="exploratory">Exploratory</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Analysis scope</span>
              <select
                value={reportScope}
                onChange={(event) => setReportScope(event.target.value as ReportScopeFilter)}
                className="h-9 rounded-lg border border-white/10 bg-[#111722] pl-3 pr-9 text-xs text-slate-300 outline-none focus:border-accent-cyan/50"
              >
                <option value="all">All analysis scopes</option>
                <option value="forecast">Forecast</option>
                <option value="historical">Historical</option>
              </select>
            </label>
          </>
        )}

        {activeTab !== 'tips' && (
          <label>
            <span className="sr-only">Date range</span>
            <select
              value={dateWindow}
              onChange={(event) => setDateWindow(event.target.value as AnalyticsDateWindow)}
              className="h-9 rounded-lg border border-white/10 bg-[#111722] pl-3 pr-9 text-xs text-slate-300 outline-none focus:border-accent-cyan/50"
            >
              <option value="all">All dates</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </label>
        )}

        <label>
          <span className="sr-only">Sort order</span>
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as AnalyticsSortOrder)}
            className="h-9 rounded-lg border border-white/10 bg-[#111722] pl-3 pr-9 text-xs text-slate-300 outline-none focus:border-accent-cyan/50"
          >
            <option value="latest">Latest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>

        {activeTab === 'tips' && (
          <button
            type="button"
            onClick={handleDownloadAllManualTicketsCsv}
            disabled={isLoading || manualTicketExportCount === 0}
            aria-label={`Export all ${manualTicketExportCount} manual tickets across all draws as CSV`}
            title="Exports your complete manual-ticket history across all draws. Current filters do not limit this file."
            className="flex h-9 items-center gap-2 rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-accent-cyan transition-colors hover:border-accent-cyan/60 hover:bg-accent-cyan/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-600"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export all manual tickets
            <span className="text-slate-500">({manualTicketExportCount})</span>
          </button>
        )}

        <button
          type="button"
          onClick={clearFilters}
          disabled={!filtersActive}
          className="h-9 rounded-lg border border-white/10 px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 transition-colors hover:border-accent-cyan/30 hover:text-accent-cyan disabled:cursor-not-allowed disabled:opacity-35"
        >
          Clear filters
        </button>
      </div>
      )}

      {/* Grid Content */}
      <div className="flex-1 w-full overflow-y-auto pb-20">
        {isLoading ? (
          <div className="flex flex-col gap-4 w-full">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-white/5 h-12 rounded-lg border border-white/5 animate-pulse w-full relative overflow-hidden">
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full h-full">
            
            {activeTab === 'draws' && filteredEngineUniverseDraws.length > 0 && (
              <div className="grid grid-cols-1 gap-6 pt-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredEngineUniverseDraws.map(draw => {
                  const qualifyingHitCount =
                    draw.evaluation.summary.qualifying_combination_count;
                  const bestHit = resolveHitPyramid(
                    null,
                    draw.evaluation.summary.total_hits,
                  ).find((item) => item.count > 0) ?? null;
                  return (
                    <div 
                      key={draw.draw_id} 
                      onClick={() => setSelectedDraw(draw)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedDraw(draw);
                        }
                      }}
                      role="button"
                      aria-label={`Open draw ${draw.draw_id} details`}
                      title={`Open draw ${draw.draw_id} analysis`}
                      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-white/5 bg-canvas-elevated p-6 transition-all duration-300 hover:border-accent-cyan/30 hover:bg-canvas-elevated/95 hover:shadow-[0_10px_30px_-10px_rgba(0,255,255,0.15)] focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:ring-offset-2 focus:ring-offset-canvas"
                      tabIndex={0}
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-accent-cyan/5 rounded-bl-full pointer-events-none transition-colors group-hover:bg-accent-cyan/10" />
                      <div className="flex justify-between items-start mb-6 relative z-10">
                        <div className="flex items-center gap-2 bg-accent-cyan/10 px-3 py-1.5 rounded border border-accent-cyan/20">
                          <Database className="w-4 h-4 text-accent-cyan" />
                          <span className="text-xs font-mono text-accent-cyan font-bold uppercase tracking-widest">Draw {draw.draw_id}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">
                          {new Date(draw.draw_date).toLocaleDateString('en-GB')}
                        </span>
                      </div>
                      <div className="relative z-10 mb-5 flex flex-col gap-2">
                        <div className="text-sm text-slate-400 font-sans">Total qualifying hits</div>
                        <div className="text-2xl text-white font-mono">
                          {qualifyingHitCount.toLocaleString()}
                        </div>
                      </div>
                      <div className="relative z-10 mt-auto h-5">
                        <div className="absolute inset-0 flex items-center justify-between gap-3 transition-all duration-200 group-hover:-translate-y-1 group-hover:opacity-0 group-focus:-translate-y-1 group-focus:opacity-0">
                          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
                            Best hit
                          </span>
                          <span className="font-mono text-xs font-bold text-accent-cyan">
                            {bestHit
                              ? `${bestHit.category} · ${bestHit.count.toLocaleString()} ${bestHit.count === 1 ? 'hit' : 'hits'}`
                              : 'No qualifying hits'}
                          </span>
                        </div>
                        <div className="absolute inset-0 flex translate-y-1 items-center gap-2 font-sans text-xs font-medium uppercase tracking-widest text-accent-cyan opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus:translate-y-0 group-focus:opacity-100">
                          Open draw analysis <ChevronRight className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'tips' && (
              isForecastTicketPanel && selectedDraw !== null ? (
              <div aria-label="Upcoming ticket workspace" className="flex flex-col gap-6 pb-12">
                <header className="relative overflow-hidden rounded-xl border border-accent-cyan/20 bg-canvas-elevated p-5 sm:p-6">
                  <div className="pointer-events-none absolute right-0 top-0 h-36 w-36 rounded-bl-full bg-accent-cyan/5" />
                  <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedDraw(null)}
                        aria-label="Back to My Tickets"
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-slate-300 transition-colors hover:border-accent-cyan/30 hover:text-accent-cyan focus:outline-none focus:ring-2 focus:ring-accent-cyan"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <div>
                        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent-cyan">
                          My Tickets · Upcoming Draw
                        </div>
                        <h1 className="mt-1 text-2xl font-display text-white">Draw {selectedDraw.draw_id} Ticket Workspace</h1>
                        <p className="mt-1 text-sm text-slate-400">
                          Build manual tickets, generate an evidence-guided set from your reports, edit the final rows, and export one CSV.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <span className="rounded border border-accent-cyan/20 bg-accent-cyan/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-accent-cyan">
                        {isTicketTargetPreparing ? 'Preparing / upcoming draw' : 'Awaiting draw results'}
                      </span>
                      <span className="rounded border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-300">
                        {offcanvasTips.length} {offcanvasTips.length === 1 ? 'ticket' : 'tickets'}
                      </span>
                    </div>
                  </div>
                </header>

                <ManualPlayerScoreboard
                  drawId={selectedDraw.draw_id}
                  scoreboard={selectedTicketScoreboard}
                  isLoading={isSelectedTicketScoreboardLoading}
                  error={selectedTicketScoreboardError}
                />

                <section
                  aria-label="AI ticket generator launcher"
                  className="relative overflow-hidden rounded-xl border border-accent-cyan/20 bg-canvas-elevated p-5 sm:p-6"
                >
                  <div className="pointer-events-none absolute right-0 top-0 h-36 w-36 rounded-bl-full bg-accent-cyan/5" />
                  <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="max-w-3xl">
                      <div className="mb-2 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-accent-cyan" />
                        <h2 className="text-base font-semibold text-white">AI Ticket Generator</h2>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-400">
                        Open a dedicated workspace to select up to five completed Draw {selectedDraw.draw_id} reports and create 20-120 editable manual tickets.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
                        <span className="rounded border border-accent-cyan/20 bg-accent-cyan/5 px-2 py-1 text-accent-cyan">
                          {ticketWorkspaceReports.length} {ticketWorkspaceReports.length === 1 ? 'report' : 'reports'} available
                        </span>
                        {scenarioReportIds.length > 0 && (
                          <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-300">
                            {scenarioReportIds.length}/5 selected
                          </span>
                        )}
                        {generatedTicketDrafts.length > 0 && (
                          <span className="rounded border border-emerald-300/20 bg-emerald-300/5 px-2 py-1 text-emerald-200">
                            {generatedTicketDrafts.length} generated
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsTicketGeneratorOpen(true)}
                      className="btn-cyber-glass flex min-h-11 shrink-0 items-center justify-center gap-2 rounded px-5 py-2 text-xs font-bold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-accent-cyan"
                    >
                      <Sparkles className="h-4 w-4" />
                      Open generator
                    </button>
                  </div>
                </section>

                <section
                  aria-label="Manual tickets for upcoming draw"
                  className="overflow-hidden rounded-xl border border-white/5 bg-canvas-elevated"
                >
                  <div className="flex flex-col gap-2 border-b border-white/5 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-white">Manual Ticket Set</h2>
                      <p className="mt-1 text-xs text-slate-400">
                        Add, edit, or delete your saved manual tickets for Draw {selectedDraw.draw_id}.
                      </p>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                      {offcanvasTips.length} saved
                    </span>
                  </div>

                  <div className="p-5">
                    {isOffcanvasTipsLoading ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        {[1, 2, 3, 4].map((item) => (
                          <div key={item} className="h-14 animate-pulse rounded-lg border border-white/5 bg-white/5" />
                        ))}
                      </div>
                    ) : offcanvasTips.length > 0 ? (
                      <div className="grid max-h-[480px] grid-cols-1 gap-2 overflow-y-auto pr-1 lg:grid-cols-2">
                        {offcanvasTips.map((tip, index) => (
                          <div key={tip.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/5 bg-black/20 p-3 transition-colors hover:border-accent-cyan/20">
                            <span className="mr-1 w-7 font-mono text-[10px] text-slate-500">#{index + 1}</span>
                            {tip.numbers.map((number) => (
                              <span key={`main-${tip.id}-${number}`} className="flex h-7 w-7 items-center justify-center rounded border border-accent-cyan/20 bg-accent-cyan/5 font-mono text-[10px] font-bold text-slate-200">
                                {number}
                              </span>
                            ))}
                            <span className="mx-1 h-6 w-px bg-white/10" />
                            {tip.cores.map((number) => (
                              <span key={`star-${tip.id}-${number}`} className="flex h-7 w-7 items-center justify-center rounded border border-[#27D8FF]/25 bg-[#27D8FF]/10 font-mono text-[10px] font-bold text-[#7BE8FF]">
                                {number}
                              </span>
                            ))}
                            {canManageManualTicket(tip, ticketTargetDraw) && (
                              <div className="ml-auto flex items-center gap-1">
                                {deleteConfirmationTicketId === tip.id ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteTicket(tip)}
                                      disabled={ticketMutationId !== null || isTicketSaving}
                                      aria-label={`Confirm deletion of ticket ${index + 1}`}
                                      className="flex h-8 items-center gap-1 rounded border border-red-400/30 bg-red-400/10 px-2 text-[10px] font-bold uppercase text-red-200 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-40"
                                    >
                                      {ticketMutationId === tip.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                      Delete
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteConfirmationTicketId(null)}
                                      aria-label="Cancel ticket deletion"
                                      className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-300 focus:outline-none focus:ring-2 focus:ring-accent-cyan"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleStartTicketEdit(tip)}
                                      aria-label={`Edit ticket ${index + 1}`}
                                      className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-300 transition-colors hover:border-accent-cyan/30 hover:text-accent-cyan focus:outline-none focus:ring-2 focus:ring-accent-cyan"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteConfirmationTicketId(tip.id)}
                                      aria-label={`Delete ticket ${index + 1}`}
                                      className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-400 transition-colors hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-200 focus:outline-none focus:ring-2 focus:ring-red-300"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-black/15 text-center">
                        <FileText className="h-6 w-6 text-slate-600" />
                        <span className="text-sm text-slate-500">{offcanvasTipsError ?? 'No manual tickets entered yet.'}</span>
                      </div>
                    )}

                    <div id="manual-ticket-editor" className="mt-5 rounded-xl border border-white/5 bg-black/20 p-4 sm:p-5">
                      <div className="flex flex-col gap-2 border-b border-white/5 pb-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-white">
                            {editingTicketId !== null
                                ? 'Edit Saved Ticket'
                                : 'New Ticket Entry'}
                          </h3>
                          <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                            {editingTicketId !== null
                                ? 'Changes apply to the saved manual ticket'
                                : 'Select five main numbers and two stars'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-xs text-slate-500">
                          <span>{newTicketNumbers.length}/5 Numbers</span>
                          <span>·</span>
                          <span>{newTicketCores.length}/2 Stars</span>
                        </div>
                      </div>
                      <div className="py-5">
                        <TicketGrid
                          numbers={newTicketNumbers}
                          cores={newTicketCores}
                          isReadOnly={false}
                          onToggleNumber={handleToggleNumber}
                          onToggleCore={handleToggleCore}
                        />
                      </div>
                      {ticketSaveNotice && (
                        <div
                          role={ticketSaveNotice.tone === 'error' ? 'alert' : 'status'}
                          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${ticketSaveNotice.tone === 'success'
                            ? 'border-emerald-400/30 bg-emerald-400/5 text-emerald-200'
                            : 'border-red-400/30 bg-red-400/5 text-red-200'}`}
                        >
                          {ticketSaveNotice.message}
                        </div>
                      )}
                      <div className="flex flex-wrap justify-end gap-2 border-t border-white/5 pt-4">
                        {editingTicketId !== null && (
                          <button
                            type="button"
                            onClick={handleCancelTicketEdit}
                            disabled={isTicketSaving}
                            className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-5 py-2 text-xs font-bold uppercase tracking-widest text-slate-300 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-accent-cyan disabled:opacity-50"
                          >
                            <X className="h-4 w-4" /> Cancel
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleSaveTicket()}
                          disabled={isTicketSaving || newTicketNumbers.length < 5 || newTicketCores.length < 2}
                          className="btn-cyber-glass flex items-center gap-2 rounded px-6 py-2 text-xs font-bold uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isTicketSaving
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : editingTicketId === null
                              ? <Plus className="h-4 w-4" />
                              : <Check className="h-4 w-4" />}
                          {isTicketSaving
                            ? 'Saving…'
                            : editingTicketId === null
                              ? 'Add Ticket'
                              : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
              ) : (
              <div className="flex flex-col gap-8">
                <section
                  aria-label="My ticket scoreboard"
                  className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/5 bg-white/5 sm:grid-cols-4"
                >
                  {[
                    ['Draws played', ticketScoreboard.draw_count],
                    ['My tickets', ticketScoreboard.ticket_count],
                    ['Evaluated', ticketScoreboard.evaluated_count],
                    ['Best result', ticketScoreboard.best_hit ?? 'Pending'],
                  ].map(([label, value], index) => (
                    <div key={String(label)} className="bg-canvas-elevated px-5 py-4">
                      <div className="mb-1 flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.16em] text-slate-500">
                        {index === 3 && <Trophy className="h-3 w-3 text-accent-cyan" />}
                        {label}
                      </div>
                      <div className="font-mono text-xl font-bold text-accent-cyan">
                        {value}
                      </div>
                    </div>
                  ))}
                </section>

                {ticketTargetDraw !== null && ticketView !== 'evaluated' && (
                  <ManualPlayerScoreboard
                    drawId={ticketTargetDraw}
                    scoreboard={activeTicketScoreboard}
                    isLoading={isActiveTicketScoreboardLoading}
                    error={activeTicketScoreboardError}
                  />
                )}

                {filteredUpcomingTicketGroup && (
                  <section className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-accent-cyan">
                        New / Upcoming
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-r from-accent-cyan/25 to-transparent" />
                    </div>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
                      <TicketDrawCard
                        group={filteredUpcomingTicketGroup}
                        isUpcoming
                        isPreparing={isTicketTargetPreparing}
                        onOpen={() => setSelectedDraw({ draw_id: filteredUpcomingTicketGroup.draw_id })}
                      />
                    </div>
                  </section>
                )}

                {filteredPastTicketGroups.length > 0 && (
                  <section className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-slate-400">
                        Past evaluated tickets
                      </span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
                      {filteredPastTicketGroups.map((group) => (
                        <TicketDrawCard
                          key={group.draw_id}
                          group={group}
                          isUpcoming={false}
                          onOpen={() => {
                            const draw = draws.find((item) => item.draw_id === group.draw_id);
                            setSelectedDraw(draw ?? { draw_id: group.draw_id });
                          }}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
              )
            )}

            {activeTab === 'reports' && filteredReports.length > 0 && (
              <section
                aria-label="Advisor report archive"
                className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
              >
                {filteredReports.map((report) => (
                  <article
                    key={report.id}
                    onClick={() => void handleReadReport(report.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void handleReadReport(report.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open report for ${advisorReportScopeLabel(report)}`}
                    className="group relative flex min-h-[190px] cursor-pointer flex-col overflow-hidden rounded-xl border border-white/5 bg-canvas-elevated p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent-cyan/30 hover:shadow-[0_10px_30px_-10px_rgba(0,240,255,0.16)] focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:ring-offset-2 focus:ring-offset-canvas"
                  >
                    <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-accent-cyan/5 transition-colors group-hover:bg-accent-cyan/10" />
                    <div className="relative z-10 mb-4 flex items-start justify-between gap-3">
                      <div className={`flex items-center gap-2 rounded border px-2 py-1 ${
                        report.luma_pro
                          ? 'border-accent-magenta/25 bg-accent-magenta/10'
                          : 'border-accent-cyan/20 bg-accent-cyan/10'
                      }`}>
                        <Cpu className={`h-3 w-3 ${
                          report.luma_pro ? 'text-accent-magenta' : 'text-accent-cyan'
                        }`} />
                        <span className={`font-mono text-[10px] font-bold uppercase ${
                          report.luma_pro ? 'text-accent-magenta' : 'text-accent-cyan'
                        }`}>
                          {report.luma_pro ? 'LUMA PRO' : report.tone}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-text-muted">
                        {formatAnalyticsTimestamp(report.completed_at)}
                      </span>
                    </div>
                    <p className="relative z-10 flex-1 text-sm italic leading-relaxed text-slate-300">
                      {advisorReportScopeLabel(report)} / {report.signal_layers.length > 0
                        ? report.signal_layers.join(', ')
                        : 'Base contract'} / {report.deep_evidence
                        ? 'Deep evidence / 3x / '
                        : 'Standard evidence / '}{report.quoted_credits} CR
                    </p>
                    <div className="relative z-10 mt-6 h-5 overflow-hidden">
                      <div className="absolute inset-0 flex items-center font-mono text-[10px] uppercase tracking-widest text-slate-500 transition-all duration-200 group-hover:-translate-y-1 group-hover:opacity-0 group-focus:-translate-y-1 group-focus:opacity-0 [@media(hover:none)]:hidden">
                        {report.pdf_status === 'ready' ? 'Report and PDF ready' : 'Report ready'}
                      </div>
                      <div className="absolute inset-0 flex translate-y-1 items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent-cyan opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus:translate-y-0 group-focus:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100">
                        {report.pdf_status === 'ready' ? 'Read Report / PDF' : 'Read Report'}
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            )}
            {/* Empty States */}
            {!isLoading && (
              (activeTab === 'draws' && filteredEngineUniverseDraws.length === 0) ||
              (activeTab === 'tips'
                && filteredUpcomingTicketGroup === null
                && filteredPastTicketGroups.length === 0) ||
              (activeTab === 'reports' && filteredReports.length === 0)
            ) && (
              <div className="col-span-full py-20 flex flex-col items-center justify-center text-text-muted gap-4">
                <Database className="w-12 h-12 opacity-20" />
                <span className="font-sans text-sm tracking-widest uppercase font-medium">
                  {dataError
                    ? `Data unavailable: ${dataError}`
                    : filtersActive
                      ? 'No items match the current filters'
                      : 'No data available'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={isTicketGeneratorOpen && isForecastTicketPanel}
        onOpenChange={(open) => setIsTicketGeneratorOpen(open)}
      >
        {isForecastTicketPanel && selectedDraw !== null && (
          <DialogContent
            variant="workspace"
            aria-describedby="ticket-generator-workspace-description"
            className="gap-0 p-0"
          >
            <DialogHeader className="shrink-0 border-b border-white/10 px-5 py-4 pr-16 sm:px-6 sm:py-5">
              <DialogTitle>AI TICKET WORKSPACE · DRAW {selectedDraw.draw_id}</DialogTitle>
              <DialogDescription id="ticket-generator-workspace-description">
                Select verified reports, confirm the exact credit quote, generate 20-120 tickets, and export the saved set.
              </DialogDescription>
            </DialogHeader>
            <div
              aria-label="AI ticket generator workspace"
              className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6"
            >
              <ReportTicketGenerator
                drawId={selectedDraw.draw_id}
                reports={ticketWorkspaceReports}
                selectedReportIds={scenarioReportIds}
                ticketCount={scenarioCount}
                quote={scenarioQuote}
                generatedTickets={generatedTicketDrafts}
                creditsCharged={scenarioResult?.credits_charged ?? null}
                balanceAfter={scenarioResult?.balance_after ?? null}
                pendingRequest={pendingScenarioGeneration}
                error={scenarioError}
                isQuoting={isScenarioQuoting}
                isGenerating={isScenarioGenerating}
                retryRemainingSeconds={scenarioRetryRemainingSeconds}
                onToggleReport={handleToggleScenarioReport}
                onTicketCountChange={handleScenarioCountChange}
                onReviewQuote={() => void handleScenarioQuote()}
                onGenerate={() => void handleGenerateScenarios()}
                onReadReport={(reportId) => void handleReadReport(reportId)}
                onDownloadCsv={handleDownloadScenarioCsv}
              />
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Offcanvas Detail View for Draws (Radix UI) */}
      <Dialog
        open={Boolean(selectedDraw && !isForecastTicketPanel)}
        onOpenChange={(open) => { if (!open) setSelectedDraw(null); }}
      >
        <DialogContent
          aria-describedby="dialog-description"
          variant="side-panel"
          className={isForecastTicketPanel
            ? 'overflow-hidden p-4 sm:max-w-[640px] sm:p-5 md:max-w-[720px] xl:max-w-[800px]'
            : undefined}
        >
          <DialogHeader className={`${isForecastTicketPanel ? 'pb-3' : 'pb-6'} border-b border-white/10 flex flex-row items-start justify-between`}>
            <div className="flex flex-col space-y-1.5">
              <div className="flex items-center gap-3">
                <DialogTitle>DRAW {selectedDraw?.draw_id}</DialogTitle>
                {filteredDetailDraws.length > 1 && selectedDetailDrawIndex >= 0 && (
                  <nav
                    aria-label="Filtered draw navigation"
                    className="flex items-center gap-1 rounded-md border border-white/5 bg-black/15 p-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => previousDetailDraw && setSelectedDraw(previousDetailDraw)}
                      disabled={previousDetailDraw === null}
                      aria-label="Previous available draw"
                      className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-white/5 hover:text-accent-cyan focus:outline-none focus:ring-1 focus:ring-accent-cyan disabled:cursor-not-allowed disabled:opacity-25"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-[42px] text-center font-mono text-[9px] text-slate-500">
                      {selectedDetailDrawIndex + 1}/{filteredDetailDraws.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => nextDetailDraw && setSelectedDraw(nextDetailDraw)}
                      disabled={nextDetailDraw === null}
                      aria-label="Next available draw"
                      className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-white/5 hover:text-accent-cyan focus:outline-none focus:ring-1 focus:ring-accent-cyan disabled:cursor-not-allowed disabled:opacity-25"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </nav>
                )}
              </div>
              <DialogDescription id="dialog-description">Global Universe Analytics</DialogDescription>
            </div>
            {!isCatalogDraw(selectedDraw) ? (
              <div className="flex flex-col items-end mr-8">
                <span className="text-[10px] font-sans text-slate-400 uppercase tracking-widest font-medium mb-1">Forecast</span>
                <span className="text-sm font-mono text-cyan-400 font-bold bg-cyan-400/10 border border-cyan-400/20 px-3 py-1 rounded">
                  {isTicketTargetPreparing
                    && selectedDraw?.draw_id === ticketTargetDraw
                    ? 'Preparing'
                    : 'Awaiting Draw Results'}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-end mr-8">
                <span className="text-[10px] font-sans text-slate-400 uppercase tracking-widest font-medium mb-1">Winning Numbers</span>
                <div className="flex gap-1">
                  {selectedDraw.winning_numbers.main.map((n, i) => (
                    <div key={i} className="w-6 h-6 rounded bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center text-[10px] font-mono font-bold text-cyan-400">{n}</div>
                  ))}
                  <div className="w-px h-6 bg-white/10 mx-1" />
                  {selectedDraw.winning_numbers.stars.map((c, i) => (
                    <div key={i} className="w-6 h-6 rounded bg-fuchsia-500/10 border border-fuchsia-500/30 flex items-center justify-center text-[10px] font-mono font-bold text-fuchsia-400">{c}</div>
                  ))}
                </div>
              </div>
            )}
          </DialogHeader>
              
          <div className={`flex min-h-0 flex-1 flex-col overflow-x-hidden ${
            isForecastTicketPanel
              ? 'forecast-ticket-panel-content gap-4 p-3'
              : 'gap-10 overflow-y-auto p-8'
          }`}>

            {isForecastTicketPanel && selectedDraw && (
              <ManualPlayerScoreboard
                drawId={selectedDraw.draw_id}
                scoreboard={selectedTicketScoreboard}
                isLoading={isSelectedTicketScoreboardLoading}
                error={selectedTicketScoreboardError}
                compact
              />
            )}

            {isCatalogDraw(selectedDraw) && (
              <ManualPlayerScoreboard
                drawId={selectedDraw.draw_id}
                scoreboard={selectedTicketScoreboard}
                isLoading={isSelectedTicketScoreboardLoading}
                error={selectedTicketScoreboardError}
              />
            )}

            {/* Quality-first hit ladder */}
            {activeTab === 'draws' && isCatalogDraw(selectedDraw) && (
            <div className="flex flex-col gap-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-white font-sans">
                <Layers className="w-4 h-4 text-accent-cyan" />
                <span>Hit Quality Ladder</span>
                {hasPublishedPyramid && (
                  <span className="ml-auto text-right text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                    Prize tier priority · hover for counts
                  </span>
                )}
                {!selectedSummary
                  && isCatalogDraw(selectedDraw)
                  && !isDrawDetailLoading
                  && (summaryError || !selectedDraw.availability.summary) && (
                    <span className="ml-auto text-right text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                      {summaryError ?? 'Evaluation summary unavailable'}
                    </span>
                  )}
              </h3>
              <div className="relative flex h-72 w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-white/5 bg-black/20 p-4">
                 {isDrawDetailLoading && !hasPublishedPyramid ? (
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-500 opacity-70">
                      <Activity className="w-8 h-8 animate-pulse" />
                      <span className="text-xs font-mono uppercase tracking-widest font-medium">Loading available analytics...</span>
                    </div>
                  ) : hasPublishedPyramid ? (
                    <Suspense
                      fallback={(
                        <div className="flex h-full w-full items-center justify-center text-slate-500">
                          <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading chart" />
                        </div>
                      )}
                    >
                      <LazyHitPyramidChart items={selectedPyramid} />
                    </Suspense>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-500 opacity-70 text-center">
                      <Activity className="w-8 h-8" />
                      <span className="text-xs font-mono uppercase tracking-widest font-medium">
                        {drawDetailError
                          ?? summaryError
                          ?? 'Published hit distribution unavailable'}
                      </span>
                    </div>
                  )}
              </div>
            </div>
            )}

            {activeTab === 'draws' && isCatalogDraw(selectedDraw) && (
              <div className="flex flex-col gap-4">
                <h3 className="text-sm font-sans text-white font-medium mb-2 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-accent-magenta" />
                  Evaluation Modules
                </h3>
                {isDrawDetailLoading
                  && selectedDraw.evaluation.modules.length > 0 ? (
                    <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-black/20 p-5 text-xs font-mono uppercase tracking-widest text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading available modules...
                    </div>
                  ) : selectedModules.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                      {selectedModules.map((module) => (
                        <EvaluationModuleAccordion
                          key={module.module_name}
                          module={module}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/5 bg-black/20 p-5 text-center text-xs font-mono uppercase tracking-widest text-slate-500">
                      {selectedDraw.evaluation.modules.length === 0
                        ? 'No evaluation modules are published for this draw.'
                        : 'Published modules are currently unavailable.'}
                    </div>
                  )}
                {Object.keys(moduleErrors).length > 0 && (
                  <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs text-amber-200">
                    {Object.entries(moduleErrors).map(([moduleName, message]) => (
                      <p key={moduleName}>
                        {moduleName.replaceAll('_', ' ')}: {message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedDraw !== null && (
            <section
              aria-label="Tickets for selected draw"
              className={`flex flex-col border-t border-white/5 pt-4 ${isForecastTicketPanel ? 'gap-2' : 'gap-4'}`}
            >
              {isMyTicketEvaluationPanel && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Trophy className="h-4 w-4 text-accent-cyan" aria-hidden="true" />
                      My Top 10 Winning Tickets
                    </h3>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                      Manual tickets only · 2+0 or better · best hit first
                    </p>
                  </div>
                  {!isOffcanvasTipsLoading && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-accent-cyan">
                      {visibleOffcanvasTips.length} qualifying
                    </span>
                  )}
                </div>
              )}
              
              {isOffcanvasTipsLoading ? (
                <div className="flex flex-col gap-2">
                  {[1, 2].map(i => (
                    <div key={i} className="bg-white/5 rounded-lg h-10 animate-pulse border border-white/5 relative overflow-hidden">
                       <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                    </div>
                  ))}
                </div>
              ) : selectedDraw !== null ? (
                visibleOffcanvasTips.length > 0 ? (
                  <div className={`flex max-h-[34vh] flex-col overflow-y-auto pr-1 ${isForecastTicketPanel ? 'gap-1.5' : 'gap-2'}`}>
                    {visibleOffcanvasTips.map((tip, index) => (
                      <div key={tip.id} className={`bg-black/20 border border-white/5 rounded-lg flex items-center justify-between hover:bg-white/5 transition-colors group ${isForecastTicketPanel ? 'gap-2 p-2' : 'gap-4 p-3'}`}>
                        <div className={`flex items-center shrink-0 ${tip.source === 'manual' ? 'gap-0' : 'min-w-[100px] gap-3'}`}>
                           <span className="text-slate-500 font-mono text-xs">#{index + 1}</span>
                           {tip.source !== 'manual' && (
                             <span className="truncate font-mono font-medium text-white" title={tip.label}>
                               {tip.label}
                             </span>
                           )}
                        </div>
                        
                        <div className="flex items-center gap-2 hidden md:flex shrink-0">
                           {tip.numbers.map((n, i) => {
                              const isHit = isCatalogDraw(selectedDraw)
                                && selectedDraw.winning_numbers.main.includes(n);
                             return (
                               <div key={i} className={`${isForecastTicketPanel ? 'h-6 w-6' : 'h-7 w-7'} rounded flex items-center justify-center text-[10px] font-mono font-bold ${isHit ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/50' : 'bg-white/5 text-slate-400 border border-white/10'}`}>
                                 {n}
                               </div>
                             );
                           })}
                        </div>
                        <div className="w-px h-6 bg-white/10 mx-1 hidden md:block shrink-0" />
                        <div className="flex items-center gap-2 hidden md:flex shrink-0">
                           {tip.cores.map((c, i) => {
                              const isHit = isCatalogDraw(selectedDraw)
                                && selectedDraw.winning_numbers.stars.includes(c);
                             return (
                               <div key={i} className={`${isForecastTicketPanel ? 'h-6 w-6' : 'h-7 w-7'} rounded flex items-center justify-center text-[10px] font-mono font-bold ${isHit ? 'bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/50' : 'bg-white/5 text-slate-400 border border-white/10'}`}>
                                 {c}
                               </div>
                             );
                           })}
                        </div>
                        
                        <div className="flex items-center justify-end gap-3 ml-auto shrink-0">
                          {selectedDraw !== null
                            && !isCatalogDraw(selectedDraw)
                            && selectedDraw.draw_id === ticketTargetDraw
                            && canManageManualTicket(tip, ticketTargetDraw) && (
                              <div className="flex items-center gap-1">
                                {deleteConfirmationTicketId === tip.id ? (
                                  <>
                                    <span className="mr-1 hidden text-[10px] font-mono text-red-200 sm:inline">
                                      Delete?
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteTicket(tip)}
                                      disabled={ticketMutationId !== null || isTicketSaving}
                                      aria-label={`Confirm deletion of ticket ${index + 1}`}
                                      className="flex h-8 w-8 items-center justify-center rounded border border-red-400/30 bg-red-400/10 text-red-200 transition-colors hover:bg-red-400/20 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {ticketMutationId === tip.id
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <Check className="h-3.5 w-3.5" />}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteConfirmationTicketId(null)}
                                      disabled={ticketMutationId !== null || isTicketSaving}
                                      aria-label="Cancel ticket deletion"
                                      className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-accent-cyan disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleStartTicketEdit(tip)}
                                      disabled={ticketMutationId !== null || isTicketSaving}
                                      aria-label={`Edit ticket ${index + 1}`}
                                      className={`flex h-8 w-8 items-center justify-center rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-accent-cyan disabled:cursor-not-allowed disabled:opacity-50 ${
                                        editingTicketId === tip.id
                                          ? 'border-accent-cyan/40 bg-accent-cyan/15 text-accent-cyan'
                                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-accent-cyan/25 hover:text-accent-cyan'
                                      }`}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDeleteConfirmationTicketId(tip.id);
                                        setTicketSaveNotice(null);
                                      }}
                                      disabled={ticketMutationId !== null || isTicketSaving}
                                      aria-label={`Delete ticket ${index + 1}`}
                                      className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-400 transition-colors hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-200 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          {tip.hit_category && (
                            <span className={`px-2 py-1 rounded text-[10px] font-mono uppercase tracking-widest min-w-[50px] text-center border ${tip.hit_category === '0+0' ? 'bg-white/5 text-slate-400 border-white/10' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                              {tip.hit_category}
                            </span>
                          )}
                          {isCatalogDraw(selectedDraw) && !isMyTicketEvaluationPanel && (
                            <span className={`font-mono text-sm min-w-[80px] text-right ${typeof tip.payout === 'number' && tip.payout > 0 ? 'text-cyan-400 font-bold' : 'text-slate-500'}`}>
                              {typeof tip.payout === 'number' && Number.isFinite(tip.payout)
                                ? `€${tip.payout.toLocaleString()}`
                                : '—'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 bg-black/20 border border-white/5 rounded-xl text-center flex flex-col items-center justify-center gap-3">
                     <FileText className="w-8 h-8 text-slate-600" />
                     <span className="text-slate-500 font-sans text-sm">
                       {offcanvasTipsError ?? (isMyTicketEvaluationPanel
                         ? 'No winning manual ticket at 2+0 or better for this draw.'
                         : 'No manual tickets entered for this draw.')}
                     </span>
                  </div>
                )
              ) : null}

              {!isCatalogDraw(selectedDraw)
                && selectedDraw !== null
                && selectedDraw.draw_id === ticketTargetDraw && (
                <div className="flex flex-col gap-4 rounded-xl border border-white/5 bg-black/20 p-4 sm:p-5">
                   <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <div>
                        <span className="text-white font-sans font-medium text-sm">
                          {editingTicketId === null ? 'New Ticket Entry' : 'Edit Ticket'}
                        </span>
                        {editingTicketId !== null && (
                          <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-accent-cyan">
                            Update the selected manual ticket
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                         <span className="text-xs font-mono text-slate-500">{newTicketNumbers.length}/5 Numbers</span>
                         <span className="text-slate-700">•</span>
                         <span className="text-xs font-mono text-slate-500">{newTicketCores.length}/2 Cores</span>
                      </div>
                   </div>
                   <TicketGrid
                      numbers={newTicketNumbers} 
                      cores={newTicketCores} 
                      isReadOnly={false}
                      onToggleNumber={handleToggleNumber}
                      onToggleCore={handleToggleCore}
                   />
                   {ticketSaveNotice && (
                     <div
                       role={ticketSaveNotice.tone === 'error' ? 'alert' : 'status'}
                       aria-live={ticketSaveNotice.tone === 'error' ? 'assertive' : 'polite'}
                       className={`rounded-lg border px-4 py-3 text-sm ${
                       ticketSaveNotice.tone === 'success'
                         ? 'border-emerald-400/30 bg-emerald-400/5 text-emerald-200'
                         : 'border-red-400/30 bg-red-400/5 text-red-200'
                     }`}>
                       {ticketSaveNotice.message}
                     </div>
                   )}
                   <div className="flex flex-wrap justify-end gap-2 border-t border-white/5 pt-2">
                      {editingTicketId !== null && (
                        <button
                          type="button"
                          onClick={handleCancelTicketEdit}
                          disabled={isTicketSaving}
                          className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-5 py-2 text-xs font-bold uppercase tracking-widest text-slate-300 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-accent-cyan disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                          Cancel
                        </button>
                      )}
                      <button 
                        type="button"
                        onClick={() => void handleSaveTicket()}
                        disabled={
                          isTicketSaving
                          || newTicketNumbers.length < 5
                          || newTicketCores.length < 2
                        }
                        className="btn-cyber-glass px-6 py-2 rounded text-xs font-bold font-sans transition-colors uppercase tracking-widest flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                         {isTicketSaving
                           ? <Loader2 className="w-4 h-4 animate-spin" />
                           : editingTicketId === null
                             ? <Plus className="w-4 h-4" />
                             : <Check className="w-4 h-4" />}
                         {isTicketSaving
                           ? 'Saving...'
                           : editingTicketId === null
                             ? 'Add Ticket'
                             : 'Save Changes'}
                      </button>
                   </div>
                </div>
              )}
            </section>
            )}
            
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isReportLoading || selectedReport !== null || reportError !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedReport(null);
            setReportError(null);
            setPdfError(null);
            setIsPdfDownloading(false);
          }
        }}
      >
        <DialogContent
          aria-describedby="report-dialog-description"
          className="max-w-[1120px]"
        >
          <DialogHeader className="pb-6 border-b border-white/10">
            <DialogTitle>
              {selectedReport
                ? advisorReportDialogTitle(selectedReport)
                : 'ADVISOR REPORT'}
            </DialogTitle>
            <DialogDescription id="report-dialog-description">
              {selectedReport
                ? `${selectedReport.luma_pro ? 'LUMA Pro' : selectedReport.tone} · ${selectedReport.deep_evidence ? 'Deep evidence · 3× · ' : ''}${selectedReport.quoted_credits} CR`
                : 'Loading the authenticated report.'}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto p-4 sm:p-6 lg:p-8">
            {selectedReport && (
              <div className="mb-6 flex flex-col items-start gap-3 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs font-mono uppercase tracking-widest text-slate-500">
                  PDF status: {selectedReport.pdf_status}
                </span>
              </div>
            )}
            {pdfError && (
              <div className="mb-6 rounded-lg border border-red-400/30 bg-red-400/5 px-4 py-3 text-sm text-red-200">
                {pdfError}
              </div>
            )}
            {isReportLoading ? (
              <div className="py-16 text-center text-slate-500 font-mono text-xs uppercase tracking-widest">
                Loading report...
              </div>
            ) : reportError ? (
              <div className="py-16 text-center text-red-400 font-mono text-xs uppercase tracking-widest">
                {reportError}
              </div>
            ) : selectedReport?.report_markdown ? (
              <AdvisorReportView
                markdown={selectedReport.report_markdown}
                readerSummary={selectedReport.reader_summary}
                recoveryMode={selectedReport.recovery_mode ?? null}
                pdfAction={canRequestAdvisorReportPdf(selectedReport)
                  ? {
                      status: selectedReport.pdf_status === 'ready' ? 'ready' : 'pending',
                      isDownloading: isPdfDownloading,
                      onDownload: () => void handleDownloadPdf(),
                    }
                  : undefined}
              />
            ) : (
              <div className="py-16 text-center text-slate-500 font-mono text-xs uppercase tracking-widest">
                This report has no rendered content yet.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
