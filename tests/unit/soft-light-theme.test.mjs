import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');
const light = css.match(/\.smart-aqua-app\[data-theme='light'\] \{([\s\S]*?)\n\}/)[1];
const token = name => light.match(new RegExp(`--color-${name}: (#[a-f0-9]{6});`))[1];
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
test('light page/card/secondary surfaces avoid pure white, with readable foregrounds', () => {
  for (const surface of ['slate-950', 'slate-900', 'slate-800']) {
    assert.notEqual(token(surface), '#ffffff');
    for (const foreground of ['slate-100', 'slate-300', 'slate-400', 'slate-500']) assert.ok(contrast(token(surface), token(foreground)) >= 4.5, `${foreground} on ${surface}`);
  }
  assert.ok(contrast('#ffffff', token('teal-600')) >= 4.5);
  assert.ok(contrast('#ffffff', token('rose-600')) >= 4.5);
  assert.ok(contrast(token('slate-950'), '#17685f') >= 3);
});
test('formal inputs and focus rings explicitly adapt to light mode instead of keeping dark hard-coded backgrounds', () => {
  assert.match(css, /\[data-theme='light'\] \.formal-input \{\s*background: #e7eeeb;\s*color: #243b3e;/);
  assert.match(css, /\[data-theme='light'\][^{}]*:focus-visible \{\s*outline-color: #17685f;/);
  assert.match(css, /\[data-theme='light'\][^{}]*\.text-rose-100[^{}]*\{\s*color: #a3344a;/);
  assert.match(css, /\[data-theme='light'\][^{}]*\.text-amber-100[^{}]*\{\s*color: #80520c;/);
});
test('web and mobile agree on primary soft-light surfaces and text', () => {
  const mobile = readFileSync(new URL('../../../smart-aqua-mobile/src/constants/light-palette.ts', import.meta.url), 'utf8');
  for (const [key, value] of [['text', token('slate-100')], ['background', token('slate-950')], ['panel', token('slate-900')], ['backgroundElement', token('slate-800')], ['accentStrong', token('teal-600')]]) assert.ok(mobile.includes(`${key}: '${value}'`));
});
