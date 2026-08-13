import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.mjs', '.ts', '.tsx']);
const forbidden = [
  {id: 'merge-marker', pattern: /^(?:<{7}|={7}|>{7})/m},
  {id: 'mojibake', pattern: /(?:Ã|Â|â€|â€¦|â€¢|ðŸ|�)/u},
  {id: 'private-origin', pattern: /\.a\.run\.app\b|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\b/iu},
  {id: 'separate-product-route', pattern: /token\.lumaquant\.tech|\/auth\/(?:handoff|wallet-registration)|\/artifacts\b/iu},
  {id: 'wallet-or-token-module', pattern: /(?:lumaKey|tokenPortal|workspaceHandoff|workspaceRegistration|solana|wallet[-_ ]sign)/iu},
];

async function filesUnder(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const result = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(absolute));
    else if (entry.isFile() && textExtensions.has(path.extname(entry.name))) result.push(absolute);
  }
  return result;
}

const violations = [];
for (const file of await filesUnder(sourceRoot)) {
  const contents = await readFile(file, 'utf8');
  for (const rule of forbidden) {
    if (
      file.endsWith('.test.ts')
      && (rule.id === 'separate-product-route' || rule.id === 'wallet-or-token-module')
    ) continue;
    if (rule.pattern.test(contents)) {
      violations.push(`${rule.id}: ${path.relative(root, file).replaceAll('\\', '/')}`);
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('public source lint passed\n');
}
