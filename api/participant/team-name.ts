import { getParticipantId, getServiceSupabase } from '../_helpers.js';

type Req = { method?: string; body?: unknown; headers?: Record<string, string | string[] | undefined> };
type Res = { status: (code: number) => Res; json: (data: unknown) => void; setHeader: (name: string, value: string) => void };

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed.' });

  const participantId = getParticipantId(typeof req.headers?.authorization === 'string' ? req.headers.authorization : undefined);
  if (!participantId) return res.status(401).json({ ok: false, message: 'Unauthorized participant session.' });

  let body: any;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ ok: false, message: 'Invalid request body.' }); }

  const teamName = typeof body?.teamName === 'string' ? body.teamName.trim() : '';
  if (!teamName || teamName.length > 100) return res.status(400).json({ ok: false, message: 'A valid team name is required.' });

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('participants')
      .update({ team_name: teamName })
      .eq('id', participantId)
      .select('id, username, team_name, current_question_index, score, completed, is_banned, warning_count, role, started_at, completed_at, created_at, current_question_started_at')
      .single();
    if (error) return res.status(400).json({ ok: false, message: error.message });
    return res.status(200).json({ ok: true, participant: data });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err.message || 'Internal server error.' });
  }
}
