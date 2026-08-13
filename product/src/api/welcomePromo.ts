import apiClient from './apiClient';

const WELCOME_PROMO_PATTERN =
  /^LUMA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{5}$/;
const CREDIT_PATTERN = /^(?:0|[1-9][0-9]{0,7})\.[0-9]{2}$/;

export interface WelcomePromoResponse {
  ok: true;
  status: 'credited' | 'already_credited';
  credits_added: string;
  balance: string;
}

export function normalizeWelcomePromoCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isWelcomePromoCodeFormat(value: string): boolean {
  return WELCOME_PROMO_PATTERN.test(normalizeWelcomePromoCode(value));
}

function requireWelcomePromoResponse(value: unknown): WelcomePromoResponse {
  if (typeof value !== 'object' || value === null) {
    throw new Error('The backend returned an invalid welcome-bonus response.');
  }
  const result = value as Partial<WelcomePromoResponse>;
  if (
    result.ok !== true
    || !['credited', 'already_credited'].includes(result.status ?? '')
    || typeof result.credits_added !== 'string'
    || !CREDIT_PATTERN.test(result.credits_added)
    || typeof result.balance !== 'string'
    || !CREDIT_PATTERN.test(result.balance)
  ) {
    throw new Error('The backend returned an invalid welcome-bonus response.');
  }
  return result as WelcomePromoResponse;
}

export async function redeemWelcomePromo(
  code: string,
  signal?: AbortSignal,
): Promise<WelcomePromoResponse> {
  const canonicalCode = normalizeWelcomePromoCode(code);
  if (!WELCOME_PROMO_PATTERN.test(canonicalCode)) {
    throw new Error('Enter a valid LUMA invite code.');
  }
  const response = await apiClient.post(
    '/api/v1/credits/redeem',
    { code: canonicalCode },
    { signal },
  );
  return requireWelcomePromoResponse(response.data);
}
