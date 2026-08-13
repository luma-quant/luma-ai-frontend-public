import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const advisor = readFileSync(
  new URL('../components/LumaAdvisor.tsx', import.meta.url),
  'utf8',
);
const authSession = readFileSync(
  new URL('../auth/useAuthSession.ts', import.meta.url),
  'utf8',
);
const runSummary = readFileSync(
  new URL('../components/RunSummary.tsx', import.meta.url),
  'utf8',
);
const analyticsLedger = readFileSync(
  new URL('../components/AnalyticsLedger.tsx', import.meta.url),
  'utf8',
);

test('Advisor restoration rehydrates the accepted CSV preview from run or retry state', () => {
  assert.match(
    advisor,
    /const activeUploadId = activeRun[\s\S]*ACTIVE_ADVISOR_RUN_STATUSES\.has\(activeRun\.status\)[\s\S]*\? activeRun\.upload_id[\s\S]*const restoredUploadId = activeUploadId\s*\?\? retrySnapshot\?\.request\.upload_id/,
  );
  assert.match(
    advisor,
    /fetchAdvisorCsvPreview\(\s*restoredUploadId,/,
  );
  assert.match(advisor, /uploadedCsv\.row_count_accepted\.toLocaleString\(\)/);
  assert.match(advisor, /uploadedCsv\?\.original_filename/);
});

test('completed runs release their consumed CSV before another analysis', () => {
  const completedBranch = advisor.slice(
    advisor.indexOf("if (run.status === 'COMPLETED')"),
    advisor.indexOf("if (run.status === 'FAILED')"),
  );
  assert.match(completedBranch, /setSelectedFile\(null\)/);
  assert.match(completedBranch, /setUploadedCsv\(null\)/);
  assert.match(completedBranch, /setCsvUploadError\(null\)/);
  assert.match(completedBranch, /fileInputRef\.current\.value = ''/);
  assert.match(advisor, /rows validated/);
  assert.doesNotMatch(advisor, /rows ready/);
});

test('safe evidence completion mode is passed to both report surfaces', () => {
  assert.match(
    advisor,
    /recoveryMode=\{activeRun\?\.recovery_mode \?\? null\}/,
  );
  assert.match(
    analyticsLedger,
    /recoveryMode=\{selectedReport\.recovery_mode \?\? null\}/,
  );
});

test('failed-run actions are gated by exact submission reconstruction', () => {
  assert.match(
    advisor,
    /const canRecoverFailedSubmission = Boolean\([\s\S]*canReconstructAdvisorSubmission/,
  );
  assert.match(
    advisor,
    /\{canRecoverFailedSubmission && \([\s\S]*Refresh status[\s\S]*Review settings[\s\S]*Retry analysis/,
  );
  assert.match(
    advisor,
    /performGeneration\(undefined, retrySnapshot\.request\)/,
  );
});

test('Advisor cooldown blocks mutating actions and only updates a visible countdown', () => {
  assert.match(advisor, /advisorRunSubmissionRetryAfterMs/);
  assert.match(advisor, /persistAdvisorRunRetryNotBefore/);
  assert.match(
    advisor,
    /const handleRetryAnalysis = \(\) => \{[\s\S]*runActionInFlightRef\.current[\s\S]*guardAdvisorRunCooldown\(\)[\s\S]*setFailureAction\('retry'\)/,
  );
  assert.match(
    advisor,
    /disabled=\{failureAction !== null \|\| runRetryBlocked\}/,
  );
  assert.match(
    advisor,
    /No analysis will restart automatically\./,
  );
  const cooldownEffect = advisor.match(
    /useEffect\(\(\) => \{\s*if \(runRetryNotBeforeMs === null\)[\s\S]*?\}, \[runRetryNotBeforeMs\]\);/,
  )?.[0];
  assert.ok(cooldownEffect);
  assert.match(cooldownEffect, /window\.setInterval\(updateCooldown, 1_000\)/);
  assert.doesNotMatch(cooldownEffect, /performGeneration|createAdvisorRun/);
  assert.match(
    runSummary,
    /runCooldownLabel[\s\S]*disabled[\s\S]*\{runCooldownLabel\}/,
  );
  assert.match(
    advisor,
    /isAdvisorCooldownNotice[\s\S]*'Analysis retry paused'/,
  );
  assert.match(
    advisor,
    /isTerminalAdvisorFailure[\s\S]*activeRun\?\.status === 'FAILED'/,
  );
});

test('terminal failures offer one-click private issue reporting only for the failed run', () => {
  assert.match(advisor, /reportAdvisorIssue\(runId\)/);
  assert.match(advisor, /markAdvisorIssueReported\(window\.localStorage, runId\)/);
  assert.match(
    advisor,
    /\{isTerminalAdvisorFailure && \([\s\S]*Report this issue/,
  );
  assert.match(
    advisor,
    /Issue reported\. Your reserved credits were returned\./,
  );
  assert.match(
    advisor,
    /activeIssueReportUi\.state === 'submitting'[\s\S]*disabled=\{activeIssueReportUi\.state === 'submitting'\}/,
  );
  assert.match(
    advisor,
    /advisorIssueResultBelongsToActiveRun\(\s*runId,\s*activeRunIdRef\.current,\s*\)[\s\S]*setIssueReportUi\(\{ runId, state: 'reported'/,
  );
});

test('saved run state is cleared only after an authenticated 404', () => {
  assert.match(
    advisor,
    /function isDefinitivelyMissingAdvisorRun[\s\S]*=== 404;/,
  );
  assert.match(
    advisor,
    /catch \(restoreError\)[\s\S]*if \(!isDefinitivelyMissingAdvisorRun\(restoreError\)\) \{\s*throw restoreError;\s*\}\s*clearCurrentAdvisorRun/,
  );
  assert.doesNotMatch(
    advisor,
    /catch \{[\s\S]{0,160}clearCurrentAdvisorRun/,
  );
});

test('saved completed runs are presented instead of discarded during restoration', () => {
  const restoreBlock = advisor.slice(
    advisor.indexOf('const restoreRun = async () =>'),
    advisor.indexOf('void restoreRun();'),
  );
  assert.match(
    restoreBlock,
    /const restored = await fetchAdvisorRun[\s\S]*run = restored;/,
  );
  assert.doesNotMatch(
    restoreBlock,
    /if \(restored\.status === 'COMPLETED'\) \{\s*clearCurrentAdvisorRun/,
  );
  assert.match(restoreBlock, /presentAdvisorRun\(run\)/);
});

test('restoration prefers a strictly newer active run over a saved terminal run', () => {
  assert.match(
    advisor,
    /function isStrictlyNewerAdvisorRun[\s\S]*candidateCreatedAt > baselineCreatedAt/,
  );
  const restoreBlock = advisor.slice(
    advisor.indexOf('const restoreRun = async () =>'),
    advisor.indexOf('void restoreRun();'),
  );
  assert.match(
    restoreBlock,
    /!ACTIVE_ADVISOR_RUN_STATUSES\.has\(restored\.status\)[\s\S]*fetchActiveAdvisorRun[\s\S]*isStrictlyNewerAdvisorRun\(newerActiveRun, restored\)[\s\S]*run = newerActiveRun/,
  );
});

test('failed-run refresh never overwrites a different current run identity', () => {
  const refreshBlock = advisor.slice(
    advisor.indexOf('const handleRefreshStatus = async () =>'),
    advisor.indexOf('const handleReviewSettings = () =>'),
  );
  assert.match(
    refreshBlock,
    /currentBeforeRefresh[\s\S]*currentBeforeRefresh\.run_id !== failureRecoveryRunId[\s\S]*currentBeforeRefresh\.run_id/,
  );
  assert.match(
    refreshBlock,
    /currentAfterRefresh[\s\S]*currentAfterRefresh\.run_id !== refreshRunId[\s\S]*fetchAdvisorRun\(refreshRunId, controller\.signal\)[\s\S]*else \{\s*persistCurrentAdvisorRun/,
  );
});

test('confirmed auth-session exit clears private Advisor state without navigation cleanup', () => {
  assert.match(
    authSession,
    /const logout = useCallback\(\(\) => \{\s*clearTokenPair\(\);\s*clearAdvisorBrowserState\(window\.localStorage\);/,
  );
  assert.equal(
    authSession.match(/clearAdvisorBrowserState\(window\.localStorage\)/g)?.length,
    3,
  );
  assert.doesNotMatch(advisor, /clearAdvisorBrowserState/);
});
