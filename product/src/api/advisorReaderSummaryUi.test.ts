import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { AdvisorReaderSummary } from './backendData';
import { AdvisorReportView } from '../components/AdvisorReportView';

function richReaderSummary(): AdvisorReaderSummary {
  return {
    contract_version: 'luma.advisor.reader-summary.v1',
    forecast_boundary: {
      analysis_scope: 'forecast',
      forecast_draw: 1969,
      data_cutoff_draw: 1968,
      history_start_draw: 1957,
      history_end_draw: 1968,
      history_draw_count: 12,
      forecast_outcome_used: false,
    },
    model_state: {
      primary_family: 'FAMILY_AX0_AX7_BRIDGE',
      secondary_family: 'FAMILY_AX3_DOMINANT',
      confidence: 0.396839,
      uncertainty: 0.603161,
    },
    number_groups: [
      {
        group_id: 'PRESSURE_OUTSIDE_LEADING_CONFLICT',
        title: 'Legacy safe pressure title',
        status: 'AVAILABLE',
        numbers: [41, 47, 40, 43],
        explanation: 'Legacy conflict wording must not reach the reader.',
      },
      {
        group_id: 'EMERGING_CHANGE',
        title: 'Emerging change',
        status: 'AVAILABLE',
        numbers: [3, 26],
        explanation: 'Signals that appear in the approved emerging-change evidence.',
      },
      {
        group_id: 'CONFLICTED_PRESSURE',
        title: 'Legacy toxic title',
        status: 'AVAILABLE',
        numbers: [22, 46, 18, 33],
        explanation: 'Legacy toxic wording must not reach the reader.',
      },
      {
        group_id: 'NEUTRAL_BASELINE_USER_SELECTED',
        title: 'User-selected neutral baseline',
        status: 'UNAVAILABLE',
        numbers: [],
        explanation: 'No user-selected baseline was supplied.',
      },
    ],
    ranked_pressure_signals: [
      {
        rank: 1,
        number: 41,
        conflict_status: 'OUTSIDE_LEADING_TOXIC_RISK_OVERLAP',
        risk_rank_status: 'OUTSIDE_DISPLAYED_RISK_SCORE_WATCHLIST',
        d9_release_score: 0.738986,
        d9_physics_score: 0.451302,
        d9_overfit_risk: 0.451447,
        d9_toxicity_score: 0.608948,
        toxic_high_negative_flag: false,
        labels: ['RELEASE_CANDIDATE'],
      },
      {
        rank: 2,
        number: 22,
        conflict_status: 'LEADING_TOXIC_RISK_OVERLAP',
        risk_rank_status: 'HIGHER_CONTINUOUS_RISK_SCORE_WATCHLIST',
        d9_release_score: 0.724865,
        d9_physics_score: 0.37028,
        d9_overfit_risk: 0.522408,
        d9_toxicity_score: 0.7,
        toxic_high_negative_flag: false,
        labels: ['RELEASE_CANDIDATE'],
      },
    ],
    risk_semantics: {
      classification: 'CONTINUOUS_MODEL_RISK_RANKING',
      binary_toxicity_claim_allowed: false,
      safe_number_claim_allowed: false,
      displayed_watchlist_size: 4,
      description: 'Server description may contain legacy toxic/conflict vocabulary.',
    },
    historical_movement: {
      status: 'AVAILABLE',
      requested_start_draw: 1957,
      requested_end_draw: 1968,
      draw_count: 12,
      rising_main_numbers: [{ number: 3, late_minus_early_rate: 0.014 }],
      falling_main_numbers: [{ number: 5, late_minus_early_rate: -0.008 }],
    },
    data_coverage: {
      status: 'AVAILABLE',
      modules: [{ module: 'PRESSURE_BOARD', status: 'AVAILABLE' }],
      selected_signal_layers: [],
      unavailable_selected_signal_layers: [],
      customer_csv: {
        selected: true,
        status: 'AVAILABLE',
        raw_rows_shared_with_model: false,
      },
    },
    signal_exposure_guide: {
      contract_version: 'luma.advisor.signal-exposure-guide.v1',
      classification: 'NON_PROBABILISTIC_PORTFOLIO_HEURISTIC',
      derived_from_model_probabilities: false,
      automatic_ticket_generation: false,
      scope: 'Repeated selections only.',
      allocations: [
        { group_id: 'PRESSURE_OUTSIDE_LEADING_CONFLICT', orientation_percent: 40, maximum_percent: null },
        { group_id: 'EMERGING_CHANGE', orientation_percent: 30, maximum_percent: null },
        { group_id: 'NEUTRAL_BASELINE_USER_SELECTED', orientation_percent: 20, maximum_percent: null },
        { group_id: 'CONFLICTED_PRESSURE', orientation_percent: null, maximum_percent: 10 },
      ],
    },
    relative_evidence_balance: {
      contract_version: 'luma.advisor.relative-evidence-balance.v1',
      basis: 'NORMALIZED_D9_RELEASE_SCORE',
      derived_from_winning_probabilities: false,
      automatic_ticket_generation: false,
      user_selection_only: true,
      explanation: 'Relative shares are derived only from the displayed D9 release evidence.',
      entries: [
        { rank: 1, number: 41, d9_release_score: 0.738986, relative_evidence_share_percent: 50.48 },
        { rank: 2, number: 22, d9_release_score: 0.724865, relative_evidence_share_percent: 49.52 },
      ],
    },
    customer_csv_analysis: {
      contract_version: 'luma.advisor.customer-csv-analysis.v1',
      status: 'AVAILABLE',
      source: 'LUMA_FINAL120_PROFILE',
      analysis_scope: 'STRUCTURAL_COMPOSITION_ONLY',
      accepted_row_count: 120,
      valid_ticket_count: 120,
      invalid_ticket_count: 0,
      unique_ticket_count: 120,
      duplicate_ticket_count: 0,
      top20_member_count: 20,
      realized_performance_included: false,
      performance_claims_allowed: false,
      interpretation: 'The uploaded cohort is described through aggregate structure only.',
      ranked_main_number_frequencies: [{ rank: 1, number: 41, count: 18 }],
      ranked_star_number_frequencies: [{ rank: 1, number: 10, count: 25 }],
      distinct_coverage: {
        main_numbers_observed: 50,
        main_number_domain_size: 50,
        star_numbers_observed: 12,
        star_number_domain_size: 12,
      },
      selection_arm_distribution: [
        { value: 'A_HISTORICAL_INTERACTION_SHADOW', count: 40 },
        { value: 'B_REGION_DENSITY', count: 40 },
        { value: 'C_ISOLATED_OUTLIER', count: 40 },
      ],
      score_band_distribution: [
        { value: 'BAND_1', count: 29 },
        { value: 'BAND_2', count: 20 },
        { value: 'BAND_3', count: 26 },
        { value: 'BAND_4', count: 45 },
      ],
      mode_distribution: [{ value: 'DEEP_EXPLORER_MODE', count: 40 }],
      odd_main_count_distribution: [
        { value: '2', count: 56 },
        { value: '3', count: 64 },
      ],
      consecutive_pair_count_distribution: [
        { value: '0', count: 88 },
        { value: '1', count: 32 },
      ],
      main_sum_summary: { minimum: 73, mean: 127.4, maximum: 188 },
      numeric_summaries: [
        { metric: 'pair_density', label: 'Pair density', minimum: 0.05, mean: 0.22, maximum: 0.61 },
      ],
    },
    ghost_cluster: {
      contract_version: 'luma.advisor.ghost-cluster-reader.v1',
      numbers: [5, 24, 27],
      explanation: 'Bounded ghost-cluster evidence from the approved pressure board.',
    },
  };
}

test('rich reader summary renders actionable model and Final120 aggregates before narrative', () => {
  const markup = renderToStaticMarkup(createElement(AdvisorReportView, {
    markdown: '## Direct Response\nReadable narrative.\n\n## Technical Audit Trail\nCLM-001 [SRC-001]',
    readerSummary: richReaderSummary(),
  }));

  for (const expected of [
    'Model-relative scores · not probabilities',
    'Release',
    'Physics',
    'Risk',
    'Overfit',
    'Higher risk-score watchlist',
    'Outside displayed watchlist',
    'Distinct main-number coverage',
    'Distinct star-number coverage',
    'Selection-arm mix',
    'Score-band mix',
    'Mode mix',
    'Build your own evidence shortlist',
    '01 · Compare',
    '04 · Decide',
    'Odd main-number count',
    'Consecutive-pair count',
    'Main-number sum',
    'Pair density',
    'Relative Evidence Balance',
    'Shares normalize the approved D9 release scores',
    'Scenario Construction Brief',
    'Cross-lane comparison',
    'Risk-overlap stress test',
    'Rotation contrast',
    'Subtle-pressure contrast',
    'Ghost / subtle pressure',
    'Star handling:',
    'Portfolio cross-check:',
  ]) {
    assert.ok(markup.includes(expected), `missing reader summary copy: ${expected}`);
  }

  assert.doesNotMatch(markup, /safe|toxic|conflict/iu);
  assert.doesNotMatch(markup, /Legacy application guide/);
  assert.match(markup, /not generated tickets/iu);
  assert.match(markup, /final numbers, counts and proportions remain entirely your choice/iu);
  assert.doesNotMatch(markup, /generate 20|twenty tickets|fixed ratio/iu);

  const readerIndex = markup.indexOf('The situation');
  const uploadIndex = markup.indexOf('Uploaded ticket structure');
  const narrativeIndex = markup.indexOf('Report narrative');
  const auditIndex = markup.indexOf('Technical Audit Trail');
  assert.ok(readerIndex >= 0);
  assert.ok(uploadIndex > readerIndex);
  assert.ok(narrativeIndex > uploadIndex);
  assert.ok(auditIndex > narrativeIndex);
});

test('legacy reader payload renders through neutral fallbacks without additive fields', () => {
  const rich = richReaderSummary();
  const legacy: AdvisorReaderSummary = {
    ...rich,
    risk_semantics: undefined,
    relative_evidence_balance: undefined,
    ranked_pressure_signals: rich.ranked_pressure_signals.map((signal) => ({
      rank: signal.rank,
      number: signal.number,
      conflict_status: signal.conflict_status,
      d9_release_score: signal.d9_release_score,
      d9_overfit_risk: signal.d9_overfit_risk,
      d9_toxicity_score: signal.d9_toxicity_score,
    })),
    customer_csv_analysis: null,
  };

  const markup = renderToStaticMarkup(createElement(AdvisorReportView, {
    markdown: '## Executive Summary\nLegacy report.',
    readerSummary: legacy,
  }));

  assert.match(markup, /continuous model ranking/iu);
  assert.match(markup, /Higher risk-score watchlist/);
  assert.match(markup, /Outside displayed watchlist/);
  assert.match(markup, /Legacy application guide/);
  assert.doesNotMatch(markup, /safe|toxic|conflict/iu);
});

test('reader summary never invents a ratio when no approved balance exists', () => {
  const unavailable: AdvisorReaderSummary = {
    ...richReaderSummary(),
    signal_exposure_guide: null,
    relative_evidence_balance: null,
    customer_csv_analysis: null,
  };

  const markup = renderToStaticMarkup(createElement(AdvisorReportView, {
    markdown: '## Executive Summary\nNo balance available.',
    readerSummary: unavailable,
  }));

  assert.match(markup, /Relative Evidence Balance unavailable/);
  assert.match(markup, /does not invent a selection ratio/);
  assert.doesNotMatch(markup, /40%|30%|20%|max 10%/);
});

test('scenario brief hides comparison frames with missing prerequisite lanes and never invents star guidance', () => {
  const sparse: AdvisorReaderSummary = {
    ...richReaderSummary(),
    number_groups: richReaderSummary().number_groups.map((group) => ({
      ...group,
      status: group.group_id === 'CONFLICTED_PRESSURE' ? 'AVAILABLE' : 'UNAVAILABLE',
      numbers: group.group_id === 'CONFLICTED_PRESSURE' ? [22, 46] : [],
    })),
    ghost_cluster: null,
    customer_csv_analysis: null,
  };

  const markup = renderToStaticMarkup(createElement(AdvisorReportView, {
    markdown: '## Executive Summary\nSparse report.',
    readerSummary: sparse,
  }));

  assert.match(markup, /Scenario Construction Brief/);
  assert.match(markup, /No multi-lane comparison frame is supported/);
  assert.doesNotMatch(markup, /Cross-lane comparison|Risk-overlap stress test|Rotation contrast|Subtle-pressure contrast/);
  assert.match(markup, /No approved star-selection evidence is available/);
  assert.match(markup, /instead of inventing a neutral distribution/);
  assert.doesNotMatch(markup, /40%|30%|20%|max 10%/);
});

test('historical reader shows only descriptive historical comparison frames', () => {
  const historical: AdvisorReaderSummary = {
    ...richReaderSummary(),
    forecast_boundary: {
      ...richReaderSummary().forecast_boundary,
      analysis_scope: 'historical',
      forecast_draw: null,
      data_cutoff_draw: null,
      forecast_outcome_used: false,
    },
  };

  const markup = renderToStaticMarkup(createElement(AdvisorReportView, {
    markdown: '## Executive Summary\nHistorical report.',
    readerSummary: historical,
  }));

  assert.match(markup, /Historical movement contrast/);
  assert.match(markup, /Rising historical movement/);
  assert.match(markup, /Falling historical movement/);
  assert.doesNotMatch(markup, /Cross-lane comparison|Risk-overlap stress test|Rotation contrast|Subtle-pressure contrast/);
  assert.doesNotMatch(markup, /Build your own evidence shortlist/);
  assert.match(markup, /Movement direction is not a forecast instruction/);
});

test('safe evidence fallback is presented as a usable non-blocking completion', () => {
  const markup = renderToStaticMarkup(createElement(AdvisorReportView, {
    markdown: [
      '## Evidence-Safe Recovery',
      'Only approved source-bound evidence is included.',
    ].join('\n'),
    readerSummary: richReaderSummary(),
    recoveryMode: 'SAFE_EVIDENCE_FALLBACK',
  }));

  assert.match(markup, /Evidence-safe report completed/);
  assert.match(markup, /verified evidence sections/);
  assert.match(markup, /limited to approved, source-bound data/);
  assert.doesNotMatch(markup, /Analysis Failed/);
  assert.doesNotMatch(markup, /SAFE_EVIDENCE_FALLBACK/);
});

test('ordinary completed reports do not show the recovery notice', () => {
  const markup = renderToStaticMarkup(createElement(AdvisorReportView, {
    markdown: '## Executive Summary\nCompleted normally.',
    readerSummary: richReaderSummary(),
  }));

  assert.doesNotMatch(markup, /Evidence-safe report completed/);
});
