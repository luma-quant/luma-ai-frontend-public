import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTicketScoreboard,
  buildTicketDrawSections,
  canManageManualTicket,
  groupTicketsByDraw,
  mergeTicketPresentationItems,
  resolveEngineBestHits,
  selectTopQualifyingManualTicketHits,
  type TicketPresentationItem,
} from './ticketPresentation';
import type { TicketScoreboardResponse } from './backendData';

const purchased: TicketPresentationItem = {
  id: 'shared-id',
  draw_id: 1967,
  numbers: [1, 2, 3, 4, 5],
  cores: [1, 2],
  label: 'Universe #42',
  source: 'purchased',
};

const evaluatedCopy: TicketPresentationItem = {
  ...purchased,
  label: 'Manual ticket',
  source: 'manual',
  hit_category: '2+1',
};

test('purchased metadata wins regardless of merge order while evaluation is retained', () => {
  for (const groups of [
    [[purchased], [evaluatedCopy]],
    [[evaluatedCopy], [purchased]],
  ]) {
    assert.deepEqual(
      mergeTicketPresentationItems(...groups),
      [{
        ...purchased,
        hit_category: '2+1',
      }],
    );
  }
});

test('manual-only tickets remain manual and stable ids are unique', () => {
  const manual: TicketPresentationItem = {
    id: 'manual-id',
    draw_id: 1967,
    numbers: [6, 7, 8, 9, 10],
    cores: [3, 4],
    label: 'Manual ticket',
    source: 'manual',
  };

  assert.deepEqual(
    mergeTicketPresentationItems([manual], [manual]),
    [manual],
  );
});

test('tickets are grouped into one newest-first card per draw', () => {
  const items: TicketPresentationItem[] = [
    { ...purchased, id: 'older-a', draw_id: 1966, hit_category: '2+0' },
    { ...purchased, id: 'newer', draw_id: 1968 },
    { ...purchased, id: 'older-b', draw_id: 1966, hit_category: '5+0' },
  ];

  const groups = groupTicketsByDraw(items);
  assert.deepEqual(groups.map((group) => group.draw_id), [1968, 1966]);
  assert.equal(groups[1].items.length, 2);
  assert.equal(groups[1].best_hit, '5+0');
});

test('manual winning tickets are quality-sorted, thresholded at 2+0, and limited', () => {
  const manual = (id: string, hit_category?: string): TicketPresentationItem => ({
    ...purchased,
    id,
    source: 'manual',
    ...(hit_category === undefined ? {} : { hit_category }),
  });
  const items: TicketPresentationItem[] = [
    manual('stable-first', '3+1'),
    manual('below-threshold', '1+2'),
    { ...manual('purchased-win', '5+2'), source: 'purchased' },
    manual('best', '5+0'),
    manual('minimum-win', '2+0'),
    { ...manual('legacy-win', '4+2'), source: 'legacy' },
    manual('stable-second', '3+1'),
    manual('pending'),
  ];

  assert.deepEqual(
    selectTopQualifyingManualTicketHits(items, 3).map((item) => item.id),
    ['best', 'stable-first', 'stable-second'],
  );
  assert.deepEqual(
    selectTopQualifyingManualTicketHits(items, 10).map((item) => item.id),
    ['best', 'stable-first', 'stable-second', 'minimum-win'],
  );
  assert.deepEqual(selectTopQualifyingManualTicketHits(items, 0), []);
});

test('pending D1969 stays editable while evaluated D1968 and D1967 stay in history', () => {
  const sections = buildTicketDrawSections([
    { ...purchased, id: 'd1968', draw_id: 1968, hit_category: '2+1' },
    { ...purchased, id: 'd1967', draw_id: 1967, hit_category: '5+0' },
  ], 1969);

  assert.deepEqual(sections.upcoming, {
    draw_id: 1969,
    items: [],
    best_hit: null,
  });
  assert.deepEqual(sections.past.map((group) => group.draw_id), [1968, 1967]);
});

test('ticket scoreboard prioritizes hit quality over raw ticket count', () => {
  const items: TicketPresentationItem[] = [
    { ...purchased, id: 'top', draw_id: 1966, hit_category: '5+0' },
    ...Array.from({ length: 20 }, (_, index) => ({
      ...purchased,
      id: `low-${index}`,
      draw_id: 1965,
      hit_category: '2+0',
    })),
    { ...purchased, id: 'pending', draw_id: 1968 },
  ];

  assert.deepEqual(buildTicketScoreboard(items), {
    draw_count: 3,
    ticket_count: 22,
    evaluated_count: 21,
    best_hit: '5+0',
  });
});

test('only manual tickets in the engine-open ticket draw can be edited or deleted', () => {
  const manual: TicketPresentationItem = {
    ...purchased,
    id: 'manual-preparing',
    draw_id: 1969,
    source: 'manual',
  };

  assert.equal(canManageManualTicket(manual, 1969), true);
  assert.equal(canManageManualTicket({ ...manual, draw_id: 1968 }, 1969), false);
  assert.equal(canManageManualTicket({ ...manual, source: 'purchased' }, 1969), false);
  assert.equal(canManageManualTicket(manual, null), false);
});

test('engine comparison accepts two new hits and falls back to the legacy singular hit', () => {
  const base: TicketScoreboardResponse = {
    draw_id: 1968,
    status: 'completed',
    player_count: 0,
    total_tickets: 0,
    returned_player_count: 0,
    has_more: false,
    players: [],
    best_engine_hit: {
      match_category: '5+0',
      match_main: 5,
      match_core: 0,
      hit_count: 1,
    },
  };

  assert.deepEqual(
    resolveEngineBestHits(base).map((item) => item.match_category),
    ['5+0'],
  );
  assert.deepEqual(
    resolveEngineBestHits({
      ...base,
      best_engine_hits: [
        {
          match_category: '4+2',
          match_main: 4,
          match_core: 2,
          hit_count: 3,
        },
        {
          match_category: '5+0',
          match_main: 5,
          match_core: 0,
          hit_count: 1,
        },
        {
          match_category: '3+2',
          match_main: 3,
          match_core: 2,
          hit_count: 10,
        },
      ],
    }).map((item) => item.match_category),
    ['5+0', '4+2'],
  );
});
