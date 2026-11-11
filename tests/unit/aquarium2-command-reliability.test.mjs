// Actual firmware control flow, exercised offline with bounded I/O stubs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../firmware/Aquarium2Device/', import.meta.url);
const source = readFileSync(new URL('Aquarium2Device.ino', root), 'utf8');
const body = name => source.match(new RegExp(`void ${name}\\([^\\n]*\\) \\{([\\s\\S]*?)\\r?\\n\\}`))?.[1];

test('ACK uses existing device-only schema with server timestamp, without physical feedback claims', () => {
  const queue = body('queueCommandAck').replace('JsonDocument ack;', 'const ack = { executedAt: {} };')
    .replace('serializeJson(ack, pendingAckPayload);', 'pendingAckPayload = JSON.stringify(ack);');
  const state = vm.createContext({ pendingAckId: '', pendingAckPayload: '' });
  vm.runInContext(`function queue(commandId, ok, error = '') { ${queue} }`, state);
  for (const ok of [true, false]) {
    state.queue('requested-command', ok, 'Blocked');
    const ack = JSON.parse(state.pendingAckPayload);
    assert.equal(state.pendingAckId, 'requested-command');
    assert.equal(ack.status, ok ? 'done' : 'failed');
    assert.deepEqual(ack.executedAt, { '.sv': 'timestamp' });
    assert.equal(ack.error, ok ? undefined : 'Blocked');
    const rules = JSON.parse(readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8'));
    const schema = rules.rules.devices.$aquariumId.commandAck.latest;
    for (const field of Object.keys(ack)) assert.ok(schema[field]);
  }
});

test('retrying an ACK never replays actuation; overwritten ACK is dropped to honor existing rules', () => {
  const flush = body('flushCommandAck').replace('String response;', "let response = '';")
    .replace('const int status', 'const status').replace('pendingAckId.isEmpty()', '!pendingAckId.length');
  const writes = [];
  const state = vm.createContext({ pendingAckId: 'one', pendingAckPayload: '{}', HTTP_METHOD_PUT: 'PUT',
    status: 500, database: (...args) => { writes.push(args); return state.status; }, Serial: { println() {}, printf() {} } });
  vm.runInContext(`function flush(currentCommandId) { ${flush} }`, state);
  state.flush('one');
  assert.equal(state.pendingAckId, 'one');
  state.status = 200;
  state.flush('one');
  assert.equal(state.pendingAckId, '');
  assert.deepEqual(writes.map(row => row[0]), ['commandAck/latest', 'commandAck/latest']);
  state.pendingAckId = 'one';
  state.flush('two');
  assert.equal(writes.length, 2);
  assert.equal(state.pendingAckId, '');
  assert.doesNotMatch(flush, /setOutput|runManualFeed/);
});

test('telemetry transport/5xx failures do not undo accepted outputs; authorization still fails closed', () => {
  const tail = source.slice(source.lastIndexOf('  Serial.printf("Telemetry snapshot HTTP'), source.indexOf('\nvoid setup()'));
  const evaluate = new Function('status', 'Serial', tail.replace(/\}\s*$/, ''));
  const serial = { printf() {}, println() {} };
  for (const status of [200, -1, 408, 429, 500, 503]) assert.equal(evaluate(status, serial), true);
  for (const status of [400, 401, 403, 404]) assert.equal(evaluate(status, serial), false);
  const cloud = source.slice(source.indexOf('bool cloudCycle()'), source.indexOf('  JsonDocument telemetry;'));
  assert.match(cloud, /if \(!authenticate\(\)\) return false/);
  assert.match(cloud, /Command access failed[\s\S]*?return false/);
  assert.match(source, /Wi-Fi lost: disarmed, both outputs OFF/);
  assert.match(source, /requestedMs <= commandWatermarkMs/);
  const baseline = cloud.slice(cloud.indexOf('  if (!commandBaseline)'), cloud.indexOf('} else if (commandId.length()'));
  assert.doesNotMatch(baseline, /setOutput|runManualFeed|queueCommandAck/);
});

test('ACKs cover both relay paths and failed feeds without changing pins or servo timing', () => {
  assert.match(source, /setOutput\(true, state == "On"\);[\s\S]*?queueCommandAck\(commandId, lightOn/);
  assert.match(source, /setOutput\(false, state == "Active"\);[\s\S]*?queueCommandAck\(commandId, filterOn/);
  assert.match(source, /runManualFeed\(\);\s*\/\/ BEGIN AQ2 COMMAND RELIABILITY\s*queueCommandAck\(commandId, lastFeedSucceeded/);
  assert.match(source, /lastFeedSucceeded = false/);
  assert.match(source, /lastFeedSucceeded = pwmOk/);
  assert.match(source, /LIGHT_PIN = 15, FILTER_PIN = 17, SERVO_PIN = 23/);
  assert.match(source, /flushCommandAck\(commandId\)/);
});
