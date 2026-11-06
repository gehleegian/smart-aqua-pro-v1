// Mechanical quoting repair. No credential values are logged.
import { readFile, writeFile } from 'node:fs/promises';
const path = 'C:/Users/marin/firebase-private/aquarium1-firmware-secrets.h';
try {
  const original = await readFile(path, 'utf8');
  let changed = original;
  for (const name of ['WIFI_SSID', 'WIFI_PASSWORD']) {
    const pattern = new RegExp(`^(constexpr\\s+char\\s+${name}\\s*\\[\\s*\\]\\s*=)\\s*([^\\r\\n]*);[ \\t]*$`, 'm');
    const match = changed.match(pattern);
    if (!match || !match[2].trim() || /^["'\u201c\u201d]/.test(match[2].trim()))
      throw new Error('UNEXPECTED_FORMAT_NO_REPAIR');
    changed = changed.replace(pattern, () => `${match[1]} ${JSON.stringify(match[2].trim())};`);
  }
  await writeFile(`${path}.before-quoting-${Date.now()}.bak`, original, { flag: 'wx', mode: 0o600 });
  await writeFile(path, changed);
  console.log('Added Arduino double quotes to both existing Wi-Fi values. Private backup saved; values not displayed.');
} catch { console.error('Quoting repair stopped; inspect format locally.'); process.exitCode = 1; }
