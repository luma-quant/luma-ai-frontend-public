import assert from 'node:assert/strict';
import test from 'node:test';

import { advisorProgressView } from './advisorProgress';

test('advisor progress uses the authoritative run phase and percentage', () => {
  assert.deepEqual(advisorProgressView('QUERYING', 37.6), {
    label: 'Loading governed data',
    percent: 38,
  });
  assert.deepEqual(advisorProgressView('QA_REVIEW', 92), {
    label: 'Running quality review',
    percent: 92,
  });
});

test('advisor progress clamps invalid server values safely', () => {
  assert.deepEqual(advisorProgressView('QUEUED', -12), {
    label: 'Queued securely',
    percent: 0,
  });
  assert.deepEqual(advisorProgressView('GENERATING', 140), {
    label: 'Generating evidence-based report',
    percent: 100,
  });
  assert.deepEqual(advisorProgressView(undefined, Number.NaN), {
    label: 'Restoring analysis',
    percent: 0,
  });
});
