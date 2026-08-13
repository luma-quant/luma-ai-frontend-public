import {
  Activity,
  AlertTriangle,
  BarChart3,
  Download,
  FileText,
  Info,
  Layers3,
  Loader2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import type {
  AdvisorReaderDistributionEntry,
  AdvisorReaderNumberGroup,
  AdvisorReaderNumberGroupId,
  AdvisorReaderFrequencyRank,
  AdvisorReaderMetricRange,
  AdvisorRecoveryMode,
  AdvisorReaderSummary,
} from '../api/backendData';
import {
  advisorPressureBarWidth,
  advisorSignalIsInRiskWatchlist,
  advisorSignalRiskRankLabel,
  formatAdvisorModelMetric,
  formatAdvisorMovement,
  formatAdvisorSignalScore,
  humanizeAdvisorIdentifier,
  splitAdvisorReportMarkdown,
} from '../api/advisorReportPresentation';
import { AdvisorReportMarkdown } from './AdvisorReportMarkdown';

interface AdvisorReportPdfAction {
  status: 'pending' | 'ready';
  isDownloading: boolean;
  onDownload: () => void;
}

interface AdvisorReportViewProps {
  markdown: string;
  readerSummary?: AdvisorReaderSummary | null;
  recoveryMode?: AdvisorRecoveryMode | null;
  pdfAction?: AdvisorReportPdfAction;
}

const GROUP_ORDER: AdvisorReaderNumberGroupId[] = [
  'PRESSURE_OUTSIDE_LEADING_CONFLICT',
  'EMERGING_CHANGE',
  'CONFLICTED_PRESSURE',
  'NEUTRAL_BASELINE_USER_SELECTED',
];

const GROUP_ACCENTS: Record<AdvisorReaderNumberGroupId, string> = {
  PRESSURE_OUTSIDE_LEADING_CONFLICT: 'border-cyan-400/25 bg-cyan-400/[0.04]',
  EMERGING_CHANGE: 'border-sky-400/25 bg-sky-400/[0.04]',
  CONFLICTED_PRESSURE: 'border-amber-300/25 bg-amber-300/[0.04]',
  NEUTRAL_BASELINE_USER_SELECTED: 'border-white/10 bg-white/[0.02]',
};

const GUIDE_LABELS: Record<AdvisorReaderNumberGroupId, string> = {
  PRESSURE_OUTSIDE_LEADING_CONFLICT: 'Pressure outside displayed watchlist',
  EMERGING_CHANGE: 'Emerging change',
  CONFLICTED_PRESSURE: 'Pressure on higher risk-score watchlist',
  NEUTRAL_BASELINE_USER_SELECTED: 'User-selected neutral baseline',
};

const GROUP_TITLES: Record<AdvisorReaderNumberGroupId, string> = {
  PRESSURE_OUTSIDE_LEADING_CONFLICT: 'Pressure outside displayed watchlist',
  EMERGING_CHANGE: 'Emerging change',
  CONFLICTED_PRESSURE: 'Pressure on higher risk-score watchlist',
  NEUTRAL_BASELINE_USER_SELECTED: 'User-selected neutral baseline',
};

const GROUP_EXPLANATIONS: Partial<Record<AdvisorReaderNumberGroupId, string>> = {
  PRESSURE_OUTSIDE_LEADING_CONFLICT:
    'Release-ranked signals outside the displayed higher continuous risk-score watchlist. This is not a binary quality classification.',
  CONFLICTED_PRESSURE:
    'Release-ranked signals that also appear in the displayed higher continuous risk-score watchlist. Use this as caution evidence, not as an exclusion rule.',
};

function groupsById(
  groups: AdvisorReaderNumberGroup[],
): Map<AdvisorReaderNumberGroupId, AdvisorReaderNumberGroup> {
  return new Map(groups.map((group) => [group.group_id, group]));
}

function NumberGroupCard({ group }: { group: AdvisorReaderNumberGroup }) {
  const title = GROUP_TITLES[group.group_id];
  const explanation = GROUP_EXPLANATIONS[group.group_id] ?? group.explanation;
  return (
    <article className={`rounded-xl border p-4 ${GROUP_ACCENTS[group.group_id]}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h4 className="text-sm font-medium text-text-primary">{title}</h4>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
          {group.status === 'AVAILABLE' ? `${group.numbers.length} signals` : 'Unavailable'}
        </span>
      </div>
      {group.numbers.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2" aria-label={`${title} numbers`}>
          {group.numbers.map((number) => (
            <span
              key={number}
              className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-2 font-mono text-sm font-bold text-cyan-100"
            >
              {number}
            </span>
          ))}
        </div>
      ) : (
        <p className="mb-3 rounded-lg border border-dashed border-white/10 px-3 py-2 text-xs text-text-muted">
          No numbers supplied by approved data.
        </p>
      )}
      <p className="text-xs leading-relaxed text-text-secondary">{explanation}</p>
    </article>
  );
}

function FrequencyRanking({
  title,
  items,
  limit,
}: {
  title: string;
  items: AdvisorReaderFrequencyRank[];
  limit: number;
}) {
  const displayedItems = items.slice(0, limit);
  const maximum = Math.max(0, ...displayedItems.map((item) => item.count));
  return (
    <div>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">{title}</div>
      {displayedItems.length > 0 ? (
        <div className="space-y-2">
          {displayedItems.map((item) => (
            <div key={`${title}-${item.number}`} className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2">
              <span className="font-mono text-xs font-bold text-cyan-100">{item.number}</span>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0A8CFF] to-[#27D8FF]"
                  style={{ width: `${maximum > 0 ? Math.max(6, (item.count / maximum) * 100) : 0}%` }}
                />
              </div>
              <span className="text-right font-mono text-[10px] text-text-secondary">{item.count}×</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-muted">No frequency ranking is available.</p>
      )}
    </div>
  );
}

function DistributionRanking({
  title,
  items,
}: {
  title: string;
  items: AdvisorReaderDistributionEntry[];
}) {
  if (items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const maximum = Math.max(0, ...items.map((item) => item.count));
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-text-muted">{title}</div>
      <div className="space-y-2.5">
        {items.map((item) => (
          <div key={`${title}-${item.value}`}>
            <div className="mb-1 flex items-center justify-between gap-3 text-[10px]">
              <span className="min-w-0 truncate font-medium text-text-secondary" title={item.value}>
                {humanizeAdvisorIdentifier(item.value)}
              </span>
              <span className="shrink-0 font-mono text-cyan-100">
                {item.count.toLocaleString('en-US')}
                {total > 0 ? ` · ${Math.round((item.count / total) * 100)}%` : ''}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#0A8CFF] to-[#27D8FF]"
                style={{ width: `${maximum > 0 ? Math.max(4, (item.count / maximum) * 100) : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricRangeCard({
  title,
  range,
}: {
  title: string;
  range: AdvisorReaderMetricRange;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-text-muted">{title}</div>
      <div className="grid grid-cols-3 gap-2">
        {([
          ['Min', range.minimum],
          ['Mean', range.mean],
          ['Max', range.maximum],
        ] as const).map(([label, value]) => (
          <div key={label}>
            <div className="font-mono text-sm font-bold text-cyan-100">
              {formatAdvisorSignalScore(value)}
            </div>
            <div className="mt-0.5 text-[8px] uppercase tracking-widest text-text-muted">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReaderSummaryView({ summary }: { summary: AdvisorReaderSummary }) {
  const boundary = summary.forecast_boundary;
  const historicalMode = boundary.analysis_scope === 'historical';
  const model = summary.model_state;
  const groupMap = groupsById(summary.number_groups);
  const history = summary.historical_movement;
  const coverage = summary.data_coverage;
  const pressurePool = groupMap.get('PRESSURE_OUTSIDE_LEADING_CONFLICT');
  const emergingPool = groupMap.get('EMERGING_CHANGE');
  const riskPool = groupMap.get('CONFLICTED_PRESSURE');
  const pressureNumbers = pressurePool?.status === 'AVAILABLE' ? pressurePool.numbers : [];
  const emergingNumbers = emergingPool?.status === 'AVAILABLE' ? emergingPool.numbers : [];
  const riskNumbers = riskPool?.status === 'AVAILABLE' ? riskPool.numbers : [];
  const ghostNumbers = summary.ghost_cluster?.numbers ?? [];
  const historicalRisingNumbers = history.status === 'AVAILABLE'
    ? history.rising_main_numbers.map((item) => item.number)
    : [];
  const historicalFallingNumbers = history.status === 'AVAILABLE'
    ? history.falling_main_numbers.map((item) => item.number)
    : [];
  const scenarioBriefs = (historicalMode
    ? [
        historicalRisingNumbers.length > 0 && historicalFallingNumbers.length > 0
          ? {
              title: 'Historical movement contrast',
              purpose: 'Compare rising and falling early/late movement as descriptive history. Movement direction is not a forecast instruction.',
              lanes: [
                ['Rising historical movement', historicalRisingNumbers],
                ['Falling historical movement', historicalFallingNumbers],
              ] as const,
            }
          : null,
      ]
    : [
        pressureNumbers.length > 0 && emergingNumbers.length > 0 && ghostNumbers.length > 0
          ? {
              title: 'Cross-lane comparison',
              purpose: 'Compare the same independent shortlist against release, change and subtle-pressure evidence while keeping agreement and disagreement visible.',
              lanes: [
                ['Release pressure', pressureNumbers],
                ['Emerging change', emergingNumbers],
                ['Ghost / subtle pressure', ghostNumbers],
              ] as const,
            }
          : null,
        pressureNumbers.length > 0 && riskNumbers.length > 0
          ? {
              title: 'Risk-overlap stress test',
              purpose: 'Test how your shortlist changes when a higher risk-score pressure signal is included. This lane is counter-evidence, not an exclusion rule.',
              lanes: [
                ['Release pressure', pressureNumbers],
                ['Higher risk-score watchlist', riskNumbers],
              ] as const,
            }
          : null,
        pressureNumbers.length > 0 && emergingNumbers.length > 0
          ? {
              title: 'Rotation contrast',
              purpose: 'Contrast established release pressure with emerging-change evidence without converting either lane into probability.',
              lanes: [
                ['Release pressure', pressureNumbers],
                ['Emerging change', emergingNumbers],
              ] as const,
            }
          : null,
        pressureNumbers.length > 0 && ghostNumbers.length > 0
          ? {
              title: 'Subtle-pressure contrast',
              purpose: 'Compare visible release evidence with the separate subtle pressure-board signal; neither lane overrides the other.',
              lanes: [
                ['Release pressure', pressureNumbers],
                ['Ghost / subtle pressure', ghostNumbers],
              ] as const,
            }
          : null,
      ]).filter((item): item is NonNullable<typeof item> => item !== null);
  const uploadedStarEvidence = summary.customer_csv_analysis?.ranked_star_number_frequencies ?? [];
  const riskSemanticsNotice = summary.risk_semantics
    ? `Risk is shown as a continuous model ranking. This run displays ${summary.risk_semantics.displayed_watchlist_size} signal${summary.risk_semantics.displayed_watchlist_size === 1 ? '' : 's'} on the higher risk-score watchlist. It does not create a binary classification or identify winning probabilities.`
    : 'Risk is shown as a continuous model ranking. The displayed watchlist does not create a binary classification or identify winning probabilities.';

  return (
    <div className="space-y-6" data-advisor-reader-summary>
      <section className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[0.08] via-sky-400/[0.035] to-transparent p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-cyan-200">
              <Activity className="h-4 w-4" />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Standard Data Contract V8.1 · The situation</span>
            </div>
            <h2 className="text-2xl font-display text-text-primary">
              {historicalMode
                ? `Historical analysis through D${boundary.history_end_draw}`
                : `Forecast D${boundary.forecast_draw}`}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              {historicalMode ? (
                <>This report uses verified closed-draw evidence from the selected history through D{boundary.history_end_draw}. It does not evaluate a forecast target.</>
              ) : (
                <>Evidence is bounded through {boundary.data_cutoff_draw === null ? 'an unavailable cutoff' : `D${boundary.data_cutoff_draw}`}. The forecast outcome {boundary.forecast_outcome_used ? 'was used' : 'was not used'} in this analysis.</>
              )}
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[320px]">
            <div className="rounded-xl border border-white/10 bg-black/15 p-3">
              <div className="text-[10px] uppercase tracking-widest text-text-muted">Model confidence</div>
              <div className="mt-1 font-mono text-lg font-bold text-cyan-100">
                {formatAdvisorModelMetric(model.confidence)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/15 p-3">
              <div className="text-[10px] uppercase tracking-widest text-text-muted">Model uncertainty</div>
              <div className="mt-1 font-mono text-lg font-bold text-sky-100">
                {formatAdvisorModelMetric(model.uncertainty)}
              </div>
            </div>
            <p className="col-span-2 flex items-start gap-2 rounded-lg border border-sky-300/15 bg-sky-300/[0.04] px-3 py-2 text-[11px] leading-relaxed text-sky-100/80">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              These are internal model-state values, not winning probabilities.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-text-muted">Primary family</span>
            <p className="mt-1 text-sm font-medium text-text-primary">{humanizeAdvisorIdentifier(model.primary_family)}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-widest text-text-muted">Secondary family</span>
            <p className="mt-1 text-sm font-medium text-text-primary">{humanizeAdvisorIdentifier(model.secondary_family)}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="reader-number-pools">
        <div className="mb-3 flex items-center gap-2">
          <Layers3 className="h-4 w-4 text-accent-cyan" />
          <h3 id="reader-number-pools" className="text-base font-display text-text-primary">Number signal pools</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {GROUP_ORDER.map((groupId) => {
            const group = groupMap.get(groupId);
            return group ? <NumberGroupCard key={groupId} group={group} /> : null;
          })}
        </div>
      </section>

      <section aria-labelledby="reader-scenario-brief" className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[0.06] via-[#0A8CFF]/[0.025] to-transparent p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-accent-cyan" />
          <div>
            <h3 id="reader-scenario-brief" className="text-base font-display text-text-primary">Scenario Construction Brief</h3>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-text-secondary">
              These are evidence-comparison templates, not generated tickets. Use only the lanes shown as available; final numbers, counts and proportions remain entirely your choice.
            </p>
          </div>
        </div>
        {scenarioBriefs.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {scenarioBriefs.map((brief) => (
              <article key={brief.title} className="rounded-xl border border-white/10 bg-black/15 p-3.5">
                <h4 className="text-sm font-medium text-text-primary">{brief.title}</h4>
                <p className="mt-1.5 text-[11px] leading-relaxed text-text-secondary">{brief.purpose}</p>
                <div className="mt-3 space-y-2">
                  {brief.lanes.map(([label, numbers]) => (
                    <div key={`${brief.title}-${label}`} className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 font-mono text-[9px] uppercase tracking-wider text-text-muted">{label}</span>
                      {numbers.map((number) => (
                        <span key={`${brief.title}-${label}-${number}`} className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-300/[0.07] px-1.5 font-mono text-xs font-bold text-cyan-100">
                          {number}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-white/10 px-3 py-2 text-xs text-text-muted">
            No multi-lane comparison frame is supported by the evidence available in this run, so LUMA does not invent one.
          </p>
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2.5 text-[11px] leading-relaxed text-text-secondary">
            <strong className="text-text-primary">Star handling:</strong>{' '}
            {uploadedStarEvidence.length > 0
              ? 'The uploaded portfolio contains descriptive star-frequency evidence. Use it to audit concentration only; it is not forecast authority.'
              : 'No approved star-selection evidence is available in this brief. LUMA leaves star choices open instead of inventing a neutral distribution.'}
          </div>
          <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2.5 text-[11px] leading-relaxed text-text-secondary">
            <strong className="text-text-primary">Portfolio cross-check:</strong>{' '}
            {summary.customer_csv_analysis
              ? 'Compare the visible lanes with the uploaded portfolio aggregates below. Raw rows are not exposed and structural overlap is not a performance forecast.'
              : 'No uploaded portfolio was supplied, so no portfolio concentration or overlap cross-check is claimed.'}
          </div>
        </div>
      </section>

      {!historicalMode && <section aria-labelledby="reader-selection-path" className="overflow-hidden rounded-2xl border border-sky-300/20 bg-gradient-to-r from-[#0A8CFF]/[0.08] via-cyan-300/[0.035] to-transparent p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-sky-200" />
          <h3 id="reader-selection-path" className="text-base font-display text-text-primary">Build your own evidence shortlist</h3>
        </div>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-text-secondary">
          Move through the evidence in four clear steps. LUMA supplies the comparison lanes; you keep control of every final number and proportion.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['01 · Compare', 'Start with the release-pressure set and compare its model-relative scores.'],
            ['02 · Explore', 'Contrast emerging-change signals with that foundation to explore a different structure.'],
            ['03 · Stress-test', 'Review continuous risk and overfit values before using a higher-risk pressure signal.'],
            ['04 · Decide', 'Use the relative balance as context only; the final shortlist and proportions remain yours.'],
          ].map(([title, detail]) => (
            <div key={title} className="rounded-xl border border-white/10 bg-black/15 p-3">
              <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-100">{title}</div>
              <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">{detail}</p>
            </div>
          ))}
        </div>
      </section>}

      <section aria-labelledby="reader-pressure-ranking" className="rounded-2xl border border-white/10 bg-black/10 p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-accent-cyan" />
            <h3 id="reader-pressure-ranking" className="text-base font-display text-text-primary">Pressure signal ranking</h3>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-text-muted">Model-relative scores · not probabilities</span>
        </div>
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-sky-300/15 bg-sky-300/[0.035] px-3 py-2 text-[11px] leading-relaxed text-sky-100/80">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {riskSemanticsNotice}
        </p>
        {summary.ranked_pressure_signals.length > 0 ? (
          <div className="space-y-3">
            {summary.ranked_pressure_signals.map((signal) => {
              const watchlisted = advisorSignalIsInRiskWatchlist(signal);
              return (
                <div key={`${signal.rank}-${signal.number}`} className="grid grid-cols-[2.75rem_1fr] items-center gap-3 sm:grid-cols-[3.5rem_1fr_auto]">
                  <div className="font-mono text-sm font-bold text-cyan-100">#{signal.rank} · {signal.number}</div>
                  <div>
                    <div className="relative h-8 overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
                      <div
                        className="h-full rounded-lg bg-gradient-to-r from-[#0A8CFF]/65 to-[#27D8FF]/90 shadow-[0_0_18px_rgba(39,216,255,0.18)]"
                        style={{ width: `${advisorPressureBarWidth(signal, summary.ranked_pressure_signals)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px] text-text-secondary">
                      <span>Release <strong className="text-cyan-100">{formatAdvisorSignalScore(signal.d9_release_score)}</strong></span>
                      <span>Physics <strong className="text-cyan-100">{formatAdvisorSignalScore(signal.d9_physics_score ?? null)}</strong></span>
                      <span>Risk <strong className="text-amber-100">{formatAdvisorSignalScore(signal.d9_toxicity_score)}</strong></span>
                      <span>Overfit <strong className="text-amber-100">{formatAdvisorSignalScore(signal.d9_overfit_risk)}</strong></span>
                    </div>
                  </div>
                  <div className="col-start-2 flex min-w-[8rem] flex-wrap items-center gap-1.5 sm:col-start-auto sm:justify-end">
                    {watchlisted ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-100">
                        <AlertTriangle className="h-3 w-3" /> {advisorSignalRiskRankLabel(signal)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-cyan-100">
                        <Info className="h-3 w-3" /> {advisorSignalRiskRankLabel(signal)}
                      </span>
                    )}
                    {signal.toxic_high_negative_flag === true && (
                      <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-100">
                        Explicit engine flag
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-text-muted">No ranked pressure signals are available for this run.</p>
        )}
      </section>

      {summary.relative_evidence_balance ? (
        <section aria-labelledby="reader-evidence-balance" className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.035] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-sky-200" />
            <div>
              <h3 id="reader-evidence-balance" className="text-base font-display text-text-primary">Relative Evidence Balance</h3>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                {summary.relative_evidence_balance.explanation}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-sky-100/80">
                Shares normalize the approved D9 release scores across the displayed numbers. They sum to 100% of this evidence set and are neither winning probabilities nor a prescribed ticket ratio.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2.5">
            {summary.relative_evidence_balance.entries.map((entry) => (
              <div key={entry.number} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 rounded-lg border border-white/10 bg-black/15 px-3 py-2">
                <span className="font-mono text-sm font-bold text-cyan-100">#{entry.rank} · {entry.number}</span>
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#0A8CFF] to-[#27D8FF]"
                      style={{ width: `${Math.min(100, Math.max(0, entry.relative_evidence_share_percent))}%` }}
                    />
                  </div>
                  <div className="mt-1 font-mono text-[9px] text-text-muted">
                    Release {formatAdvisorSignalScore(entry.d9_release_score)}
                  </div>
                </div>
                <span className="font-mono text-sm font-bold text-sky-100">
                  {formatAdvisorSignalScore(entry.relative_evidence_share_percent)}%
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : summary.signal_exposure_guide ? (
        <section aria-labelledby="reader-exposure-guide" className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
            <div>
              <h3 id="reader-exposure-guide" className="text-base font-display text-text-primary">Legacy application guide</h3>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                Preserved for an older immutable report. It is not a current data-derived mix, a winning-odds model, or automatic ticket generation.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {summary.signal_exposure_guide.allocations.map((allocation) => {
              const value = allocation.maximum_percent === null
                ? `${allocation.orientation_percent ?? 0}%`
                : `max ${allocation.maximum_percent}%`;
              return (
                <div key={allocation.group_id} className="rounded-xl border border-white/10 bg-black/15 p-3">
                  <div className="font-mono text-lg font-bold text-text-secondary">{value}</div>
                  <div className="mt-1 text-xs leading-snug text-text-muted">{GUIDE_LABELS[allocation.group_id]}</div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
            <div>
              <h3 className="text-base font-display text-text-primary">Relative Evidence Balance unavailable</h3>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                No approved data-derived balance is available for this report, so LUMA does not invent a selection ratio.
              </p>
            </div>
          </div>
        </section>
      )}

      {summary.customer_csv_analysis && (
        <section aria-labelledby="reader-csv-analysis" className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.025] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-accent-cyan" />
                <h3 id="reader-csv-analysis" className="text-base font-display text-text-primary">Uploaded ticket structure</h3>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                {summary.customer_csv_analysis.interpretation}
              </p>
            </div>
            <span className="w-fit rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-cyan-100">
              {summary.customer_csv_analysis.status}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Accepted', summary.customer_csv_analysis.accepted_row_count],
              ['Valid', summary.customer_csv_analysis.valid_ticket_count],
              ['Invalid', summary.customer_csv_analysis.invalid_ticket_count],
              ['Unique', summary.customer_csv_analysis.unique_ticket_count],
              ['Duplicates', summary.customer_csv_analysis.duplicate_ticket_count],
              ['Top-20 set', summary.customer_csv_analysis.top20_member_count],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-white/10 bg-black/15 p-3">
                <div className="font-mono text-lg font-bold text-cyan-100">{value ?? '—'}</div>
                <div className="mt-1 text-[9px] uppercase tracking-widest text-text-muted">{label}</div>
              </div>
            ))}
          </div>

          {summary.customer_csv_analysis.distinct_coverage && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                <div className="font-mono text-lg font-bold text-cyan-100">
                  {summary.customer_csv_analysis.distinct_coverage.main_numbers_observed ?? '—'}
                  {summary.customer_csv_analysis.distinct_coverage.main_number_domain_size !== null
                    ? ` / ${summary.customer_csv_analysis.distinct_coverage.main_number_domain_size}`
                    : ''}
                </div>
                <div className="mt-1 text-[9px] uppercase tracking-widest text-text-muted">Distinct main-number coverage</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                <div className="font-mono text-lg font-bold text-cyan-100">
                  {summary.customer_csv_analysis.distinct_coverage.star_numbers_observed ?? '—'}
                  {summary.customer_csv_analysis.distinct_coverage.star_number_domain_size !== null
                    ? ` / ${summary.customer_csv_analysis.distinct_coverage.star_number_domain_size}`
                    : ''}
                </div>
                <div className="mt-1 text-[9px] uppercase tracking-widest text-text-muted">Distinct star-number coverage</div>
              </div>
            </div>
          )}

          {[
            summary.customer_csv_analysis.selection_arm_distribution ?? [],
            summary.customer_csv_analysis.score_band_distribution ?? [],
            summary.customer_csv_analysis.mode_distribution ?? [],
          ].some((items) => items.length > 0) && (
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <DistributionRanking
                title="Selection-arm mix"
                items={summary.customer_csv_analysis.selection_arm_distribution ?? []}
              />
              <DistributionRanking
                title="Score-band mix"
                items={summary.customer_csv_analysis.score_band_distribution ?? []}
              />
              <DistributionRanking
                title="Mode mix"
                items={summary.customer_csv_analysis.mode_distribution ?? []}
              />
            </div>
          )}

          {[
            summary.customer_csv_analysis.odd_main_count_distribution ?? [],
            summary.customer_csv_analysis.consecutive_pair_count_distribution ?? [],
          ].some((items) => items.length > 0) && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <DistributionRanking
                title="Odd main-number count"
                items={summary.customer_csv_analysis.odd_main_count_distribution ?? []}
              />
              <DistributionRanking
                title="Consecutive-pair count"
                items={summary.customer_csv_analysis.consecutive_pair_count_distribution ?? []}
              />
            </div>
          )}

          {(summary.customer_csv_analysis.main_sum_summary
            || (summary.customer_csv_analysis.numeric_summaries ?? []).length > 0) && (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {summary.customer_csv_analysis.main_sum_summary && (
                <MetricRangeCard title="Main-number sum" range={summary.customer_csv_analysis.main_sum_summary} />
              )}
              {(summary.customer_csv_analysis.numeric_summaries ?? []).map((metric) => (
                <MetricRangeCard key={metric.metric} title={metric.label} range={metric} />
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-5 border-t border-white/10 pt-4 md:grid-cols-2">
            <FrequencyRanking
              title="Top main-number frequency in upload"
              items={summary.customer_csv_analysis.ranked_main_number_frequencies}
              limit={8}
            />
            <FrequencyRanking
              title="Top star-number frequency in upload"
              items={summary.customer_csv_analysis.ranked_star_number_frequencies}
              limit={6}
            />
          </div>

          <p className="mt-4 flex items-start gap-2 rounded-lg border border-sky-300/15 bg-sky-300/[0.035] px-3 py-2 text-[11px] leading-relaxed text-sky-100/80">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {summary.customer_csv_analysis.realized_performance_included
              ? 'Approved realized-performance evidence is included; this frequency view still describes structural composition, not future draw odds.'
              : 'Structural composition only — realized performance is not available before draw results/backtest.'}
          </p>
        </section>
      )}

      <section aria-labelledby="reader-coverage" className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2">
            {history.status === 'AVAILABLE'
              ? <Activity className="h-4 w-4 text-accent-cyan" />
              : <AlertTriangle className="h-4 w-4 text-amber-200" />}
            <h3 id="reader-coverage" className="text-sm font-medium text-text-primary">Historical movement</h3>
          </div>
          {history.status === 'AVAILABLE' ? (
            <>
              <p className="text-xs text-text-secondary">
                D{history.requested_start_draw ?? '—'}–D{history.requested_end_draw ?? '—'} · {history.draw_count ?? '—'} draws
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center gap-1 text-[10px] uppercase tracking-widest text-cyan-100"><TrendingUp className="h-3 w-3" /> Rising</div>
                  <div className="flex flex-wrap gap-1.5">
                    {history.rising_main_numbers.length > 0 ? history.rising_main_numbers.map((item) => (
                      <span key={item.number} className="rounded border border-cyan-300/20 bg-cyan-300/[0.06] px-2 py-1 font-mono text-[10px] text-cyan-100">
                        {item.number} · {formatAdvisorMovement(item)}
                      </span>
                    )) : <span className="text-xs text-text-muted">None supplied</span>}
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-1 text-[10px] uppercase tracking-widest text-sky-100"><TrendingDown className="h-3 w-3" /> Falling</div>
                  <div className="flex flex-wrap gap-1.5">
                    {history.falling_main_numbers.length > 0 ? history.falling_main_numbers.map((item) => (
                      <span key={item.number} className="rounded border border-sky-300/20 bg-sky-300/[0.05] px-2 py-1 font-mono text-[10px] text-sky-100">
                        {item.number} · {formatAdvisorMovement(item)}
                      </span>
                    )) : <span className="text-xs text-text-muted">None supplied</span>}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs leading-relaxed text-text-secondary">{history.reason}</p>
          )}
        </article>

        <article className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-accent-cyan" />
            <h3 className="text-sm font-medium text-text-primary">Data coverage</h3>
          </div>
          <div className="grid gap-2 text-xs text-text-secondary">
            <p>
              Signal layers: {coverage.selected_signal_layers.length} selected
              {coverage.unavailable_selected_signal_layers.length > 0
                ? ` · ${coverage.unavailable_selected_signal_layers.length} unavailable or limited`
                : coverage.selected_signal_layers.length > 0 ? ' · usable status reported' : ''}
            </p>
            <p>
              Customer CSV: {coverage.customer_csv.selected
                ? coverage.customer_csv.status.toLowerCase().replaceAll('_', ' ')
                : 'not selected'} · raw rows were not shared with the model
            </p>
          </div>
          {coverage.modules.length > 0 && (
            <details className="mt-3 rounded-lg border border-white/10 bg-black/10 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan">
                Source module coverage ({coverage.modules.length})
              </summary>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {coverage.modules.map((module) => (
                  <span key={module.module} className="rounded border border-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-text-muted">
                    {module.module.replaceAll('_', ' ')} · {module.status.replaceAll('_', ' ')}
                  </span>
                ))}
              </div>
            </details>
          )}
        </article>
      </section>
    </div>
  );
}

export const AdvisorReportView = ({
  markdown,
  readerSummary = null,
  recoveryMode = null,
  pdfAction,
}: AdvisorReportViewProps) => {
  const parts = splitAdvisorReportMarkdown(markdown, readerSummary !== null);
  return (
    <div className="space-y-7">
      {recoveryMode === 'SAFE_EVIDENCE_FALLBACK' && (
        <section
          role="status"
          aria-label="Evidence-safe report completion"
          className="rounded-xl border border-cyan-300/25 bg-cyan-300/[0.045] px-4 py-3.5 text-cyan-50"
        >
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-cyan" />
            <div>
              <h2 className="text-sm font-medium text-text-primary">
                Evidence-safe report completed
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                LUMA completed the verified evidence sections. Narrative that did not pass the final quality review was withheld, so the report below remains limited to approved, source-bound data.
              </p>
            </div>
          </div>
        </section>
      )}

      {pdfAction && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={pdfAction.onDownload}
            disabled={pdfAction.isDownloading}
            className="btn-cyber-glass inline-flex min-h-[42px] items-center gap-2 rounded-lg px-4 text-xs font-bold uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pdfAction.isDownloading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />}
            {pdfAction.isDownloading
              ? 'Preparing PDF...'
              : pdfAction.status === 'pending'
                ? 'Generate & Download PDF'
                : 'Download PDF'}
          </button>
        </div>
      )}

      {readerSummary && <ReaderSummaryView summary={readerSummary} />}

      {parts.narrativeMarkdown && (
        <section className={readerSummary ? 'border-t border-white/10 pt-6' : undefined}>
          {readerSummary && (
            <h2 className="mb-5 text-lg font-display text-text-primary">Report narrative</h2>
          )}
          <AdvisorReportMarkdown markdown={parts.narrativeMarkdown} />
        </section>
      )}

      {readerSummary && parts.technicalAuditMarkdown && (
        <details className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">
          <summary className="cursor-pointer font-mono text-xs font-bold uppercase tracking-widest text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan">
            Technical Audit Trail
          </summary>
          <div className="mt-5 border-t border-white/10 pt-5">
            <AdvisorReportMarkdown markdown={parts.technicalAuditMarkdown} />
          </div>
        </details>
      )}
    </div>
  );
};
