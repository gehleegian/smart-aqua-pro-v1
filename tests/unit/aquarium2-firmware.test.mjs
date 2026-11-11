import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { firmwarePower } from '../helpers/firmware-power.mjs';

test('Aquarium 2 preserves Aquarium 1 control logic with isolated identity and feed storage', async () => {
  const root = new URL('../../firmware/', import.meta.url);
  // AQ1's explicitly requested compensation is tested separately. Remove only
  // its marked blocks here, so the existing shared control comparison remains.
  const a = (await readFile(new URL('Aquarium1Device/Aquarium1Device.ino', root), 'utf8'))
    .replace(/^[ \t]*\/\/ BEGIN AQ1 COMMAND ACK\r?\n[\s\S]*?^[ \t]*\/\/ END AQ1 COMMAND ACK\r?\n/gm, '')
    .replace(/^[ \t]*\/\/ BEGIN AQ1 LOAD COMPENSATION\r?\n[\s\S]*?^[ \t]*\/\/ END AQ1 LOAD COMPENSATION\r?\n/gm, '');
  // AQ2 ACK/telemetry-failure additions have dedicated behavioral tests below.
  const b = (await readFile(new URL('Aquarium2Device/Aquarium2Device.ino', root), 'utf8'))
    .replace(/^[ \t]*\/\/ BEGIN AQ2 COMMAND RELIABILITY\r?\n[\s\S]*?^[ \t]*\/\/ END AQ2 COMMAND RELIABILITY\r?\n/gm, '');
  const feedRoutine = a.replace(/\r\n/g, '\n').match(/bool runManualFeed\(\) \{[\s\S]*?(?=\nvoid help\(\))/)?.[0];
  assert.ok(feedRoutine);
  const turbConstants = a.match(/constexpr float CLEAR_V[\s\S]*?(?=#ifndef AQUARIUM_TDS_METER_REFERENCE_ENABLED)/)?.[0];
  const turbClassifier = a.match(/  if \(turbV >= 0\.15f[\s\S]*?else turbKnown = false;\r?\n/)?.[0];
  const turbLog = a.match(/  Serial.printf\("Turbidity:[\s\S]*?(?=  if \(PROFILE_LEVEL_ENABLED\))/)?.[0];
  assert.ok(turbConstants && turbClassifier && turbLog);
  const normalizedB = b.replace(/\r\n/g, '\n')
    .replace('#include <esp32-hal-ledc.h>', '#include <ESP32Servo.h>')
    .replace('bool feederPwmAttached = false;', 'Servo feeder;')
    .replace('  stopFeederPwm();\n', '') // disarm now also stops PWM immediately
    .replace(/\/\/ Native core-3 LEDC calls[\s\S]*?(?=\nvoid help\(\))/, feedRoutine.replace(/\r\n/g, '\n'))
    .replace('SERVO_PIN = 23', 'SERVO_PIN = 15')
    .replace('LIGHT_PIN = 15', 'LIGHT_PIN = 16') // owner-selected AQ2 IN4 signal test
    .replace('else Serial.printf("Distance: %.1f cm | level %.1f %% (27.0 empty / 20.2 chosen full)\\n", distanceCm, levelPct);',
      'else Serial.printf("Distance: %.1f cm | level %.1f %% (%.1f empty / %.4f chosen full)\\n", distanceCm, levelPct, EMPTY_CM, FULL_CM);')
    .replace('  if (!feederCalibrationReady()) return; // never run calibration jogs automatically\n', '')
    // Only Aquarium 2's owner-provided different-brand sample classifier differs.
    .replace(/\/\/ Aquarium 2's different-brand probe:[\s\S]*?(?=#ifndef AQUARIUM_TDS_METER_REFERENCE_ENABLED)/, turbConstants.replace(/\r\n/g, '\n'))
    .replace('int turbRaw = 0;\n', '')
    .replace(/void updateTurbidity\([\s\S]*?(?=void sampleSensors\(\))/, '')
    .replace('  turbRaw = analogRead(TURB_PIN);\n  updateTurbidity(turbV, turbRaw >= 4095);\n', '')
    .replace('  phValue = fitPH(phV);\n', '  phValue = fitPH(phV);\n' + turbClassifier.replace(/\r\n/g, '\n'))
    .replace(/  Serial.printf\("Turbidity:[\s\S]*?(?=  if \(PROFILE_LEVEL_ENABLED\))/, turbLog.replace(/\r\n/g, '\n'));
  assert.match(b, /if \(!ledcAttach\(SERVO_PIN, 50, 16\)\)/);
  assert.match(b, /LIGHT_PIN = 15, FILTER_PIN = 17, SERVO_PIN = 23/);
  // AQ1 alone has the owner's requested batch interval/publish guard. Strip
  // only those explicit differences when checking unchanged control logic.
  const commonA = a.replace(/\r\n/g, '\n')
    .replace('FULL_CM = 22.4134f', 'FULL_CM = 20.2f') // AQ1 owner-confirmed full-mark calibration only
    .replace('// Pause between completed batches; do not block cloud command polling.\nconstexpr uint32_t SENSOR_READ_INTERVAL_MS = 10000;\nbool telemetrySamplePending = false;\n', '')
    .replace(/void sampleSensorsIfDue\(\) \{[\s\S]*?\n\}\n\n/, '')
    .replace('  sampleSensorsIfDue();\n  // Keep polling commands between batches, but never re-stamp an old sample.\n  if (!telemetrySamplePending) return true;', '  if (millis() - sampleAt > 15000) sampleSensors();')
    .replace('  if (status == 200) telemetrySamplePending = false;\n', '')
    .replace('  sampleSensorsIfDue();', '  if (!lastSample || millis() - lastSample >= 5000) {\n    sampleSensors();\n    lastSample = millis();\n  }');
  assert.equal(normalizedB, commonA.replace(/Aquarium 1/g, 'Aquarium 2')
    .replace(/AQUARIUM 1/g, 'AQUARIUM 2').replace(/aq1-schedule/g, 'aq2-schedule').replace(/\r\n/g, '\n'));
  const config = await readFile(new URL('Aquarium2Device/Config.h', root), 'utf8');
  assert.match(config, /#include "DeviceIdentity\.h"/);
  assert.match(config, /aquarium2-firmware-secrets\.h/);
  assert.doesNotMatch(config, /SAQ-7K3M-9R2X|aquarium1-firmware-secrets/);
  const example = await readFile(new URL('Aquarium2Device/DeviceIdentity.h.example', root), 'utf8');
  assert.match(example, /REPLACE_WITH_ENCLOSURE_ID/);
  assert.match(config, /POWER_SENSOR_ANALOG = false/);
  const a1Config = await readFile(new URL('Aquarium1Device/Config.h', root), 'utf8');
  assert.match(a1Config, /POWER_SENSOR_ANALOG = true/);
  assert.match(config, /POWER_SIGNAL_ON_V = 0\.0f/);
  assert.match(config, /POWER_SIGNAL_OFF_V = 0\.0f/);
  assert.match(config, /POWER_PRESENT_LEVEL = 0/);
  assert.match(config, /#define AQUARIUM_TDS_METER_REFERENCE_ENABLED 1/);
  assert.match(a1Config, /POWER_SIGNAL_ON_V = 2\.515f/);
  assert.match(a1Config, /PROFILE_LEVEL_ENABLED = false/);
  assert.match(config, /PROFILE_LEVEL_ENABLED = false/);
  const feeder = await readFile(new URL('Aquarium2Device/FeederConfig.h', root), 'utf8');
  assert.match(feeder, /owner-confirmed SG90/);
  for (const setting of ['FEEDER_CALIBRATED = false', 'FEEDER_RETURN_TEST_ENABLED = true', 'FEEDER_STOP_US = 1500', 'FEEDER_FORWARD_MS = 900', 'FEEDER_REVERSE_MS = 900', 'FEEDER_HOLD_MS = 1000', 'FEEDER_COOLDOWN_MS = 5000']) assert.ok(feeder.includes(setting));
  for (const file of ['ScheduleLogic.h', 'ScheduleLogicTests.h', 'EchoFilter.h', 'PowerSignal.h', 'WaterLevel.h']) {
    assert.equal(await readFile(new URL(`Aquarium2Device/${file}`, root), 'utf8'),
      await readFile(new URL(`Aquarium1Device/${file}`, root), 'utf8'));
  }
});

test('Aquarium 2 GPIO15 light test preserves active-low OFF initialization and avoids other peripherals', async () => {
  const source = await readFile(new URL('../../firmware/Aquarium2Device/Aquarium2Device.ino', import.meta.url), 'utf8');
  const lightPin = Number(source.match(/LIGHT_PIN = (\d+)/)?.[1]);
  assert.equal(lightPin, 15);
  for (const occupied of [17, 23, 18, 19, 26, 27, 32, 33, 34, 35]) assert.notEqual(lightPin, occupied);
  const setup = source.slice(source.indexOf('void setup()'), source.indexOf('void loop()'));
  assert.ok(setup.indexOf('digitalWrite(LIGHT_PIN, HIGH)') < setup.indexOf('pinMode(LIGHT_PIN, OUTPUT)'));
  assert.match(setup, /outputsOff\(\)/);
  assert.match(source, /digitalWrite\(light \? LIGHT_PIN : FILTER_PIN, on \? LOW : HIGH\)/);
  assert.match(source, /requestedMs <= commandWatermarkMs/);
});

test('prepared Aquarium 2 upload has current logic and its own credentials/identity', {
  skip: !existsSync(new URL('../../../Aquarium2Device/Aquarium2Device.ino', import.meta.url)),
}, async () => {
  const repo = new URL('../../firmware/Aquarium2Device/', import.meta.url);
  const actual = new URL('../../../Aquarium2Device/', import.meta.url);
  assert.equal((await readFile(new URL('Aquarium2Device.ino', actual), 'utf8')).replace(/\r\n/g, '\n'),
    (await readFile(new URL('Aquarium2Device.ino', repo), 'utf8')).replace(/\r\n/g, '\n'));
  const config = await readFile(new URL('Config.h', actual), 'utf8');
  assert.match(config, /aquarium2-firmware-secrets\.h/);
  assert.doesNotMatch(config, /aquarium1-firmware-secrets|SAQ-7K3M-9R2X/);
  assert.match(config, /PROFILE_LEVEL_ENABLED = false/);
  assert.match(config, /POWER_SENSOR_ANALOG = false/);
  assert.match(config, /POWER_PRESENT_LEVEL = 0/);
  assert.match(config, /#define AQUARIUM_TDS_METER_REFERENCE_ENABLED 1/);
  for (const file of ['WaterLevel.h', 'FeederConfig.h', 'PowerSignal.h', 'EchoFilter.h', 'ScheduleLogic.h', 'ScheduleLogicTests.h']) {
    assert.equal((await readFile(new URL(file, actual), 'utf8')).replace(/\r\n/g, '\n'),
      (await readFile(new URL(file, repo), 'utf8')).replace(/\r\n/g, '\n'));
  }
});

test('Aquarium 2 uses the observed optocoupler LOW=present, HIGH=absent mapping', async () => {
  const root = new URL('../../firmware/Aquarium2Device/', import.meta.url);
  const config = await readFile(new URL('Config.h', root), 'utf8');
  const source = await readFile(new URL('Aquarium2Device.ino', root), 'utf8');
  const activeLevel = Number(config.match(/constexpr int POWER_PRESENT_LEVEL = (-?\d+)/)?.[1]);
  assert.match(source, /digitalRead\(POWER_PIN\) == POWER_PRESENT_LEVEL/);
  assert.equal(activeLevel, 0);
  assert.deepEqual(firmwarePower(2, { digitalLevel: 0 }).telemetry, { powerStatus: 'Online', mainsPresent: true });
  assert.deepEqual(firmwarePower(2, { digitalLevel: 1 }).telemetry, { powerStatus: 'Power Interruption', mainsPresent: false });
  assert.match(config, /POWER_SENSOR_ANALOG = false/);
});
