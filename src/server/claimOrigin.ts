/** Next dev can normalize request.url to localhost despite a loopback Host. */
export function isClaimOriginAllowed(request: Request, development: boolean): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Native clients still require a verified bearer token.
  const target = new URL(request.url);
  if (origin === target.origin) return true;
  if (!development || target.protocol !== 'http:') return false;
  const loopbacks = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (!loopbacks.has(target.hostname)) return false;
  const host = request.headers.get('host');
  if (!host) return false;
  try {
    const local = new URL(`http://${host}`);
    // Exact authority prevents path/userinfo tricks; ports must match too.
    return local.host === host && loopbacks.has(local.hostname)
      && local.port === target.port && origin === local.origin;
  } catch {
    return false;
  }
}
