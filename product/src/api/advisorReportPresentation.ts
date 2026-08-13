import type {
  AdvisorReaderHistoricalMovementItem,
  AdvisorReaderPressureSignal,
  AdvisorReportListItem,
  AdvisorRunResponse,
} from './backendData';

type AdvisorReportScope = Pick<
  AdvisorReportListItem | AdvisorRunResponse,
  'analysis_scope' | 'forecast_draw' | 'history_end_draw'
>;

export function advisorReportScopeLabel(report: AdvisorReportScope): string {
  return report.analysis_scope === 'historical'
    ? `Historical analysis through draw ${report.history_end_draw}`
    : `Forecast draw ${report.forecast_draw}`;
}

export function advisorReportDialogTitle(report: AdvisorReportScope): string {
  return report.analysis_scope === 'historical'
    ? `ADVISOR REPORT · HISTORY THROUGH DRAW ${report.history_end_draw}`
    : `ADVISOR REPORT · FORECAST DRAW ${report.forecast_draw}`;
}

export function advisorReportPdfFilename(
  report: AdvisorReportScope & Pick<AdvisorRunResponse, 'id'>,
): string {
  const scope = report.analysis_scope === 'historical'
    ? `HISTORY_TO_D${report.history_end_draw}`
    : `D${report.forecast_draw}`;
  return `LUMA_Advisor_${scope}_${report.id}.pdf`;
}

export function formatAdvisorModelMetric(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

export function formatAdvisorSignalScore(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 4,
  }).format(value);
}

export function formatAdvisorMovement(
  movement: AdvisorReaderHistoricalMovementItem,
): string {
  const percentagePoints = movement.late_minus_early_rate * 100;
  if (!Number.isFinite(percentagePoints)) return '—';
  const sign = percentagePoints > 0 ? '+' : '';
  return `${sign}${percentagePoints.toFixed(2)} pp`;
}

export function humanizeAdvisorIdentifier(value: string | null): string {
  if (!value?.trim()) return 'Unavailable';
  return value
    .trim()
    .split(/[_\s-]+/u)
    .filter(Boolean)
    .map((part) => (
      /^AX\d+$/iu.test(part)
        ? part.toUpperCase()
        : `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
    ))
    .join(' ');
}

export function advisorPressureBarWidth(
  signal: AdvisorReaderPressureSignal,
  signals: AdvisorReaderPressureSignal[],
): number {
  const score = signal.d9_release_score;
  if (score === null || !Number.isFinite(score)) return 0;
  const maximum = Math.max(
    0,
    ...signals
      .map((item) => item.d9_release_score)
      .filter((value): value is number => value !== null && Number.isFinite(value))
      .map((value) => Math.abs(value)),
  );
  if (maximum === 0) return 0;
  return Math.min(100, Math.max(6, (Math.abs(score) / maximum) * 100));
}

export function advisorSignalIsInRiskWatchlist(
  signal: AdvisorReaderPressureSignal,
): boolean {
  if (signal.risk_rank_status !== undefined && signal.risk_rank_status !== null) {
    return signal.risk_rank_status === 'HIGHER_CONTINUOUS_RISK_SCORE_WATCHLIST';
  }
  return signal.conflict_status === 'LEADING_TOXIC_RISK_OVERLAP';
}

export function advisorSignalRiskRankLabel(
  signal: AdvisorReaderPressureSignal,
): string {
  return advisorSignalIsInRiskWatchlist(signal)
    ? 'Higher risk-score watchlist'
    : 'Outside displayed watchlist';
}

export function splitAdvisorReportMarkdown(
  markdown: string,
  readerSummaryPresent: boolean,
): {
  narrativeMarkdown: string;
  technicalAuditMarkdown: string;
} {
  const normalized = markdown.trim();
  if (!normalized) {
    return { narrativeMarkdown: '', technicalAuditMarkdown: '' };
  }
  if (!readerSummaryPresent) {
    return { narrativeMarkdown: normalized, technicalAuditMarkdown: '' };
  }

  const auditHeading = /^##\s+Technical Audit Trail\s*$/imu;
  const match = auditHeading.exec(normalized);
  if (match?.index === undefined) {
    return { narrativeMarkdown: normalized, technicalAuditMarkdown: '' };
  }
  return {
    narrativeMarkdown: normalized.slice(0, match.index).trim(),
    technicalAuditMarkdown: normalized.slice(match.index).trim(),
  };
}
