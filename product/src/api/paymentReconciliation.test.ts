import assert from 'node:assert/strict';
import test from 'node:test';
import {
  prepareCheckoutRequest,
  readPendingCheckout,
  recordCheckoutSession,
} from './checkoutState';
import {
  cancelPendingCheckout,
  consumeCheckoutReturn,
  reconcileConfirmedPayment,
} from './paymentReconciliation';
import type { PaymentOrderResponse } from './payments';

const REQUEST_ID = '3f67d667-49d9-4a1f-91c5-a5107be65721';
const ORDER_ID = '53272df4-5108-4aee-870d-956baa4a55e2';

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

function paymentOrder(
  overrides: Partial<PaymentOrderResponse> = {},
): PaymentOrderResponse {
  return {
    order_id: ORDER_ID,
    request_id: REQUEST_ID,
    pack_id: 'starter',
    credits: '200.00',
    amount_minor: 399,
    currency: 'eur',
    kind: 'credit_pack',
    valid_until: null,
    payment_flow: 'checkout',
    status: 'succeeded',
    credited: true,
    created_at: '2026-07-26T12:00:00Z',
    updated_at: '2026-07-26T12:00:02Z',
    ...overrides,
  };
}

function storedCheckout(storage: Storage): void {
  const prepared = prepareCheckoutRequest(
    storage,
    'starter',
    () => REQUEST_ID,
  );
  recordCheckoutSession(storage, {
    orderId: ORDER_ID,
    requestId: prepared.requestId,
    packId: prepared.packId,
    checkoutSessionId: 'cs_live_123',
    checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_live_123',
  });
}

test('success return is confirmed, safely cleaned, and reconciled after app start', async () => {
  const storage = memoryStorage();
  storedCheckout(storage);
  let replacement = '';

  const consumed = consumeCheckoutReturn({
    storage,
    search: '?checkout=success&session_id=cs_live_123&tab=shop',
    currentUrl: 'https://ai.lumaquant.tech/?checkout=success&session_id=cs_live_123&tab=shop',
    replaceUrl: (value) => {
      replacement = value;
    },
  });

  assert.equal(consumed.pending?.phase, 'return_confirmed');
  assert.equal(consumed.notice?.status, 'reconciling');
  assert.equal(replacement, '/?tab=shop');

  // Once URL params are gone, a later app/auth startup still finds the durable
  // confirmed order and resumes reconciliation.
  const resumed = consumeCheckoutReturn({
    storage,
    search: '?tab=shop',
    currentUrl: 'https://ai.lumaquant.tech/?tab=shop',
    replaceUrl: () => assert.fail('no cleanup expected'),
  });
  assert.equal(resumed.pending?.phase, 'return_confirmed');

  const result = await reconcileConfirmedPayment({
    storage,
    fetchOrder: async () => paymentOrder(),
    attempts: 1,
    wait: async () => undefined,
  });
  assert.deepEqual(result, { kind: 'credited', credits: 200 });
  assert.equal(readPendingCheckout(storage), null);
});

test('order identity mismatch never clears or credits the saved checkout', async () => {
  const storage = memoryStorage();
  storedCheckout(storage);
  consumeCheckoutReturn({
    storage,
    search: '?checkout=success&session_id=cs_live_123',
    currentUrl: 'https://ai.lumaquant.tech/?checkout=success&session_id=cs_live_123',
    replaceUrl: () => undefined,
  });

  const result = await reconcileConfirmedPayment({
    storage,
    fetchOrder: async () => paymentOrder({ request_id: 'different-request' }),
    attempts: 1,
    wait: async () => undefined,
  });
  assert.equal(result.kind, 'delayed');
  assert.equal(readPendingCheckout(storage)?.phase, 'return_confirmed');
});

test('cancel return is retained until the backend confirms a terminal order', async () => {
  const storage = memoryStorage();
  storedCheckout(storage);
  let replacement = '';

  const first = consumeCheckoutReturn({
    storage,
    search: '?checkout=cancel&tab=shop',
    currentUrl: 'https://ai.lumaquant.tech/?checkout=cancel&tab=shop#ledger',
    replaceUrl: (value) => {
      replacement = value;
    },
  });
  assert.equal(first.notice?.status, 'reconciling');
  assert.equal(first.cancelRequested, true);
  assert.equal(replacement, '/?tab=shop#ledger');
  assert.equal(readPendingCheckout(storage)?.phase, 'cancel_requested');

  const cancellation = await cancelPendingCheckout({
    storage,
    cancelOrder: async () => paymentOrder({
      credited: false,
      status: 'expired',
    }),
  });
  assert.deepEqual(cancellation, { kind: 'terminal', status: 'expired' });
  assert.equal(readPendingCheckout(storage), null);

  assert.doesNotThrow(() => consumeCheckoutReturn({
    storage,
    search: '?checkout=cancel',
    currentUrl: 'https://ai.lumaquant.tech/?checkout=cancel',
    replaceUrl: () => undefined,
  }));
});

test('cancel network failure keeps checkout and processing switches to reconciliation', async () => {
  const storage = memoryStorage();
  storedCheckout(storage);
  consumeCheckoutReturn({
    storage,
    search: '?checkout=cancel',
    currentUrl: 'https://ai.lumaquant.tech/?checkout=cancel',
    replaceUrl: () => undefined,
  });

  const failed = await cancelPendingCheckout({
    storage,
    cancelOrder: async () => {
      throw new Error('network unavailable');
    },
  });
  assert.equal(failed.kind, 'delayed');
  assert.equal(readPendingCheckout(storage)?.phase, 'cancel_requested');

  const processing = await cancelPendingCheckout({
    storage,
    cancelOrder: async () => paymentOrder({
      credited: false,
      status: 'processing',
    }),
  });
  assert.deepEqual(processing, { kind: 'processing' });
  assert.equal(readPendingCheckout(storage)?.phase, 'return_confirmed');
});
