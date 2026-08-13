import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseAdvisorTipScenarioGenerateRequest,
  parseAdvisorTipScenarioGenerateResponse,
  parseAdvisorTipScenarioIdempotencyKey,
  parseAdvisorTipScenarioQuoteExpectation,
  parseAdvisorTipScenarioQuoteResponse,
  parseAdvisorTipScenarioSelection,
} from './advisorTipScenarioContract';

const REPORT_ID = '11111111-1111-4111-8111-111111111111';
const QUOTE_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';
const ARTIFACT_ID = '55555555-5555-4555-8555-555555555555';
const EVIDENCE_SHA = 'a'.repeat(64);
const SAMPLING_SHA = 'b'.repeat(64);
const ARTIFACT_SHA = 'c'.repeat(64);
const ASSISTANT_INPUT_SHA = 'd'.repeat(64);
const CSV_COLUMNS = [
  'scenario_id', 'draw_id', 'main_1', 'main_2', 'main_3', 'main_4',
  'main_5', 'star_1', 'star_2',
] as const;

const selection = {
  source_report_ids: [REPORT_ID],
  draw_id: 1969,
  scenario_count: 20,
};

const quote = {
  ...selection,
  quote_id: QUOTE_ID,
  pricing_version: 'advisor-tip-scenarios-v2',
  unit_price_credits: '1.00',
  total_credits: '20.00',
  current_balance: '50.00',
  projected_balance: '30.00',
  missing_credits: '0.00',
  can_generate: true,
  evidence_sha256: EVIDENCE_SHA,
  sampling_sha256: SAMPLING_SHA,
  expires_at: '2026-08-04T10:00:00+02:00',
  limits: { max_source_reports: 5, min_scenarios: 20, max_scenarios: 120 },
};

function scenarioId(position: number): string {
  return `40000000-0000-4000-8000-${String(position).padStart(12, '0')}`;
}

function ticketId(position: number): string {
  return `70000000-0000-4000-8000-${String(position).padStart(12, '0')}`;
}

function generation(savedToTickets: boolean, status: 'generated' | 'pending_delivery') {
  const scenarios = Array.from({ length: 20 }, (_, index) => {
    const position = index + 1;
    const mainNumbers = [1, 2, 3, 4, 5 + index];
    const starNumbers = [1, 2];
    return {
      id: scenarioId(position),
      ticket_id: savedToTickets ? ticketId(position) : null,
      position,
      draw_id: 1969,
      main_numbers: mainNumbers,
      star_numbers: starNumbers,
      numbers_key: [...mainNumbers, ...starNumbers]
        .map((number) => String(number).padStart(2, '0'))
        .join('-'),
    };
  });
  const rows = scenarios.map((scenario) => ({
    scenario_id: scenario.id,
    draw_id: scenario.draw_id,
    main_1: scenario.main_numbers[0],
    main_2: scenario.main_numbers[1],
    main_3: scenario.main_numbers[2],
    main_4: scenario.main_numbers[3],
    main_5: scenario.main_numbers[4],
    star_1: scenario.star_numbers[0],
    star_2: scenario.star_numbers[1],
  }));
  return {
    ...selection,
    status,
    generation_id: GENERATION_ID,
    quote_id: QUOTE_ID,
    idempotent: false,
    pricing_version: 'advisor-tip-scenarios-v2',
    unit_price_credits: '1.00',
    credits_charged: '20.00',
    balance_after: '30.00',
    automatic_betting: false,
    saved_to_tickets: savedToTickets,
    ticket_ids: savedToTickets
      ? scenarios.map((scenario) => scenario.ticket_id)
      : [],
    scenarios,
    csv: {
      filename: `luma-advisor-scenarios-D1969-${GENERATION_ID}.csv`,
      content_type: 'text/csv; charset=utf-8',
      columns: CSV_COLUMNS,
      rows,
      content: `${CSV_COLUMNS.join(',')}\r\n${rows.map((row) => Object.values(row).join(',')).join('\r\n')}\r\n`,
    },
    provenance: {
      contract_version: 'luma.advisor-tip-provenance.v2',
      algorithm_version: 'advisor-evidence-sampler-v2',
      evidence_projection: 'VALIDATED_READER_SUMMARY',
      main_selection_basis: 'VALIDATED_REPORT_EVIDENCE_WEIGHTS',
      star_selection_basis: 'EVIDENCE_SEEDED_NEUTRAL_DOMAIN_WITH_REPORT_WEIGHTS',
      winning_probability_claimed: false,
      evidence_sha256: EVIDENCE_SHA,
      sampling_sha256: SAMPLING_SHA,
      source_reports: [{
        report_id: REPORT_ID,
        artifact_id: ARTIFACT_ID,
        artifact_sha256: ARTIFACT_SHA,
      }],
      raw_report_text_used: false,
      raw_user_prompt_used: false,
      assistant_mode: 'deterministic_fallback',
      assistant_input_sha256: ASSISTANT_INPUT_SHA,
      assistant_output_sha256: null,
      external_provider_called: false,
    },
  };
}

function expectedQuote() {
  return {
    quote_id: QUOTE_ID,
    pricing_version: 'advisor-tip-scenarios-v2' as const,
    unit_price_credits: '1.00',
    total_credits: '20.00',
    evidence_sha256: EVIDENCE_SHA,
    sampling_sha256: SAMPLING_SHA,
  };
}

function legacyGeneration(scenarioCount: number) {
  const scenarios = Array.from({ length: scenarioCount }, (_, index) => {
    const position = index + 1;
    const mainNumbers = [1, 2, 3, 4, 5 + index];
    const starNumbers = [1, 2];
    return {
      id: scenarioId(position),
      ticket_id: null,
      position,
      draw_id: 1969,
      main_numbers: mainNumbers,
      star_numbers: starNumbers,
      numbers_key: [...mainNumbers, ...starNumbers]
        .map((number) => String(number).padStart(2, '0'))
        .join('-'),
    };
  });
  const rows = scenarios.map((scenario) => ({
    scenario_id: scenario.id,
    draw_id: scenario.draw_id,
    main_1: scenario.main_numbers[0],
    main_2: scenario.main_numbers[1],
    main_3: scenario.main_numbers[2],
    main_4: scenario.main_numbers[3],
    main_5: scenario.main_numbers[4],
    star_1: scenario.star_numbers[0],
    star_2: scenario.star_numbers[1],
  }));
  return {
    source_report_ids: [REPORT_ID],
    draw_id: 1969,
    scenario_count: scenarioCount,
    status: 'generated',
    generation_id: GENERATION_ID,
    quote_id: QUOTE_ID,
    idempotent: true,
    pricing_version: 'advisor-tip-scenarios-v1',
    unit_price_credits: '1.00',
    credits_charged: `${scenarioCount}.00`,
    balance_after: '30.00',
    automatic_betting: false,
    saved_to_tickets: false,
    ticket_ids: [],
    scenarios,
    csv: {
      filename: `luma-advisor-scenarios-D1969-${GENERATION_ID}.csv`,
      content_type: 'text/csv; charset=utf-8',
      columns: CSV_COLUMNS,
      rows,
      content: `${CSV_COLUMNS.join(',')}\r\n${rows.map((row) => Object.values(row).join(',')).join('\r\n')}\r\n`,
    },
    provenance: {
      contract_version: 'luma.advisor-tip-provenance.v1',
      algorithm_version: 'advisor-evidence-sampler-v1',
      evidence_projection: 'VALIDATED_READER_SUMMARY',
      main_selection_basis: 'VALIDATED_REPORT_EVIDENCE_WEIGHTS',
      star_selection_basis: 'EVIDENCE_SEEDED_NEUTRAL_DOMAIN_WITH_REPORT_WEIGHTS',
      winning_probability_claimed: false,
      evidence_sha256: EVIDENCE_SHA,
      sampling_sha256: SAMPLING_SHA,
      source_reports: [{
        report_id: REPORT_ID,
        artifact_id: ARTIFACT_ID,
        artifact_sha256: ARTIFACT_SHA,
      }],
      raw_report_text_used: false,
      raw_user_prompt_used: false,
      assistant_mode: 'deterministic_fallback',
      assistant_input_sha256: SAMPLING_SHA,
      assistant_output_sha256: null,
      external_provider_called: false,
    },
  };
}

test('v2 quote and delivered tickets are bound to the exact paid request', () => {
  const parsedQuote = parseAdvisorTipScenarioQuoteResponse(quote, selection);
  const request = parseAdvisorTipScenarioGenerateRequest({
    ...selection,
    quote_id: QUOTE_ID,
  });
  const delivered = parseAdvisorTipScenarioGenerateResponse(
    generation(true, 'generated'),
    request,
    expectedQuote(),
  );

  assert.equal(parsedQuote.limits.min_scenarios, 20);
  assert.equal(delivered.status, 'generated');
  assert.equal(delivered.saved_to_tickets, true);
  assert.equal(delivered.ticket_ids.length, 20);
  assert.equal(delivered.scenarios[0].ticket_id, ticketId(1));
  assert.equal(delivered.provenance.assistant_mode, 'deterministic_fallback');
});

test('202 delivery-pending payload remains distinct from delivered tickets', () => {
  const request = parseAdvisorTipScenarioGenerateRequest({
    ...selection,
    quote_id: QUOTE_ID,
  });
  const pending = parseAdvisorTipScenarioGenerateResponse(
    generation(false, 'pending_delivery'),
    request,
    expectedQuote(),
  );

  assert.equal(pending.status, 'pending_delivery');
  assert.equal(pending.saved_to_tickets, false);
  assert.deepEqual(pending.ticket_ids, []);
  assert.ok(pending.scenarios.every((scenario) => scenario.ticket_id === null));
});

test('quote and generation parsing fail closed on contract mismatches', () => {
  const request = parseAdvisorTipScenarioGenerateRequest({
    ...selection,
    quote_id: QUOTE_ID,
  });
  for (const value of [
    { ...quote, limits: { max_source_reports: 5, min_scenarios: 1, max_scenarios: 120 } },
    { ...quote, projected_balance: '29.00' },
    { ...quote, pricing_version: 'advisor-tip-scenarios-v1' },
  ]) {
    assert.throws(
      () => parseAdvisorTipScenarioQuoteResponse(value, selection),
      /invalid scenario quote/u,
    );
  }

  const invalidDelivered = generation(true, 'generated');
  invalidDelivered.scenarios[0].ticket_id = ticketId(2);
  assert.throws(
    () => parseAdvisorTipScenarioGenerateResponse(
      invalidDelivered,
      request,
      expectedQuote(),
    ),
    /invalid (?:scenario|generated)/u,
  );
});

test('selection, quote expectation, and UUID validation enforce safe bounds', () => {
  assert.throws(
    () => parseAdvisorTipScenarioSelection({ ...selection, scenario_count: 19 }),
    /invalid scenario quote request/u,
  );
  assert.throws(
    () => parseAdvisorTipScenarioSelection({ ...selection, scenario_count: 121 }),
    /invalid scenario quote request/u,
  );
  assert.throws(
    () => parseAdvisorTipScenarioGenerateRequest({ ...selection, quote_id: 'bad' }),
    /invalid scenario generation quote id/u,
  );
  assert.throws(
    () => parseAdvisorTipScenarioIdempotencyKey('bad'),
    /invalid scenario generation idempotency key/u,
  );
  const request = parseAdvisorTipScenarioGenerateRequest({
    ...selection,
    quote_id: QUOTE_ID,
  });
  assert.throws(
    () => parseAdvisorTipScenarioQuoteExpectation(
      { ...expectedQuote(), total_credits: '21.00' },
      request,
    ),
    /invalid scenario generation quote expectation/u,
  );
});

test('immutable v1 generation replays remain readable from 1 through 20 tickets', () => {
  for (const scenarioCount of [1, 19, 20]) {
    const request = {
      source_report_ids: [REPORT_ID],
      draw_id: 1969,
      scenario_count: scenarioCount,
      quote_id: QUOTE_ID,
    };
    const parsed = parseAdvisorTipScenarioGenerateResponse(
      legacyGeneration(scenarioCount),
      request,
      {
        quote_id: QUOTE_ID,
        pricing_version: 'advisor-tip-scenarios-v1',
        unit_price_credits: '1.00',
        total_credits: `${scenarioCount}.00`,
        evidence_sha256: EVIDENCE_SHA,
        sampling_sha256: SAMPLING_SHA,
      },
    );

    assert.equal(parsed.pricing_version, 'advisor-tip-scenarios-v1');
    assert.equal(parsed.scenario_count, scenarioCount);
    assert.equal(parsed.saved_to_tickets, false);
    assert.equal(parsed.provenance.assistant_mode, 'deterministic_fallback');
    assert.equal(parsed.provenance.assistant_input_sha256, SAMPLING_SHA);
  }
});
