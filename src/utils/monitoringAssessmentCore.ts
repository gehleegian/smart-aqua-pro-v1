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

// UI-facing view of an engine result (see toConditionAssessment). The values
// here come only from evaluateAquarium() and the rules/thresholds stored in
// Firestore; this file defines no water-condition thresholds.
export type ParameterAssessment = {
  parameter: MonitoringParameter;
  label: string;
  severity: AssessmentSeverity;
  status: ParameterStatus;
  /** True for power/equipment/filter feedback that is Unknown or not reported: shown as "Not monitored". */
  notMonitored: boolean;
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
  /** "rules:draft" while any active rule or threshold is a draft, else "rules:approved". */
  ruleVersion: string;
  /** server = condition summary written by the ingest function; client = browser fallback. */
  origin: 'server' | 'client' | 'none';
  draft: boolean;
  parameters: ParameterAssessment[];
  recommendations: string[];
  matchedRules: MatchedRule[];
  faults: SensorFault[];
  ruleNotes: string[];
};
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

// Device contract (docs/device-contract.md), decision 2: the device sends every
// 15 s; telemetry older than 60 s (3 missed sends) is offline. This is the only
// freshness window; every view, the mobile copy, and the ingest function use it.
export const TELEMETRY_STALE_MS = 60_000;

// Decision 5: a command with no device acknowledgement after this long shows "No response".
export const COMMAND_ACK_TIMEOUT_MS = 30_000;

// Decision 4: a missing <sensor>ReadingValid flag is a sensor fault. The live
// firmware (2026-11) does not send phReadingValid/turbidityReadingValid yet, so
// this stays false until the scheduled firmware switchover
// (docs/migration-live.md); while false, a missing flag falls back to the
// value checks in getSensorFault(). An explicit `false` flag is always a fault.
export const REQUIRE_SENSOR_VALIDITY_FLAGS = false;

export function isSensorFlagValid(flag: unknown, requireFlags = REQUIRE_SENSOR_VALIDITY_FLAGS): boolean {
  if (flag === true) return true;
  if (flag === undefined || flag === null) return !requireFlags;
  return false;
}

export type SensorValidityStatus = 'valid' | 'invalid' | 'missing';
export type SensorValidity = { status: SensorValidityStatus; reason?: string };
export type TelemetryValidity = {
  temperature: SensorValidity;
  ph: SensorValidity;
  tds: SensorValidity;
  turbidity: SensorValidity;
  waterLevel: SensorValidity;
  /** True when no reported sensor is invalid. Missing (not installed / not sent) sensors do not count. */
  allValid: boolean;
};

function sensorValidity(
  parameter: SensorFaultParameter | 'turbidity',
  value: unknown,
  flag: unknown,
  flagName: string | null,
  context: { waterPresent?: boolean; requireFlags?: boolean } = {}
): SensorValidity {
  if (value === undefined || value === null) return { status: 'missing' };
  if (!finite(value)) return { status: 'invalid', reason: 'missing or malformed value' };
  if (flagName && !isSensorFlagValid(flag, context.requireFlags)) {
    return { status: 'invalid', reason: flag === false ? `${flagName} is false` : `${flagName} is missing` };
  }
  const fault = parameter === 'turbidity'
    ? (value < 0 ? 'negative turbidity' : null)
    : getSensorFault(parameter, value, context);
  return fault ? { status: 'invalid', reason: fault } : { status: 'valid' };
}

// Validate a raw device telemetry payload sensor by sensor (AGENTS.md §5).
// Shared by the web/mobile snapshot and the history ingest function.
export function evaluateTelemetryValidity(
  raw: Record<string, unknown>,
  options: { requireFlags?: boolean } = {}
): TelemetryValidity {
  const requireFlags = options.requireFlags ?? REQUIRE_SENSOR_VALIDITY_FLAGS;
  const waterPresent = typeof raw.waterPresent === 'boolean' ? raw.waterPresent : undefined;
  let temperature = sensorValidity('temperature', raw.temperatureC, raw.temperatureReadingValid,
    'temperatureReadingValid', { requireFlags });
  if (temperature.status === 'valid' && waterPresent === false) {
    temperature = { status: 'invalid', reason: 'probe reports no water (waterPresent is false)' };
  }
  const ph = sensorValidity('ph', raw.ph, raw.phReadingValid, 'phReadingValid', { requireFlags });
  const tdsValue = raw.tdsPpm ?? raw.tdsPercent ?? raw.waterQualityPercent;
  let tds = sensorValidity('tds', raw.tdsPpm ?? null, raw.tdsReadingValid, 'tdsReadingValid', { requireFlags });
  if (tds.status === 'missing' && tdsValue !== undefined && tdsValue !== null) {
    // Legacy payloads may carry only a purity percentage.
    tds = !finite(tdsValue) || tdsValue < 0 || tdsValue > 100
      ? { status: 'invalid', reason: 'TDS percentage outside 0-100' }
      : isSensorFlagValid(raw.tdsReadingValid, requireFlags)
        ? (tdsValue === 0 ? { status: 'invalid', reason: 'TDS 0% without a ppm reading' } : { status: 'valid' })
        : { status: 'invalid', reason: raw.tdsReadingValid === false ? 'tdsReadingValid is false' : 'tdsReadingValid is missing' };
  }
  if (tds.status === 'missing' && raw.tdsReadingValid === false) {
    tds = { status: 'invalid', reason: 'tdsReadingValid is false' };
  }
  const turbidity = sensorValidity('turbidity', raw.turbidity, raw.turbidityReadingValid,
    'turbidityReadingValid', { requireFlags });
  const waterLevel = sensorValidity('waterLevel', raw.waterLevelPercent, undefined, null, { waterPresent });
  const all = [temperature, ph, tds, turbidity, waterLevel];
  return { temperature, ph, tds, turbidity, waterLevel, allValid: all.every((item) => item.status !== 'invalid') };
}

// Map a raw device payload plus its validity summary to the shared assessment
// input. Only sensors whose validity is "valid" reach threshold evaluation.
export function buildAssessmentTelemetryFromRaw(
  raw: Record<string, unknown>,
  validity: TelemetryValidity = evaluateTelemetryValidity(raw)
): AssessmentTelemetry {
  const value = (input: unknown) => (finite(input) ? input : null);
  const tdsValid = validity.tds.status === 'valid';
  return {
    temperatureC: value(raw.temperatureC),
    temperatureValid: validity.temperature.status === 'valid',
    waterLevelPercent: value(raw.waterLevelPercent),
    waterLevelValid: validity.waterLevel.status === 'valid',
    waterPresent: typeof raw.waterPresent === 'boolean' ? raw.waterPresent : undefined,
    tdsPpm: tdsValid ? value(raw.tdsPpm) : null,
    tdsPurityPercent: tdsValid ? value(raw.tdsPercent ?? raw.waterQualityPercent) : null,
    tdsValid,
    ph: value(raw.ph),
    phValid: validity.ph.status === 'valid',
    turbidity: value(raw.turbidity),
    turbidityValid: validity.turbidity.status === 'valid',
    filterState: raw.filterState === 'Active' || raw.filterState === 'Inactive' ? raw.filterState : undefined,
    equipmentStatus: raw.equipmentStatus === 'Normal' || raw.equipmentStatus === 'Warning' ||
      raw.equipmentStatus === 'Fault' || raw.equipmentStatus === 'Unknown' ? raw.equipmentStatus : undefined,
    powerStatus: normalizeDevicePowerStatus(raw.powerStatus),
  };
}

export type CommandStatus = 'none' | 'pending' | 'done' | 'failed' | 'no_response';

// Decision 5: pending -> done/failed from commandAck/latest, or "No response" after COMMAND_ACK_TIMEOUT_MS.
export function getCommandStatus(
  command: { commandId?: unknown; requestedAt?: unknown } | null | undefined,
  ack: { commandId?: unknown; status?: unknown } | null | undefined,
  now = Date.now()
): CommandStatus {
  if (!command || typeof command.commandId !== 'string' || !finite(command.requestedAt)) return 'none';
  if (ack && ack.commandId === command.commandId && (ack.status === 'done' || ack.status === 'failed')) {
    return ack.status;
  }
  return now - command.requestedAt > COMMAND_ACK_TIMEOUT_MS ? 'no_response' : 'pending';
}
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


// ===========================================================================
// Rule engine (Sprint 2). See docs/rule-engine.md.
// Pure functions only: the web app, the mobile copy and the Cloud Functions
// run the same code. All thresholds and IF-THEN rules are DATA (Firestore
// `species` and `rules`); nothing below hard-codes a water-condition limit.
// ===========================================================================

export const WATER_PARAMETERS = ['temperatureC', 'ph', 'tdsPpm', 'turbidity', 'waterLevelPercent'] as const;
export type WaterParameter = typeof WATER_PARAMETERS[number];
export const STATUS_PARAMETERS = ['power', 'equipment', 'filter'] as const;
export const RULE_PARAMETERS = [...WATER_PARAMETERS, ...STATUS_PARAMETERS, 'device', 'maintenance'] as const;
export type RuleParameter = typeof RULE_PARAMETERS[number];
export type ConditionSeverity = 'normal' | 'warning' | 'critical';
/** not_monitored: power/equipment/filter feedback is Unknown or absent. It never blocks the overall condition. */
export type ParameterStatus = ConditionSeverity | 'unavailable' | 'not_monitored';
export type ApprovalStatus = 'draft' | 'approved';
export type ApprovalMeta = {
  status: ApprovalStatus;
  /** Citation for the value, or "TBD". */
  source: string;
  approvedBy: string | null;
  approvedAt: number | null;
};
export type RangeThreshold = { min?: number; max?: number };
export type ThresholdSet = Partial<Record<WaterParameter, RangeThreshold>>;
export type BioloadLevel = 'light' | 'moderate' | 'heavy';
export const BIOLOAD_LEVELS: readonly BioloadLevel[] = ['light', 'moderate', 'heavy'];

export type SpeciesConfig = ApprovalMeta & {
  speciesId: string;
  name: string;
  ranges: {
    temperatureC?: RangeThreshold;
    ph?: RangeThreshold;
    tdsPpm?: RangeThreshold;
    turbidity?: RangeThreshold;
  };
  minWaterLevelPercent?: number;
  /** Bioload bands on stocking density (g of fish per L of working water). See docs/bioload.md. */
  bioloadBandsGPerL?: { lightMax: number; moderateMax: number };
  cleaningIntervalDays?: Partial<Record<BioloadLevel, number>>;
  earlyCleaning?: { tdsRisePct: number; turbidityWarningCount: number; turbidityWindowHours: number };
};

export type CompareOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
const COMPARE_OPS: readonly CompareOp[] = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'];
export type RuleCondition = {
  op: CompareOp;
  /** Compare against the aquarium's effective threshold (min or max) for the rule's parameter. */
  ref?: 'min' | 'max';
  /** Compare against a literal (status parameters, or a fixed numeric value). */
  value?: number | string | boolean;
  /** Widen the threshold: gt/gte move it up, lt/lte move it down, by this % of the threshold. */
  marginPct?: number;
  /** Same as marginPct but in the parameter's own unit. marginPct wins if both are set. */
  margin?: number;
};
export type ExtraCheck = { field: string; op: CompareOp; value: number | string | boolean };
export type RuleConfig = ApprovalMeta & {
  ruleId: string;
  parameter: RuleParameter;
  severity: 'warning' | 'critical';
  condition: RuleCondition;
  extraChecks: ExtraCheck[];
  /** Lower number = considered first. Ties break on ruleId. */
  priority: number;
  title: string;
  action: string;
  basis: string;
  preCheck: string;
  enabled: boolean;
};

export type EngineProfile = {
  hasFiltrationSystem?: boolean;
  bioloadLevel?: BioloadLevel | null;
  fishCount?: number;
  /** Only set by the heartbeat check: evaluates the `device` rules. */
  deviceState?: 'online' | 'offline';
};

export type MatchedRule = {
  ruleId: string;
  /** The parameter the finding is about (for a sensor fault: the faulty sensor). */
  parameter: RuleParameter;
  severity: 'warning' | 'critical';
  priority: number;
  title: string;
  action: string;
  basis: string;
  preCheck: string;
  issueDetected: string;
  approvalStatus: ApprovalStatus;
  source: string;
};
export type SensorFault = { parameter: WaterParameter; reason: string };
export type ParameterResult = {
  parameter: RuleParameter;
  status: ParameterStatus;
  value: number | string | null;
  unit?: string;
  ruleId?: string;
  reason?: string;
};
export type EngineResult = {
  overall: ConditionSeverity | 'unavailable';
  perParameter: ParameterResult[];
  matchedRules: MatchedRule[];
  faults: SensorFault[];
  /** True while the thresholds or any enabled rule are still drafts. */
  draft: boolean;
  /** "<parameter>:<severity>" combinations classified abnormal with no matching rule (AGENTS.md §7: report, don't invent). */
  missingRules: string[];
};

export type EffectiveThresholds = {
  values: ThresholdSet;
  speciesId: string | null;
  status: ApprovalStatus;
  overridden: WaterParameter[];
  missing: WaterParameter[];
};

export const PARAMETER_LABELS: Record<RuleParameter, { label: string; unit?: string }> = {
  temperatureC: { label: 'Temperature', unit: '°C' },
  ph: { label: 'pH' },
  tdsPpm: { label: 'TDS', unit: 'ppm' },
  turbidity: { label: 'Turbidity', unit: 'NTU' },
  waterLevelPercent: { label: 'Water level', unit: '%' },
  power: { label: 'Power' },
  equipment: { label: 'Equipment' },
  filter: { label: 'Filtration' },
  device: { label: 'Device' },
  maintenance: { label: 'Maintenance' },
};

const VALIDITY_KEY: Record<WaterParameter, keyof Omit<TelemetryValidity, 'allValid'>> = {
  temperatureC: 'temperature',
  ph: 'ph',
  tdsPpm: 'tds',
  turbidity: 'turbidity',
  waterLevelPercent: 'waterLevel',
};

const conditionRank: Record<ConditionSeverity, number> = { normal: 0, warning: 1, critical: 2 };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readApproval(data: Record<string, unknown>): ApprovalMeta {
  return {
    status: data.status === 'approved' ? 'approved' : 'draft',
    source: readText(data.source) ?? 'TBD',
    approvedBy: readText(data.approvedBy),
    approvedAt: finite(data.approvedAt) ? data.approvedAt : null,
  };
}

function readRange(value: unknown): RangeThreshold | undefined {
  if (!isPlainObject(value)) return undefined;
  const range: RangeThreshold = {};
  if (finite(value.min)) range.min = value.min;
  if (finite(value.max)) range.max = value.max;
  if (range.min !== undefined && range.max !== undefined && range.min >= range.max) return undefined;
  return range.min === undefined && range.max === undefined ? undefined : range;
}

/** Parse a Firestore `species` document. Returns null when it is unusable. */
export function normalizeSpeciesConfig(speciesId: string, data: unknown): SpeciesConfig | null {
  if (!isPlainObject(data)) return null;
  const ranges = isPlainObject(data.ranges) ? data.ranges : {};
  const bands = isPlainObject(data.bioloadBandsGPerL) ? data.bioloadBandsGPerL : null;
  const intervals = isPlainObject(data.cleaningIntervalDays) ? data.cleaningIntervalDays : {};
  const early = isPlainObject(data.earlyCleaning) ? data.earlyCleaning : null;
  const cleaningIntervalDays: Partial<Record<BioloadLevel, number>> = {};
  for (const level of BIOLOAD_LEVELS) {
    if (finite(intervals[level]) && intervals[level] > 0) cleaningIntervalDays[level] = intervals[level];
  }
  return {
    ...readApproval(data),
    speciesId,
    name: readText(data.name) ?? speciesId,
    ranges: {
      temperatureC: readRange(ranges.temperatureC),
      ph: readRange(ranges.ph),
      tdsPpm: readRange(ranges.tdsPpm),
      turbidity: readRange(ranges.turbidity),
    },
    minWaterLevelPercent: bounded(data.minWaterLevelPercent, 0, 100) ? data.minWaterLevelPercent : undefined,
    bioloadBandsGPerL: bands && finite(bands.lightMax) && finite(bands.moderateMax) && bands.lightMax < bands.moderateMax
      ? { lightMax: bands.lightMax, moderateMax: bands.moderateMax }
      : undefined,
    cleaningIntervalDays,
    earlyCleaning: early && finite(early.tdsRisePct) && finite(early.turbidityWarningCount) && finite(early.turbidityWindowHours)
      ? { tdsRisePct: early.tdsRisePct, turbidityWarningCount: early.turbidityWarningCount, turbidityWindowHours: early.turbidityWindowHours }
      : undefined,
  };
}

function readCondition(value: unknown): RuleCondition | null {
  if (!isPlainObject(value) || !COMPARE_OPS.includes(value.op as CompareOp)) return null;
  const condition: RuleCondition = { op: value.op as CompareOp };
  if (value.ref === 'min' || value.ref === 'max') condition.ref = value.ref;
  if (typeof value.value === 'number' || typeof value.value === 'string' || typeof value.value === 'boolean') {
    condition.value = value.value;
  }
  if (finite(value.marginPct) && value.marginPct >= 0) condition.marginPct = value.marginPct;
  if (finite(value.margin) && value.margin >= 0) condition.margin = value.margin;
  if (condition.ref === undefined && condition.value === undefined) return null;
  return condition;
}

/** Parse a Firestore `rules` document. Returns null when it is unusable (it is then ignored). */
export function normalizeRuleConfig(ruleId: string, data: unknown): RuleConfig | null {
  if (!isPlainObject(data)) return null;
  const parameter = data.parameter as RuleParameter;
  const condition = readCondition(data.condition);
  if (!RULE_PARAMETERS.includes(parameter) || !condition) return null;
  if (data.severity !== 'warning' && data.severity !== 'critical') return null;
  const extraChecks = Array.isArray(data.extraChecks)
    ? data.extraChecks.flatMap((check): ExtraCheck[] => {
      if (!isPlainObject(check) || !readText(check.field) || !COMPARE_OPS.includes(check.op as CompareOp)) return [];
      if (typeof check.value !== 'number' && typeof check.value !== 'string' && typeof check.value !== 'boolean') return [];
      return [{ field: readText(check.field)!, op: check.op as CompareOp, value: check.value }];
    })
    : [];
  return {
    ...readApproval(data),
    ruleId,
    parameter,
    severity: data.severity,
    condition,
    extraChecks,
    priority: finite(data.priority) ? data.priority : 100,
    title: readText(data.title) ?? ruleId,
    action: readText(data.action) ?? '',
    basis: readText(data.basis) ?? '',
    preCheck: readText(data.preCheck) ?? '',
    enabled: data.enabled !== false,
  };
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** The species config for an aquarium: an explicit `speciesId`, else the first listed species whose slug has a config. */
export function selectSpeciesConfig(
  aquarium: { speciesId?: unknown; species?: unknown },
  speciesById: Record<string, SpeciesConfig>
): SpeciesConfig | null {
  const explicit = readText(aquarium.speciesId);
  if (explicit && speciesById[explicit]) return speciesById[explicit];
  const names = Array.isArray(aquarium.species) ? aquarium.species : [];
  for (const name of names) {
    if (typeof name !== 'string') continue;
    const config = speciesById[slugify(name)];
    if (config) return config;
  }
  return null;
}

/**
 * Effective thresholds = the species defaults, then the aquarium's own
 * `thresholdOverrides` (per parameter, per bound). Nothing else.
 */
export function resolveThresholds(species: SpeciesConfig | null, overrides?: unknown): EffectiveThresholds {
  const values: ThresholdSet = {};
  if (species) {
    for (const key of ['temperatureC', 'ph', 'tdsPpm', 'turbidity'] as const) {
      if (species.ranges[key]) values[key] = { ...species.ranges[key] };
    }
    if (species.minWaterLevelPercent !== undefined) values.waterLevelPercent = { min: species.minWaterLevelPercent };
  }
  const overridden: WaterParameter[] = [];
  if (isPlainObject(overrides)) {
    for (const key of WATER_PARAMETERS) {
      const override = isPlainObject(overrides[key]) ? overrides[key] : null;
      if (!override) continue;
      const merged: RangeThreshold = { ...values[key] };
      if (finite(override.min)) merged.min = override.min;
      if (finite(override.max)) merged.max = override.max;
      if (merged.min !== undefined && merged.max !== undefined && merged.min >= merged.max) continue;
      values[key] = merged;
      overridden.push(key);
    }
  }
  return {
    values,
    speciesId: species?.speciesId ?? null,
    status: species?.status ?? 'draft',
    overridden,
    missing: WATER_PARAMETERS.filter((key) => !values[key]),
  };
}

/**
 * Per-aquarium overrides stored on the aquarium doc. `thresholdOverrides`
 * (camelCase, per parameter) wins; otherwise the existing profile limits
 * (minTemp/maxTemp/minPh/maxPh/minLevel) are used as overrides so the owner's
 * saved limits keep working. minQuality (TDS purity %) has no ppm equivalent
 * and is not used by the engine.
 */
export function readAquariumOverrides(aquarium: Record<string, unknown>): Partial<Record<WaterParameter, RangeThreshold>> {
  if (isPlainObject(aquarium.thresholdOverrides)) {
    return aquarium.thresholdOverrides as Partial<Record<WaterParameter, RangeThreshold>>;
  }
  const overrides: Partial<Record<WaterParameter, RangeThreshold>> = {};
  const pair = (min: unknown, max: unknown, lo: number, hi: number): RangeThreshold | null =>
    bounded(min, lo, hi) && bounded(max, lo, hi) && min < max ? { min, max } : null;
  const temperature = pair(aquarium.minTemp, aquarium.maxTemp, -10, 60);
  if (temperature) overrides.temperatureC = temperature;
  const ph = pair(aquarium.minPh, aquarium.maxPh, 0, 14);
  if (ph) overrides.ph = ph;
  if (bounded(aquarium.minLevel, 0, 100) && aquarium.minLevel > 0) overrides.waterLevelPercent = { min: aquarium.minLevel };
  return overrides;
}

/** mainsPresent (new, additive) wins over the device-reported powerStatus. */
export function derivePowerStatus(raw: Record<string, unknown>): 'Online' | 'Offline' | 'Power Interruption' | 'Unknown' | undefined {
  if (raw.mainsPresent === false) return 'Power Interruption';
  if (raw.mainsPresent === true) return 'Online';
  return normalizeDevicePowerStatus(raw.powerStatus);
}

function compare(op: CompareOp, left: unknown, right: unknown): boolean {
  if (op === 'eq') return left === right;
  if (op === 'neq') return left !== right;
  if (!finite(left) || !finite(right)) return false;
  switch (op) {
    case 'gt': return left > right;
    case 'gte': return left >= right;
    case 'lt': return left < right;
    case 'lte': return left <= right;
  }
}

function round6(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

/** The numeric limit a threshold condition compares against, or null if the threshold is missing. */
export function conditionTarget(condition: RuleCondition, threshold: RangeThreshold | undefined): number | null {
  if (!condition.ref) return finite(condition.value) ? condition.value : null;
  const base = threshold?.[condition.ref];
  if (!finite(base)) return null;
  const margin = condition.marginPct !== undefined
    ? Math.abs(base) * condition.marginPct / 100
    : condition.margin ?? 0;
  const direction = condition.op === 'gt' || condition.op === 'gte' ? 1 : condition.op === 'lt' || condition.op === 'lte' ? -1 : 0;
  return round6(base + direction * margin);
}

export function conditionMatches(condition: RuleCondition, value: unknown, threshold?: RangeThreshold): boolean {
  if (condition.ref) {
    const target = conditionTarget(condition, threshold);
    return target !== null && compare(condition.op, value, target);
  }
  return compare(condition.op, value, condition.value);
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function formatWithUnit(value: unknown, unit?: string) {
  const text = finite(value) ? formatNumber(value) : String(value);
  return unit ? `${text}${unit === '%' ? '%' : ` ${unit}`}` : text;
}

function describeIssue(rule: RuleConfig, parameter: RuleParameter, value: unknown, threshold?: RangeThreshold) {
  const { label, unit } = PARAMETER_LABELS[parameter];
  if (!rule.condition.ref) return `${label} reports ${formatWithUnit(value, unit)}.`;
  const base = threshold?.[rule.condition.ref];
  const above = rule.condition.op === 'gt' || rule.condition.op === 'gte';
  const bound = rule.condition.ref === 'max' ? 'maximum' : 'minimum';
  const margin = rule.condition.marginPct ? `more than ${formatNumber(rule.condition.marginPct)}% ` : rule.condition.margin ? `more than ${formatWithUnit(rule.condition.margin, unit)} ` : '';
  return `${label} ${formatWithUnit(value, unit)} is ${margin}${above ? 'above' : 'below'} the ${formatWithUnit(base, unit)} ${bound}.`;
}

function toMatchedRule(rule: RuleConfig, parameter: RuleParameter, issueDetected: string): MatchedRule {
  return {
    ruleId: rule.ruleId,
    parameter,
    severity: rule.severity,
    priority: rule.priority,
    title: rule.title,
    action: rule.action,
    basis: rule.basis,
    preCheck: rule.preCheck,
    issueDetected,
    approvalStatus: rule.status,
    source: rule.source,
  };
}

function byPriority(a: RuleConfig, b: RuleConfig) {
  return a.priority - b.priority || a.ruleId.localeCompare(b.ruleId);
}

function extraChecksPass(rule: RuleConfig, context: Record<string, unknown>) {
  return rule.extraChecks.every((check) => compare(check.op, context[check.field], check.value));
}

type Classification = { status: ConditionSeverity; rule: RuleConfig | null; missing: boolean };

/**
 * Classify one value. Severity = the highest severity among enabled rules for
 * this parameter whose `condition` matches (classification uses thresholds
 * only). The recommendation = the highest-priority rule at that severity whose
 * `extraChecks` also pass (equipment, profile, bioload).
 */
function classify(
  parameter: RuleParameter,
  value: unknown,
  threshold: RangeThreshold | undefined,
  rules: RuleConfig[],
  context: Record<string, unknown>
): Classification {
  const matching = rules.filter((rule) => rule.parameter === parameter && conditionMatches(rule.condition, value, threshold));
  if (matching.length === 0) return { status: 'normal', rule: null, missing: false };
  const severity = matching.some((rule) => rule.severity === 'critical') ? 'critical' : 'warning';
  const candidates = matching.filter((rule) => rule.severity === severity && extraChecksPass(rule, context)).sort(byPriority);
  return { status: severity, rule: candidates[0] ?? null, missing: candidates.length === 0 };
}

function hasThreshold(threshold: RangeThreshold | undefined) {
  return Boolean(threshold && (threshold.min !== undefined || threshold.max !== undefined));
}

/**
 * Evaluate one telemetry reading (AGENTS.md §5–§8):
 * 1. validity (Sprint 1) — invalid sensors become faults, never water findings;
 * 2. classify each valid parameter NORMAL / WARNING / CRITICAL against the thresholds;
 * 3. match rules, applying extraChecks against the reading, equipment and profile;
 * 4. pick the highest-priority rule per parameter.
 * The overall condition comes only from valid water parameters plus known
 * power/equipment/filter faults. Unknown or missing status is "not monitored".
 */
export function evaluateAquarium(
  reading: Record<string, unknown> | null,
  thresholds: EffectiveThresholds,
  rules: RuleConfig[],
  profile: EngineProfile = {}
): EngineResult {
  const enabled = rules.filter((rule) => rule.enabled);
  const draft = thresholds.status === 'draft' || enabled.some((rule) => rule.status === 'draft');
  const perParameter: ParameterResult[] = [];
  const matchedRules: MatchedRule[] = [];
  const faults: SensorFault[] = [];
  const missingRules: string[] = [];
  const raw = reading ?? {};
  const validity = evaluateTelemetryValidity(raw);
  const powerStatus = derivePowerStatus(raw);
  const filterState = raw.filterState === 'Active' || raw.filterState === 'Inactive' ? raw.filterState : undefined;
  const equipmentStatus = raw.equipmentStatus === 'Normal' || raw.equipmentStatus === 'Warning' ||
    raw.equipmentStatus === 'Fault' ? raw.equipmentStatus : undefined;
  const context: Record<string, unknown> = {
    ...raw,
    powerStatus,
    filterState,
    equipmentStatus,
    hasFiltrationSystem: profile.hasFiltrationSystem,
    bioloadLevel: profile.bioloadLevel ?? undefined,
    fishCount: profile.fishCount,
  };

  const record = (parameter: RuleParameter, value: unknown, outcome: Classification, threshold?: RangeThreshold) => {
    const { unit } = PARAMETER_LABELS[parameter];
    const result: ParameterResult = { parameter, status: outcome.status, value: finite(value) || typeof value === 'string' ? value : null };
    if (unit) result.unit = unit;
    if (outcome.rule) {
      result.ruleId = outcome.rule.ruleId;
      matchedRules.push(toMatchedRule(outcome.rule, parameter, describeIssue(outcome.rule, parameter, value, threshold)));
    }
    if (outcome.missing) {
      missingRules.push(`${parameter}:${outcome.status}`);
      result.reason = 'no rule matches this condition';
    }
    perParameter.push(result);
  };

  const faultRule = enabled.filter((rule) => rule.parameter === 'device' && rule.condition.value === 'sensor_fault').sort(byPriority)[0];

  if (reading) {
    for (const parameter of WATER_PARAMETERS) {
      const sensor = validity[VALIDITY_KEY[parameter]];
      const value = raw[parameter];
      const { unit } = PARAMETER_LABELS[parameter];
      if (sensor.status === 'invalid') {
        const reason = sensor.reason ?? 'invalid reading';
        faults.push({ parameter, reason });
        perParameter.push({ parameter, status: 'unavailable', value: null, ...(unit ? { unit } : {}), reason: `sensor fault: ${reason}` });
        if (faultRule) {
          const label = PARAMETER_LABELS[parameter].label;
          matchedRules.push({
            ...toMatchedRule(faultRule, parameter, `${label} sensor fault: ${reason}.`),
            action: faultRule.action.replaceAll('{sensor}', parameter === 'ph' ? 'pH' : label.toLowerCase()),
          });
        } else {
          missingRules.push(`${parameter}:sensor_fault`);
        }
        continue;
      }
      if (sensor.status === 'missing' || !finite(value)) {
        perParameter.push({ parameter, status: 'unavailable', value: null, ...(unit ? { unit } : {}), reason: 'not reported' });
        continue;
      }
      const threshold = thresholds.values[parameter];
      if (!hasThreshold(threshold)) {
        perParameter.push({ parameter, status: 'unavailable', value, ...(unit ? { unit } : {}), reason: 'threshold missing' });
        continue;
      }
      record(parameter, value, classify(parameter, value, threshold, enabled, context), threshold);
    }

    const statusValues: Record<'power' | 'equipment' | 'filter', unknown> = {
      power: powerStatus === 'Unknown' ? undefined : powerStatus,
      equipment: equipmentStatus,
      filter: profile.hasFiltrationSystem === false ? undefined : filterState,
    };
    for (const parameter of STATUS_PARAMETERS) {
      const value = statusValues[parameter];
      if (value === undefined) {
        perParameter.push({
          parameter,
          status: 'not_monitored',
          value: parameter === 'filter' && profile.hasFiltrationSystem === false ? 'Not installed' : null,
          reason: parameter === 'filter' && profile.hasFiltrationSystem === false ? 'no filtration system in the profile' : 'status not reported',
        });
        continue;
      }
      record(parameter, value, classify(parameter, value, undefined, enabled, context));
    }
  }

  if (profile.deviceState) {
    record('device', profile.deviceState, classify('device', profile.deviceState, undefined, enabled, context));
  }

  const isWater = (parameter: RuleParameter) => (WATER_PARAMETERS as readonly string[]).includes(parameter);
  let overall: ConditionSeverity | 'unavailable' = 'normal';
  for (const item of perParameter) {
    if (item.parameter === 'device' || item.parameter === 'maintenance') continue;
    if (item.status === 'normal' || item.status === 'warning' || item.status === 'critical') {
      if (conditionRank[item.status] > conditionRank[overall as ConditionSeverity]) overall = item.status;
    }
  }
  const waterAssessed = perParameter.some((item) => isWater(item.parameter) &&
    (item.status === 'normal' || item.status === 'warning' || item.status === 'critical'));
  if (!waterAssessed && overall === 'normal') overall = 'unavailable';

  matchedRules.sort((a, b) => conditionRank[b.severity] - conditionRank[a.severity] || a.priority - b.priority);
  return { overall, perParameter, matchedRules, faults, draft, missingRules };
}

/** Stable fingerprint of a result; history and the condition summary are rewritten when it changes. */
export function conditionSignature(result: EngineResult): string {
  return result.perParameter
    .filter((item) => item.parameter !== 'device')
    .map((item) => `${item.parameter}=${item.status}${item.ruleId ? `@${item.ruleId}` : ''}`)
    .join('|');
}

/**
 * The dashboard trusts the server condition summary while it is younger than
 * this (one history sampling interval plus the offline window); older than
 * that, it falls back to evaluating in the browser.
 */
export const CONDITION_SUMMARY_MAX_AGE_MS = 5 * 60_000 + TELEMETRY_STALE_MS;

export type ConditionSummary = {
  overall: ConditionSeverity | 'unavailable';
  perParameter: ParameterResult[];
  matchedRules: MatchedRule[];
  faults: SensorFault[];
  draft: boolean;
  signature: string;
  evaluatedAt: number;
  readingUpdatedAt: number | null;
};

export function toConditionSummary(result: EngineResult, evaluatedAt: number, readingUpdatedAt: number | null): ConditionSummary {
  return {
    overall: result.overall,
    perParameter: result.perParameter,
    matchedRules: result.matchedRules,
    faults: result.faults,
    draft: result.draft,
    signature: conditionSignature(result),
    evaluatedAt,
    readingUpdatedAt,
  };
}

const LEGACY_PARAMETER: Partial<Record<RuleParameter, MonitoringParameter>> = {
  temperatureC: 'temperature',
  ph: 'ph',
  turbidity: 'turbidity',
  tdsPpm: 'tds',
  waterLevelPercent: 'waterLevel',
  filter: 'filtration',
  equipment: 'equipment',
  power: 'power',
};

function parameterMessage(item: ParameterResult, rule?: MatchedRule) {
  if (rule) return rule.issueDetected;
  switch (item.status) {
    case 'normal': return `${PARAMETER_LABELS[item.parameter].label} is within the configured range.`;
    case 'not_monitored': return item.value === 'Not installed' ? 'Not installed (aquarium profile).' : 'Not monitored: the device does not report this status yet.';
    case 'unavailable': return item.reason ? `Unavailable: ${item.reason}.` : 'Unavailable.';
    default: return `${PARAMETER_LABELS[item.parameter].label} is ${item.status}.`;
  }
}

/** Map an engine result (or a stored condition summary) to the shape the dashboard components render. */
export function toConditionAssessment(
  result: Pick<EngineResult, 'overall' | 'perParameter' | 'faults' | 'draft'> & { matchedRules?: MatchedRule[] },
  meta: { source: TelemetrySource; assessedAt: number; origin: 'server' | 'client' | 'none'; notes?: string[] }
): AquariumConditionAssessment {
  const matchedRules = result.matchedRules ?? [];
  const parameters: ParameterAssessment[] = result.perParameter.flatMap((item) => {
    const legacy = LEGACY_PARAMETER[item.parameter];
    if (!legacy) return [];
    const rule = matchedRules.find((candidate) => candidate.parameter === item.parameter && candidate.ruleId === item.ruleId);
    const severity: AssessmentSeverity = item.status === 'not_monitored' ? 'unavailable' : item.status;
    return [{
      parameter: legacy,
      label: PARAMETER_LABELS[item.parameter].label,
      severity,
      status: item.status,
      notMonitored: item.status === 'not_monitored',
      value: item.value,
      ...(item.unit ? { unit: item.unit } : {}),
      message: parameterMessage(item, rule),
      ...(rule ? {
        recommendation: rule.action,
        recommendationRuleId: rule.ruleId,
        recommendationPriority: rule.severity === 'critical' ? 'immediate' as const : 'review' as const,
      } : {}),
    }];
  });
  const notes = [...(meta.notes ?? [])];
  if (result.draft) notes.unshift('Thresholds and rules are DRAFT values awaiting adviser approval.');
  return {
    overallSeverity: meta.source === 'unavailable' ? 'unavailable' : result.overall,
    source: meta.source,
    assessedAt: meta.assessedAt,
    ruleVersion: result.draft ? 'rules:draft' : 'rules:approved',
    origin: meta.origin,
    draft: result.draft,
    parameters,
    recommendations: Array.from(new Set(matchedRules.map((rule) => rule.action).filter(Boolean))),
    matchedRules,
    faults: result.faults,
    ruleNotes: notes,
  };
}

// ---------------------------------------------------------------------------
// Alert lifecycle (dedup, cooldown, auto-resolve). Pure planner: the ingest
// and heartbeat functions apply the returned operations in a transaction.
// ---------------------------------------------------------------------------

/** Don't reopen an alert for the same parameter within this long after it auto-resolved. */
export const ALERT_COOLDOWN_MS = 15 * 60_000;
/** Consecutive NORMAL evaluations that auto-resolve an open alert. */
export const AUTO_RESOLVE_NORMAL_COUNT = 3;
/** A repeat at the same severity bumps occurrences/lastSeenAt at most this often (write budget). */
export const ALERT_TOUCH_INTERVAL_MS = 5 * 60_000;

export type AlertEntryState = {
  alertId: string | null;
  recommendationId: string | null;
  severity: 'warning' | 'critical' | null;
  ruleId: string | null;
  normalStreak: number;
  lastTouchedAt: number | null;
  /** When the last alert for this key auto-resolved (cooldown start). */
  resolvedAt: number | null;
};

export type AlertFinding = {
  /** Dedup key within the aquarium: the parameter, `sensor_fault:<parameter>`, or `device`. */
  key: string;
  parameter: RuleParameter;
  state: 'abnormal' | 'normal' | 'unknown';
  severity?: 'warning' | 'critical';
  rule?: MatchedRule;
};

export type AlertOperation =
  | { kind: 'open'; key: string; parameter: RuleParameter; alertId: string; recommendationId: string | null; severity: 'warning' | 'critical'; rule?: MatchedRule }
  | { kind: 'escalate' | 'change'; key: string; parameter: RuleParameter; alertId: string; severity: 'warning' | 'critical'; rule?: MatchedRule; notify: boolean; recommendationId: string | null; supersededRecommendationId: string | null }
  | { kind: 'touch'; key: string; alertId: string }
  | { kind: 'resolve'; key: string; alertId: string; recommendationId: string | null }
  | { kind: 'suppressed'; key: string };

export function emptyAlertEntry(): AlertEntryState {
  return { alertId: null, recommendationId: null, severity: null, ruleId: null, normalStreak: 0, lastTouchedAt: null, resolvedAt: null };
}

/** Findings for the alert planner from an engine result. Unknown = leave any open alert untouched. */
export function buildAlertFindings(result: EngineResult): AlertFinding[] {
  const findings: AlertFinding[] = [];
  for (const item of result.perParameter) {
    if (item.parameter === 'maintenance') continue;
    const rule = result.matchedRules.find((candidate) => candidate.parameter === item.parameter && candidate.ruleId === item.ruleId);
    if (item.status === 'warning' || item.status === 'critical') {
      findings.push({ key: item.parameter, parameter: item.parameter, state: 'abnormal', severity: item.status, rule });
    } else {
      findings.push({ key: item.parameter, parameter: item.parameter, state: item.status === 'normal' ? 'normal' : 'unknown' });
    }
    if ((WATER_PARAMETERS as readonly string[]).includes(item.parameter)) {
      const fault = result.faults.find((candidate) => candidate.parameter === item.parameter);
      const faultRule = fault ? result.matchedRules.find((candidate) => candidate.parameter === item.parameter && candidate.ruleId !== item.ruleId) : undefined;
      const sensorValid = item.status === 'normal' || item.status === 'warning' || item.status === 'critical';
      findings.push({
        key: `sensor_fault:${item.parameter}`,
        parameter: item.parameter,
        state: fault ? 'abnormal' : sensorValid ? 'normal' : 'unknown',
        ...(fault ? { severity: faultRule?.severity ?? 'warning', rule: faultRule } : {}),
      });
    }
  }
  return findings;
}

function alertDocId(aquariumId: string, key: string, now: number) {
  return `${aquariumId}_${key.replace(/[^A-Za-z0-9]+/g, '-')}_${now}`;
}

export function planAlertChanges(options: {
  aquariumId: string;
  entries: Record<string, AlertEntryState>;
  findings: AlertFinding[];
  now: number;
  /** Normal evaluations needed to auto-resolve, per key (default AUTO_RESOLVE_NORMAL_COUNT). */
  resolveAfter?: (key: string) => number;
  cooldownMs?: number;
}): { entries: Record<string, AlertEntryState>; operations: AlertOperation[]; changed: boolean } {
  const { aquariumId, findings, now } = options;
  const cooldownMs = options.cooldownMs ?? ALERT_COOLDOWN_MS;
  const entries: Record<string, AlertEntryState> = {};
  for (const [key, entry] of Object.entries(options.entries)) entries[key] = { ...emptyAlertEntry(), ...entry };
  const operations: AlertOperation[] = [];
  let changed = false;

  for (const finding of findings) {
    const entry = entries[finding.key] ?? emptyAlertEntry();
    const before = JSON.stringify(entry);
    if (finding.state === 'abnormal' && finding.severity) {
      const severity = finding.severity;
      const ruleId = finding.rule?.ruleId ?? null;
      if (entry.alertId) {
        const escalated = entry.severity === null || conditionRank[severity] > conditionRank[entry.severity];
        if (escalated || severity !== entry.severity || ruleId !== entry.ruleId) {
          const newRecommendation = ruleId !== entry.ruleId;
          const recommendationId = newRecommendation ? (finding.rule ? alertDocId(aquariumId, finding.key, now) : null) : entry.recommendationId;
          operations.push({
            kind: escalated ? 'escalate' : 'change',
            key: finding.key,
            parameter: finding.parameter,
            alertId: entry.alertId,
            severity,
            rule: finding.rule,
            notify: escalated,
            recommendationId,
            supersededRecommendationId: newRecommendation ? entry.recommendationId : null,
          });
          Object.assign(entry, { severity, ruleId, recommendationId, lastTouchedAt: now });
        } else if (entry.lastTouchedAt === null || now - entry.lastTouchedAt >= ALERT_TOUCH_INTERVAL_MS) {
          operations.push({ kind: 'touch', key: finding.key, alertId: entry.alertId });
          entry.lastTouchedAt = now;
        }
        entry.normalStreak = 0;
      } else if (entry.resolvedAt !== null && now - entry.resolvedAt < cooldownMs) {
        operations.push({ kind: 'suppressed', key: finding.key });
      } else {
        const alertId = alertDocId(aquariumId, finding.key, now);
        const recommendationId = finding.rule ? alertId : null;
        operations.push({ kind: 'open', key: finding.key, parameter: finding.parameter, alertId, recommendationId, severity, rule: finding.rule });
        Object.assign(entry, { alertId, recommendationId, severity, ruleId, normalStreak: 0, lastTouchedAt: now });
      }
    } else if (finding.state === 'normal' && entry.alertId) {
      entry.normalStreak += 1;
      const needed = options.resolveAfter?.(finding.key) ?? AUTO_RESOLVE_NORMAL_COUNT;
      if (entry.normalStreak >= needed) {
        operations.push({ kind: 'resolve', key: finding.key, alertId: entry.alertId, recommendationId: entry.recommendationId });
        Object.assign(entry, { ...emptyAlertEntry(), resolvedAt: now });
      }
    }
    if (JSON.stringify(entry) !== before) changed = true;
    entries[finding.key] = entry;
  }
  return { entries, operations, changed };
}

// ---------------------------------------------------------------------------
// Bioload and the next-cleaning schedule (rule-based, not prediction).
// Formula and draft values: docs/bioload.md.
// ---------------------------------------------------------------------------

export type BioloadResult = { level: BioloadLevel; densityGPerL: number; totalBiomassG: number };

/**
 * Stocking density = total fish weight (g) / working water volume (L), banded
 * light / moderate / heavy by the species' draft bands. Returns null when the
 * profile is incomplete (weights must be given for every fish).
 */
export function computeBioload(
  profile: { fishCount?: unknown; fishWeightsG?: unknown; workingWaterVolumeLiters?: unknown },
  bands: SpeciesConfig['bioloadBandsGPerL']
): BioloadResult | null {
  if (!bands || !finite(profile.workingWaterVolumeLiters) || profile.workingWaterVolumeLiters <= 0) return null;
  const count = finite(profile.fishCount) ? profile.fishCount : null;
  const weights = Array.isArray(profile.fishWeightsG) ? profile.fishWeightsG : null;
  if (count === null || !weights) return null;
  if (weights.length !== count || !weights.every((weight) => finite(weight) && weight > 0)) return null;
  const totalBiomassG = (weights as number[]).reduce((sum, weight) => sum + weight, 0);
  const densityGPerL = round6(totalBiomassG / profile.workingWaterVolumeLiters);
  const level: BioloadLevel = densityGPerL <= bands.lightMax ? 'light' : densityGPerL <= bands.moderateMax ? 'moderate' : 'heavy';
  return { level, densityGPerL, totalBiomassG };
}

export const DAY_MS = 24 * 60 * 60_000;

export type CleaningReason = 'interval' | 'tds_rise' | 'turbidity_repeat';
export type CleaningSchedule = {
  lastCleanedAt: number;
  intervalDays: number;
  baseDueAt: number;
  nextCleaningDue: number;
  reason: CleaningReason;
  early: boolean;
  due: boolean;
  tdsRisePct: number | null;
  /** Set when an early trigger fired on this evaluation (the caller latches it). */
  newTrigger: { at: number; reason: Exclude<CleaningReason, 'interval'> } | null;
};

export function computeCleaningSchedule(input: {
  now: number;
  lastCleanedAt: number;
  intervalDays: number;
  tdsBaselinePpm: number | null;
  currentTdsPpm: number | null;
  tdsRisePctLimit: number;
  turbidityWarningTimes: number[];
  turbidityWarningCount: number;
  turbidityWindowHours: number;
  /** A previously latched early trigger for the same cleaning cycle. */
  latched?: { at: number; reason: Exclude<CleaningReason, 'interval'> } | null;
}): CleaningSchedule {
  const baseDueAt = input.lastCleanedAt + input.intervalDays * DAY_MS;
  const tdsRisePct = input.tdsBaselinePpm !== null && input.tdsBaselinePpm > 0 && input.currentTdsPpm !== null
    ? round6((input.currentTdsPpm - input.tdsBaselinePpm) / input.tdsBaselinePpm * 100)
    : null;
  const windowStart = input.now - input.turbidityWindowHours * 60 * 60_000;
  const recentTurbidity = input.turbidityWarningTimes.filter((time) => time > windowStart && time <= input.now).length;
  let trigger = input.latched ?? null;
  let newTrigger: CleaningSchedule['newTrigger'] = null;
  if (!trigger && baseDueAt > input.now) {
    if (tdsRisePct !== null && tdsRisePct >= input.tdsRisePctLimit) newTrigger = { at: input.now, reason: 'tds_rise' };
    else if (recentTurbidity >= input.turbidityWarningCount) newTrigger = { at: input.now, reason: 'turbidity_repeat' };
    trigger = newTrigger;
  }
  const early = Boolean(trigger && trigger.at < baseDueAt);
  const nextCleaningDue = early ? trigger!.at : baseDueAt;
  return {
    lastCleanedAt: input.lastCleanedAt,
    intervalDays: input.intervalDays,
    baseDueAt,
    nextCleaningDue,
    reason: early ? trigger!.reason : 'interval',
    early,
    due: nextCleaningDue <= input.now,
    tdsRisePct,
    newTrigger,
  };
}

/** True while any enabled rule or the thresholds are drafts (drives the "Draft thresholds" badge). */
export function hasDraftConfig(rules: RuleConfig[], species: SpeciesConfig | null) {
  return (species?.status ?? 'draft') === 'draft' || rules.some((rule) => rule.enabled && rule.status === 'draft');
}

/** Stored on the aquarium doc by the functions (`cleaning`). */
export type CleaningSummary = {
  status: 'scheduled' | 'unavailable';
  nextCleaningDue: number | null;
  reason: CleaningReason | 'bioload_unknown' | 'no_species_config';
  lastCleanedAt: number | null;
  lastCleanedSource: 'maintenance_actions' | 'createdAt' | null;
  intervalDays: number | null;
  bioloadLevel: BioloadLevel | null;
  evaluatedAt: number;
};
