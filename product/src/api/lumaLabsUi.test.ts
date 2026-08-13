import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ControlCenter } from '../components/ControlCenter';
import { LumaLabs } from '../components/LumaLabs';

test('LUMA Labs exposes only the English MVP submission form', () => {
  const markup = renderToStaticMarkup(createElement(LumaLabs));

  for (const expected of [
    'LUMA Labs',
    'Category',
    'Select a category',
    'Feature Request',
    'Bug Report',
    'UI/UX Improvement',
    'Engine Logic',
    'Other',
    'Title',
    'Description',
    'Submit Feedback',
  ]) {
    assert.match(markup, new RegExp(expected.replace('/', '\\/')));
  }

  assert.equal((markup.match(/required=""/g) ?? []).length, 3);
  for (const forbidden of [
    'My Submissions',
    'Ticket Status',
    'Comments',
    'Notifications',
    'Messenger',
    'Mock Ticket',
  ]) {
    assert.doesNotMatch(markup, new RegExp(forbidden));
  }
});

test('Control Center renders LUMA Labs after Credit Ledger', () => {
  const markup = renderToStaticMarkup(createElement(ControlCenter, {
    credits: 0,
    initialTab: 'labs',
  }));

  const profileIndex = markup.indexOf('Profile &amp; Security');
  const ledgerIndex = markup.indexOf('Credit Ledger');
  const labsIndex = markup.indexOf('LUMA Labs');

  assert.ok(profileIndex >= 0);
  assert.ok(ledgerIndex > profileIndex);
  assert.ok(labsIndex > ledgerIndex);
  assert.match(markup, /Submit Feedback/);
});
