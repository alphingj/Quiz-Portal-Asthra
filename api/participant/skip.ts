// Vercel Serverless Function: participant question skip.
// Calls the server-side rpc_skip_question RPC for validated timeout enforcement.

import { getParticipantId, getServiceSupabase } from '../_helpers.js';

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

  const participantId = getParticipantId(typeof req.headers?.authorization === 'string' ? req.headers.authorization : undefined);
  if (!participantId) {
    return res.status(400).json({ ok: false, message: 'participantId is required.' });
  }

  let supabase;
  try {
    supabase = getServiceSupabase();
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err.message });
  }

  try {
    const { data, error } = await supabase.rpc('rpc_skip_question', {
      p_participant_id: participantId,
    });

    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    return res.status(200).json({ ok: true, ...data });
  } catch (err: any) {
    console.error('Skip question error:', err);
    return res.status(500).json({ ok: false, message: err.message || 'Internal server error.' });
  }
}
