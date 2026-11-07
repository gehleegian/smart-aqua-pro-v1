// Compile Aquarium 2's private settings without printing credential excerpts.
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const privateRoot = 'C:/Users/marin/firebase-private';
const cli = 'C:/Program Files/Arduino IDE/resources/app/lib/backend/resources/arduino-cli.exe';
try {
  const header = await readFile(`${privateRoot}/aquarium2-firmware-secrets.h`, 'utf8');
  const manifest = JSON.parse(await readFile(`${privateRoot}/aquarium2-registration.json`, 'utf8'));
  const values = {};
  for (const name of ['WIFI_SSID', 'WIFI_PASSWORD', 'FIREBASE_API_KEY', 'DEVICE_EMAIL', 'DEVICE_PASSWORD', 'AQUARIUM_ID']) {
    const match = header.match(new RegExp(`constexpr char ${name}\\[\\]\\s*=\\s*("(?:\\\\.|[^"\\\\])*")\\s*;`));
    if (!match) throw new Error(`${name}_MALFORMED_DECLARATION`);
    try { values[name] = JSON.parse(match[1]); } catch { throw new Error(`${name}_INVALID_QUOTING`); }
    if (!values[name].length) throw new Error(`${name}_IS_EMPTY`);
  }
  const identity = await readFile(new URL('../firmware/Aquarium2Device/DeviceIdentity.h', import.meta.url), 'utf8');
  if (manifest.projectId !== 'practice-smartaqua' || !/^SAQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(manifest.deviceId) ||
      manifest.deviceUid !== `esp32-${manifest.deviceId}` || values.AQUARIUM_ID !== manifest.aquariumId ||
      !identity.includes(`DEVICE_UID[] = ${JSON.stringify(manifest.deviceUid)};`) ||
      !identity.includes(`ENCLOSURE_ID[] = ${JSON.stringify(manifest.deviceId)};`))
    throw new Error('AQUARIUM2_IDENTITY_MISMATCH');
  console.log('Aquarium 2 private settings match its registration. Values withheld.');
  const result = await new Promise(resolve => execFile(cli, ['compile', '--fqbn', 'esp32:esp32:esp32',
    '--build-path', 'C:/new/tmp/Aquarium2WebReady', fileURLToPath(new URL('../firmware/Aquarium2Device', import.meta.url))],
  { maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
  if (result.error) {
    await writeFile(`${privateRoot}/aquarium2-compile-error.log`, result.stdout + '\n' + result.stderr);
    throw new Error('COMPILE_FAILED_DETAILS_SAVED_PRIVATELY');
  }
  for (const line of result.stdout.split(/\r?\n/))
    if (/^(Sketch uses|Global variables use)/.test(line)) console.log(line);
  console.log('Aquarium 2 real-settings firmware compiled successfully. Not uploaded. Build artifacts are private.');
} catch (error) {
  console.error('Aquarium 2 build stopped:', /^[A-Z0-9_]+$/.test(error.message || '') ? error.message : 'BUILD_FAILED');
  process.exitCode = 1;
}
