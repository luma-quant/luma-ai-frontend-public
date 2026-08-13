import type {
  AdvisorAnalysisScope,
  AdvisorConfigResponse,
} from './backendData';

export type AdvisorLifecycleContract = Pick<
  AdvisorConfigResponse,
  | 'enabled'
  | 'active_forecast_draw'
  | 'pending_forecast_draw'
  | 'lifecycle_status'
  | 'unavailable_reason'
  | 'historical_analysis_available'
  | 'latest_history_draw'
  | 'historical_anchor_draw'
  | 'forecast_analysis_available'
>;

export function isAdvisorForecastPreparing(
  lifecycle: AdvisorLifecycleContract | null | undefined,
): boolean {
  return lifecycle?.lifecycle_status === 'WAITING_FOR_NEXT_RELEASE'
    && lifecycle.active_forecast_draw === null
    && lifecycle.pending_forecast_draw !== null;
}

export function advisorForecastPreparationMessage(
  lifecycle: AdvisorLifecycleContract | null | undefined,
): string | null {
  if (!isAdvisorForecastPreparing(lifecycle)) return null;
  return `Forecast D${lifecycle?.pending_forecast_draw} is being prepared`;
}

export function advisorHeaderDrawLabel(
  lifecycle: AdvisorLifecycleContract | null | undefined,
): string {
  if (isAdvisorForecastPreparing(lifecycle)) {
    return `DRAW ${lifecycle?.pending_forecast_draw} \u00b7 PREPARING`;
  }
  if (
    lifecycle?.lifecycle_status === 'ACTIVE'
    && lifecycle.active_forecast_draw !== null
  ) {
    return `DRAW ${lifecycle.active_forecast_draw}`;
  }
  return 'DRAW UNAVAILABLE';
}

export function isAdvisorLifecycleBlocked(
  lifecycle: AdvisorLifecycleContract | null | undefined,
): boolean {
  return lifecycle !== undefined
    && lifecycle !== null
    && !isAdvisorForecastAnalysisAvailable(lifecycle)
    && !isAdvisorHistoricalAnalysisAvailable(lifecycle);
}

export function advisorHistoricalHistoryEnd(
  lifecycle: AdvisorLifecycleContract | null | undefined,
): number | null {
  const latestHistoryDraw = lifecycle?.latest_history_draw;
  const historicalAnchorDraw = lifecycle?.historical_anchor_draw;
  if (
    !Number.isInteger(latestHistoryDraw)
    || Number(latestHistoryDraw) < 1
    || !Number.isInteger(historicalAnchorDraw)
    || Number(historicalAnchorDraw) < 1
    || Number(historicalAnchorDraw) !== Number(latestHistoryDraw) + 1
  ) {
    return null;
  }
  return Number(latestHistoryDraw);
}

export function isAdvisorForecastAnalysisAvailable(
  lifecycle: AdvisorLifecycleContract | null | undefined,
): boolean {
  return Boolean(
    lifecycle?.enabled
    && lifecycle.forecast_analysis_available
    && lifecycle.lifecycle_status === 'ACTIVE'
    && Number.isInteger(lifecycle.active_forecast_draw)
    && Number(lifecycle.active_forecast_draw) > 0,
  );
}

export function isAdvisorHistoricalAnalysisAvailable(
  lifecycle: AdvisorLifecycleContract | null | undefined,
): boolean {
  return Boolean(
    lifecycle?.enabled
    && lifecycle.historical_analysis_available
    && advisorHistoricalHistoryEnd(lifecycle) !== null,
  );
}

export function isAdvisorAnalysisScopeBlocked(
  lifecycle: AdvisorLifecycleContract | null | undefined,
  scope: AdvisorAnalysisScope,
): boolean {
  if (lifecycle === undefined || lifecycle === null) return false;
  return scope === 'forecast'
    ? !isAdvisorForecastAnalysisAvailable(lifecycle)
    : !isAdvisorHistoricalAnalysisAvailable(lifecycle);
}

export function advisorAnalysisBoundaryDraw(
  lifecycle: AdvisorLifecycleContract | null | undefined,
  scope: AdvisorAnalysisScope,
): number | null {
  if (scope === 'forecast') {
    return isAdvisorForecastAnalysisAvailable(lifecycle)
      ? Number(lifecycle?.active_forecast_draw)
      : null;
  }
  return isAdvisorHistoricalAnalysisAvailable(lifecycle)
    ? Number(lifecycle?.historical_anchor_draw)
    : null;
}

export function resolveAdvisorAnalysisScope(
  lifecycle: AdvisorLifecycleContract,
  requestedScope: AdvisorAnalysisScope,
): AdvisorAnalysisScope {
  if (
    requestedScope === 'forecast'
      ? isAdvisorForecastAnalysisAvailable(lifecycle)
      : isAdvisorHistoricalAnalysisAvailable(lifecycle)
  ) {
    return requestedScope;
  }
  if (isAdvisorForecastAnalysisAvailable(lifecycle)) return 'forecast';
  return 'historical';
}
