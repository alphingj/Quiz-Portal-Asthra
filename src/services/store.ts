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
const STORAGE_PARTICIPANT_TOKEN = 'asthra_participant_token';

// Admin JWT token management
let adminToken: string | null = null;

export function setAdminToken(token: string) {
  adminToken = token;
  sessionStorage.setItem('asthra_admin_token', token);
}

export function getAdminToken(): string | null {
  if (adminToken) return adminToken;
  adminToken = sessionStorage.getItem('asthra_admin_token');
  return adminToken;
}

export function clearAdminToken() {
  adminToken = null;
  sessionStorage.removeItem('asthra_admin_token');
}

function setParticipantToken(token: string) {
  sessionStorage.setItem(STORAGE_PARTICIPANT_TOKEN, token);
}

function getParticipantToken(): string | null {
  return sessionStorage.getItem(STORAGE_PARTICIPANT_TOKEN);
}

export function clearParticipantToken() {
  sessionStorage.removeItem(STORAGE_PARTICIPANT_TOKEN);
}

/** Check if we are in dev mode (no Supabase configured). */
function isDevMode(): boolean {
  // Missing production configuration must fail closed; it must not silently
  // turn the deployed event into a browser-local demo.
  return Boolean(import.meta.env.DEV);
}

/** Call an admin API endpoint with JWT auth. */
async function adminApiCall(action: string, params: Record<string, unknown> = {}): Promise<any> {
  const token = getAdminToken();
  if (!token && !isDevMode()) {
    throw new Error('Admin token not available. Please re-authenticate.');
  }

  const res = await fetch('/api/admin/action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...params }),
  });

  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.message || `Admin action "${action}" failed.`);
  }
  return data;
}

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

  private saveLocalParticipants(participants: Participant[], notify = true) {
    localStorage.setItem(STORAGE_PARTICIPANTS, JSON.stringify(participants));
    if (notify) this.notifyDataUpdate();
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

  private saveLocalQuestions(questions: Question[], notify = true) {
    localStorage.setItem(STORAGE_QUESTIONS, JSON.stringify(questions));
    if (notify) this.notifyDataUpdate();
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

  private saveLocalWarnings(warnings: CheatingWarning[], notify = true) {
    localStorage.setItem(STORAGE_WARNINGS, JSON.stringify(warnings));
    if (notify) this.notifyDataUpdate();
  }

  // --- QUESTIONS API ---
  // Uses questions_public view (no answer column) for participant reads (#2)
  public async getQuestions(): Promise<Question[]> {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('questions_public')
          .select('*')
          .order('order_index', { ascending: true });
        if (error) {
          console.warn('Supabase fetch questions error:', error.message);
          // Fail closed in production (#8): do not fall back to local
          throw new Error(`Database error: ${error.message}`);
        }
        // Distinguish empty result from failure (#36)
        if (data) {
          this.saveLocalQuestions(data, false);
          return data;
        }
      } catch (err) {
        if (!isDevMode()) {
          // In production, propagate the error
          throw err;
        }
        console.warn('Supabase fetch questions error, fallback to local', err);
      }
    }
    if (!isDevMode()) throw new Error('Supabase is not configured. Configure production database environment variables.');
    return this.getLocalQuestions();
  }

  // Admin: update question (via API)
  public async getAdminQuestions(): Promise<Question[]> {
    if (isDevMode()) return this.getLocalQuestions();
    const result = await adminApiCall('getQuestions');
    return result.questions || [];
  }

  public async updateQuestion(id: number, data: Partial<Question>): Promise<Question[]> {
    if (!isDevMode()) {
      await adminApiCall('updateQuestion', { id, data });
    } else {
      const questions = await this.getQuestions();
      const idx = questions.findIndex(q => q.id === id);
      if (idx >= 0) {
        questions[idx] = { ...questions[idx], ...data };
        this.saveLocalQuestions(questions);
      }
    }
    return isDevMode() ? this.getQuestions() : this.getAdminQuestions();
  }

  // Admin: save/upsert question (via API for Supabase, local for dev)
  public async saveQuestion(question: Question): Promise<Question[]> {
    if (!isDevMode()) {
      // When called from AdminPanel after API insert, just refresh from DB
      return this.getAdminQuestions();
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

  // Admin: delete question (via API with atomic RPC) (#10)
  public async deleteQuestion(id: number): Promise<Question[]> {
    if (!isDevMode()) {
      await adminApiCall('deleteQuestion', { id });
    } else {
      const questions = this.getLocalQuestions().filter(q => q.id !== id);
      const renumbered = questions
        .sort((a, b) => a.order_index - b.order_index)
        .map((q, i) => ({ ...q, order_index: i + 1, round_number: i + 1 }));
      this.saveLocalQuestions(renumbered);
    }
    return isDevMode() ? this.getQuestions() : this.getAdminQuestions();
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

  private saveLocalSettings(settings: CompetitionSettings, notify = true) {
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
    if (notify) this.notifyDataUpdate();
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
        if (error) {
          console.warn('Supabase fetch settings error:', error.message);
          if (!isDevMode()) throw new Error(`Database error: ${error.message}`);
        }
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
          this.saveLocalSettings(settings, false);
          return settings;
        }
      } catch (err) {
        if (!isDevMode()) throw err;
        console.warn('Supabase fetch settings error, fallback to local', err);
      }
    }
    if (!isDevMode()) throw new Error('Supabase is not configured. Configure production database environment variables.');
    return this.getLocalSettings();
  }

  // Admin: update competition settings (via API) (#15 - called on explicit save)
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

    if (!isDevMode()) {
      await adminApiCall('updateSettings', {
        settings: {
          status: next.status,
          started_at: next.started_at,
          time_limit_seconds: next.time_limit_seconds,
          decay_per_second: next.decay_per_second,
          active_question_count: next.active_question_count,
        },
      });
      // Re-fetch from DB to ensure consistency
      return this.getCompetitionSettings();
    }

    this.saveLocalSettings(next);
    return next;
  }

  // Questions actually in play: first N by order_index
  public async getActiveQuestions(): Promise<Question[]> {
    const [questions, settings] = await Promise.all([
      this.getQuestions(),
      this.getCompetitionSettings(),
    ]);
    // Clamp active count to actual question count (#9)
    const activeCount = Math.min(Math.max(1, settings.active_question_count), questions.length);
    return questions.slice(0, activeCount);
  }

  // START COMPETITION: go live + reset every participant for a fresh run (atomic RPC #14)
  public async startCompetition(): Promise<CompetitionSettings> {
    if (!isDevMode()) {
      await adminApiCall('startCompetition');
      return this.getCompetitionSettings();
    }
    // Local dev fallback
    const now = new Date().toISOString();
    const resetData = {
      current_question_index: 0,
      score: 0,
      completed: false,
      started_at: now,
      completed_at: null,
      current_question_started_at: now,
    };
    this.saveLocalParticipants(this.getLocalParticipants().map(p => ({ ...p, ...resetData })));
    const settings = this.getLocalSettings();
    const next = { ...settings, status: 'live' as const, started_at: now, updated_at: now };
    this.saveLocalSettings(next);
    return next;
  }

  // END COMPETITION: lock the quiz terminal
  public async endCompetition(): Promise<CompetitionSettings> {
    if (!isDevMode()) {
      await adminApiCall('endCompetition');
      return this.getCompetitionSettings();
    }
    const settings = this.getLocalSettings();
    const next = { ...settings, status: 'ended' as const, updated_at: new Date().toISOString() };
    this.saveLocalSettings(next);
    return next;
  }

  // Back to waiting room (re-arm for another run without wiping config)
  public async resetCompetitionToWaiting(): Promise<CompetitionSettings> {
    if (!isDevMode()) {
      await adminApiCall('resetToWaiting');
      return this.getCompetitionSettings();
    }
    const settings = this.getLocalSettings();
    const next = { ...settings, status: 'waiting' as const, started_at: null, updated_at: new Date().toISOString() };
    this.saveLocalSettings(next);
    return next;
  }

  // Clear trial scores/progress/warnings while preserving questions/settings.
  public async resetTrialData(): Promise<CompetitionSettings> {
    if (!isDevMode()) {
      await adminApiCall('resetTrialData');
      this.saveLocalWarnings([]);
      return this.getCompetitionSettings();
    }

    const now = new Date().toISOString();
    this.saveLocalParticipants(this.getLocalParticipants().map(p => ({
      ...p,
      current_question_index: 0,
      score: 0,
      completed: false,
      started_at: now,
      completed_at: null,
      current_question_started_at: now,
      warning_count: 0,
    })));
    this.saveLocalWarnings([]);
    const settings = this.getLocalSettings();
    const next = { ...settings, status: 'waiting' as const, started_at: null, updated_at: now };
    this.saveLocalSettings(next);
    return next;
  }

  // Ensure a participant has a per-question start timestamp (backfills legacy
  // rows and late joiners). Returns the fresh participant row.
  public async ensureQuestionStart(participantId: string): Promise<Participant | null> {
    const participants = await this.getParticipants();
    const p = participants.find(part => part.id === participantId);
    if (!p) return null;
    if (p.current_question_started_at) return p;

    // Production timestamps are initialized by the schema/start RPC. Do not
    // attempt a client-side participant update through the public view.
    if (!isDevMode()) return p;
    const now = new Date().toISOString();
    const list = this.getLocalParticipants().map(part =>
      part.id === participantId ? { ...part, current_question_started_at: now } : part
    );
    this.saveLocalParticipants(list);
    return { ...p, current_question_started_at: now };
  }

  // --- PARTICIPANTS API ---
  public async getAdminParticipants(): Promise<Participant[]> {
    if (isDevMode()) return this.getLocalParticipants();
    const result = await adminApiCall('getParticipants');
    return result.participants || [];
  }

  public async getParticipants(): Promise<Participant[]> {
    const supabase = getSupabase();
    if (supabase) {
      try {
        // Select only safe columns — never select password_hash (#2)
        const { data, error } = await supabase
          .from('participants_public')
          .select('id, username, team_name, current_question_index, score, completed, is_banned, started_at, completed_at, created_at, current_question_started_at')
          .order('score', { ascending: false });
        if (error) {
          console.warn('Supabase fetch participants error:', error.message);
          if (!isDevMode()) throw new Error(`Database error: ${error.message}`);
        }
        if (!error && data) {
          this.saveLocalParticipants(data, false);
          return data;
        }
      } catch (err) {
        if (!isDevMode()) throw err;
        console.warn('Supabase fetch participants error, fallback to local', err);
      }
    }
    if (!isDevMode()) throw new Error('Supabase is not configured. Configure production database environment variables.');
    return this.getLocalParticipants();
  }

  // Admin: registers participant (via API) (#7 - checks error)
  public async createParticipant(username: string, password: string, teamName?: string, role?: 'admin' | 'moderator' | 'participant'): Promise<{ success: boolean; message: string; participant?: Participant }> {
    const trimmedUsername = username.trim().toLowerCase();
    const trimmedTeam = teamName?.trim() || null;
    const trimmedRole = role || 'participant';

    if (!trimmedUsername || !password.trim()) {
      return { success: false, message: 'Username and password are required.' };
    }

    if (!isDevMode()) {
      try {
        const result = await adminApiCall('createParticipant', {
          username: trimmedUsername,
          password: password.trim(),
          teamName: trimmedTeam,
          role: trimmedRole,
        });
        await this.getParticipants(); // refresh cache
        return { success: true, message: 'Participant created successfully!', participant: result.participant };
      } catch (err: any) {
        return { success: false, message: err.message || 'Failed to create participant.' };
      }
    }

    // Local fallback
    const newParticipant: Participant = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'p-' + Date.now(),
      username: trimmedUsername,
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

    const list = this.getLocalParticipants();
    if (list.some(p => p.username.toLowerCase() === trimmedUsername)) {
      return { success: false, message: 'A participant with this username already exists.' };
    }
    list.push(newParticipant);
    this.saveLocalParticipants(list);
    return { success: true, message: 'Participant created successfully (Local Storage)!', participant: newParticipant };
  }

  // Admin: delete participant (via API) (#7)
  public async deleteParticipant(id: string): Promise<boolean> {
    if (!isDevMode()) {
      await adminApiCall('deleteParticipant', { id });
      await this.getParticipants(); // refresh cache
      return true;
    }
    const list = this.getLocalParticipants().filter(p => p.id !== id);
    this.saveLocalParticipants(list);
    return true;
  }

  // Admin: reset participant progress (via API) (#7)
  public async resetParticipant(id: string): Promise<boolean> {
    if (!isDevMode()) {
      await adminApiCall('resetParticipant', { id });
      await this.getParticipants();
      return true;
    }
    const updateData = {
      current_question_index: 0,
      score: 0,
      completed: false,
      started_at: new Date().toISOString(),
      completed_at: null,
      current_question_started_at: new Date().toISOString(),
    };
    const list = this.getLocalParticipants().map(p =>
      p.id === id ? { ...p, ...updateData } : p
    );
    this.saveLocalParticipants(list);
    return true;
  }

  // Admin: update participant password (via API) (#7)
  public async updateParticipantPassword(id: string, newPassword: string): Promise<boolean> {
    if (!isDevMode()) {
      await adminApiCall('updatePassword', { id, newPassword });
      return true;
    }
    // In dev mode, no-op (passwords not stored locally)
    return true;
  }

  // Admin: update participant role (via API) (#7)
  public async updateParticipantRole(id: string, role: 'admin' | 'moderator' | 'participant'): Promise<boolean> {
    if (!isDevMode()) {
      await adminApiCall('updateRole', { id, role });
      await this.getParticipants();
      return true;
    }
    const list = this.getLocalParticipants().map(p =>
      p.id === id ? { ...p, role } : p
    );
    this.saveLocalParticipants(list);
    return true;
  }

  // Admin: ban or unban participant (via API) (#7)
  public async banParticipant(id: string, isBanned: boolean): Promise<boolean> {
    if (!isDevMode()) {
      await adminApiCall('banParticipant', { id, isBanned });
      await this.getParticipants();
      return true;
    }
    const list = this.getLocalParticipants().map(p =>
      p.id === id ? { ...p, is_banned: isBanned } : p
    );
    this.saveLocalParticipants(list);
    return true;
  }

  // Admin: deduct points (via API) (#7)
  public async deductPoints(id: string, penalty: number): Promise<{ success: boolean; newScore: number }> {
    if (!isDevMode()) {
      const result = await adminApiCall('deductPoints', { id, penalty });
      await this.getParticipants();
      return { success: true, newScore: result.newScore };
    }
    const participants = this.getLocalParticipants();
    const p = participants.find(part => part.id === id);
    if (!p) return { success: false, newScore: 0 };
    const newScore = Math.max(0, p.score - penalty);
    const list = participants.map(part =>
      part.id === id ? { ...part, score: newScore } : part
    );
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

    const supabase = getSupabase();
    if (supabase && !isDevMode()) {
      try {
        const token = getParticipantToken();
        const res = await fetch('/api/participant/warning', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ eventType, details: warning.details }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.message || 'Warning service failed.');
        const list = this.getLocalParticipants().map(part =>
          part.id === participantId ? { ...part, warning_count: data.warningCount } : part
        );
        this.saveLocalParticipants(list);
      } catch (err) {
        console.warn('Warning submission failed:', err);
        throw err;
      }
    } else {
      // Dev mode: local increment
      const participants = this.getLocalParticipants();
      const p = participants.find(part => part.id === participantId);
      const newCount = (p?.warning_count || 0) + 1;
      const list = participants.map(part =>
        part.id === participantId ? { ...part, warning_count: newCount } : part
      );
      this.saveLocalParticipants(list);
    }

    // Save warning locally
    const warnings = this.getLocalWarnings();
    warnings.unshift(warning);
    this.saveLocalWarnings(warnings);

    return warning;
  }

  public async getWarnings(): Promise<CheatingWarning[]> {
    if (!isDevMode()) {
      const result = await adminApiCall('getWarnings');
      const formatted: CheatingWarning[] = (result.warnings || []).map((d: any) => ({
        id: d.id,
        participant_id: d.participant_id,
        username: d.username,
        team_name: d.team_name,
        event_type: d.event_type,
        details: d.details,
        timestamp: d.created_at || new Date().toISOString(),
      }));
      this.saveLocalWarnings(formatted, false);
      return formatted;
    }
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('warnings')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) {
          console.warn('Supabase fetch warnings error:', error.message);
          if (!isDevMode()) throw new Error(`Database error: ${error.message}`);
        }
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
          this.saveLocalWarnings(formatted, false);
          return formatted;
        }
      } catch (err) {
        if (!isDevMode()) throw err;
        console.warn('Supabase fetch warnings error', err);
      }
    }
    return this.getLocalWarnings();
  }

  public async clearWarnings(): Promise<boolean> {
    if (!isDevMode()) {
      await adminApiCall('clearWarnings');
    }
    this.saveLocalWarnings([]);
    return true;
  }

  // Participant Login (via server-side API — passwords never reach browser #2, #31)
  public async loginParticipant(username: string, password: string): Promise<{
    success: boolean;
    message: string;
    participant?: Participant;
    needsTeamName?: boolean;
  }> {
    const trimmedUser = username.trim().toLowerCase();

    // Try server-side login first
    try {
      const res = await fetch('/api/participant/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUser, password: password.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        if (data.token) setParticipantToken(data.token);
        return {
          success: true,
          message: data.message || 'Access granted. Welcome to KeyBreak!',
          participant: data.participant,
          needsTeamName: data.needsTeamName,
        };
      }
      // Server returned an error
      return { success: false, message: data.message || 'Login failed.' };
    } catch {
      // API unreachable — fall back to local if in dev mode
      if (!isDevMode()) {
        return { success: false, message: 'Login service unavailable. Please try again.' };
      }
    }

    // Local dev fallback (no passwords in local mode)
    const list = this.getLocalParticipants();
    const match = list.find(p => p.username.toLowerCase() === trimmedUser);
    if (!match) {
      return { success: false, message: 'Participant username not found. Contact the Asthra admin table to register.' };
    }
    if (match.is_banned) {
      return { success: false, message: 'ACCESS DENIED: Your account has been disqualified / banned by event administrators.' };
    }
    const needsTeamName = !match.team_name || match.team_name.trim() === '';
    return {
      success: true,
      message: 'Access granted. Welcome to KeyBreak!',
      participant: match,
      needsTeamName,
    };
  }

  // Update team name after login (if not set by admin) (#33 - update local cache)
  public async setTeamName(participantId: string, teamName: string): Promise<Participant | null> {
    const cleanTeam = teamName.trim();
    if (!cleanTeam || cleanTeam.length > 100) return null;

    if (!isDevMode()) {
      const token = getParticipantToken();
      try {
        const res = await fetch('/api/participant/team-name', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ teamName: cleanTeam }),
        });
        const result = await res.json();
        if (!res.ok || !result.ok) throw new Error(result.message || 'Unable to update team name.');
        const list = this.getLocalParticipants().map(p =>
          p.id === participantId ? { ...p, ...result.participant } : p
        );
        this.saveLocalParticipants(list);
        return result.participant;
      } catch (err) {
        console.warn('Team name update failed:', err);
        return null;
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
  // Routes through server-side RPC for validation (#4, #6, #12)
  public async skipQuestion(participantId: string): Promise<{
    success: boolean;
    completedEvent: boolean;
    updatedParticipant: Participant | null;
    message: string;
  }> {
    // Try server-side RPC first
    try {
      const res = await fetch('/api/participant/skip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getParticipantToken() ? { Authorization: `Bearer ${getParticipantToken()}` } : {}),
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        return {
          success: false,
          completedEvent: false,
          updatedParticipant: null,
          message: data.message || 'Skip failed.',
        };
      }

      // Update local cache with server response
      const updatedP = data.updatedParticipant;
      if (updatedP) {
        const localList = this.getLocalParticipants().map(part =>
          part.id === participantId ? { ...part, ...updatedP } : part
        );
        this.saveLocalParticipants(localList);
      }

      return {
        success: data.success,
        completedEvent: data.completedEvent,
        updatedParticipant: updatedP ? { ...this.getLocalParticipants().find(p => p.id === participantId)!, ...updatedP } : null,
        message: data.message,
      };
    } catch {
      if (!isDevMode()) {
        return { success: false, completedEvent: false, updatedParticipant: null, message: 'Skip service unavailable.' };
      }
    }

    // Local dev fallback
    const [participants, activeQuestions] = await Promise.all([
      this.getParticipants(),
      this.getActiveQuestions(),
    ]);
    const p = participants.find(part => part.id === participantId);
    if (!p) return { success: false, completedEvent: false, updatedParticipant: null, message: 'Participant not found.' };
    if (p.is_banned) return { success: false, completedEvent: false, updatedParticipant: p, message: 'Account disqualified / banned.' };

    const now = new Date().toISOString();
    const nextIndex = p.current_question_index + 1;
    const completedEvent = nextIndex >= activeQuestions.length;
    const updatedData = {
      current_question_index: nextIndex,
      completed: completedEvent,
      completed_at: completedEvent ? now : p.completed_at,
      current_question_started_at: now,
    };

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

  // Submit Answer for Question (via server-side RPC) (#4, #5, #6, #13)
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
    // Try server-side RPC first
    try {
      const res = await fetch('/api/participant/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getParticipantToken() ? { Authorization: `Bearer ${getParticipantToken()}` } : {}),
        },
        body: JSON.stringify({ questionId, rawAnswer }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        return {
          isCorrect: false,
          pointsAwarded: 0,
          completedEvent: false,
          updatedParticipant: null,
          timedOut: false,
          message: data.message || 'Submission failed.',
        };
      }

      // Update local cache with server response
      const updatedP = data.updatedParticipant;
      if (updatedP) {
        const localList = this.getLocalParticipants().map(part =>
          part.id === participantId ? { ...part, ...updatedP } : part
        );
        this.saveLocalParticipants(localList);
      }

      return {
        isCorrect: data.isCorrect,
        pointsAwarded: data.pointsAwarded || 0,
        completedEvent: data.completedEvent || false,
        updatedParticipant: updatedP ? { ...this.getLocalParticipants().find(p => p.id === participantId)!, ...updatedP } : null,
        timedOut: data.timedOut || false,
        award: data.award,
        message: data.message,
      };
    } catch {
      if (!isDevMode()) {
        return {
          isCorrect: false,
          pointsAwarded: 0,
          completedEvent: false,
          updatedParticipant: null,
          timedOut: false,
          message: 'Submission service unavailable. Please try again.',
        };
      }
    }

    // Local dev fallback — simplified scoring
    const participants = this.getLocalParticipants();
    const currentParticipant = participants.find(part => part.id === participantId);
    if (currentParticipant?.is_banned) {
      return { isCorrect: false, pointsAwarded: 0, completedEvent: false, updatedParticipant: currentParticipant, timedOut: false, message: 'Account disqualified / banned.' };
    }

    const [questions, settings] = await Promise.all([
      this.getQuestions(),
      this.getCompetitionSettings(),
    ]);
    const activeQuestions = questions.slice(0, Math.max(1, settings.active_question_count));
    const currentQ = questions.find(q => q.id === questionId);
    if (!currentQ) {
      return { isCorrect: false, pointsAwarded: 0, completedEvent: false, updatedParticipant: null, timedOut: false, message: 'Question not found.' };
    }

    const cleanInput = rawAnswer.trim().toUpperCase();
    const cleanAnswer = currentQ.answer.trim().toUpperCase();
    const isCorrect = cleanInput === cleanAnswer;

    // Record submission locally (#34 - only local in dev mode)
    const submission: Submission = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 's-' + Date.now(),
      participant_id: participantId,
      question_id: questionId,
      submitted_answer: rawAnswer,
      is_correct: isCorrect,
      created_at: new Date().toISOString(),
    };
    const submissions = this.getLocalSubmissions();
    submissions.push(submission);
    this.saveLocalSubmissions(submissions);

    if (!isCorrect) {
      return { isCorrect: false, pointsAwarded: 0, completedEvent: false, updatedParticipant: null, timedOut: false, message: 'Incorrect cipher text decryption. Glitch detected! Try again.' };
    }

    const p = currentParticipant || this.getLocalParticipants().find(part => part.id === participantId);
    if (!p) {
      return { isCorrect: true, pointsAwarded: currentQ.points, completedEvent: false, updatedParticipant: null, timedOut: false, message: 'Flag accepted!' };
    }

    const awarded = currentQ.points;
    const now = new Date().toISOString();
    const nextIndex = p.current_question_index + 1;
    const completedEvent = nextIndex >= activeQuestions.length;
    const newScore = p.score + awarded;

    const updatedData = {
      current_question_index: nextIndex,
      score: newScore,
      completed: completedEvent,
      completed_at: completedEvent ? now : null,
      current_question_started_at: now,
    };

    const updatedList = this.getLocalParticipants().map(part =>
      part.id === participantId ? { ...part, ...updatedData } : part
    );
    this.saveLocalParticipants(updatedList);
    const updatedP = updatedList.find(part => part.id === participantId) || null;

    return {
      isCorrect: true,
      pointsAwarded: awarded,
      completedEvent,
      updatedParticipant: updatedP,
      timedOut: false,
      award: { basePoints: currentQ.points, elapsedSeconds: 0, awarded },
      message: completedEvent
        ? `All ciphers breached! +${awarded} points. Decryption complete. Outstanding performance!`
        : `Decryption successful! +${awarded} points. Accessing next security layer...`,
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

  // Re-fetch a single participant by ID (for stale session detection #27)
  public async refreshParticipant(participantId: string): Promise<Participant | null> {
    if (!isDevMode()) {
      try {
        const token = getParticipantToken();
        const res = await fetch('/api/participant/me', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.status === 404 || res.status === 401) return null;
        if (!res.ok) throw new Error('Participant service unavailable.');
        const result = await res.json();
        return result.ok ? result.participant : null;
      } catch {
        throw new Error('Participant service unavailable.');
      }
    }
    const list = this.getLocalParticipants();
    return list.find(p => p.id === participantId) || null;
  }
}

export const store = new StoreService();
