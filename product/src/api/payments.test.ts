import assert from 'node:assert/strict';
import test from 'node:test';
import type { AxiosRequestConfig } from 'axios';
import apiClient from './apiClient';
import {
  cancelCheckoutSession,
  CURRENT_PAID_TERMS_ACKNOWLEDGEMENT,
  CURRENT_PAID_TERMS_VERSION,
  createCheckoutSession,
  fetchPaymentConfig,
  fetchPaymentOrder,
  isFinalPaymentOrder,
  isSafeStripeCheckoutUrl,
  PAID_TERMS_PATH,
  type PaymentOrderResponse,
} from './payments';
import { LEGAL_DOCUMENT_SHA256 } from '../legal/legalPolicies';

const REQUEST_ID = '3f67d667-49d9-4a1f-91c5-a5107be65721';
const ORDER_ID = '53272df4-5108-4aee-870d-956baa4a55e2';
const PAYMENT_POLICY_CONFIG = {
  paid_terms_version: CURRENT_PAID_TERMS_VERSION,
  paid_terms_document_sha256: LEGAL_DOCUMENT_SHA256['paid-services'],
  paid_terms_path: PAID_TERMS_PATH,
};
const CHECKOUT_LEGAL_EVIDENCE = {
  paid_terms_version: CURRENT_PAID_TERMS_VERSION,
  paid_terms_document_sha256: LEGAL_DOCUMENT_SHA256['paid-services'],
  paid_terms_accepted_at: '2026-08-01T08:00:00Z',
  immediate_performance_requested: true,
  withdrawal_right_acknowledged: true,
} as const;

function checkoutSessionData(overrides: Record<string, unknown> = {}) {
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
    ...CHECKOUT_LEGAL_EVIDENCE,
    ...overrides,
  };
}

const SIX_PACKS: Array<Record<string, unknown>> = [
  ['starter', 'Starter', '200.00', 399],
  ['core', 'Core', '550.00', 999],
  ['pro', 'Pro', '1000.00', 1999],
  ['studio', 'Studio', '2800.00', 4999],
  ['big', 'Big', '6000.00', 9999],
].map(([pack_id, label, credits, amount_minor]) => ({
  pack_id,
  label,
  credits,
  amount_minor,
  currency: 'eur',
  kind: 'credit_pack',
  can_purchase: true,
  unavailable_reason: null,
  next_purchase_at: null,
  valid_until: null,
  active_remaining_credits: null,
  purchase_state: 'available',
  timezone: null,
}));
SIX_PACKS.push({
  pack_id: 'monthly_pass',
  label: 'Monthly Pass',
  credits: '1250.00',
  amount_minor: 2399,
  currency: 'eur',
  kind: 'calendar_month_pass',
  can_purchase: false,
  unavailable_reason: 'Monthly Pass already purchased for this calendar month.',
  next_purchase_at: '2026-07-31T22:00:00Z',
  valid_until: '2026-07-31T22:00:00Z',
  active_remaining_credits: '725.00',
  purchase_state: 'already_purchased',
  timezone: 'Europe/Vienna',
});

test('fetchPaymentConfig loads only the authenticated server catalog', async (context) => {
  const originalGet = apiClient.get;
  let requestedUrl = '';
  apiClient.get = (async (url: string) => {
    requestedUrl = url;
    return {
      data: {
        publishable_key: 'pk_live_public',
        livemode: true,
        ...PAYMENT_POLICY_CONFIG,
        packs: SIX_PACKS,
      },
    };
  }) as typeof apiClient.get;
  context.after(() => {
    apiClient.get = originalGet;
  });

  const config = await fetchPaymentConfig();

  assert.equal(requestedUrl, '/api/v1/payments/config');
  assert.equal(config.livemode, true);
  assert.deepEqual(config.packs.map((pack) => pack.pack_id), [
    'starter',
    'core',
    'pro',
    'studio',
    'big',
    'monthly_pass',
  ]);
  assert.deepEqual(config.packs.at(-1), SIX_PACKS.at(-1));
});

test('payment config fails closed when monthly availability fields are missing', async (context) => {
  const originalGet = apiClient.get;
  apiClient.get = (async () => ({
    data: {
      publishable_key: 'pk_test_public',
      livemode: false,
      ...PAYMENT_POLICY_CONFIG,
      packs: [{
        pack_id: 'monthly_pass',
        label: 'Monthly Pass',
        credits: '1250.00',
        amount_minor: 2399,
        currency: 'eur',
        kind: 'calendar_month_pass',
      }],
    },
  })) as typeof apiClient.get;
  context.after(() => {
    apiClient.get = originalGet;
  });

  await assert.rejects(fetchPaymentConfig(), /invalid can_purchase/);
});

test('payment config rejects invalid kinds, timestamps, and remaining credits', async (context) => {
  const originalGet = apiClient.get;
  context.after(() => {
    apiClient.get = originalGet;
  });

  for (const [field, replacement, message] of [
    ['kind', 'subscription', /invalid payment pack kind/],
    ['next_purchase_at', 'next month', /invalid next_purchase_at/],
    ['active_remaining_credits', '-1.00', /invalid active_remaining_credits/],
  ] as const) {
    apiClient.get = (async () => ({
      data: {
        publishable_key: 'pk_test_public',
        livemode: false,
        ...PAYMENT_POLICY_CONFIG,
        packs: [{
          ...SIX_PACKS[5],
          [field]: replacement,
        }],
      },
    })) as typeof apiClient.get;

    await assert.rejects(fetchPaymentConfig(), message);
  }
});

test('payment config fails closed on stale or unverifiable paid terms', async (context) => {
  const originalGet = apiClient.get;
  context.after(() => {
    apiClient.get = originalGet;
  });

  for (const [override, message] of [
    [{ paid_terms_version: '2026-07-01.v1' }, /newer paid-services policy/],
    [{ paid_terms_document_sha256: 'f'.repeat(64) }, /could not be verified/],
    [{ paid_terms_document_sha256: 'invalid' }, /could not be verified/],
    [{ paid_terms_path: '/terms' }, /policy link could not be verified/],
  ] as const) {
    apiClient.get = (async () => ({
      data: {
        publishable_key: 'pk_test_public',
        livemode: false,
        ...PAYMENT_POLICY_CONFIG,
        ...override,
        packs: SIX_PACKS,
      },
    })) as typeof apiClient.get;

    await assert.rejects(fetchPaymentConfig(), message);
  }
});

test('createCheckoutSession sends order identity and current paid-term evidence', async (context) => {
  const originalPost = apiClient.post;
  let request:
    | { url: string; body: unknown; config?: AxiosRequestConfig }
    | undefined;
  apiClient.post = (async (
    url: string,
    body: unknown,
    config?: AxiosRequestConfig,
  ) => {
    request = { url, body, config };
    return {
      data: checkoutSessionData(),
    };
  }) as typeof apiClient.post;
  context.after(() => {
    apiClient.post = originalPost;
  });

  const checkout = await createCheckoutSession(
    'starter',
    REQUEST_ID,
    CURRENT_PAID_TERMS_ACKNOWLEDGEMENT,
  );

  assert.deepEqual(request, {
    url: '/api/v1/billing/create-checkout-session',
    body: {
      request_id: REQUEST_ID,
      pack_id: 'starter',
      paid_terms_version: CURRENT_PAID_TERMS_VERSION,
      paid_terms_accepted: true,
      immediate_performance_requested: true,
      withdrawal_right_acknowledged: true,
    },
    config: { signal: undefined },
  });
  assert.equal(checkout.order_id, ORDER_ID);
  assert.equal(
    checkout.paid_terms_document_sha256,
    LEGAL_DOCUMENT_SHA256['paid-services'],
  );
  assert.equal(checkout.immediate_performance_requested, true);
  assert.equal(checkout.withdrawal_right_acknowledged, true);
});

test('checkout refuses a non-Stripe redirect URL', async (context) => {
  const originalPost = apiClient.post;
  apiClient.post = (async () => ({
    data: checkoutSessionData({
      checkout_url: 'https://example.test/collect',
    }),
  })) as typeof apiClient.post;
  context.after(() => {
    apiClient.post = originalPost;
  });

  await assert.rejects(
    createCheckoutSession(
      'starter',
      REQUEST_ID,
      CURRENT_PAID_TERMS_ACKNOWLEDGEMENT,
    ),
    /unsafe checkout URL/,
  );
  assert.equal(
    isSafeStripeCheckoutUrl('https://checkout.stripe.com/c/pay/session'),
    true,
  );
  assert.equal(isSafeStripeCheckoutUrl('http://checkout.stripe.com/'), false);
});

test('checkout rejects missing or mismatched server-side legal evidence', async (context) => {
  const originalPost = apiClient.post;
  context.after(() => {
    apiClient.post = originalPost;
  });

  const missingFields = [
    'paid_terms_version',
    'paid_terms_document_sha256',
    'paid_terms_accepted_at',
    'immediate_performance_requested',
    'withdrawal_right_acknowledged',
  ] as const;
  for (const field of missingFields) {
    const response: Record<string, unknown> = checkoutSessionData();
    delete response[field];
    apiClient.post = (async () => ({ data: response })) as typeof apiClient.post;
    await assert.rejects(
      createCheckoutSession(
        'starter',
        REQUEST_ID,
        CURRENT_PAID_TERMS_ACKNOWLEDGEMENT,
      ),
      /invalid paid_terms_|missing required paid-service acknowledgements/,
    );
  }

  for (const [override, message] of [
    [{ paid_terms_version: '2026-07-01.v1' }, /current paid-services policy/],
    [{ paid_terms_document_sha256: 'f'.repeat(64) }, /unverifiable/],
    [{ paid_terms_accepted_at: 'not-a-timestamp' }, /invalid paid-terms acceptance timestamp/],
    [{ immediate_performance_requested: false }, /missing required/],
    [{ withdrawal_right_acknowledged: false }, /missing required/],
  ] as const) {
    apiClient.post = (async () => ({
      data: checkoutSessionData(override),
    })) as typeof apiClient.post;
    await assert.rejects(
      createCheckoutSession(
        'starter',
        REQUEST_ID,
        CURRENT_PAID_TERMS_ACKNOWLEDGEMENT,
      ),
      message,
    );
  }
});

test('checkout rejects incomplete or stale paid-term evidence before any request', async (context) => {
  const originalPost = apiClient.post;
  let posts = 0;
  apiClient.post = (async () => {
    posts += 1;
    throw new Error('must not post');
  }) as typeof apiClient.post;
  context.after(() => {
    apiClient.post = originalPost;
  });

  for (const evidence of [
    {
      ...CURRENT_PAID_TERMS_ACKNOWLEDGEMENT,
      paid_terms_accepted: false,
    },
    {
      ...CURRENT_PAID_TERMS_ACKNOWLEDGEMENT,
      immediate_performance_requested: false,
    },
    {
      ...CURRENT_PAID_TERMS_ACKNOWLEDGEMENT,
      withdrawal_right_acknowledged: false,
    },
    {
      ...CURRENT_PAID_TERMS_ACKNOWLEDGEMENT,
      paid_terms_version: '2026-07-01.v1',
    },
  ]) {
    await assert.rejects(
      createCheckoutSession(
        'starter',
        REQUEST_ID,
        evidence as typeof CURRENT_PAID_TERMS_ACKNOWLEDGEMENT,
      ),
      /current paid-service acknowledgements/,
    );
  }
  assert.equal(posts, 0);
});

test('fetchPaymentOrder verifies order ownership response and final states', async (context) => {
  const originalGet = apiClient.get;
  apiClient.get = (async () => ({
    data: {
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
    },
  })) as typeof apiClient.get;
  context.after(() => {
    apiClient.get = originalGet;
  });

  const order = await fetchPaymentOrder(ORDER_ID);
  assert.equal(order.credited, true);
  assert.equal(isFinalPaymentOrder(order), true);

  const processing: PaymentOrderResponse = {
    ...order,
    credited: false,
    status: 'processing',
  };
  assert.equal(isFinalPaymentOrder(processing), false);
  assert.equal(
    isFinalPaymentOrder({ ...processing, status: 'failed' }),
    true,
  );
});

test('cancelCheckoutSession posts an empty body and parses the terminal order', async (context) => {
  const originalPost = apiClient.post;
  let request:
    | { url: string; body: unknown; config?: AxiosRequestConfig }
    | undefined;
  apiClient.post = (async (
    url: string,
    body: unknown,
    config?: AxiosRequestConfig,
  ) => {
    request = { url, body, config };
    return {
      data: {
        order_id: ORDER_ID,
        request_id: REQUEST_ID,
        pack_id: 'monthly_pass',
        credits: '1250.00',
        amount_minor: 2399,
        currency: 'eur',
        kind: 'calendar_month_pass',
        valid_until: '2026-07-31T21:59:59.999999Z',
        payment_flow: 'checkout',
        status: 'expired',
        credited: false,
        created_at: '2026-07-26T12:00:00Z',
        updated_at: '2026-07-26T12:00:02Z',
      },
    };
  }) as typeof apiClient.post;
  context.after(() => {
    apiClient.post = originalPost;
  });

  const order = await cancelCheckoutSession(ORDER_ID);
  assert.deepEqual(request, {
    url: `/api/v1/billing/checkout-sessions/${ORDER_ID}/cancel`,
    body: {},
    config: { signal: undefined },
  });
  assert.equal(order.status, 'expired');
  assert.equal(order.kind, 'calendar_month_pass');
});
