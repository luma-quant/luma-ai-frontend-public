import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const advisor = readFileSync(
  new URL('../components/LumaAdvisor.tsx', import.meta.url),
  'utf8',
);

test('historical mode keeps Pro and runtime-backed signal layers available', () => {
  assert.match(
    advisor,
    /advisorConfig\?\.luma_pro\.available \?\? lumaProAvailable/,
  );
  assert.doesNotMatch(
    advisor,
    /analysisScope === 'forecast'\s*&&\s*\(advisorConfig\?\.luma_pro\.available/,
  );
  assert.doesNotMatch(
    advisor,
    /analysisScope === 'historical'\s*\?\s*\[\]/,
  );

  const scopeHandler = advisor.slice(
    advisor.indexOf('const selectAnalysisScope'),
    advisor.indexOf('const ConfigurationPanel'),
  );
  assert.doesNotMatch(scopeHandler, /setActiveAssets\(\[\]\)/);
  assert.doesNotMatch(scopeHandler, /setIsProModeActive\?\.\(false\)/);
});

test('the Standard Data Contract preset remains forecast-bound', () => {
  assert.match(
    advisor,
    /analysisScope === 'forecast' && forecastAnalysisAvailable/,
  );
  assert.match(
    advisor,
    /This preset requires an active forecast release\./,
  );
});
