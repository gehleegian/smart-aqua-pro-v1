import assert from 'node:assert/strict';
import test from 'node:test';
import { isClaimOriginAllowed } from '../../src/server/claimOrigin.ts';

const request = (origin, host = '127.0.0.1:3000', url = 'http://localhost:3000/api/devices/claim') =>
  new Request(url, { headers: { ...(origin === undefined ? {} : { origin }), host } });

test('same origin and native bearer clients remain supported', () => {
  assert.equal(isClaimOriginAllowed(request('http://localhost:3000'), false), true);
  assert.equal(isClaimOriginAllowed(request(undefined), false), true);
});
test('dev loopback Host resolves Next normalized request URL', () => {
  assert.equal(isClaimOriginAllowed(request('http://127.0.0.1:3000'), true), true);
  assert.equal(isClaimOriginAllowed(request('http://[::1]:3000', '[::1]:3000'), true), true);
});
test('production never enables loopback exception', () => {
  assert.equal(isClaimOriginAllowed(request('http://127.0.0.1:3000'), false), false);
});
test('foreign, null, mismatched port, protocol and malformed hosts fail closed', () => {
  for (const [origin, host] of [
    ['https://evil.example', 'evil.example'], ['null', '127.0.0.1:3000'],
    ['http://127.0.0.1:3001', '127.0.0.1:3001'],
    ['https://127.0.0.1:3000', '127.0.0.1:3000'],
    ['http://127.0.0.1:3000', 'localhost:3000'],
    ['http://127.0.0.1:3000', 'evil@127.0.0.1:3000'],
    ['http://127.0.0.1:3000', '127.0.0.1:3000/path'],
  ]) assert.equal(isClaimOriginAllowed(request(origin, host), true), false);
  assert.equal(isClaimOriginAllowed(request('http://127.0.0.1:3000', '127.0.0.1:3000',
    'https://app.example/api/devices/claim'), true), false);
});
