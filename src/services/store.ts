import type { Participant, Question, Submission, LeaderboardEntry, CheatingWarning, CompetitionSettings } from '../types';
import { DEFAULT_COMPETITION_SETTINGS } from '../types';
import { getSupabase } from './supabaseClient';

// Default 3 cipher questions for Asthra 11.0: KeyBreak
export const INITIAL_QUESTIONS: Question[] = [
  {
    id: 1,
    round_number: 1,
    title: 'Round 1: The Caesar Shift Breach',
    cipher_type: 'Caesar Cipher (ROT-3)',
    ciphertext: 'DVWKUD{EUHDN_WKH_FLSKHU_11}',
    clue: 'Shift each letter backward by 3 positions in the alphabet (D -> A, V -> S). The flag format is ASTHRA{...}',
    answer: 'ASTHRA{BREAK_THE_CIPHER_11}',
    points: 100,
    difficulty: 'Beginner',
    order_index: 1,
  },
  {
    id: 2,
    round_number: 2,
    title: 'Round 2: Raw Memory Hex Dump',
    cipher_type: 'Hexadecimal ASCII Stream',
    ciphertext: '41 53 54 48 52 41 7b 48 34 43 4b 5f 54 48 33 5f 50 4c 41 4e 33 54 7d',
    clue: null, // As requested: some questions have clues, some don't!
    answer: 'ASTHRA{H4CK_TH3_PLAN3T}',
    points: 150,
    difficulty: 'Intermediate',
    order_index: 2,
  },
  {
    id: 3,
    round_number: 3,
    title: 'Round 3: The Polyalphabetic Citadel',
    cipher_type: 'Vigenère Cipher',
    ciphertext: 'SFXZLE{GOMC_MEV_XCPPT}',
    clue: "The festival title 'ASTHRA' was used as the cyclic decryption key.",
    answer: 'ASTHRA{CODE_AND_CONQR}',
    points: 200,
    difficulty: 'Advanced',
    order_index: 3,
  },
];

// Clean participant store - demo data removed as requested
export const SEED_PARTICIPANTS: Participant[] = [];

const STORAGE_PARTICIPANTS = 'asthra_participants_data';
const STORAGE_QUESTIONS = 'asthra_questions_data';
const STORAGE_SUBMISSIONS = 'asthra_submissions_data';
const STORAGE_WARNINGS = 'asthra_cheat_warnings_data';
const STORAGE_SETTINGS = 'asthra_competition_settings';

class StoreService {
  private getLocalParticipants(): Participant[] {
    const data = localStorage.getItem(STORAGE_PARTICIPANTS);
    if (!data) {
      localStorage.setItem(STORAGE_PARTICIPANTS, JSON.stringify([]));
      return [];
    }
    try {
      const parsed: Participant[] = JSON.parse(data);
      // Clean out any legacy demo participants if they exist
      const cleaned = parsed.filter(p => !p.id.startsWith('demo-') && p.username !== 'cipher_wolf' && p.username !== 'crypto_knight' && p.username !== 'asthra_ninja');
      if (cleaned.length !== parsed.length) {
        localStorage.setItem(STORAGE_PARTICIPANTS, JSON.stringify(cleaned));
      }
      return cleaned;
    } catch {
      return [];
    }
  }

  private notifyDataUpdate() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('asthra_data_update'));
    }
  }

  private saveLocalParticipants(participants: Participant[]) {
    localStorage.setItem(STORAGE_PARTICIPANTS, JSON.stringify(participants));
    this.notifyDataUpdate();
  }

  private getLocalQuestions(): Question[] {
    const data = localStorage.getItem(STORAGE_QUESTIONS);
    if (!data) {
      localStorage.setItem(STORAGE_QUESTIONS, JSON.stringify(INITIAL_QUESTIONS));
      return INITIAL_QUESTIONS;
    }
    try {
      return JSON.parse(data);
    } catch {
      return INITIAL_QUESTIONS;
    }
  }

  private saveLocalQuestions(questions: Question[]) {
    localStorage.setItem(STORAGE_QUESTIONS, JSON.stringify(questions));
    this.notifyDataUpdate();
  }

  private getLocalSubmissions(): Submission[] {
    const data = localStorage.getItem(STORAGE_SUBMISSIONS);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private saveLocalSubmissions(submissions: Submission[]) {
    localStorage.setItem(STORAGE_SUBMISSIONS, JSON.stringify(submissions));
    this.notifyDataUpdate();
  }

  private getLocalWarnings(): CheatingWarning[] {
    const data = localStorage.getItem(STORAGE_WARNINGS);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private saveLocalWarnings(warnings: CheatingWarning[]) {
    localStorage.setItem(STORAGE_WARNINGS, JSON.stringify(warnings));
    this.notifyDataUpdate();
  }

  // --- QUESTIONS API ---
  public async getQuestions(): Promise<Question[]> {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('questions')
          .select('*')
          .order('order_index', { ascending: true });
        if (!error && data && data.length > 0) {
          this.saveLocalQuestions(data);
          return data;
        }
      } catch (err) {
        console.warn('Supabase fetch questions error, fallback to local', err);
      }
    }
    return this.getLocalQuestions();
  }

  public async updateQuestion(id: number, data: Partial<Question>): Promise<Question[]> {
    const questions = await this.getQuestions();
    const idx = questions.findIndex(q => q.id === id);
    if (idx >= 0) {
      questions[idx] = { ...questions[idx], ...data };
      const supabase = getSupabase();
      if (supabase) {
        try {
          await supabase.from('questions').upsert(questions[idx]);
        } catch (err) {
          console.warn('Supabase question update error', err);
        }
      }
      this.saveLocalQuestions(questions);
    }
    return questions;
  }

  public async saveQuestion(question: Question): Promise<Question[]> {
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from('questions').upsert(question);
      } catch (err) {
        console.warn('Supabase question upsert error', err);
      }
    }
    const questions = this.getLocalQuestions();
    const idx = questions.findIndex(q => q.id === question.id);
    if (idx >= 0) {
      questions[idx] = question;
    } else {
      questions.push(question);
    }
    this.saveLocalQuestions(questions);
    return questions;
  }

  // Delete a question entirely + renumber remaining rounds sequentially
  public async deleteQuestion(id: number): Promise<Question[]> {
    const questions = (await this.getQuestions()).filter(q => q.id !== id);
    const renumbered = questions
      .sort((a, b) => a.order_index - b.order_index)
      .map((q, i) => ({ ...q, order_index: i + 1, round_number: i + 1 }));

    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from('questions').delete().eq('id', id);
        if (renumbered.length > 0) {
          await supabase.from('questions').upsert(renumbered);
        }
      } catch (err) {
        console.warn('Supabase delete question error', err);
      }
    }
    this.saveLocalQuestions(renumbered);
    // Participants pointing past the shrunk list get clamped
    const settings = await this.getCompetitionSettings();
    await this.clampParticipantProgress(renumbered.length, settings.active_question_count);
    return renumbered;
  }

  // --- COMPETITION SETTINGS API (timed-competition mode) ---
  private getLocalSettings(): CompetitionSettings {
    const data = localStorage.getItem(STORAGE_SETTINGS);
    if (!data) {
      localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(DEFAULT_COMPETITION_SETTINGS));
      return { ...DEFAULT_COMPETITION_SETTINGS };
    }
    try {
      return { ...DEFAULT_COMPETITION_SETTINGS, ...JSON.parse(data) };
    } catch {
      return { ...DEFAULT_COMPETITION_SETTINGS };
    }
  }

  private saveLocalSettings(settings: CompetitionSettings) {
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
    this.notifyDataUpdate();
  }

  public async getCompetitionSettings(): Promise<CompetitionSettings> {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('competition_settings')
          .select('*')
          .eq('id', 1)
          .single();
        if (!error && data) {
          const settings: CompetitionSettings = {
            id: 1,
            status: data.status || 'waiting',
            started_at: data.started_at || null,
            time_limit_seconds: Number(data.time_limit_seconds) || 600,
            decay_per_second: Number(data.decay_per_second) || 1,
            active_question_count: Number(data.active_question_count) || 3,
            updated_at: data.updated_at || new Date().toISOString(),
          };
          this.saveLocalSettings(settings);
          return settings;
        }
      } catch (err) {
        console.warn('Supabase fetch settings error, fallback to local', err);
      }
    }
    return this.getLocalSettings();
  }

  public async updateCompetitionSettings(patch: Partial<CompetitionSettings>): Promise<CompetitionSettings> {
    const prev = await this.getCompetitionSettings();
    const next: CompetitionSettings = {
      ...prev,
      ...patch,
      id: 1,
      time_limit_seconds: Math.max(30, Math.floor(Number(patch.time_limit_seconds ?? prev.time_limit_seconds) || 600)),
      decay_per_second: Math.max(0, Math.floor(Number(patch.decay_per_second ?? prev.decay_per_second) || 0)),
      active_question_count: Math.max(1, Math.floor(Number(patch.active_question_count ?? prev.active_question_count) || 1)),
      updated_at: new Date().toISOString(),
    };

    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from('competition_settings').upsert({
          id: 1,
          status: next.status,
          started_at: next.started_at,
          time_limit_seconds: next.time_limit_seconds,
          decay_per_second: next.decay_per_second,
          active_question_count: next.active_question_count,
          updated_at: next.updated_at,
        });
      } catch (err) {
        console.warn('Supabase update settings error', err);
      }
    }
    this.saveLocalSettings(next);

    // If the admin shrank the active rounds, clamp anyone now past the end
    if (next.active_question_count !== prev.active_question_count) {
      const questions = await this.getQuestions();
      await this.clampParticipantProgress(questions.length, next.active_question_count);
    }
    return next;
  }

  // Questions actually in play: first N by order_index
  public async getActiveQuestions(): Promise<Question[]> {
    const [questions, settings] = await Promise.all([
      this.getQuestions(),
      this.getCompetitionSettings(),
    ]);
    return questions.slice(0, Math.max(1, settings.active_question_count));
  }

  // Clamp participants whose index is past the available/active questions
  private async clampParticipantProgress(totalQuestions: number, activeCount: number): Promise<void> {
    const participants = await this.getParticipants();
    const now = new Date().toISOString();
    const updates: Participant[] = [];
    for (const p of participants) {
      const clampedIndex = Math.min(p.current_question_index, Math.max(0, totalQuestions));
      const shouldComplete = clampedIndex >= Math.max(1, activeCount);
      if (clampedIndex !== p.current_question_index || (shouldComplete && !p.completed)) {
        updates.push({
          ...p,
          current_question_index: clampedIndex,
          completed: p.completed || shouldComplete,
          completed_at: p.completed_at || (shouldComplete ? now : null),
        });
      }
    }
    if (updates.length === 0) return;

    const supabase = getSupabase();
    if (supabase) {
      try {
        await Promise.all(updates.map(u =>
          supabase.from('participants').update({
            current_question_index: u.current_question_index,
            completed: u.completed,
            completed_at: u.completed_at,
          }).eq('id', u.id)
        ));
      } catch (err) {
        console.warn('Supabase clamp progress error', err);
      }
    }
    const byId = new Map(updates.map(u => [u.id, u]));
    this.saveLocalParticipants(this.getLocalParticipants().map(p => byId.get(p.id) || p));
  }

  // START COMPETITION: go live + reset every participant for a fresh run
  public async startCompetition(): Promise<CompetitionSettings> {
    const now = new Date().toISOString();
    const participants = await this.getParticipants();
    const resetData = {
      current_question_index: 0,
      score: 0,
      completed: false,
      started_at: now,
      completed_at: null,
      current_question_started_at: now,
    };

    const supabase = getSupabase();
    if (supabase) {
      try {
        await Promise.all(participants.map(p =>
          supabase.from('participants').update(resetData).eq('id', p.id)
        ));
      } catch (err) {
        console.warn('Supabase start-competition reset error', err);
      }
    }
    this.saveLocalParticipants(this.getLocalParticipants().map(p => ({ ...p, ...resetData })));
    return this.updateCompetitionSettings({ status: 'live', started_at: now });
  }

  // END COMPETITION: lock the quiz terminal
  public async endCompetition(): Promise<CompetitionSettings> {
    return this.updateCompetitionSettings({ status: 'ended' });
  }

  // Back to waiting room (re-arm for another run without wiping config)
  public async resetCompetitionToWaiting(): Promise<CompetitionSettings> {
    return this.updateCompetitionSettings({ status: 'waiting', started_at: null });
  }

  // Ensure a participant has a per-question start timestamp (backfills legacy
  // rows and late joiners). Returns the fresh participant row.
  public async ensureQuestionStart(participantId: string): Promise<Participant | null> {
    const participants = await this.getParticipants();
    const p = participants.find(part => part.id === participantId);
    if (!p) return null;
    if (p.current_question_started_at) return p;

    const now = new Date().toISOString();
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data } = await supabase
          .from('participants')
          .update({ current_question_started_at: now })
          .eq('id', participantId)
          .select()
          .single();
        if (data) {
          const list = this.getLocalParticipants().map(part =>
            part.id === participantId ? { ...part, current_question_started_at: now } : part
          );
          this.saveLocalParticipants(list);
          return data as Participant;
        }
      } catch (err) {
        console.warn('Supabase ensure question start error', err);
      }
    }
    const list = this.getLocalParticipants().map(part =>
      part.id === participantId ? { ...part, current_question_started_at: now } : part
    );
    this.saveLocalParticipants(list);
    return { ...p, current_question_started_at: now };
  }

  // --- PARTICIPANTS API ---
  public async getParticipants(): Promise<Participant[]> {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('participants')
          .select('*')
          .order('score', { ascending: false });
        if (!error && data) {
          this.saveLocalParticipants(data);
          return data;
        }
      } catch (err) {
        console.warn('Supabase fetch participants error, fallback to local', err);
      }
    }
    return this.getLocalParticipants();
  }

  // Admin registers participant with optional role
  public async createParticipant(username: string, password: string, teamName?: string, role?: 'admin' | 'moderator' | 'participant'): Promise<{ success: boolean; message: string; participant?: Participant }> {
    const trimmedUsername = username.trim().toLowerCase();
    const trimmedTeam = teamName?.trim() || null;
    const trimmedRole = role || 'participant';

    if (!trimmedUsername || !password.trim()) {
      return { success: false, message: 'Username and password are required.' };
    }

    const newParticipant: Participant = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'p-' + Date.now(),
      username: trimmedUsername,
      password: password.trim(),
      team_name: trimmedTeam,
      current_question_index: 0,
      score: 0,
      completed: false,
      role: trimmedRole,
      started_at: new Date().toISOString(),
      completed_at: null,
      created_at: new Date().toISOString(),
      current_question_started_at: new Date().toISOString(),
    };

    const supabase = getSupabase();
    if (supabase) {
      try {
        // Omit the newest column from the insert payload so registration keeps
        // working even if the timed-mode migration hasn't been run yet
        // (the column defaults to NOW() in the DB).
        const { current_question_started_at: _qStart, ...dbParticipant } = newParticipant;
        const { data, error } = await supabase
          .from('participants')
          .insert([dbParticipant])
          .select()
          .single();
        if (error) {
          return { success: false, message: `Database error: ${error.message}` };
        }
        await this.getParticipants();
        return { success: true, message: 'Participant created in Supabase successfully!', participant: data || newParticipant };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Database request failed';
        return { success: false, message: msg };
      }
    }

    // Local fallback
    const list = this.getLocalParticipants();
    if (list.some(p => p.username.toLowerCase() === trimmedUsername)) {
      return { success: false, message: 'A participant with this username already exists.' };
    }

    list.push(newParticipant);
    this.saveLocalParticipants(list);
    return { success: true, message: 'Participant created successfully (Local Storage)!', participant: newParticipant };
  }

  // Delete participant (Admin)
  public async deleteParticipant(id: string): Promise<boolean> {
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from('participants').delete().eq('id', id);
      } catch (err) {
        console.warn('Supabase delete participant error', err);
      }
    }
    const list = this.getLocalParticipants().filter(p => p.id !== id);
    this.saveLocalParticipants(list);
    return true;
  }

  // Reset participant progress (Admin)
  public async resetParticipant(id: string): Promise<boolean> {
    const updateData = {
      current_question_index: 0,
      score: 0,
      completed: false,
      started_at: new Date().toISOString(),
      completed_at: null,
      current_question_started_at: new Date().toISOString(),
    };

    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from('participants').update(updateData).eq('id', id);
      } catch (err) {
        console.warn('Supabase reset participant error', err);
      }
    }

    const list = this.getLocalParticipants().map(p => {
      if (p.id === id) {
        return { ...p, ...updateData };
      }
      return p;
    });
    this.saveLocalParticipants(list);
    return true;
  }

  // Update participant password (Admin)
  public async updateParticipantPassword(id: string, newPassword: string): Promise<boolean> {
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from('participants').update({ password: newPassword }).eq('id', id);
      } catch (err) {
        console.warn('Supabase update password error', err);
      }
    }
    const list = this.getLocalParticipants().map(p => {
      if (p.id === id) {
        return { ...p, password: newPassword };
      }
      return p;
    });
    this.saveLocalParticipants(list);
    return true;
  }

  // Update participant role (Admin)
  public async updateParticipantRole(id: string, role: 'admin' | 'moderator' | 'participant'): Promise<boolean> {
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from('participants').update({ role }).eq('id', id);
      } catch (err) {
        console.warn('Supabase update role error', err);
      }
    }
    const list = this.getLocalParticipants().map(p => {
      if (p.id === id) {
        return { ...p, role };
      }
      return p;
    });
    this.saveLocalParticipants(list);
    return true;
  }

  // Ban or Unban participant (Admin)
  public async banParticipant(id: string, isBanned: boolean): Promise<boolean> {
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from('participants').update({ is_banned: isBanned }).eq('id', id);
      } catch (err) {
        console.warn('Supabase ban participant error', err);
      }
    }

    const list = this.getLocalParticipants().map(p => {
      if (p.id === id) {
        return { ...p, is_banned: isBanned };
      }
      return p;
    });
    this.saveLocalParticipants(list);
    return true;
  }

  // Deduct points / apply timeout penalty (Admin)
  public async deductPoints(id: string, penalty: number): Promise<{ success: boolean; newScore: number }> {
    const participants = await this.getParticipants();
    const p = participants.find(part => part.id === id);
    if (!p) return { success: false, newScore: 0 };

    const newScore = Math.max(0, p.score - penalty);
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from('participants').update({ score: newScore }).eq('id', id);
      } catch (err) {
        console.warn('Supabase deductPoints error', err);
      }
    }

    const list = this.getLocalParticipants().map(part => {
      if (part.id === id) {
        return { ...part, score: newScore };
      }
      return part;
    });
    this.saveLocalParticipants(list);
    return { success: true, newScore };
  }

  // --- ANTI-CHEAT & WARNINGS API ---
  public async logCheatingWarning(
    participantId: string,
    username: string,
    teamName: string | null,
    eventType: 'tab_switch' | 'window_blur' | 'window_minimize',
    details?: string
  ): Promise<CheatingWarning> {
    const warning: CheatingWarning = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'w-' + Date.now(),
      participant_id: participantId,
      username,
      team_name: teamName,
      event_type: eventType,
      details: details || `Cheating / proctoring alert: ${eventType.replace('_', ' ')} detected`,
      timestamp: new Date().toISOString(),
    };

    // Increment warning count on participant
    const participants = await this.getParticipants();
    const p = participants.find(part => part.id === participantId);
    const newCount = (p?.warning_count || 0) + 1;

    const supabase = getSupabase();
    if (supabase) {
      try {
        // Map to DB column names: table uses `created_at` (defaults to NOW()),
        // not the frontend `timestamp` field — inserting unknown columns fails.
        await supabase.from('warnings').insert([{
          id: warning.id,
          participant_id: warning.participant_id,
          username: warning.username,
          team_name: warning.team_name,
          event_type: warning.event_type,
          details: warning.details,
        }]);
        await supabase.from('participants').update({ warning_count: newCount }).eq('id', participantId);
      } catch (err) {
        console.warn('Supabase warning insert error', err);
      }
    }

    // Save warning locally
    const warnings = this.getLocalWarnings();
    warnings.unshift(warning);
    this.saveLocalWarnings(warnings);

    // Update participant locally
    const list = this.getLocalParticipants().map(part => {
      if (part.id === participantId) {
        return { ...part, warning_count: newCount };
      }
      return part;
    });
    this.saveLocalParticipants(list);

    return warning;
  }

  public async getWarnings(): Promise<CheatingWarning[]> {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('warnings')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data) {
          const formatted: CheatingWarning[] = data.map((d: any) => ({
            id: d.id,
            participant_id: d.participant_id,
            username: d.username,
            team_name: d.team_name,
            event_type: d.event_type,
            details: d.details,
            timestamp: d.created_at || d.timestamp || new Date().toISOString(),
          }));
          this.saveLocalWarnings(formatted);
          return formatted;
        }
      } catch (err) {
        console.warn('Supabase fetch warnings error', err);
      }
    }
    return this.getLocalWarnings();
  }

  public async clearWarnings(): Promise<boolean> {
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from('warnings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } catch (err) {
        console.warn('Supabase clear warnings error', err);
      }
    }
    this.saveLocalWarnings([]);
    return true;
  }

  // Participant Login
  public async loginParticipant(username: string, password: string): Promise<{
    success: boolean;
    message: string;
    participant?: Participant;
    needsTeamName?: boolean;
  }> {
    const trimmedUser = username.trim().toLowerCase();
    const supabase = getSupabase();

    let participant: Participant | undefined;

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('participants')
          .select('*')
          .eq('username', trimmedUser)
          .single();

        if (!error && data) {
          if (data.password === password.trim()) {
            participant = data;
          } else {
            return { success: false, message: 'Invalid password. Access denied.' };
          }
        }
      } catch {
        // Fallback to local
      }
    }

    if (!participant) {
      const list = this.getLocalParticipants();
      const match = list.find(p => p.username.toLowerCase() === trimmedUser);
      if (!match) {
        return { success: false, message: 'Participant username not found. Contact the Asthra admin table to register.' };
      }
      if (match.password !== password.trim()) {
        return { success: false, message: 'Incorrect password. Access denied.' };
      }
      participant = match;
    }

    // Check if participant is banned / disqualified
    if (participant.is_banned) {
      return {
        success: false,
        message: 'ACCESS DENIED: Your account has been disqualified / banned by event administrators.',
      };
    }

    // Check if team name is missing (admin did not enter team name)
    const needsTeamName = !participant.team_name || participant.team_name.trim() === '';

    return {
      success: true,
      message: 'Access granted. Welcome to KeyBreak!',
      participant,
      needsTeamName,
    };
  }

  // Update team name after login (if not set by admin)
  public async setTeamName(participantId: string, teamName: string): Promise<Participant | null> {
    const cleanTeam = teamName.trim();
    const supabase = getSupabase();

    if (supabase) {
      try {
        const { data } = await supabase
          .from('participants')
          .update({ team_name: cleanTeam })
          .eq('id', participantId)
          .select()
          .single();
        if (data) return data;
      } catch (err) {
        console.warn('Supabase setTeamName error', err);
      }
    }

    const list = this.getLocalParticipants();
    const idx = list.findIndex(p => p.id === participantId);
    if (idx >= 0) {
      list[idx].team_name = cleanTeam;
      this.saveLocalParticipants(list);
      return list[idx];
    }
    return null;
  }

  // Skip to next question after the per-question timer expired (0 points)
  public async skipQuestion(participantId: string): Promise<{
    success: boolean;
    completedEvent: boolean;
    updatedParticipant: Participant | null;
    message: string;
  }> {
    const [participants, activeQuestions] = await Promise.all([
      this.getParticipants(),
      this.getActiveQuestions(),
    ]);
    const p = participants.find(part => part.id === participantId);
    if (!p) {
      return { success: false, completedEvent: false, updatedParticipant: null, message: 'Participant not found.' };
    }
    if (p.is_banned) {
      return { success: false, completedEvent: false, updatedParticipant: p, message: 'Account disqualified / banned.' };
    }

    const now = new Date().toISOString();
    const nextIndex = p.current_question_index + 1;
    const completedEvent = nextIndex >= activeQuestions.length;
    const updatedData = {
      current_question_index: nextIndex,
      completed: completedEvent,
      completed_at: completedEvent ? now : p.completed_at,
      current_question_started_at: now,
    };

    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from('participants').update(updatedData).eq('id', participantId);
      } catch (err) {
        console.warn('Supabase skip question error', err);
      }
    }
    const updatedList = this.getLocalParticipants().map(part =>
      part.id === participantId ? { ...part, ...updatedData } : part
    );
    this.saveLocalParticipants(updatedList);
    const updatedP = updatedList.find(part => part.id === participantId) || null;
    return {
      success: true,
      completedEvent,
      updatedParticipant: updatedP,
      message: completedEvent
        ? 'Time expired on the final round. Run complete.'
        : 'Time expired. Skipped to next round with 0 points.',
    };
  }

  // Submit Answer for Question (timed mode: points decay while the clock runs)
  public async submitAnswer(
    participantId: string,
    questionId: number,
    rawAnswer: string
  ): Promise<{
    isCorrect: boolean;
    pointsAwarded: number;
    completedEvent: boolean;
    updatedParticipant: Participant | null;
    message: string;
    timedOut: boolean;
    award?: { basePoints: number; elapsedSeconds: number; awarded: number };
  }> {
    // Check if banned
    const participants = await this.getParticipants();
    const currentParticipant = participants.find(part => part.id === participantId);
    if (currentParticipant?.is_banned) {
      return {
        isCorrect: false,
        pointsAwarded: 0,
        completedEvent: false,
        updatedParticipant: currentParticipant,
        timedOut: false,
        message: 'Account disqualified / banned. Submissions rejected.',
      };
    }

    // Dynamically get the current questions directly from Supabase / store
    const [questions, settings] = await Promise.all([
      this.getQuestions(),
      this.getCompetitionSettings(),
    ]);
    const activeQuestions = questions.slice(0, Math.max(1, settings.active_question_count));
    const currentQ = questions.find(q => q.id === questionId);
    if (!currentQ) {
      return {
        isCorrect: false,
        pointsAwarded: 0,
        completedEvent: false,
        updatedParticipant: null,
        timedOut: false,
        message: 'Question not found.',
      };
    }

    // Clean comparison: remove surrounding whitespace, compare uppercase
    const cleanInput = rawAnswer.trim().toUpperCase();
    const cleanAnswer = currentQ.answer.trim().toUpperCase();

    const isCorrect = cleanInput === cleanAnswer;

    // Record submission
    const submission: Submission = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 's-' + Date.now(),
      participant_id: participantId,
      question_id: questionId,
      submitted_answer: rawAnswer,
      is_correct: isCorrect,
      created_at: new Date().toISOString(),
    };

    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from('submissions').insert([submission]);
      } catch (err) {
        console.warn('Supabase submission insert error', err);
      }
    }
    const submissions = this.getLocalSubmissions();
    submissions.push(submission);
    this.saveLocalSubmissions(submissions);

    if (!isCorrect) {
      return {
        isCorrect: false,
        pointsAwarded: 0,
        completedEvent: false,
        updatedParticipant: null,
        timedOut: false,
        message: 'Incorrect cipher text decryption. Glitch detected! Try again.',
      };
    }

    // Answer is correct! Enforce the per-question clock, then decay points.
    // Elapsed time is computed from the stored question-start timestamp so the
    // award never trusts the client clock.
    const p = currentParticipant || (await this.getParticipants()).find(part => part.id === participantId);
    if (!p) {
      return {
        isCorrect: true,
        pointsAwarded: currentQ.points,
        completedEvent: false,
        updatedParticipant: null,
        timedOut: false,
        message: 'Flag accepted!',
      };
    }

    const questionStartMs = p.current_question_started_at
      ? new Date(p.current_question_started_at).getTime()
      : Date.now();
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - questionStartMs) / 1000));

    if (elapsedSeconds > settings.time_limit_seconds) {
      return {
        isCorrect: false,
        pointsAwarded: 0,
        completedEvent: false,
        updatedParticipant: p,
        timedOut: true,
        message: 'Time expired for this round. Use Skip to advance — this submission no longer counts.',
      };
    }

    const awarded = Math.max(0, currentQ.points - elapsedSeconds * settings.decay_per_second);
    const now = new Date().toISOString();
    const nextIndex = p.current_question_index + 1;
    const completedEvent = nextIndex >= activeQuestions.length;
    const newScore = p.score + awarded;
    const completedAt = completedEvent ? now : null;

    const updatedData = {
      current_question_index: nextIndex,
      score: newScore,
      completed: completedEvent,
      completed_at: completedAt,
      current_question_started_at: now,
    };

    if (supabase) {
      try {
        await supabase.from('participants').update(updatedData).eq('id', participantId);
      } catch (err) {
        console.warn('Supabase update progress error', err);
      }
    }

    const updatedList = this.getLocalParticipants().map(part => {
      if (part.id === participantId) {
        return { ...part, ...updatedData };
      }
      return part;
    });
    this.saveLocalParticipants(updatedList);

    const updatedP = updatedList.find(part => part.id === participantId) || null;
    const decayNote = awarded < currentQ.points
      ? ` (decayed from ${currentQ.points} after ${elapsedSeconds}s)`
      : '';

    return {
      isCorrect: true,
      pointsAwarded: awarded,
      completedEvent,
      updatedParticipant: updatedP,
      timedOut: false,
      award: { basePoints: currentQ.points, elapsedSeconds, awarded },
      message: completedEvent
        ? `All ciphers breached! +${awarded} points${decayNote}. Decryption complete. Outstanding performance!`
        : `Decryption successful! +${awarded} points${decayNote}. Accessing next security layer...`,
    };
  }

  // Get Live Leaderboard Entries
  public async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const participants = await this.getParticipants();

    // Sort criteria:
    // 1. Non-banned first
    // 2. Score descending
    // 3. Completed true first
    // 4. Time taken ascending
    const sorted = [...participants].sort((a, b) => {
      if (a.is_banned && !b.is_banned) return 1;
      if (!a.is_banned && b.is_banned) return -1;
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.completed && !b.completed) return -1;
      if (!a.completed && b.completed) return 1;

      // Compute time taken
      const timeA = a.completed_at
        ? new Date(a.completed_at).getTime() - new Date(a.started_at).getTime()
        : Date.now() - new Date(a.started_at).getTime();
      const timeB = b.completed_at
        ? new Date(b.completed_at).getTime() - new Date(b.started_at).getTime()
        : Date.now() - new Date(b.started_at).getTime();

      return timeA - timeB;
    });

    return sorted.map((p, idx) => {
      const timeTakenSec = p.completed_at
        ? Math.max(0, Math.floor((new Date(p.completed_at).getTime() - new Date(p.started_at).getTime()) / 1000))
        : Math.max(0, Math.floor((Date.now() - new Date(p.started_at).getTime()) / 1000));

      return {
        rank: idx + 1,
        id: p.id,
        username: p.username,
        team_name: p.team_name && p.team_name.trim() ? p.team_name : p.username,
        score: p.score,
        current_question_index: p.current_question_index,
        completed: p.completed,
        is_banned: p.is_banned,
        warning_count: p.warning_count || 0,
        time_taken_seconds: timeTakenSec,
        last_active: p.completed_at || p.started_at,
      };
    });
  }
}

export const store = new StoreService();

