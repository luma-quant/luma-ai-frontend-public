import apiClient from './apiClient';
import {
  LEGAL_DOCUMENT_SHA256,
  LEGAL_POLICY_VERSION,
} from '../legal/legalPolicies';

export interface PlatformLegalStatus {
  terms_version: string;
  terms_document_sha256: string;
  privacy_version: string;
  privacy_document_sha256: string;
  acceptance_required: boolean;
  accepted_at: string | null;
}

const SHA256_RE = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null
    || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

export function parsePlatformLegalStatus(value: unknown): PlatformLegalStatus {
  if (!isRecord(value)) {
    throw new Error('The legal acknowledgement service returned invalid data.');
  }
  const termsVersion = value.terms_version;
  const privacyVersion = value.privacy_version;
  const termsHash = value.terms_document_sha256;
  const privacyHash = value.privacy_document_sha256;
  const acceptanceRequired = value.acceptance_required;
  const acceptedAt = value.accepted_at;

  if (
    typeof termsVersion !== 'string'
    || typeof privacyVersion !== 'string'
    || typeof termsHash !== 'string'
    || !SHA256_RE.test(termsHash)
    || typeof privacyHash !== 'string'
    || !SHA256_RE.test(privacyHash)
    || typeof acceptanceRequired !== 'boolean'
    || !isNullableTimestamp(acceptedAt)
  ) {
    throw new Error('The legal acknowledgement service returned invalid data.');
  }
  if (
    termsVersion !== LEGAL_POLICY_VERSION
    || privacyVersion !== LEGAL_POLICY_VERSION
  ) {
    throw new Error(
      'A newer legal-policy version is available. Refresh the application.',
    );
  }
  if (
    termsHash !== LEGAL_DOCUMENT_SHA256.terms
    || privacyHash !== LEGAL_DOCUMENT_SHA256.privacy
  ) {
    throw new Error(
      'The legal-policy text does not match the server acknowledgement bundle. '
      + 'Refresh the application before continuing.',
    );
  }

  if (acceptanceRequired && acceptedAt !== null) {
    throw new Error('The legal acknowledgement state is inconsistent.');
  }
  if (!acceptanceRequired && acceptedAt === null) {
    throw new Error('The legal acknowledgement state is incomplete.');
  }

  return {
    terms_version: termsVersion,
    terms_document_sha256: termsHash,
    privacy_version: privacyVersion,
    privacy_document_sha256: privacyHash,
    acceptance_required: acceptanceRequired,
    accepted_at: acceptedAt,
  };
}

export async function fetchPlatformLegalStatus(
  signal?: AbortSignal,
): Promise<PlatformLegalStatus> {
  const response = await apiClient.get<unknown>('/api/v1/legal/status', {
    signal,
  });
  return parsePlatformLegalStatus(response.data);
}

export async function acceptPlatformLegalBundle(
  signal?: AbortSignal,
): Promise<PlatformLegalStatus> {
  const response = await apiClient.post<unknown>(
    '/api/v1/legal/accept-platform',
    {
      terms_version: LEGAL_POLICY_VERSION,
      privacy_version: LEGAL_POLICY_VERSION,
      terms_agreed: true,
      privacy_acknowledged: true,
    },
    { signal },
  );
  const status = parsePlatformLegalStatus(response.data);
  if (status.acceptance_required) {
    throw new Error('The acknowledgement was not saved. Please try again.');
  }
  return status;
}
