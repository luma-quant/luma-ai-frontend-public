import assert from 'node:assert/strict';
import test from 'node:test';

import {PUBLIC_LEGAL_PATHS, resolvePublicRoute} from './publicRoutes';

test('every canonical Legal Center URL resolves without authentication', () => {
  const expected = new Map([
    ['/legal', null],
    ['/legal/imprint', 'imprint'],
    ['/legal/terms', 'terms'],
    ['/legal/privacy', 'privacy'],
    ['/legal/cookies', 'cookies'],
    ['/legal/paid-services', 'paid-services'],
    ['/legal/acceptable-use', 'acceptable-use'],
    ['/legal/copyright', 'copyright'],
  ]);

  for (const [path, documentId] of expected) {
    assert.deepEqual(resolvePublicRoute(path), {
      kind: 'legal',
      documentId,
      canonicalPath: path,
    });
    assert.equal(resolvePublicRoute(`${path}/`).kind, 'legal');
  }
});

test('legacy public aliases render the matching canonical policy', () => {
  assert.deepEqual(resolvePublicRoute('/imprint'), {
    kind: 'legal', documentId: 'imprint', canonicalPath: '/legal/imprint',
  });
  assert.deepEqual(resolvePublicRoute('/terms'), {
    kind: 'legal', documentId: 'terms', canonicalPath: '/legal/terms',
  });
  assert.deepEqual(resolvePublicRoute('/privacy?source=footer'), {
    kind: 'legal', documentId: 'privacy', canonicalPath: '/legal/privacy',
  });
  assert.deepEqual(resolvePublicRoute('/cookie-policy/#storage'), {
    kind: 'legal', documentId: 'cookies', canonicalPath: '/legal/cookies',
  });
});

test('non-AI product paths remain outside the candidate routing contract', () => {
  for (const path of [
    '/', '/advisor', '/artifacts', '/auth/handoff',
    '/auth/wallet-registration', '/legal/unknown',
  ]) {
    assert.deepEqual(resolvePublicRoute(path), {kind: 'application'});
  }
  assert.equal(PUBLIC_LEGAL_PATHS.length, 12);
});
