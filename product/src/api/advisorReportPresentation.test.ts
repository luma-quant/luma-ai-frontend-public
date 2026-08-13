import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  advisorPressureBarWidth,
  advisorReportDialogTitle,
  advisorReportPdfFilename,
  advisorReportScopeLabel,
  advisorSignalIsInRiskWatchlist,
  advisorSignalRiskRankLabel,
  formatAdvisorModelMetric,
  formatAdvisorMovement,
  formatAdvisorSignalScore,
  humanizeAdvisorIdentifier,
  splitAdvisorReportMarkdown,
} from './advisorReportPresentation';

const forecast = {
  id: 'forecast-run',
  analysis_scope: 'forecast' as const,
  forecast_draw: 1969,
  history_end_draw: 1968,
};

const historical = {
  id: 'history-run',
  analysis_scope: 'historical' as const,
  forecast_draw: 1969,
  history_end_draw: 1968,
};

const analyticsLedger = readFileSync(
  new URL('../components/AnalyticsLedger.tsx', import.meta.url),
  'utf8',
);

test('forecast report presentation names the forecast draw', () => {
  assert.equal(advisorReportScopeLabel(forecast), 'Forecast draw 1969');
  assert.equal(
    advisorReportDialogTitle(forecast),
    'ADVISOR REPORT · FORECAST DRAW 1969',
  );
  assert.equal(
    advisorReportPdfFilename(forecast),
    'LUMA_Advisor_D1969_forecast-run.pdf',
  );
});

test('historical report presentation uses its history boundary, not forecast wording', () => {
  assert.equal(
    advisorReportScopeLabel(historical),
    'Historical analysis through draw 1968',
  );
  assert.equal(
    advisorReportDialogTitle(historical),
    'ADVISOR REPORT · HISTORY THROUGH DRAW 1968',
  );
  assert.equal(
    advisorReportPdfFilename(historical),
    'LUMA_Advisor_HISTORY_TO_D1968_history-run.pdf',
  );
});

test('reader-summary formatting stays bounded and plain-English', () => {
  const signals = [
    { rank: 1, number: 22, conflict_status: 'LEADING_TOXIC_RISK_OVERLAP' as const, risk_rank_status: 'HIGHER_CONTINUOUS_RISK_SCORE_WATCHLIST' as const, d9_release_score: 4, d9_physics_score: 0.37, d9_overfit_risk: null, d9_toxicity_score: null },
    { rank: 2, number: 47, conflict_status: 'OUTSIDE_LEADING_TOXIC_RISK_OVERLAP' as const, risk_rank_status: 'OUTSIDE_DISPLAYED_RISK_SCORE_WATCHLIST' as const, d9_release_score: 2, d9_physics_score: 0.42, d9_overfit_risk: null, d9_toxicity_score: null },
  ];
  assert.equal(formatAdvisorModelMetric(0.392459), '39.2%');
  assert.equal(formatAdvisorSignalScore(0.716494), '0.7165');
  assert.equal(formatAdvisorMovement({ number: 3, late_minus_early_rate: 0.014 }), '+1.40 pp');
  assert.equal(humanizeAdvisorIdentifier('FAMILY_AX0_AX7_BRIDGE'), 'Family AX0 AX7 Bridge');
  assert.equal(advisorPressureBarWidth(signals[0], signals), 100);
  assert.equal(advisorPressureBarWidth(signals[1], signals), 50);
  assert.equal(advisorSignalIsInRiskWatchlist(signals[0]), true);
  assert.equal(advisorSignalIsInRiskWatchlist(signals[1]), false);
  assert.equal(advisorSignalRiskRankLabel(signals[0]), 'Higher risk-score watchlist');
  assert.equal(advisorSignalRiskRankLabel(signals[1]), 'Outside displayed watchlist');
  assert.doesNotMatch(
    `${advisorSignalRiskRankLabel(signals[0])} ${advisorSignalRiskRankLabel(signals[1])}`,
    /safe|toxic|conflict/iu,
  );
});

test('legacy risk status is rendered through the same neutral watchlist vocabulary', () => {
  const legacy = {
    rank: 1,
    number: 22,
    conflict_status: 'LEADING_TOXIC_RISK_OVERLAP' as const,
    d9_release_score: 0.7,
    d9_overfit_risk: 0.5,
    d9_toxicity_score: 0.6,
  };

  assert.equal(advisorSignalIsInRiskWatchlist(legacy), true);
  assert.equal(advisorSignalRiskRankLabel(legacy), 'Higher risk-score watchlist');
  assert.doesNotMatch(advisorSignalRiskRankLabel(legacy), /safe|toxic|conflict/iu);
});

test('technical audit trail is collapsed only when the reader summary is present', () => {
  const markdown = '# Report\n\n## Executive Summary\nReadable.\n\n## Technical Audit Trail\nCLM-001 [SRC-001]';
  assert.deepEqual(splitAdvisorReportMarkdown(markdown, true), {
    narrativeMarkdown: '# Report\n\n## Executive Summary\nReadable.',
    technicalAuditMarkdown: '## Technical Audit Trail\nCLM-001 [SRC-001]',
  });
  assert.deepEqual(splitAdvisorReportMarkdown(markdown, false), {
    narrativeMarkdown: markdown,
    technicalAuditMarkdown: '',
  });
});

test('Analytics Ledger applies scope-aware labels to cards, dialogs, and PDF downloads', () => {
  assert.match(analyticsLedger, /advisorReportScopeLabel\(report\)/);
  assert.match(analyticsLedger, /advisorReportDialogTitle\(selectedReport\)/);
  assert.match(analyticsLedger, /advisorReportPdfFilename\(selectedReport\)/);
  assert.doesNotMatch(analyticsLedger, /LUMA_Advisor_D\$\{selectedReport\.forecast_draw\}/);
});
