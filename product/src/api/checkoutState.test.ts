import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkoutReturnUrlWithoutPaymentParams,
  clearPendingCheckout,
  confirmCheckoutReturn,
  prepareCheckoutRequest,
  readCheckoutReturn,
  readPendingCheckout,
  recordCheckoutSession,
} from './checkoutState';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

test('checkout lifecycle is durable, resumable, and conditionally cleared', () => {
  const storage = memoryStorage();
  let requestIdsCreated = 0;
  const createRequestId = () => {
    requestIdsCreated += 1;
    return '3f67d667-49d9-4a1f-91c5-a5107be65721';
  };

  const prepared = prepareCheckoutRequest(
    storage,
    'starter',
    createRequestId,
    () => '2026-07-26T12:00:00Z',
  );
  assert.equal(prepared.phase, 'request_prepared');
  assert.deepEqual(readPendingCheckout(storage), prepared);

  const resumed = prepareCheckoutRequest(
    storage,
    'starter',
    createRequestId,
  );
  assert.deepEqual(resumed, prepared);
  assert.equal(requestIdsCreated, 1);

  const created = recordCheckoutSession(
    storage,
    {
      orderId: '53272df4-5108-4aee-870d-956baa4a55e2',
      requestId: prepared.requestId,
      packId: prepared.packId,
      checkoutSessionId: 'cs_live_123',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_live_123',
    },
    () => '2026-07-26T12:00:01Z',
  );
  assert.equal(created.phase, 'checkout_created');

  const confirmed = confirmCheckoutReturn(
    storage,
    'cs_live_123',
    () => '2026-07-26T12:05:00Z',
  );
  assert.equal(confirmed.phase, 'return_confirmed');
  assert.deepEqual(
    confirmCheckoutReturn(storage, 'cs_live_123'),
    confirmed,
    'confirming the same return twice is idempotent',
  );

  assert.equal(clearPendingCheckout(storage, 'another-request'), false);
  assert.deepEqual(readPendingCheckout(storage), confirmed);
  assert.equal(clearPendingCheckout(storage, prepared.requestId), true);
  assert.equal(readPendingCheckout(storage), null);
});

test('a pending request cannot silently change its credit pack', () => {
  const storage = memoryStorage();
  prepareCheckoutRequest(storage, 'starter', () => 'request-id');
  assert.throws(
    () => prepareCheckoutRequest(storage, 'pro', () => 'another-request-id'),
    /already pending/,
  );
});

test('checkout return parser recognizes configured params and cleanup is same-origin', () => {
  assert.deepEqual(
    readCheckoutReturn('?checkout=success&session_id=cs_live_123'),
    { kind: 'success', sessionId: 'cs_live_123' },
  );
  assert.deepEqual(
    readCheckoutReturn('?checkout=cancel'),
    { kind: 'cancel', sessionId: null },
  );
  assert.deepEqual(
    readCheckoutReturn('?checkout=other'),
    { kind: 'none', sessionId: null },
  );
  assert.equal(
    checkoutReturnUrlWithoutPaymentParams(
      'https://ai.lumaquant.tech/?checkout=success&session_id=https%3A%2F%2Fevil.test&tab=shop#ledger',
    ),
    '/?tab=shop#ledger',
  );
});
