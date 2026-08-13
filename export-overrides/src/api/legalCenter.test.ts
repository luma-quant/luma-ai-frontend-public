import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LegalCenter } from '../components/LegalCenter';
import { LegalFooterLinks } from '../components/LegalFooterLinks';
import {
  LEGAL_DOCUMENT_SHA256,
  LEGAL_DOCUMENTS,
  LEGAL_OPERATOR,
  LEGAL_OPERATOR_DISCLOSURE_NOTICE,
  LEGAL_POLICY_VERSION,
  buildLegalDocumentDownloadText,
  serializeCanonicalLegalDocument,
} from '../legal/legalPolicies';

test('Legal Center exposes every public English policy and review-safe contact path', () => {
  const markup = renderToStaticMarkup(createElement(LegalCenter));
  for (const policy of LEGAL_DOCUMENTS) {
    assert.ok(markup.includes(policy.shortTitle.replaceAll('&', '&amp;')));
    assert.match(markup, new RegExp(`href="${policy.path}"`));
  }
  assert.match(markup, /Legal &amp; Privacy/);
  assert.match(markup, new RegExp(LEGAL_POLICY_VERSION.replaceAll('.', '\\.')));
  assert.match(markup, /info@lumaquant\.tech/);
  assert.match(markup, /support@lumaquant\.tech/);
  assert.match(markup, /COMPLETED_OWNER_CONFIRMED/);
  assert.match(markup, /LEGAL_REVIEW_NOT_YET_COMPLETED/);
  assert.ok(markup.includes(LEGAL_OPERATOR_DISCLOSURE_NOTICE));
});

test('Legal Notice records owner-confirmed identity without an independent claim', () => {
  const markup = renderToStaticMarkup(createElement(LegalCenter, { documentId: 'imprint' }));
  assert.match(markup, /Luma Quant e\.U\./);
  assert.match(markup, /Johann Weitzer/);
  assert.match(markup, /LEGAL_REVIEW_NOT_YET_COMPLETED/);
  assert.doesNotMatch(markup, /independently checked/i);
  assert.doesNotMatch(markup, /ATU83243624|39671448|9110039288025/);
  assert.equal(LEGAL_OPERATOR.name, 'Luma Quant e.U.');
  assert.equal(LEGAL_OPERATOR.jurisdiction, 'Austria');
});

test('every policy renders versioned semantic sections without a login gate', () => {
  for (const policy of LEGAL_DOCUMENTS) {
    const markup = renderToStaticMarkup(createElement(LegalCenter, { documentId: policy.id }));
    assert.ok(markup.includes(policy.title.replaceAll('&', '&amp;')));
    assert.match(markup, /Effective/);
    assert.match(markup, /Last updated/);
    assert.match(markup, /Back to LUMA/);
    assert.match(markup, /Print \/ save as PDF/);
    assert.match(markup, /Download UTF-8 text/);
    assert.match(markup, new RegExp(LEGAL_DOCUMENT_SHA256[policy.id]));
    assert.equal((markup.match(/<h2/g) ?? []).length, policy.sections.length);
    if (policy.id === 'acceptable-use') {
      assert.match(markup, /security@lumaquant\.tech/);
      assert.match(markup, /mailbox status is owner-confirmed/i);
      assert.match(markup, /no response-time SLA is claimed/i);
    }
  }
});

test('sanitized canonical policy serialization is deterministic', () => {
  for (const policy of LEGAL_DOCUMENTS) {
    const canonicalText = serializeCanonicalLegalDocument(policy.id);
    const digest = createHash('sha256').update(canonicalText, 'utf8').digest('hex');
    assert.equal(digest, LEGAL_DOCUMENT_SHA256[policy.id]);
    assert.ok(canonicalText.endsWith('\n'));
    assert.doesNotMatch(canonicalText, /\r/);
    assert.match(canonicalText, /Luma Quant e\.U\./);
    assert.match(canonicalText, /LEGAL_REVIEW_NOT_YET_COMPLETED/);
    const download = buildLegalDocumentDownloadText(policy.id);
    assert.match(download, new RegExp(`Canonical SHA-256: ${digest}`));
    assert.ok(download.endsWith(canonicalText));
  }
});

test('policies describe the implemented architecture conservatively', () => {
  const text = JSON.stringify(LEGAL_DOCUMENTS);
  for (const expected of [
    'Bearer access and refresh tokens', 'Firebase Hosting', 'Cloud Run',
    'Cloud SQL', 'BigQuery', 'Cloud Storage', 'Stripe', 'Crisp',
    'redacted and aggregated', 'does not renew automatically',
  ]) assert.match(text, new RegExp(expected));
  for (const removed of [
    'Firebase Authentication', 'strictly non-refundable', 'model-training license',
    'hardware fingerprint', 'class action',
  ]) assert.doesNotMatch(text, new RegExp(removed, 'i'));
});

test('shared application footers expose canonical legal links', () => {
  const markup = renderToStaticMarkup(createElement(LegalFooterLinks));
  for (const [path, label] of [
    ['/legal/imprint', 'Legal Notice'], ['/legal/terms', 'Terms'],
    ['/legal/privacy', 'Privacy'], ['/legal/cookies', 'Cookies'],
    ['/legal', 'Legal Center'],
  ]) assert.match(markup, new RegExp(`href="${path}"[^>]*>${label}`));
});
