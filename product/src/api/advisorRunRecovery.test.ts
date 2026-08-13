import assert from 'node:assert/strict';
import test from 'node:test';

import { AxiosError, AxiosHeaders } from 'axios';
import { REPORTED_ADVISOR_ISSUES_STORAGE_KEY } from './advisorIssueReporting';
import {
  COMPLETED_ADVISOR_TIP_SCENARIO_STORAGE_KEY,
  PENDING_ADVISOR_TIP_SCENARIO_STORAGE_KEY,
} from './advisorTipScenarioRecovery';

import {
  ADVISOR_PROMPT_STORAGE_KEY,
  ADVISOR_RETRY_SNAPSHOT_STORAGE_KEY,
  ADVISOR_RUN_RETRY_NOT_BEFORE_STORAGE_KEY,
  CURRENT_ADVISOR_RUN_STORAGE_KEY,
  AdvisorRunSubmissionPendingError,
  PENDING_ADVISOR_RUN_STORAGE_KEY,
  canReconstructAdvisorSubmission,
  clearAdvisorBrowserState,
  clearAdvisorRetrySnapshot,
  clearAdvisorRunRetryNotBefore,
  clearCurrentAdvisorRun,
  clearPendingAdvisorRun,
  persistCurrentAdvisorRun,
  persistAdvisorRetrySnapshot,
  persistAdvisorRunRetryNotBefore,
  persistPendingAdvisorRun,
  readAdvisorRetrySnapshot,
  readAdvisorRunRetryNotBefore,
  readCurrentAdvisorRun,
  readPendingAdvisorRun,
  resumePendingAdvisorRun,
  submitPendingAdvisorRun,
  type PendingAdvisorRun,
} from './advisorRunRecovery';
import type {
  AdvisorRunCreateRequest,
  AdvisorRunResponse,
} from './backendData';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class RetrySnapshotFailOnceStorage extends MemoryStorage {
  private shouldFail = true;

  override setItem(key: string, value: string): void {
    if (key === ADVISOR_RETRY_SNAPSHOT_STORAGE_KEY && this.shouldFail) {
      this.shouldFail = false;
      throw new Error('storage quota unavailable');
    }
    super.setItem(key, value);
  }
}

const pending: PendingAdvisorRun = {
  version: 1,
  idempotency_key: '00000000-0000-4000-8000-000000000001',
  request: {
    quote_id: '44ce0838-6f1d-4dd2-a925-914120224458',
    upload_id: null,
    analysis_scope: 'forecast',
    forecast_draw: 1967,
    history_start_draw: null,
    history_end_draw: 1966,
    tone: 'standard',
    luma_pro: false,
    deep_evidence: false,
    signal_layers: [],
    quality_controls: {
      qa_audit: false,
      toxic_pair_exclusion: false,
      recent_shadow_sync: false,
    },
    custom_prompt: null,
  },
  saved_at: '2026-07-26T22:00:00.000Z',
};

const run = {
  id: '09380132-d415-40ac-a841-2a68598ee5ea',
  status: 'QUEUED',
} as AdvisorRunResponse;

test('Advisor submission is persisted before the mutating request and cleared on success', async () => {
  const storage = new MemoryStorage();
  let observed: PendingAdvisorRun | null = null;

  const result = await submitPendingAdvisorRun(
    storage,
    pending,
    async (request, idempotencyKey) => {
      observed = readPendingAdvisorRun(storage);
      assert.deepEqual(request, pending.request);
      assert.equal(idempotencyKey, pending.idempotency_key);
      return run;
    },
  );

  assert.equal(result, run);
  assert.deepEqual(observed, pending);
  assert.equal(readPendingAdvisorRun(storage), null);
  assert.equal(readCurrentAdvisorRun(storage)?.run_id, run.id);
  assert.deepEqual(
    readAdvisorRetrySnapshot(storage, run.id)?.request,
    { ...pending.request, quote_id: null },
  );
});

test('network failure keeps the exact quote payload and idempotency key for recovery', async () => {
  const storage = new MemoryStorage();
  const networkError = new AxiosError('network unavailable');

  await assert.rejects(
    submitPendingAdvisorRun(
      storage,
      pending,
      async () => {
        throw networkError;
      },
    ),
    AdvisorRunSubmissionPendingError,
  );
  assert.deepEqual(readPendingAdvisorRun(storage), pending);

  const calls: Array<{ request: unknown; idempotencyKey: string }> = [];
  const resumed = await resumePendingAdvisorRun(
    storage,
    async (request, idempotencyKey) => {
      calls.push({ request, idempotencyKey });
      return run;
    },
  );

  assert.equal(resumed, run);
  assert.deepEqual(calls, [{
    request: pending.request,
    idempotencyKey: pending.idempotency_key,
  }]);
  assert.equal(readPendingAdvisorRun(storage), null);
  assert.equal(readCurrentAdvisorRun(storage)?.run_id, run.id);
  assert.deepEqual(
    readAdvisorRetrySnapshot(storage, run.id)?.request,
    { ...pending.request, quote_id: null },
  );
});

test('concurrent recovery shares one mutating request for the same idempotency key', async () => {
  const storage = new MemoryStorage();
  persistPendingAdvisorRun(storage, pending);
  let resolveRun!: (value: AdvisorRunResponse) => void;
  const response = new Promise<AdvisorRunResponse>((resolve) => {
    resolveRun = resolve;
  });
  let calls = 0;
  const createRun = async () => {
    calls += 1;
    return response;
  };

  const first = resumePendingAdvisorRun(storage, createRun);
  const second = resumePendingAdvisorRun(storage, createRun);

  assert.equal(calls, 1);
  resolveRun(run);
  assert.deepEqual(await Promise.all([first, second]), [run, run]);
  assert.equal(readPendingAdvisorRun(storage), null);
  assert.equal(readCurrentAdvisorRun(storage)?.run_id, run.id);
});

test('post-acceptance storage failure keeps the idempotent request recoverable', async () => {
  const storage = new RetrySnapshotFailOnceStorage();
  const calls: string[] = [];

  await assert.rejects(
    submitPendingAdvisorRun(
      storage,
      pending,
      async (_request, idempotencyKey) => {
        calls.push(idempotencyKey);
        return run;
      },
    ),
    AdvisorRunSubmissionPendingError,
  );

  assert.deepEqual(readPendingAdvisorRun(storage), pending);
  assert.equal(readCurrentAdvisorRun(storage)?.run_id, run.id);
  assert.equal(readAdvisorRetrySnapshot(storage), null);

  assert.equal(
    await resumePendingAdvisorRun(
      storage,
      async (_request, idempotencyKey) => {
        calls.push(idempotencyKey);
        return run;
      },
    ),
    run,
  );
  assert.deepEqual(calls, [pending.idempotency_key, pending.idempotency_key]);
  assert.equal(readPendingAdvisorRun(storage), null);
  assert.equal(readAdvisorRetrySnapshot(storage)?.run_id, run.id);
});

test('advisor_task_dispatch_pending keeps durable state while definitive errors clear it', async () => {
  const storage = new MemoryStorage();
  const dispatchPending = new AxiosError(
    'dispatch pending',
    undefined,
    undefined,
    undefined,
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: { detail: 'advisor_task_dispatch_pending' },
    },
  );

  await assert.rejects(
    submitPendingAdvisorRun(
      storage,
      pending,
      async () => {
        throw dispatchPending;
      },
    ),
    AdvisorRunSubmissionPendingError,
  );
  assert.deepEqual(readPendingAdvisorRun(storage), pending);

  const conflict = new AxiosError(
    'conflict',
    undefined,
    undefined,
    undefined,
    {
      status: 409,
      statusText: 'Conflict',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: { detail: 'advisor_quote_expired' },
    },
  );
  await assert.rejects(
    resumePendingAdvisorRun(
      storage,
      async () => {
        throw conflict;
      },
    ),
    conflict,
  );
  assert.equal(readPendingAdvisorRun(storage), null);
});

test('invalid persisted state is discarded without issuing a request', async () => {
  const storage = new MemoryStorage();
  storage.setItem(
    PENDING_ADVISOR_RUN_STORAGE_KEY,
    JSON.stringify({ version: 1, idempotency_key: 'not-a-uuid' }),
  );
  assert.equal(readPendingAdvisorRun(storage), null);
  assert.equal(
    await resumePendingAdvisorRun(storage, async () => run),
    null,
  );

  persistPendingAdvisorRun(storage, pending);
  clearPendingAdvisorRun(storage);
  assert.equal(readPendingAdvisorRun(storage), null);
});

test('confirmed logout clears prompt and all Advisor recovery identities only', () => {
  const storage = new MemoryStorage();
  storage.setItem(ADVISOR_PROMPT_STORAGE_KEY, 'private draft prompt');
  storage.setItem(PENDING_ADVISOR_RUN_STORAGE_KEY, JSON.stringify(pending));
  storage.setItem(CURRENT_ADVISOR_RUN_STORAGE_KEY, JSON.stringify({
    version: 1,
    run_id: run.id,
    saved_at: '2026-07-31T06:00:00Z',
  }));
  storage.setItem(ADVISOR_RETRY_SNAPSHOT_STORAGE_KEY, JSON.stringify({
    version: 1,
    run_id: run.id,
    request: { ...pending.request, quote_id: null },
    saved_at: '2026-07-31T06:00:00Z',
  }));
  storage.setItem(ADVISOR_RUN_RETRY_NOT_BEFORE_STORAGE_KEY, JSON.stringify({
    version: 1,
    retry_not_before_ms: Date.now() + 60_000,
  }));
  storage.setItem(REPORTED_ADVISOR_ISSUES_STORAGE_KEY, JSON.stringify({
    version: 1,
    run_ids: [run.id],
  }));
  storage.setItem(PENDING_ADVISOR_TIP_SCENARIO_STORAGE_KEY, JSON.stringify({
    private: 'paid scenario recovery state',
  }));
  storage.setItem(COMPLETED_ADVISOR_TIP_SCENARIO_STORAGE_KEY, JSON.stringify({
    private: 'completed paid scenario result',
  }));
  storage.setItem('luma_tone', 'expert');

  clearAdvisorBrowserState(storage);

  assert.equal(storage.getItem(ADVISOR_PROMPT_STORAGE_KEY), null);
  assert.equal(storage.getItem(PENDING_ADVISOR_RUN_STORAGE_KEY), null);
  assert.equal(storage.getItem(CURRENT_ADVISOR_RUN_STORAGE_KEY), null);
  assert.equal(storage.getItem(ADVISOR_RETRY_SNAPSHOT_STORAGE_KEY), null);
  assert.equal(
    storage.getItem(ADVISOR_RUN_RETRY_NOT_BEFORE_STORAGE_KEY),
    null,
  );
  assert.equal(storage.getItem(REPORTED_ADVISOR_ISSUES_STORAGE_KEY), null);
  assert.equal(
    storage.getItem(PENDING_ADVISOR_TIP_SCENARIO_STORAGE_KEY),
    null,
  );
  assert.equal(
    storage.getItem(COMPLETED_ADVISOR_TIP_SCENARIO_STORAGE_KEY),
    null,
  );
  assert.equal(storage.getItem('luma_tone'), 'expert');
});

test('Advisor run cooldown persists a future deadline and removes expired state', () => {
  const storage = new MemoryStorage();
  const nowMs = Date.parse('2026-08-02T10:00:00Z');
  const deadline = persistAdvisorRunRetryNotBefore(
    storage,
    45_250.4,
    () => nowMs,
  );

  assert.equal(deadline, nowMs + 45_251);
  assert.equal(
    readAdvisorRunRetryNotBefore(storage, () => nowMs + 10_000),
    deadline,
  );
  assert.equal(
    readAdvisorRunRetryNotBefore(storage, () => nowMs + 45_251),
    null,
  );
  assert.equal(
    storage.getItem(ADVISOR_RUN_RETRY_NOT_BEFORE_STORAGE_KEY),
    null,
  );

  const earlierDeadline = persistAdvisorRunRetryNotBefore(
    storage,
    10_000,
    () => nowMs,
  );
  const laterDeadline = persistAdvisorRunRetryNotBefore(
    storage,
    20_000,
    () => nowMs,
  );
  assert.equal(
    persistAdvisorRunRetryNotBefore(storage, 5_000, () => nowMs),
    laterDeadline,
  );
  assert.equal(
    clearAdvisorRunRetryNotBefore(storage, earlierDeadline ?? undefined),
    false,
  );
  assert.equal(
    readAdvisorRunRetryNotBefore(storage, () => nowMs),
    laterDeadline,
  );
  clearAdvisorRunRetryNotBefore(storage);
  assert.equal(readAdvisorRunRetryNotBefore(storage, () => nowMs), null);
});

test('accepted Pro CSV submission remains exactly reconstructable after navigation', () => {
  const storage = new MemoryStorage();
  const exactRequest: AdvisorRunCreateRequest = {
    quote_id: '44ce0838-6f1d-4dd2-a925-914120224458',
    upload_id: '1cbb3b4e-e3f1-477a-909f-b22bc8118cf5',
    analysis_scope: 'forecast',
    forecast_draw: 1968,
    history_start_draw: 1957,
    history_end_draw: 1967,
    tone: 'expert',
    luma_pro: true,
    deep_evidence: true,
    signal_layers: ['MOTION_FIELD', 'STRUCTURAL_TENSION'],
    quality_controls: {
      qa_audit: true,
      toxic_pair_exclusion: true,
      recent_shadow_sync: false,
    },
    custom_prompt: 'Analyse every uploaded ticket and explain the evidence.',
  };

  const snapshot = persistAdvisorRetrySnapshot(
    storage,
    run.id,
    exactRequest,
    () => '2026-07-31T06:30:00Z',
  );

  assert.deepEqual(snapshot.request, {
    ...exactRequest,
    quote_id: null,
  });
  assert.deepEqual(readAdvisorRetrySnapshot(storage, run.id), snapshot);
  assert.equal(
    canReconstructAdvisorSubmission(snapshot, run.id, null),
    false,
  );
  assert.equal(
    canReconstructAdvisorSubmission(snapshot, run.id, {
      upload_id: exactRequest.upload_id!,
      status: 'CONSUMED',
    }),
    false,
  );
  assert.equal(
    canReconstructAdvisorSubmission(snapshot, run.id, {
      upload_id: exactRequest.upload_id!,
      status: 'READY',
    }),
    true,
  );
  assert.equal(
    canReconstructAdvisorSubmission(
      snapshot,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      {
        upload_id: exactRequest.upload_id!,
        status: 'READY',
      },
    ),
    false,
  );
});

test('retry snapshots without CSV are reconstructable and invalid snapshots are removed', () => {
  const storage = new MemoryStorage();
  const snapshot = persistAdvisorRetrySnapshot(
    storage,
    run.id,
    pending.request,
  );
  assert.equal(
    canReconstructAdvisorSubmission(snapshot, run.id, null),
    true,
  );
  assert.equal(clearAdvisorRetrySnapshot(storage, run.id), true);
  assert.equal(readAdvisorRetrySnapshot(storage), null);

  storage.setItem(
    ADVISOR_RETRY_SNAPSHOT_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      run_id: run.id,
      request: { forecast_draw: 1968 },
      saved_at: '2026-07-31T06:30:00Z',
    }),
  );
  assert.equal(readAdvisorRetrySnapshot(storage), null);
  assert.equal(storage.getItem(ADVISOR_RETRY_SNAPSHOT_STORAGE_KEY), null);
});

test('historical retry snapshots retain the explicit scope and release anchor', () => {
  const storage = new MemoryStorage();
  const request: AdvisorRunCreateRequest = {
    ...pending.request,
    quote_id: null,
    analysis_scope: 'historical',
    forecast_draw: 1968,
    history_start_draw: 1957,
    history_end_draw: 1966,
  };
  const snapshot = persistAdvisorRetrySnapshot(storage, run.id, request);

  assert.equal(snapshot.request.analysis_scope, 'historical');
  assert.equal(snapshot.request.forecast_draw, 1968);
  assert.equal(snapshot.request.history_end_draw, 1966);
  assert.equal(readAdvisorRetrySnapshot(storage, run.id)?.request.analysis_scope, 'historical');
});

test('legacy version-one recovery records default a missing scope to forecast', () => {
  const storage = new MemoryStorage();
  const legacyRequest = { ...pending.request } as Record<string, unknown>;
  delete legacyRequest.analysis_scope;
  storage.setItem(
    PENDING_ADVISOR_RUN_STORAGE_KEY,
    JSON.stringify({ ...pending, request: legacyRequest }),
  );
  storage.setItem(
    ADVISOR_RETRY_SNAPSHOT_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      run_id: run.id,
      request: { ...legacyRequest, quote_id: null },
      saved_at: pending.saved_at,
    }),
  );

  assert.equal(readPendingAdvisorRun(storage)?.request.analysis_scope, 'forecast');
  assert.equal(
    readAdvisorRetrySnapshot(storage, run.id)?.request.analysis_scope,
    'forecast',
  );
});

test('current run identity remains durable until explicitly replaced', () => {
  const storage = new MemoryStorage();
  const saved = persistCurrentAdvisorRun(
    storage,
    run.id,
    () => '2026-07-31T06:00:00Z',
  );

  assert.equal(saved.run_id, run.id);
  assert.deepEqual(readCurrentAdvisorRun(storage), saved);
  assert.equal(
    clearCurrentAdvisorRun(
      storage,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ),
    false,
  );
  assert.deepEqual(readCurrentAdvisorRun(storage), saved);
  assert.equal(clearCurrentAdvisorRun(storage, run.id), true);
  assert.equal(readCurrentAdvisorRun(storage), null);
  assert.equal(readAdvisorRetrySnapshot(storage), null);
});
