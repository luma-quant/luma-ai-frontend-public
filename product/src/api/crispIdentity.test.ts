import assert from 'node:assert/strict';
import test from 'node:test';

import apiClient from './apiClient';
import {
  CRISP_IDENTITY_TIMEOUT_MS,
  fetchCrispIdentity,
  fetchCrispIdentityWithin,
  parseCrispIdentity,
} from './crispIdentity';

test('Crisp identity parsing accepts only the backend identity contract', () => {
  assert.deepEqual(
    parseCrispIdentity({
      email: ' member@example.com ',
      nickname: ' LUMA Member ',
      signature: 'a'.repeat(64),
      identity_verified: true,
    }),
    {
      email: 'member@example.com',
      nickname: 'LUMA Member',
      signature: 'a'.repeat(64),
      identityVerified: true,
    },
  );

  for (const invalid of [
    null,
    {},
    { email: 'member@example.com', nickname: null, signature: null },
    { email: null, nickname: null, signature: 'signed', identity_verified: true },
    { email: 'member@example.com', nickname: null, signature: 'signed', identity_verified: false },
    { email: 'member@example.com', nickname: null, signature: null, identity_verified: true },
    { email: 'member@example.com', nickname: null, signature: 'A'.repeat(64), identity_verified: true },
    { email: 'member@example.com', nickname: null, signature: 'a'.repeat(63), identity_verified: true },
    { email: '', nickname: null, signature: null, identity_verified: false },
  ]) {
    assert.throws(() => parseCrispIdentity(invalid), /Support identity backend returned/);
  }
});

test('Crisp identity requests use a short timeout', async (context) => {
  const originalGet = apiClient.get;
  context.after(() => {
    apiClient.get = originalGet;
  });

  let receivedUrl: string | undefined;
  let receivedTimeout: number | undefined;
  apiClient.get = (async (
    url: string,
    config?: { timeout?: number },
  ) => {
    receivedUrl = url;
    receivedTimeout = config?.timeout;
    return {
      data: {
        email: null,
        nickname: null,
        signature: null,
        identity_verified: false,
      },
    };
  }) as typeof apiClient.get;

  await fetchCrispIdentity();

  assert.equal(receivedUrl, '/api/v1/support/crisp-identity');
  assert.equal(receivedTimeout, CRISP_IDENTITY_TIMEOUT_MS);
});

test('Crisp identity deadline also bounds a stalled auth interceptor', async (context) => {
  const originalGet = apiClient.get;
  context.after(() => {
    apiClient.get = originalGet;
  });

  apiClient.get = (() => new Promise(() => {
    // Simulates an auth interceptor waiting indefinitely for token refresh.
  })) as typeof apiClient.get;

  await assert.rejects(
    fetchCrispIdentityWithin(5),
    /Support identity request timed out/,
  );
});
