// Vercel Serverless Function: verifies the admin passkey server-side.
// On success, issues a signed JWT token for subsequent admin API calls.
// Includes rate limiting and fail-closed behavior.

import { timingSafeEqual } from 'node:crypto';
import { signAdminToken, isRateLimited } from './_helpers';

type Req = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};

type Res = {
  status: (code: number) => Res;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function getClientIp(req: Req): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  // Fail closed: require ADMIN_PASSKEY in production (#29)
  const expected = process.env.ADMIN_PASSKEY;
  if (!expected) {
    console.error('ADMIN_PASSKEY environment variable is not set. Admin access is disabled.');
    return res.status(500).json({ ok: false, message: 'Server misconfigured: admin passkey not set.' });
  }

  // Rate limiting (#30)
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ ok: false, message: 'Too many attempts. Try again later.' });
  }

  let candidate = '';
  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
      passkey?: unknown;
    } | null;
    if (body && typeof body.passkey === 'string') {
      candidate = body.passkey;
    }
  } catch {
    return res.status(400).json({ ok: false, message: 'Invalid request body.' });
  }

  if (!candidate) {
    return res.status(400).json({ ok: false, message: 'Passkey is required.' });
  }

  const valid = constantTimeEquals(candidate, expected);

  if (!valid) {
    // Small fixed delay to slow down brute-force attempts.
    await new Promise((resolve) => setTimeout(resolve, 500));
    return res.status(401).json({ ok: false, message: 'Invalid Admin Passkey.' });
  }

  // Issue a signed JWT token for subsequent admin API calls (#3)
  try {
    const token = signAdminToken();
    return res.status(200).json({ ok: true, token });
  } catch (err) {
    console.error('Failed to sign admin token:', err);
    return res.status(500).json({ ok: false, message: 'Server error issuing auth token.' });
  }
}
