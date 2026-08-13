import assert from 'node:assert/strict';
import test from 'node:test';

import apiClient from './apiClient';
import {
  REPORTED_ADVISOR_ISSUES_STORAGE_KEY,
  advisorIssueResultBelongsToActiveRun,
  hasReportedAdvisorIssue,
  markAdvisorIssueReported,
  reportAdvisorIssue,
} from './advisorIssueReporting';

const RUN_ID = '9d79bc3c-a859-4bd0-9415-d9040b02d514';
const NEXT_RUN_ID = '8eaf22cc-a3ba-4f33-995e-3f23f19ae100';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

test('Advisor issue receipts are persisted once per valid run id', () => {
  const storage = memoryStorage();
  assert.equal(hasReportedAdvisorIssue(storage, RUN_ID), false);

  markAdvisorIssueReported(storage, RUN_ID);
  markAdvisorIssueReported(storage, RUN_ID);

  assert.equal(hasReportedAdvisorIssue(storage, RUN_ID), true);
  assert.deepEqual(
    JSON.parse(storage.getItem(REPORTED_ADVISOR_ISSUES_STORAGE_KEY) ?? ''),
    { version: 1, run_ids: [RUN_ID] },
  );
});

test('Advisor issue receipts fail closed for malformed browser state', () => {
  const storage = memoryStorage();
  storage.setItem(REPORTED_ADVISOR_ISSUES_STORAGE_KEY, JSON.stringify({
    version: 1,
    run_ids: ['not-a-run-id'],
  }));
  assert.equal(hasReportedAdvisorIssue(storage, RUN_ID), false);
  assert.throws(
    () => markAdvisorIssueReported(storage, 'not-a-run-id'),
    /invalid Advisor run id/,
  );
});

test('Advisor issue reporting sends only the run id in the route', async (context) => {
  const originalPost = apiClient.post;
  let request: { url: string; body: unknown } | null = null;
  apiClient.post = (async (url: string, body?: unknown) => {
    request = { url, body };
    return {
      data: {
        id: '76558d4f-1c89-43fa-afbe-94d2bc38b194',
        advisor_run_id: RUN_ID,
        status: 'new',
        created_at: '2026-08-02T18:30:00Z',
        already_reported: false,
      },
    };
  }) as typeof apiClient.post;
  context.after(() => {
    apiClient.post = originalPost;
  });

  const response = await reportAdvisorIssue(RUN_ID);

  assert.deepEqual(request, {
    url: `/api/v1/feedback/advisor-runs/${RUN_ID}`,
    body: undefined,
  });
  assert.equal(response.advisor_run_id, RUN_ID);
  assert.equal(response.already_reported, false);
  assert.doesNotMatch(JSON.stringify(request), /prompt|filename|file_contents/i);
});

test('Advisor issue reporting rejects invalid run ids and mismatched responses', async (context) => {
  const originalPost = apiClient.post;
  let requests = 0;
  apiClient.post = (async () => {
    requests += 1;
    return {
      data: {
        id: '76558d4f-1c89-43fa-afbe-94d2bc38b194',
        advisor_run_id: '8eaf22cc-a3ba-4f33-995e-3f23f19ae100',
        status: 'new',
        created_at: '2026-08-02T18:30:00Z',
        already_reported: false,
      },
    };
  }) as typeof apiClient.post;
  context.after(() => {
    apiClient.post = originalPost;
  });

  await assert.rejects(
    reportAdvisorIssue('not-a-run-id'),
    /invalid Advisor run id/,
  );
  assert.equal(requests, 0);
  await assert.rejects(
    reportAdvisorIssue(RUN_ID),
    /invalid response/,
  );
  assert.equal(requests, 1);
});

test('an in-flight issue response cannot acknowledge a newly displayed failed run', () => {
  const submittedRunId = RUN_ID;
  let activeRunId = RUN_ID;
  assert.equal(
    advisorIssueResultBelongsToActiveRun(submittedRunId, activeRunId),
    true,
  );

  // The user switches to another terminal run before the first POST resolves.
  activeRunId = NEXT_RUN_ID;
  assert.equal(
    advisorIssueResultBelongsToActiveRun(submittedRunId, activeRunId),
    false,
  );
});
