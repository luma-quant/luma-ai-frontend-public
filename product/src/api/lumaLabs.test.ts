import assert from 'node:assert/strict';
import test from 'node:test';

import apiClient from './apiClient';
import {
  submitLumaLabsFeedback,
  validateLumaLabsSubmission,
} from './lumaLabs';

const RESPONSE = {
  id: '9d79bc3c-a859-4bd0-9415-d9040b02d514',
  status: 'new',
  created_at: '2026-07-27T14:30:00Z',
} as const;

test('LUMA Labs sends only the three allowed fields to the real route', async (context) => {
  const originalPost = apiClient.post;
  let request: { url: string; body: unknown } | undefined;
  apiClient.post = (async (url: string, body: unknown) => {
    request = { url, body };
    return { data: RESPONSE };
  }) as typeof apiClient.post;
  context.after(() => {
    apiClient.post = originalPost;
  });

  const result = await submitLumaLabsFeedback({
    category: 'feature',
    title: '  Compare forecasts  ',
    details: '  Compare two completed forecasts side by side.  ',
  });

  assert.deepEqual(request, {
    url: '/api/v1/feedback',
    body: {
      category: 'feature',
      title: 'Compare forecasts',
      details: 'Compare two completed forecasts side by side.',
    },
  });
  assert.deepEqual(result, RESPONSE);
});

test('LUMA Labs validation rejects invalid drafts without a request', async (context) => {
  const originalPost = apiClient.post;
  let requestCount = 0;
  apiClient.post = (async () => {
    requestCount += 1;
    return { data: RESPONSE };
  }) as typeof apiClient.post;
  context.after(() => {
    apiClient.post = originalPost;
  });

  assert.deepEqual(
    validateLumaLabsSubmission({
      category: '',
      title: 'x',
      details: 'short',
    }),
    {
      category: 'Choose a category.',
      title: 'Title must be 3–160 characters on one line.',
      details: 'Description must be 10–5,000 characters.',
    },
  );

  await assert.rejects(
    submitLumaLabsFeedback({
      category: 'admin',
      title: 'Valid title',
      details: 'This description is long enough.',
    }),
    /highlighted fields/,
  );
  await assert.rejects(
    submitLumaLabsFeedback({
      category: 'feature',
      title: 'Line one\nLine two',
      details: 'This description is long enough.',
    }),
    /highlighted fields/,
  );
  await assert.rejects(
    submitLumaLabsFeedback({
      category: 'feature',
      title: 'Line one\u2028Line two',
      details: 'This description is long enough.',
    }),
    /highlighted fields/,
  );
  await assert.rejects(
    submitLumaLabsFeedback({
      category: 'feature',
      title: 'Valid title',
      details: 'This contains a hidden\u0000control.',
    }),
    /highlighted fields/,
  );
  await assert.rejects(
    submitLumaLabsFeedback({
      category: 'feature',
      title: 'x'.repeat(161),
      details: 'x'.repeat(5001),
    }),
    /highlighted fields/,
  );
  assert.equal(requestCount, 0);
});

test('LUMA Labs fails closed on malformed backend success data', async (context) => {
  const originalPost = apiClient.post;
  const malformedResponses = [
    null,
    { ...RESPONSE, id: 'not-a-uuid' },
    { ...RESPONSE, status: 'closed' },
    { ...RESPONSE, created_at: 'tomorrow' },
  ];
  context.after(() => {
    apiClient.post = originalPost;
  });

  for (const response of malformedResponses) {
    apiClient.post = (async () => ({
      data: response,
    })) as typeof apiClient.post;
    await assert.rejects(
      submitLumaLabsFeedback({
        category: 'other',
        title: 'Valid title',
        details: 'This description is long enough.',
      }),
      /Feedback backend returned/,
    );
  }
});

test('LUMA Labs propagates network failures without a mock success', async (context) => {
  const originalPost = apiClient.post;
  apiClient.post = (async () => {
    throw new Error('network unavailable');
  }) as typeof apiClient.post;
  context.after(() => {
    apiClient.post = originalPost;
  });

  await assert.rejects(
    submitLumaLabsFeedback({
      category: 'bug',
      title: 'Forecast card issue',
      details: 'The completed forecast card cannot be opened.',
    }),
    /network unavailable/,
  );
});
