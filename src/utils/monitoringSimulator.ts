import type { Aquarium } from '../types/aquarium';
import type { DeviceTelemetry } from '../types/device';
import type { SimulationScenario } from '../types/monitoring';
import { normalizeTelemetry } from './deviceTelemetryParser.ts';

// Dev-only simulator. It builds a raw payload in the device contract shape
// (docs/device-contract.md) and passes it through the same parser used for
// RTDB telemetry, so simulated and live data follow one contract. It is never
// written to Firebase.

function midpoint(minimum: number, maximum: number) {
  return minimum + (maximum - minimum) / 2;
}

export function createSimulatedContractPayload(
  aquarium: Aquarium,
  scenario: SimulationScenario,
  now = Date.now()
): Record<string, unknown> {
  const minPh = aquarium.minPh ?? 6.5;
  const maxPh = aquarium.maxPh ?? 7.5;
  const normal = {
    temperatureC: midpoint(aquarium.minTemp, aquarium.maxTemp),
    waterLevelPercent: Math.min(100, Math.max(aquarium.minLevel + 15, 85)),
    tdsPpm: 220,
    tdsPercent: Math.min(100, Math.max(aquarium.minQuality + 10, 90)),
    turbidity: 2,
    ph: midpoint(minPh, maxPh),
    filterState: aquarium.hasFiltrationSystem === false ? undefined : 'Active' as const,
    equipmentStatus: 'Normal' as const,
    powerStatus: 'Online' as const,
  };

  const scenarioValues = scenario === 'critical'
    ? {
        temperatureC: aquarium.maxTemp + 3,
        waterLevelPercent: Math.max(0, aquarium.minLevel - 15),
        tdsPercent: Math.max(0, aquarium.minQuality - 15),
        turbidity: 12,
        ph: Math.min(14, maxPh + 0.8),
        filterState: aquarium.hasFiltrationSystem === false ? undefined : 'Inactive' as const,
        equipmentStatus: 'Fault' as const,
        powerStatus: 'Power Interruption' as const,
      }
    : scenario === 'warning'
      ? {
          temperatureC: aquarium.maxTemp + 0.8,
          waterLevelPercent: Math.max(0, aquarium.minLevel - 5),
          tdsPercent: Math.max(0, aquarium.minQuality - 5),
          turbidity: 7,
          ph: Math.min(14, maxPh + 0.2),
          filterState: aquarium.hasFiltrationSystem === false ? undefined : 'Inactive' as const,
          equipmentStatus: 'Warning' as const,
          powerStatus: 'Online' as const,
        }
      : {};

  const payload: Record<string, unknown> = {
    ...normal,
    ...scenarioValues,
    temperatureReadingValid: true,
    waterPresent: true,
    tdsReadingValid: true,
    phReadingValid: true,
    turbidityReadingValid: true,
    updatedAt: now,
    online: true,
  };
  // RTDB has no undefined; drop absent optional fields as the device would.
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

export function createSimulatedTelemetry(
  aquarium: Aquarium,
  scenario: SimulationScenario,
  now = Date.now()
): DeviceTelemetry {
  const telemetry = normalizeTelemetry(createSimulatedContractPayload(aquarium, scenario, now));
  if (!telemetry) {
    throw new Error('Simulated payload does not satisfy the device telemetry contract.');
  }
  return telemetry;
}
