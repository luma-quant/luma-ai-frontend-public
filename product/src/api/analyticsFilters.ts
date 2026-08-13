import type {
  AdvisorReportListItem,
  EngineUniverseDraw,
} from './backendData';
import type { TicketDrawGroup } from './ticketPresentation';

export type AnalyticsSortOrder = 'latest' | 'oldest';
export type AnalyticsDateWindow = 'all' | '7d' | '30d';
export type ReportKindFilter =
  | 'all'
  | 'pro'
  | 'standard'
  | 'expert'
  | 'analytical'
  | 'exploratory';
export type ReportScopeFilter = 'all' | 'forecast' | 'historical';

function matchesDrawQuery(drawId: number, query: string): boolean {
  const normalized = query.trim();
  return normalized.length === 0 || String(drawId).includes(normalized);
}

function isInsideDateWindow(
  value: string,
  window: AnalyticsDateWindow,
  now: Date,
): boolean {
  if (window === 'all') return true;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const days = window === '7d' ? 7 : 30;
  const lowerBoundary = now.getTime() - days * 24 * 60 * 60 * 1_000;
  return timestamp >= lowerBoundary && timestamp <= now.getTime();
}

export function filterEngineUniverseDraws(
  draws: readonly EngineUniverseDraw[],
  options: {
    query: string;
    dateWindow: AnalyticsDateWindow;
    sortOrder: AnalyticsSortOrder;
    now?: Date;
  },
): EngineUniverseDraw[] {
  const now = options.now ?? new Date();
  return draws
    .filter((draw) => (
      matchesDrawQuery(draw.draw_id, options.query)
      && isInsideDateWindow(draw.draw_date, options.dateWindow, now)
    ))
    .sort((left, right) => (
      options.sortOrder === 'latest'
        ? right.draw_id - left.draw_id
        : left.draw_id - right.draw_id
    ));
}

export function filterTicketDrawGroups(
  groups: readonly TicketDrawGroup[],
  options: {
    query: string;
    sortOrder: AnalyticsSortOrder;
  },
): TicketDrawGroup[] {
  return groups
    .filter((group) => matchesDrawQuery(group.draw_id, options.query))
    .sort((left, right) => (
      options.sortOrder === 'latest'
        ? right.draw_id - left.draw_id
        : left.draw_id - right.draw_id
    ));
}

export function filterAdvisorReports(
  reports: readonly AdvisorReportListItem[],
  options: {
    query: string;
    kind: ReportKindFilter;
    scope: ReportScopeFilter;
    dateWindow: AnalyticsDateWindow;
    sortOrder: AnalyticsSortOrder;
    now?: Date;
  },
): AdvisorReportListItem[] {
  const now = options.now ?? new Date();
  return reports
    .filter((report) => {
      const reportDraw = report.analysis_scope === 'historical'
        ? report.history_end_draw
        : report.forecast_draw;
      const kindMatches = options.kind === 'all'
        || (options.kind === 'pro'
          ? report.luma_pro
          : !report.luma_pro && report.tone === options.kind);
      const scopeMatches = options.scope === 'all'
        || report.analysis_scope === options.scope;
      return (
        matchesDrawQuery(reportDraw, options.query)
        && kindMatches
        && scopeMatches
        && isInsideDateWindow(report.completed_at, options.dateWindow, now)
      );
    })
    .sort((left, right) => {
      const leftTimestamp = Date.parse(left.completed_at);
      const rightTimestamp = Date.parse(right.completed_at);
      const safeLeft = Number.isFinite(leftTimestamp) ? leftTimestamp : 0;
      const safeRight = Number.isFinite(rightTimestamp) ? rightTimestamp : 0;
      const byTime = options.sortOrder === 'latest'
        ? safeRight - safeLeft
        : safeLeft - safeRight;
      return byTime || left.id.localeCompare(right.id);
    });
}

export function formatAnalyticsTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return 'Time unavailable';
  return timestamp.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
