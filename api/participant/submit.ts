// Vercel Serverless Function: participant answer submission.
// Calls the server-side rpc_submit_answer RPC for atomic, validated scoring.

import { getServiceSupabase } from '../_helpers.js';

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

  const { participantId, questionId, rawAnswer } = body || {};
  if (!participantId || !questionId || typeof rawAnswer !== 'string') {
    return res.status(400).json({ ok: false, message: 'participantId, questionId, and rawAnswer are required.' });
  }

  let supabase;
  try {
    supabase = getServiceSupabase();
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err.message });
  }

  try {
    const { data, error } = await supabase.rpc('rpc_submit_answer', {
      p_participant_id: participantId,
      p_question_id: questionId,
      p_raw_answer: rawAnswer,
    });

    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    return res.status(200).json({ ok: true, ...data });
  } catch (err: any) {
    console.error('Submit answer error:', err);
    return res.status(500).json({ ok: false, message: err.message || 'Internal server error.' });
  }
}
