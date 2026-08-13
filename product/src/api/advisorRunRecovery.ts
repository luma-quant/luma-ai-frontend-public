import axios from 'axios';

import type {
  AdvisorRunCreateRequest,
  AdvisorRunResponse,
  AdvisorUploadPreviewResponse,
} from './backendData';
import { clearReportedAdvisorIssues } from './advisorIssueReporting';
import {
  COMPLETED_ADVISOR_TIP_SCENARIO_STORAGE_KEY,
  PENDING_ADVISOR_TIP_SCENARIO_STORAGE_KEY,
} from './advisorTipScenarioRecovery';

export const PENDING_ADVISOR_RUN_STORAGE_KEY =
  'luma.pending-advisor-run.v1';
export const CURRENT_ADVISOR_RUN_STORAGE_KEY =
  'luma.current-advisor-run.v1';
export const ADVISOR_RETRY_SNAPSHOT_STORAGE_KEY =
  'luma.advisor-retry-snapshot.v1';
export const ADVISOR_RUN_RETRY_NOT_BEFORE_STORAGE_KEY =
  'luma.advisor-run-retry-not-before.v1';
export const ADVISOR_PROMPT_STORAGE_KEY = 'luma_prompt';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdvisorRunStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

export interface PendingAdvisorRun {
  version: 1;
  idempotency_key: string;
  request: AdvisorRunCreateRequest & { quote_id: string };
  saved_at: string;
}

export interface CurrentAdvisorRun {
  version: 1;
  run_id: string;
  saved_at: string;
}

export interface AdvisorRetrySnapshot {
  version: 1;
  run_id: string;
  request: AdvisorRunCreateRequest;
  saved_at: string;
}

interface AdvisorRunRetryNotBefore {
  version: 1;
  retry_not_before_ms: number;
}

const advisorRunSubmissionsInFlight = new Map<
  string,
  Promise<AdvisorRunResponse>
>();

export class AdvisorRunSubmissionPendingError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(
      'The run submission is safely saved. Retry to resume the same run without another reservation.',
    );
    this.name = 'AdvisorRunSubmissionPendingError';
    this.cause = cause;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableUuid(value: unknown): boolean {
  return value === null || (typeof value === 'string' && UUID_RE.test(value));
}

function withLegacyRequestDefaults(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.request)) return value;
  const forecastDraw = value.request.forecast_draw;
  const historyEndDraw = value.request.history_end_draw;
  return {
    ...value,
    request: {
      ...value.request,
      analysis_scope: value.request.analysis_scope ?? 'forecast',
      history_end_draw: historyEndDraw ?? (
        Number.isInteger(forecastDraw) ? Number(forecastDraw) - 1 : undefined
      ),
    },
  };
}

function isAdvisorRunRequest(
  value: unknown,
  requireQuote: boolean,
): value is AdvisorRunCreateRequest {
  if (!isRecord(value)) return false;
  const analysisScope = value.analysis_scope;
  const forecastBoundaryIsValid = (
    analysisScope === 'forecast' || analysisScope === 'historical'
  ) && Number.isInteger(value.forecast_draw) && Number(value.forecast_draw) > 0;
  const historyEndIsValid = Number.isInteger(value.history_end_draw)
    && Number(value.history_end_draw) > 0
    && Number(value.history_end_draw) < Number(value.forecast_draw)
    && (
      analysisScope === 'historical'
      || Number(value.history_end_draw) === Number(value.forecast_draw) - 1
    );
  if (
    !forecastBoundaryIsValid
    || !historyEndIsValid
    || !(
      value.history_start_draw === null
      || (Number.isInteger(value.history_start_draw)
        && Number(value.history_start_draw) > 0
        && Number(value.history_start_draw) <= Number(value.history_end_draw))
    )
    || !['standard', 'expert', 'analytical', 'exploratory'].includes(
      String(value.tone),
    )
    || typeof value.luma_pro !== 'boolean'
    || (
      value.deep_evidence !== undefined
      && typeof value.deep_evidence !== 'boolean'
    )
    || !Array.isArray(value.signal_layers)
    || !value.signal_layers.every((item) => typeof item === 'string')
    || !isRecord(value.quality_controls)
    || typeof value.quality_controls.qa_audit !== 'boolean'
    || typeof value.quality_controls.toxic_pair_exclusion !== 'boolean'
    || typeof value.quality_controls.recent_shadow_sync !== 'boolean'
    || !(
      value.custom_prompt === null
      || typeof value.custom_prompt === 'string'
    )
    || !isNullableUuid(value.upload_id ?? null)
  ) {
    return false;
  }
  return requireQuote
    ? typeof value.quote_id === 'string' && UUID_RE.test(value.quote_id)
    : value.quote_id === null || value.quote_id === undefined;
}

function retryRequest(
  request: AdvisorRunCreateRequest,
): AdvisorRunCreateRequest {
  return {
    ...request,
    quote_id: null,
    signal_layers: [...request.signal_layers],
    quality_controls: { ...request.quality_controls },
  };
}

function isPendingAdvisorRun(value: unknown): value is PendingAdvisorRun {
  if (!isRecord(value) || value.version !== 1) return false;
  if (
    typeof value.idempotency_key !== 'string'
    || !UUID_RE.test(value.idempotency_key)
    || typeof value.saved_at !== 'string'
    || !isAdvisorRunRequest(value.request, true)
  ) {
    return false;
  }
  return true;
}

function isAdvisorRetrySnapshot(value: unknown): value is AdvisorRetrySnapshot {
  return (
    isRecord(value)
    && value.version === 1
    && typeof value.run_id === 'string'
    && UUID_RE.test(value.run_id)
    && typeof value.saved_at === 'string'
    && isAdvisorRunRequest(value.request, false)
  );
}

function isCurrentAdvisorRun(value: unknown): value is CurrentAdvisorRun {
  return (
    isRecord(value)
    && value.version === 1
    && typeof value.run_id === 'string'
    && UUID_RE.test(value.run_id)
    && typeof value.saved_at === 'string'
  );
}

function errorDetail(error: unknown): unknown {
  if (!axios.isAxiosError(error)) return null;
  return error.response?.data?.detail;
}

export function isRecoverableAdvisorRunSubmissionError(
  error: unknown,
): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true;
  return (
    error.response.status === 503
    && errorDetail(error) === 'advisor_task_dispatch_pending'
  );
}

export function readPendingAdvisorRun(
  storage: AdvisorRunStorage,
): PendingAdvisorRun | null {
  const raw = storage.getItem(PENDING_ADVISOR_RUN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = withLegacyRequestDefaults(JSON.parse(raw));
    if (isPendingAdvisorRun(parsed)) return parsed;
  } catch {
    // Invalid browser state is removed below.
  }
  storage.removeItem(PENDING_ADVISOR_RUN_STORAGE_KEY);
  return null;
}

export function persistPendingAdvisorRun(
  storage: AdvisorRunStorage,
  pending: PendingAdvisorRun,
): void {
  if (!isPendingAdvisorRun(pending)) {
    throw new Error('Cannot persist an invalid Advisor run submission.');
  }
  storage.setItem(
    PENDING_ADVISOR_RUN_STORAGE_KEY,
    JSON.stringify(pending),
  );
}

export function clearPendingAdvisorRun(
  storage: AdvisorRunStorage,
): void {
  storage.removeItem(PENDING_ADVISOR_RUN_STORAGE_KEY);
}

export function clearAdvisorBrowserState(
  storage: AdvisorRunStorage,
): void {
  storage.removeItem(PENDING_ADVISOR_RUN_STORAGE_KEY);
  storage.removeItem(CURRENT_ADVISOR_RUN_STORAGE_KEY);
  storage.removeItem(ADVISOR_RETRY_SNAPSHOT_STORAGE_KEY);
  storage.removeItem(ADVISOR_RUN_RETRY_NOT_BEFORE_STORAGE_KEY);
  storage.removeItem(ADVISOR_PROMPT_STORAGE_KEY);
  storage.removeItem(PENDING_ADVISOR_TIP_SCENARIO_STORAGE_KEY);
  storage.removeItem(COMPLETED_ADVISOR_TIP_SCENARIO_STORAGE_KEY);
  clearReportedAdvisorIssues(storage);
}

export function readAdvisorRunRetryNotBefore(
  storage: AdvisorRunStorage,
  now: () => number = () => Date.now(),
): number | null {
  const raw = storage.getItem(ADVISOR_RUN_RETRY_NOT_BEFORE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      isRecord(parsed)
      && parsed.version === 1
      && typeof parsed.retry_not_before_ms === 'number'
      && Number.isFinite(parsed.retry_not_before_ms)
      && parsed.retry_not_before_ms > now()
    ) {
      return parsed.retry_not_before_ms;
    }
  } catch {
    // Invalid or expired browser state is removed below.
  }
  storage.removeItem(ADVISOR_RUN_RETRY_NOT_BEFORE_STORAGE_KEY);
  return null;
}

export function persistAdvisorRunRetryNotBefore(
  storage: AdvisorRunStorage,
  retryAfterMs: number,
  now: () => number = () => Date.now(),
): number | null {
  if (!Number.isFinite(retryAfterMs) || retryAfterMs <= 0) return null;
  const nowMs = now();
  const existingRetryNotBeforeMs = readAdvisorRunRetryNotBefore(
    storage,
    () => nowMs,
  );
  const retryNotBefore: AdvisorRunRetryNotBefore = {
    version: 1,
    retry_not_before_ms: Math.max(
      existingRetryNotBeforeMs ?? 0,
      nowMs + Math.ceil(retryAfterMs),
    ),
  };
  storage.setItem(
    ADVISOR_RUN_RETRY_NOT_BEFORE_STORAGE_KEY,
    JSON.stringify(retryNotBefore),
  );
  return retryNotBefore.retry_not_before_ms;
}

export function clearAdvisorRunRetryNotBefore(
  storage: AdvisorRunStorage,
  expectedRetryNotBeforeMs?: number,
): boolean {
  if (expectedRetryNotBeforeMs !== undefined) {
    const raw = storage.getItem(ADVISOR_RUN_RETRY_NOT_BEFORE_STORAGE_KEY);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (
          isRecord(parsed)
          && typeof parsed.retry_not_before_ms === 'number'
          && parsed.retry_not_before_ms !== expectedRetryNotBeforeMs
        ) {
          return false;
        }
      } catch {
        // Invalid browser state is removed below.
      }
    }
  }
  storage.removeItem(ADVISOR_RUN_RETRY_NOT_BEFORE_STORAGE_KEY);
  return true;
}

export function readCurrentAdvisorRun(
  storage: AdvisorRunStorage,
): CurrentAdvisorRun | null {
  const raw = storage.getItem(CURRENT_ADVISOR_RUN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isCurrentAdvisorRun(parsed)) return parsed;
  } catch {
    // Invalid browser state is removed below.
  }
  storage.removeItem(CURRENT_ADVISOR_RUN_STORAGE_KEY);
  storage.removeItem(ADVISOR_RETRY_SNAPSHOT_STORAGE_KEY);
  return null;
}

export function readAdvisorRetrySnapshot(
  storage: AdvisorRunStorage,
  expectedRunId?: string,
): AdvisorRetrySnapshot | null {
  const raw = storage.getItem(ADVISOR_RETRY_SNAPSHOT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = withLegacyRequestDefaults(JSON.parse(raw));
    if (isAdvisorRetrySnapshot(parsed)) {
      if (!expectedRunId || parsed.run_id === expectedRunId) return parsed;
      storage.removeItem(ADVISOR_RETRY_SNAPSHOT_STORAGE_KEY);
      return null;
    }
  } catch {
    // Invalid browser state is removed below.
  }
  storage.removeItem(ADVISOR_RETRY_SNAPSHOT_STORAGE_KEY);
  return null;
}

export function persistAdvisorRetrySnapshot(
  storage: AdvisorRunStorage,
  runId: string,
  request: AdvisorRunCreateRequest,
  now: () => string = () => new Date().toISOString(),
): AdvisorRetrySnapshot {
  const snapshot: AdvisorRetrySnapshot = {
    version: 1,
    run_id: runId,
    request: retryRequest(request),
    saved_at: now(),
  };
  if (!isAdvisorRetrySnapshot(snapshot)) {
    throw new Error('Cannot persist an invalid Advisor retry snapshot.');
  }
  storage.setItem(
    ADVISOR_RETRY_SNAPSHOT_STORAGE_KEY,
    JSON.stringify(snapshot),
  );
  return snapshot;
}

export function clearAdvisorRetrySnapshot(
  storage: AdvisorRunStorage,
  expectedRunId?: string,
): boolean {
  if (expectedRunId) {
    const snapshot = readAdvisorRetrySnapshot(storage);
    if (snapshot && snapshot.run_id !== expectedRunId) return false;
  }
  storage.removeItem(ADVISOR_RETRY_SNAPSHOT_STORAGE_KEY);
  return true;
}

export function canReconstructAdvisorSubmission(
  snapshot: AdvisorRetrySnapshot | null,
  runId: string | null | undefined,
  upload: Pick<AdvisorUploadPreviewResponse, 'upload_id' | 'status'> | null,
): boolean {
  if (!snapshot || !runId || snapshot.run_id !== runId) return false;
  const uploadId = snapshot.request.upload_id ?? null;
  if (uploadId === null) return true;
  return upload?.upload_id === uploadId && upload.status === 'READY';
}

export function persistCurrentAdvisorRun(
  storage: AdvisorRunStorage,
  runId: string,
  now: () => string = () => new Date().toISOString(),
): CurrentAdvisorRun {
  const previousRetry = readAdvisorRetrySnapshot(storage);
  if (previousRetry && previousRetry.run_id !== runId) {
    clearAdvisorRetrySnapshot(storage, previousRetry.run_id);
  }
  const current: CurrentAdvisorRun = {
    version: 1,
    run_id: runId,
    saved_at: now(),
  };
  if (!isCurrentAdvisorRun(current)) {
    throw new Error('Cannot persist an invalid Advisor run identity.');
  }
  storage.setItem(CURRENT_ADVISOR_RUN_STORAGE_KEY, JSON.stringify(current));
  return current;
}

export function clearCurrentAdvisorRun(
  storage: AdvisorRunStorage,
  expectedRunId?: string,
): boolean {
  if (expectedRunId) {
    const current = readCurrentAdvisorRun(storage);
    if (current && current.run_id !== expectedRunId) return false;
  }
  storage.removeItem(CURRENT_ADVISOR_RUN_STORAGE_KEY);
  clearAdvisorRetrySnapshot(storage, expectedRunId);
  return true;
}

export async function submitPendingAdvisorRun(
  storage: AdvisorRunStorage,
  pending: PendingAdvisorRun,
  createRun: (
    request: AdvisorRunCreateRequest,
    idempotencyKey: string,
  ) => Promise<AdvisorRunResponse>,
): Promise<AdvisorRunResponse> {
  // Durability must be established before the mutating request can leave
  // the browser. A storage failure therefore prevents submission.
  persistPendingAdvisorRun(storage, pending);
  let run: AdvisorRunResponse;
  try {
    let submission = advisorRunSubmissionsInFlight.get(
      pending.idempotency_key,
    );
    if (!submission) {
      submission = (async () => createRun(
        pending.request,
        pending.idempotency_key,
      ))();
      advisorRunSubmissionsInFlight.set(
        pending.idempotency_key,
        submission,
      );
      const clearSingleFlight = () => {
        if (
          advisorRunSubmissionsInFlight.get(pending.idempotency_key)
          === submission
        ) {
          advisorRunSubmissionsInFlight.delete(pending.idempotency_key);
        }
      };
      void submission.then(clearSingleFlight, clearSingleFlight);
    }
    run = await submission;
  } catch (error) {
    if (isRecoverableAdvisorRunSubmissionError(error)) {
      throw new AdvisorRunSubmissionPendingError(error);
    }
    clearPendingAdvisorRun(storage);
    throw error;
  }
  try {
    // Persist the accepted server identity and exact retry request before
    // clearing the submission intent. If browser storage fails here, the
    // already-durable pending request keeps the same mutation recoverable.
    persistCurrentAdvisorRun(storage, run.id);
    persistAdvisorRetrySnapshot(storage, run.id, pending.request);
    clearPendingAdvisorRun(storage);
    return run;
  } catch (storageError) {
    throw new AdvisorRunSubmissionPendingError(storageError);
  }
}

export async function resumePendingAdvisorRun(
  storage: AdvisorRunStorage,
  createRun: (
    request: AdvisorRunCreateRequest,
    idempotencyKey: string,
  ) => Promise<AdvisorRunResponse>,
): Promise<AdvisorRunResponse | null> {
  const pending = readPendingAdvisorRun(storage);
  if (!pending) return null;
  return submitPendingAdvisorRun(storage, pending, createRun);
}
