// Offline protocol fixtures only. No live Firebase or equipment operations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commandOutcome, mailboxCommandId, publishConfirmedCommand } from '../../src/utils/commandMailbox.ts';

const NOW = Date.UTC(2026, 10, 11);
const command = (id = 'light-1', type = 'set_light_state', state = 'On') =>
  ({ commandId: id, type, state, requestedAt: NOW });
function harness() {
  const h = { latest: null, ack: null, telemetry: null, now: NOW, writes: [], tick: () => {} };
  h.io = {
    readLatest: async () => h.latest,
    readAck: async () => h.ack,
    readTelemetry: async () => h.telemetry,
    claim: async (expectedId, next) => {
      if (mailboxCommandId(h.latest) !== expectedId) return false;
      h.latest = next;
      h.writes.push(next);
      return true;
    },
    now: () => h.now,
    pause: async () => { h.now += 1000; h.tick(); },
  };
  return h;
}

test('recent unconfirmed light cannot be overwritten by a rapid filter command or feed', async () => {
  for (const next of [command('filter-1', 'set_filter_state', 'Active'), command('feed-1', 'feed_now')]) {
    const h = harness();
    h.latest = command();
    await assert.rejects(publishConfirmedCommand(next, h.io), /previous device command/);
    assert.equal(h.latest.commandId, 'light-1');
    assert.equal(h.writes.length, 0);
  }
});

test('both ON orders and independent OFF actions are delivered one at a time', async () => {
  for (const order of [['set_light_state', 'set_filter_state'], ['set_filter_state', 'set_light_state']]) {
    const h = harness();
    h.tick = () => { h.ack = { commandId: h.latest.commandId, status: 'done', executedAt: h.now }; };
    for (const type of [...order, ...order]) {
      const active = h.writes.length < 2;
      const state = type === 'set_light_state' ? (active ? 'On' : 'Off') : (active ? 'Active' : 'Inactive');
      await publishConfirmedCommand({ ...command(`${type}-${h.now}`, type, state), requestedAt: h.now }, h.io);
    }
    assert.deepEqual(h.writes.map(row => row.type), [...order, ...order]);
    assert.equal(h.writes.length, 4);
  }
});

test('an atomic-claim conflict aborts instead of overwriting or retrying a different user command', async () => {
  const h = harness();
  h.io.claim = async () => { h.latest = command('other-client'); return false; };
  await assert.rejects(publishConfirmedCommand(command(), h.io), /same time/);
  assert.equal(h.latest.commandId, 'other-client');
  assert.equal(h.writes.length, 0);
});

test('device failures and later replacement are explicit, not fake successes or automatic replay', async () => {
  const failed = harness();
  failed.tick = () => { failed.ack = { commandId: 'light-1', status: 'failed', executedAt: failed.now }; };
  await assert.rejects(publishConfirmedCommand(command(), failed.io), /device rejected/);
  assert.equal(failed.writes.length, 1);
  const replaced = harness();
  replaced.tick = () => { replaced.latest = command('legacy-client-overwrite'); };
  await assert.rejects(publishConfirmedCommand(command(), replaced.io), /replaced before/);
  assert.equal(replaced.writes.length, 1);
});

test('legacy firmware requires new online matching GPIO telemetry, never old or unrelated state', async () => {
  const c = command();
  const fresh = { online: true, updatedAt: NOW, lightState: 'On' };
  assert.equal(commandOutcome(c, null, fresh, NOW), 'done');
  for (const patch of [{ online: false }, { online: undefined }, { updatedAt: NOW - 1 }, { updatedAt: NOW + 1001 },
    { lightState: 'Off' }, { lightState: undefined }, { updatedAt: NaN }]) {
    assert.equal(commandOutcome(c, null, { ...fresh, ...patch }, NOW), null);
  }
  assert.equal(commandOutcome(c, { commandId: 'wrong-id', status: 'done', executedAt: NOW }, null, NOW), null);
  assert.equal(commandOutcome(c, { commandId: c.commandId, status: 'done', executedAt: NaN }, null, NOW), null);
  assert.equal(commandOutcome(command('feed', 'feed_now'), null, fresh, NOW), null);
  assert.equal(commandOutcome(command('filter', 'set_filter_state', 'Active'), null,
    { ...fresh, filterState: 'Active' }, NOW), 'done');
  const h = harness();
  h.tick = () => { h.telemetry = { ...fresh, updatedAt: h.now }; };
  await publishConfirmedCommand(c, h.io);
  assert.equal(h.writes.length, 1);
});

test('feed UI timing remains unchanged but an unacknowledged feed is not overwritten', async () => {
  const h = harness();
  await publishConfirmedCommand(command('feed-1', 'feed_now'), h.io);
  assert.equal(h.now, NOW);
  await assert.rejects(publishConfirmedCommand(command(), h.io), /previous device command/);
  h.ack = { commandId: 'feed-1', status: 'done', executedAt: h.now };
  h.tick = () => { h.ack = { commandId: 'light-1', status: 'done', executedAt: h.now }; };
  await publishConfirmedCommand(command(), h.io);
  assert.equal(h.writes.length, 2);
});

test('timeout keeps the original action and never writes a retry or rollback command', async () => {
  const h = harness();
  await assert.rejects(publishConfirmedCommand(command(), h.io), /may have run/);
  assert.equal(h.writes.length, 1);
  assert.equal(h.latest.commandId, 'light-1');
  assert.equal(h.now, NOW + 30000);
});

test('old commands outside the firmware freshness window do not block new explicit requests', async () => {
  const h = harness();
  h.latest = { ...command('expired'), requestedAt: NOW - 30001 };
  h.tick = () => { h.ack = { commandId: 'light-1', status: 'done', executedAt: h.now }; };
  await publishConfirmedCommand(command(), h.io);
  assert.equal(h.writes.length, 1);
});

test('slow preflight does not dispatch an expired user action later', async () => {
  const h = harness();
  h.io.readLatest = async () => { h.now += 31000; return null; };
  await assert.rejects(publishConfirmedCommand(command(), h.io), /expired before/);
  assert.equal(h.writes.length, 0);
});

test('web/mobile use identical mailbox logic, existing scoped nodes, authorization and atomic writes', () => {
  const web = readFileSync(new URL('../../src/utils/commandMailbox.ts', import.meta.url), 'utf8');
  const mobile = readFileSync(new URL('../../../smart-aqua-mobile/src/utils/commandMailbox.ts', import.meta.url), 'utf8');
  assert.equal(web.replaceAll('\r\n', '\n'), mobile.replaceAll('\r\n', '\n'));
  for (const path of ['../../src/services/deviceService.ts', '../../../smart-aqua-mobile/src/services/firebase-service.ts']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /await publishConfirmedCommand/);
    assert.match(source, /runTransaction\(latest/);
    assert.match(source, /mailboxCommandId\(current\) === expectedId \? next : undefined/);
    assert.match(source, /applyLocally: false/);
    assert.match(source, /\.info\/serverTimeOffset/);
    assert.match(source, /commandAck\/latest/);
    assert.match(source, /assertRealtimeDeviceAccess\(command.aquariumId, 'write'\)|requireAquariumAccess\(options.aquariumId, 'command'\)/);
  }
});
