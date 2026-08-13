import assert from 'node:assert/strict';
import test from 'node:test';
import { readPendingCheckout } from './checkoutState';
import {
  createOrResumePaymentCheckout,
  PaymentCheckoutCreditedError,
  PaymentCheckoutProcessingError,
} from './paymentCheckout';
import type {
  CheckoutSessionResponse,
  PaymentOrderResponse,
} from './payments';
import {
  CURRENT_PAID_TERMS_VERSION,
} from './payments';
import { LEGAL_DOCUMENT_SHA256 } from '../legal/legalPolicies';

const REQUEST_ID = '3f67d667-49d9-4a1f-91c5-a5107be65721';
const ORDER_ID = '53272df4-5108-4aee-870d-956baa4a55e2';
const NEXT_REQUEST_ID = '47ac10b5-58cc-4372-a567-0e02b2c3d479';
const NEXT_ORDER_ID = '5c065756-75e5-4751-a438-01a8f7fd1760';

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

function checkoutResponse(
  overrides: Partial<CheckoutSessionResponse> = {},
): CheckoutSessionResponse {
  return {
    order_id: ORDER_ID,
    request_id: REQUEST_ID,
    pack_id: 'starter',
    credits: '200.00',
    amount_minor: 399,
    currency: 'eur',
    status: 'open',
    checkout_session_id: 'cs_live_123',
    checkout_url: 'https://checkout.stripe.com/c/pay/cs_live_123',
    provider: 'stripe_checkout',
    paid_terms_version: CURRENT_PAID_TERMS_VERSION,
    paid_terms_document_sha256: LEGAL_DOCUMENT_SHA256['paid-services'],
    paid_terms_accepted_at: '2026-08-01T08:00:00Z',
    immediate_performance_requested: true,
    withdrawal_right_acknowledged: true,
    ...overrides,
  };
}

function canceledOrder(
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
    payment_flow: 'one_time',
    status: 'expired',
    credited: false,
    created_at: '2026-07-26T12:00:00Z',
    updated_at: '2026-07-26T12:01:00Z',
    ...overrides,
  };
}

test('lost POST response retries with the request ID persisted before the first POST', async () => {
  const storage = memoryStorage();
  let requestIdCreations = 0;
  const postedRequestIds: string[] = [];

  const firstAttempt = createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => {
      requestIdCreations += 1;
      return REQUEST_ID;
    },
    createSession: async (_packId, requestId) => {
      postedRequestIds.push(requestId);
      throw new Error('response lost');
    },
    now: () => '2026-07-26T12:00:00Z',
  });
  await assert.rejects(firstAttempt, /response lost/);

  const savedBeforeRetry = readPendingCheckout(storage);
  assert.equal(savedBeforeRetry?.phase, 'request_prepared');
  assert.equal(savedBeforeRetry?.requestId, REQUEST_ID);

  const resumed = await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => {
      requestIdCreations += 1;
      return 'must-not-be-used';
    },
    createSession: async (_packId, requestId) => {
      postedRequestIds.push(requestId);
      return checkoutResponse();
    },
    now: () => '2026-07-26T12:00:01Z',
  });

  assert.equal(resumed.phase, 'checkout_created');
  assert.equal(requestIdCreations, 1);
  assert.deepEqual(postedRequestIds, [REQUEST_ID, REQUEST_ID]);
});

test('a stored Stripe session is revalidated with its original request ID', async () => {
  const storage = memoryStorage();
  const initial = await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => REQUEST_ID,
    createSession: async () => checkoutResponse(),
    now: () => '2026-07-26T12:00:00Z',
  });

  const retryPosts: Array<{ packId: string; requestId: string }> = [];
  const resumed = await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => 'must-not-be-used',
    createSession: async (packId, requestId) => {
      retryPosts.push({ packId, requestId });
      return checkoutResponse();
    },
    now: () => '2026-07-26T12:00:00Z',
  });

  assert.deepEqual(resumed, initial);
  assert.deepEqual(retryPosts, [{
    packId: 'starter',
    requestId: REQUEST_ID,
  }]);
});

test('an expired stored session is cleared and replaced with a fresh checkout', async () => {
  const storage = memoryStorage();
  await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => REQUEST_ID,
    createSession: async () => checkoutResponse(),
  });

  const posted: Array<{ packId: string; requestId: string }> = [];
  const checkout = await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => NEXT_REQUEST_ID,
    createSession: async (packId, requestId) => {
      posted.push({ packId, requestId });
      if (requestId === REQUEST_ID) {
        throw {
          response: {
            status: 409,
            data: { detail: 'stale_unbound_checkout_released' },
          },
        };
      }
      return checkoutResponse({
        order_id: NEXT_ORDER_ID,
        request_id: requestId,
        pack_id: packId,
        checkout_session_id: 'cs_live_fresh',
        checkout_url: 'https://checkout.stripe.com/c/pay/cs_live_fresh',
      });
    },
  });

  assert.deepEqual(posted, [
    { packId: 'starter', requestId: REQUEST_ID },
    { packId: 'starter', requestId: NEXT_REQUEST_ID },
  ]);
  assert.equal(checkout.orderId, NEXT_ORDER_ID);
  assert.equal(checkout.requestId, NEXT_REQUEST_ID);
  assert.equal(readPendingCheckout(storage)?.requestId, NEXT_REQUEST_ID);
});

test('an expired checkout for another pack no longer blocks a new pack', async () => {
  const storage = memoryStorage();
  await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => REQUEST_ID,
    createSession: async () => checkoutResponse(),
  });

  const checkout = await createOrResumePaymentCheckout('core', {
    storage,
    createRequestId: () => NEXT_REQUEST_ID,
    createSession: async (packId, requestId) => {
      if (requestId === REQUEST_ID) {
        assert.equal(packId, 'starter');
        throw {
          response: {
            status: 409,
            data: { detail: 'stale_unbound_checkout_released' },
          },
        };
      }
      return checkoutResponse({
        order_id: NEXT_ORDER_ID,
        request_id: requestId,
        pack_id: packId,
        checkout_session_id: 'cs_live_core',
        checkout_url: 'https://checkout.stripe.com/c/pay/cs_live_core',
      });
    },
  });

  assert.equal(checkout.packId, 'core');
  assert.equal(checkout.requestId, NEXT_REQUEST_ID);
});

test('an active checkout is canceled server-side before another pack starts', async () => {
  const storage = memoryStorage();
  await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => REQUEST_ID,
    createSession: async () => checkoutResponse(),
  });

  const posted: Array<{ packId: string; requestId: string }> = [];
  const canceled: string[] = [];
  const checkout = await createOrResumePaymentCheckout('core', {
    storage,
    createRequestId: () => NEXT_REQUEST_ID,
    cancelSession: async (orderId) => {
      canceled.push(orderId);
      return canceledOrder();
    },
    createSession: async (packId, requestId) => {
      posted.push({ packId, requestId });
      if (requestId === REQUEST_ID) return checkoutResponse();
      return checkoutResponse({
        order_id: NEXT_ORDER_ID,
        request_id: requestId,
        pack_id: packId,
        checkout_session_id: 'cs_live_core',
        checkout_url: 'https://checkout.stripe.com/c/pay/cs_live_core',
      });
    },
  });

  assert.deepEqual(canceled, [ORDER_ID]);
  assert.deepEqual(posted, [
    { packId: 'starter', requestId: REQUEST_ID },
    { packId: 'core', requestId: NEXT_REQUEST_ID },
  ]);
  assert.equal(checkout.packId, 'core');
  assert.equal(readPendingCheckout(storage)?.requestId, NEXT_REQUEST_ID);
  assert.equal(readPendingCheckout(storage)?.packId, 'core');
});

test('a processing cancellation never starts the newly selected pack', async () => {
  const storage = memoryStorage();
  await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => REQUEST_ID,
    createSession: async () => checkoutResponse(),
  });

  let checkoutPosts = 0;
  await assert.rejects(
    createOrResumePaymentCheckout('core', {
      storage,
      cancelSession: async () => canceledOrder({ status: 'processing' }),
      createSession: async () => {
        checkoutPosts += 1;
        return checkoutResponse();
      },
    }),
    PaymentCheckoutProcessingError,
  );

  assert.equal(checkoutPosts, 1);
  assert.equal(readPendingCheckout(storage)?.phase, 'return_confirmed');
  assert.equal(readPendingCheckout(storage)?.packId, 'starter');
});

test('a concurrently credited checkout requires a new deliberate pack click', async () => {
  const storage = memoryStorage();
  await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => REQUEST_ID,
    createSession: async () => checkoutResponse(),
  });

  let checkoutPosts = 0;
  await assert.rejects(
    createOrResumePaymentCheckout('core', {
      storage,
      cancelSession: async () => canceledOrder({
        status: 'credited',
        credited: true,
      }),
      createSession: async () => {
        checkoutPosts += 1;
        return checkoutResponse();
      },
    }),
    PaymentCheckoutCreditedError,
  );

  assert.equal(checkoutPosts, 1);
  assert.equal(readPendingCheckout(storage), null);
});

test('a cancellation network failure keeps the exact prior order retryable', async () => {
  const storage = memoryStorage();
  await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => REQUEST_ID,
    createSession: async () => checkoutResponse(),
  });

  await assert.rejects(
    createOrResumePaymentCheckout('core', {
      storage,
      createSession: async () => checkoutResponse(),
      cancelSession: async () => {
        throw new Error('cancel status unavailable');
      },
    }),
    /cancel status unavailable/,
  );

  assert.equal(readPendingCheckout(storage)?.phase, 'cancel_requested');
  assert.equal(readPendingCheckout(storage)?.requestId, REQUEST_ID);
});

test('a mismatched checkout identity is never resumed, cleared, or replaced', async () => {
  const storage = memoryStorage();
  await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => REQUEST_ID,
    createSession: async () => checkoutResponse(),
  });

  let checkoutPosts = 0;
  await assert.rejects(
    createOrResumePaymentCheckout('starter', {
      storage,
      createSession: async () => {
        checkoutPosts += 1;
        return checkoutResponse({
          order_id: NEXT_ORDER_ID,
        });
      },
    }),
    /different payment session/,
  );

  assert.equal(checkoutPosts, 1);
  assert.equal(readPendingCheckout(storage)?.requestId, REQUEST_ID);
});

test('a processing conflict enters reconciliation and is never treated as expired', async () => {
  const storage = memoryStorage();
  await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => REQUEST_ID,
    createSession: async () => checkoutResponse(),
  });

  let requestIdCreations = 0;
  await assert.rejects(
    createOrResumePaymentCheckout('starter', {
      storage,
      createRequestId: () => {
        requestIdCreations += 1;
        return NEXT_REQUEST_ID;
      },
      createSession: async () => {
        throw {
          response: {
            status: 409,
            data: {
              detail: 'Checkout payment is processing; refresh payment status',
            },
          },
        };
      },
    }),
    PaymentCheckoutProcessingError,
  );

  assert.equal(requestIdCreations, 0);
  assert.equal(readPendingCheckout(storage)?.requestId, REQUEST_ID);
  assert.equal(readPendingCheckout(storage)?.phase, 'return_confirmed');
});

test('a failed provider revalidation never creates a fresh checkout identity', async () => {
  const storage = memoryStorage();
  await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => REQUEST_ID,
    createSession: async () => checkoutResponse(),
  });

  let checkoutPosts = 0;
  await assert.rejects(
    createOrResumePaymentCheckout('starter', {
      storage,
      createSession: async () => {
        checkoutPosts += 1;
        throw new Error('status unavailable');
      },
    }),
    /status unavailable/,
  );

  assert.equal(checkoutPosts, 1);
  assert.equal(readPendingCheckout(storage)?.requestId, REQUEST_ID);
});

test('stale unbound checkout is cleared and retried exactly once with a new request ID', async () => {
  const storage = memoryStorage();
  const requestIds = [
    REQUEST_ID,
    NEXT_REQUEST_ID,
  ];
  const posted: string[] = [];

  const checkout = await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => {
      const requestId = requestIds.shift();
      assert.ok(requestId);
      return requestId;
    },
    createSession: async (_packId, requestId) => {
      posted.push(requestId);
      if (posted.length === 1) {
        throw {
          response: {
            status: 409,
            data: { detail: 'stale_unbound_checkout_released' },
          },
        };
      }
      return {
        ...checkoutResponse(),
        request_id: requestId,
      };
    },
  });

  assert.deepEqual(posted, [
    REQUEST_ID,
    NEXT_REQUEST_ID,
  ]);
  assert.equal(checkout.requestId, posted[1]);
  assert.equal(readPendingCheckout(storage)?.requestId, posted[1]);
});

test('stale unbound recovery never retries more than once', async () => {
  const storage = memoryStorage();
  let attempts = 0;

  await assert.rejects(
    createOrResumePaymentCheckout('starter', {
      storage,
      createRequestId: () => (
        attempts === 0
          ? REQUEST_ID
          : NEXT_REQUEST_ID
      ),
      createSession: async () => {
        attempts += 1;
        throw {
          response: {
            status: 409,
            data: { detail: 'stale_unbound_checkout_released' },
          },
        };
      },
    }),
    (error: unknown) => (
      typeof error === 'object'
      && error !== null
      && 'response' in error
    ),
  );
  assert.equal(attempts, 2);
});

test('legacy request without legal evidence is replaced once after fresh consent', async () => {
  const storage = memoryStorage();
  const requestIds = [REQUEST_ID, NEXT_REQUEST_ID];
  const posted: Array<{ requestId: string; accepted: boolean }> = [];

  const checkout = await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => {
      const requestId = requestIds.shift();
      assert.ok(requestId);
      return requestId;
    },
    createSession: async (_packId, requestId, acknowledgement) => {
      posted.push({
        requestId,
        accepted: acknowledgement.paid_terms_accepted,
      });
      if (requestId === REQUEST_ID) {
        throw {
          response: {
            status: 409,
            data: { detail: 'payment_order_legal_evidence_missing' },
          },
        };
      }
      return checkoutResponse({ request_id: requestId });
    },
  });

  assert.deepEqual(posted, [
    { requestId: REQUEST_ID, accepted: true },
    { requestId: NEXT_REQUEST_ID, accepted: true },
  ]);
  assert.equal(checkout.requestId, NEXT_REQUEST_ID);
  assert.equal(readPendingCheckout(storage)?.requestId, NEXT_REQUEST_ID);
});

test('legacy legal-evidence recovery never retries more than once', async () => {
  const storage = memoryStorage();
  const requestIds = [REQUEST_ID, NEXT_REQUEST_ID];
  let attempts = 0;

  await assert.rejects(
    createOrResumePaymentCheckout('starter', {
      storage,
      createRequestId: () => {
        const requestId = requestIds.shift();
        assert.ok(requestId);
        return requestId;
      },
      createSession: async () => {
        attempts += 1;
        throw {
          response: {
            status: 409,
            data: { detail: 'payment_order_legal_evidence_missing' },
          },
        };
      },
    }),
    (error: unknown) => (
      typeof error === 'object'
      && error !== null
      && 'response' in error
    ),
  );

  assert.equal(attempts, 2);
  assert.equal(readPendingCheckout(storage)?.requestId, NEXT_REQUEST_ID);
});

test('a bound legacy checkout is canceled before fresh legal evidence creates a replacement', async () => {
  const storage = memoryStorage();
  await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => REQUEST_ID,
    createSession: async () => checkoutResponse(),
  });

  let requestIdCreations = 0;
  const posted: string[] = [];
  const canceled: string[] = [];
  const checkout = await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => {
      requestIdCreations += 1;
      return NEXT_REQUEST_ID;
    },
    createSession: async (_packId, requestId) => {
      posted.push(requestId);
      if (requestId === REQUEST_ID) {
        throw {
          response: {
            status: 409,
            data: { detail: 'payment_order_legal_evidence_missing' },
          },
        };
      }
      return checkoutResponse({
        order_id: NEXT_ORDER_ID,
        request_id: NEXT_REQUEST_ID,
        checkout_session_id: 'cs_live_current_terms',
        checkout_url:
          'https://checkout.stripe.com/c/pay/cs_live_current_terms',
      });
    },
    cancelSession: async (orderId) => {
      canceled.push(orderId);
      return canceledOrder();
    },
  });

  assert.deepEqual(posted, [REQUEST_ID, NEXT_REQUEST_ID]);
  assert.deepEqual(canceled, [ORDER_ID]);
  assert.equal(requestIdCreations, 1);
  assert.equal(readPendingCheckout(storage)?.phase, 'checkout_created');
  assert.equal(readPendingCheckout(storage)?.requestId, NEXT_REQUEST_ID);
  assert.equal(checkout.requestId, NEXT_REQUEST_ID);
});

test('a bound checkout with an outdated legal version is canceled before replacement', async () => {
  const storage = memoryStorage();
  await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => REQUEST_ID,
    createSession: async () => checkoutResponse(),
  });

  const posted: string[] = [];
  const canceled: string[] = [];
  const checkout = await createOrResumePaymentCheckout('starter', {
    storage,
    createRequestId: () => NEXT_REQUEST_ID,
    createSession: async (_packId, requestId) => {
      posted.push(requestId);
      if (requestId === REQUEST_ID) {
        throw {
          response: {
            status: 409,
            data: { detail: 'payment_order_legal_evidence_conflict' },
          },
        };
      }
      return checkoutResponse({
        order_id: NEXT_ORDER_ID,
        request_id: NEXT_REQUEST_ID,
        checkout_session_id: 'cs_live_current_terms',
        checkout_url:
          'https://checkout.stripe.com/c/pay/cs_live_current_terms',
      });
    },
    cancelSession: async (orderId) => {
      canceled.push(orderId);
      return canceledOrder();
    },
  });

  assert.deepEqual(posted, [REQUEST_ID, NEXT_REQUEST_ID]);
  assert.deepEqual(canceled, [ORDER_ID]);
  assert.equal(readPendingCheckout(storage)?.requestId, NEXT_REQUEST_ID);
  assert.equal(checkout.requestId, NEXT_REQUEST_ID);
});

test('legacy prepared checkout for another pack is cleared before the requested pack starts', async () => {
  const storage = memoryStorage();
  await assert.rejects(
    createOrResumePaymentCheckout('starter', {
      storage,
      createRequestId: () => REQUEST_ID,
      createSession: async () => {
        throw new Error('response lost');
      },
    }),
    /response lost/,
  );

  const posted: Array<{ packId: string; requestId: string }> = [];
  const checkout = await createOrResumePaymentCheckout('core', {
    storage,
    createRequestId: () => NEXT_REQUEST_ID,
    createSession: async (packId, requestId) => {
      posted.push({ packId, requestId });
      if (requestId === REQUEST_ID) {
        throw {
          response: {
            status: 409,
            data: { detail: 'payment_order_legal_evidence_missing' },
          },
        };
      }
      return checkoutResponse({
        order_id: NEXT_ORDER_ID,
        request_id: requestId,
        pack_id: packId,
        checkout_session_id: 'cs_live_core_current_terms',
        checkout_url:
          'https://checkout.stripe.com/c/pay/cs_live_core_current_terms',
      });
    },
  });

  assert.deepEqual(posted, [
    { packId: 'starter', requestId: REQUEST_ID },
    { packId: 'core', requestId: NEXT_REQUEST_ID },
  ]);
  assert.equal(checkout.packId, 'core');
  assert.equal(checkout.requestId, NEXT_REQUEST_ID);
});
