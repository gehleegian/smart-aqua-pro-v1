import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Aquarium 2 preserves Aquarium 1 control logic with isolated identity and feed storage', async () => {
  const root = new URL('../../firmware/', import.meta.url);
  const a = await readFile(new URL('Aquarium1Device/Aquarium1Device.ino', root), 'utf8');
  const b = await readFile(new URL('Aquarium2Device/Aquarium2Device.ino', root), 'utf8');
  assert.equal(b.replace(/\r\n/g, '\n'), a.replace(/Aquarium 1/g, 'Aquarium 2')
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
  assert.match(a1Config, /POWER_SIGNAL_ON_V = 2\.515f/);
  assert.match(a1Config, /PROFILE_LEVEL_ENABLED = true/);
  assert.match(config, /PROFILE_LEVEL_ENABLED = false/);
  for (const file of ['ScheduleLogic.h', 'ScheduleLogicTests.h', 'FeederConfig.h', 'EchoFilter.h', 'PowerSignal.h', 'WaterLevel.h']) {
    assert.equal(await readFile(new URL(`Aquarium2Device/${file}`, root), 'utf8'),
      await readFile(new URL(`Aquarium1Device/${file}`, root), 'utf8'));
  }
});
