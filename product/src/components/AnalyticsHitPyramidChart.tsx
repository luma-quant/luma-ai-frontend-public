import type { HitPyramidItem } from '../api/backendData';

type AnalyticsHitPyramidChartProps = {
  items: readonly HitPyramidItem[];
};

/**
 * A quality-first prize-tier ladder.
 *
 * Row order and rung width represent prize quality, never raw frequency. That
 * keeps a rare 5+x result visually above thousands of 2+x combinations. Exact
 * counts remain available on hover/focus and to assistive technology.
 */
export function AnalyticsHitPyramidChart({
  items,
}: AnalyticsHitPyramidChartProps) {
  const bestHit = items.find((item) => item.count > 0) ?? null;

  return (
    <div className="flex h-full w-full flex-col" aria-label="Hit quality ladder">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-500">
          Highest tier first
        </span>
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-accent-cyan">
          {bestHit ? `Best hit ${bestHit.category}` : 'No qualifying hits'}
        </span>
      </div>

      <div className="grid flex-1 grid-rows-12 gap-1">
        {items.map((item, index) => {
          const hasHits = item.count > 0;
          const rungWidth = 100 - index * 4.5;
          return (
            <div
              key={item.category}
              className="group relative grid min-h-0 grid-cols-[38px_1fr] items-center gap-2 rounded px-1 outline-none focus-visible:ring-1 focus-visible:ring-accent-cyan/70"
              tabIndex={0}
              aria-label={`${item.category}: ${item.count.toLocaleString()} ${item.count === 1 ? 'hit' : 'hits'}`}
            >
              <span className={`text-[10px] font-mono font-bold ${
                hasHits ? 'text-accent-cyan' : 'text-slate-600'
              }`}>
                {item.category}
              </span>
              <div className="relative h-2 rounded-full bg-white/[0.035]">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    hasHits
                      ? 'bg-gradient-to-r from-[#0A8CFF] to-[#27D8FF] shadow-[0_0_10px_rgba(39,216,255,0.28)]'
                      : 'bg-white/[0.025]'
                  }`}
                  style={{ width: `${rungWidth}%` }}
                />
                {hasHits && (
                  <span
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-white/60 bg-[#27D8FF] shadow-[0_0_10px_rgba(39,216,255,0.75)]"
                    style={{ left: `calc(${rungWidth}% - 5px)` }}
                  />
                )}
              </div>
              <div className="pointer-events-none absolute right-2 z-20 rounded-md border border-accent-cyan/20 bg-[#080d18]/95 px-2 py-1 font-mono text-[10px] text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                {item.count.toLocaleString()} {item.count === 1 ? 'hit' : 'hits'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
