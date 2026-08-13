import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildManualTicketsCsv,
  selectManualTicketsForCsv,
} from './manualTicketCsv';
import type { TicketPresentationItem } from './ticketPresentation';

function ticket(
  id: string,
  drawId: number,
  source: TicketPresentationItem['source'] = 'manual',
): TicketPresentationItem {
  return {
    id,
    draw_id: drawId,
    numbers: [1, 2, 3, 4, 5],
    cores: [6, 7],
    label: 'Manual ticket',
    source,
  };
}

test('manual ticket CSV selects every manual draw and excludes non-manual rows', () => {
  const selected = selectManualTicketsForCsv([
    ticket('manual-old', 1967),
    ticket('purchased', 1969, 'purchased'),
    ticket('manual-new-b', 1969),
    ticket('legacy', 1968, 'legacy'),
    ticket('manual-new-a', 1969),
  ]);

  assert.deepEqual(
    selected.map((item) => [item.draw_id, item.id]),
    [
      [1969, 'manual-new-a'],
      [1969, 'manual-new-b'],
      [1967, 'manual-old'],
    ],
  );
});

test('manual ticket CSV has a stable cross-draw schema and escapes ticket ids', () => {
  assert.equal(
    buildManualTicketsCsv([
      ticket('older', 1967),
      ticket('new,"quoted"', 1969),
      ticket('not-owned-manual-play', 1968, 'purchased'),
    ]),
    [
      'ticket_id,draw_id,main_1,main_2,main_3,main_4,main_5,star_1,star_2',
      '"new,""quoted""",1969,1,2,3,4,5,6,7',
      'older,1967,1,2,3,4,5,6,7',
      '',
    ].join('\r\n'),
  );
});

test('empty manual history produces only the importable CSV header', () => {
  assert.equal(
    buildManualTicketsCsv([ticket('purchased', 1969, 'purchased')]),
    'ticket_id,draw_id,main_1,main_2,main_3,main_4,main_5,star_1,star_2\r\n',
  );
});
