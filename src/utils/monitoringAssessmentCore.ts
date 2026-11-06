// Canonical source: smart-aqua-pro-v1/src/utils/monitoringAssessmentCore.ts.
// Mobile carries a checked-in identical copy so both repositories build independently.
// Cross-client contract tests fail if these copies diverge.
export type AssessmentSeverity = 'normal' | 'warning' | 'critical' | 'unavailable';
export type TelemetrySource = 'live' | 'simulated' | 'unavailable';
export type SimulationScenario = 'normal' | 'warning' | 'critical';
export type MonitoringParameter =
  | 'temperature'
  | 'ph'
  | 'turbidity'
  | 'tds'
  | 'waterLevel'
  | 'filtration'
  | 'equipment'
  | 'power';

export type ParameterAssessment = {
  parameter: MonitoringParameter;
  label: string;
  severity: AssessmentSeverity;
  value: number | string | null;
  unit?: string;
  message: string;
  recommendation?: string;
  recommendationRuleId?: string;
  recommendationPriority?: 'review' | 'immediate';
};

export type AquariumConditionAssessment = {
  overallSeverity: AssessmentSeverity;
  source: TelemetrySource;
  assessedAt: number;
  ruleVersion: 'indoor-goldfish-v2';
  parameters: ParameterAssessment[];
  recommendations: string[];
  ruleNotes: string[];
};


type Aquarium = {
  minTemp?: number;
  maxTemp?: number;
  minPh?: number;
  maxPh?: number;
  minLevel?: number;
  minQuality?: number;
  hasFiltrationSystem?: boolean;
};

export const MONITORING_RULE_VERSION = 'indoor-goldfish-v2' as const;

// These margins convert a profile's editable normal limits into severity bands.
// Turbidity remains provisional until the physical sensor is calibrated in NTU.
export const MONITORING_SEVERITY_MARGINS = {
  temperatureCriticalDeltaC: 2,
  phCriticalDelta: 0.5,
  waterLevelCriticalDeltaPercent: 10,
  tdsPurityCriticalDeltaPercent: 10,
  turbidityWarningMaxNtu: 5,
  turbidityCriticalAboveNtu: 10,
} as const;

export type AssessmentTelemetry = {
  temperatureC: number | null;
  temperatureValid: boolean;
  waterLevelPercent: number | null;
  waterLevelValid: boolean;
  tdsPpm: number | null;
  tdsPurityPercent: number | null;
  tdsValid: boolean;
  ph: number | null;
  phValid: boolean;
  turbidity: number | null;
  turbidityValid: boolean;
  /** Device-reported water presence. A 0% level is only trusted when this is explicitly false. */
  waterPresent?: boolean;
  filterState?: 'Active' | 'Inactive';
  equipmentStatus?: 'Normal' | 'Warning' | 'Fault' | 'Unknown';
  powerStatus?: 'Online' | 'Offline' | 'Power Interruption' | 'Unknown';
};

const severityRank: Record<AssessmentSeverity, number> = {
  normal: 0,
  unavailable: 1,
  warning: 2,
  critical: 3,
};

export const MONITORING_RULE_NOTES = [
  'Severity margins are provisional and require project validation.',
  'TDS percentage is a project-specific conversion, not a universal water-purity measure; verify calibration.',
  'Turbidity assessment requires calibrated NTU readings; its thresholds remain provisional.',
  'Filtration feedback indicates operation only, not filtration effectiveness.',
  'Maintenance guidance requires project review before final acceptance.',
] as const;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function bounded(value: unknown, min: number, max: number): value is number {
  return finite(value) && value >= min && value <= max;
}

// Sensor-fault rules (AGENTS.md §5, device contract decision 4). These are not
// water-condition thresholds: they identify values a working sensor cannot
// produce in an indoor aquarium, or well-known driver default/sentinel values.
// A value that matches is treated as a sensor fault: severity "unavailable",
// no water-condition alert, and no maintenance recommendation.
// - pH: 0 (unset/disconnected probe) or outside 0-14.
// - Temperature: 0 C (unset default), 85 C (DS18B20 power-on reset value),
//   -127 C (DallasTemperature DEVICE_DISCONNECTED_C).
// - TDS: 0 ppm (probe out of water or disconnected).
// - Water level: 0% is accepted only when the device also reports waterPresent === false.
export const SENSOR_FAULT_TEMPERATURE_SENTINELS_C = [0, 85, -127] as const;

export type SensorFaultParameter = 'temperature' | 'ph' | 'tds' | 'waterLevel';

export function getSensorFault(
  parameter: SensorFaultParameter,
  value: unknown,
  context: { waterPresent?: boolean } = {}
): string | null {
  if (!finite(value)) return 'missing or malformed value';
  switch (parameter) {
    case 'ph':
      if (value === 0) return 'pH 0 is a sensor default, not a water reading';
      return value < 0 || value > 14 ? 'pH outside the physical 0-14 range' : null;
    case 'temperature':
      return (SENSOR_FAULT_TEMPERATURE_SENTINELS_C as readonly number[]).includes(value)
        ? `temperature ${value} C is a sensor default/disconnected value`
        : null;
    case 'tds':
      if (value < 0) return 'negative TDS';
      return value === 0 ? 'TDS 0 ppm indicates a dry or disconnected probe' : null;
    case 'waterLevel':
      if (value < 0 || value > 100) return 'water level outside 0-100%';
      return value === 0 && context.waterPresent !== false
        ? 'water level 0% without a confirming waterPresent=false'
        : null;
  }
}

export const TELEMETRY_STALE_MS = 30_000;
export const TELEMETRY_EPOCH_FLOOR = 946684800000;

export function getTelemetryFreshness(
  telemetry: { updatedAt?: number; online?: boolean } | null | undefined,
  now = Date.now()
): 'live' | 'offline' | 'unavailable' {
  if (!telemetry || !finite(now) || !finite(telemetry.updatedAt) ||
      telemetry.updatedAt < TELEMETRY_EPOCH_FLOOR || telemetry.updatedAt > now) {
    return 'unavailable';
  }
  if (telemetry.online === false) return 'offline';
  return now - telemetry.updatedAt <= TELEMETRY_STALE_MS ? 'live' : 'offline';
}

export function readTelemetryNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizeDevicePowerStatus(value: unknown): 'Online' | 'Offline' | 'Power Interruption' | 'Unknown' | undefined {
  if (
    value === 'Online' ||
    value === 'Offline' ||
    value === 'Power Interruption' ||
    value === 'Unknown'
  ) {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'online') return 'Online';
  if (normalized === 'offline') return 'Offline';
  if (normalized === 'power_interruption' || normalized === 'power interruption') {
    return 'Power Interruption';
  }
  if (normalized === 'unknown') return 'Unknown';

  return undefined;
}

export function formatWaterLevel(value: unknown, available = true): string {
  return available && bounded(value, 0, 100) ? `${value}%` : '--';
}

function validRange(min: unknown, max: unknown): boolean {
  return finite(min) && finite(max) && min < max;
}

// Preserve the existing maintenance actions. Severity selects urgency and
// ordering; no dosing, diagnoses, automatic actions, or new thresholds are added.
const maintenanceActions: Record<MonitoringParameter, string> = {
  temperature: 'Verify the reading, inspect the tank location and temperature-control equipment, and correct changes gradually.',
  ph: 'Confirm pH with a calibrated test, check source water, and avoid rapid or automatic chemical correction.',
  waterLevel: 'Inspect for leaks or evaporation, verify the level sensor, and restore water using properly conditioned water.',
  tds: 'Verify the TDS reading and calibration, then inspect maintenance history before considering a partial water change.',
  turbidity: 'Confirm sensor calibration, inspect suspended debris, and check filtration performance.',
  filtration: 'Inspect filter power, flow, blockage, and the configured operating schedule.',
  equipment: 'Inspect the affected equipment and keep automatic actuation disabled until operation is verified.',
  power: 'Check primary power and backup power, then verify filtration and aeration operation.',
};

function selectRecommendation(parameter: MonitoringParameter, severity: AssessmentSeverity) {
  if (severity !== 'warning' && severity !== 'critical') return {};
  const critical = severity === 'critical';
  return {
    recommendationRuleId: `${MONITORING_RULE_VERSION}:${parameter}:${severity}`,
    recommendationPriority: critical ? 'immediate' as const : 'review' as const,
    recommendation: `${critical ? 'Critical — verify immediately.' : 'Warning — review and recheck.'} ${maintenanceActions[parameter]}`,
  };
}

function assessment(
  parameter: ParameterAssessment['parameter'],
  label: string,
  severity: AssessmentSeverity,
  value: number | string | null,
  message: string,
  options: { unit?: string } = {}
): ParameterAssessment {
  return { parameter, label, severity, value, message, ...options, ...selectRecommendation(parameter, severity) };
}

function assessTemperature(profile: Aquarium, telemetry: AssessmentTelemetry) {
  if (!telemetry.temperatureValid || telemetry.temperatureC === null) {
    return assessment('temperature', 'Temperature', 'unavailable', null, 'No valid temperature reading is available.');
  }

  if (!validRange(profile.minTemp, profile.maxTemp)) {
    return assessment('temperature', 'Temperature', 'unavailable', null, 'Configure a valid minimum and maximum temperature before assessment.');
  }
  const minTemp = profile.minTemp!;
  const maxTemp = profile.maxTemp!;
  const value = telemetry.temperatureC;
  if (value >= minTemp && value <= maxTemp) {
    return assessment('temperature', 'Temperature', 'normal', value, 'Temperature is within the configured indoor Goldfish range.', { unit: 'C' });
  }

  const critical =
    value <= minTemp - MONITORING_SEVERITY_MARGINS.temperatureCriticalDeltaC ||
    value >= maxTemp + MONITORING_SEVERITY_MARGINS.temperatureCriticalDeltaC;
  return assessment(
    'temperature',
    'Temperature',
    critical ? 'critical' : 'warning',
    value,
    `Temperature is outside the configured ${profile.minTemp}-${profile.maxTemp} C range.`,
    {
      unit: 'C',
    }
  );
}

function assessPh(profile: Aquarium, telemetry: AssessmentTelemetry) {
  if (!telemetry.phValid || telemetry.ph === null) {
    return assessment('ph', 'pH', 'unavailable', null, 'No valid pH reading is available.');
  }
  if (!bounded(profile.minPh, 0, 14) || !bounded(profile.maxPh, 0, 14) || !validRange(profile.minPh, profile.maxPh)) {
    return assessment('ph', 'pH', 'unavailable', telemetry.ph, 'Complete the aquarium pH thresholds before assessment.');
  }

  const value = telemetry.ph;
  if (value >= profile.minPh && value <= profile.maxPh) {
    return assessment('ph', 'pH', 'normal', value, 'pH is within the configured indoor Goldfish range.');
  }

  const critical =
    value <= profile.minPh - MONITORING_SEVERITY_MARGINS.phCriticalDelta ||
    value >= profile.maxPh + MONITORING_SEVERITY_MARGINS.phCriticalDelta;
  return assessment(
    'ph',
    'pH',
    critical ? 'critical' : 'warning',
    value,
    `pH is outside the configured ${profile.minPh}-${profile.maxPh} range.`,
    {}
  );
}

function assessWaterLevel(profile: Aquarium, telemetry: AssessmentTelemetry) {
  if (!telemetry.waterLevelValid || telemetry.waterLevelPercent === null) {
    return assessment('waterLevel', 'Water level', 'unavailable', null, 'No valid water-level reading is available.');
  }

  if (!bounded(profile.minLevel, 0, 100)) {
    return assessment('waterLevel', 'Water level', 'unavailable', null, 'Configure a valid minimum water level before assessment.');
  }
  const value = telemetry.waterLevelPercent;
  if (value >= profile.minLevel) {
    return assessment('waterLevel', 'Water level', 'normal', value, 'Water level is above the configured minimum.', { unit: '%' });
  }

  const critical = value <= Math.max(0, profile.minLevel - MONITORING_SEVERITY_MARGINS.waterLevelCriticalDeltaPercent);
  return assessment('waterLevel', 'Water level', critical ? 'critical' : 'warning', value, `Water level is below the configured ${profile.minLevel}% minimum.`, {
    unit: '%',
  });
}

function assessTds(profile: Aquarium, telemetry: AssessmentTelemetry) {
  if (!telemetry.tdsValid || telemetry.tdsPurityPercent === null) {
    return assessment('tds', 'TDS', 'unavailable', telemetry.tdsPpm, 'No calibrated TDS-purity reading is available.');
  }

  if (!bounded(profile.minQuality, 0, 100)) {
    return assessment('tds', 'TDS', 'unavailable', null, 'Configure a valid minimum TDS percentage before assessment.');
  }
  const purity = telemetry.tdsPurityPercent;
  const displayValue = telemetry.tdsPpm ?? purity;
  const unit = telemetry.tdsPpm === null ? '%' : 'ppm';
  if (purity >= profile.minQuality) {
    return assessment('tds', 'TDS', 'normal', displayValue, 'TDS percentage is above the configured minimum (provisional conversion).', { unit });
  }

  const critical = purity <= Math.max(0, profile.minQuality - MONITORING_SEVERITY_MARGINS.tdsPurityCriticalDeltaPercent);
  return assessment('tds', 'TDS', critical ? 'critical' : 'warning', displayValue, `Calibrated TDS purity is below the configured ${profile.minQuality}% minimum.`, {
    unit,
  });
}

function assessTurbidity(telemetry: AssessmentTelemetry) {
  if (!telemetry.turbidityValid || telemetry.turbidity === null) {
    return assessment('turbidity', 'Turbidity', 'unavailable', null, 'No calibrated turbidity reading is available.');
  }

  const value = telemetry.turbidity;
  if (value <= MONITORING_SEVERITY_MARGINS.turbidityWarningMaxNtu) {
    return assessment('turbidity', 'Turbidity', 'normal', value, 'Turbidity is within the provisional calibrated range.', { unit: 'NTU' });
  }

  const critical = value > MONITORING_SEVERITY_MARGINS.turbidityCriticalAboveNtu;
  return assessment('turbidity', 'Turbidity', critical ? 'critical' : 'warning', value, 'Turbidity is above the provisional calibrated range.', {
    unit: 'NTU',
  });
}

function assessFiltration(profile: Aquarium, telemetry: AssessmentTelemetry) {
  if (profile.hasFiltrationSystem === false) {
    return assessment('filtration', 'Filtration', 'normal', 'Not installed', 'The aquarium profile records no installed filtration system.');
  }
  if (!telemetry.filterState) {
    return assessment('filtration', 'Filtration', 'unavailable', null, 'No filtration operation feedback is available.');
  }
  if (telemetry.filterState === 'Active') {
    return assessment('filtration', 'Filtration', 'normal', telemetry.filterState, 'Filtration reports active operation; this does not establish filtration effectiveness.');
  }
  return assessment('filtration', 'Filtration', 'warning', telemetry.filterState, 'The installed filtration system reports inactive operation.', {
  });
}

function assessEquipment(telemetry: AssessmentTelemetry) {
  if (!telemetry.equipmentStatus || telemetry.equipmentStatus === 'Unknown') {
    return assessment('equipment', 'Equipment', 'unavailable', telemetry.equipmentStatus ?? null, 'Equipment feedback is unavailable.');
  }
  if (telemetry.equipmentStatus === 'Normal') {
    return assessment('equipment', 'Equipment', 'normal', telemetry.equipmentStatus, 'Equipment reports normal operation.');
  }
  const critical = telemetry.equipmentStatus === 'Fault';
  return assessment('equipment', 'Equipment', critical ? 'critical' : 'warning', telemetry.equipmentStatus, `Equipment reports ${telemetry.equipmentStatus.toLowerCase()} status.`, {
  });
}

function assessPower(telemetry: AssessmentTelemetry) {
  if (!telemetry.powerStatus || telemetry.powerStatus === 'Unknown') {
    return assessment('power', 'Power', 'unavailable', telemetry.powerStatus ?? null, 'Power status feedback is unavailable.');
  }
  if (telemetry.powerStatus === 'Online') {
    return assessment('power', 'Power', 'normal', telemetry.powerStatus, 'Primary power reports online.');
  }
  return assessment('power', 'Power', 'critical', telemetry.powerStatus, `Power reports ${telemetry.powerStatus.toLowerCase()}.`, {
  });
}

export function assessAquariumCondition(options: {
  profile: Aquarium;
  telemetry: AssessmentTelemetry | null;
  source: TelemetrySource;
  assessedAt?: number;
}): AquariumConditionAssessment {
  const assessedAt = options.assessedAt ?? Date.now();
  const input = options.source === 'unavailable' ? null : options.telemetry;
  const tdsPpmFault = input && input.tdsPpm !== null && input.tdsPpm !== undefined
    ? getSensorFault('tds', input.tdsPpm)
    : null;
  const telemetry: AssessmentTelemetry = input ? {
    ...input,
    temperatureC: getSensorFault('temperature', input.temperatureC) ? null : input.temperatureC,
    waterLevelPercent: getSensorFault('waterLevel', input.waterLevelPercent, { waterPresent: input.waterPresent })
      ? null
      : input.waterLevelPercent,
    // Purity percent is a conversion of ppm. With no ppm, a bare 0% is treated as an unset default.
    tdsPurityPercent: !tdsPpmFault && bounded(input.tdsPurityPercent, 0, 100) &&
      (input.tdsPurityPercent > 0 || finite(input.tdsPpm))
      ? input.tdsPurityPercent
      : null,
    tdsPpm: finite(input.tdsPpm) && !tdsPpmFault ? input.tdsPpm : null,
    ph: getSensorFault('ph', input.ph) ? null : input.ph,
    turbidity: finite(input.turbidity) && input.turbidity >= 0 ? input.turbidity : null,
    filterState: input.filterState === 'Active' || input.filterState === 'Inactive' ? input.filterState : undefined,
    equipmentStatus: ['Normal', 'Warning', 'Fault'].includes(input.equipmentStatus ?? '') ? input.equipmentStatus : 'Unknown',
    powerStatus: ['Online', 'Offline', 'Power Interruption'].includes(input.powerStatus ?? '') ? input.powerStatus : 'Unknown',
  } : {
    temperatureC: null,
    temperatureValid: false,
    waterLevelPercent: null,
    waterLevelValid: false,
    tdsPpm: null,
    tdsPurityPercent: null,
    tdsValid: false,
    ph: null,
    phValid: false,
    turbidity: null,
    turbidityValid: false,
  };
  const parameters = [
    assessTemperature(options.profile, telemetry),
    assessPh(options.profile, telemetry),
    assessTurbidity(telemetry),
    assessTds(options.profile, telemetry),
    assessWaterLevel(options.profile, telemetry),
    assessFiltration(options.profile, telemetry),
    assessEquipment(telemetry),
    assessPower(telemetry),
  ];
  const overallSeverity = parameters.reduce<AssessmentSeverity>(
    (current, item) => severityRank[item.severity] > severityRank[current] ? item.severity : current,
    'normal'
  );
  const recommendations = Array.from(new Set([...parameters].sort((a, b) => severityRank[b.severity] - severityRank[a.severity]).flatMap((item) => item.recommendation ? [item.recommendation] : [])));

  return {
    overallSeverity: options.source === 'unavailable' && overallSeverity === 'normal' ? 'unavailable' : overallSeverity,
    source: options.source,
    assessedAt,
    ruleVersion: MONITORING_RULE_VERSION,
    parameters,
    recommendations,
    ruleNotes: [...MONITORING_RULE_NOTES],
  };
}
