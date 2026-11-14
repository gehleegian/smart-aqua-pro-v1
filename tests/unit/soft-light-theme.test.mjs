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
const dark = css.match(/@theme \{([\s\S]*?)\n\}/)[1];
const darkToken = name => dark.match(new RegExp(`--color-${name}: (#[a-f0-9]{6});`))[1];
const NAVY = '#082f49';

test('light mode: white cards on a light page with readable text', () => {
  assert.equal(token('slate-900'), '#ffffff', 'cards are white');
  for (const surface of ['slate-950', 'slate-900', 'slate-800']) {
    for (const foreground of ['slate-100', 'slate-300', 'slate-400', 'slate-500']) assert.ok(contrast(token(surface), token(foreground)) >= 4.5, `${foreground} on ${surface}`);
  }
  assert.ok(contrast('#ffffff', token('rose-600')) >= 4.5);
});

test('dark mode: black page with readable text', () => {
  assert.equal(darkToken('slate-950'), '#000000');
  for (const surface of ['slate-950', 'slate-900', 'slate-800']) {
    for (const foreground of ['slate-100', 'slate-300', 'slate-400', 'slate-500']) assert.ok(contrast(darkToken(surface), darkToken(foreground)) >= 4.5, `${foreground} on ${surface}`);
  }
});

test('sky blue accent uses dark navy text so filled buttons stay readable', () => {
  for (const shade of [token('teal-600'), token('teal-500'), darkToken('teal-600'), darkToken('teal-500')]) {
    assert.ok(contrast(shade, NAVY) >= 4.5, `navy on ${shade}`);
  }
  assert.equal(darkToken('teal-600'), '#54b6f2');
  assert.match(css, /:is\(\.bg-teal-600, \.bg-teal-500[^)]*\)\.text-white[^{]*\{\s*color: #082f49;/);
});

test('formal inputs, focus rings and status text adapt to light mode', () => {
  assert.match(css, /\[data-theme='light'\] \.formal-input \{\s*background: #ffffff;\s*color: #0f172a;/);
  assert.match(css, /\[data-theme='light'\][^{}]*:focus-visible \{\s*outline-color: #0284c7;/);
  assert.match(css, /\[data-theme='light'\][^{}]*\.text-teal-300[^{}]*\{\s*color: #0369a1;/);
  assert.ok(contrast('#ffffff', '#0369a1') >= 4.5, 'sky link text on white');
  assert.match(css, /\[data-theme='light'\][^{}]*\.text-rose-100[^{}]*\{\s*color: #be123c;/);
  assert.match(css, /\[data-theme='light'\][^{}]*\.text-amber-100[^{}]*\{\s*color: #92400e;/);
});

test('web and mobile agree on primary soft-light surfaces and text', () => {
  const mobile = readFileSync(new URL('../../../smart-aqua-mobile/src/constants/light-palette.ts', import.meta.url), 'utf8');
  for (const [key, value] of [['text', token('slate-100')], ['background', token('slate-950')], ['panel', token('slate-900')], ['backgroundElement', token('slate-800')], ['accentStrong', token('teal-600')]]) assert.ok(mobile.includes(`${key}: '${value}'`));
});
