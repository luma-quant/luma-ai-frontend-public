import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const analyticsLedger = readFileSync(
  new URL('../components/AnalyticsLedger.tsx', import.meta.url),
  'utf8',
);
const advisor = readFileSync(
  new URL('../components/LumaAdvisor.tsx', import.meta.url),
  'utf8',
);
const backendData = readFileSync(
  new URL('./backendData.ts', import.meta.url),
  'utf8',
);
const scenarioRecovery = readFileSync(
  new URL('./advisorTipScenarioRecovery.ts', import.meta.url),
  'utf8',
);
const scenarioErrors = readFileSync(
  new URL('./advisorTipScenarioErrors.ts', import.meta.url),
  'utf8',
);
const ticketGenerator = readFileSync(
  new URL('../components/ReportTicketGenerator.tsx', import.meta.url),
  'utf8',
);
const dialog = readFileSync(
  new URL('../components/ui/Dialog.tsx', import.meta.url),
  'utf8',
);

test('Analytics exposes compact English filters for all three tabs', () => {
  for (const label of [
    'Find draw',
    'All tickets',
    'Upcoming',
    'Evaluated',
    'All report types',
    'All analysis scopes',
    'All dates',
    'Last 7 days',
    'Last 30 days',
    'Latest first',
    'Oldest first',
    'Clear filters',
  ]) {
    assert.match(analyticsLedger, new RegExp(label));
  }
  assert.match(analyticsLedger, /filterEngineUniverseDraws\(/);
  assert.match(analyticsLedger, /filterTicketDrawGroups\(/);
  assert.match(analyticsLedger, /filterAdvisorReports\(/);
});

test('My Tickets exports the complete manual history independently of visible filters', () => {
  assert.match(analyticsLedger, /Export all manual tickets/);
  assert.match(analyticsLedger, /luma-manual-tickets-all-draws\.csv/);
  assert.match(
    analyticsLedger,
    /handleDownloadAllManualTicketsCsv[\s\S]*selectManualTicketsForCsv\(tips\)/,
  );
  assert.doesNotMatch(
    analyticsLedger,
    /handleDownloadAllManualTicketsCsv[\s\S]{0,900}(filteredUpcomingTicketGroup|filteredPastTicketGroups|generatedTicketDrafts)/,
  );
});

test('report cards show a local completion date and time', () => {
  assert.match(
    analyticsLedger,
    /formatAnalyticsTimestamp\(report\.completed_at\)/,
  );
  assert.doesNotMatch(
    analyticsLedger,
    /new Date\(report\.completed_at\)\.toLocaleDateString/,
  );
});

test('completed reports can be dismissed without breaking active-run recovery', () => {
  assert.match(advisor, /clearCurrentAdvisorRun\(window\.localStorage, run\.id\)/);
  assert.match(advisor, /const restored = await fetchAdvisorRun[\s\S]*run = restored;/);
  assert.match(advisor, /if \(ACTIVE_ADVISOR_RUN_STATUSES\.has\(run\.status\)\)/);
  assert.match(advisor, /onClick=\{handleDismissReport\}/);
  assert.match(advisor, />\s*New analysis\s*</);
  assert.match(advisor, /const handleReset = \(\) => \{\s*handleDismissReport\(\)/);
});

test('scoreboards keep compact top-ten requests and support full player rankings', () => {
  assert.match(backendData, /\{ draw_id: drawId, limit: 10 \}/);
  assert.match(backendData, /\{ draw_id: drawId, include_all_players: true \}/);
  assert.match(backendData, /includeAllPlayers\?: boolean/);
  assert.match(analyticsLedger, /\{ includeAllPlayers: true \}/);
  assert.match(analyticsLedger, /scoreboard\.best_engine_hit/);
  assert.doesNotMatch(analyticsLedger, /best_engine_hits\.map/);
});

test('Engine Universe cards expose best-hit context and open as one action', () => {
  assert.match(analyticsLedger, /draw\.evaluation\.summary\.total_hits/);
  assert.match(analyticsLedger, />\s*Best hit\s*</);
  assert.match(analyticsLedger, /Open draw analysis/);
  assert.doesNotMatch(analyticsLedger, /View Details/);
});

test('draw details navigate only through filtered draws and use module accordions', () => {
  assert.match(analyticsLedger, /const filteredDetailDraws = useMemo/);
  assert.match(analyticsLedger, /aria-label="Filtered draw navigation"/);
  assert.match(analyticsLedger, /aria-label="Previous available draw"/);
  assert.match(analyticsLedger, /aria-label="Next available draw"/);
  assert.match(analyticsLedger, /function EvaluationModuleAccordion/);
  assert.match(analyticsLedger, /<details className="group\/module/);
  assert.match(
    analyticsLedger,
    /activeTab === 'draws' && isCatalogDraw\(selectedDraw\) && \([\s\S]*?Evaluation Modules/,
  );
  assert.match(
    analyticsLedger,
    /selectedDraw !== null && \(\s*<section[\s\S]*aria-label="Tickets for selected draw"/,
  );
  assert.doesNotMatch(analyticsLedger, /Personal Ledger Grid/);
});

test('draw detail helper copy and filter controls keep the requested alignment', () => {
  assert.match(
    analyticsLedger,
    /ml-auto text-right[\s\S]*Prize tier priority · hover for counts/,
  );
  assert.ok((analyticsLedger.match(/pl-3 pr-9/g) ?? []).length >= 5);
});

test('report and ticket cards reveal their primary actions on hover and keyboard focus', () => {
  assert.match(analyticsLedger, /isUpcoming \? 'Ticket workspace' : 'Results available'/);
  assert.match(analyticsLedger, /'Report and PDF ready' : 'Report ready'/);
  assert.match(analyticsLedger, /aria-label=\{`Open report for \$\{advisorReportScopeLabel\(report\)\}`\}/);
  assert.ok(
    (analyticsLedger.match(
      /group-hover:translate-y-0 group-hover:opacity-100 group-focus:translate-y-0 group-focus:opacity-100/g,
    ) ?? []).length >= 2,
  );
  assert.ok(
    (analyticsLedger.match(
      /\[@media\(hover:none\)\]:translate-y-0 \[@media\(hover:none\)\]:opacity-100/g,
    ) ?? []).length >= 2,
  );
});

test('AI ticket generation opens from My Tickets in a dedicated full-screen workspace', () => {
  const generationHandler = analyticsLedger.match(
    /const handleGenerateScenarios[\s\S]*?const handleDownloadScenarioCsv/,
  )?.[0] ?? '';
  for (const expected of [
    'aria-label="Upcoming ticket workspace"',
    'aria-label="AI ticket generator launcher"',
    'aria-label="AI ticket generator workspace"',
    'Open generator',
    'AI Ticket Generator',
    'Review credit quote',
    '20-120 editable manual tickets per batch',
    'Always 1 CR per ticket',
    'New batches add unique rows',
    'including 1,000 tickets',
    'nothing is submitted or played automatically',
    'Manual Ticket Set',
    'Download CSV',
  ]) {
    assert.ok(`${analyticsLedger}\n${ticketGenerator}`.includes(expected));
  }
  assert.doesNotMatch(analyticsLedger, /Report Scenario Builder/);
  assert.match(analyticsLedger, /open=\{Boolean\(selectedDraw && !isForecastTicketPanel\)\}/);
  assert.match(analyticsLedger, /variant="workspace"/);
  assert.match(dialog, /variant\?: 'modal' \| 'side-panel' \| 'workspace'/);
  assert.match(dialog, /fixed inset-2[\s\S]*sm:inset-4/);
  assert.match(analyticsLedger, /aria-label="Advisor report archive"/);
  assert.match(ticketGenerator, /selectedReportIds\.length >= 5/);
  assert.match(analyticsLedger, /selectedDraw !== report\.forecast_draw/);
  assert.match(analyticsLedger, /Math\.min\(120, Math\.max\(20/);
  assert.match(analyticsLedger, /generateAdvisorTipScenarios\(/);
  assert.match(generationHandler, /createPendingAdvisorTipScenarioGeneration\(/);
  assert.match(generationHandler, /executePendingScenarioGeneration\(pending\)/);
  assert.doesNotMatch(generationHandler, /crypto\.randomUUID\(\)[\s\S]*generateAdvisorTipScenarios\(/);
  assert.doesNotMatch(generationHandler, /saveManualTicket\(/);
});

test('paid AI ticket generation is durable, idempotent, delivered, and reconciled', () => {
  assert.match(analyticsLedger, /submitPendingAdvisorTipScenarioGeneration\(/);
  assert.match(analyticsLedger, /readPendingAdvisorTipScenarioGeneration\(/);
  assert.match(ticketGenerator, /Exact paid request saved/);
  assert.match(ticketGenerator, /Tickets are being saved to My Tickets/);
  assert.match(ticketGenerator, /Resume exact request/);
  assert.match(ticketGenerator, /Check delivery now/);
  assert.match(ticketGenerator, /formatAdvisorTipScenarioRetryCountdown\(/);
  assert.match(analyticsLedger, /reconcileAdvisorTipScenarioTickets\(/);
  assert.match(analyticsLedger, /result\.status === 'pending_delivery'/);
  assert.match(analyticsLedger, /!result\.saved_to_tickets/);
  assert.match(analyticsLedger, /advisorTipDeliveryAutoRetryDelayMs\(completedRetries\)/);
  assert.match(analyticsLedger, /Use Check delivery now to resume safely/);
  assert.match(analyticsLedger, /setOffcanvasTips\([\s\S]*mergeTicketPresentationItems/);
  assert.match(scenarioRecovery, /persistPendingAdvisorTipScenarioGeneration\(storage, pending\)/);
  assert.match(scenarioRecovery, /generation_id: result\.generation_id/);
  assert.match(scenarioRecovery, /submissionsInFlight\.get\(pending\.idempotency_key\)/);
  assert.match(scenarioRecovery, /generate\(\s*pending\.request,\s*pending\.idempotency_key,\s*pending\.quote/);
  assert.ok(
    scenarioRecovery.indexOf('persistPendingAdvisorTipScenarioGeneration(storage, pending)')
      < scenarioRecovery.indexOf('submission = generate('),
  );
  assert.match(scenarioErrors, /advisor_tip_generation_collision/);
  assert.match(scenarioErrors, /advisor_tip_idempotency_conflict/);
});
