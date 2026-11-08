// Parses the device label QR: smartaqua://claim?d=<deviceId>&c=<claimCode>.
// Mirrors functions/src/shared/claimCode.ts (normalisation and format checks);
// the server re-validates everything.

export const DEVICE_ID_PATTERN = /^SAQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
export const CLAIM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

export type ClaimPayload = { deviceId: string; claimCode: string };

export function normalizeDeviceId(value: string) {
  return value.trim().toUpperCase();
}

export function normalizeClaimCode(value: string) {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

export function parseClaimUri(raw: string): ClaimPayload | null {
  const text = raw.trim();
  const match = /^smartaqua:\/\/claim\?(.*)$/i.exec(text);
  if (!match) return null;
  const params = new URLSearchParams(match[1]);
  const deviceId = normalizeDeviceId(params.get('d') ?? '');
  const claimCode = normalizeClaimCode(params.get('c') ?? '');
  if (!DEVICE_ID_PATTERN.test(deviceId) || !CLAIM_CODE_PATTERN.test(claimCode)) return null;
  return { deviceId, claimCode };
}

export function validateManualClaim(deviceIdInput: string, claimCodeInput: string): ClaimPayload | string {
  const deviceId = normalizeDeviceId(deviceIdInput);
  const claimCode = normalizeClaimCode(claimCodeInput);
  if (!DEVICE_ID_PATTERN.test(deviceId)) return 'Device ID looks like SAQ-XXXX-XXXX.';
  if (!CLAIM_CODE_PATTERN.test(claimCode)) return 'The claim code has 8 letters and numbers.';
  return { deviceId, claimCode };
}
