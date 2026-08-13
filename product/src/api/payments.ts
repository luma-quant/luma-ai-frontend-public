import apiClient from './apiClient';
import {
  LEGAL_DOCUMENT_SHA256,
  LEGAL_POLICY_VERSION,
} from '../legal/legalPolicies';

export interface PaymentCreditPack {
  pack_id: string;
  label: string;
  credits: string;
  amount_minor: number;
  currency: string;
  kind: 'credit_pack' | 'calendar_month_pass';
  can_purchase: boolean;
  unavailable_reason: string | null;
  next_purchase_at: string | null;
  valid_until: string | null;
  active_remaining_credits: string | null;
  purchase_state: string;
  timezone: string | null;
}

export interface PaymentConfigResponse {
  publishable_key: string;
  livemode: boolean;
  paid_terms_version: typeof CURRENT_PAID_TERMS_VERSION;
  paid_terms_document_sha256: string;
  paid_terms_path: typeof PAID_TERMS_PATH;
  packs: PaymentCreditPack[];
}

export interface CheckoutSessionResponse {
  order_id: string;
  request_id: string;
  pack_id: string;
  credits: string;
  amount_minor: number;
  currency: string;
  status: string;
  checkout_session_id: string;
  checkout_url: string;
  provider: 'stripe_checkout';
  paid_terms_version: typeof CURRENT_PAID_TERMS_VERSION;
  paid_terms_document_sha256: string;
  paid_terms_accepted_at: string;
  immediate_performance_requested: true;
  withdrawal_right_acknowledged: true;
}

// Paid checkout evidence is part of the same immutable legal bundle as the
// platform acceptance. Deriving it prevents checkout from silently retaining
// an older policy version after a legal-text update.
export const CURRENT_PAID_TERMS_VERSION = LEGAL_POLICY_VERSION;
export const PAID_TERMS_PATH = '/legal/paid-services' as const;
const SHA256_RE = /^[0-9a-f]{64}$/;

export interface PaidTermsCheckoutAcknowledgement {
  paid_terms_version: typeof CURRENT_PAID_TERMS_VERSION;
  paid_terms_accepted: true;
  immediate_performance_requested: true;
  withdrawal_right_acknowledged: true;
}

export const CURRENT_PAID_TERMS_ACKNOWLEDGEMENT:
PaidTermsCheckoutAcknowledgement = Object.freeze({
  paid_terms_version: CURRENT_PAID_TERMS_VERSION,
  paid_terms_accepted: true,
  immediate_performance_requested: true,
  withdrawal_right_acknowledged: true,
});

export function createPaidTermsCheckoutAcknowledgement(
  paidTermsAccepted: boolean,
  immediatePerformanceAccepted: boolean,
): PaidTermsCheckoutAcknowledgement {
  if (!paidTermsAccepted || !immediatePerformanceAccepted) {
    throw new Error(
      'Both paid-service acknowledgements are required before checkout.',
    );
  }
  return { ...CURRENT_PAID_TERMS_ACKNOWLEDGEMENT };
}

function assertPaidTermsCheckoutAcknowledgement(
  value: PaidTermsCheckoutAcknowledgement,
): void {
  if (
    value.paid_terms_version !== CURRENT_PAID_TERMS_VERSION
    || value.paid_terms_accepted !== true
    || value.immediate_performance_requested !== true
    || value.withdrawal_right_acknowledged !== true
  ) {
    throw new Error(
      'Checkout requires the current paid-service acknowledgements.',
    );
  }
}

export interface PaymentOrderResponse {
  // Order reconciliation intentionally remains compatible with pre-policy
  // orders whose migrated legal-evidence columns are null. New checkout
  // creation is the fail-closed boundary and validates complete evidence.
  order_id: string;
  request_id: string;
  pack_id: string;
  credits: string;
  amount_minor: number;
  currency: string;
  kind: 'credit_pack' | 'calendar_month_pass';
  valid_until: string | null;
  payment_flow: string;
  status: string;
  credited: boolean;
  created_at: string;
  updated_at: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PACK_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const CURRENCY_RE = /^[a-z]{3}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
  record: Record<string, unknown>,
  field: string,
): string {
  const value = record[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Payment backend returned an invalid ${field}.`);
  }
  return value;
}

function requirePositiveInteger(
  record: Record<string, unknown>,
  field: string,
): number {
  const value = record[field];
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`Payment backend returned an invalid ${field}.`);
  }
  return value as number;
}

function requireCreditString(
  record: Record<string, unknown>,
  field = 'credits',
): string {
  const value = requireString(record, field);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Payment backend returned an invalid ${field}.`);
  }
  return value;
}

function requireNonNegativeCreditStringOrNull(
  record: Record<string, unknown>,
  field: string,
): string | null {
  const value = record[field];
  if (value === null) return null;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Payment backend returned an invalid ${field}.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Payment backend returned an invalid ${field}.`);
  }
  return value;
}

function requireBoolean(
  record: Record<string, unknown>,
  field: string,
): boolean {
  const value = record[field];
  if (typeof value !== 'boolean') {
    throw new Error(`Payment backend returned an invalid ${field}.`);
  }
  return value;
}

function requireNullableString(
  record: Record<string, unknown>,
  field: string,
): string | null {
  const value = record[field];
  if (value === null) return null;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Payment backend returned an invalid ${field}.`);
  }
  return value;
}

function requireNullableTimestamp(
  record: Record<string, unknown>,
  field: string,
): string | null {
  const value = requireNullableString(record, field);
  if (value === null) return null;
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`Payment backend returned an invalid ${field}.`);
  }
  return value;
}

function requireUuid(record: Record<string, unknown>, field: string): string {
  const value = requireString(record, field);
  if (!UUID_RE.test(value)) {
    throw new Error(`Payment backend returned an invalid ${field}.`);
  }
  return value;
}

function parsePack(value: unknown): PaymentCreditPack {
  if (!isRecord(value)) {
    throw new Error('Payment backend returned an invalid credit pack.');
  }
  const packId = requireString(value, 'pack_id');
  const currency = requireString(value, 'currency');
  if (!PACK_ID_RE.test(packId)) {
    throw new Error('Payment backend returned an invalid pack_id.');
  }
  if (!CURRENCY_RE.test(currency)) {
    throw new Error('Payment backend returned an invalid currency.');
  }
  const kind = requireString(value, 'kind');
  if (kind !== 'credit_pack' && kind !== 'calendar_month_pass') {
    throw new Error('Payment backend returned an invalid payment pack kind.');
  }
  return {
    pack_id: packId,
    label: requireString(value, 'label'),
    credits: requireCreditString(value),
    amount_minor: requirePositiveInteger(value, 'amount_minor'),
    currency,
    kind,
    can_purchase: requireBoolean(value, 'can_purchase'),
    unavailable_reason: requireNullableString(value, 'unavailable_reason'),
    next_purchase_at: requireNullableTimestamp(value, 'next_purchase_at'),
    valid_until: requireNullableTimestamp(value, 'valid_until'),
    active_remaining_credits: requireNonNegativeCreditStringOrNull(
      value,
      'active_remaining_credits',
    ),
    purchase_state: requireString(value, 'purchase_state'),
    timezone: requireNullableString(value, 'timezone'),
  };
}

function parsePaymentConfig(value: unknown): PaymentConfigResponse {
  if (!isRecord(value) || !Array.isArray(value.packs)) {
    throw new Error('Payment backend returned an invalid configuration.');
  }
  if (typeof value.publishable_key !== 'string') {
    throw new Error('Payment backend returned an invalid publishable_key.');
  }
  if (typeof value.livemode !== 'boolean') {
    throw new Error('Payment backend returned an invalid livemode flag.');
  }
  if (value.paid_terms_version !== CURRENT_PAID_TERMS_VERSION) {
    throw new Error(
      'A newer paid-services policy is available. Refresh the application.',
    );
  }
  if (
    typeof value.paid_terms_document_sha256 !== 'string'
    || !SHA256_RE.test(value.paid_terms_document_sha256)
    || value.paid_terms_document_sha256
      !== LEGAL_DOCUMENT_SHA256['paid-services']
  ) {
    throw new Error(
      'The paid-services policy could not be verified. Refresh the application.',
    );
  }
  if (value.paid_terms_path !== PAID_TERMS_PATH) {
    throw new Error(
      'The paid-services policy link could not be verified. Refresh the application.',
    );
  }
  const packs = value.packs.map(parsePack);
  if (packs.length === 0) {
    throw new Error('No credit packs are currently available.');
  }
  const uniqueIds = new Set(packs.map((pack) => pack.pack_id));
  if (uniqueIds.size !== packs.length) {
    throw new Error('Payment backend returned duplicate credit packs.');
  }
  return {
    publishable_key: value.publishable_key,
    livemode: value.livemode,
    paid_terms_version: value.paid_terms_version,
    paid_terms_document_sha256: value.paid_terms_document_sha256,
    paid_terms_path: value.paid_terms_path,
    packs,
  };
}

function parseCheckoutSession(value: unknown): CheckoutSessionResponse {
  if (!isRecord(value)) {
    throw new Error('Payment backend returned an invalid checkout session.');
  }
  const provider = requireString(value, 'provider');
  const currency = requireString(value, 'currency');
  const checkoutUrl = requireString(value, 'checkout_url');
  const paidTermsVersion = requireString(value, 'paid_terms_version');
  const paidTermsHash = requireString(value, 'paid_terms_document_sha256');
  const paidTermsAcceptedAt = requireString(value, 'paid_terms_accepted_at');
  if (provider !== 'stripe_checkout') {
    throw new Error('Payment backend returned an unsupported checkout provider.');
  }
  if (!CURRENCY_RE.test(currency)) {
    throw new Error('Payment backend returned an invalid currency.');
  }
  if (!isSafeStripeCheckoutUrl(checkoutUrl)) {
    throw new Error('Payment backend returned an unsafe checkout URL.');
  }
  if (paidTermsVersion !== CURRENT_PAID_TERMS_VERSION) {
    throw new Error(
      'Checkout response does not match the current paid-services policy.',
    );
  }
  if (
    !SHA256_RE.test(paidTermsHash)
    || paidTermsHash !== LEGAL_DOCUMENT_SHA256['paid-services']
  ) {
    throw new Error(
      'Checkout response contains unverifiable paid-services evidence.',
    );
  }
  if (!Number.isFinite(Date.parse(paidTermsAcceptedAt))) {
    throw new Error(
      'Checkout response contains an invalid paid-terms acceptance timestamp.',
    );
  }
  if (
    value.immediate_performance_requested !== true
    || value.withdrawal_right_acknowledged !== true
  ) {
    throw new Error(
      'Checkout response is missing required paid-service acknowledgements.',
    );
  }
  return {
    order_id: requireUuid(value, 'order_id'),
    request_id: requireUuid(value, 'request_id'),
    pack_id: requireString(value, 'pack_id'),
    credits: requireCreditString(value),
    amount_minor: requirePositiveInteger(value, 'amount_minor'),
    currency,
    status: requireString(value, 'status'),
    checkout_session_id: requireString(value, 'checkout_session_id'),
    checkout_url: checkoutUrl,
    provider,
    paid_terms_version: CURRENT_PAID_TERMS_VERSION,
    paid_terms_document_sha256: paidTermsHash,
    paid_terms_accepted_at: paidTermsAcceptedAt,
    immediate_performance_requested: true,
    withdrawal_right_acknowledged: true,
  };
}

function parsePaymentOrder(value: unknown): PaymentOrderResponse {
  if (!isRecord(value)) {
    throw new Error('Payment backend returned an invalid order.');
  }
  const currency = requireString(value, 'currency');
  if (!CURRENCY_RE.test(currency)) {
    throw new Error('Payment backend returned an invalid currency.');
  }
  if (typeof value.credited !== 'boolean') {
    throw new Error('Payment backend returned an invalid credited state.');
  }
  const kind = requireString(value, 'kind');
  if (kind !== 'credit_pack' && kind !== 'calendar_month_pass') {
    throw new Error('Payment backend returned an invalid payment order kind.');
  }
  return {
    order_id: requireUuid(value, 'order_id'),
    request_id: requireUuid(value, 'request_id'),
    pack_id: requireString(value, 'pack_id'),
    credits: requireCreditString(value),
    amount_minor: requirePositiveInteger(value, 'amount_minor'),
    currency,
    kind,
    valid_until: requireNullableTimestamp(value, 'valid_until'),
    payment_flow: requireString(value, 'payment_flow'),
    status: requireString(value, 'status'),
    credited: value.credited,
    created_at: requireString(value, 'created_at'),
    updated_at: requireString(value, 'updated_at'),
  };
}

export function createPaymentRequestId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('Secure payment identifiers are not supported by this browser.');
  }
  return crypto.randomUUID();
}

export function isSafeStripeCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com';
  } catch {
    return false;
  }
}

export function isFinalPaymentOrder(order: PaymentOrderResponse): boolean {
  if (order.credited) return true;
  return new Set([
    'canceled',
    'cancelled',
    'expired',
    'failed',
    'requires_payment_method',
  ]).has(order.status.trim().toLowerCase());
}

export async function fetchPaymentConfig(
  signal?: AbortSignal,
): Promise<PaymentConfigResponse> {
  const response = await apiClient.get<unknown>(
    '/api/v1/payments/config',
    { signal },
  );
  return parsePaymentConfig(response.data);
}

export async function createCheckoutSession(
  packId: string,
  requestId: string,
  legalAcknowledgement: PaidTermsCheckoutAcknowledgement,
  signal?: AbortSignal,
): Promise<CheckoutSessionResponse> {
  if (!PACK_ID_RE.test(packId)) {
    throw new Error('Cannot create checkout for an invalid credit pack.');
  }
  if (!UUID_RE.test(requestId)) {
    throw new Error('Cannot create checkout without a valid request ID.');
  }
  assertPaidTermsCheckoutAcknowledgement(legalAcknowledgement);
  const response = await apiClient.post<unknown>(
    '/api/v1/billing/create-checkout-session',
    {
      request_id: requestId,
      pack_id: packId,
      ...legalAcknowledgement,
    },
    { signal },
  );
  const checkout = parseCheckoutSession(response.data);
  if (checkout.request_id !== requestId || checkout.pack_id !== packId) {
    throw new Error('Checkout response does not match the requested order.');
  }
  return checkout;
}

export async function fetchPaymentOrder(
  orderId: string,
  signal?: AbortSignal,
): Promise<PaymentOrderResponse> {
  if (!UUID_RE.test(orderId)) {
    throw new Error('Cannot load an invalid payment order.');
  }
  const response = await apiClient.get<unknown>(
    `/api/v1/payments/orders/${encodeURIComponent(orderId)}`,
    { signal },
  );
  const order = parsePaymentOrder(response.data);
  if (order.order_id !== orderId) {
    throw new Error('Payment response does not match the requested order.');
  }
  return order;
}

export async function cancelCheckoutSession(
  orderId: string,
  signal?: AbortSignal,
): Promise<PaymentOrderResponse> {
  if (!UUID_RE.test(orderId)) {
    throw new Error('Cannot cancel an invalid payment order.');
  }
  const response = await apiClient.post<unknown>(
    `/api/v1/billing/checkout-sessions/${encodeURIComponent(orderId)}/cancel`,
    {},
    { signal },
  );
  const order = parsePaymentOrder(response.data);
  if (order.order_id !== orderId) {
    throw new Error('Cancellation response does not match the requested order.');
  }
  return order;
}
