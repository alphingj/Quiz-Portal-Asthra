import type { Participant, Question, Submission, LeaderboardEntry, CheatingWarning } from '../types';
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
    };

    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('participants')
          .insert([newParticipant])
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
        await supabase.from('warnings').insert([warning]);
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

  // Submit Answer for Question
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
        message: 'Account disqualified / banned. Submissions rejected.',
      };
    }

    // Dynamically get the current questions directly from Supabase / store
    const questions = await this.getQuestions();
    const currentQ = questions.find(q => q.id === questionId);
    if (!currentQ) {
      return {
        isCorrect: false,
        pointsAwarded: 0,
        completedEvent: false,
        updatedParticipant: null,
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
        message: 'Incorrect cipher text decryption. Glitch detected! Try again.',
      };
    }

    // Answer is correct! Calculate progression
    const p = currentParticipant || (await this.getParticipants()).find(part => part.id === participantId);
    if (!p) {
      return {
        isCorrect: true,
        pointsAwarded: currentQ.points,
        completedEvent: false,
        updatedParticipant: null,
        message: 'Flag accepted!',
      };
    }

    const nextIndex = p.current_question_index + 1;
    const completedEvent = nextIndex >= questions.length;
    const newScore = p.score + currentQ.points;
    const completedAt = completedEvent ? new Date().toISOString() : null;

    const updatedData = {
      current_question_index: nextIndex,
      score: newScore,
      completed: completedEvent,
      completed_at: completedAt,
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

    return {
      isCorrect: true,
      pointsAwarded: currentQ.points,
      completedEvent,
      updatedParticipant: updatedP,
      message: completedEvent
        ? 'All ciphers breached! Decryption complete. Outstanding performance!'
        : `Decryption successful! +${currentQ.points} points. Accessing next security layer...`,
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

