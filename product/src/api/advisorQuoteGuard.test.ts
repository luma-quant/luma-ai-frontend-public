import assert from 'node:assert/strict';
import test from 'node:test';

import type { AdvisorRunCreateRequest } from './backendData';
import { AdvisorQuoteConflictGuard } from './advisorQuoteGuard';

function request(
  overrides: Partial<AdvisorRunCreateRequest> = {},
): AdvisorRunCreateRequest {
  return {
    upload_id: null,
    analysis_scope: 'forecast',
    forecast_draw: 1967,
    history_start_draw: null,
    history_end_draw: 1966,
    tone: 'standard',
    luma_pro: false,
    deep_evidence: false,
    signal_layers: [],
    quality_controls: {
      qa_audit: false,
      toxic_pair_exclusion: false,
      recent_shadow_sync: false,
    },
    custom_prompt: null,
    ...overrides,
  };
}

test('suppresses an unchanged quote after a business conflict', () => {
  const guard = new AdvisorQuoteConflictGuard();
  const quoteRequest = request();

  assert.equal(guard.prepare(quoteRequest), null);
  guard.block(
    quoteRequest,
    'The current forecast is still being validated.',
  );

  assert.equal(
    guard.prepare(request()),
    'The current forecast is still being validated.',
  );
});

test('allows a new quote after the analysis settings change', () => {
  const guard = new AdvisorQuoteConflictGuard();
  const original = request();
  guard.block(original, 'The selected settings are unavailable.');

  assert.equal(guard.prepare(request({ tone: 'expert' })), null);
  assert.equal(guard.prepare(original), null);
});

test('clear removes a blocked quote explicitly', () => {
  const guard = new AdvisorQuoteConflictGuard();
  const quoteRequest = request();
  guard.block(quoteRequest, 'The selected settings are unavailable.');

  guard.clear();

  assert.equal(guard.prepare(quoteRequest), null);
});

test('changing evidence depth requires a fresh authoritative quote', () => {
  const guard = new AdvisorQuoteConflictGuard();
  const standard = request();
  guard.block(standard, 'The selected settings are unavailable.');

  assert.equal(guard.prepare(request({ deep_evidence: true })), null);
});
