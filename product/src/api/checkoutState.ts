export const PENDING_CHECKOUT_STORAGE_KEY = 'luma.pending-checkout.v2';
const LEGACY_PENDING_CHECKOUT_STORAGE_KEY = 'luma.pending-checkout.v1';

export type CheckoutPhase =
  | 'request_prepared'
  | 'checkout_created'
  | 'cancel_requested'
  | 'return_confirmed';

interface CheckoutIntentBase {
  version: 2;
  requestId: string;
  packId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PreparedCheckout extends CheckoutIntentBase {
  phase: 'request_prepared';
  orderId: null;
  checkoutSessionId: null;
  checkoutUrl: null;
}

export interface CreatedCheckout extends CheckoutIntentBase {
  phase: 'checkout_created' | 'cancel_requested' | 'return_confirmed';
  orderId: string;
  checkoutSessionId: string;
  checkoutUrl: string | null;
}

export type PendingCheckout = PreparedCheckout | CreatedCheckout;

export type CheckoutReturn =
  | { kind: 'none'; sessionId: null }
  | { kind: 'cancel'; sessionId: null }
  | { kind: 'success'; sessionId: string | null };

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseVersionTwo(value: unknown): PendingCheckout | null {
  if (
    !isRecord(value)
    || value.version !== 2
    || !nonEmptyString(value.requestId)
    || !nonEmptyString(value.packId)
    || !nonEmptyString(value.createdAt)
    || !nonEmptyString(value.updatedAt)
  ) {
    return null;
  }

  if (
    value.phase === 'request_prepared'
    && value.orderId === null
    && value.checkoutSessionId === null
    && value.checkoutUrl === null
  ) {
    return {
      version: 2,
      phase: 'request_prepared',
      requestId: value.requestId,
      packId: value.packId,
      orderId: null,
      checkoutSessionId: null,
      checkoutUrl: null,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
  }

  if (
    (
      value.phase === 'checkout_created'
      || value.phase === 'cancel_requested'
      || value.phase === 'return_confirmed'
    )
    && nonEmptyString(value.orderId)
    && nonEmptyString(value.checkoutSessionId)
    && (value.checkoutUrl === null || nonEmptyString(value.checkoutUrl))
  ) {
    return {
      version: 2,
      phase: value.phase,
      requestId: value.requestId,
      packId: value.packId,
      orderId: value.orderId,
      checkoutSessionId: value.checkoutSessionId,
      checkoutUrl: value.checkoutUrl === null ? null : value.checkoutUrl as string,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
  }

  return null;
}

function parseLegacyVersionOne(value: unknown): CreatedCheckout | null {
  if (
    !isRecord(value)
    || value.version !== 1
    || !nonEmptyString(value.orderId)
    || !nonEmptyString(value.requestId)
    || !nonEmptyString(value.packId)
    || !nonEmptyString(value.checkoutSessionId)
    || !nonEmptyString(value.createdAt)
    || typeof value.returnConfirmed !== 'boolean'
  ) {
    return null;
  }

  return {
    version: 2,
    phase: value.returnConfirmed ? 'return_confirmed' : 'checkout_created',
    orderId: value.orderId,
    requestId: value.requestId,
    packId: value.packId,
    checkoutSessionId: value.checkoutSessionId,
    checkoutUrl: null,
    createdAt: value.createdAt,
    updatedAt: value.createdAt,
  };
}

function parseStoredCheckout(raw: string | null): PendingCheckout | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return parseVersionTwo(value) ?? parseLegacyVersionOne(value);
  } catch {
    return null;
  }
}

export function readPendingCheckout(
  storage: ReadableStorage,
): PendingCheckout | null {
  return parseStoredCheckout(storage.getItem(PENDING_CHECKOUT_STORAGE_KEY))
    ?? parseStoredCheckout(storage.getItem(LEGACY_PENDING_CHECKOUT_STORAGE_KEY));
}

export function writePendingCheckout(
  storage: Pick<Storage, 'setItem'>,
  checkout: PendingCheckout,
): void {
  storage.setItem(PENDING_CHECKOUT_STORAGE_KEY, JSON.stringify(checkout));
}

export function clearPendingCheckout(
  storage: WritableStorage,
  expectedRequestId?: string,
): boolean {
  if (expectedRequestId) {
    const current = readPendingCheckout(storage);
    if (current && current.requestId !== expectedRequestId) return false;
  }
  storage.removeItem(PENDING_CHECKOUT_STORAGE_KEY);
  storage.removeItem(LEGACY_PENDING_CHECKOUT_STORAGE_KEY);
  return true;
}

export function prepareCheckoutRequest(
  storage: WritableStorage,
  packId: string,
  createRequestId: () => string,
  now: () => string = () => new Date().toISOString(),
): PendingCheckout {
  const current = readPendingCheckout(storage);
  if (current) {
    if (current.packId !== packId) {
      throw new Error(
        `A checkout for ${current.packId} is already pending. Retry or cancel that checkout before choosing another pack.`,
      );
    }
    if (current.phase === 'return_confirmed') {
      throw new Error(
        'This payment is already awaiting ledger confirmation.',
      );
    }
    if (current.phase === 'cancel_requested') {
      throw new Error(
        'This checkout cancellation is awaiting server confirmation.',
      );
    }
    return current;
  }

  const timestamp = now();
  const prepared: PreparedCheckout = {
    version: 2,
    phase: 'request_prepared',
    requestId: createRequestId(),
    packId,
    orderId: null,
    checkoutSessionId: null,
    checkoutUrl: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  // This write deliberately happens before the checkout POST. A retry after a
  // lost response must reuse the same backend/Stripe idempotency identity.
  writePendingCheckout(storage, prepared);
  return prepared;
}

export interface CheckoutSessionIdentity {
  orderId: string;
  requestId: string;
  packId: string;
  checkoutSessionId: string;
  checkoutUrl: string;
}

export function recordCheckoutSession(
  storage: WritableStorage,
  session: CheckoutSessionIdentity,
  now: () => string = () => new Date().toISOString(),
): CreatedCheckout {
  const current = readPendingCheckout(storage);
  if (
    !current
    || current.requestId !== session.requestId
    || current.packId !== session.packId
  ) {
    throw new Error('Checkout state changed before the server response arrived.');
  }
  if (
    current.phase !== 'request_prepared'
    && (
      current.orderId !== session.orderId
      || current.checkoutSessionId !== session.checkoutSessionId
    )
  ) {
    throw new Error('Checkout retry returned a different payment session.');
  }
  if (current.phase === 'return_confirmed') return current;

  const created: CreatedCheckout = {
    version: 2,
    phase: 'checkout_created',
    requestId: current.requestId,
    packId: current.packId,
    orderId: session.orderId,
    checkoutSessionId: session.checkoutSessionId,
    checkoutUrl: session.checkoutUrl,
    createdAt: current.createdAt,
    updatedAt: now(),
  };
  writePendingCheckout(storage, created);
  return created;
}

export function confirmCheckoutReturn(
  storage: WritableStorage,
  checkoutSessionId: string,
  now: () => string = () => new Date().toISOString(),
): CreatedCheckout {
  const current = readPendingCheckout(storage);
  if (
    !current
    || current.phase === 'request_prepared'
    || current.checkoutSessionId !== checkoutSessionId
  ) {
    throw new Error(
      'The returning checkout session does not match the pending order.',
    );
  }
  if (current.phase === 'return_confirmed') return current;

  const confirmed: CreatedCheckout = {
    ...current,
    phase: 'return_confirmed',
    updatedAt: now(),
  };
  writePendingCheckout(storage, confirmed);
  return confirmed;
}

export function requestCheckoutCancellation(
  storage: WritableStorage,
  now: () => string = () => new Date().toISOString(),
): CreatedCheckout {
  const current = readPendingCheckout(storage);
  if (!current || current.phase === 'request_prepared') {
    throw new Error('No server checkout is available to cancel.');
  }
  if (current.phase === 'cancel_requested') return current;
  if (current.phase === 'return_confirmed') {
    throw new Error('This payment is already awaiting ledger confirmation.');
  }
  const cancellation: CreatedCheckout = {
    ...current,
    phase: 'cancel_requested',
    updatedAt: now(),
  };
  writePendingCheckout(storage, cancellation);
  return cancellation;
}

export function readCheckoutReturn(search: string): CheckoutReturn {
  const params = new URLSearchParams(search);
  const state = params.get('checkout');
  if (state === 'cancel') return { kind: 'cancel', sessionId: null };
  if (state === 'success') {
    return {
      kind: 'success',
      sessionId: params.get('session_id'),
    };
  }
  return { kind: 'none', sessionId: null };
}

export function checkoutReturnUrlWithoutPaymentParams(
  currentUrl: string,
): string {
  const url = new URL(currentUrl);
  url.searchParams.delete('checkout');
  url.searchParams.delete('session_id');
  // A same-origin path is returned deliberately; provider-controlled query
  // values can never turn history.replaceState into an external navigation.
  return `${url.pathname}${url.search}${url.hash}`;
}
