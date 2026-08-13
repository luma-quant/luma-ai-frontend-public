import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterAdvisorReports,
  filterEngineUniverseDraws,
  filterTicketDrawGroups,
  formatAnalyticsTimestamp,
} from './analyticsFilters';
import type {
  AdvisorReportListItem,
  EngineUniverseDraw,
} from './backendData';
import type { TicketDrawGroup } from './ticketPresentation';

function draw(drawId: number, drawDate: string): EngineUniverseDraw {
  return {
    draw_id: drawId,
    draw_date: drawDate,
  } as EngineUniverseDraw;
}

function report(
  id: string,
  completedAt: string,
  overrides: Partial<AdvisorReportListItem> = {},
): AdvisorReportListItem {
  return {
    id,
    analysis_scope: 'forecast',
    forecast_draw: 1968,
    history_end_draw: 1967,
    tone: 'standard',
    luma_pro: false,
    deep_evidence: false,
    signal_layers: [],
    quoted_credits: '175',
    pdf_status: 'ready',
    pdf_download_url: null,
    created_at: completedAt,
    completed_at: completedAt,
    ...overrides,
  };
}

test('Engine Universe filters by draw and date and sorts without mutating input', () => {
  const input = [
    draw(1966, '2026-07-24T20:00:00Z'),
    draw(1968, '2026-07-31T20:00:00Z'),
    draw(1967, '2026-07-28T20:00:00Z'),
  ];
  const result = filterEngineUniverseDraws(input, {
    query: '196',
    dateWindow: '7d',
    sortOrder: 'oldest',
    now: new Date('2026-08-01T20:00:00Z'),
  });

  assert.deepEqual(result.map((item) => item.draw_id), [1967, 1968]);
  assert.deepEqual(input.map((item) => item.draw_id), [1966, 1968, 1967]);
});

test('ticket draw filtering supports latest and oldest views', () => {
  const groups = [1967, 1969, 1968].map((drawId) => ({
    draw_id: drawId,
    items: [],
    best_hit: null,
  })) satisfies TicketDrawGroup[];

  assert.deepEqual(
    filterTicketDrawGroups(groups, { query: '196', sortOrder: 'latest' })
      .map((item) => item.draw_id),
    [1969, 1968, 1967],
  );
  assert.deepEqual(
    filterTicketDrawGroups(groups, { query: '1968', sortOrder: 'oldest' })
      .map((item) => item.draw_id),
    [1968],
  );
});

test('reports filter by type, scope, date, draw, and explicit completion order', () => {
  const input = [
    report('standard', '2026-07-20T10:00:00Z'),
    report('pro-history', '2026-07-31T12:00:00Z', {
      analysis_scope: 'historical',
      history_end_draw: 1967,
      luma_pro: true,
      quoted_credits: '320',
    }),
    report('pro-forecast', '2026-07-30T12:00:00Z', {
      luma_pro: true,
      forecast_draw: 1968,
      quoted_credits: '350',
    }),
  ];

  const result = filterAdvisorReports(input, {
    query: '1967',
    kind: 'pro',
    scope: 'historical',
    dateWindow: '7d',
    sortOrder: 'latest',
    now: new Date('2026-08-01T12:00:00Z'),
  });
  assert.deepEqual(result.map((item) => item.id), ['pro-history']);

  const latestFirst = filterAdvisorReports(input, {
    query: '',
    kind: 'all',
    scope: 'all',
    dateWindow: 'all',
    sortOrder: 'latest',
  });
  assert.deepEqual(
    latestFirst.map((item) => item.id),
    ['pro-history', 'pro-forecast', 'standard'],
  );
});

test('report timestamps include local date and time and fail closed', () => {
  assert.match(
    formatAnalyticsTimestamp('2026-07-31T14:36:00Z'),
    /31\/07\/2026.*\d{2}:\d{2}/,
  );
  assert.equal(formatAnalyticsTimestamp('not-a-date'), 'Time unavailable');
});
