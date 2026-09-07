// Vercel Serverless Function: verifies the admin passkey server-side.
// The secret lives in the server-only `ADMIN_PASSKEY` env var (no VITE_
// prefix), so it is NEVER shipped to the browser. The frontend POSTs a
// candidate passkey here and only receives { ok: true/false }.

import { timingSafeEqual } from 'node:crypto';

type Req = {
  method?: string;
  body?: unknown;
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

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  const expected = process.env.ADMIN_PASSKEY || 'asthra11@admin';

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

  return res.status(200).json({ ok: true });
}
