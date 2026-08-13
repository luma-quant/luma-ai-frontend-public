import assert from 'node:assert/strict';
import test from 'node:test';
import { AxiosError, AxiosHeaders } from 'axios';

import {
  ADVISOR_RELEASE_NOT_READY_MESSAGE,
  AdvisorUserFacingError,
  advisorCapabilityMessage,
  advisorErrorMessage,
  advisorRetryAfterMs,
  advisorRunSubmissionRetryAfterMs,
  isAdvisorBusinessConflict,
  isAdvisorRunAlreadyActive,
  isAdvisorReleaseReadinessCode,
  isAdvisorReleaseReadinessConflict,
} from './advisorErrors';

test('maps backend Advisor codes to stable English UI messages', () => {
  assert.equal(
    advisorCapabilityMessage('advisor_toxic_pairs_unavailable'),
    'Toxic Pair Exclusion is not available for this forecast.',
  );
  assert.equal(
    advisorCapabilityMessage('AGGREGATE_VIEW_NOT_CONFIGURED'),
    'This signal layer is not available for the current forecast.',
  );
  assert.equal(
    advisorCapabilityMessage('unknown_internal_code'),
    'This Advisor capability is temporarily unavailable.',
  );
});

test('extracts the response detail without exposing internal codes', () => {
  const error = new AxiosError(
    'Request failed with status code 409',
    'ERR_BAD_REQUEST',
    { headers: new AxiosHeaders() },
    undefined,
    {
      status: 409,
      statusText: 'Conflict',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: { detail: 'advisor_release_not_ready' },
    },
  );

  const message = advisorErrorMessage(error);
  assert.equal(
    message,
    'The current forecast is still being validated across all signal layers.',
  );
  assert.doesNotMatch(message, /advisor_|AGGREGATE_/u);
  assert.equal(isAdvisorBusinessConflict(error), true);
  assert.equal(isAdvisorReleaseReadinessConflict(error), true);
  assert.equal(
    isAdvisorReleaseReadinessCode('advisor_release_not_ready'),
    true,
  );
  assert.equal(
    ADVISOR_RELEASE_NOT_READY_MESSAGE,
    'Advisor data release is not ready yet.',
  );
});

test('uses a stable English message for an unknown business conflict', () => {
  const error = new AxiosError(
    'Request failed with status code 409',
    'ERR_BAD_REQUEST',
    { headers: new AxiosHeaders() },
    undefined,
    {
      status: 409,
      statusText: 'Conflict',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: { detail: 'internal_release_gate_changed' },
    },
  );

  const message = advisorErrorMessage(error);
  assert.equal(
    message,
    'These analysis settings are not currently available. Reload the workspace or adjust the selected options.',
  );
  assert.doesNotMatch(message, /internal_|409|Conflict/u);
  assert.equal(isAdvisorReleaseReadinessConflict(error), false);
});

test('recognizes only HTTP 409 as an Advisor business conflict', () => {
  const error = new AxiosError(
    'Service unavailable',
    'ERR_BAD_RESPONSE',
    { headers: new AxiosHeaders() },
    undefined,
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: {},
    },
  );

  assert.equal(isAdvisorBusinessConflict(error), false);
  assert.equal(isAdvisorBusinessConflict(new Error('local error')), false);
});

test('recognizes only the explicit active-run conflict for recovery', () => {
  const activeRunError = new AxiosError(
    'Too many requests',
    'ERR_BAD_REQUEST',
    { headers: new AxiosHeaders() },
    undefined,
    {
      status: 429,
      statusText: 'Too Many Requests',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: { detail: 'advisor_run_already_active' },
    },
  );
  const unrelatedConflict = new AxiosError(
    'Conflict',
    'ERR_BAD_REQUEST',
    { headers: new AxiosHeaders() },
    undefined,
    {
      status: 409,
      statusText: 'Conflict',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: { detail: 'advisor_quote_expired' },
    },
  );

  assert.equal(isAdvisorRunAlreadyActive(activeRunError), true);
  assert.equal(isAdvisorRunAlreadyActive(unrelatedConflict), false);
  assert.equal(isAdvisorRunAlreadyActive(new Error('local error')), false);
});

test('parses Retry-After seconds and HTTP dates for run cooldowns', () => {
  const secondsError = new AxiosError(
    'Too many requests',
    'ERR_BAD_REQUEST',
    {
      method: 'post',
      url: '/api/v1/advisor/runs',
      headers: new AxiosHeaders(),
    },
    undefined,
    {
      status: 429,
      statusText: 'Too Many Requests',
      headers: new AxiosHeaders({ 'retry-after': '12' }),
      config: { headers: new AxiosHeaders() },
      data: { detail: 'advisor_provider_failure_cooldown' },
    },
  );
  const nowMs = Date.parse('2026-08-02T10:00:00Z');
  const dateError = new AxiosError(
    'Too many requests',
    'ERR_BAD_REQUEST',
    { headers: new AxiosHeaders() },
    undefined,
    {
      status: 429,
      statusText: 'Too Many Requests',
      headers: new AxiosHeaders({
        'retry-after': 'Sun, 02 Aug 2026 10:01:30 GMT',
      }),
      config: { headers: new AxiosHeaders() },
      data: {},
    },
  );

  assert.equal(advisorRetryAfterMs(secondsError, nowMs), 12_000);
  assert.equal(advisorRetryAfterMs(dateError, nowMs), 90_000);
  assert.equal(
    advisorRunSubmissionRetryAfterMs(secondsError, nowMs),
    12_000,
  );
  assert.equal(advisorRunSubmissionRetryAfterMs(dateError, nowMs), null);
});

test('uses the documented provider cooldown only when Retry-After is unavailable', () => {
  const cooldownError = new AxiosError(
    'Too many requests',
    'ERR_BAD_REQUEST',
    { headers: new AxiosHeaders() },
    undefined,
    {
      status: 429,
      statusText: 'Too Many Requests',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: { detail: 'advisor_provider_failure_cooldown' },
    },
  );
  const activeRunError = new AxiosError(
    'Too many requests',
    'ERR_BAD_REQUEST',
    { headers: new AxiosHeaders() },
    undefined,
    {
      status: 429,
      statusText: 'Too Many Requests',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: { detail: 'advisor_run_already_active' },
    },
  );

  assert.equal(advisorRetryAfterMs(cooldownError), 60_000);
  assert.equal(advisorRetryAfterMs(activeRunError), null);
  assert.equal(advisorRetryAfterMs(new Error('local error')), null);
});

test('preserves only explicitly marked user-facing local errors', () => {
  assert.equal(
    advisorErrorMessage(new AdvisorUserFacingError('Insufficient credits: 25 CR missing.')),
    'Insufficient credits: 25 CR missing.',
  );
  assert.equal(
    advisorErrorMessage(new Error('gemini_generation_failed')),
    'The Advisor is temporarily unavailable.',
  );
});
