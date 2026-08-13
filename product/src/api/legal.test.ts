import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePlatformLegalStatus } from './legal';
import {
  LEGAL_DOCUMENT_SHA256,
  LEGAL_POLICY_VERSION,
} from '../legal/legalPolicies';

const validRequiredStatus = {
  terms_version: LEGAL_POLICY_VERSION,
  terms_document_sha256: LEGAL_DOCUMENT_SHA256.terms,
  privacy_version: LEGAL_POLICY_VERSION,
  privacy_document_sha256: LEGAL_DOCUMENT_SHA256.privacy,
  acceptance_required: true,
  accepted_at: null,
};

test('platform legal status accepts only the exact frontend policy bundle', () => {
  assert.deepEqual(
    parsePlatformLegalStatus(validRequiredStatus),
    validRequiredStatus,
  );

  assert.throws(
    () => parsePlatformLegalStatus({
      ...validRequiredStatus,
      terms_document_sha256: 'f'.repeat(64),
    }),
    /does not match the server acknowledgement bundle/,
  );
  assert.throws(
    () => parsePlatformLegalStatus({
      ...validRequiredStatus,
      privacy_document_sha256: '0'.repeat(64),
    }),
    /does not match the server acknowledgement bundle/,
  );
});

test('platform legal status validates version and acceptance consistency', () => {
  assert.throws(
    () => parsePlatformLegalStatus({
      ...validRequiredStatus,
      terms_version: '2026-08-01.v4',
    }),
    /newer legal-policy version/,
  );
  assert.throws(
    () => parsePlatformLegalStatus({
      ...validRequiredStatus,
      accepted_at: '2026-08-01T12:00:00Z',
    }),
    /state is inconsistent/,
  );
  assert.throws(
    () => parsePlatformLegalStatus({
      ...validRequiredStatus,
      acceptance_required: false,
    }),
    /state is incomplete/,
  );

  const accepted = {
    ...validRequiredStatus,
    acceptance_required: false,
    accepted_at: '2026-08-01T12:00:00Z',
  };
  assert.deepEqual(parsePlatformLegalStatus(accepted), accepted);
});
