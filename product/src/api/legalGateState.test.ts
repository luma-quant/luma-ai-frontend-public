import assert from 'node:assert/strict';
import test from 'node:test';

import { canSubmitPlatformLegalAcceptance } from '../components/LegalAcceptanceGate';

test('platform access requires both independent choices and no request in flight', () => {
  assert.equal(canSubmitPlatformLegalAcceptance(false, false, false), false);
  assert.equal(canSubmitPlatformLegalAcceptance(true, false, false), false);
  assert.equal(canSubmitPlatformLegalAcceptance(false, true, false), false);
  assert.equal(canSubmitPlatformLegalAcceptance(true, true, true), false);
  assert.equal(canSubmitPlatformLegalAcceptance(true, true, false), true);
});
