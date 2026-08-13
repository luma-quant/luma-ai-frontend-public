import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const advisor = readFileSync(
  new URL('../components/LumaAdvisor.tsx', import.meta.url),
  'utf8',
);
const summary = readFileSync(
  new URL('../components/RunSummary.tsx', import.meta.url),
  'utf8',
);

test('historical calibration uses both selected horizon boundaries', () => {
  assert.match(
    advisor,
    /forecast_draw: requestBoundaryDraw,[\s\S]*history_end_draw: horizonEnd/,
  );
  assert.match(
    advisor,
    /analysisScope === 'historical' \? horizonEnd : historyMax/,
  );
  assert.match(
    advisor,
    /analysisScope === 'historical' \? end : historyMax/,
  );
  assert.match(advisor, /if \(val < horizonStart\) setHorizonStart\(val\)/);
  assert.match(
    advisor,
    /resolvedScope === 'historical'[\s\S]*Math\.max\(config\.earliest_history_draw, horizonEnd\)/,
  );
  assert.match(
    advisor,
    /\[analysisScope, capabilityRefreshRevision, horizonEnd\]/,
  );
});

test('signal-layer action chips contain labels without nested info controls', () => {
  const chipGrid = advisor.slice(
    advisor.indexOf('{assetTags.map(tag =>'),
    advisor.indexOf('{/* Sektor Pro: Deep Synthesis */}'),
  );
  assert.match(chipGrid, /<span className="whitespace-nowrap">\{tag\.label\}<\/span>/);
  assert.doesNotMatch(chipGrid, /<Info/);
  assert.doesNotMatch(chipGrid, /<Popover/);
});

test('forecast-only preset guidance and direct action semantics are explicit', () => {
  assert.match(
    advisor,
    /standardPresetRequiresForecast[\s\S]*Switch to Forecast Analysis to use this preset\./,
  );
  assert.match(advisor, /aria-label="Run Standard Data Contract V8\.1"/);
  assert.match(advisor, />\s*Run Standard Data Contract V8\.1\s*</);
});

test('expanded cost breakdown has disclosure and framed detail styling', () => {
  assert.match(summary, /aria-expanded=\{isOpen\}/);
  assert.match(summary, /Hide cost breakdown/);
  assert.match(summary, /border-accent-cyan\/25 bg-canvas\/45 p-3/);
  assert.match(summary, /Estimated total/);
});
