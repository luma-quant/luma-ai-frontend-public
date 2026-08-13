import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import apiClient from './apiClient';
import {
  acceptPlatformLegalBundle,
  fetchPlatformLegalStatus,
} from './legal';
import { LegalAcceptanceGate } from '../components/LegalAcceptanceGate';
import {
  LEGAL_DOCUMENT_SHA256,
  LEGAL_POLICY_VERSION,
} from '../legal/legalPolicies';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

const TERMS_HASH = LEGAL_DOCUMENT_SHA256.terms;
const PRIVACY_HASH = LEGAL_DOCUMENT_SHA256.privacy;

function legalStatus(overrides: Record<string, unknown> = {}) {
  return {
    terms_version: LEGAL_POLICY_VERSION,
    terms_document_sha256: TERMS_HASH,
    privacy_version: LEGAL_POLICY_VERSION,
    privacy_document_sha256: PRIVACY_HASH,
    acceptance_required: true,
    accepted_at: null,
    ...overrides,
  };
}

test('platform gate starts fail-closed with two separate unchecked acknowledgements', () => {
  const markup = renderToStaticMarkup(createElement(LegalAcceptanceGate, {
    onAccepted: () => undefined,
    onLogout: () => undefined,
  }));

  assert.equal((markup.match(/type="checkbox"/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /type="checkbox"[^>]*checked/);
  assert.match(markup, /I have read and agree to the/);
  assert.match(markup, /I have read and acknowledge the/);
  assert.match(markup, /This acknowledgement is not consent/);
  assert.match(markup, /href="\/legal\/terms"[^>]*target="_blank"/);
  assert.match(markup, /href="\/legal\/privacy"[^>]*target="_blank"/);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>Enter LUMA Quant<\/button>/);
});

test('legal status parsing rejects missing, stale, and inconsistent evidence', async (context) => {
  const originalGet = apiClient.get;
  context.after(() => {
    apiClient.get = originalGet;
  });

  for (const [response, message] of [
    [{}, /invalid data/],
    [legalStatus({ terms_version: '2026-07-01.v1' }), /newer legal-policy version/],
    [legalStatus({ terms_document_sha256: 'not-a-hash' }), /invalid data/],
    [legalStatus({ accepted_at: '2026-08-01T08:00:00Z' }), /inconsistent/],
    [legalStatus({ acceptance_required: false }), /incomplete/],
  ] as const) {
    apiClient.get = (async () => ({ data: response })) as typeof apiClient.get;
    await assert.rejects(fetchPlatformLegalStatus(), message);
  }
});

test('platform acceptance posts only the current affirmative evidence', async (context) => {
  const originalPost = apiClient.post;
  let request: { url: string; body: unknown } | undefined;
  apiClient.post = (async (url: string, body: unknown) => {
    request = { url, body };
    return {
      data: legalStatus({
        acceptance_required: false,
        accepted_at: '2026-08-01T08:00:00Z',
      }),
    };
  }) as typeof apiClient.post;
  context.after(() => {
    apiClient.post = originalPost;
  });

  const status = await acceptPlatformLegalBundle();

  assert.deepEqual(request, {
    url: '/api/v1/legal/accept-platform',
    body: {
      terms_version: LEGAL_POLICY_VERSION,
      privacy_version: LEGAL_POLICY_VERSION,
      terms_agreed: true,
      privacy_acknowledged: true,
    },
  });
  assert.equal(status.acceptance_required, false);
});

test('platform acceptance fails closed when the server does not confirm persistence', async (context) => {
  const originalPost = apiClient.post;
  apiClient.post = (async () => ({ data: legalStatus() })) as typeof apiClient.post;
  context.after(() => {
    apiClient.post = originalPost;
  });

  await assert.rejects(
    acceptPlatformLegalBundle(),
    /acknowledgement was not saved/,
  );
});

test('App unlocks workspace and external services only after verified acceptance', () => {
  assert.match(
    appSource,
    /workspaceUnlocked = isLogged && legalAccessState === 'accepted'/,
  );
  assert.match(appSource, /if \(!workspaceUnlocked\) \{[\s\S]*?return undefined;/);
  assert.match(
    appSource,
    /return initializeSupportChat\([\s\S]*?\}, \[workspaceUnlocked\]\);/,
  );
  assert.ok(appSource.indexOf("legalAccessState === 'required'") >= 0);
  assert.ok(
    appSource.indexOf("legalAccessState === 'error'")
      < appSource.indexOf('key="dashboard"'),
  );
  assert.match(appSource, /Workspace functions remain locked until verification succeeds/);
});
