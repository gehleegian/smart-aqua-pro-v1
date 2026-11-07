// DEMO DATA ONLY (Sprint 4 demo, requested): deterministic readings for the
// emulator demo tanks. Never used by the app or the functions.
/** Demo reading for one tank at time t (deterministic, no randomness). */
export function demoReading(kind: 'normal' | 'abnormal', t: number, end: number) {
  const wave = Math.sin(t / (37 * 60_000));
  const base = {
    temperatureC: Number((22 + 0.4 * wave).toFixed(2)), temperatureReadingValid: true,
    waterLevelPercent: Number((86 + wave).toFixed(1)), waterPresent: true,
    ph: Number((7.05 + 0.05 * wave).toFixed(2)), phReadingValid: true,
    tdsPpm: Math.round(240 + 8 * wave), tdsReadingValid: true,
    turbidity: Number((2 + 0.3 * wave).toFixed(2)), turbidityReadingValid: true,
    filterState: 'Active', equipmentStatus: 'Normal', powerStatus: 'Online', online: true,
    updatedAt: t,
  };
  if (kind === 'normal') return base;
  // Tank 2: the last 90 minutes drift out of range (temperature to CRITICAL,
  // turbidity to WARNING), so the demo has open alerts and recommendations.
  const drift = Math.max(0, Math.min(1, (t - (end - 90 * 60_000)) / (60 * 60_000)));
  return {
    ...base,
    temperatureC: Number((base.temperatureC + 5.5 * drift).toFixed(2)),
    turbidity: Number((base.turbidity + 4.5 * drift).toFixed(2)),
    tdsPpm: Math.round(base.tdsPpm + 90 * drift),
  };
}

