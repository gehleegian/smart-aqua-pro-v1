import assert from 'node:assert/strict';
import test from 'node:test';
import { inventoryDevice, inventoryTelemetry, inventoryStatus, inventorySensorStatuses, joinInventory } from '../../src/utils/deviceInventory.ts';
import { paginationUiHarness } from '../helpers/paginationUiHarness.mjs';

const now = Date.UTC(2026, 10, 14, 4);
const device = inventoryDevice('SAQ-TEST-0001', { status: 'claimed', aquariumId: 'tank1', claimedBy: 'old-owner' });
const heartbeat = inventoryTelemetry({ online: true, updatedAt: now, phReadingValid: false, waterLevelReadingValid: false });

test('inventory supports both registry schemas and drops private fields', () => {
  assert.deepEqual(inventoryDevice('one', { state: 'claimed', ownerUid: 'owner', aquariumId: 'tank', claimCodeHash: 'private', password: 'private' }),
    { id: 'one', registration: 'claimed', ownerId: 'owner', aquariumId: 'tank', sensors: null, sensorSource: null, equipment: null });
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

test('confirmed quantities match current firmware enclosure IDs', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const [file, id] of [
    ['../../firmware/Aquarium1Device/Config.h', 'SAQ-7K3M-9R2X'],
    ['../../firmware/Aquarium2Device/DeviceIdentity.h', 'SAQ-HGCA-SJRS'],
  ]) {
    assert.ok((await readFile(new URL(file, import.meta.url), 'utf8')).includes(`ENCLOSURE_ID[] = "${id}"`));
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
    '../hooks/useNow': { useNow: () => now },
  } });
  const { DeviceInventoryTable } = harness.load(new URL('../../src/views/DeviceInventory.tsx', import.meta.url));
  const rows = joinInventory(Array.from({ length: 12 }, (_, index) => ({ ...device, id: `SAQ-TEST-${String(index).padStart(4, '0')}` })),
    [{ id: 'tank1', name: 'Tank', ownerId: 'owner', ownerName: 'Owner' }], []);
  const props = { now, data: { rows, telemetry: { tank1: heartbeat }, errors: {}, connected: true, clockOffset: 0 } };
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

test('shared temperature diagnostics never invent separate probe statuses or display readings', () => {
  const { harness: h, DeviceInventoryTable: Table, props } = tableHarness();
  const row = inventoryDevice('SAQ-7K3M-9R2X', { status: 'claimed', aquariumId: 'tank1' });
  const telemetry = inventoryTelemetry({ online: true, updatedAt: now, temperatureReadingValid: true, temperatureC: 25.1234,
    phReadingValid: true, ph: 8.372, tdsReadingValid: false, tdsPpm: 321.234 });
  const view = h.render(Table, { ...props, data: { ...props.data, rows: joinInventory([row], [], []), telemetry: { tank1: telemetry } } });
  assert.match(view.html, /Temperature × 2/);
  assert.match(view.html, /Shared channel only; individual probe status unknown/);
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
