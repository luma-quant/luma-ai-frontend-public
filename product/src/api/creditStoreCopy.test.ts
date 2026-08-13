import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../components/CreditStore.tsx', import.meta.url),
  'utf8',
);

test('credit store explains Stripe Link without hiding dynamic methods', () => {
  assert.match(source, /Stripe may show Link first/);
  assert.match(source, /Pay without Link/);
  assert.match(source, /other payment methods available/);
});

test('credit store candidate remains on the AI credit-payment boundary', () => {
  assert.match(source, /Purchase credits for LUMA analyses/);
  assert.doesNotMatch(source, /welcome bonus/i);
});
