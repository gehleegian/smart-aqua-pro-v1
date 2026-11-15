import assert from 'node:assert/strict';
import test from 'node:test';
import { inventoryCounts, inventoryDevice, inventoryTelemetry, inventoryStatus, inventorySensorStatuses, inventoryEquipmentStatuses, joinInventory } from '../../src/utils/deviceInventory.ts';
import { paginationUiHarness } from '../helpers/paginationUiHarness.mjs';

const now = Date.UTC(2026, 10, 14, 4);
const device = inventoryDevice('SAQ-TEST-0001', { status: 'claimed', aquariumId: 'tank1', claimedBy: 'old-owner' });
const heartbeat = inventoryTelemetry({ online: true, updatedAt: now, phReadingValid: false, waterLevelReadingValid: false });

test('inventory supports both registry schemas and drops private fields', () => {
  assert.deepEqual(inventoryDevice('one', { state: 'claimed', ownerUid: 'owner', aquariumId: 'tank', claimCodeHash: 'private', password: 'private' }),
    { id: 'one', registration: 'claimed', ownerId: 'owner', orgId: '', aquariumId: 'tank', sensors: null, sensorSource: null, equipment: null });
  assert.equal(inventoryDevice('one', {}).registration, 'unknown');
});

test('only the two owner-confirmed devices have six installed sensors, with equipment separate', () => {
  for (const id of ['SAQ-7K3M-9R2X', 'SAQ-HGCA-SJRS']) {
    const configured = inventoryDevice(id, { status: 'claimed' });
    assert.equal(configured.sensors.reduce((sum, sensor) => sum + sensor.count, 0), 6);
    assert.deepEqual(configured.sensors.find(sensor => sensor.type === 'temperature'), { type: 'temperature', count: 2 });
    assert.equal(configured.sensorSource, 'owner-confirmed');
    assert.deepEqual(configured.equipment, ['Lighting', 'Filtration']);
    assert.equal(configured.sensors.some(sensor => sensor.type === 'ammonia'), false);
    const recorded = inventoryDevice(id, { sensorInventory: [{ type: 'ph', count: 1 }] });
    assert.equal(recorded.sensorSource, 'registry');
    assert.equal(recorded.sensors.length, 1);
  }
  assert.equal(inventoryDevice('SAQ-FUTU-RE01', {}).sensors, null);
});

test('confirmed quantities match current firmware enclosure IDs', async (t) => {
  const { readFile } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  for (const [file, id, local] of [
    ['../../firmware/Aquarium1Device/Config.h', 'SAQ-7K3M-9R2X', false],
    // Aquarium 2's identity header holds device credentials and is gitignored;
    // it only exists on a provisioned workstation, so check it when present.
    ['../../firmware/Aquarium2Device/DeviceIdentity.h', 'SAQ-HGCA-SJRS', true],
  ]) {
    const url = new URL(file, import.meta.url);
    if (local && !existsSync(url)) { t.diagnostic(`skipped ${file}: local-only file not present`); continue; }
    assert.ok((await readFile(url, 'utf8')).includes(`ENCLOSURE_ID[] = "${id}"`));
  }
});

test('physical counts require complete explicit metadata, never telemetry field count', () => {
  assert.equal(device.sensors, null);
  const sensors = [{ type: 'temperature', count: 2 }, { type: 'ph', count: 1 }];
  assert.deepEqual(inventoryDevice('one', { sensorInventory: sensors }).sensors, sensors);
  for (const value of [[], [{ type: 'ph', count: -1 }], [{ type: 'ph', count: 1.5 }], [{ type: 'anything', count: 1 }],
    [{ type: 'ph', count: 1 }, { type: 'ph', count: 1 }], [null], [{ count: 1 }]]) {
    assert.equal(inventoryDevice('one', { sensorInventory: value }).sensors, null);
  }
  assert.deepEqual(heartbeat.sensorTypes, ['ph', 'waterLevel']);
  assert.equal(inventoryTelemetry({ updatedAt: 1e99 }).updatedAt, undefined);
});

test('heartbeat status respects freshness without treating sensor errors as offline', () => {
  assert.equal(inventoryStatus(device, heartbeat, true, now), 'Online');
  assert.equal(inventoryStatus(device, heartbeat, true, now + 60000), 'Online');
  assert.equal(inventoryStatus(device, heartbeat, true, now + 60001), 'Offline');
  assert.equal(inventoryStatus(device, { ...heartbeat, online: false }, true, now), 'Offline');
  assert.equal(inventoryStatus(device, null, true, now), 'Not reporting');
  assert.equal(inventoryStatus(device, { updatedAt: now }, true, now), 'Not reporting');
  assert.equal(inventoryStatus(device, { ...heartbeat, updatedAt: now + 999999 }, true, now), 'Not reporting');
  assert.equal(inventoryStatus(device, heartbeat, false, now), 'Unavailable');
  assert.equal(inventoryStatus(device, heartbeat, true, now, 'permission denied'), 'Unavailable');
  assert.equal(inventoryStatus({ ...device, registration: 'unclaimed' }, heartbeat, true, now), 'Unassigned');
});

test('organization comes from the registry binding and is never guessed', () => {
  const claimed = inventoryDevice('one', { status: 'claimed', aquariumId: 'tank1', orgId: 'org1', claimedBy: 'owner' });
  const tanks = [{ id: 'tank1', name: 'Tank', ownerId: 'owner', ownerName: 'Owner' }];
  assert.equal(joinInventory([claimed], tanks, [], [{ id: 'org1', name: 'Davao Pet Shop' }])[0].orgName, 'Davao Pet Shop');
  assert.equal(joinInventory([claimed], tanks, [], [])[0].orgName, 'Organization record unavailable');
  const stock = inventoryDevice('two', { status: 'unclaimed', orgId: 'org1' });
  const row = joinInventory([stock], [], [], [{ id: 'org1', name: 'Davao Pet Shop' }])[0];
  assert.equal(row.orgName, 'Unassigned');
  assert.equal(row.orgId, '');
});

test('fleet totals count only fresh heartbeats as online and are shared by both admin pages', () => {
  const rows = [
    inventoryDevice('a', { status: 'claimed', aquariumId: 't1' }),
    inventoryDevice('b', { status: 'claimed', aquariumId: 't2' }),
    inventoryDevice('c', { status: 'claimed', aquariumId: 't3' }),
    inventoryDevice('d', { status: 'unclaimed' }),
  ];
  const telemetry = {
    t1: inventoryTelemetry({ online: true, updatedAt: now - 5_000 }),
    t2: inventoryTelemetry({ online: true, updatedAt: now - 120_000 }),
    t3: null,
  };
  assert.deepEqual(inventoryCounts(rows, telemetry, true, now), { registered: 4, assigned: 3, online: 1, offline: 1, notReporting: 1 });
  assert.deepEqual(inventoryCounts(rows, telemetry, false, now), { registered: 4, assigned: 3, online: 0, offline: 0, notReporting: 3 });
});

test('current aquarium ownership wins over historical claimant; no guessing unclaimed owners', () => {
  const rows = joinInventory([device], [{ id: 'tank1', name: 'Tank', ownerId: 'new-owner', ownerName: 'New' }],
    [{ id: 'new-owner', name: 'Current owner', email: 'owner@example.invalid' }]);
  assert.equal(rows[0].ownerId, 'new-owner');
  assert.equal(rows[0].ownerName, 'Current owner');
  assert.equal(joinInventory([{ ...device, registration: 'unclaimed' }], [], [])[0].ownerName, 'Unassigned');
});

function tableHarness() {
  const harness = paginationUiHarness({ mocks: {
    '../services/deviceInventoryService': { subscribeToDeviceInventory() { throw new Error('No subscriptions in table rendering'); } },
    '../../services/deviceInventoryService': { subscribeToDeviceInventory() { throw new Error('No subscriptions in card rendering'); } },
    '../hooks/useNow': { useNow: () => now },
    '../../hooks/useNow': { useNow: () => now },
  } });
  const { DeviceInventoryTable } = harness.load(new URL('../../src/views/DeviceInventory.tsx', import.meta.url));
  const rows = joinInventory(Array.from({ length: 12 }, (_, index) => ({ ...device, id: `SAQ-TEST-${String(index).padStart(4, '0')}` })),
    [{ id: 'tank1', name: 'Tank', ownerId: 'owner', ownerName: 'Owner' }], []);
  const props = { now, data: { rows, telemetry: { tank1: heartbeat }, errors: {}, connected: true, clockOffset: 0, observedAt: now } };
  return { harness, DeviceInventoryTable, props };
}

test('inventory table paginates and numbers rows across pages, filters and resets page', () => {
  const { harness: h, DeviceInventoryTable: Table, props } = tableHarness();
  let view = h.render(Table, props);
  assert.match(view.html, /Physical count not recorded/);
  assert.match(view.html, /pH/);
  assert.match(view.html, /Water level/);
  assert.match(view.html, /Reported type; installed quantity not recorded/);
  assert.match(view.html, /SAQ-TEST-0000/);
  assert.doesNotMatch(view.html, /SAQ-TEST-0011/);
  view.nodes.find(node => node.props['aria-label'] === 'Device inventory: next page').props.onClick();
  view = h.render(Table, props);
  assert.match(view.html, /SAQ-TEST-0011/);
  assert.match(view.html, /aria-label="Device index 11"/);
  assert.match(view.html, /Page 2 of 2/);
  view.nodes.find(node => node.type === 'input').props.onChange({ target: { value: '0001' } });
  view = h.render(Table, props);
  assert.match(view.html, /SAQ-TEST-0001/);
  assert.doesNotMatch(view.html, /SAQ-TEST-0011/);
  assert.match(view.html, /Page 1 of 1/);
});

test('inventory distinguishes disconnected dashboard, missing heartbeat and offline devices', () => {
  const { harness: h, DeviceInventoryTable: Table, props } = tableHarness();
  let view = h.render(Table, { ...props, data: { ...props.data, connected: false } });
  assert.match(view.html, /Unavailable/);
  assert.doesNotMatch(view.html, />Online<\/span>/);
  view = h.render(Table, { ...props, now: now + 61000 });
  assert.match(view.html, />Offline<\/span>/);
  view = h.render(Table, { ...props, data: { ...props.data, telemetry: {} } });
  assert.match(view.html, /Not reporting/);
  assert.match(view.html, /Not received/);
});

test('inventory renders six confirmed sensors and keeps lighting/filter out of the sensor total', () => {
  const { harness: h, DeviceInventoryTable: Table, props } = tableHarness();
  const confirmed = inventoryDevice('SAQ-7K3M-9R2X', { status: 'claimed', aquariumId: 'tank1' });
  const rows = joinInventory([confirmed], [], []);
  const view = h.render(Table, { ...props, data: { ...props.data, rows } });
  assert.match(view.html, /6 configured sensors/);
  assert.match(view.html, /Temperature × 2/);
  assert.match(view.html, /Owner-confirmed installation/);
  assert.match(view.html, /Lighting, Filtration/);
  assert.doesNotMatch(view.html, /Physical count not recorded/);
});

test('device inventory navigation appears only for Admin', () => {
  const h = paginationUiHarness();
  const { default: Sidebar } = h.load(new URL('../../src/components/layout/Sidebar.tsx', import.meta.url));
  for (const navRole of ['Admin', 'owner', 'caretaker', 'none']) {
    const view = h.render(Sidebar, { navRole, currentPage: 'dashboard', isOpen: true, collapsed: false,
      onNavigate() {}, onLogout() {}, onClose() {}, onToggleCollapsed() {} });
    assert.equal(view.html.includes('Device Inventory'), navRole === 'Admin');
  }
});

test('sensor diagnostics are reduced to status only, with explicit invalid flags distinct from missing data', () => {
  const parsed = inventoryTelemetry({ updatedAt: now, online: true, ph: 8.37, phReadingValid: true,
    tdsReadingValid: false, waterLevelPercent: 45, turbidityState: 'Clear', turbidityReadingValid: true });
  assert.equal(parsed.sensors.ph.status, 'Reporting');
  assert.equal(parsed.sensors.tds.status, 'Fault');
  assert.equal(parsed.sensors.waterLevel.status, 'Unknown');
  assert.equal(parsed.sensors.turbidity.status, 'Reporting');
  assert.doesNotMatch(JSON.stringify(parsed), /8\.37|45|Clear|phReadingValid|waterLevelPercent/);
  for (const raw of [{ phReadingValid: true }, { phReadingValid: true, ph: -20 }, { phReadingValid: 'false', ph: 8 }, { ammoniaPpm: 1 }]) {
    const unknown = inventoryTelemetry(raw);
    assert.ok(Object.values(unknown.sensors).every(sensor => sensor.status === 'Unknown'));
  }
});

test('categorical turbidity reports without a legacy firmware validity flag, but never overrides faults', () => {
  for (const turbidityState of ['Clear', 'Cloudy']) {
    const raw = { online: true, updatedAt: now, turbidityState };
    const parsed = inventoryTelemetry(raw);
    assert.equal(parsed.sensors.turbidity.status, 'Reporting');
    assert.doesNotMatch(JSON.stringify(parsed), /Clear|Cloudy/);
    assert.equal(inventoryTelemetry({ ...raw, turbidityReadingValid: false }).sensors.turbidity.status, 'Fault');
    for (const extra of [{ turbidityReadingValid: 'true' }, { turbidityReadingValid: 1 },
      { turbidity: -1 }, { turbidity: 'bad' }, { turbidity: Infinity }]) {
      assert.equal(inventoryTelemetry({ ...raw, ...extra }).sensors.turbidity.status, 'Unknown');
    }
  }
  for (const turbidityState of ['Unknown', 'clear', 'cloudy', '', null, 1]) {
    assert.equal(inventoryTelemetry({ turbidityState }).sensors.turbidity.status, 'Unknown');
  }
  // Numeric-only readings and other sensors still require explicit diagnostics.
  assert.equal(inventoryTelemetry({ turbidity: 10 }).sensors.turbidity.status, 'Unknown');
  assert.equal(inventoryTelemetry({ ph: 7 }).sensors.ph.status, 'Unknown');
});

test('fresh callbacks between clock ticks do not flicker sensor statuses or admin fleet counts', () => {
  const { harness: h, DeviceInventoryTable: Table, props } = tableHarness();
  const { AdminDeviceStatusCards } = h.load(new URL('../../src/components/admin/AdminDeviceStatusSummary.tsx', import.meta.url));
  const rows = joinInventory([
    inventoryDevice('SAQ-7K3M-9R2X', { status: 'claimed', aquariumId: 'tank1' }),
    inventoryDevice('SAQ-HGCA-SJRS', { status: 'claimed', aquariumId: 'tank2' }),
  ], [], []);
  const renderData = (time, connected = true) => ({ ...props.data, rows, connected, observedAt: time,
    clockOffset: 2000, telemetry: Object.fromEntries(['tank1', 'tank2'].map(id => [id,
      inventoryTelemetry({ online: true, updatedAt: time + 2000, ph: 7, phReadingValid: true,
        turbidityState: id === 'tank1' ? 'Clear' : 'Cloudy' })])) });
  for (const elapsed of [0, 1500, 4500, 15000]) {
    const data = renderData(now + elapsed);
    const view = h.render(Table, { ...props, data });
    assert.equal((view.html.match(/>Reporting<\/span>/g) || []).length, 4);
    assert.equal((view.html.match(/>Online<\/span>/g) || []).length, 2);
    const cards = h.render(AdminDeviceStatusCards, { data, now, onOpenInventory() {} });
    assert.match(cards.html, /Online<\/p><p[^>]*>2<\/p>/);
  }
  const data = renderData(now + 4500);
  for (const changed of [
    { data, now: now + 4500 + 60001 },
    { data: { ...data, connected: false }, now },
    { data: { ...data, errors: { tank1: 'read denied', tank2: 'read denied' } }, now },
    { data: { ...data, observedAt: now }, now }, // Genuinely future-dated samples stay unknown.
  ]) {
    const view = h.render(Table, { ...props, ...changed });
    assert.doesNotMatch(view.html, />Reporting<\/span>/);
  }
});

test('mobile keeps the categorical turbidity inventory contract in parity', async t => {
  const { existsSync } = await import('node:fs');
  const url = new URL('../../../smart-aqua-mobile/src/utils/deviceInventory.ts', import.meta.url);
  if (!existsSync(url)) { t.skip('Mobile checkout is not present'); return; }
  const mobile = await import(url.href);
  for (const extra of [{ turbidityState: 'Clear' }, { turbidityState: 'Cloudy' },
    { turbidityState: 'Unknown' }, { turbidityState: 'Cloudy', turbidityReadingValid: false },
    { turbidityState: 'Clear', turbidity: -1 }, { turbidity: 2, turbidityReadingValid: true }]) {
    const raw = { online: true, updatedAt: now, ...extra };
    assert.deepEqual(mobile.inventoryTelemetry(raw), inventoryTelemetry(raw));
  }
});

test('each installed sensor remains visible, but all become Unknown when fresh connectivity is lost', () => {
  const installed = inventoryDevice('SAQ-7K3M-9R2X', { status: 'claimed', aquariumId: 'tank1' });
  const live = inventoryTelemetry({ updatedAt: now, online: true, ph: 8.37, phReadingValid: true, tdsReadingValid: false });
  let sensors = inventorySensorStatuses(installed, live, true, now);
  assert.equal(sensors.length, 5); // Five channels, six probes; temperature is a shared pair.
  assert.equal(sensors.find(sensor => sensor.type === 'ph').status, 'Reporting');
  assert.equal(sensors.find(sensor => sensor.type === 'tds').status, 'Fault');
  assert.equal(sensors.find(sensor => sensor.type === 'temperature').status, 'Unknown');
  for (const [connected, time, error] of [[true, now + 60001], [false, now], [true, now, 'read denied']]) {
    sensors = inventorySensorStatuses(installed, live, connected, time, error);
    assert.ok(sensors.every(sensor => sensor.status === 'Unknown'));
  }
});

test('inventory normalizes only device-reported equipment states and respects freshness and installation', () => {
  const installed = inventoryDevice('SAQ-7K3M-9R2X', { status: 'claimed', aquariumId: 'tank1' });
  const states = (raw, connected = true, time = now, error) => inventoryEquipmentStatuses(installed,
    inventoryTelemetry({ online: true, updatedAt: now, ...raw }), connected, time, error);
  assert.deepEqual(states({ lightState: 'On', filterState: 'Inactive' }), [
    { type: 'lights', label: 'Lights', status: 'On' }, { type: 'filter', label: 'Filter', status: 'Off' },
  ]);
  assert.deepEqual(states({ lightState: 'Off', filterState: 'Active' }).map(item => item.status), ['Off', 'On']);
  for (const raw of [{}, { lightState: true, filterState: false }, { lightState: 'on', filterState: 'On' },
    { lightState: 'Fault', filterState: 'Fault' }]) {
    assert.ok(states(raw).every(item => item.status === 'Unknown'));
  }
  const raw = { lightState: 'On', filterState: 'Active' };
  assert.ok(states(raw, true, now + 60000).every(item => item.status === 'On'));
  for (const [connected, time, error] of [[false, now], [true, now + 60001], [true, now - 1001],
    [true, now, 'permission denied']]) {
    assert.ok(states(raw, connected, time, error).every(item => item.status === 'Unknown'));
  }
  assert.ok(states({ ...raw, online: false }).every(item => item.status === 'Unknown'));
  const telemetry = inventoryTelemetry({ ...raw, online: true, updatedAt: now, ph: 7, phReadingValid: false, secret: 'NEVER-KEEP' });
  assert.deepEqual(inventoryEquipmentStatuses(installed, telemetry, true, now).map(item => item.status), ['On', 'On']);
  assert.doesNotMatch(JSON.stringify(telemetry), /NEVER-KEEP|lightState|filterState/);
  assert.deepEqual(inventoryEquipmentStatuses({ ...installed, equipment: [] }, telemetry, true, now), []);
  assert.equal(inventoryEquipmentStatuses({ ...installed, equipment: ['Lighting'] }, telemetry, true, now).length, 1);
  assert.ok(inventoryEquipmentStatuses({ ...installed, registration: 'unclaimed' }, telemetry, true, now).every(item => item.status === 'Unknown'));
  assert.deepEqual(inventoryEquipmentStatuses(device, inventoryTelemetry({ online: true, updatedAt: now }), true, now), []);
});

test('equipment status UI stays aquarium-specific, read-only and separate from physical sensor count', () => {
  const { harness: h, DeviceInventoryTable: Table, props } = tableHarness();
  const rows = joinInventory([
    inventoryDevice('SAQ-7K3M-9R2X', { status: 'claimed', aquariumId: 'tank1' }),
    inventoryDevice('SAQ-HGCA-SJRS', { status: 'claimed', aquariumId: 'tank2' }),
  ], [], []);
  const data = { ...props.data, rows, telemetry: {
    tank1: inventoryTelemetry({ online: true, updatedAt: now, lightState: 'On', filterState: 'Inactive' }),
    tank2: inventoryTelemetry({ online: true, updatedAt: now, lightState: 'Off', filterState: 'Active' }),
  } };
  const view = h.render(Table, { ...props, data });
  for (const id of ['SAQ-7K3M-9R2X', 'SAQ-HGCA-SJRS']) {
    const section = view.nodes.find(node => node.type === 'section' && node.props['aria-label'] === id + ': equipment status');
    assert.ok(section);
  }
  assert.equal((view.html.match(/6 configured sensors/g) || []).length, 2);
  assert.equal((view.html.match(/>On<\/span>/g) || []).length, 2);
  assert.equal((view.html.match(/>Off<\/span>/g) || []).length, 2);
  assert.match(view.html, /Device-reported relay state, not verified physical operation/);
  assert.doesNotMatch(view.html, /Turn on|Turn off|Toggle|LIGHT ON|FILTER ON/);
  const stale = h.render(Table, { ...props, data, now: now + 60001 });
  assert.doesNotMatch(stale.html, />On<\/span>|>Off<\/span>/);
});

test('mobile and web equipment inventory status contracts match', async t => {
  const { existsSync } = await import('node:fs');
  const url = new URL('../../../smart-aqua-mobile/src/utils/deviceInventory.ts', import.meta.url);
  if (!existsSync(url)) { t.skip('Mobile checkout is not present'); return; }
  const mobile = await import(url.href);
  const installed = inventoryDevice('SAQ-HGCA-SJRS', { status: 'claimed', aquariumId: 'tank2' });
  for (const extra of [{ lightState: 'On', filterState: 'Active' }, { lightState: 'Off', filterState: 'Inactive' },
    { lightState: 'bad', filterState: true }, {}]) {
    const raw = { online: true, updatedAt: now, ...extra };
    assert.deepEqual(mobile.inventoryTelemetry(raw), inventoryTelemetry(raw));
    for (const connected of [true, false]) for (const time of [now, now + 60001]) {
      assert.deepEqual(mobile.inventoryEquipmentStatuses(installed, mobile.inventoryTelemetry(raw), connected, time),
        inventoryEquipmentStatuses(installed, inventoryTelemetry(raw), connected, time));
    }
  }
});

test('shared temperature diagnostics never invent separate probe statuses or display readings', () => {
  const { harness: h, DeviceInventoryTable: Table, props } = tableHarness();
  const row = inventoryDevice('SAQ-7K3M-9R2X', { status: 'claimed', aquariumId: 'tank1' });
  const telemetry = inventoryTelemetry({ online: true, updatedAt: now, temperatureReadingValid: true, temperatureC: 25.1234,
    phReadingValid: true, ph: 8.372, tdsReadingValid: false, tdsPpm: 321.234 });
  const view = h.render(Table, { ...props, data: { ...props.data, rows: joinInventory([row], [], []), telemetry: { tank1: telemetry } } });
  assert.match(view.html, /Temperature × 2/);
  assert.doesNotMatch(view.html, /Shared channel only; individual probe status unknown/);
  assert.match(view.html, />Reporting<\/span>/);
  assert.match(view.html, />Fault<\/span>/);
  assert.match(view.html, /<details/);
  assert.match(view.html, /<summary/);
  assert.doesNotMatch(view.html, /25\.1234|8\.372|321\.234|Temperature probe 1|Temperature probe 2|min-w-\[850px\]/);
});

test('sensor fault filter, clear filters and pagination preserve device isolation', () => {
  const { harness: h, DeviceInventoryTable: Table, props } = tableHarness();
  const rows = joinInventory([
    inventoryDevice('fault-device', { status: 'claimed', aquariumId: 'tank1', sensorInventory: [{ type: 'ph', count: 1 }] }),
    inventoryDevice('reporting-device', { status: 'claimed', aquariumId: 'tank2', sensorInventory: [{ type: 'ph', count: 1 }] }),
  ], [], []);
  const data = { ...props.data, rows, telemetry: {
    tank1: inventoryTelemetry({ online: true, updatedAt: now, phReadingValid: false }),
    tank2: inventoryTelemetry({ online: true, updatedAt: now, phReadingValid: true, ph: 8.37 }),
  } };
  let view = h.render(Table, { ...props, data });
  view.nodes.find(node => node.type === 'select' && node.props['aria-label'] === 'Sensor status').props.onChange({ target: { value: 'Sensor faults' } });
  view = h.render(Table, { ...props, data });
  assert.match(view.html, /fault-device/); assert.doesNotMatch(view.html, /reporting-device/);
  view.nodes.find(node => node.type === 'button' && node.props.children === 'Clear filters').props.onClick();
  view = h.render(Table, { ...props, data });
  assert.match(view.html, /reporting-device/);
  view = h.render(Table, { ...props, now: now + 61000, data });
  assert.doesNotMatch(view.html, />Fault<\/span>|>Reporting<\/span>/);
});
