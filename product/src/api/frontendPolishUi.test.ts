import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const creditStore = readFileSync(
  new URL('../components/CreditStore.tsx', import.meta.url),
  'utf8',
);
const analyticsLedger = readFileSync(
  new URL('../components/AnalyticsLedger.tsx', import.meta.url),
  'utf8',
);
const gatekeeper = readFileSync(
  new URL('../components/Gatekeeper.tsx', import.meta.url),
  'utf8',
);
const legalFooter = readFileSync(
  new URL('../components/LegalFooterLinks.tsx', import.meta.url),
  'utf8',
);
const sideNavbar = readFileSync(
  new URL('../components/SideNavbar.tsx', import.meta.url),
  'utf8',
);
const advisor = readFileSync(
  new URL('../components/LumaAdvisor.tsx', import.meta.url),
  'utf8',
);
const advisorErrors = readFileSync(
  new URL('./advisorErrors.ts', import.meta.url),
  'utf8',
);

test('credit store uses readable differentiated pack presentation', () => {
  assert.match(creditStore, /return 'B\.I\.G'/);
  assert.match(creditStore, /return 'Monthly Pass'/);
  assert.match(creditStore, /function packChipClass/);
  assert.match(creditStore, /function packCardClass/);
  assert.doesNotMatch(creditStore, /function packButtonClass/);
  assert.match(creditStore, /function CreditStoreActionButton/);
  assert.equal(
    (creditStore.match(/<CreditStoreActionButton/g) ?? []).length,
    3,
  );
  assert.match(creditStore, /text-sm font-medium text-white/);

  const monthlyPassCard = creditStore.slice(
    creditStore.indexOf('{monthlyPasses.map'),
    creditStore.indexOf('        ) : null}'),
  );
  assert.doesNotMatch(monthlyPassCard, />\s*Monthly pass\s*</i);
});

test('payment legal-evidence failures are translated for customers', () => {
  assert.match(creditStore, /payment_order_legal_evidence_missing/);
  assert.match(
    creditStore,
    /No payment was initiated\. Please start checkout again/,
  );
  assert.match(creditStore, /\^\[a-z0-9_\]\+\$/);
  assert.match(analyticsLedger, /Analytics are temporarily unavailable/);
  assert.match(analyticsLedger, /This draw evaluation is not complete yet/);
});

test('workspace polish keeps release news readable and actions restrained', () => {
  assert.match(app, /Release date/);
  assert.match(app, /\{entry\.title\}/);
  assert.match(app, /\{entry\.body\}/);
  assert.match(app, /entry\.release_date/);
  assert.match(app, /fetchRecentIntelligence/);
  assert.doesNotMatch(app, /2027 Intelligence Preview/);
  assert.doesNotMatch(app, /New LUMA intelligence releases are planned/);
  assert.doesNotMatch(app, /intelligenceTitle\(entry\.message\)/);
  assert.match(app, /alt="LUMA release"/);

  const quickActions = app.slice(
    app.indexOf('{/* D. QUICK ACTIONS */}'),
    app.indexOf('{activeTab === \'advisor\''),
  );
  assert.match(quickActions, /bg-\[#09111f\]/);
  assert.doesNotMatch(quickActions, /btn-cyber-gradient/);
});

test('authentication and footer interactions are explicit', () => {
  assert.match(legalFooter, /target="_blank"/);
  assert.match(legalFooter, /rel="noopener noreferrer"/);
  assert.match(sideNavbar, /Sign out of LUMA Quant\?/);
  assert.match(sideNavbar, /Stay signed in/);
  assert.match(sideNavbar, /setLogoutConfirmationOpen\(true\)/);
  assert.match(sideNavbar, /supportUnread/);
  assert.match(sideNavbar, />\s*New\s*</);
  assert.match(app, /confirmSessionLogout/);
  assert.match(app, /completeSessionLogout/);
  assert.match(app, /window\.confirm\('Sign out of LUMA Quant\?'\)/);
  assert.match(app, /onLogout=\{confirmSessionLogout\}/);
  assert.match(app, /onLogout=\{completeSessionLogout\}/);
  assert.match(app, /onClick=\{confirmSessionLogout\}/);
  assert.match(gatekeeper, /bg-slate-800\/70/);
  assert.match(
    gatekeeper,
    /providerStatus\.apple\.unavailableMessage/,
  );
});

test('empty CSV files receive a corrective validation message', () => {
  const expected = /This CSV is empty\. Add a header row and at least one data row/;
  assert.match(advisor, /file\.size === 0/);
  assert.match(advisor, expected);
  assert.match(advisorErrors, /user_csv_empty/);
  assert.match(advisorErrors, expected);
  assert.match(advisorErrors, /user_csv_no_accepted_rows/);
});
