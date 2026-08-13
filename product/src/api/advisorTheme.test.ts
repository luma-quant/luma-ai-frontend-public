import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const advisor = readFileSync(
  new URL('../components/LumaAdvisor.tsx', import.meta.url),
  'utf8',
);
const runSummary = readFileSync(
  new URL('../components/RunSummary.tsx', import.meta.url),
  'utf8',
);
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

const contrastWithWhite = (hex: string): number => {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255) ?? [];
  const linear = channels.map((channel) => (
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ));
  const luminance = (
    (0.2126 * linear[0])
    + (0.7152 * linear[1])
    + (0.0722 * linear[2])
  );
  return 1.05 / (luminance + 0.05);
};

test('Pro mode keeps the workspace blue and reserves magenta for two explicit signals', () => {
  const proTheme = css.match(/\.theme-pro\s*\{(?<body>[\s\S]*?)\}/)?.groups?.body;
  assert.ok(proTheme);
  assert.doesNotMatch(proTheme, /FF15F3|255\s*,\s*21\s*,\s*243/i);
  assert.match(proTheme, /--color-accent-magenta:\s*#27D8FF/i);
  assert.match(proTheme, /--color-canvas:\s*#071321/i);

  assert.match(css, /\.theme-pro\s+\[data-advisor-workspace\]/);
  const proRunButton = css.match(
    /\.theme-pro\s+\.btn-cyber-gradient\s*\{(?<body>[\s\S]*?)\}/,
  )?.groups?.body;
  assert.ok(proRunButton);
  assert.match(proRunButton, /#042D52/i);
  assert.match(proRunButton, /#086A8E/i);
  assert.doesNotMatch(proRunButton, /255\s*,\s*0\s*,\s*127|FF00F3|FF15F3/i);
  const fillDeclaration = proRunButton.match(
    /background-image:\s*linear-gradient\([^;]+/,
  )?.[0];
  assert.ok(fillDeclaration);
  const fillColors = fillDeclaration.match(/#[0-9a-f]{6}/gi) ?? [];
  assert.ok(fillColors.length >= 3);
  for (const fillColor of fillColors) {
    assert.ok(
      contrastWithWhite(fillColor) >= 4.5,
      `${fillColor} must keep white button text at WCAG AA contrast`,
    );
  }

  assert.match(
    advisor,
    /data-advisor-workspace/,
    'the ambient Pro tint must be scoped to the Advisor workspace',
  );

  const explicitProGradients = `${advisor}\n${runSummary}`
    .match(/#FF00F3/g)?.length ?? 0;
  assert.equal(
    explicitProGradients,
    2,
    'only the Pro toggle and Pro badge may use the magenta endpoint',
  );

  assert.match(
    app,
    /isProModeActive\s*&&\s*activeTab\s*===\s*['"]advisor['"]/,
    'the root Pro theme must activate only in the Advisor tab',
  );
  assert.match(app, /advisorProThemeActive\s*\?\s*["']theme-pro["']/);
  assert.match(app, /document\.body\.classList\.toggle\(/);
  assert.match(app, /portalThemeClass,\s*advisorProThemeActive/);
  assert.match(app, /document\.body\.classList\.remove\(portalThemeClass\)/);
  assert.match(css, /\.theme-pro-portals\s*\{/);
});
