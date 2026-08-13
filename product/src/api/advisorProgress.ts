import type { AdvisorRunStatus } from './backendData';

const STATUS_LABELS: Partial<Record<AdvisorRunStatus, string>> = {
  QUEUED: 'Queued securely',
  QUERYING: 'Loading governed data',
  GENERATING: 'Generating evidence-based report',
  QA_REVIEW: 'Running quality review',
};

export interface AdvisorProgressView {
  label: string;
  percent: number;
}

export function advisorProgressView(
  status: AdvisorRunStatus | null | undefined,
  progressPercent: number | null | undefined,
): AdvisorProgressView {
  const parsed = Number(progressPercent);
  const percent = Number.isFinite(parsed)
    ? Math.min(100, Math.max(0, Math.round(parsed)))
    : 0;

  return {
    label: (status && STATUS_LABELS[status]) || 'Restoring analysis',
    percent,
  };
}
