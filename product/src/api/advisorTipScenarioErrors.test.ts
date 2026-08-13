import assert from 'node:assert/strict';
import test from 'node:test';
import { AxiosError, AxiosHeaders } from 'axios';

import {
  ADVISOR_TIP_SCENARIO_MESSAGE_BY_CODE,
  advisorTipScenarioErrorCode,
  advisorTipScenarioErrorMessage,
  advisorTipScenarioRetryAfterMs,
  formatAdvisorTipScenarioRetryCountdown,
} from './advisorTipScenarioErrors';

function responseError(
  status: number,
  detail: unknown,
  headers: Record<string, string> = {},
): AxiosError {
  return new AxiosError(
    `Request failed with status code ${status}`,
    String(status),
    { headers: new AxiosHeaders() },
    null,
    {
      status,
      statusText: 'Error',
      headers: new AxiosHeaders(headers),
      config: { headers: new AxiosHeaders() },
      data: { detail },
    },
  );
}

test('every public backend scenario code has stable English copy', () => {
  const codes = [
    'advisor_tip_invalid_user_id',
    'advisor_tip_user_not_found',
    'advisor_tip_source_report_not_found',
    'advisor_tip_source_draw_mismatch',
    'advisor_tip_source_evidence_unavailable',
    'advisor_tip_source_evidence_insufficient',
    'advisor_tip_draw_not_open',
    'advisor_tip_quote_rate_limited',
    'advisor_tip_quote_expired',
    'advisor_tip_quote_not_found',
    'advisor_tip_quote_already_consumed',
    'advisor_tip_quote_request_mismatch',
    'advisor_tip_quote_evidence_mismatch',
    'advisor_tip_quote_price_mismatch',
    'advisor_tip_unique_scenarios_exhausted',
    'advisor_tip_insufficient_credits',
    'advisor_tip_idempotency_conflict',
    'advisor_tip_generation_incomplete',
    'advisor_tip_generation_collision',
    'advisor_tip_database_unavailable',
    'advisor_tip_scenario_error',
  ];

  assert.deepEqual(
    Object.keys(ADVISOR_TIP_SCENARIO_MESSAGE_BY_CODE).sort(),
    [...codes].sort(),
  );
  for (const code of codes) {
    const error = responseError(code.includes('rate_limited') ? 429 : 409, code);
    const message = advisorTipScenarioErrorMessage(error);
    assert.equal(advisorTipScenarioErrorCode(error), code);
    assert.ok(message.length > 20);
    assert.doesNotMatch(message, /advisor_tip_|\b409\b|Conflict/u);
  }
});

test('unknown internal codes and malformed successful-response errors stay private', () => {
  assert.equal(
    advisorTipScenarioErrorMessage(
      responseError(409, 'advisor_tip_future_internal_code'),
      'Safe fallback.',
    ),
    'Safe fallback.',
  );
  assert.equal(
    advisorTipScenarioErrorMessage(
      new Error('The backend returned an invalid scenario generation response.'),
    ),
    'The paid response could not be verified. The exact request remains saved for a safe replay.',
  );
  assert.equal(
    advisorTipScenarioErrorMessage(
      new Error('The backend returned an invalid generated main numbers.'),
    ),
    'The paid response could not be verified. The exact request remains saved for a safe replay.',
  );
});

test('quote Retry-After supports seconds, dates, and a bounded fallback', () => {
  const now = Date.parse('2026-08-04T08:00:00Z');
  assert.equal(
    advisorTipScenarioRetryAfterMs(
      responseError(429, 'advisor_tip_quote_rate_limited', { 'Retry-After': '12' }),
      now,
    ),
    12_000,
  );
  assert.equal(
    advisorTipScenarioRetryAfterMs(
      responseError(429, 'advisor_tip_quote_rate_limited', {
        'Retry-After': 'Tue, 04 Aug 2026 08:01:30 GMT',
      }),
      now,
    ),
    90_000,
  );
  assert.equal(
    advisorTipScenarioRetryAfterMs(
      responseError(429, 'advisor_tip_quote_rate_limited'),
      now,
    ),
    60_000,
  );
  assert.equal(
    advisorTipScenarioRetryAfterMs(
      responseError(429, 'advisor_tip_generation_collision', { 'Retry-After': '1' }),
      now,
    ),
    null,
  );
  assert.equal(formatAdvisorTipScenarioRetryCountdown(90), '01:30');
  assert.equal(formatAdvisorTipScenarioRetryCountdown(-1), '00:00');
});
