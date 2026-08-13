import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accessTokenNeedsRefresh,
  decodeAccessToken,
  InvalidAccessTokenError,
} from './jwt';

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function unsignedJwt(payload: Record<string, unknown>): string {
  return `${encodePart({ alg: 'HS256', typ: 'JWT' })}.${encodePart(payload)}.signature`;
}

test('decodeAccessToken accepts the exact backend access-token claims', () => {
  const claims = decodeAccessToken(
    unsignedJwt({
      sub: 'user-123',
      iss: 'luma',
      aud: 'luma-web',
      iat: 1_000,
      exp: 2_000,
      typ: 'access',
    }),
    1_500,
  );

  assert.equal(claims.sub, 'user-123');
  assert.equal(claims.typ, 'access');
  assert.equal(claims.exp, 2_000);
  assert.equal('luma_pro' in claims, false);
});

test('decodeAccessToken rejects expired and non-access tokens', () => {
  assert.throws(
    () => decodeAccessToken(
      unsignedJwt({ sub: 'user-123', exp: 1_000, typ: 'access' }),
      1_000,
    ),
    InvalidAccessTokenError,
  );

  assert.throws(
    () => decodeAccessToken(
      unsignedJwt({ sub: 'user-123', exp: 2_000, typ: 'preauth' }),
      1_000,
    ),
    InvalidAccessTokenError,
  );
});

test('access tokens refresh before expiry instead of emitting a recoverable 401', () => {
  const token = unsignedJwt({
    sub: 'user-123',
    exp: 2_000,
    typ: 'access',
  });

  assert.equal(accessTokenNeedsRefresh(token, 45, 1_954), false);
  assert.equal(accessTokenNeedsRefresh(token, 45, 1_955), true);
  assert.equal(accessTokenNeedsRefresh('not-a-jwt', 45, 1_000), true);
});
