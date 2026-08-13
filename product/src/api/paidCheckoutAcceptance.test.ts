import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PaidCheckoutConfirmation } from '../components/CreditStore';
import {
  CURRENT_PAID_TERMS_VERSION,
  createPaidTermsCheckoutAcknowledgement,
  type PaymentCreditPack,
} from './payments';

const STARTER_PACK: PaymentCreditPack = {
  pack_id: 'starter',
  label: 'Starter',
  credits: '200.00',
  amount_minor: 399,
  currency: 'eur',
  kind: 'credit_pack',
  can_purchase: true,
  unavailable_reason: null,
  next_purchase_at: null,
  valid_until: null,
  active_remaining_credits: null,
  purchase_state: 'available',
  timezone: null,
};

function renderConfirmation(
  paidTermsAccepted: boolean,
  immediatePerformanceAccepted: boolean,
): string {
  return renderToStaticMarkup(createElement(PaidCheckoutConfirmation, {
    pack: STARTER_PACK,
    paidTermsAccepted,
    immediatePerformanceAccepted,
    onPaidTermsAcceptedChange: () => undefined,
    onImmediatePerformanceAcceptedChange: () => undefined,
    onCancel: () => undefined,
    onConfirm: () => undefined,
  }));
}

function continueButton(markup: string): string {
  const match = markup.match(/<button[^>]*>Continue to Stripe<\/button>/);
  assert.ok(match, 'Continue to Stripe button is rendered');
  return match[0];
}

test('paid checkout starts with two separate unchecked acknowledgements', () => {
  const markup = renderConfirmation(false, false);

  assert.equal((markup.match(/type="checkbox"/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /type="checkbox"[^>]*checked/);
  assert.match(markup, /Agree to Paid Services and Credits Terms/);
  assert.match(markup, /Request immediate performance and acknowledge withdrawal effects/);
  assert.match(markup, /href="\/legal\/paid-services"[^>]*target="_blank"/);
  assert.match(markup, /I expressly request immediate delivery and performance/);
  assert.match(markup, /Your statutory consumer rights remain unaffected/);
  assert.match(continueButton(markup), /disabled=""/);
});

test('neither paid acknowledgement enables checkout on its own', () => {
  assert.match(continueButton(renderConfirmation(true, false)), /disabled=""/);
  assert.match(continueButton(renderConfirmation(false, true)), /disabled=""/);
  assert.doesNotMatch(
    continueButton(renderConfirmation(true, true)),
    /disabled=""/,
  );
});

test('checkout evidence cannot be constructed until both choices are affirmative', () => {
  assert.throws(
    () => createPaidTermsCheckoutAcknowledgement(false, false),
    /Both paid-service acknowledgements are required/,
  );
  assert.throws(
    () => createPaidTermsCheckoutAcknowledgement(true, false),
    /Both paid-service acknowledgements are required/,
  );
  assert.throws(
    () => createPaidTermsCheckoutAcknowledgement(false, true),
    /Both paid-service acknowledgements are required/,
  );
  assert.deepEqual(createPaidTermsCheckoutAcknowledgement(true, true), {
    paid_terms_version: CURRENT_PAID_TERMS_VERSION,
    paid_terms_accepted: true,
    immediate_performance_requested: true,
    withdrawal_right_acknowledged: true,
  });
});

test('credit packs state no expiration while the Monthly Pass remains month-bound', () => {
  assert.match(
    renderConfirmation(false, false),
    /Purchased credit-pack credits have no platform expiration date/,
  );
  const monthlyMarkup = renderToStaticMarkup(createElement(
    PaidCheckoutConfirmation,
    {
      pack: {
        ...STARTER_PACK,
        pack_id: 'monthly_pass',
        label: 'Monthly Pass',
        credits: '1250.00',
        amount_minor: 2399,
        kind: 'calendar_month_pass',
      },
      paidTermsAccepted: false,
      immediatePerformanceAccepted: false,
      onPaidTermsAcceptedChange: () => undefined,
      onImmediatePerformanceAcceptedChange: () => undefined,
      onCancel: () => undefined,
      onConfirm: () => undefined,
    },
  ));
  assert.match(monthlyMarkup, /does not auto-renew/);
  assert.match(monthlyMarkup, /once per calendar month/);
  assert.match(monthlyMarkup, /expire at the end of that month/);
});
