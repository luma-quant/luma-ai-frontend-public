import assert from 'node:assert/strict';
import test from 'node:test';
import type { AxiosRequestConfig } from 'axios';
import apiClient from './apiClient';
import {
  canRequestAdvisorReportPdf,
  deleteManualTicket,
  downloadAdvisorReportPdf,
  fetchAdvisorAvailability,
  fetchAdvisorConfig,
  fetchAdvisorTipScenarioQuote,
  fetchAllCreditLedger,
  fetchAllEvaluationDraws,
  fetchCreditBalance,
  fetchEngineStatus,
  fetchEvaluationModule,
  fetchRecentIntelligence,
  fetchTicketEvaluation,
  fetchTicketScoreboard,
  fetchUniverseAnalytics,
  getQualifyingCombinationCount,
  generateAdvisorTipScenarios,
  reconcileAdvisorTipScenarioTickets,
  normalizeHitPyramid,
  resolveHitPyramid,
  saveManualTicket,
  selectEngineUniverseDraws,
  updateManualTicket,
  type AdvisorAvailabilityResponse,
  type AdvisorConfigResponse,
  type CreditHistoryResponse,
  type EngineStatusResponse,
  type EvaluationDrawListItem,
  type RecentIntelligenceResponse,
  type UniverseAnalyticsResponse,
} from './backendData';

test('qualifying hit count prefers the new backend scalar including zero', () => {
  assert.equal(
    getQualifyingCombinationCount({
      qualifying_combination_count: 29_457,
      total_hits: { '5+0': 1, '2+0': 999_999 },
    }),
    29_457,
  );
  assert.equal(
    getQualifyingCombinationCount({
      qualifying_combination_count: 0,
      total_hits: { '5+0': 1 },
    }),
    0,
  );
});

test('legacy hit totals sum only the twelve qualifying categories', () => {
  assert.equal(
    getQualifyingCombinationCount({
      total_hits: {
        '5+0': 1,
        '4+1': 2,
        '2+0': 29_454,
        '1+2': 400_000,
        '0+0': 70_543,
      },
    }),
    29_457,
  );
  assert.equal(getQualifyingCombinationCount({ total_hits: {} }), 0);
});

test('malformed hit counts are unavailable instead of partially summed', () => {
  assert.equal(
    getQualifyingCombinationCount({
      total_hits: { '5+0': '1', '2+0': 29_456 },
    }),
    null,
  );
  assert.equal(
    getQualifyingCombinationCount({
      qualifying_combination_count: -1,
      total_hits: { '5+0': 1 },
    }),
    null,
  );
});

test('hit pyramid always contains twelve ordered categories and preserves 5+0', () => {
  const pyramid = normalizeHitPyramid([
    { category: '2+0', count: 29_456 },
    { category: '5+0', count: 1 },
  ]);

  assert.equal(pyramid.length, 12);
  assert.deepEqual(
    pyramid.slice(0, 3),
    [
      { category: '5+2', count: 0 },
      { category: '5+1', count: 0 },
      { category: '5+0', count: 1 },
    ],
  );
  assert.deepEqual(pyramid.at(-1), { category: '2+0', count: 29_456 });
});

test('hit pyramid falls back to the completed evaluation summary', () => {
  const pyramid = resolveHitPyramid(undefined, {
    '5+0': 1,
    '2+0': 20_000,
  });

  assert.deepEqual(pyramid[2], { category: '5+0', count: 1 });
  assert.deepEqual(pyramid.at(-1), { category: '2+0', count: 20_000 });
});

test('BigQuery hit pyramid wins over the summary when both are available', () => {
  const pyramid = resolveHitPyramid(
    [{ category: '5+2', count: 2 }],
    { '5+2': 99, '5+0': 1 },
  );

  assert.deepEqual(pyramid[0], { category: '5+2', count: 2 });
  assert.deepEqual(pyramid[2], { category: '5+0', count: 0 });
});

interface RecordedGet {
  url: string;
  config?: AxiosRequestConfig;
}

function draw(drawId: number): EvaluationDrawListItem {
  return {
    draw_id: drawId,
    draw_date: `2026-07-${String((drawId % 28) + 1).padStart(2, '0')}`,
    winning_numbers: {
      main: [1, 2, 3, 4, 5],
      stars: [1, 2],
    },
    availability: {
      result: true,
      universe_manifest: true,
      exact_500k: true,
      evaluation: true,
      summary: true,
      analytics: true,
    },
    universe: { total_rows: 500_000 },
    evaluation: {
      status: 'completed',
      modules: ['hit_pyramid'],
      summary: {
        qualifying_combination_count: drawId % 100,
        total_hits: {},
        state_transitions: {},
      },
    },
  };
}

test('Engine Universe shows only complete published evaluations, newest first', () => {
  const olderCompletedDraw = draw(42);
  const zeroCountDraw = draw(1957);
  zeroCountDraw.evaluation.summary!.qualifying_combination_count = 0;

  const pendingForecastDraw = draw(1967);
  pendingForecastDraw.evaluation.status = 'pending_engine';

  const waitingForUploadDraw = draw(1903);
  waitingForUploadDraw.evaluation.status = 'waiting_for_upload';

  const pendingUsersDraw = draw(1902);
  pendingUsersDraw.evaluation.status = 'pending_users';

  const pendingRetryDraw = draw(1901);
  pendingRetryDraw.evaluation.status = 'pending_retry';

  const missingSummaryDraw = draw(1966);
  missingSummaryDraw.evaluation.summary = null;

  const unavailableSummaryDraw = draw(1965);
  unavailableSummaryDraw.availability.summary = false;

  const missingCountDraw = draw(1964);
  delete missingCountDraw.evaluation.summary!.qualifying_combination_count;
  missingCountDraw.evaluation.summary!.total_hits = { '5+0': 1 };

  const invalidCountDraw = draw(1963);
  invalidCountDraw.evaluation.summary!.qualifying_combination_count = -1;

  const catalog = [
    olderCompletedDraw,
    pendingForecastDraw,
    waitingForUploadDraw,
    pendingUsersDraw,
    pendingRetryDraw,
    missingSummaryDraw,
    unavailableSummaryDraw,
    missingCountDraw,
    invalidCountDraw,
    zeroCountDraw,
  ];

  assert.deepEqual(
    selectEngineUniverseDraws(catalog).map((item) => item.draw_id),
    [1957, 42],
  );
  assert.deepEqual(
    catalog.map((item) => item.draw_id),
    [42, 1967, 1903, 1902, 1901, 1966, 1965, 1964, 1963, 1957],
    'selection must not mutate the raw backend catalog',
  );

  pendingForecastDraw.evaluation.status = 'completed';
  assert.deepEqual(
    selectEngineUniverseDraws(catalog).map((item) => item.draw_id),
    [1967, 1957, 42],
    'a future draw appears automatically once the backend contract is complete',
  );
});

function installGetMock(
  handler: (url: string, config?: AxiosRequestConfig) => Promise<unknown>,
): () => void {
  const originalGet = apiClient.get;
  apiClient.get = (async (
    url: string,
    config?: AxiosRequestConfig,
  ) => handler(url, config)) as typeof apiClient.get;
  return () => {
    apiClient.get = originalGet;
  };
}

function installPostMock(
  handler: (
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ) => Promise<unknown>,
): () => void {
  const originalPost = apiClient.post;
  apiClient.post = (async (
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ) => handler(url, data, config)) as typeof apiClient.post;
  return () => {
    apiClient.post = originalPost;
  };
}

function installPatchMock(
  handler: (
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ) => Promise<unknown>,
): () => void {
  const originalPatch = apiClient.patch;
  apiClient.patch = (async (
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ) => handler(url, data, config)) as typeof apiClient.patch;
  return () => {
    apiClient.patch = originalPatch;
  };
}

function installDeleteMock(
  handler: (url: string, config?: AxiosRequestConfig) => Promise<unknown>,
): () => void {
  const originalDelete = apiClient.delete;
  apiClient.delete = (async (
    url: string,
    config?: AxiosRequestConfig,
  ) => handler(url, config)) as typeof apiClient.delete;
  return () => {
    apiClient.delete = originalDelete;
  };
}

test('fetchAllEvaluationDraws follows the exclusive cursor until has_more=false', async (context) => {
  const calls: RecordedGet[] = [];
  const pages = [
    {
      items: [draw(1966), draw(1965)],
      has_more: true,
      next_before_draw_id: 1965,
    },
    {
      items: [draw(1964), draw(1963)],
      has_more: true,
      next_before_draw_id: 1963,
    },
    {
      items: [draw(1962)],
      has_more: false,
      next_before_draw_id: null,
    },
  ];
  const restore = installGetMock(async (url, config) => {
    calls.push({ url, config });
    return { data: pages[calls.length - 1] };
  });
  context.after(restore);

  const items = await fetchAllEvaluationDraws();

  assert.deepEqual(items.map((item) => item.draw_id), [
    1966,
    1965,
    1964,
    1963,
    1962,
  ]);
  assert.deepEqual(
    calls.map(({ url, config }) => ({
      url,
      params: config?.params,
    })),
    [
      {
        url: '/api/v1/evaluations/draws',
        params: { limit: 200 },
      },
      {
        url: '/api/v1/evaluations/draws',
        params: { limit: 200, before_draw_id: 1965 },
      },
      {
        url: '/api/v1/evaluations/draws',
        params: { limit: 200, before_draw_id: 1963 },
      },
    ],
  );
});

test('fetchAllEvaluationDraws rejects a draw repeated on a later page', async (context) => {
  let callCount = 0;
  const restore = installGetMock(async () => {
    callCount += 1;
    return {
      data: callCount === 1
        ? {
            items: [draw(1966), draw(1965)],
            has_more: true,
            next_before_draw_id: 1965,
          }
        : {
            items: [draw(1965)],
            has_more: false,
            next_before_draw_id: null,
          },
    };
  });
  context.after(restore);

  await assert.rejects(
    fetchAllEvaluationDraws(),
    /Draw catalog repeated draw 1965\./,
  );
  assert.equal(callCount, 2);
});

test('fetchAllEvaluationDraws rejects a cursor that does not move backwards', async (context) => {
  let callCount = 0;
  const restore = installGetMock(async () => {
    callCount += 1;
    return {
      data: callCount === 1
        ? {
            items: [draw(1966)],
            has_more: true,
            next_before_draw_id: 1965,
          }
        : {
            items: [draw(1964)],
            has_more: true,
            next_before_draw_id: 1965,
          },
    };
  });
  context.after(restore);

  await assert.rejects(
    fetchAllEvaluationDraws(),
    /Draw catalog returned a non-progressing cursor\./,
  );
  assert.equal(callCount, 2);
});

test('fetchUniverseAnalytics accepts legacy B and C bucket rows', async (context) => {
  const payload: UniverseAnalyticsResponse = {
    draw_id: 1957,
    provider: 'bigquery',
    aggregation_source: 'bigquery_hit_gate',
    combinations_source: 'bigquery_hit_gate',
    minimum_hit_threshold: '2+0',
    qualifying_combination_count: 2,
    hit_pyramid: [
      { category: '5+2', count: 0 },
      { category: '5+1', count: 0 },
      { category: '5+0', count: 0 },
      { category: '4+2', count: 0 },
      { category: '4+1', count: 0 },
      { category: '4+0', count: 0 },
      { category: '3+2', count: 0 },
      { category: '3+1', count: 0 },
      { category: '3+0', count: 0 },
      { category: '2+2', count: 0 },
      { category: '2+1', count: 1 },
      { category: '2+0', count: 1 },
    ],
    top_combinations: [
      {
        universe_index: 17,
        wave: 1,
        bucket: 'B',
        main_numbers: [1, 2, 3, 4, 5],
        core_numbers: [1, 2],
        main_hits: 2,
        core_hits: 1,
        hit_category: '2+1',
      },
      {
        universe_index: 29,
        wave: 1,
        bucket: 'C',
        main_numbers: [6, 7, 8, 9, 10],
        core_numbers: [3, 4],
        main_hits: 2,
        core_hits: 0,
        hit_category: '2+0',
      },
    ],
  };
  const calls: RecordedGet[] = [];
  const restore = installGetMock(async (url, config) => {
    calls.push({ url, config });
    return { data: payload };
  });
  context.after(restore);

  const result = await fetchUniverseAnalytics(1957);

  assert.deepEqual(
    result.top_combinations.map(({ bucket }) => bucket),
    ['B', 'C'],
  );
  assert.deepEqual(calls, [
    {
      url: '/api/v1/analytics/universe',
      config: {
        signal: undefined,
        params: { draw_id: 1957 },
      },
    },
  ]);
});

test('draw modules, manual tickets, and authenticated PDFs use the exact backend paths', async (context) => {
  const getCalls: RecordedGet[] = [];
  const postCalls: Array<{
    url: string;
    data?: unknown;
    config?: AxiosRequestConfig;
  }> = [];
  const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
  const restoreGet = installGetMock(async (url, config) => {
    getCalls.push({ url, config });
    if (url.endsWith('/modules/TRIADS')) {
      return {
        data: {
          draw_id: 1966,
          module_name: 'TRIADS',
          metrics: { count: 16_300 },
        },
      };
    }
    if (url === '/api/v1/tickets/evaluate') {
      return {
        data: {
          draw_id: 1967,
          status: 'waiting_for_result',
          winning_numbers: null,
          count: 0,
          items: [],
        },
      };
    }
    if (url.endsWith('/pdf')) return { data: pdf };
    throw new Error(`Unexpected GET ${url}`);
  });
  const restorePost = installPostMock(async (url, data, config) => {
    postCalls.push({ url, data, config });
    return {
      data: {
        status: 'saved',
        idempotent: false,
        ticket: {
          id: '1d22db3d-66f0-4ef4-8b58-42c0adb11875',
          draw_id: 1967,
          main_numbers: [8, 10, 30, 36, 47],
          core_numbers: [1, 4],
          created_at: '2026-07-26T21:00:00Z',
        },
      },
    };
  });
  context.after(() => {
    restoreGet();
    restorePost();
  });

  const module = await fetchEvaluationModule(1966, 'TRIADS');
  const request = {
    request_id: '63e3e05d-c3d1-4515-9180-448f21fedac7',
    draw_id: 1967,
    main_numbers: [8, 10, 30, 36, 47] as [
      number,
      number,
      number,
      number,
      number,
    ],
    core_numbers: [1, 4] as [number, number],
  };
  const saved = await saveManualTicket(request);
  const evaluation = await fetchTicketEvaluation(1967);
  const downloaded = await downloadAdvisorReportPdf(
    'eb383c87-8271-42b5-bf13-a57cc2b155c0',
  );

  assert.equal(module.module_name, 'TRIADS');
  assert.equal(saved.ticket.draw_id, 1967);
  assert.equal(evaluation.status, 'waiting_for_result');
  assert.equal(downloaded, pdf);
  assert.deepEqual(
    getCalls.map(({ url, config }) => ({
      url,
      params: config?.params,
      responseType: config?.responseType,
    })),
    [
      {
        url: '/api/v1/evaluations/draws/1966/modules/TRIADS',
        params: undefined,
        responseType: undefined,
      },
      {
        url: '/api/v1/tickets/evaluate',
        params: { draw_id: 1967 },
        responseType: undefined,
      },
      {
        url: '/api/v1/advisor/reports/eb383c87-8271-42b5-bf13-a57cc2b155c0/pdf',
        params: undefined,
        responseType: 'blob',
      },
    ],
  );
  assert.deepEqual(postCalls, [
    {
      url: '/api/v1/tickets/save',
      data: request,
      config: { signal: undefined },
    },
  ]);
});

test('AI ticket quote, generation, and reconciliation use the exact paid contract', async (context) => {
  const calls: Array<{
    url: string;
    data?: unknown;
    config?: AxiosRequestConfig;
  }> = [];
  const selection = {
    source_report_ids: [
      '2753ad33-27a3-5505-9bd5-577cb3439ffc',
      '6d24777a-307a-5c8a-8598-cb86485c19dc',
    ],
    draw_id: 1969,
    scenario_count: 20,
  };
  const quoteId = 'ccd63b74-47f0-54dc-bcce-49582b4898a6';
  const generationId = '55555555-5555-4555-8555-555555555555';
  const evidenceSha = 'a'.repeat(64);
  const samplingSha = 'b'.repeat(64);
  const scenarios = Array.from({ length: 20 }, (_, index) => {
    const position = index + 1;
    const mainNumbers = [1, 2, 3, 4, 5 + index];
    const starNumbers = [1, 2];
    return {
      id: `30000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
      ticket_id: `40000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
      position,
      draw_id: 1969,
      main_numbers: mainNumbers,
      star_numbers: starNumbers,
      numbers_key: [...mainNumbers, ...starNumbers]
        .map((number) => String(number).padStart(2, '0'))
        .join('-'),
    };
  });
  const csvRows = scenarios.map((scenario) => ({
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
  const csvColumns = [
    'scenario_id', 'draw_id', 'main_1', 'main_2', 'main_3', 'main_4',
    'main_5', 'star_1', 'star_2',
  ];
  const quoteResponse = {
    ...selection,
    quote_id: quoteId,
    pricing_version: 'advisor-tip-scenarios-v2',
    unit_price_credits: '1.00',
    total_credits: '20.00',
    current_balance: '50.00',
    projected_balance: '30.00',
    missing_credits: '0.00',
    can_generate: true,
    evidence_sha256: evidenceSha,
    sampling_sha256: samplingSha,
    expires_at: '2026-08-04T10:00:00Z',
    limits: { max_source_reports: 5, min_scenarios: 20, max_scenarios: 120 },
  };
  const restore = installPostMock(async (url, data, config) => {
    calls.push({ url, data, config });
    if (url.endsWith('/quote')) {
      return { data: quoteResponse };
    }
    return {
      data: {
        ...selection,
        quote_id: quoteId,
        status: 'generated',
        generation_id: generationId,
        idempotent: false,
        pricing_version: 'advisor-tip-scenarios-v2',
        unit_price_credits: '1.00',
        credits_charged: '20.00',
        balance_after: '30.00',
        automatic_betting: false,
        saved_to_tickets: true,
        ticket_ids: scenarios.map((scenario) => scenario.ticket_id),
        scenarios,
        csv: {
          filename: `luma-advisor-scenarios-D1969-${generationId}.csv`,
          content_type: 'text/csv; charset=utf-8',
          columns: csvColumns,
          rows: csvRows,
          content: `${csvColumns.join(',')}\r\n${csvRows.map((row) => Object.values(row).join(',')).join('\r\n')}\r\n`,
        },
        provenance: {
          contract_version: 'luma.advisor-tip-provenance.v2',
          algorithm_version: 'advisor-evidence-sampler-v2',
          evidence_projection: 'VALIDATED_READER_SUMMARY',
          main_selection_basis: 'VALIDATED_REPORT_EVIDENCE_WEIGHTS',
          star_selection_basis: 'EVIDENCE_SEEDED_NEUTRAL_DOMAIN_WITH_REPORT_WEIGHTS',
          winning_probability_claimed: false,
          evidence_sha256: evidenceSha,
          sampling_sha256: samplingSha,
          source_reports: selection.source_report_ids.map((reportId, index) => ({
            report_id: reportId,
            artifact_id: index === 0
              ? '11111111-1111-4111-8111-111111111111'
              : '22222222-2222-4222-8222-222222222222',
            artifact_sha256: String(index === 0 ? 'c' : 'd').repeat(64),
          })),
          raw_report_text_used: false,
          raw_user_prompt_used: false,
          assistant_mode: 'deterministic_fallback',
          assistant_input_sha256: 'e'.repeat(64),
          assistant_output_sha256: null,
          external_provider_called: false,
        },
      },
    };
  });
  context.after(restore);

  const quote = await fetchAdvisorTipScenarioQuote(selection);
  const generated = await generateAdvisorTipScenarios(
    { ...selection, quote_id: quote.quote_id },
    '00000000-0000-4000-8000-000000000002',
    quote,
  );

  const reconciled = await reconcileAdvisorTipScenarioTickets(
    generationId,
    { ...selection, quote_id: quote.quote_id },
    quote,
  );

  assert.equal(quote.total_credits, '20.00');
  assert.equal(generated.automatic_betting, false);
  assert.equal(generated.saved_to_tickets, true);
  assert.equal(generated.ticket_ids.length, 20);
  assert.equal(reconciled.saved_to_tickets, true);
  assert.deepEqual(calls, [
    {
      url: '/api/v1/advisor/tip-scenarios/quote',
      data: selection,
      config: { signal: undefined },
    },
    {
      url: '/api/v1/advisor/tip-scenarios/generate',
      data: { ...selection, quote_id: quoteId },
      config: {
        signal: undefined,
        headers: {
          'Idempotency-Key': '00000000-0000-4000-8000-000000000002',
        },
      },
    },
    {
      url: `/api/v1/advisor/tip-scenarios/generations/${generationId}/reconcile-tickets`,
      data: undefined,
      config: { signal: undefined },
    },
  ]);
});

test('invalid paid AI ticket inputs fail before any network request', async (context) => {
  let calls = 0;
  const restore = installPostMock(async () => {
    calls += 1;
    return { data: {} };
  });
  context.after(restore);

  await assert.rejects(
    fetchAdvisorTipScenarioQuote({
      source_report_ids: [
        '6d24777a-307a-5c8a-8598-cb86485c19dc',
        '2753ad33-27a3-5505-9bd5-577cb3439ffc',
      ],
      draw_id: 1969,
      scenario_count: 20,
    }),
    /invalid scenario quote request/u,
  );

  const request = {
    source_report_ids: ['2753ad33-27a3-5505-9bd5-577cb3439ffc'],
    draw_id: 1969,
    scenario_count: 20,
    quote_id: 'ccd63b74-47f0-54dc-bcce-49582b4898a6',
  };
  const expectedQuote = {
    quote_id: request.quote_id,
    pricing_version: 'advisor-tip-scenarios-v2' as const,
    unit_price_credits: '1.00',
    total_credits: '20.00',
    evidence_sha256: 'a'.repeat(64),
    sampling_sha256: 'b'.repeat(64),
  };
  await assert.rejects(
    generateAdvisorTipScenarios(request, 'not-a-uuid', expectedQuote),
    /invalid scenario generation idempotency key/u,
  );
  await assert.rejects(
    generateAdvisorTipScenarios(
      request,
      '00000000-0000-4000-8000-000000000002',
      { ...expectedQuote, total_credits: '21.00' },
    ),
    /invalid scenario generation quote expectation/u,
  );
  assert.equal(calls, 0);
});

test('manual ticket editing, deletion, and scoreboard use the owner-safe v1 contract', async (context) => {
  const getCalls: RecordedGet[] = [];
  const patchCalls: Array<{
    url: string;
    data?: unknown;
    config?: AxiosRequestConfig;
  }> = [];
  const deleteCalls: RecordedGet[] = [];
  const ticketId = '1d22db3d-66f0-4ef4-8b58-42c0adb11875';
  const ticketNumbers = {
    main_numbers: [8, 10, 30, 36, 47] as [number, number, number, number, number],
    core_numbers: [1, 4] as [number, number],
  };

  const restoreGet = installGetMock(async (url, config) => {
    getCalls.push({ url, config });
    return {
      data: {
        draw_id: 1967,
        status: 'completed',
        player_count: 2,
        total_tickets: 7,
        returned_player_count: 2,
        has_more: false,
        players: [
          {
            rank: 1,
            player_name: 'Player A7C2',
            is_current_user: false,
            ticket_count: 4,
            best_hit: '4+1',
            best_hit_main: 4,
            best_hit_core: 1,
          },
          {
            rank: 2,
            player_name: 'You',
            is_current_user: true,
            ticket_count: 3,
            best_hit: '2+1',
            best_hit_main: 2,
            best_hit_core: 1,
          },
        ],
        best_engine_hit: {
          match_category: '5+0',
          match_main: 5,
          match_core: 0,
          hit_count: 1,
        },
      },
    };
  });
  const restorePatch = installPatchMock(async (url, data, config) => {
    patchCalls.push({ url, data, config });
    return {
      data: {
        status: 'updated',
        ticket: {
          id: ticketId,
          draw_id: 1968,
          ...ticketNumbers,
          created_at: '2026-07-31T12:00:00Z',
        },
      },
    };
  });
  const restoreDelete = installDeleteMock(async (url, config) => {
    deleteCalls.push({ url, config });
    return {
      data: {
        status: 'deleted',
        ticket_id: ticketId,
        draw_id: 1968,
      },
    };
  });
  context.after(() => {
    restoreGet();
    restorePatch();
    restoreDelete();
  });

  const updated = await updateManualTicket(ticketId, ticketNumbers);
  const deleted = await deleteManualTicket(ticketId);
  const scoreboard = await fetchTicketScoreboard(1967);
  const fullScoreboard = await fetchTicketScoreboard(
    1967,
    undefined,
    { includeAllPlayers: true },
  );

  assert.equal(updated.status, 'updated');
  assert.equal(deleted.ticket_id, ticketId);
  assert.equal(scoreboard.players[0].best_hit, '4+1');
  assert.equal(fullScoreboard.returned_player_count, 2);
  assert.equal(scoreboard.best_engine_hit?.match_category, '5+0');
  assert.deepEqual(patchCalls, [
    {
      url: `/api/v1/tickets/${ticketId}`,
      data: ticketNumbers,
      config: { signal: undefined },
    },
  ]);
  assert.deepEqual(deleteCalls, [
    {
      url: `/api/v1/tickets/${ticketId}`,
      config: { signal: undefined },
    },
  ]);
  assert.deepEqual(getCalls, [
    {
      url: '/api/v1/tickets/scoreboard',
      config: {
        signal: undefined,
        params: { draw_id: 1967, limit: 10 },
      },
    },
    {
      url: '/api/v1/tickets/scoreboard',
      config: {
        signal: undefined,
        params: { draw_id: 1967, include_all_players: true },
      },
    },
  ]);
});

test('engine, advisor, and credit responses are wired to the production contract', async (context) => {
  const engine: EngineStatusResponse = {
    draw_id: 1967,
    timezone: 'Europe/Vienna',
    last_draw_at: '2026-07-24T21:00:00+02:00',
    cutoff_at: '2026-07-28T22:00:00+02:00',
    remaining_seconds: 120,
    block_index_since_last_draw: 5,
    block_label: 'Validation',
    block_started_at: '2026-07-28T20:00:00+02:00',
    block_ends_at: '2026-07-28T22:00:00+02:00',
    pipeline_status: 'VALIDATION',
    cycle_status: 'OPEN',
    pipeline_steps: [
      {
        step_order: 1,
        step_name: 'INGESTION',
        status: 'COMPLETED',
        completed_at: '2026-07-24T22:00:00+02:00',
        completion_source: 'sprint_state',
      },
      {
        step_order: 2,
        step_name: 'NORMALIZATION',
        status: 'COMPLETED',
        completed_at: '2026-07-25T02:00:00+02:00',
        completion_source: 'sprint_state',
      },
      {
        step_order: 3,
        step_name: 'FEATURE_ENGINEERING',
        status: 'COMPLETED',
        completed_at: '2026-07-25T08:00:00+02:00',
        completion_source: 'sprint_state',
      },
      {
        step_order: 4,
        step_name: 'SIGNAL_ANALYSIS',
        status: 'COMPLETED',
        completed_at: '2026-07-26T08:00:00+02:00',
        completion_source: 'sprint_state',
      },
      {
        step_order: 5,
        step_name: 'VALIDATION',
        status: 'PENDING',
        completed_at: null,
        completion_source: null,
      },
      {
        step_order: 6,
        step_name: 'READY_FOR_CUTOFF',
        status: 'PENDING',
        completed_at: null,
        completion_source: null,
      },
    ],
  };
  const advisorConfig: AdvisorConfigResponse = {
    contract_version: 'luma.advisor.v8.1',
    pricing_version: 'advisor-pricing-v4',
    enabled: true,
    active_forecast_draw: 1967,
    last_release_draw: 1967,
    pending_forecast_draw: null,
    lifecycle_status: 'ACTIVE',
    unavailable_reason: null,
    historical_analysis_available: true,
    latest_history_draw: 1966,
    historical_anchor_draw: 1967,
    forecast_analysis_available: true,
    earliest_history_draw: 1,
    earliest_signal_history_draw: 1964,
    latest_closed_draw: 1966,
    luma_pro: {
      id: 'luma_pro',
      label: 'LUMA Pro',
      description: 'Pro analysis',
      price_multiplier: '2.00',
      available: true,
      unavailable_reason: null,
    },
    deep_evidence: {
      id: 'deep_evidence',
      label: 'Deep Evidence',
      description: 'Expanded approved evidence',
      price_multiplier: '3.00',
      available: true,
      unavailable_reason: null,
    },
    tones: [],
    signal_layers: [],
    quality_controls: [],
    csv_upload: {
      id: 'csv_upload',
      label: 'CSV',
      description: 'CSV upload',
      credit_surcharge: '0.00',
      available: true,
      unavailable_reason: null,
    },
    pdf_report: {
      id: 'pdf_report',
      label: 'PDF',
      description: 'PDF report',
      credit_surcharge: '0.00',
      available: false,
      unavailable_reason: 'disabled',
    },
    csv_limits: {},
    standard_preset: {},
  };
  const availability: AdvisorAvailabilityResponse = {
    analysis_scope: 'forecast',
    forecast_draw: 1967,
    history_end_draw: 1966,
    base_contract_available: true,
    historical_facts_available: false,
    historical_facts_reason: 'HISTORICAL_DRAW_FACTS_NOT_MATERIALIZED',
    recent_shadow_available: true,
    earliest_history_draw: 1,
    earliest_signal_history_draw: 1964,
    layers: [],
    warnings: [],
  };
  const firstLedgerPage: CreditHistoryResponse = {
    balance: '125.50',
    total_credited: '200.00',
    total_spent: '74.50',
    entries: [
      {
        id: 'ledger-2',
        delta: '-25.00',
        direction: 'DEBIT',
        reason: 'advisor_run',
        label: 'Advisor run',
        ref: 'run-2',
        note: null,
        related_resource_type: 'advisor_run',
        related_resource_id: 'run-2',
        balance_after: '125.50',
        created_at: '2026-07-26T12:00:00Z',
      },
    ],
    has_more: true,
    next_before_created_at: '2026-07-26T12:00:00Z',
    next_before_id: 'ledger-2',
  };
  const finalLedgerPage: CreditHistoryResponse = {
    balance: '125.50',
    total_credited: '200.00',
    total_spent: '74.50',
    entries: [
      {
        id: 'ledger-1',
        delta: '150.50',
        direction: 'CREDIT',
        reason: 'initial_credit',
        label: 'Initial credit',
        ref: null,
        note: null,
        related_resource_type: null,
        related_resource_id: null,
        balance_after: '150.50',
        created_at: '2026-07-25T12:00:00Z',
      },
    ],
    has_more: false,
    next_before_created_at: null,
    next_before_id: null,
  };
  const calls: RecordedGet[] = [];
  let ledgerPage = 0;
  const intelligence: RecentIntelligenceResponse = {
    items: [
      {
        id: '2ebc8aae-a872-47d0-8e7e-7f059216a6b7',
        title: 'Draw 1967 release update',
        body: 'Forecast D1967 is active.',
        image_key: 'luma-release',
        release_date: '2026-07-26',
        message: 'Forecast D1967 is active.',
        created_at: '2026-07-26T20:00:00Z',
      },
    ],
  };
  const restore = installGetMock(async (url, config) => {
    calls.push({ url, config });
    if (url === '/api/v1/engine/status') return { data: engine };
    if (url === '/api/v1/advisor/config') return { data: advisorConfig };
    if (url === '/api/v1/advisor/availability') {
      return { data: availability };
    }
    if (url === '/api/v1/intelligence') return { data: intelligence };
    if (url === '/credits/balance') return { data: { balance: '125.50' } };
    if (url === '/credits/ledger') {
      ledgerPage += 1;
      return {
        data: ledgerPage === 1 ? firstLedgerPage : finalLedgerPage,
      };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  context.after(restore);

  assert.deepEqual(await fetchEngineStatus(), engine);
  assert.deepEqual(await fetchAdvisorConfig(), advisorConfig);
  assert.deepEqual(await fetchAdvisorAvailability({
    analysis_scope: 'forecast',
    forecast_draw: 1967,
    history_end_draw: 1966,
  }), availability);
  assert.deepEqual(await fetchRecentIntelligence(), intelligence);
  assert.equal(await fetchCreditBalance(), 125.5);
  const ledger = await fetchAllCreditLedger();
  assert.deepEqual(ledger, {
    balance: '125.50',
    total_credited: '200.00',
    total_spent: '74.50',
    entries: [
      firstLedgerPage.entries[0],
      finalLedgerPage.entries[0],
    ],
    has_more: false,
    next_before_created_at: null,
    next_before_id: null,
  });

  assert.deepEqual(
    calls.map(({ url, config }) => ({ url, params: config?.params })),
    [
      { url: '/api/v1/engine/status', params: undefined },
      { url: '/api/v1/advisor/config', params: undefined },
      {
        url: '/api/v1/advisor/availability',
        params: {
          analysis_scope: 'forecast',
          forecast_draw: 1967,
          history_end_draw: 1966,
        },
      },
      { url: '/api/v1/intelligence', params: { limit: 20 } },
      { url: '/credits/balance', params: undefined },
      { url: '/credits/ledger', params: { limit: 200 } },
      {
        url: '/credits/ledger',
        params: {
          limit: 200,
          before_created_at: '2026-07-26T12:00:00Z',
          before_id: 'ledger-2',
        },
      },
    ],
  );
});

test('historical Advisor availability sends scope and history boundary without a forecast target', async (context) => {
  const calls: RecordedGet[] = [];
  const availability: AdvisorAvailabilityResponse = {
    analysis_scope: 'historical',
    forecast_draw: null,
    history_end_draw: 1967,
    base_contract_available: true,
    historical_facts_available: true,
    historical_facts_reason: null,
    recent_shadow_available: false,
    earliest_history_draw: 1500,
    earliest_signal_history_draw: 1957,
    layers: [],
    warnings: [],
  };
  const restore = installGetMock(async (url, config) => {
    calls.push({ url, config });
    return { data: availability };
  });
  context.after(restore);

  assert.deepEqual(await fetchAdvisorAvailability({
    analysis_scope: 'historical',
    forecast_draw: null,
    history_end_draw: 1967,
  }), availability);
  assert.deepEqual(calls, [{
    url: '/api/v1/advisor/availability',
    config: {
      signal: undefined,
      params: {
        analysis_scope: 'historical',
        forecast_draw: null,
        history_end_draw: 1967,
      },
    },
  }]);
});

test('completed Advisor reports can self-heal pending PDFs but never bypass disabled PDF', () => {
  assert.equal(
    canRequestAdvisorReportPdf({
      status: 'COMPLETED',
      pdf_status: 'pending',
    }),
    true,
  );
  assert.equal(
    canRequestAdvisorReportPdf({
      status: 'COMPLETED',
      pdf_status: 'ready',
    }),
    true,
  );
  assert.equal(
    canRequestAdvisorReportPdf({
      status: 'COMPLETED',
      pdf_status: 'disabled',
    }),
    false,
  );
  assert.equal(
    canRequestAdvisorReportPdf({
      status: 'GENERATING',
      pdf_status: 'pending',
    }),
    false,
  );
});
