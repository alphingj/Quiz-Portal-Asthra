import { getParticipantId, getServiceSupabase } from '../_helpers.js';

type Req = { method?: string; body?: unknown; headers?: Record<string, string | string[] | undefined> };
type Res = { status: (code: number) => Res; json: (data: unknown) => void; setHeader: (name: string, value: string) => void };

const allowedEvents = new Set(['tab_switch', 'window_blur', 'window_minimize']);

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  const participantId = getParticipantId(typeof req.headers?.authorization === 'string' ? req.headers.authorization : undefined);
  if (!participantId) return res.status(401).json({ ok: false, message: 'Unauthorized participant session.' });

  let body: any;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ ok: false, message: 'Invalid request body.' }); }
  if (!allowedEvents.has(body?.eventType) || typeof body?.details !== 'string') {
    return res.status(400).json({ ok: false, message: 'Invalid warning payload.' });
  }

  try {
    const supabase = getServiceSupabase();
    const { data: participant, error: participantError } = await supabase
      .from('participants')
      .select('username, team_name')
      .eq('id', participantId)
      .single();
    if (participantError || !participant) return res.status(404).json({ ok: false, message: 'Participant not found.' });

    const { data, error } = await supabase.rpc('rpc_increment_warning', {
      p_participant_id: participantId,
      p_username: participant.username,
      p_team_name: participant.team_name,
      p_event_type: body.eventType,
      p_details: body.details.slice(0, 500),
    });
    if (error) return res.status(400).json({ ok: false, message: error.message });
    return res.status(200).json({ ok: true, ...data });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err.message || 'Internal server error.' });
  }
}
