import assert from 'node:assert/strict';
import test from 'node:test';
import type { AxiosRequestConfig } from 'axios';

import apiClient from './apiClient';
import {
  isWelcomePromoCodeFormat,
  normalizeWelcomePromoCode,
  redeemWelcomePromo,
} from './welcomePromo';

const CODE = 'LUMA-CWH9-GVD5-WW5W-SGZL5';

test('normalizes and validates the exact public welcome-code format', () => {
  assert.equal(normalizeWelcomePromoCode(`  ${CODE.toLowerCase()}  `), CODE);
  assert.equal(isWelcomePromoCodeFormat(CODE), true);
  assert.equal(isWelcomePromoCodeFormat('LUMA-CWH9-GVD5-WW5W-SGZL'), false);
  assert.equal(isWelcomePromoCodeFormat('LUMA CWH9 GVD5 WW5W SGZL5'), false);
});

test('redeem sends only the canonical code to the authenticated endpoint', async (context) => {
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
        ok: true,
        status: 'credited',
        credits_added: '1250.00',
        balance: '1450.00',
      },
    };
  }) as typeof apiClient.post;
  context.after(() => {
    apiClient.post = originalPost;
  });

  const result = await redeemWelcomePromo(` ${CODE.toLowerCase()} `);

  assert.deepEqual(request, {
    url: '/api/v1/credits/redeem',
    body: { code: CODE },
    config: { signal: undefined },
  });
  assert.equal(result.status, 'credited');
});

test('redeem fails closed before the request for malformed input and responses', async (context) => {
  const originalPost = apiClient.post;
  let calls = 0;
  apiClient.post = (async () => {
    calls += 1;
    return { data: { ok: true, status: 'credited', balance: '1250' } };
  }) as typeof apiClient.post;
  context.after(() => {
    apiClient.post = originalPost;
  });

  await assert.rejects(redeemWelcomePromo('wrong'), /valid LUMA invite code/);
  assert.equal(calls, 0);
  await assert.rejects(redeemWelcomePromo(CODE), /invalid welcome-bonus response/);
  assert.equal(calls, 1);
});
