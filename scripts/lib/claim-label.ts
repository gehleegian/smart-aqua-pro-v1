// The printable claim label (QR + plain-text device ID and claim code), shared
// by scripts/provision-device.ts and scripts/convert-pr8-registry.ts.
// Output goes to provisioning-output/ (gitignored). The code is written to
// nothing but these files.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claimUri } from '../../functions/src/shared/claimCode.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QRCode = createRequire(path.join(root, 'package.json'))('qrcode');

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

export async function labelSvg(deviceId: string, claimCode: string) {
  const qr: string = await QRCode.toString(claimUri(deviceId, claimCode), { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  const qrBody = qr.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const viewBox = /viewBox="([^"]+)"/.exec(qr)?.[1] ?? '0 0 33 33';
  const grouped = `${claimCode.slice(0, 4)} ${claimCode.slice(4)}`;
  // 62 x 29 mm: a common thermal label size.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="62mm" height="29mm" viewBox="0 0 620 290">
  <rect width="620" height="290" fill="#ffffff"/>
  <svg x="10" y="10" width="270" height="270" viewBox="${viewBox}">${qrBody}</svg>
  <g font-family="Helvetica, Arial, sans-serif" fill="#0f172a">
    <text x="300" y="58" font-size="26" font-weight="700">SmartAqua Pro</text>
    <text x="300" y="104" font-size="18" fill="#475569">Device ID</text>
    <text x="300" y="136" font-size="28" font-family="Menlo, Consolas, monospace">${escapeXml(deviceId)}</text>
    <text x="300" y="182" font-size="18" fill="#475569">Claim code</text>
    <text x="300" y="218" font-size="34" font-weight="700" font-family="Menlo, Consolas, monospace">${escapeXml(grouped)}</text>
    <text x="300" y="262" font-size="15" fill="#475569">Scan in the app: Add device</text>
  </g>
</svg>
`;
}


/** Writes qr.png, label.svg and claim.json (mode 600) to <outDir>/<deviceId>/ and returns that folder. */
export async function writeClaimLabel(outDir: string, deviceId: string, claimCode: string) {
  const deviceDir = path.join(outDir, deviceId);
  mkdirSync(deviceDir, { recursive: true });
  await QRCode.toFile(path.join(deviceDir, 'qr.png'), claimUri(deviceId, claimCode), { errorCorrectionLevel: 'M', margin: 2, width: 512 });
  writeFileSync(path.join(deviceDir, 'label.svg'), await labelSvg(deviceId, claimCode));
  writeFileSync(path.join(deviceDir, 'claim.json'), `${JSON.stringify({ deviceId, claimCode, uri: claimUri(deviceId, claimCode) }, null, 2)}\n`, { mode: 0o600 });
  return deviceDir;
}
