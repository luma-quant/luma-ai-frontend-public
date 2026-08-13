import apiClient from './apiClient';

/**
 * Crisp identity is an optional support enhancement. Keep it bounded so an
 * unavailable identity bridge can never delay opening the support chat.
 */
export const CRISP_IDENTITY_TIMEOUT_MS = 2_500;

export interface CrispIdentity {
  email: string | null;
  nickname: string | null;
  signature: string | null;
  identityVerified: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(
  value: unknown,
  field: string,
): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Support identity backend returned an invalid ${field}.`);
  }
  return value.trim();
}

export function parseCrispIdentity(value: unknown): CrispIdentity {
  if (!isRecord(value) || typeof value.identity_verified !== 'boolean') {
    throw new Error('Support identity backend returned an invalid response.');
  }

  const email = nullableString(value.email, 'email');
  const nickname = nullableString(value.nickname, 'nickname');
  const signature = nullableString(value.signature, 'signature');

  if (value.identity_verified !== Boolean(signature)) {
    throw new Error('Support identity backend returned an invalid signature.');
  }

  if (
    signature &&
    (!email || !/^[0-9a-f]{64}$/.test(signature))
  ) {
    throw new Error('Support identity backend returned an invalid signature.');
  }

  return {
    email,
    nickname,
    signature,
    identityVerified: value.identity_verified,
  };
}

/**
 * Returns the signed identity that the authenticated backend has approved for
 * Crisp. This endpoint intentionally contains no JWT, internal user id, or
 * other application telemetry.
 */
export async function fetchCrispIdentity(): Promise<CrispIdentity> {
  const response = await apiClient.get('/api/v1/support/crisp-identity', {
    timeout: CRISP_IDENTITY_TIMEOUT_MS,
  });
  return parseCrispIdentity(response.data);
}

/**
 * Applies a wall-clock deadline around the entire identity flow. Axios's own
 * timeout starts only after the request begins, whereas its auth interceptor
 * may first await a token refresh. A stalled refresh must not block Support.
 */
export async function fetchCrispIdentityWithin(
  timeoutMs = CRISP_IDENTITY_TIMEOUT_MS,
): Promise<CrispIdentity> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error('Support identity request timed out.'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fetchCrispIdentity(), deadline]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}
