import axios from 'axios';

import type {
  AdvisorTipScenarioDeliveredResponse,
  AdvisorTipScenarioGenerateRequest,
  AdvisorTipScenarioGenerateResponse,
  AdvisorTipScenarioQuoteExpectation,
  AdvisorTipScenarioQuoteResponse,
} from './backendData';
import {
  parseAdvisorTipScenarioGenerateRequest,
  parseAdvisorTipScenarioGenerateResponse,
  parseAdvisorTipScenarioQuoteExpectation,
} from './advisorTipScenarioContract';
import { advisorTipScenarioErrorCode } from './advisorTipScenarioErrors';

export const PENDING_ADVISOR_TIP_SCENARIO_STORAGE_KEY =
  'luma.pending-advisor-tip-scenario.v2';
export const COMPLETED_ADVISOR_TIP_SCENARIO_STORAGE_KEY =
  'luma.completed-advisor-tip-scenario.v2';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DELIVERY_AUTO_RETRY_DELAYS_MS = [5_000, 15_000, 45_000] as const;

type ScenarioStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface PendingAdvisorTipScenarioGeneration {
  version: 2;
  owner_sub: string;
  idempotency_key: string;
  generation_id: string | null;
  request: AdvisorTipScenarioGenerateRequest;
  quote: AdvisorTipScenarioQuoteExpectation;
  saved_at: string;
}

export interface CompletedAdvisorTipScenarioGeneration
  extends PendingAdvisorTipScenarioGeneration {
  result: AdvisorTipScenarioDeliveredResponse;
  completed_at: string;
}

type GenerateScenario = (
  request: AdvisorTipScenarioGenerateRequest,
  idempotencyKey: string,
  expectedQuote: AdvisorTipScenarioQuoteExpectation,
) => Promise<AdvisorTipScenarioGenerateResponse>;

const submissionsInFlight = new Map<
  string,
  Promise<AdvisorTipScenarioGenerateResponse>
>();

export class AdvisorTipScenarioRecoveryStorageError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(
      'Secure browser recovery storage is unavailable. No AI ticket request was sent.',
    );
    this.name = 'AdvisorTipScenarioRecoveryStorageError';
    this.cause = cause;
  }
}

export function advisorTipDeliveryAutoRetryDelayMs(
  completedAutomaticRetries: number,
): number | null {
  if (
    !Number.isSafeInteger(completedAutomaticRetries)
    || completedAutomaticRetries < 0
  ) {
    return null;
  }
  return DELIVERY_AUTO_RETRY_DELAYS_MS[completedAutomaticRetries] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function parsePending(
  value: unknown,
): PendingAdvisorTipScenarioGeneration | null {
  if (
    !isRecord(value)
    || !hasExactKeys(
      value,
      [
        'version',
        'owner_sub',
        'idempotency_key',
        'generation_id',
        'request',
        'quote',
        'saved_at',
      ],
    )
    || value.version !== 2
    || typeof value.owner_sub !== 'string'
    || !UUID_RE.test(value.owner_sub)
    || typeof value.idempotency_key !== 'string'
    || !UUID_RE.test(value.idempotency_key)
    || (value.generation_id !== null
      && (typeof value.generation_id !== 'string'
        || !UUID_RE.test(value.generation_id)))
    || typeof value.saved_at !== 'string'
    || !Number.isFinite(Date.parse(value.saved_at))
  ) {
    return null;
  }
  let request: AdvisorTipScenarioGenerateRequest;
  try {
    request = parseAdvisorTipScenarioGenerateRequest(value.request);
  } catch {
    return null;
  }
  let quote: AdvisorTipScenarioQuoteExpectation;
  try {
    quote = parseAdvisorTipScenarioQuoteExpectation(value.quote, request);
  } catch {
    return null;
  }
  return {
    version: 2,
    owner_sub: value.owner_sub.toLowerCase(),
    idempotency_key: value.idempotency_key.toLowerCase(),
    generation_id: typeof value.generation_id === 'string'
      ? value.generation_id.toLowerCase()
      : null,
    request,
    quote,
    saved_at: value.saved_at,
  };
}

function parseCompleted(
  value: unknown,
): CompletedAdvisorTipScenarioGeneration | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      'version',
      'owner_sub',
      'idempotency_key',
      'generation_id',
      'request',
      'quote',
      'saved_at',
      'result',
      'completed_at',
    ])
    || typeof value.completed_at !== 'string'
    || !Number.isFinite(Date.parse(value.completed_at))
  ) {
    return null;
  }
  const pending = parsePending({
    version: value.version,
    owner_sub: value.owner_sub,
    idempotency_key: value.idempotency_key,
    generation_id: value.generation_id,
    request: value.request,
    quote: value.quote,
    saved_at: value.saved_at,
  });
  if (!pending) return null;
  try {
    const result = parseAdvisorTipScenarioGenerateResponse(
      value.result,
      pending.request,
      pending.quote,
    );
    if (result.status !== 'generated' || !result.saved_to_tickets) {
      return null;
    }
    return {
      ...pending,
      generation_id: result.generation_id,
      result,
      completed_at: value.completed_at,
    };
  } catch {
    return null;
  }
}

export function createPendingAdvisorTipScenarioGeneration(
  quote: AdvisorTipScenarioQuoteResponse,
  ownerSub: string,
  idempotencyKey: string,
  savedAt = new Date().toISOString(),
): PendingAdvisorTipScenarioGeneration {
  if (
    !UUID_RE.test(ownerSub)
    || !UUID_RE.test(idempotencyKey)
    || !Number.isFinite(Date.parse(savedAt))
  ) {
    throw new Error('A valid AI ticket recovery identity is required.');
  }
  const request = parseAdvisorTipScenarioGenerateRequest({
    source_report_ids: quote.source_report_ids,
    draw_id: quote.draw_id,
    scenario_count: quote.scenario_count,
    quote_id: quote.quote_id,
  });
  let quoteExpectation: AdvisorTipScenarioQuoteExpectation;
  try {
    quoteExpectation = parseAdvisorTipScenarioQuoteExpectation({
      quote_id: quote.quote_id,
      pricing_version: quote.pricing_version,
      unit_price_credits: quote.unit_price_credits,
      total_credits: quote.total_credits,
      evidence_sha256: quote.evidence_sha256,
      sampling_sha256: quote.sampling_sha256,
    }, request);
  } catch {
    throw new Error('The verified AI ticket quote could not be saved safely.');
  }
  return {
    version: 2,
    owner_sub: ownerSub.toLowerCase(),
    idempotency_key: idempotencyKey.toLowerCase(),
    generation_id: null,
    request,
    quote: quoteExpectation,
    saved_at: savedAt,
  };
}

export function readPendingAdvisorTipScenarioGeneration(
  storage: ScenarioStorage,
  expectedOwnerSub?: string,
): PendingAdvisorTipScenarioGeneration | null {
  const raw = storage.getItem(PENDING_ADVISOR_TIP_SCENARIO_STORAGE_KEY);
  if (!raw) return null;
  try {
    const pending = parsePending(JSON.parse(raw) as unknown);
    if (
      pending
      && (
        expectedOwnerSub === undefined
        || pending.owner_sub === expectedOwnerSub.toLowerCase()
      )
    ) {
      return pending;
    }
  } catch {
    // Corrupt or legacy browser state is removed below.
  }
  storage.removeItem(PENDING_ADVISOR_TIP_SCENARIO_STORAGE_KEY);
  return null;
}

export function readCompletedAdvisorTipScenarioGeneration(
  storage: ScenarioStorage,
  expectedOwnerSub?: string,
): CompletedAdvisorTipScenarioGeneration | null {
  const raw = storage.getItem(COMPLETED_ADVISOR_TIP_SCENARIO_STORAGE_KEY);
  if (!raw) return null;
  try {
    const completed = parseCompleted(JSON.parse(raw) as unknown);
    if (
      completed
      && (
        expectedOwnerSub === undefined
        || completed.owner_sub === expectedOwnerSub.toLowerCase()
      )
    ) {
      return completed;
    }
  } catch {
    // Corrupt, legacy, or cross-account browser state is removed below.
  }
  storage.removeItem(COMPLETED_ADVISOR_TIP_SCENARIO_STORAGE_KEY);
  return null;
}

export function persistPendingAdvisorTipScenarioGeneration(
  storage: ScenarioStorage,
  pending: PendingAdvisorTipScenarioGeneration,
): void {
  const parsed = parsePending(pending);
  if (!parsed) throw new Error('The AI ticket recovery record is invalid.');
  const current = readPendingAdvisorTipScenarioGeneration(storage);
  if (
    current
    && (
      current.idempotency_key !== parsed.idempotency_key
      || current.owner_sub !== parsed.owner_sub
    )
  ) {
    throw new Error('Another AI ticket generation is already saved.');
  }
  storage.setItem(
    PENDING_ADVISOR_TIP_SCENARIO_STORAGE_KEY,
    JSON.stringify(parsed),
  );
}

export function clearPendingAdvisorTipScenarioGeneration(
  storage: ScenarioStorage,
  expectedIdempotencyKey?: string,
): boolean {
  if (expectedIdempotencyKey) {
    const current = readPendingAdvisorTipScenarioGeneration(storage);
    if (
      current
      && current.idempotency_key !== expectedIdempotencyKey.toLowerCase()
    ) {
      return false;
    }
  }
  storage.removeItem(PENDING_ADVISOR_TIP_SCENARIO_STORAGE_KEY);
  return true;
}

export function clearCompletedAdvisorTipScenarioGeneration(
  storage: ScenarioStorage,
  expectedIdempotencyKey?: string,
): boolean {
  if (expectedIdempotencyKey) {
    const current = readCompletedAdvisorTipScenarioGeneration(storage);
    if (
      current
      && current.idempotency_key !== expectedIdempotencyKey.toLowerCase()
    ) {
      return false;
    }
  }
  storage.removeItem(COMPLETED_ADVISOR_TIP_SCENARIO_STORAGE_KEY);
  return true;
}

function persistCompletedAdvisorTipScenarioGeneration(
  storage: ScenarioStorage,
  pending: PendingAdvisorTipScenarioGeneration,
  result: AdvisorTipScenarioDeliveredResponse,
): void {
  const canonicalResult = parseAdvisorTipScenarioGenerateResponse(
    result,
    pending.request,
    pending.quote,
  );
  if (
    canonicalResult.status !== 'generated'
    || !canonicalResult.saved_to_tickets
  ) {
    throw new Error('Only delivered tickets can be stored as completed.');
  }
  const completed: CompletedAdvisorTipScenarioGeneration = {
    ...pending,
    generation_id: canonicalResult.generation_id,
    result: canonicalResult,
    completed_at: new Date().toISOString(),
  };
  storage.setItem(
    COMPLETED_ADVISOR_TIP_SCENARIO_STORAGE_KEY,
    JSON.stringify(completed),
  );
}

const PRESERVE_RESPONSE_CODES = new Set([
  'advisor_tip_invalid_user_id',
  'advisor_tip_user_not_found',
  'advisor_tip_quote_rate_limited',
  'advisor_tip_quote_already_consumed',
  'advisor_tip_insufficient_credits',
  'advisor_tip_idempotency_conflict',
  'advisor_tip_generation_incomplete',
  'advisor_tip_generation_collision',
  'advisor_tip_database_unavailable',
  'advisor_tip_scenario_error',
]);

const CLEAR_RESPONSE_CODES = new Set([
  'advisor_tip_source_report_not_found',
  'advisor_tip_source_draw_mismatch',
  'advisor_tip_source_evidence_unavailable',
  'advisor_tip_source_evidence_insufficient',
  'advisor_tip_draw_not_open',
  'advisor_tip_quote_expired',
  'advisor_tip_quote_not_found',
  'advisor_tip_quote_request_mismatch',
  'advisor_tip_quote_evidence_mismatch',
  'advisor_tip_quote_price_mismatch',
  'advisor_tip_unique_scenarios_exhausted',
]);

export function shouldPreserveAdvisorTipScenarioGeneration(
  error: unknown,
): boolean {
  if (!axios.isAxiosError(error)) return true;
  if (!error.response || error.response.status >= 500) return true;
  const code = advisorTipScenarioErrorCode(error);
  if (error.response.status === 401
    || error.response.status === 429
    || error.response.status === 428
    || error.response.status === 422
    || code === 'advisor_tip_insufficient_credits'
    || Boolean(code && PRESERVE_RESPONSE_CODES.has(code))) {
    return true;
  }
  if (error.response.status === 404 || error.response.status === 409) {
    return !code || !CLEAR_RESPONSE_CODES.has(code);
  }
  return false;
}

export async function submitPendingAdvisorTipScenarioGeneration(
  storage: ScenarioStorage,
  pending: PendingAdvisorTipScenarioGeneration,
  generate: GenerateScenario,
): Promise<AdvisorTipScenarioGenerateResponse> {
  try {
    persistPendingAdvisorTipScenarioGeneration(storage, pending);
    clearCompletedAdvisorTipScenarioGeneration(storage);
  } catch (error) {
    throw new AdvisorTipScenarioRecoveryStorageError(error);
  }

  let submission = submissionsInFlight.get(pending.idempotency_key);
  if (!submission) {
    submission = generate(
      pending.request,
      pending.idempotency_key,
      pending.quote,
    );
    submissionsInFlight.set(pending.idempotency_key, submission);
    const clearSingleFlight = () => {
      if (submissionsInFlight.get(pending.idempotency_key) === submission) {
        submissionsInFlight.delete(pending.idempotency_key);
      }
    };
    void submission.then(clearSingleFlight, clearSingleFlight);
  }

  let result: AdvisorTipScenarioGenerateResponse;
  try {
    result = await submission;
  } catch (error) {
    if (!shouldPreserveAdvisorTipScenarioGeneration(error)) {
      try {
        clearPendingAdvisorTipScenarioGeneration(
          storage,
          pending.idempotency_key,
        );
      } catch (storageError) {
        throw new AdvisorTipScenarioRecoveryStorageError(storageError);
      }
    }
    throw error;
  }

  if (result.status === 'pending_delivery') {
    try {
      persistPendingAdvisorTipScenarioGeneration(storage, {
        ...pending,
        generation_id: result.generation_id,
      });
    } catch (error) {
      throw new AdvisorTipScenarioRecoveryStorageError(error);
    }
    return result;
  }
  if (!result.saved_to_tickets) {
    throw new Error('Generated tickets were not delivered to My Tickets.');
  }
  try {
    persistCompletedAdvisorTipScenarioGeneration(storage, pending, result);
    clearPendingAdvisorTipScenarioGeneration(storage, pending.idempotency_key);
  } catch (error) {
    throw new AdvisorTipScenarioRecoveryStorageError(error);
  }
  return result;
}

export async function resumePendingAdvisorTipScenarioGeneration(
  storage: ScenarioStorage,
  ownerSub: string,
  generate: GenerateScenario,
): Promise<AdvisorTipScenarioGenerateResponse | null> {
  const pending = readPendingAdvisorTipScenarioGeneration(storage, ownerSub);
  if (!pending) return null;
  return submitPendingAdvisorTipScenarioGeneration(storage, pending, generate);
}
