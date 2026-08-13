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

test('deep evidence is explicit, quote-bound, and defaults off', () => {
  assert.match(advisor, /\{ deep_evidence: effectiveDeepEvidence \}/);
  assert.match(advisor, /useState\(\(\) => \{[\s\S]*luma_deep_evidence/);
  assert.match(advisor, /setDeepEvidence\(request\.deep_evidence === true\)/);
  assert.match(advisor, /complete configured price is multiplied by three/i);
});

test('a stored deep-evidence choice survives capability loading safely', () => {
  assert.match(
    advisor,
    /const effectiveDeepEvidence = deepEvidenceAvailable && deepEvidence/,
  );
  assert.match(
    advisor,
    /advisorConfig !== null && !deepEvidenceAvailable && deepEvidence/,
  );
  assert.match(advisor, /\{ deep_evidence: effectiveDeepEvidence \}/);
});

test('the Standard Data Contract preset explicitly disables deep evidence', () => {
  const preset = advisor.match(
    /const handlePresetGenerate = \(\) => \{([\s\S]*?)\n  \};/,
  );
  assert.ok(preset);
  assert.match(preset[1], /tone: 'standard'/);
  assert.match(preset[1], /luma_pro: false/);
  assert.match(preset[1], /deep_evidence: false/);
});

test('the UI describes the privacy boundary and server-priced multiplier', () => {
  assert.match(advisor, /Raw uploaded CSV rows and private storage data are never sent/);
  assert.match(advisor, /Deep Evidence Active · 3×/);
  assert.match(summary, /Evidence depth/);
  assert.match(summary, /Deep · 3×/);
});
