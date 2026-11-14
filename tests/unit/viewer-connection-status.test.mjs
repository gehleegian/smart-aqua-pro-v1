import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDeviceTelemetryState,
  getDeviceTelemetryStatusText,
  isViewerRealtimeConnectionLost,
  setViewerRealtimeConnected,
} from '../../src/types/device.ts';

const now = 1794000000000;
const fresh = { online: true, updatedAt: now - 5_000 };
const stale = { online: true, updatedAt: now - 120_000 };

test('untracked connection keeps the shared 60-second heartbeat semantics', () => {
  setViewerRealtimeConnected(null);
  assert.equal(getDeviceTelemetryState(fresh, now), 'live');
  assert.equal(getDeviceTelemetryState(stale, now), 'offline');
  assert.equal(getDeviceTelemetryState(null, now), 'unavailable');
});

test('a viewer connection that has not connected yet is not reported as lost', () => {
  setViewerRealtimeConnected(null);
  setViewerRealtimeConnected(false);
  assert.equal(isViewerRealtimeConnectionLost(), false);
  assert.equal(getDeviceTelemetryState(stale, now), 'offline');
});

test('losing the viewer connection never blames the device as offline', () => {
  setViewerRealtimeConnected(null);
  setViewerRealtimeConnected(true);
  setViewerRealtimeConnected(false);
  assert.equal(isViewerRealtimeConnectionLost(), true);
  assert.equal(getDeviceTelemetryState(stale, now), 'unavailable');
  assert.equal(getDeviceTelemetryState(fresh, now), 'unavailable');
  assert.match(getDeviceTelemetryStatusText('unavailable'), /Connection lost/);
  setViewerRealtimeConnected(true);
  assert.equal(getDeviceTelemetryState(fresh, now), 'live');
  assert.equal(getDeviceTelemetryState(stale, now), 'offline');
  assert.equal(getDeviceTelemetryStatusText('unavailable'), 'No live data');
  setViewerRealtimeConnected(null);
});
