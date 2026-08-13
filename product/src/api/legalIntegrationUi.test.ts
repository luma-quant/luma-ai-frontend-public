import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ControlCenter } from '../components/ControlCenter';

const mainSource = readFileSync(
  new URL('../main.tsx', import.meta.url),
  'utf8',
);
const appSource = readFileSync(
  new URL('../App.tsx', import.meta.url),
  'utf8',
);
const gatekeeperSource = readFileSync(
  new URL('../components/Gatekeeper.tsx', import.meta.url),
  'utf8',
);

test('public legal paths never start authenticated payment reconciliation', () => {
  assert.doesNotMatch(mainSource, /installPaymentReconciliation/);
  assert.match(mainSource, /<LegalCenter documentId=\{publicRoute\.documentId\}/);
  assert.match(appSource, /if \(!workspaceUnlocked\)[\s\S]*?installPaymentReconciliation\(\)/);
});

test('a server-side policy precondition rechecks and relocks the workspace', () => {
  assert.match(appSource, /LEGAL_ACCEPTANCE_REQUIRED_EVENT/);
  assert.match(appSource, /setLegalAccessState\('loading'\)/);
  assert.match(appSource, /setLegalStatusReload\(\(value\) => value \+ 1\)/);
});

test('both authenticated and pre-authentication footers include legal links', () => {
  assert.match(appSource, /<LegalFooterLinks \/>/);
  assert.doesNotMatch(
    appSource.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '',
    /pointer-events-none/,
  );
  assert.match(gatekeeperSource, /<LegalFooterLinks/);
});

test('the locked legal gate never presents the workspace as an engine outage', () => {
  const footer = appSource.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';

  assert.match(footer, /Legal acknowledgement required/);
  assert.match(footer, /!workspaceUnlocked/);
  assert.ok(
    footer.indexOf('Legal acknowledgement required')
      < footer.indexOf('engineStatusLabel'),
  );
});

test('Control Center contains a usable Legal & Privacy overview tab', () => {
  const markup = renderToStaticMarkup(createElement(ControlCenter, {
    credits: 0,
    initialTab: 'legal',
  }));

  assert.match(markup, /Legal &amp; Privacy/);
  assert.match(markup, /Terms of Service/);
  assert.match(markup, /Privacy Policy/);
  assert.match(markup, /Cookie &amp; Storage Policy/);
  assert.match(markup, /Paid Services &amp; Credits/);
  assert.match(markup, /Acceptable Use/);
  assert.match(markup, /Copyright/);
});
