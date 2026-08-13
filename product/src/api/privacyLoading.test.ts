import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the application theme does not load remote Google Fonts', async () => {
  const stylesheet = await readFile(
    new URL('../index.css', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(stylesheet, /fonts\.(?:googleapis|gstatic)\.com/i);
  assert.doesNotMatch(
    stylesheet,
    /(?:Space Grotesk|JetBrains Mono|"Inter")/,
  );
  assert.match(stylesheet, /--font-sans:\s*ui-sans-serif,\s*system-ui/);
  assert.match(stylesheet, /--font-mono:\s*ui-monospace/);
});
