export interface PipelineStage {
  name: string;
  status: 'completed' | 'active' | 'pending' | 'unknown';
  detail: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeStageName(value: unknown, depth = 0): string {
  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
    return normalized || 'UNKNOWN_STAGE';
  }

  if (isRecord(value) && depth < 2) {
    for (const key of ['step_name', 'name', 'stage', 'id', 'value', 'label']) {
      if (key in value) {
        const normalized = normalizeStageName(value[key], depth + 1);
        if (normalized !== 'UNKNOWN_STAGE') return normalized;
      }
    }
  }

  return 'UNKNOWN_STAGE';
}

function normalizeStepStatus(value: unknown): string {
  if (typeof value === 'string') return value.trim().toUpperCase();
  if (isRecord(value)) {
    for (const key of ['status', 'name', 'value', 'id']) {
      if (key in value) return normalizeStepStatus(value[key]);
    }
  }
  return '';
}

function finiteStepOrder(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback;
}

function completedDetail(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Completed';
  return `Completed ${timestamp.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function isPendingPipelineProjection(data: unknown): boolean {
  return isRecord(data)
    && data.lifecycle_status === 'WAITING_FOR_SPRINTSTATE'
    && Array.isArray(data.pending_pipeline_steps)
    && data.pending_pipeline_steps.length > 0;
}

function toProjectedPipelineStages(data: Record<string, unknown>): PipelineStage[] {
  const rawSteps = Array.isArray(data.pending_pipeline_steps)
    ? data.pending_pipeline_steps
    : [];

  return rawSteps
    .map((value, index) => ({
      value,
      index,
      order: isRecord(value)
        ? finiteStepOrder(value.step_order, index)
        : index,
    }))
    .sort((left, right) => left.order - right.order || left.index - right.index)
    .map(({ value }) => {
      if (!isRecord(value)) {
        return {
          name: normalizeStageName(value),
          status: 'unknown' as const,
          detail: 'Projection unavailable',
        };
      }

      const rawStatus = normalizeStepStatus(value.status);
      const status: PipelineStage['status'] = rawStatus === 'ELAPSED'
        ? 'completed'
        : rawStatus === 'ACTIVE'
          ? 'active'
          : rawStatus === 'UPCOMING'
            ? 'pending'
            : 'unknown';
      const detail = status === 'completed'
        ? 'Window elapsed · projection'
        : status === 'active'
          ? 'Current window · preparing'
          : status === 'pending'
            ? 'Upcoming window · projection'
            : 'Projection unavailable';

      return {
        name: normalizeStageName(value.step_name),
        status,
        detail,
      };
    });
}

export function toPipelineStages(data: unknown): PipelineStage[] {
  if (!isRecord(data) || !Array.isArray(data.pipeline_steps)) return [];

  if (isPendingPipelineProjection(data)) {
    return toProjectedPipelineStages(data);
  }

  const activeStage = normalizeStageName(data.pipeline_status);
  return data.pipeline_steps
    .map((value, index) => ({
      value,
      index,
      order: isRecord(value)
        ? finiteStepOrder(value.step_order, index)
        : index,
    }))
    .sort((left, right) => left.order - right.order || left.index - right.index)
    .map(({ value }) => {
      if (!isRecord(value)) {
        return {
          name: normalizeStageName(value),
          status: 'unknown' as const,
          detail: 'Status unavailable',
        };
      }

      const name = normalizeStageName(value.step_name);
      const rawStatus = normalizeStepStatus(value.status);
      const status: PipelineStage['status'] =
        rawStatus === 'COMPLETED' || rawStatus === 'SUCCEEDED'
          ? 'completed'
          : name !== 'UNKNOWN_STAGE' && name === activeStage
            ? 'active'
            : rawStatus === 'PENDING' || rawStatus === 'QUEUED' || !rawStatus
              ? 'pending'
              : 'unknown';
      const detail = completedDetail(value.completed_at)
        ?? (status === 'active'
          ? 'In progress'
          : status === 'unknown'
            ? 'Status unavailable'
            : 'Pending');

      return { name, status, detail };
    });
}

export function readEnginePresentationDrawId(data: unknown): number | null {
  if (!isRecord(data)) return null;
  if (data.lifecycle_status === 'WAITING_FOR_SPRINTSTATE') {
    const pending = data.pending_draw_id;
    if (typeof pending === 'number' && Number.isSafeInteger(pending) && pending > 0) {
      return pending;
    }
  }
  return readEngineDrawId(data);
}

export function readEngineDrawId(data: unknown): number | null {
  if (!isRecord(data)) return null;
  const value = data.draw_id;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}
