import apiClient from './apiClient';

export const REPORTED_ADVISOR_ISSUES_STORAGE_KEY =
  'luma.reported-advisor-issues.v1';

const MAX_REPORTED_RUN_IDS = 200;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdvisorIssueStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

interface ReportedAdvisorIssues {
  version: 1;
  run_ids: string[];
}

export interface AdvisorIssueReportResponse {
  id: string;
  advisor_run_id: string;
  status: 'new';
  created_at: string;
  already_reported: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAdvisorIssueReportResponse(
  value: unknown,
  expectedRunId: string,
): AdvisorIssueReportResponse {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || !UUID_RE.test(value.id)
    || value.advisor_run_id !== expectedRunId
    || value.status !== 'new'
    || typeof value.created_at !== 'string'
    || !Number.isFinite(Date.parse(value.created_at))
    || typeof value.already_reported !== 'boolean'
  ) {
    throw new Error('Advisor issue backend returned an invalid response.');
  }
  return {
    id: value.id,
    advisor_run_id: value.advisor_run_id,
    status: value.status,
    created_at: value.created_at,
    already_reported: value.already_reported,
  };
}

export async function reportAdvisorIssue(
  runId: string,
): Promise<AdvisorIssueReportResponse> {
  if (!UUID_RE.test(runId)) {
    throw new Error('Cannot report an invalid Advisor run id.');
  }
  const response = await apiClient.post(
    `/api/v1/feedback/advisor-runs/${encodeURIComponent(runId)}`,
  );
  return parseAdvisorIssueReportResponse(response.data, runId);
}

export function advisorIssueResultBelongsToActiveRun(
  reportedRunId: string,
  activeRunId: string | null | undefined,
): boolean {
  return UUID_RE.test(reportedRunId) && reportedRunId === activeRunId;
}

function parseReportedAdvisorIssues(
  raw: string | null,
): ReportedAdvisorIssues | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object'
      || parsed === null
      || Array.isArray(parsed)
      || (parsed as { version?: unknown }).version !== 1
      || !Array.isArray((parsed as { run_ids?: unknown }).run_ids)
    ) {
      return null;
    }
    const runIds = (parsed as { run_ids: unknown[] }).run_ids;
    if (!runIds.every((runId) => (
      typeof runId === 'string' && UUID_RE.test(runId)
    ))) {
      return null;
    }
    const validRunIds = runIds as string[];
    return {
      version: 1,
      run_ids: [...new Set(validRunIds)].slice(-MAX_REPORTED_RUN_IDS),
    };
  } catch {
    return null;
  }
}

export function hasReportedAdvisorIssue(
  storage: AdvisorIssueStorage,
  runId: string,
): boolean {
  if (!UUID_RE.test(runId)) return false;
  return parseReportedAdvisorIssues(
    storage.getItem(REPORTED_ADVISOR_ISSUES_STORAGE_KEY),
  )?.run_ids.includes(runId) ?? false;
}

export function markAdvisorIssueReported(
  storage: AdvisorIssueStorage,
  runId: string,
): void {
  if (!UUID_RE.test(runId)) {
    throw new Error('Cannot persist an invalid Advisor run id.');
  }
  const previous = parseReportedAdvisorIssues(
    storage.getItem(REPORTED_ADVISOR_ISSUES_STORAGE_KEY),
  );
  const runIds = [
    ...(previous?.run_ids.filter((savedRunId) => savedRunId !== runId) ?? []),
    runId,
  ].slice(-MAX_REPORTED_RUN_IDS);
  storage.setItem(
    REPORTED_ADVISOR_ISSUES_STORAGE_KEY,
    JSON.stringify({ version: 1, run_ids: runIds }),
  );
}

export function clearReportedAdvisorIssues(
  storage: AdvisorIssueStorage,
): void {
  storage.removeItem(REPORTED_ADVISOR_ISSUES_STORAGE_KEY);
}
