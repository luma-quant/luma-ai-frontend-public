import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeStageName,
  readEngineDrawId,
  readEnginePresentationDrawId,
  isPendingPipelineProjection,
  toPipelineStages,
} from './enginePipeline';

test('pipeline normalizes string and object stage names without runtime coercion', () => {
  assert.equal(normalizeStageName('featureEngineering'), 'FEATURE_ENGINEERING');
  assert.equal(
    normalizeStageName({ name: { value: 'signal-analysis' } }),
    'SIGNAL_ANALYSIS',
  );
  assert.equal(normalizeStageName(undefined), 'UNKNOWN_STAGE');
});

test('closed release uses the pending draw timeline as an explicit projection', () => {
  const data = {
    draw_id: 1968,
    pipeline_status: 'READY_FOR_CUTOFF',
    pipeline_steps: [
      { step_order: 0, step_name: 'INGESTION', status: 'COMPLETED' },
    ],
    released_draw_id: 1968,
    pending_draw_id: 1969,
    lifecycle_status: 'WAITING_FOR_SPRINTSTATE',
    pending_pipeline_steps: [
      { step_order: 0, step_name: 'INGESTION', status: 'ELAPSED' },
      { step_order: 1, step_name: 'NORMALIZATION', status: 'ACTIVE' },
      { step_order: 2, step_name: 'FEATURE_ENGINEERING', status: 'UPCOMING' },
    ],
  };

  assert.equal(isPendingPipelineProjection(data), true);
  assert.equal(readEngineDrawId(data), 1968);
  assert.equal(readEnginePresentationDrawId(data), 1969);
  assert.deepEqual(
    toPipelineStages(data).map(({ name, status, detail }) => ({ name, status, detail })),
    [
      { name: 'INGESTION', status: 'completed', detail: 'Window elapsed · projection' },
      { name: 'NORMALIZATION', status: 'active', detail: 'Current window · preparing' },
      { name: 'FEATURE_ENGINEERING', status: 'pending', detail: 'Upcoming window · projection' },
    ],
  );
});

test('pipeline accepts object-valued backend stages and unknown entries safely', () => {
  const stages = toPipelineStages({
    draw_id: 1967,
    pipeline_status: { value: 'validation' },
    pipeline_steps: [
      {
        step_order: 2,
        step_name: { name: 'validation' },
        status: { value: 'pending' },
        completed_at: null,
      },
      {
        step_order: 1,
        step_name: 'signal_analysis',
        status: 'COMPLETED',
        completed_at: 'not-a-date',
      },
      null,
    ],
  });

  assert.deepEqual(
    stages.map(({ name, status, detail }) => ({ name, status, detail })),
    [
      {
        name: 'SIGNAL_ANALYSIS',
        status: 'completed',
        detail: 'Completed',
      },
      {
        name: 'VALIDATION',
        status: 'active',
        detail: 'In progress',
      },
      {
        name: 'UNKNOWN_STAGE',
        status: 'unknown',
        detail: 'Status unavailable',
      },
    ],
  );
  assert.equal(readEngineDrawId({ draw_id: 1967 }), 1967);
  assert.equal(readEngineDrawId({ draw_id: '1967' }), null);
});
