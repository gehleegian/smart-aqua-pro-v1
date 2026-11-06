// Compile real private settings without printing credentials or compiler excerpts.
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const privateRoot = 'C:/Users/marin/firebase-private';
const cli = 'C:/Program Files/Arduino IDE/resources/app/lib/backend/resources/arduino-cli.exe';
try {
  const header = await readFile(`${privateRoot}/aquarium1-firmware-secrets.h`, 'utf8');
  for (const name of ['WIFI_SSID', 'WIFI_PASSWORD', 'FIREBASE_API_KEY', 'DEVICE_EMAIL', 'DEVICE_PASSWORD', 'AQUARIUM_ID']) {
    const match = header.match(new RegExp(`constexpr char ${name}\\[\\]\\s*=\\s*("(?:\\\\.|[^"\\\\])*")\\s*;`));
    if (!match) throw new Error(`${name}_MALFORMED_DECLARATION`);
    let value;
    try { value = JSON.parse(match[1]); } catch { throw new Error(`${name}_INVALID_QUOTING`); }
    if (!value.length) throw new Error(`${name}_IS_EMPTY`);
  }
  console.log('Wi-Fi and Firebase private settings are populated. Values withheld.');
  const result = await new Promise(resolve => execFile(cli, ['compile', '--fqbn', 'esp32:esp32:esp32',
    '--build-path', 'C:/new/tmp/Aquarium1WebReady', fileURLToPath(new URL('../firmware/Aquarium1Device', import.meta.url))],
  { maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
  if (result.error) {
    await writeFile(`${privateRoot}/aquarium1-compile-error.log`, result.stdout + '\n' + result.stderr);
    throw new Error('COMPILE_FAILED_DETAILS_SAVED_PRIVATELY');
  }
  for (const line of result.stdout.split(/\r?\n/))
    if (/^(Sketch uses|Global variables use)/.test(line)) console.log(line);
  console.log('Real-settings firmware compiled successfully. Not uploaded. Treat build artifacts as private.');
} catch (error) {
  console.error('Firmware build stopped:', /^[A-Z0-9_]+$/.test(error.message || '') ? error.message : 'BUILD_FAILED');
  process.exitCode = 1;
}
