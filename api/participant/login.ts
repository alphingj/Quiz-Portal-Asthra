// Vercel Serverless Function: participant login.
// Validates credentials server-side so passwords never transit to the browser.
// Returns participant data without the password_hash field.

import { getServiceSupabase, signParticipantToken } from '../_helpers.js';
import bcrypt from 'bcrypt';

type Req = {
  method?: string;
  body?: unknown;
};

type Res = {
  status: (code: number) => Res;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  let body: any;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ ok: false, message: 'Invalid request body.' });
  }

  const { username, password } = body || {};
  if (!username?.trim() || !password?.trim()) {
    return res.status(400).json({ ok: false, message: 'Username and password are required.' });
  }

  let supabase;
  try {
    supabase = getServiceSupabase();
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err.message });
  }

  try {
    const trimmedUser = username.trim().toLowerCase();
    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .eq('username', trimmedUser)
      .single();

    if (error || !data) {
      return res.status(401).json({
        ok: false,
        message: 'Participant username not found. Contact the Asthra admin table to register.',
      });
    }

    // Compare bcrypt hashes. Existing installations may have renamed the old
    // plaintext column to password_hash; accept it once, then upgrade in place.
    let isValid = await bcrypt.compare(password.trim(), data.password_hash);
    if (!isValid && data.password_hash === password.trim()) {
      const upgradedHash = await bcrypt.hash(password.trim(), 10);
      await supabase.from('participants').update({ password_hash: upgradedHash }).eq('id', data.id);
      isValid = true;
    }
    if (!isValid) {
      return res.status(401).json({ ok: false, message: 'Invalid password. Access denied.' });
    }

    if (data.is_banned) {
      return res.status(403).json({
        ok: false,
        message: 'ACCESS DENIED: Your account has been disqualified / banned by event administrators.',
      });
    }

    // Strip password_hash from response
    const { password_hash: _, ...safeParticipant } = data;
    const needsTeamName = !safeParticipant.team_name || safeParticipant.team_name.trim() === '';
    const token = signParticipantToken(safeParticipant.id);

    return res.status(200).json({
      ok: true,
      message: 'Access granted. Welcome to KeyBreak!',
      participant: safeParticipant,
      needsTeamName,
      token,
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ ok: false, message: err.message || 'Internal server error.' });
  }
}
