import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdvisorReportMarkdown } from '../components/AdvisorReportMarkdown';

test('historical Advisor reports render Markdown as semantic content', () => {
  const markup = renderToStaticMarkup(
    createElement(AdvisorReportMarkdown, {
      markdown: [
        '# LUMA Advisor',
        '',
        '## At a glance',
        '',
        '- Forecast: **D1968**',
        '- Evidence: `D1967`',
      ].join('\n'),
    }),
  );

  assert.match(markup, /<h1>LUMA Advisor<\/h1>/);
  assert.match(markup, /<h2>At a glance<\/h2>/);
  assert.match(markup, /<ul>/);
  assert.match(markup, /<strong>D1968<\/strong>/);
  assert.match(markup, /<code>D1967<\/code>/);
  assert.doesNotMatch(markup, /## At a glance/);
});
