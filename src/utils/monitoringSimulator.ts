import type { DeviceTelemetry } from '../types/device';
import type { SimulationScenario } from '../types/monitoring';
import type { EffectiveThresholds, RangeThreshold, WaterParameter } from './monitoringAssessmentCore.ts';
import { normalizeTelemetry } from './deviceTelemetryParser.ts';

// Dev-only simulator. It builds a raw payload in the device contract shape
// (docs/device-contract.md) and passes it through the same parser used for
// RTDB telemetry, so simulated and live data follow one contract. It is never
// written to Firebase. Values are placed relative to the aquarium's effective
// thresholds from Firestore; the simulator has no thresholds of its own. A
// parameter with no threshold is simply not sent.

type Placement = 'inside' | 'just_outside' | 'far_outside';

function place(range: RangeThreshold | undefined, placement: Placement): number | undefined {
  if (!range) return undefined;
  const { min, max } = range;
  if (placement === 'inside') {
    if (min !== undefined && max !== undefined) return min + (max - min) / 2;
    if (max !== undefined) return max / 2;
    return min! + Math.abs(min!) * 0.2;
  }
  // "just outside" moves 1% past the limit; "far outside" moves 50% past it.
  const factor = placement === 'just_outside' ? 0.01 : 0.5;
  if (max !== undefined) return Number((max + Math.max(Math.abs(max) * factor, 0.01)).toFixed(2));
  return Number((min! - Math.max(Math.abs(min!) * factor, 0.01)).toFixed(2));
}

export function createSimulatedContractPayload(
  thresholds: EffectiveThresholds,
  scenario: SimulationScenario,
  now = Date.now(),
  profile: { hasFiltrationSystem?: boolean } = {}
): Record<string, unknown> {
  const placement: Placement = scenario === 'critical' ? 'far_outside' : scenario === 'warning' ? 'just_outside' : 'inside';
  const value = (parameter: WaterParameter) => place(thresholds.values[parameter], placement);
  const level = thresholds.values.waterLevelPercent;
  const waterLevelPercent = scenario === 'normal' && level?.min !== undefined
    ? Math.min(100, level.min + (100 - level.min) / 2)
    : value('waterLevelPercent');
  const filterInstalled = profile.hasFiltrationSystem !== false;

  const payload: Record<string, unknown> = {
    temperatureC: value('temperatureC'),
    temperatureReadingValid: true,
    waterLevelPercent: waterLevelPercent === undefined ? undefined : Math.max(1, Math.min(100, waterLevelPercent)),
    waterPresent: true,
    tdsPpm: value('tdsPpm'),
    tdsReadingValid: true,
    turbidity: value('turbidity'),
    turbidityReadingValid: true,
    ph: (() => {
      const ph = value('ph');
      return ph === undefined ? undefined : Math.min(13.9, Math.max(0.1, ph));
    })(),
    phReadingValid: true,
    filterState: filterInstalled ? (scenario === 'normal' ? 'Active' : 'Inactive') : undefined,
    equipmentStatus: scenario === 'critical' ? 'Fault' : scenario === 'warning' ? 'Warning' : 'Normal',
    mainsPresent: scenario !== 'critical',
    updatedAt: now,
    online: true,
  };
  // RTDB has no undefined; drop absent optional fields as the device would.
  return Object.fromEntries(Object.entries(payload).filter(([, item]) => item !== undefined));
}

export function createSimulatedTelemetry(
  thresholds: EffectiveThresholds,
  scenario: SimulationScenario,
  now = Date.now(),
  profile: { hasFiltrationSystem?: boolean } = {}
): DeviceTelemetry | null {
  // Without temperature and level thresholds there is no contract-valid payload to simulate.
  return normalizeTelemetry(createSimulatedContractPayload(thresholds, scenario, now, profile));
}
