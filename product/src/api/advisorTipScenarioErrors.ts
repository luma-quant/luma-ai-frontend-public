import axios from 'axios';

const QUOTE_RATE_LIMIT_FALLBACK_MS = 60_000;

export const ADVISOR_TIP_SCENARIO_MESSAGE_BY_CODE: Readonly<
  Record<string, string>
> = {
  advisor_tip_invalid_user_id:
    'Your session is no longer valid. Sign in again before creating AI tickets.',
  advisor_tip_user_not_found:
    'Your account could not be verified. Sign in again before creating AI tickets.',
  advisor_tip_source_report_not_found:
    'One of the selected reports is no longer available.',
  advisor_tip_source_draw_mismatch:
    'Selected reports must belong to the same forecast draw.',
  advisor_tip_source_evidence_unavailable:
    'A selected report does not contain verified numeric evidence for AI ticket generation.',
  advisor_tip_source_evidence_insufficient:
    'The selected reports do not contain enough distinct verified numbers for this ticket set.',
  advisor_tip_draw_not_open:
    'AI ticket generation is unavailable because this draw is not currently open.',
  advisor_tip_quote_rate_limited:
    'Too many new quotes were requested. Wait for the countdown before trying again.',
  advisor_tip_quote_expired:
    'This quote expired. Request a fresh quote to continue.',
  advisor_tip_quote_not_found:
    'This quote is no longer available. Request a fresh quote to continue.',
  advisor_tip_quote_already_consumed:
    'This quote has already been used. Keep the saved request and check the credit ledger or contact support before creating another paid request.',
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
  advisor_tip_idempotency_conflict:
    'The saved request key is already bound to different generation data. Keep this request saved and contact support.',
  advisor_tip_generation_incomplete:
    'The saved ticket set is incomplete. Contact support with the generation time before trying again.',
  advisor_tip_generation_collision:
    'The AI ticket request met a temporary database collision. Resume the exact saved request; do not request a new quote.',
  advisor_tip_database_unavailable:
    'AI ticket generation is temporarily unavailable. Please try again shortly.',
  advisor_tip_scenario_error:
    'AI ticket generation is temporarily unavailable. Please try again shortly.',
};

function detailCode(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
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

export function advisorTipScenarioErrorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  return detailCode(error.response?.data?.detail);
}

export function advisorTipScenarioRetryAfterMs(
  error: unknown,
  nowMs = Date.now(),
): number | null {
  if (
    !axios.isAxiosError(error)
    || error.response?.status !== 429
    || advisorTipScenarioErrorCode(error) !== 'advisor_tip_quote_rate_limited'
  ) {
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
  return QUOTE_RATE_LIMIT_FALLBACK_MS;
}

export function formatAdvisorTipScenarioRetryCountdown(
  remainingSeconds: number,
): string {
  const bounded = Math.max(0, Math.ceil(remainingSeconds));
  const minutes = Math.floor(bounded / 60);
  const seconds = bounded % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function advisorTipScenarioErrorMessage(
  error: unknown,
  fallback = 'AI ticket generation is temporarily unavailable.',
): string {
  if (axios.isAxiosError(error)) {
    const code = advisorTipScenarioErrorCode(error);
    if (code && ADVISOR_TIP_SCENARIO_MESSAGE_BY_CODE[code]) {
      return ADVISOR_TIP_SCENARIO_MESSAGE_BY_CODE[code];
    }
    if (!error.response) {
      return 'The exact request is safely saved. Restore the connection and resume generation.';
    }
    return fallback;
  }
  if (error instanceof Error && error.message.trim()) {
    if (/^The backend returned an invalid /u.test(error.message)) {
      return 'The paid response could not be verified. The exact request remains saved for a safe replay.';
    }
    return /^[a-z0-9_]+$/u.test(error.message)
      ? fallback
      : error.message;
  }
  return fallback;
}
