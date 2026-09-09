// Vercel Serverless Function: authenticated admin mutations.
// Requires a valid admin JWT token in the Authorization header.
// Uses service_role Supabase client (bypasses RLS).

import { getServiceSupabase, verifyAdminToken } from '../_helpers.js';
import bcrypt from 'bcrypt';

type Req = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
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

  // Verify admin JWT
  const authHeader = typeof req.headers?.['authorization'] === 'string'
    ? req.headers['authorization']
    : undefined;
  if (!verifyAdminToken(authHeader)) {
    return res.status(401).json({ ok: false, message: 'Unauthorized. Invalid or expired admin token.' });
  }

  let body: any;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ ok: false, message: 'Invalid request body.' });
  }

  const { action, ...params } = body || {};
  if (!action) {
    return res.status(400).json({ ok: false, message: 'Missing action field.' });
  }

  let supabase;
  try {
    supabase = getServiceSupabase();
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err.message || 'Server configuration error.' });
  }

  try {
    switch (action) {
      // --- Participant Management ---
      case 'getParticipants': {
        const { data, error } = await supabase
          .from('participants')
          .select('id, username, team_name, current_question_index, score, completed, is_banned, warning_count, role, started_at, completed_at, created_at, current_question_started_at')
          .order('score', { ascending: false });
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true, participants: data || [] });
      }

      case 'createParticipant': {
        const { username, password, teamName, role } = params;
        if (!username?.trim() || !password?.trim()) {
          return res.status(400).json({ ok: false, message: 'Username and password are required.' });
        }
        
        // Hash the password before storing
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password.trim(), saltRounds);

        const { data, error } = await supabase
          .from('participants')
          .insert([{
            username: username.trim().toLowerCase(),
            password_hash: hashedPassword,
            team_name: teamName?.trim() || null,
            role: role || 'participant',
          }])
          .select()
          .single();
        if (error) return res.status(400).json({ ok: false, message: error.message });
        // Strip password_hash from response
        const { password_hash: _, ...safeData } = data;
        return res.status(200).json({ ok: true, participant: safeData });
      }

      case 'deleteParticipant': {
        const { id } = params;
        const { error } = await supabase.from('participants').delete().eq('id', id);
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true });
      }

      case 'resetParticipant': {
        const { id } = params;
        const now = new Date().toISOString();
        const { error } = await supabase.from('participants').update({
          current_question_index: 0,
          score: 0,
          completed: false,
          started_at: now,
          completed_at: null,
          current_question_started_at: now,
        }).eq('id', id);
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true });
      }

      case 'updatePassword': {
        const { id, newPassword } = params;
        if (!newPassword?.trim()) return res.status(400).json({ ok: false, message: 'Password required.' });
        
        // Hash the new password before storing
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword.trim(), saltRounds);

        const { error } = await supabase.from('participants').update({ password_hash: hashedPassword }).eq('id', id);
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true });
      }

      case 'updateRole': {
        const { id, role } = params;
        if (!['admin', 'moderator', 'participant'].includes(role)) {
          return res.status(400).json({ ok: false, message: 'Invalid role.' });
        }
        const { error } = await supabase.from('participants').update({ role }).eq('id', id);
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true });
      }

      case 'banParticipant': {
        const { id, isBanned } = params;
        if (typeof isBanned !== 'boolean') {
          return res.status(400).json({ ok: false, message: 'Invalid ban state.' });
        }
        const { error } = await supabase.from('participants').update({ is_banned: isBanned }).eq('id', id);
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true });
      }

      case 'deductPoints': {
        const { id, penalty } = params;
        if (!Number.isFinite(Number(penalty)) || Number(penalty) < 0) {
          return res.status(400).json({ ok: false, message: 'Penalty must be a non-negative number.' });
        }
        const numericPenalty = Number(penalty);
        // Fetch current score to calculate new score
        const { data: participant, error: fetchErr } = await supabase
          .from('participants').select('score').eq('id', id).single();
        if (fetchErr) return res.status(400).json({ ok: false, message: fetchErr.message });
        const newScore = Math.max(0, (participant?.score || 0) - numericPenalty);
        const { error } = await supabase.from('participants').update({ score: newScore }).eq('id', id);
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true, newScore });
      }

      // --- Question Management ---
      case 'getQuestions': {
        const { data, error } = await supabase
          .from('questions')
          .select('*')
          .order('order_index', { ascending: true });
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true, questions: data || [] });
      }

      case 'getWarnings': {
        const { data, error } = await supabase
          .from('warnings')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true, warnings: data || [] });
      }

      case 'addQuestion': {
        const { question } = params;
        if (!question) return res.status(400).json({ ok: false, message: 'Question data required.' });
        const { id: _omitId, ...dbPayload } = question;
        const { data, error } = await supabase.from('questions').insert([dbPayload]).select().single();
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true, question: data });
      }

      case 'updateQuestion': {
        const { id, data: qData } = params;
        const { error } = await supabase.from('questions').update(qData).eq('id', id);
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true });
      }

      case 'deleteQuestion': {
        const { id } = params;
        const { data, error } = await supabase.rpc('rpc_delete_question', { p_question_id: id });
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true, ...(data || {}) });
      }

      // --- Competition Settings ---
      case 'updateSettings': {
        const { settings } = params;
        const { error } = await supabase.from('competition_settings').upsert({
          id: 1,
          ...settings,
          updated_at: new Date().toISOString(),
        });
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true });
      }

      case 'startCompetition': {
        const { data, error } = await supabase.rpc('rpc_start_competition');
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true, ...(data || {}) });
      }

      case 'endCompetition': {
        const { error } = await supabase.from('competition_settings').update({
          status: 'ended',
          updated_at: new Date().toISOString(),
        }).eq('id', 1);
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true });
      }

      case 'resetToWaiting': {
        const { error } = await supabase.from('competition_settings').update({
          status: 'waiting',
          started_at: null,
          updated_at: new Date().toISOString(),
        }).eq('id', 1);
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true });
      }

      case 'resetTrialData': {
        const now = new Date().toISOString();
        const { error: participantError } = await supabase.from('participants').update({
          current_question_index: 0,
          score: 0,
          completed: false,
          started_at: now,
          completed_at: null,
          current_question_started_at: now,
          warning_count: 0,
        }).neq('id', '00000000-0000-0000-0000-000000000000');
        if (participantError) return res.status(400).json({ ok: false, message: participantError.message });

        const { error: warningError } = await supabase.from('warnings')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (warningError) return res.status(400).json({ ok: false, message: warningError.message });

        const { error: settingsError } = await supabase.from('competition_settings').update({
          status: 'waiting',
          started_at: null,
          updated_at: now,
        }).eq('id', 1);
        if (settingsError) return res.status(400).json({ ok: false, message: settingsError.message });
        return res.status(200).json({ ok: true });
      }

      // --- Warnings ---
      case 'clearWarnings': {
        const { error } = await supabase.from('warnings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) return res.status(400).json({ ok: false, message: error.message });
        return res.status(200).json({ ok: true });
      }

      default:
        return res.status(400).json({ ok: false, message: `Unknown action: ${action}` });
    }
  } catch (err: any) {
    console.error('Admin action error:', err);
    return res.status(500).json({ ok: false, message: err.message || 'Internal server error.' });
  }
}
