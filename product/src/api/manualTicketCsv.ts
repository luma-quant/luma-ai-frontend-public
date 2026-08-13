import type { TicketPresentationItem } from './ticketPresentation';

const MANUAL_TICKET_CSV_HEADER = [
  'ticket_id',
  'draw_id',
  'main_1',
  'main_2',
  'main_3',
  'main_4',
  'main_5',
  'star_1',
  'star_2',
] as const;

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

/**
 * Export the owner's complete manual-ticket history, independent of the
 * currently visible My Tickets filters. Purchased and legacy rows are not
 * user-authored manual plays and are deliberately excluded.
 */
export function selectManualTicketsForCsv(
  items: readonly TicketPresentationItem[],
): TicketPresentationItem[] {
  return items
    .filter((item) => item.source === 'manual')
    .sort((left, right) => (
      right.draw_id - left.draw_id
      || left.id.localeCompare(right.id)
    ));
}

export function buildManualTicketsCsv(
  items: readonly TicketPresentationItem[],
): string {
  const rows = selectManualTicketsForCsv(items).map((ticket) => [
    ticket.id,
    ticket.draw_id,
    ...ticket.numbers,
    ...ticket.cores,
  ].map(csvCell).join(','));

  return [
    MANUAL_TICKET_CSV_HEADER.join(','),
    ...rows,
  ].join('\r\n').concat('\r\n');
}
