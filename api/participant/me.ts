import { getParticipantId, getServiceSupabase } from '../_helpers.js';

type Req = { method?: string; headers?: Record<string, string | string[] | undefined> };
type Res = { status: (code: number) => Res; json: (data: unknown) => void; setHeader: (name: string, value: string) => void };

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  const participantId = getParticipantId(typeof req.headers?.authorization === 'string' ? req.headers.authorization : undefined);
  if (!participantId) return res.status(401).json({ ok: false, message: 'Unauthorized participant session.' });
  try {
    const { data, error } = await getServiceSupabase()
      .from('participants')
      .select('id, username, team_name, current_question_index, score, completed, is_banned, warning_count, role, started_at, completed_at, created_at, current_question_started_at')
      .eq('id', participantId)
      .single();
    if (error || !data) return res.status(404).json({ ok: false, message: 'Participant not found.' });
    return res.status(200).json({ ok: true, participant: data });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err.message || 'Internal server error.' });
  }
}
