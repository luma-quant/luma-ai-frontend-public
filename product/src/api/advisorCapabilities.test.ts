import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterAvailableAdvisorLayers,
  normalizeAdvisorLayerSelection,
} from './advisorCapabilities';

test('normalizes corrupted and duplicate stored layer selections', () => {
  assert.deepEqual(
    normalizeAdvisorLayerSelection([
      'TRIADS_ENGINE',
      'TRIADS_ENGINE',
      null,
      42,
      '',
      'MOTION_FIELD',
    ]),
    ['TRIADS_ENGINE', 'MOTION_FIELD'],
  );
  assert.deepEqual(normalizeAdvisorLayerSelection('TRIADS_ENGINE'), []);
});

test('keeps only layers available in both config and the active release', () => {
  const configuredLayers = [
    {
      id: 'TRIADS_ENGINE',
      label: 'Triads Engine',
      description: 'Triad evidence.',
      available: true,
      unavailable_reason: null,
      credit_surcharge: '10.00',
    },
    {
      id: 'MOTION_FIELD',
      label: 'Motion Field',
      description: 'Motion evidence.',
      available: false,
      unavailable_reason: 'AGGREGATE_VIEW_NOT_CONFIGURED',
      credit_surcharge: '10.00',
    },
    {
      id: 'GHOST_VECTOR',
      label: 'Ghost Vector',
      description: 'Ghost evidence.',
      available: true,
      unavailable_reason: null,
      credit_surcharge: '10.00',
    },
  ];
  const runtimeLayers = [
    {
      layer_id: 'TRIADS_ENGINE',
      available: true,
      source: 'triads_view',
      reason: null,
      earliest_history_draw: 1964,
      latest_history_draw: 1966,
    },
    {
      layer_id: 'MOTION_FIELD',
      available: true,
      source: 'motion_view',
      reason: null,
      earliest_history_draw: 1964,
      latest_history_draw: 1966,
    },
    {
      layer_id: 'GHOST_VECTOR',
      available: false,
      source: null,
      reason: 'advisor_release_not_ready',
      earliest_history_draw: null,
      latest_history_draw: null,
    },
  ];

  assert.deepEqual(
    filterAvailableAdvisorLayers(
      ['GHOST_VECTOR', 'TRIADS_ENGINE', 'MOTION_FIELD', 'TRIADS_ENGINE'],
      configuredLayers,
      runtimeLayers,
    ),
    ['TRIADS_ENGINE'],
  );
  assert.deepEqual(
    filterAvailableAdvisorLayers(['TRIADS_ENGINE'], configuredLayers, null),
    [],
  );
});
