import type {
  EngineBestHit,
  TicketScoreboardResponse,
} from './backendData';

export interface TicketPresentationItem {
  id: string;
  draw_id: number;
  numbers: number[];
  cores: number[];
  label: string;
  source: 'manual' | 'purchased' | 'legacy';
  hit_category?: string;
  payout?: number;
}

export interface TicketDrawGroup {
  draw_id: number;
  items: TicketPresentationItem[];
  best_hit: string | null;
}

export interface TicketScoreboard {
  draw_count: number;
  ticket_count: number;
  evaluated_count: number;
  best_hit: string | null;
}

export interface TicketDrawSections {
  upcoming: TicketDrawGroup | null;
  past: TicketDrawGroup[];
}

export function resolveEngineBestHits(
  scoreboard: TicketScoreboardResponse | null,
): EngineBestHit[] {
  if (!scoreboard) return [];
  const candidates = scoreboard.best_engine_hits?.length
    ? scoreboard.best_engine_hits
    : scoreboard.best_engine_hit
      ? [scoreboard.best_engine_hit]
      : [];
  const seen = new Set<string>();
  return candidates
    .filter((item) => {
      if (seen.has(item.match_category)) return false;
      seen.add(item.match_category);
      return true;
    })
    .sort((left, right) => (
      right.match_main - left.match_main
      || right.match_core - left.match_core
    ))
    .slice(0, 2);
}

const HIT_QUALITY_ORDER = [
  '5+2', '5+1', '5+0',
  '4+2', '4+1', '4+0',
  '3+2', '3+1', '3+0',
  '2+2', '2+1', '2+0',
  '1+2', '1+1', '1+0',
  '0+2', '0+1', '0+0',
] as const;

const LOWEST_QUALIFYING_HIT = '2+0';

function hitQualityIndex(category: string | undefined): number {
  if (!category) return Number.POSITIVE_INFINITY;
  const index = HIT_QUALITY_ORDER.indexOf(
    category as (typeof HIT_QUALITY_ORDER)[number],
  );
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

/** True for EuroMillions prize tiers at 2+0 or better. */
export function isQualifyingTicketHit(
  item: Pick<TicketPresentationItem, 'hit_category'>,
): boolean {
  const index = hitQualityIndex(item.hit_category);
  return index <= hitQualityIndex(LOWEST_QUALIFYING_HIT);
}

/**
 * Selects a stable, quality-first list of the current user's manual winning tickets.
 * Equal hit categories retain their original order.
 */
export function selectTopQualifyingManualTicketHits(
  items: readonly TicketPresentationItem[],
  limit: number,
): TicketPresentationItem[] {
  const safeLimit = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : 0;
  return items
    .map((item, position) => ({ item, position }))
    .filter(({ item }) => item.source === 'manual' && isQualifyingTicketHit(item))
    .sort((left, right) => (
      hitQualityIndex(left.item.hit_category) - hitQualityIndex(right.item.hit_category)
      || left.position - right.position
    ))
    .slice(0, safeLimit)
    .map(({ item }) => item);
}

export function bestTicketHit(
  items: readonly TicketPresentationItem[],
): string | null {
  let best: string | null = null;
  let bestIndex = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const index = hitQualityIndex(item.hit_category);
    if (index < bestIndex) {
      best = item.hit_category ?? null;
      bestIndex = index;
    }
  }
  return best;
}

/** Manual entries can only be changed for the draw currently open for tickets. */
export function canManageManualTicket(
  item: Pick<TicketPresentationItem, 'draw_id' | 'source'>,
  ticketTargetDraw: number | null,
): boolean {
  return item.source === 'manual' && item.draw_id === ticketTargetDraw;
}

/** One card per draw, newest draw first. */
export function groupTicketsByDraw(
  items: readonly TicketPresentationItem[],
): TicketDrawGroup[] {
  const byDraw = new Map<number, TicketPresentationItem[]>();
  for (const item of items) {
    const group = byDraw.get(item.draw_id) ?? [];
    group.push(item);
    byDraw.set(item.draw_id, group);
  }

  return [...byDraw.entries()]
    .sort(([left], [right]) => right - left)
    .map(([draw_id, groupItems]) => ({
      draw_id,
      items: [...groupItems].sort((left, right) => left.id.localeCompare(right.id)),
      best_hit: bestTicketHit(groupItems),
    }));
}

/** Keeps the engine-open ticket draw separate from completed ticket history. */
export function buildTicketDrawSections(
  items: readonly TicketPresentationItem[],
  ticketTargetDraw: number | null,
): TicketDrawSections {
  const groups = groupTicketsByDraw(items);
  if (ticketTargetDraw === null) {
    return { upcoming: null, past: groups };
  }

  return {
    upcoming: groups.find((group) => group.draw_id === ticketTargetDraw) ?? {
      draw_id: ticketTargetDraw,
      items: [],
      best_hit: null,
    },
    past: groups.filter((group) => group.draw_id !== ticketTargetDraw),
  };
}

export function buildTicketScoreboard(
  items: readonly TicketPresentationItem[],
): TicketScoreboard {
  return {
    draw_count: new Set(items.map((item) => item.draw_id)).size,
    ticket_count: items.length,
    evaluated_count: items.filter((item) => item.hit_category !== undefined).length,
    best_hit: bestTicketHit(items),
  };
}

/**
 * The ticket evaluation endpoint contains manual and purchased tickets, while
 * the purchased-tip endpoint contains the immutable Universe metadata. Keep
 * one row per stable ticket id, prefer that purchased metadata, and enrich it
 * with evaluation fields when both sources describe the same ticket.
 */
export function mergeTicketPresentationItems(
  ...groups: TicketPresentationItem[][]
): TicketPresentationItem[] {
  const byId = new Map<string, TicketPresentationItem>();
  for (const group of groups) {
    for (const item of group) {
      const current = byId.get(item.id);
      if (!current) {
        byId.set(item.id, item);
        continue;
      }

      const purchased = current.source === 'purchased'
        ? current
        : item.source === 'purchased'
          ? item
          : null;
      if (purchased) {
        const evaluation = current.source === 'manual' ? current : item;
        const merged = { ...purchased };
        const hitCategory =
          evaluation.hit_category ?? purchased.hit_category;
        const payout = evaluation.payout ?? purchased.payout;
        if (hitCategory !== undefined) merged.hit_category = hitCategory;
        if (payout !== undefined) merged.payout = payout;
        byId.set(item.id, merged);
        continue;
      }

      const merged = { ...current };
      const hitCategory = item.hit_category ?? current.hit_category;
      const payout = item.payout ?? current.payout;
      if (hitCategory !== undefined) merged.hit_category = hitCategory;
      if (payout !== undefined) merged.payout = payout;
      byId.set(item.id, merged);
    }
  }
  return [...byId.values()];
}
