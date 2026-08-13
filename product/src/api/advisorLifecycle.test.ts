import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advisorAnalysisBoundaryDraw,
  advisorHistoricalHistoryEnd,
  advisorForecastPreparationMessage,
  advisorHeaderDrawLabel,
  isAdvisorAnalysisScopeBlocked,
  isAdvisorForecastPreparing,
  isAdvisorHistoricalAnalysisAvailable,
  isAdvisorLifecycleBlocked,
  resolveAdvisorAnalysisScope,
  type AdvisorLifecycleContract,
} from './advisorLifecycle';

const active: AdvisorLifecycleContract = {
  enabled: true,
  active_forecast_draw: 1968,
  pending_forecast_draw: null,
  lifecycle_status: 'ACTIVE',
  unavailable_reason: null,
  historical_analysis_available: true,
  latest_history_draw: 1967,
  historical_anchor_draw: 1968,
  forecast_analysis_available: true,
};

const preparing: AdvisorLifecycleContract = {
  enabled: true,
  active_forecast_draw: null,
  pending_forecast_draw: 1969,
  lifecycle_status: 'WAITING_FOR_NEXT_RELEASE',
  unavailable_reason: 'advisor_waiting_for_next_release',
  historical_analysis_available: true,
  latest_history_draw: 1967,
  historical_anchor_draw: 1968,
  forecast_analysis_available: false,
};

test('active Advisor lifecycle preserves the existing draw presentation', () => {
  assert.equal(isAdvisorForecastPreparing(active), false);
  assert.equal(isAdvisorLifecycleBlocked(active), false);
  assert.equal(advisorForecastPreparationMessage(active), null);
  assert.equal(advisorHeaderDrawLabel(active), 'DRAW 1968');
});

test('closed draw gap presents the pending draw without advancing the active pointer', () => {
  assert.equal(preparing.active_forecast_draw, null);
  assert.equal(isAdvisorForecastPreparing(preparing), true);
  assert.equal(isAdvisorLifecycleBlocked(preparing), false);
  assert.equal(isAdvisorAnalysisScopeBlocked(preparing, 'forecast'), true);
  assert.equal(isAdvisorAnalysisScopeBlocked(preparing, 'historical'), false);
  assert.equal(isAdvisorHistoricalAnalysisAvailable(preparing), true);
  assert.equal(advisorHistoricalHistoryEnd(preparing), 1967);
  assert.equal(advisorAnalysisBoundaryDraw(preparing, 'historical'), 1968);
  assert.equal(advisorAnalysisBoundaryDraw(preparing, 'forecast'), null);
  assert.equal(resolveAdvisorAnalysisScope(preparing, 'forecast'), 'historical');
  assert.equal(
    advisorForecastPreparationMessage(preparing),
    'Forecast D1969 is being prepared',
  );
  assert.equal(advisorHeaderDrawLabel(preparing), 'DRAW 1969 \u00b7 PREPARING');
});

test('unavailable lifecycle stays blocked without inventing a pending draw', () => {
  const unavailable: AdvisorLifecycleContract = {
    enabled: true,
    active_forecast_draw: null,
    pending_forecast_draw: null,
    lifecycle_status: 'UNAVAILABLE',
    unavailable_reason: 'advisor_draw_cycle_not_ready',
    historical_analysis_available: false,
    latest_history_draw: null,
    historical_anchor_draw: null,
    forecast_analysis_available: false,
  };
  assert.equal(isAdvisorForecastPreparing(unavailable), false);
  assert.equal(isAdvisorLifecycleBlocked(unavailable), true);
  assert.equal(advisorForecastPreparationMessage(unavailable), null);
  assert.equal(advisorHeaderDrawLabel(unavailable), 'DRAW UNAVAILABLE');
});

test('historical analysis fails closed when the server anchor is inconsistent', () => {
  const inconsistent: AdvisorLifecycleContract = {
    ...preparing,
    historical_anchor_draw: 1969,
  };
  assert.equal(advisorHistoricalHistoryEnd(inconsistent), null);
  assert.equal(isAdvisorHistoricalAnalysisAvailable(inconsistent), false);
  assert.equal(isAdvisorLifecycleBlocked(inconsistent), true);
});
