import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

test('Aquarium 2 preserves Aquarium 1 control logic with isolated identity and feed storage', async () => {
  const root = new URL('../../firmware/', import.meta.url);
  const a = await readFile(new URL('Aquarium1Device/Aquarium1Device.ino', root), 'utf8');
  const b = await readFile(new URL('Aquarium2Device/Aquarium2Device.ino', root), 'utf8');
  const feedRoutine = a.replace(/\r\n/g, '\n').match(/void runManualFeed\(\) \{[\s\S]*?(?=\nvoid help\(\))/)?.[0];
  assert.ok(feedRoutine);
  const normalizedB = b.replace(/\r\n/g, '\n')
    .replace('#include <esp32-hal-ledc.h>', '#include <ESP32Servo.h>')
    .replace('bool feederPwmAttached = false;', 'Servo feeder;')
    .replace('  stopFeederPwm();\n', '') // disarm now also stops PWM immediately
    .replace(/\/\/ Native core-3 LEDC calls[\s\S]*?(?=\nvoid help\(\))/, feedRoutine.replace(/\r\n/g, '\n'))
    .replace('SERVO_PIN = 23', 'SERVO_PIN = 15');
  assert.match(b, /if \(!ledcAttach\(SERVO_PIN, 50, 16\)\)/);
  assert.match(b, /LIGHT_PIN = 16, FILTER_PIN = 17, SERVO_PIN = 23/);
  assert.equal(normalizedB, a.replace(/Aquarium 1/g, 'Aquarium 2')
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
  assert.match(a1Config, /PROFILE_LEVEL_ENABLED = true/);
  assert.match(config, /PROFILE_LEVEL_ENABLED = false/);
  const feeder = await readFile(new URL('Aquarium2Device/FeederConfig.h', root), 'utf8');
  assert.match(feeder, /owner-confirmed SG90/);
  for (const setting of ['FEEDER_HOME_DEG = 135', 'FEEDER_DISPENSE_DEG = 45', 'FEEDER_HOLD_MS = 1500', 'FEEDER_COOLDOWN_MS = 5000']) assert.ok(feeder.includes(setting));
  for (const file of ['ScheduleLogic.h', 'ScheduleLogicTests.h', 'EchoFilter.h', 'PowerSignal.h', 'WaterLevel.h']) {
    assert.equal(await readFile(new URL(`Aquarium2Device/${file}`, root), 'utf8'),
      await readFile(new URL(`Aquarium1Device/${file}`, root), 'utf8'));
  }
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
  const expression = source.match(/else if \(POWER_PRESENT_LEVEL == 0 \|\| POWER_PRESENT_LEVEL == 1\)\s*telemetry\["powerStatus"\] = ([^;]+);/)?.[1];
  assert.ok(expression, 'test the actual firmware digital mapping');
  const evaluate = Function('digitalRead', 'POWER_PIN', 'POWER_PRESENT_LEVEL', `return ${expression};`);
  assert.equal(evaluate(() => 0, 33, activeLevel), 'Online');
  assert.equal(evaluate(() => 1, 33, activeLevel), 'Power Interruption');
  assert.match(config, /POWER_SENSOR_ANALOG = false/);
});
