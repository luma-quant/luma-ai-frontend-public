import axios from 'axios';

export class AdvisorUserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdvisorUserFacingError';
  }
}

export const ADVISOR_RELEASE_NOT_READY_MESSAGE =
  'Advisor data release is not ready yet.';

const ADVISOR_PROVIDER_COOLDOWN_FALLBACK_MS = 60_000;

const ADVISOR_MESSAGE_BY_CODE: Record<string, string> = {
  ADVISOR_NOT_READY:
    'The Advisor is still preparing the current forecast.',
  AGGREGATE_VIEW_NOT_CONFIGURED:
    'This signal layer is not available for the current forecast.',
  ANALYSIS_FAILED:
    'The analysis could not be completed. Any reserved credits were returned.',
  ANALYSIS_PROCESSING:
    'The analysis is still processing.',
  LUMA_PRO_NOT_CONFIGURED:
    'LUMA Pro is temporarily unavailable.',
  OPENAI_QA_NOT_CONFIGURED:
    'The QA audit is temporarily unavailable.',
  PDF_REPORT_NOT_CONFIGURED:
    'PDF reports are temporarily unavailable.',
  USER_CSV_UPLOADS_NOT_CONFIGURED:
    'CSV uploads are temporarily unavailable.',
  user_csv_empty:
    'This CSV is empty. Add a header row and at least one data row, then upload it again.',
  user_csv_no_accepted_rows:
    'This CSV contains no usable data rows. Check its values and column structure, then upload it again.',
  advisor_base_contract_not_found:
    'The current forecast data contract has not been published yet.',
  advisor_base_contract_not_ready:
    'The current forecast is still being validated.',
  advisor_capabilities_not_ready:
    'The Advisor is still preparing all required capabilities.',
  advisor_bigquery_disabled:
    'Signal-layer analysis is not available for the current forecast.',
  advisor_forecast_draw_not_active:
    'The active forecast changed. Reload the workspace and try again.',
  advisor_history_start_unavailable:
    'The selected history range is not available.',
  advisor_insufficient_credits:
    'There are not enough credits for this analysis.',
  advisor_run_already_active:
    'Your current analysis is still running. It has been restored below.',
  advisor_provider_failure_cooldown:
    'The previous provider attempt was refunded. Please wait one minute before starting another analysis.',
  advisor_provider_budget_exhausted:
    'The analysis could not pass its final quality review. Reserved credits were returned.',
  advisor_prompt_coverage_limitation_missing:
    'The analysis could not document every requested limitation. Reserved credits were returned.',
  advisor_qa_unavailable:
    'The QA audit is temporarily unavailable.',
  advisor_quote_expired:
    'The quote expired. Review the current price and try again.',
  advisor_quote_not_found:
    'The quote is no longer available. Request a new quote and try again.',
  advisor_quote_request_mismatch:
    'The analysis settings changed. Request a new quote and try again.',
  advisor_release_target_draw_mismatch:
    'The signal layers have not been released for the active forecast yet.',
  advisor_recent_shadow_unavailable:
    'Recent Shadow Sync is not available for this forecast.',
  advisor_release_not_ready:
    'The current forecast is still being validated across all signal layers.',
  advisor_temporal_boundary_mismatch:
    'The selected forecast and history boundary do not match.',
  advisor_toxic_pairs_unavailable:
    'Toxic Pair Exclusion is not available for this forecast.',
};

function detailCode(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value !== 'object' || value === null) return null;
  const detail = value as { code?: unknown; detail?: unknown; message?: unknown };
  for (const candidate of [detail.code, detail.detail, detail.message]) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function retryAfterHeader(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const headers = error.response?.headers;
  const value = typeof headers?.get === 'function'
    ? headers.get('retry-after')
    : headers?.['retry-after'];
  if (Array.isArray(value)) return String(value[0] ?? '').trim() || null;
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim() || null
    : null;
}

export function advisorRetryAfterMs(
  error: unknown,
  nowMs = Date.now(),
): number | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 429) {
    return null;
  }
  const raw = retryAfterHeader(error);
  if (raw !== null) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.ceil(seconds * 1_000);
    }
    const retryAtMs = Date.parse(raw);
    if (Number.isFinite(retryAtMs)) {
      return Math.max(0, retryAtMs - nowMs);
    }
  }
  return detailCode(error.response?.data?.detail)
    === 'advisor_provider_failure_cooldown'
    ? ADVISOR_PROVIDER_COOLDOWN_FALLBACK_MS
    : null;
}

export function advisorRunSubmissionRetryAfterMs(
  error: unknown,
  nowMs = Date.now(),
): number | null {
  if (!axios.isAxiosError(error)) return null;
  const method = String(error.config?.method ?? '').toLowerCase();
  const url = String(error.config?.url ?? '');
  if (
    method !== 'post'
    || !/\/api\/v1\/advisor\/runs(?:\?|$)/u.test(url)
  ) {
    return null;
  }
  return advisorRetryAfterMs(error, nowMs);
}

const ADVISOR_RELEASE_READINESS_CODES = new Set([
  'ADVISOR_NOT_READY',
  'advisor_base_contract_not_found',
  'advisor_base_contract_not_ready',
  'advisor_bigquery_disabled',
  'advisor_capabilities_not_ready',
  'advisor_forecast_draw_not_active',
  'advisor_release_not_ready',
  'advisor_release_target_draw_mismatch',
  'advisor_temporal_boundary_mismatch',
]);

export function isAdvisorReleaseReadinessCode(
  code: string | null | undefined,
): boolean {
  return Boolean(code && ADVISOR_RELEASE_READINESS_CODES.has(code));
}

export function isAdvisorReleaseReadinessConflict(
  error: unknown,
): boolean {
  if (!isAdvisorBusinessConflict(error) || !axios.isAxiosError(error)) {
    return false;
  }
  return isAdvisorReleaseReadinessCode(
    detailCode(error.response?.data?.detail),
  );
}

export function advisorCapabilityMessage(
  code: string | null | undefined,
  fallback = 'This Advisor capability is temporarily unavailable.',
): string {
  if (!code) return fallback;
  if (code.startsWith('advisor_layer_unavailable:')) {
    return 'A selected signal layer is not available for the current forecast.';
  }
  return ADVISOR_MESSAGE_BY_CODE[code] ?? fallback;
}

export function isAdvisorBusinessConflict(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 409;
}

export function isAdvisorRunAlreadyActive(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (![409, 429].includes(error.response?.status ?? 0)) return false;
  return detailCode(error.response?.data?.detail) === 'advisor_run_already_active';
}

export function advisorErrorMessage(
  error: unknown,
  fallback = 'The Advisor is temporarily unavailable.',
): string {
  if (error instanceof AdvisorUserFacingError) {
    return error.message;
  }
  if (axios.isAxiosError(error)) {
    const code = detailCode(error.response?.data?.detail);
    if (code) {
      return advisorCapabilityMessage(
        code,
        error.response?.status === 409
          ? 'These analysis settings are not currently available. Reload the workspace or adjust the selected options.'
          : fallback,
      );
    }
    if (!error.response) {
      return 'The backend could not be reached. Check the connection and try again.';
    }
    if (error.response.status === 409) {
      return 'These analysis settings are not currently available. Reload the workspace or adjust the selected options.';
    }
    return fallback;
  }
  if (error instanceof Error) {
    return advisorCapabilityMessage(error.message, fallback);
  }
  return fallback;
}
