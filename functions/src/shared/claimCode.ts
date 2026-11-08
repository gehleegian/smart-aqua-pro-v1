import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

// Pure claim-code helpers shared by the claimDevice callable (orgAccess.ts)
// and scripts/provision-device.ts, so both hash a code the same way.
// No Firebase imports: the script loads this file directly.

export const DEVICE_ID_PATTERN = /^SAQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
/** No 0/O, 1/I/L: the code is typed by hand from a printed label. */
export const CLAIM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CLAIM_CODE_LENGTH = 8;
/** Device IDs keep the live style (SAQ-7K3M-9R2X): upper-case letters and digits. */
const DEVICE_ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomString(alphabet: string, length: number) {
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join('');
}

export function generateDeviceId() {
  return `SAQ-${randomString(DEVICE_ID_ALPHABET, 4)}-${randomString(DEVICE_ID_ALPHABET, 4)}`;
}

export function generateClaimCode() {
  return randomString(CLAIM_CODE_ALPHABET, CLAIM_CODE_LENGTH);
}

export function deviceUidFor(deviceId: string) {
  return `esp32-${deviceId}`;
}

export function normalizeDeviceId(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

/** Upper-cases and drops spaces/dashes so "abcd-efgh" and "ABCD EFGH" match. */
export function normalizeClaimCode(value: unknown) {
  return typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : '';
}

export function isValidClaimCode(code: string) {
  return code.length === CLAIM_CODE_LENGTH && [...code].every((character) => CLAIM_CODE_ALPHABET.includes(character));
}

/** HMAC-SHA256(pepper, "<deviceId>:<code>"), hex. Binding the ID stops code reuse across devices. */
export function hashClaimCode(pepper: string, deviceId: string, code: string) {
  if (!pepper) throw new Error('CLAIM_CODE_PEPPER is not configured.');
  return createHmac('sha256', pepper).update(`${deviceId}:${code}`).digest('hex');
}

export function claimCodeMatches(pepper: string, deviceId: string, code: string, storedHash: unknown) {
  if (typeof storedHash !== 'string' || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashClaimCode(pepper, deviceId, code), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** The QR payload printed on the device label. */
export function claimUri(deviceId: string, claimCode: string) {
  return `smartaqua://claim?d=${encodeURIComponent(deviceId)}&c=${encodeURIComponent(claimCode)}`;
}
