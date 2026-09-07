export interface Participant {
  id: string;
  username: string;
  password?: string;
  team_name: string | null;
  current_question_index: number;
  score: number;
  completed: boolean;
  is_banned?: boolean;
  warning_count?: number;
  role?: 'admin' | 'moderator' | 'participant';
  started_at: string;
  completed_at: string | null;
  created_at: string;
  current_question_started_at?: string | null;
}

export interface Question {
  id: number;
  round_number: number;
  title: string;
  cipher_type: string;
  ciphertext: string;
  clue: string | null;
  answer: string;
  points: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  order_index: number;
}

export interface Submission {
  id: string;
  participant_id: string;
  question_id: number;
  submitted_answer: string;
  is_correct: boolean;
  created_at: string;
}

export interface CheatingWarning {
  id: string;
  participant_id: string;
  username: string;
  team_name: string | null;
  event_type: 'tab_switch' | 'window_blur' | 'window_minimize';
  details?: string;
  timestamp: string;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  team_name: string;
  score: number;
  current_question_index: number;
  completed: boolean;
  is_banned?: boolean;
  warning_count?: number;
  time_taken_seconds: number;
  last_active: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  connected: boolean;
}

export type CompetitionStatus = 'waiting' | 'live' | 'ended';

export interface CompetitionSettings {
  id: number;
  status: CompetitionStatus;
  started_at: string | null;
  time_limit_seconds: number;
  decay_per_second: number;
  active_question_count: number;
  updated_at: string;
}

export const DEFAULT_COMPETITION_SETTINGS: CompetitionSettings = {
  id: 1,
  status: 'waiting',
  started_at: null,
  time_limit_seconds: 600,
  decay_per_second: 1,
  active_question_count: 3,
  updated_at: new Date().toISOString(),
};

export interface AwardBreakdown {
  basePoints: number;
  elapsedSeconds: number;
  awarded: number;
  timedOut: boolean;
}

