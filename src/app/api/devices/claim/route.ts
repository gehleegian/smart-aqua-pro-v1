import { getClaimServices } from '../../../../server/firebaseAdmin.ts';
import { claimDevice } from '../../../../server/deviceClaim.ts';
import { ClaimError } from '../../../../server/claimValidation.ts';
import { isClaimOriginAllowed } from '../../../../server/claimOrigin.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function reply(body: object, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  // No cookie authentication, CORS wildcard, credential logging, or public admin keys.
  if (!isClaimOriginAllowed(request, process.env.NODE_ENV === 'development')) {
    return reply({ code: 'forbidden', message: 'Cross-origin requests are not allowed.' }, 403);
  }
  const bearer = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!bearer || bearer.length > 8192) return reply({ code: 'unauthenticated', message: 'Please sign in again.' }, 401);
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return reply({ code: 'invalid-input', message: 'A JSON request is required.' }, 415);
  }
  let services;
  try { services = getClaimServices(); } catch {
    return reply({ code: 'unavailable', message: 'Device setup is not configured on this server yet.' }, 503);
  }
  let actor;
  try { actor = await services.auth.verifyIdToken(bearer, true); } catch {
    return reply({ code: 'unauthenticated', message: 'Your session has expired. Please sign in again.' }, 401);
  }
  try {
    // Limit the actual body, not only the untrusted Content-Length header.
    const reader = request.body?.getReader();
    if (!reader) throw new ClaimError(400, 'invalid-input', 'Missing request body.');
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 32_768) {
        await reader.cancel();
        throw new ClaimError(413, 'invalid-input', 'Request is too large.');
      }
      chunks.push(value);
    }
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {
      throw new ClaimError(400, 'invalid-input', 'Invalid JSON request.');
    }
    const result = await claimDevice(services, {
      uid: actor.uid, emailVerified: actor.email_verified === true, principalType: actor.principalType,
    }, input);
    return reply(result, 200);
  } catch (error) {
    if (error instanceof ClaimError) return reply({ code: error.code, message: error.message }, error.status);
    // Deliberately do not log request bodies, tokens, SDK exceptions, or credentials.
    return reply({ code: 'claim-pending', message:
      'Device setup could not finish. Retry with the same account and device ID; do not create another registration.' }, 503);
  }
}
