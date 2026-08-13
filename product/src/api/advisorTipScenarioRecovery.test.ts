import assert from 'node:assert/strict';
import test from 'node:test';

import { AxiosError } from 'axios';

import type {
  AdvisorTipScenarioGenerateResponse,
  AdvisorTipScenarioQuoteResponse,
} from './backendData';
import {
  AdvisorTipScenarioRecoveryStorageError,
  COMPLETED_ADVISOR_TIP_SCENARIO_STORAGE_KEY,
  PENDING_ADVISOR_TIP_SCENARIO_STORAGE_KEY,
  advisorTipDeliveryAutoRetryDelayMs,
  createPendingAdvisorTipScenarioGeneration,
  persistPendingAdvisorTipScenarioGeneration,
  readCompletedAdvisorTipScenarioGeneration,
  readPendingAdvisorTipScenarioGeneration,
  resumePendingAdvisorTipScenarioGeneration,
  submitPendingAdvisorTipScenarioGeneration,
} from './advisorTipScenarioRecovery';

test('delivery reconciliation has three bounded automatic backoff attempts', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(advisorTipDeliveryAutoRetryDelayMs),
    [5_000, 15_000, 45_000, null, null],
  );
  assert.equal(advisorTipDeliveryAutoRetryDelayMs(-1), null);
  assert.equal(advisorTipDeliveryAutoRetryDelayMs(1.5), null);
});

class MemoryStorage {
  protected readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class FailingStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error('storage unavailable');
  }
}

const OWNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_OWNER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REPORT_ID = '11111111-1111-4111-8111-111111111111';
const QUOTE_ID = '22222222-2222-4222-8222-222222222222';
const IDEMPOTENCY_KEY = '33333333-3333-4333-8333-333333333333';
const GENERATION_ID = '44444444-4444-4444-8444-444444444444';
const ARTIFACT_ID = '66666666-6666-4666-8666-666666666666';
const CSV_COLUMNS: [
  'scenario_id',
  'draw_id',
  'main_1',
  'main_2',
  'main_3',
  'main_4',
  'main_5',
  'star_1',
  'star_2',
] = [
  'scenario_id',
  'draw_id',
  'main_1',
  'main_2',
  'main_3',
  'main_4',
  'main_5',
  'star_1',
  'star_2',
];

const quote: AdvisorTipScenarioQuoteResponse = {
  source_report_ids: [REPORT_ID],
  draw_id: 1969,
  scenario_count: 20,
  quote_id: QUOTE_ID,
  pricing_version: 'advisor-tip-scenarios-v2',
  unit_price_credits: '1.00',
  total_credits: '20.00',
  current_balance: '50.00',
  projected_balance: '30.00',
  missing_credits: '0.00',
  can_generate: true,
  evidence_sha256: 'a'.repeat(64),
  sampling_sha256: 'b'.repeat(64),
  expires_at: '2026-08-04T10:00:00+02:00',
  limits: { max_source_reports: 5, min_scenarios: 20, max_scenarios: 120 },
};

function scenarioId(position: number): string {
  return `50000000-0000-4000-8000-${String(position).padStart(12, '0')}`;
}

function ticketId(position: number): string {
  return `70000000-0000-4000-8000-${String(position).padStart(12, '0')}`;
}

function result(
  status: 'generated' | 'pending_delivery',
): AdvisorTipScenarioGenerateResponse {
  const saved = status === 'generated';
  const scenarios = Array.from({ length: 20 }, (_, index) => {
    const position = index + 1;
    const mainNumbers = [1, 2, 3, 4, 5 + index] as [number, number, number, number, number];
    const starNumbers = [1, 2] as [number, number];
    return {
      id: scenarioId(position),
      ticket_id: saved ? ticketId(position) : null,
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
  const common = {
    status,
    generation_id: GENERATION_ID,
    quote_id: QUOTE_ID,
    idempotent: false,
    source_report_ids: [REPORT_ID],
    draw_id: 1969,
    scenario_count: 20,
    pricing_version: 'advisor-tip-scenarios-v2' as const,
    unit_price_credits: '1.00',
    credits_charged: '20.00',
    balance_after: '30.00',
    automatic_betting: false as const,
    saved_to_tickets: saved,
    ticket_ids: saved ? scenarios.map((scenario) => scenario.ticket_id!) : [],
    scenarios,
    csv: {
      filename: `luma-advisor-scenarios-D1969-${GENERATION_ID}.csv`,
      content_type: 'text/csv; charset=utf-8' as const,
      columns: CSV_COLUMNS,
      rows,
      content: `${CSV_COLUMNS.join(',')}\r\n${rows.map((row) => Object.values(row).join(',')).join('\r\n')}\r\n`,
    },
    provenance: {
      contract_version: 'luma.advisor-tip-provenance.v2' as const,
      algorithm_version: 'advisor-evidence-sampler-v2' as const,
      evidence_projection: 'VALIDATED_READER_SUMMARY' as const,
      main_selection_basis: 'VALIDATED_REPORT_EVIDENCE_WEIGHTS' as const,
      star_selection_basis: 'EVIDENCE_SEEDED_NEUTRAL_DOMAIN_WITH_REPORT_WEIGHTS' as const,
      winning_probability_claimed: false as const,
      evidence_sha256: 'a'.repeat(64),
      sampling_sha256: 'b'.repeat(64),
      source_reports: [{
        report_id: REPORT_ID,
        artifact_id: ARTIFACT_ID,
        artifact_sha256: 'c'.repeat(64),
      }],
      raw_report_text_used: false as const,
      raw_user_prompt_used: false as const,
      assistant_mode: 'deterministic_fallback' as const,
      assistant_input_sha256: 'd'.repeat(64),
      assistant_output_sha256: null,
      external_provider_called: false,
    },
  };
  return saved
    ? { ...common, status: 'generated', saved_to_tickets: true }
    : {
        ...common,
        status: 'pending_delivery',
        saved_to_tickets: false,
        ticket_ids: [],
      };
}

function pendingFor(
  idempotencyKey = IDEMPOTENCY_KEY,
  ownerSub = OWNER_ID,
) {
  return createPendingAdvisorTipScenarioGeneration(
    quote,
    ownerSub,
    idempotencyKey,
    '2026-08-04T08:00:00.000Z',
  );
}

test('delivered generation is durable before POST and completes only after ticket delivery', async () => {
  const storage = new MemoryStorage();
  const pending = pendingFor();
  let observedBeforePost = false;
  const delivered = result('generated');

  const response = await submitPendingAdvisorTipScenarioGeneration(
    storage,
    pending,
    async (request, idempotencyKey, expectedQuote) => {
      observedBeforePost = readPendingAdvisorTipScenarioGeneration(storage, OWNER_ID) !== null;
      assert.deepEqual(request, pending.request);
      assert.equal(idempotencyKey, IDEMPOTENCY_KEY);
      assert.deepEqual(expectedQuote, pending.quote);
      return delivered;
    },
  );

  assert.equal(observedBeforePost, true);
  assert.equal(response, delivered);
  assert.equal(readPendingAdvisorTipScenarioGeneration(storage, OWNER_ID), null);
  assert.deepEqual(
    readCompletedAdvisorTipScenarioGeneration(storage, OWNER_ID)?.result,
    delivered,
  );
});

test('202 pending delivery keeps the paid request and generation id for reconciliation', async () => {
  const storage = new MemoryStorage();
  const pending = pendingFor();
  const awaitingDelivery = result('pending_delivery');

  const response = await submitPendingAdvisorTipScenarioGeneration(
    storage,
    pending,
    async () => awaitingDelivery,
  );

  assert.equal(response.status, 'pending_delivery');
  assert.equal(readCompletedAdvisorTipScenarioGeneration(storage, OWNER_ID), null);
  assert.deepEqual(readPendingAdvisorTipScenarioGeneration(storage, OWNER_ID), {
    ...pending,
    generation_id: GENERATION_ID,
  });
});

test('delivery reconciliation resumes the exact saved request without a second charge intent', async () => {
  const storage = new MemoryStorage();
  const pending = pendingFor();
  await submitPendingAdvisorTipScenarioGeneration(
    storage,
    pending,
    async () => result('pending_delivery'),
  );

  const delivered = result('generated');
  const replayed = await resumePendingAdvisorTipScenarioGeneration(
    storage,
    OWNER_ID,
    async (request, key, expectedQuote) => {
      const saved = readPendingAdvisorTipScenarioGeneration(storage, OWNER_ID);
      assert.equal(saved?.generation_id, GENERATION_ID);
      assert.deepEqual(request, pending.request);
      assert.equal(key, IDEMPOTENCY_KEY);
      assert.deepEqual(expectedQuote, pending.quote);
      return delivered;
    },
  );

  assert.equal(replayed, delivered);
  assert.equal(readPendingAdvisorTipScenarioGeneration(storage, OWNER_ID), null);
  assert.equal(
    readCompletedAdvisorTipScenarioGeneration(storage, OWNER_ID)?.result.saved_to_tickets,
    true,
  );
});

test('lost response remains replayable and double submission is single-flight', async () => {
  const storage = new MemoryStorage();
  const pending = pendingFor();
  const lostResponse = new AxiosError('network connection closed');
  await assert.rejects(
    submitPendingAdvisorTipScenarioGeneration(storage, pending, async () => {
      throw lostResponse;
    }),
    lostResponse,
  );
  assert.deepEqual(readPendingAdvisorTipScenarioGeneration(storage, OWNER_ID), pending);

  let calls = 0;
  let release!: (value: AdvisorTipScenarioGenerateResponse) => void;
  const deferred = new Promise<AdvisorTipScenarioGenerateResponse>((resolve) => {
    release = resolve;
  });
  const generate = async () => {
    calls += 1;
    return deferred;
  };
  const first = submitPendingAdvisorTipScenarioGeneration(storage, pending, generate);
  const second = submitPendingAdvisorTipScenarioGeneration(storage, pending, generate);
  assert.equal(calls, 1);
  release(result('generated'));
  await Promise.all([first, second]);
});

test('storage failure blocks the mutating request and account isolation fails closed', async () => {
  const storage = new FailingStorage();
  let calls = 0;
  await assert.rejects(
    submitPendingAdvisorTipScenarioGeneration(storage, pendingFor(), async () => {
      calls += 1;
      return result('generated');
    }),
    AdvisorTipScenarioRecoveryStorageError,
  );
  assert.equal(calls, 0);

  const safeStorage = new MemoryStorage();
  persistPendingAdvisorTipScenarioGeneration(safeStorage, pendingFor());
  assert.equal(readPendingAdvisorTipScenarioGeneration(safeStorage, OTHER_OWNER_ID), null);
  assert.equal(safeStorage.getItem(PENDING_ADVISOR_TIP_SCENARIO_STORAGE_KEY), null);
});

test('malformed recovery records are removed', () => {
  const storage = new MemoryStorage();
  storage.setItem(
    PENDING_ADVISOR_TIP_SCENARIO_STORAGE_KEY,
    JSON.stringify({ version: 2, generation_id: 'bad' }),
  );
  assert.equal(readPendingAdvisorTipScenarioGeneration(storage, OWNER_ID), null);
  assert.equal(storage.getItem(PENDING_ADVISOR_TIP_SCENARIO_STORAGE_KEY), null);

  storage.setItem(
    COMPLETED_ADVISOR_TIP_SCENARIO_STORAGE_KEY,
    JSON.stringify({ version: 2, result: 'bad' }),
  );
  assert.equal(readCompletedAdvisorTipScenarioGeneration(storage, OWNER_ID), null);
  assert.equal(storage.getItem(COMPLETED_ADVISOR_TIP_SCENARIO_STORAGE_KEY), null);
});
