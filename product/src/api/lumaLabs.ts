import apiClient from './apiClient';

export const LUMA_LABS_CATEGORIES = [
  { value: 'feature', label: 'Feature Request' },
  { value: 'bug', label: 'Bug Report' },
  { value: 'ui_ux', label: 'UI/UX Improvement' },
  { value: 'engine', label: 'Engine Logic' },
  { value: 'other', label: 'Other' },
] as const;

export type LumaLabsCategory =
  (typeof LUMA_LABS_CATEGORIES)[number]['value'];

export interface LumaLabsSubmission {
  category: LumaLabsCategory;
  title: string;
  details: string;
}

export interface LumaLabsSubmissionResponse {
  id: string;
  status: 'new';
  created_at: string;
}

export interface LumaLabsValidationErrors {
  category?: string;
  title?: string;
  details?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORY_VALUES = new Set<string>(
  LUMA_LABS_CATEGORIES.map(({ value }) => value),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateLumaLabsSubmission(
  draft: {
    category: string;
    title: string;
    details: string;
  },
): LumaLabsValidationErrors {
  const errors: LumaLabsValidationErrors = {};
  const title = draft.title.trim();
  const details = draft.details.trim();

  if (!CATEGORY_VALUES.has(draft.category)) {
    errors.category = 'Choose a category.';
  }
  if (
    title.length < 3
    || title.length > 160
    || /[\u0000-\u001f\u007f\u0085\u2028\u2029]/u.test(title)
  ) {
    errors.title = 'Title must be 3–160 characters on one line.';
  }
  if (
    details.length < 10
    || details.length > 5000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(details)
  ) {
    errors.details = 'Description must be 10–5,000 characters.';
  }
  return errors;
}

function normalizeSubmission(
  draft: {
    category: string;
    title: string;
    details: string;
  },
): LumaLabsSubmission {
  const errors = validateLumaLabsSubmission(draft);
  if (Object.keys(errors).length > 0) {
    throw new Error('Please review the highlighted fields.');
  }
  return {
    category: draft.category as LumaLabsCategory,
    title: draft.title.trim(),
    details: draft.details.trim(),
  };
}

function parseSubmissionResponse(
  value: unknown,
): LumaLabsSubmissionResponse {
  if (!isRecord(value)) {
    throw new Error('Feedback backend returned an invalid response.');
  }
  if (typeof value.id !== 'string' || !UUID_RE.test(value.id)) {
    throw new Error('Feedback backend returned an invalid id.');
  }
  if (value.status !== 'new') {
    throw new Error('Feedback backend returned an invalid status.');
  }
  if (
    typeof value.created_at !== 'string'
    || !Number.isFinite(Date.parse(value.created_at))
  ) {
    throw new Error('Feedback backend returned an invalid created_at.');
  }
  return {
    id: value.id,
    status: value.status,
    created_at: value.created_at,
  };
}

export async function submitLumaLabsFeedback(
  draft: {
    category: string;
    title: string;
    details: string;
  },
): Promise<LumaLabsSubmissionResponse> {
  const payload = normalizeSubmission(draft);
  const response = await apiClient.post('/api/v1/feedback', payload);
  return parseSubmissionResponse(response.data);
}
