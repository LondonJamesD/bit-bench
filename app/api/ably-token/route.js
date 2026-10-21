// Hands browsers a short-lived Ably token so the API key never leaves the server.
// Set ABLY_API_KEY in the environment (Vercel → Settings → Environment Variables).
import * as Ably from 'ably';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const key = process.env.ABLY_API_KEY;
  if (!key) return Response.json({ error: 'ABLY_API_KEY is not set on the server.' }, { status: 503 });
  const clientId = (new URL(request.url).searchParams.get('clientId') || '').replace(/[^a-z0-9]/gi, '').slice(0, 32);
  if (!clientId) return Response.json({ error: 'Missing clientId.' }, { status: 400 });
  const rest = new Ably.Rest({ key });
  const tokenRequest = await rest.auth.createTokenRequest({
    clientId,
    capability: { 'bitbench:*': ['publish', 'subscribe', 'presence'] },
    ttl: 4 * 60 * 60 * 1000,
  });
  return Response.json(tokenRequest, { headers: { 'Cache-Control': 'no-store' } });
}
