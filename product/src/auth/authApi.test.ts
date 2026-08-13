import assert from 'node:assert/strict';
import test from 'node:test';
import type { AxiosRequestConfig } from 'axios';
import { createAuthApi } from './authApi';
import { AUTH_ENDPOINTS } from './endpoints';

interface RecordedCall {
  method: 'get' | 'post';
  url: string;
  body?: unknown;
  config?: AxiosRequestConfig;
}

test('authApi uses the exact backend routes, payloads, and pre-auth bearer', async () => {
  const calls: RecordedCall[] = [];
  const client = {
    async post(url: string, body?: unknown, config?: AxiosRequestConfig) {
      calls.push({ method: 'post', url, body, config });
      if (url === AUTH_ENDPOINTS.requestEmailCode) return { data: { ok: true } };
      if (url === AUTH_ENDPOINTS.validateInvite) return { data: { valid: true } };
      if (url === AUTH_ENDPOINTS.verifyAccessCode || url === AUTH_ENDPOINTS.refresh) {
        return {
          data: {
            access_token: 'access.jwt',
            refresh_token: 'refresh.jwt',
          },
        };
      }
      return {
        data: {
          pre_auth_token: 'preauth.jwt',
          token_type: 'bearer',
          expires_in: 600,
          requires_access_code: true,
        },
      };
    },
    async get(url: string) {
      calls.push({ method: 'get', url });
      return {
        data: {
          contract_version: 'luma.advisor.v8.1',
          pricing_version: 'advisor-pricing-v4',
          enabled: true,
          luma_pro: {
            id: 'luma_pro',
            label: 'LUMA Pro',
            description: 'Pro',
            price_multiplier: '2.00',
            available: true,
            unavailable_reason: null,
          },
        },
      };
    },
  };
  const api = createAuthApi(client as never);

  await api.requestEmailCode('person@example.com');
  await api.authenticateEmailOtp('person@example.com', '123456');
  await api.authenticateSso({
    provider: 'google',
    token: 'google-id-token',
  });
  await api.validateInviteCode('LUMA-VALID-CODE');
  await api.verifyAccessCode('preauth.jwt', 'LUMA-VALID-CODE');
  await api.verifyAccessCode('preauth.returning.jwt');
  await api.refresh('refresh.jwt');
  const config = await api.getAdvisorConfig();

  assert.deepEqual(
    calls.map(({ method, url }) => [method, url]),
    [
      ['post', '/auth/email/request-code'],
      ['post', '/api/v1/auth/email-otp'],
      ['post', '/api/v1/auth/sso'],
      ['post', '/api/v1/invites/validate'],
      ['post', '/api/v1/auth/verify-access-code'],
      ['post', '/api/v1/auth/verify-access-code'],
      ['post', '/auth/refresh'],
      ['get', '/api/v1/advisor/config'],
    ],
  );
  assert.deepEqual(calls[0].body, { email: 'person@example.com' });
  assert.deepEqual(calls[1].body, {
    email: 'person@example.com',
    code: '123456',
  });
  assert.deepEqual(calls[2].body, {
    provider: 'google',
    token: 'google-id-token',
  });
  assert.deepEqual(calls[3].body, { code: 'LUMA-VALID-CODE' });
  assert.deepEqual(calls[4].body, { access_code: 'LUMA-VALID-CODE' });
  assert.equal(
    calls[4].config?.headers?.Authorization,
    'Bearer preauth.jwt',
  );
  assert.deepEqual(calls[5].body, {});
  assert.deepEqual(calls[6].body, { refresh_token: 'refresh.jwt' });
  assert.equal(config.luma_pro.available, true);
});
