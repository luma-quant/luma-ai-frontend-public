import assert from 'node:assert/strict';
import test from 'node:test';
import {
  finishPreAuthentication,
  InviteCodeError,
} from './authFlow';
import type { PreAuthResponse } from './types';

const returningUser: PreAuthResponse = {
  pre_auth_token: 'returning.preauth',
  token_type: 'bearer',
  expires_in: 600,
  requires_access_code: false,
};

const newUser: PreAuthResponse = {
  ...returningUser,
  pre_auth_token: 'new.preauth',
  requires_access_code: true,
};

const tokens = {
  access_token: 'access.jwt',
  refresh_token: 'refresh.jwt',
};

test('returning users are promoted with an empty body and no invite lookup', async () => {
  const calls: string[] = [];
  const result = await finishPreAuthentication(returningUser, undefined, {
    async validateInviteCode() {
      calls.push('validate');
      return true;
    },
    async verifyAccessCode(preAuthToken, accessCode) {
      calls.push(`verify:${preAuthToken}:${accessCode ?? 'empty'}`);
      return tokens;
    },
  });

  assert.deepEqual(result, tokens);
  assert.deepEqual(calls, ['verify:returning.preauth:empty']);
});

test('new users are prevalidated before the single-use pre-auth token is spent', async () => {
  const calls: string[] = [];
  await finishPreAuthentication(newUser, '  LUMA-VALID-CODE  ', {
    async validateInviteCode(code) {
      calls.push(`validate:${code}`);
      return true;
    },
    async verifyAccessCode(preAuthToken, accessCode) {
      calls.push(`verify:${preAuthToken}:${accessCode}`);
      return tokens;
    },
  });

  assert.deepEqual(calls, [
    'validate:LUMA-VALID-CODE',
    'verify:new.preauth:LUMA-VALID-CODE',
  ]);
});

test('an invalid invite never calls the consuming promotion endpoint', async () => {
  let promotionCalled = false;

  await assert.rejects(
    finishPreAuthentication(newUser, 'INVALID-CODE', {
      async validateInviteCode() {
        return false;
      },
      async verifyAccessCode() {
        promotionCalled = true;
        return tokens;
      },
    }),
    InviteCodeError,
  );
  assert.equal(promotionCalled, false);
});
