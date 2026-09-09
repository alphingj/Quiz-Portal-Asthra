import { useState, useEffect, useCallback } from 'react';
import type { Participant, Question, CheatingWarning, CompetitionSettings } from '../types';
import { DEFAULT_COMPETITION_SETTINGS } from '../types';
import { store, setAdminToken, getAdminToken } from '../services/store';
import { 
  getSupabaseConfig, 
  saveSupabaseConfig, 
  testSupabaseConnection,
  getSupabase
} from '../services/supabaseClient';
import { soundManager } from '../services/audio';
import schemaSql from '../../supabase_schema.sql?raw';
import { 
  Shield, 
  UserPlus, 
  Database, 
  List, 
  RotateCcw, 
  Trash2, 
  CheckCircle2, 
  Terminal,
  Unlock,
  Ban,
  Edit3,
  AlertOctagon,
  Clock,
  Save,
  X,
  AlertCircle,
  Key,
  Check,
  Copy,
  Lock,
  Play,
  Square,
  Plus,
  Timer,
  Flag
} from 'lucide-react';

// Local-dev fallback only (used when /api/admin-verify is unreachable,
// e.g. plain `vite dev`). In production the passkey is verified server-side
// via the `ADMIN_PASSKEY` env var and never ships to the browser.
const DEV_ADMIN_PASSKEY = import.meta.env.VITE_ADMIN_PASSKEY as string | undefined;

export const AdminPanel: React.FC = () => {
  // Admin authentication state
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [passkeyInput, setPasskeyInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Active admin tab
  const [adminTab, setAdminTab] = useState<'create' | 'roster' | 'questions' | 'warnings' | 'database'>('roster');

  // New Participant Form
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'moderator' | 'participant'>('participant');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{ isError: boolean; message: string } | null>(null);

  // Roster state
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  // Questions state & editing
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editForm, setEditForm] = useState<Question | null>(null);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [questionFeedback, setQuestionFeedback] = useState<string | null>(null);

  // Add-question form state
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [addForm, setAddForm] = useState({
    title: '',
    cipher_type: '',
    ciphertext: '',
    clue: '',
    answer: '',
    points: 100,
    difficulty: 'Beginner' as 'Beginner' | 'Intermediate' | 'Advanced',
  });
  const [addingQuestion, setAddingQuestion] = useState(false);

  // Timed-competition settings + controls
  const [compSettings, setCompSettings] = useState<CompetitionSettings>({ ...DEFAULT_COMPETITION_SETTINGS });
  const [compBusy, setCompBusy] = useState(false);

  // Draft settings state (debounced save #15)
  const [draftSettings, setDraftSettings] = useState<{
    time_limit_seconds: number;
    decay_per_second: number;
    active_question_count: number;
  } | null>(null);

  // Loading error state (#26)
  const [loadError, setLoadError] = useState<string | null>(null);

  // Warnings state & timeout penalties
  const [warnings, setWarnings] = useState<CheatingWarning[]>([]);
  const [loadingWarnings, setLoadingWarnings] = useState(false);
  const [penaltyFeedback, setPenaltyFeedback] = useState<string | null>(null);

  // Supabase Settings state
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<{ testing: boolean; message: string | null; success?: boolean }>({
    testing: false,
    message: null,
  });
  const [copiedSql, setCopiedSql] = useState(false);

  // Password reset modal state
  const [resetPasswordModal, setResetPasswordModal] = useState<{
    isOpen: boolean;
    participantId: string | null;
    participantUsername: string | null;
    currentPassword: string;
    newPassword: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    participantId: null,
    participantUsername: null,
    currentPassword: '',
    newPassword: '',
    isSubmitting: false,
  });

  // Role edit modal state
  const [roleEditModal, setRoleEditModal] = useState<{
    isOpen: boolean;
    participantId: string | null;
    participantUsername: string | null;
    currentRole: string;
    newRole: 'admin' | 'moderator' | 'participant';
    isSubmitting: boolean;
  }>({
    isOpen: false,
    participantId: null,
    participantUsername: null,
    currentRole: 'participant',
    newRole: 'participant',
    isSubmitting: false,
  });

  useEffect(() => {
    const config = getSupabaseConfig();
    setSupabaseUrl(config.url);
    setSupabaseKey(config.anonKey);
  }, []);

  const refreshRoster = useCallback(async () => {
    setLoadingRoster(true);
    try {
      const list = await store.getAdminParticipants();
      setParticipants(list);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(`Failed to load roster: ${err.message}`);
    } finally {
      setLoadingRoster(false);
    }
  }, []);

  const refreshQuestions = useCallback(async () => {
    try {
      const qList = await store.getAdminQuestions();
      setQuestions(qList);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(`Failed to load questions: ${err.message}`);
    }
  }, []);

  const refreshCompSettings = useCallback(async () => {
    try {
      const s = await store.getCompetitionSettings();
      const qList = await store.getAdminQuestions();
      if (s.active_question_count > qList.length && qList.length > 0) {
        const fixed = await store.updateCompetitionSettings({ active_question_count: qList.length });
        setCompSettings(fixed);
      } else {
        setCompSettings(s);
      }
      setDraftSettings(null); // Reset draft to match saved
      setLoadError(null);
    } catch (err: any) {
      setLoadError(`Failed to load settings: ${err.message}`);
    }
  }, []);

  const refreshWarnings = useCallback(async () => {
    setLoadingWarnings(true);
    try {
      const list = await store.getWarnings();
      setWarnings(list);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(`Failed to load warnings: ${err.message}`);
    } finally {
      setLoadingWarnings(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdminAuthenticated) return;

    refreshRoster();
    refreshQuestions();
    refreshWarnings();
    refreshCompSettings();

    // Realtime Supabase subscription for Admin Panel
    const client = getSupabase();
    let channel: any = null;
    if (client) {
      try {
        channel = client
          .channel('public:admin_panel_live')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => {
            refreshRoster();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'warnings' }, () => {
            refreshWarnings();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, () => {
            refreshQuestions();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_settings' }, () => {
            refreshCompSettings();
          })
          .subscribe();
      } catch (err) {
        console.warn('Realtime admin subscription failed:', err);
      }
    }

    // Local / cross-tab broadcast updates
    const handleLocalUpdate = () => {
      refreshRoster();
      refreshQuestions();
      refreshWarnings();
      refreshCompSettings();
    };
    window.addEventListener('asthra_data_update', handleLocalUpdate);
    window.addEventListener('storage', handleLocalUpdate);

    return () => {
      if (client && channel) {
        client.removeChannel(channel);
      }
      window.removeEventListener('asthra_data_update', handleLocalUpdate);
      window.removeEventListener('storage', handleLocalUpdate);
    };
  }, [isAdminAuthenticated]);

  const handleAdminAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passkeyInput.trim() || authLoading) return;
    setAuthLoading(true);
    setAuthError('');

    const grantAccess = () => {
      soundManager.playSuccess();
      setIsAdminAuthenticated(true);
      setAuthError('');
      setPasskeyInput('');
    };
    const denyAccess = (message: string) => {
      soundManager.playError();
      setAuthError(message);
    };

    try {
      // Primary path: server-side verification (production on Vercel).
      const res = await fetch('/api/admin-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkey: passkeyInput }),
      });
      if (res.ok) {
        const data = await res.json();
        // Store JWT token for subsequent admin API calls (#3)
        if (data.token) {
          setAdminToken(data.token);
        }
        grantAccess();
      } else {
        const data = await res.json().catch(() => ({}));
        denyAccess(data.message || 'Invalid Admin Passkey. Access restricted to Asthra 11.0 event staff.');
      }
    } catch {
      // Fallback path: API unreachable (e.g. local `vite dev` without
      // `vercel dev`). Compare against the dev-only env var.
      if (import.meta.env.DEV && DEV_ADMIN_PASSKEY && passkeyInput === DEV_ADMIN_PASSKEY) {
        grantAccess();
      } else {
        denyAccess(
            import.meta.env.DEV && DEV_ADMIN_PASSKEY
            ? 'Invalid Admin Passkey. Access restricted to Asthra 11.0 event staff.'
            : 'Admin verification service unreachable. Run via `vercel dev` or set VITE_ADMIN_PASSKEY for local development.'
        );
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleOpenResetPassword = (id: string, username: string) => {
    soundManager.playKeypress();
    setResetPasswordModal({
      isOpen: true,
      participantId: id,
      participantUsername: username,
      currentPassword: '(hidden)',
      newPassword: '',
      isSubmitting: false,
    });
  };

  const handleResetPassword = async () => {
    if (!resetPasswordModal.participantId || !resetPasswordModal.newPassword.trim()) return;
    setResetPasswordModal(prev => ({ ...prev, isSubmitting: true }));
    soundManager.playKeypress();
    try {
      const success = await store.updateParticipantPassword(
        resetPasswordModal.participantId,
        resetPasswordModal.newPassword
      );
      if (success) {
        soundManager.playSuccess();
        refreshRoster();
        setResetPasswordModal({ isOpen: false, participantId: null, participantUsername: null, currentPassword: '', newPassword: '', isSubmitting: false });
      } else {
        soundManager.playError();
      }
    } catch {
      soundManager.playError();
    }
    setResetPasswordModal(prev => ({ ...prev, isSubmitting: false }));
  };

  const handleOpenRoleEdit = (id: string, username: string, currentRole: string) => {
    soundManager.playKeypress();
    setRoleEditModal({
      isOpen: true,
      participantId: id,
      participantUsername: username,
      currentRole,
      newRole: (currentRole as 'admin' | 'moderator' | 'participant') || 'participant',
      isSubmitting: false,
    });
  };

  const handleRoleEdit = async () => {
    if (!roleEditModal.participantId) return;
    setRoleEditModal(prev => ({ ...prev, isSubmitting: true }));
    soundManager.playKeypress();
    try {
      const success = await store.updateParticipantRole(
        roleEditModal.participantId,
        roleEditModal.newRole
      );
      if (success) {
        soundManager.playSuccess();
        refreshRoster();
        setRoleEditModal({ isOpen: false, participantId: null, participantUsername: null, currentRole: '', newRole: 'participant', isSubmitting: false });
      } else {
        soundManager.playError();
      }
    } catch {
      soundManager.playError();
    }
    setRoleEditModal(prev => ({ ...prev, isSubmitting: false }));
  };

  const handleToggleBan = async (id: string, newBanned: boolean, username: string) => {
    const action = newBanned ? 'BAN and DISQUALIFY' : 'UNBAN and RESTORE';
    if (confirm(`Are you sure you want to ${action} participant "${username}"?`)) {
      soundManager.playKeypress();
      await store.banParticipant(id, newBanned);
      await refreshRoster();
      await refreshWarnings();
    }
  };

  const handleDeductPoints = async (participantId: string, penalty: number, username: string) => {
    soundManager.playKeypress();
    const res = await store.deductPoints(participantId, penalty);
    if (res.success) {
      soundManager.playSuccess();
      setPenaltyFeedback(`Deducted ${penalty} PTS timeout penalty from "${username}". Current score: ${res.newScore} PTS.`);
      setTimeout(() => setPenaltyFeedback(null), 5000);
      refreshRoster();
    }
  };

  const handleCustomPenalty = async (participantId: string, username: string) => {
    const amountStr = prompt(`Enter point deduction timeout penalty for "${username}":`, '50');
    if (!amountStr) return;
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid positive integer.');
      return;
    }
    await handleDeductPoints(participantId, amount, username);
  };

  const handleStartEditQuestion = (q: Question) => {
    soundManager.playKeypress();
    setEditingQuestion(q);
    setEditForm({ ...q });
    setQuestionFeedback(null);
  };

  const handleSaveQuestionEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm) return;

    setSavingQuestion(true);
    soundManager.playKeypress();

    try {
      const updated = await store.updateQuestion(editForm.id, editForm);
      setQuestions(updated);
      soundManager.playSuccess();
      setQuestionFeedback(`Round ${editForm.round_number} (${editForm.title}) saved to Supabase!`);
      setTimeout(() => {
        setQuestionFeedback(null);
        setEditingQuestion(null);
      }, 1500);
    } catch (err: any) {
      soundManager.playError();
      setQuestionFeedback(`Error saving question: ${err.message || 'Failed'}`);
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleClearWarnings = async () => {
    if (confirm('Clear all anti-cheat warning logs?')) {
      soundManager.playKeypress();
      await store.clearWarnings();
      refreshWarnings();
      refreshRoster();
    }
  };

  const handleDeleteQuestion = async (q: Question) => {
    if (questions.length <= 1) {
      soundManager.playError();
      setQuestionFeedback('Cannot delete the last remaining question. At least one round must exist.');
      setTimeout(() => setQuestionFeedback(null), 4000);
      return;
    }
    const liveWarn = compSettings.status === 'live'
      ? ' The competition is LIVE — remaining rounds will be renumbered and participant progress clamped.'
      : '';
    if (!confirm(`Entirely delete "${q.title}" (Round ${q.round_number}) including its flag and points?${liveWarn}`)) return;
    soundManager.playKeypress();
    try {
      const updated = await store.deleteQuestion(q.id);
      setQuestions(updated);
      await refreshCompSettings();
      soundManager.playSuccess();
      setQuestionFeedback(`"${q.title}" deleted. Remaining rounds renumbered.`);
      setTimeout(() => setQuestionFeedback(null), 4000);
    } catch (err: any) {
      soundManager.playError();
      setQuestionFeedback(`Error deleting question: ${err.message || 'Failed'}`);
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.title.trim() || !addForm.cipher_type.trim() || !addForm.ciphertext.trim() || !addForm.answer.trim()) {
      soundManager.playError();
      setQuestionFeedback('Title, cipher type, ciphertext and expected answer are required.');
      return;
    }
    setAddingQuestion(true);
    soundManager.playKeypress();
    try {
      const maxOrder = questions.reduce((m, q) => Math.max(m, q.order_index), 0);
      // Single insert via admin API — DB assigns serial ID (#11)
      const payload = {
        round_number: maxOrder + 1,
        title: addForm.title.trim(),
        cipher_type: addForm.cipher_type.trim(),
        ciphertext: addForm.ciphertext.trim(),
        clue: addForm.clue.trim() ? addForm.clue.trim() : null,
        answer: addForm.answer.trim(),
        points: Math.max(1, Math.floor(Number(addForm.points) || 100)),
        difficulty: addForm.difficulty,
        order_index: maxOrder + 1,
      };
      const supabase = getSupabase();
      if (supabase) {
        // Use admin API for single atomic insert
        const token = getAdminToken();
        const res = await fetch('/api/admin/action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ action: 'addQuestion', question: payload }),
        });
        const result = await res.json();
        if (!res.ok || !result.ok) throw new Error(result.message || 'Failed to add question.');
      } else {
        // Local dev fallback
        const localPayload = { ...payload, id: Date.now() } as Question;
        await store.saveQuestion(localPayload);
      }
      const updated = await store.getAdminQuestions();
      setQuestions(updated);
      soundManager.playSuccess();
      setQuestionFeedback(`"${payload.title}" added as Round ${payload.round_number}!`);
      setShowAddQuestion(false);
      setAddForm({ title: '', cipher_type: '', ciphertext: '', clue: '', answer: '', points: 100, difficulty: 'Beginner' });
      setTimeout(() => setQuestionFeedback(null), 4000);
    } catch (err: any) {
      soundManager.playError();
      setQuestionFeedback(`Error adding question: ${err.message || 'Failed'}`);
    } finally {
      setAddingQuestion(false);
    }
  };

  // Draft settings: update locally, persist on explicit Save (#15)
  const currentDraft = draftSettings || {
    time_limit_seconds: compSettings.time_limit_seconds,
    decay_per_second: compSettings.decay_per_second,
    active_question_count: compSettings.active_question_count,
  };
  const hasDraftChanges = draftSettings !== null && (
    draftSettings.time_limit_seconds !== compSettings.time_limit_seconds ||
    draftSettings.decay_per_second !== compSettings.decay_per_second ||
    draftSettings.active_question_count !== compSettings.active_question_count
  );

  const handleDraftChange = (field: string, value: number) => {
    if (!Number.isFinite(value)) return;
    setDraftSettings(prev => ({
      time_limit_seconds: prev?.time_limit_seconds ?? compSettings.time_limit_seconds,
      decay_per_second: prev?.decay_per_second ?? compSettings.decay_per_second,
      active_question_count: prev?.active_question_count ?? compSettings.active_question_count,
      [field]: value,
    }));
  };

  const handleSaveSettings = async () => {
    if (!draftSettings) return;
    const clamped = {
      ...draftSettings,
      active_question_count: Math.min(Math.max(1, Math.floor(draftSettings.active_question_count)), Math.max(1, questions.length)),
      time_limit_seconds: Math.max(30, Math.floor(draftSettings.time_limit_seconds)),
      decay_per_second: Math.max(0, Math.floor(draftSettings.decay_per_second)),
    };
    setCompBusy(true);
    soundManager.playKeypress();
    try {
      const next = await store.updateCompetitionSettings(clamped);
      setCompSettings(next);
      setDraftSettings(null);
      refreshRoster();
      soundManager.playSuccess();
      setQuestionFeedback('Settings saved!');
      setTimeout(() => setQuestionFeedback(null), 3000);
    } catch (err: any) {
      soundManager.playError();
      setQuestionFeedback(`Error saving settings: ${err.message || 'Failed'}`);
    } finally {
      setCompBusy(false);
    }
  };

  const handleStartCompetition = async () => {
    if (!confirm(`START the competition now?\n\n- Status goes LIVE for all participants\n- ALL scores and progress reset to zero\n- Per-question timer: ${compSettings.time_limit_seconds}s, decay: -${compSettings.decay_per_second} pt/s\n- Active rounds: ${compSettings.active_question_count}`)) return;
    setCompBusy(true);
    soundManager.playKeypress();
    try {
      const next = await store.startCompetition();
      setCompSettings(next);
      refreshRoster();
      soundManager.playSuccess();
      setQuestionFeedback('Competition is LIVE! All participant progress has been reset.');
      setTimeout(() => setQuestionFeedback(null), 5000);
    } catch (err: any) {
      soundManager.playError();
      setQuestionFeedback(`Error starting competition: ${err.message || 'Failed'}`);
    } finally {
      setCompBusy(false);
    }
  };

  const handleEndCompetition = async () => {
    if (!confirm('END the competition? The quiz terminal will lock for all participants.')) return;
    setCompBusy(true);
    soundManager.playKeypress();
    try {
      const next = await store.endCompetition();
      setCompSettings(next);
      soundManager.playSuccess();
      setQuestionFeedback('Competition ended. Quiz terminals are locked.');
      setTimeout(() => setQuestionFeedback(null), 5000);
    } catch (err: any) {
      soundManager.playError();
      setQuestionFeedback(`Error ending competition: ${err.message || 'Failed'}`);
    } finally {
      setCompBusy(false);
    }
  };

  const handleBackToWaiting = async () => {
    if (!confirm('Move competition back to WAITING? Participants will see the waiting room. Scores are NOT reset.')) return;
    setCompBusy(true);
    soundManager.playKeypress();
    try {
      const next = await store.resetCompetitionToWaiting();
      setCompSettings(next);
      soundManager.playSuccess();
    } catch (err: any) {
      soundManager.playError();
      setQuestionFeedback(`Error: ${err.message || 'Failed'}`);
    } finally {
      setCompBusy(false);
    }
  };

  const handleResetTrialData = async () => {
    if (!confirm('RESET TRIAL DATA?\n\nThis clears all participant scores, progress, warning counts, and anti-cheat logs, then returns the event to WAITING. Questions and registered accounts remain.')) return;
    setCompBusy(true);
    soundManager.playKeypress();
    try {
      const next = await store.resetTrialData();
      setCompSettings(next);
      await Promise.all([refreshRoster(), refreshWarnings()]);
      soundManager.playSuccess();
      setQuestionFeedback('Trial data cleared. The event is ready for a fresh run.');
      setTimeout(() => setQuestionFeedback(null), 5000);
    } catch (err: any) {
      soundManager.playError();
      setQuestionFeedback(`Error resetting trial data: ${err.message || 'Failed'}`);
    } finally {
      setCompBusy(false);
    }
  };

  const handleCreateParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);
    if (!newUsername.trim() || !newPassword.trim()) {
      soundManager.playError();
      setFormFeedback({ isError: true, message: 'Username and password are required fields.' });
      return;
    }

    setIsSubmitting(true);
    soundManager.playKeypress();

    const res = await store.createParticipant(
      newUsername,
      newPassword,
      newTeamName.trim() ? newTeamName.trim() : undefined,
      newRole
    );

    setIsSubmitting(false);

    if (res.success) {
      soundManager.playSuccess();
      setFormFeedback({
        isError: false,
        message: `Participant "${newUsername}" successfully registered with role "${newRole}"! ${
          newTeamName.trim()
            ? `Assigned team: "${newTeamName.trim()}"`
            : 'Team name left blank (user will be prompted or defaulted to username on login).'
        }`,
      });
      setNewUsername('');
      setNewPassword('');
      setNewTeamName('');
      setNewRole('participant');
      refreshRoster();
    } else {
      soundManager.playError();
      setFormFeedback({ isError: true, message: res.message });
    }
  };

  const handleResetParticipant = async (id: string, name: string) => {
    if (confirm(`Reset progress and score for participant "${name}"?`)) {
      soundManager.playKeypress();
      await store.resetParticipant(id);
      refreshRoster();
    }
  };

  const handleDeleteParticipant = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete participant "${name}"?`)) {
      soundManager.playKeypress();
      await store.deleteParticipant(id);
      refreshRoster();
    }
  };

  const handleSaveSupabaseConfig = async () => {
    soundManager.playKeypress();
    saveSupabaseConfig(supabaseUrl, supabaseKey);
    setConnectionStatus({ testing: true, message: 'Verifying Supabase connection...' });

    const test = await testSupabaseConnection();
    setConnectionStatus({
      testing: false,
      success: test.success,
      message: test.message,
    });
    if (test.success) {
      soundManager.playSuccess();
      refreshRoster();
      refreshQuestions();
    } else {
      soundManager.playError();
    }
  };

  const copySqlSchema = () => {
    soundManager.playKeypress();
    // Single source of truth: copies the exact repo schema file.
    navigator.clipboard.writeText(schemaSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  // Admin Gate: Enter Passkey
  if (!isAdminAuthenticated) {
    return (
      <div style={{ maxWidth: '480px', margin: '80px auto', padding: '0 20px' }}>
        <div className="glass-card glow-border-amber" style={{
          padding: '40px 32px',
          textAlign: 'center',
          background: 'rgba(14, 20, 30, 0.96)',
          border: '1px solid var(--accent-amber-border)'
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--accent-amber-subtle)',
            border: '1px solid var(--accent-amber-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: 'var(--accent-amber)',
            boxShadow: '0 2px 12px rgba(245, 158, 11, 0.2)'
          }}>
            <Shield size={30} />
          </div>

          <h2 style={{ fontSize: '1.5rem', color: '#ffffff', marginBottom: '8px' }}>
            Event Coordinator Console
          </h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Enter the Asthra 11.0 event master passkey to manage participants and settings.
          </p>

          {authError && (
            <div style={{
              background: 'rgba(255, 51, 102, 0.12)',
              border: '1px solid rgba(255, 51, 102, 0.4)',
              color: 'var(--neon-red)',
              padding: '10px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              marginBottom: '20px'
            }}>
              {authError}
            </div>
          )}

          <form onSubmit={handleAdminAuth}>
            <div style={{ position: 'relative', marginBottom: '20px' }}>
              <Key size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-muted)' }} />
              <input
                type="password"
                required
                value={passkeyInput}
                onChange={(e) => setPasskeyInput(e.target.value)}
                placeholder="Enter admin passkey..."
                className="cyber-input"
                style={{ paddingLeft: '44px' }}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="cyber-btn cyber-btn-primary"
              style={{ width: '100%', padding: '12px' }}
            >
              <Unlock size={18} />
              {authLoading ? 'Verifying...' : 'Unlock Admin Terminal'}
            </button>

          </form>
        </div>
      </div>
    );
  }

  // Admin Authenticated View
  return (
    <div style={{ maxWidth: '1280px', margin: '30px auto 80px', padding: '0 24px' }}>
      {loadError && (
        <div style={{
          marginBottom: '20px',
          padding: '12px 16px',
          borderRadius: '8px',
          backgroundColor: 'rgba(255, 51, 102, 0.15)',
          border: '1px solid rgba(255, 51, 102, 0.4)',
          color: 'var(--neon-red)',
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>{loadError}</span>
          <button
            onClick={() => setLoadError(null)}
            style={{ background: 'none', border: 'none', color: 'var(--neon-red)', cursor: 'pointer', fontSize: '1rem' }}
          >
            ✕
          </button>
        </div>
      )}
      {/* Top Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            padding: '10px',
            borderRadius: '10px',
            background: 'rgba(0, 240, 255, 0.1)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            color: 'var(--neon-cyan)'
          }}>
            <Shield size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.75rem', color: '#ffffff', lineHeight: 1.2 }}>
              Admin Operations Panel
            </h2>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Asthra 11.0 KeyBreak : Participant & Database Control
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => { soundManager.playKeypress(); setAdminTab('create'); }}
            className={`cyber-btn ${adminTab === 'create' ? 'cyber-btn-primary' : 'cyber-btn-ghost'}`}
            style={{ fontSize: '0.85rem', padding: '8px 14px' }}
          >
            <UserPlus size={16} />
            Register Participant
          </button>

          <button
            onClick={() => { soundManager.playKeypress(); setAdminTab('roster'); }}
            className={`cyber-btn ${adminTab === 'roster' ? 'cyber-btn-secondary' : 'cyber-btn-ghost'}`}
            style={{ fontSize: '0.85rem', padding: '8px 14px' }}
          >
            <List size={16} />
            Participant Roster ({participants.length})
          </button>

          <button
            onClick={() => { soundManager.playKeypress(); setAdminTab('questions'); }}
            className={`cyber-btn ${adminTab === 'questions' ? 'cyber-btn-secondary' : 'cyber-btn-ghost'}`}
            style={{ fontSize: '0.85rem', padding: '8px 14px' }}
          >
            <Terminal size={16} />
            Questions &amp; Flags ({questions.length})
          </button>

          <button
            onClick={() => { soundManager.playKeypress(); setAdminTab('warnings'); }}
            className={`cyber-btn ${adminTab === 'warnings' ? 'cyber-btn-secondary' : 'cyber-btn-ghost'}`}
            style={{ fontSize: '0.85rem', padding: '8px 14px', position: 'relative' }}
          >
            <AlertOctagon size={16} color={warnings.length > 0 ? 'var(--neon-red)' : undefined} />
            Warnings &amp; Anti-Cheat ({warnings.length})
            {warnings.length > 0 && (
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--neon-red)',
                boxShadow: '0 0 8px var(--neon-red)',
                display: 'inline-block'
              }} className="animate-pulse" />
            )}
          </button>

          <button
            onClick={() => { soundManager.playKeypress(); setAdminTab('database'); }}
            className={`cyber-btn ${adminTab === 'database' ? 'cyber-btn-secondary' : 'cyber-btn-ghost'}`}
            style={{ fontSize: '0.85rem', padding: '8px 14px' }}
          >
            <Database size={16} />
            Supabase DB Config
          </button>
        </div>
      </div>

      {/* TAB 1: REGISTER PARTICIPANT */}
      {adminTab === 'create' && (
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div className="glass-card" style={{ padding: '36px', background: 'rgba(8, 14, 26, 0.95)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <UserPlus size={22} color="var(--neon-green)" />
              <h3 style={{ fontSize: '1.35rem', color: '#ffffff' }}>
                Provision New Participant Credentials
              </h3>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.6 }}>
              Register participant credentials into the Supabase database. If team name is left empty, the participant will have the opportunity to set a team name upon initial login or default to their username.
            </p>

            {formFeedback && (
              <div style={{
                marginBottom: '20px',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: formFeedback.isError ? 'rgba(255, 51, 102, 0.12)' : 'rgba(0, 255, 157, 0.12)',
                border: `1px solid ${formFeedback.isError ? 'rgba(255, 51, 102, 0.4)' : 'rgba(0, 255, 157, 0.4)'}`,
                color: formFeedback.isError ? 'var(--neon-red)' : 'var(--neon-green)'
              }}>
                {formFeedback.isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                <span>{formFeedback.message}</span>
              </div>
            )}

            <form onSubmit={handleCreateParticipant}>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  PARTICIPANT USERNAME / ID <span style={{ color: 'var(--neon-green)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. quantum_coder"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="cyber-input cyber-input-mono"
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  ACCESS PASSWORD <span style={{ color: 'var(--neon-green)' }}>*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="e.g. asthra2026"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="cyber-input"
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    TEAM NAME <span style={{ color: 'var(--text-muted)' }}>(OPTIONAL)</span>
                  </label>
                  <span style={{ fontSize: '0.72rem', color: 'var(--neon-cyan)' }}>
                    Leave blank to let participant set team name on login
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. Cyber Ninjas (or leave empty)"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="cyber-input"
                />
              </div>

              <div style={{ marginBottom: '28px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  ACCESS ROLE (RBAC)
                </label>
                <select
                  value={newRole}
                  onChange={(e) => { soundManager.playKeypress(); setNewRole(e.target.value as 'admin' | 'moderator' | 'participant'); }}
                  className="cyber-input"
                  style={{ background: '#0b1221', color: '#ffffff' }}
                >
                  <option value="participant">Participant — standard competitor access</option>
                  <option value="moderator">Moderator — limited proctoring access</option>
                  <option value="admin">Admin — full administrative access</option>
                </select>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Role-based access control: moderators/admins can be granted elevated privileges.
                </span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="cyber-btn cyber-btn-primary"
                style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
              >
                <UserPlus size={18} />
                {isSubmitting ? 'Saving to Database...' : 'Save Participant Credentials'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: PARTICIPANT ROSTER */}
      {adminTab === 'roster' && (
        <div className="glass-card" style={{ padding: '28px', background: 'rgba(8, 14, 26, 0.95)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.3rem', color: '#ffffff' }}>
              Registered Participants ({participants.length})
            </h3>
            <button
              onClick={refreshRoster}
              disabled={loadingRoster}
              className="cyber-btn cyber-btn-ghost"
              style={{ fontSize: '0.8rem', padding: '6px 12px' }}
            >
              <RotateCcw size={14} className={loadingRoster ? 'animate-pulse' : ''} /> {loadingRoster ? 'Refreshing...' : 'Refresh Roster'}
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{
                  background: 'rgba(5, 8, 17, 0.9)',
                  borderBottom: '1px solid rgba(0, 240, 255, 0.2)',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase'
                }}>
                  <th style={{ padding: '12px 16px' }}>Username</th>
                  <th style={{ padding: '12px 16px' }}>Password</th>
                  <th style={{ padding: '12px 16px' }}>Team Name Status</th>
                  <th style={{ padding: '12px 16px' }}>Role</th>
                  <th style={{ padding: '12px 16px' }}>Round</th>
                  <th style={{ padding: '12px 16px' }}>Score</th>
                  <th style={{ padding: '12px 16px' }}>Warnings</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {participants.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No participants registered. Use the Register Participant tab to add one.
                    </td>
                  </tr>
                ) : (
                  participants.map((p) => (
                    <tr key={p.id} style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      backgroundColor: p.is_banned ? 'rgba(255, 51, 102, 0.05)' : 'transparent'
                    }}>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: p.is_banned ? 'var(--neon-red)' : 'var(--neon-cyan)', fontFamily: 'var(--font-mono)' }}>
                        {p.username}
                        {p.is_banned && <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--neon-red)' }}>[LOCKED]</span>}
                      </td>
                      <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        •••••••• <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>(hashed)</span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {p.team_name ? (
                          <span style={{ color: '#ffffff', fontWeight: 600 }}>{p.team_name}</span>
                        ) : (
                          <span style={{ color: 'var(--neon-amber)', fontSize: '0.78rem', fontStyle: 'italic' }}>
                            [Not set by admin - will prompt or default to username]
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span className={`cyber-badge ${
                          p.role === 'admin' ? 'cyber-badge-red' :
                          p.role === 'moderator' ? 'cyber-badge-amber' :
                          'cyber-badge-slate'
                        }`} style={{ fontSize: '0.7rem' }}>
                          {(p.role || 'participant').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)' }}>
                        {p.completed
                          ? `${compSettings.active_question_count} / ${compSettings.active_question_count}`
                          : `${Math.min(p.current_question_index + 1, compSettings.active_question_count)} / ${compSettings.active_question_count}`}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--neon-green)', fontFamily: 'var(--font-mono)' }}>
                        {p.score} PTS
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {p.warning_count && p.warning_count > 0 ? (
                          <span className="cyber-badge cyber-badge-amber" style={{ fontSize: '0.72rem' }}>
                            ⚠️ {p.warning_count} Logged
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>0</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {p.is_banned ? (
                          <span className="cyber-badge cyber-badge-red" style={{ fontSize: '0.7rem' }}>BANNED</span>
                        ) : p.completed ? (
                          <span className="cyber-badge cyber-badge-green" style={{ fontSize: '0.7rem' }}>COMPLETED</span>
                        ) : (
                          <span className="cyber-badge cyber-badge-cyan" style={{ fontSize: '0.7rem' }}>ACTIVE</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleOpenResetPassword(p.id, p.username)}
                            title="Reset participant password"
                            className="cyber-btn cyber-btn-ghost"
                            style={{ padding: '6px 8px', fontSize: '0.75rem' }}
                          >
                            <Key size={14} />
                          </button>
                          <button
                            onClick={() => handleOpenRoleEdit(p.id, p.username, p.role || 'participant')}
                            title="Edit participant role (RBAC)"
                            className="cyber-btn cyber-btn-ghost"
                            style={{ padding: '6px 8px', fontSize: '0.75rem' }}
                          >
                            <Shield size={14} />
                          </button>
                          <button
                            onClick={() => handleToggleBan(p.id, !p.is_banned, p.username)}
                            title={p.is_banned ? 'Unban participant' : 'Ban participant'}
                            className={`cyber-btn ${p.is_banned ? 'cyber-btn-secondary' : 'cyber-btn-danger'}`}
                            style={{ padding: '6px 8px', fontSize: '0.75rem' }}
                          >
                            {p.is_banned ? <Unlock size={14} /> : <Ban size={14} />}
                            {p.is_banned ? 'Unban' : 'Ban'}
                          </button>
                          <button
                            onClick={() => handleResetParticipant(p.id, p.username)}
                            title="Reset participant progress"
                            className="cyber-btn cyber-btn-ghost"
                            style={{ padding: '6px 8px', fontSize: '0.75rem' }}
                          >
                            <RotateCcw size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteParticipant(p.id, p.username)}
                            title="Delete participant"
                            className="cyber-btn cyber-btn-ghost"
                            style={{ padding: '6px 8px', fontSize: '0.75rem', color: 'var(--neon-red)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: QUESTIONS & FLAGS MANAGEMENT */}
      {adminTab === 'questions' && (
        <div className="glass-card" style={{ padding: '28px', background: 'rgba(8, 14, 26, 0.95)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.3rem', color: '#ffffff' }}>
                KeyBreak Question, Flag &amp; Points Management
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Edit ciphers, clues, points, and expected decryption answers. Changes persist directly to Supabase and are verified live when participants submit answers.
              </p>
            </div>
            <span className="cyber-badge cyber-badge-green">{questions.length} Total Rounds • {compSettings.active_question_count} In Play</span>
          </div>

          {/* COMPETITION CONTROL: timed mode, rounds in play, start/end */}
          <div style={{
            background: 'rgba(5, 8, 17, 0.85)',
            border: `1px solid ${compSettings.status === 'live' ? 'rgba(0, 255, 157, 0.45)' : compSettings.status === 'ended' ? 'rgba(255, 51, 102, 0.45)' : 'rgba(255, 176, 32, 0.45)'}`,
            borderRadius: 'var(--radius-md)',
            padding: '20px 22px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Timer size={20} color={compSettings.status === 'live' ? 'var(--neon-green)' : 'var(--accent-amber)'} />
                <strong style={{ fontSize: '1.05rem', color: '#ffffff' }}>Competition Control</strong>
                <span className={`cyber-badge ${
                  compSettings.status === 'live' ? 'cyber-badge-green'
                  : compSettings.status === 'ended' ? 'cyber-badge-red'
                  : 'cyber-badge-amber'
                }`}>
                  {compSettings.status === 'live' ? '● LIVE' : compSettings.status === 'ended' ? '■ ENDED' : '○ WAITING'}
                </span>
                {compSettings.started_at && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    started {new Date(compSettings.started_at).toLocaleString()}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {compSettings.status !== 'live' && (
                  <button
                    onClick={handleStartCompetition}
                    disabled={compBusy || questions.length === 0}
                    className="cyber-btn cyber-btn-primary"
                    style={{ fontSize: '0.85rem', padding: '8px 18px' }}
                  >
                    <Play size={15} />
                    {compBusy ? 'Working...' : 'Start Competition'}
                  </button>
                )}
                {compSettings.status === 'live' && (
                  <button
                    onClick={handleEndCompetition}
                    disabled={compBusy}
                    className="cyber-btn"
                    style={{ fontSize: '0.85rem', padding: '8px 18px', border: '1px solid var(--neon-red)', color: 'var(--neon-red)' }}
                  >
                    <Square size={15} />
                    {compBusy ? 'Working...' : 'End Competition'}
                  </button>
                )}
                {compSettings.status === 'ended' && (
                  <button
                    onClick={handleBackToWaiting}
                    disabled={compBusy}
                    className="cyber-btn cyber-btn-ghost"
                    style={{ fontSize: '0.85rem', padding: '8px 18px' }}
                  >
                    <RotateCcw size={15} />
                    Back to Waiting
                  </button>
                )}
                <button
                  onClick={handleResetTrialData}
                  disabled={compBusy}
                  className="cyber-btn cyber-btn-ghost"
                  style={{ fontSize: '0.85rem', padding: '8px 18px', border: '1px solid var(--accent-amber-border)', color: 'var(--accent-amber)' }}
                  title="Clear trial scores, progress, warning counts and logs without deleting questions or accounts"
                >
                  <RotateCcw size={15} />
                  Reset Trial Data
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 700, letterSpacing: '0.05em' }}>
                  <Flag size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                  ROUNDS IN PLAY (1–{Math.max(1, questions.length)})
                </label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, questions.length)}
                  value={currentDraft.active_question_count}
                  onChange={(e) => handleDraftChange('active_question_count', parseInt(e.target.value, 10))}
                  className="cyber-input cyber-input-mono"
                  style={{ width: '100%', padding: '10px 14px', fontSize: '1rem' }}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Quiz + leaderboard use the first N rounds. Shrinking N completes anyone past it.
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 700, letterSpacing: '0.05em' }}>
                  <Clock size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                  TIME PER QUESTION (SECONDS)
                </label>
                <input
                  type="number"
                  min={30}
                  step={10}
                  value={currentDraft.time_limit_seconds}
                  onChange={(e) => handleDraftChange('time_limit_seconds', parseInt(e.target.value, 10))}
                  className="cyber-input cyber-input-mono"
                  style={{ width: '100%', padding: '10px 14px', fontSize: '1rem' }}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  After this each round locks to Skip-only. 600s = 10 min.
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 700, letterSpacing: '0.05em' }}>
                  POINT DECAY (PTS / SECOND)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={currentDraft.decay_per_second}
                  onChange={(e) => handleDraftChange('decay_per_second', parseInt(e.target.value, 10))}
                  className="cyber-input cyber-input-mono"
                  style={{ width: '100%', padding: '10px 14px', fontSize: '1rem' }}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  −1/s drains a 600-pt round in exactly 10 minutes.
                </div>
              </div>
            </div>
            {/* Save Settings Button (#15) */}
            {hasDraftChanges && (
              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleSaveSettings}
                  disabled={compBusy}
                  className="cyber-btn cyber-btn-primary"
                  style={{ fontSize: '0.85rem', padding: '8px 18px' }}
                >
                  <Save size={15} />
                  {compBusy ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button
              onClick={() => { soundManager.playKeypress(); setShowAddQuestion(true); setQuestionFeedback(null); }}
              className="cyber-btn cyber-btn-primary"
              style={{ fontSize: '0.85rem', padding: '8px 18px' }}
            >
              <Plus size={15} />
              Add New Question &amp; Flag
            </button>
          </div>

          {questionFeedback && (
            <div style={{
              marginBottom: '20px',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(0, 255, 157, 0.12)',
              border: '1px solid rgba(0, 255, 157, 0.4)',
              color: 'var(--neon-green)'
            }}>
              <CheckCircle2 size={18} />
              <span>{questionFeedback}</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {questions.map((q) => (
              <div
                key={q.id}
                style={{
                  background: 'rgba(5, 8, 17, 0.85)',
                  border: '1px solid rgba(0, 240, 255, 0.2)',
                  borderRadius: 'var(--radius-md)',
                  padding: '22px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <span className="cyber-badge cyber-badge-cyan" style={{ marginRight: '8px' }}>
                      Round {q.round_number}
                    </span>
                    <strong style={{ fontSize: '1.15rem', color: '#ffffff' }}>{q.title}</strong>
                    <div style={{ fontSize: '0.82rem', color: 'var(--neon-green)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                      ALGORITHM: {q.cipher_type}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="cyber-badge cyber-badge-slate">{q.difficulty}</span>
                    <span className="cyber-badge cyber-badge-amber">{q.points} PTS</span>
                    <button
                      onClick={() => handleStartEditQuestion(q)}
                      className="cyber-btn cyber-btn-primary"
                      style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                    >
                      <Edit3 size={14} />
                      Edit Question &amp; Flag
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(q)}
                      className="cyber-btn"
                      title="Entirely delete this question, its flag and points"
                      style={{ fontSize: '0.8rem', padding: '6px 14px', border: '1px solid var(--neon-red)', color: 'var(--neon-red)' }}
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', letterSpacing: '0.06em' }}>
                    CIPHERTEXT (SHOWN TO PARTICIPANT):
                  </div>
                  <div style={{
                    background: 'rgba(0, 0, 0, 0.6)',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--neon-cyan)',
                    fontSize: '0.9rem',
                    wordBreak: 'break-all',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}>
                    {q.ciphertext}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', letterSpacing: '0.06em' }}>
                      TACTICAL CLUE:
                    </div>
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: '6px',
                      background: q.clue ? 'rgba(0, 240, 255, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      fontSize: '0.84rem',
                      color: q.clue ? '#e2e8f0' : 'var(--text-muted)'
                    }}>
                      {q.clue || '(No tactical clue provided for this question)'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', letterSpacing: '0.06em' }}>
                      EXPECTED DECRYPTION ANSWER (EQUATED IN SUPABASE):
                    </div>
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: '6px',
                      background: 'rgba(0, 255, 157, 0.08)',
                      border: '1px solid rgba(0, 255, 157, 0.25)',
                      fontSize: '0.88rem',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--neon-green)',
                      fontWeight: 700
                    }}>
                      {q.answer}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Edit Question Modal */}
          {editingQuestion && editForm && (
            <div style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(3, 7, 18, 0.85)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}>
              <div className="glass-card" style={{
                maxWidth: '680px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                background: 'linear-gradient(180deg, rgba(14, 20, 36, 0.98) 0%, rgba(7, 12, 22, 0.99) 100%)',
                border: '1px solid var(--neon-cyan)',
                padding: '28px',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 0 40px rgba(0, 240, 255, 0.25)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Edit3 size={20} color="var(--neon-cyan)" />
                    <h3 style={{ fontSize: '1.25rem', color: '#ffffff' }}>
                      Edit Round {editForm.round_number} Configuration
                    </h3>
                  </div>
                  <button
                    onClick={() => setEditingQuestion(null)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleSaveQuestionEdit}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        QUESTION TITLE
                      </label>
                      <input
                        type="text"
                        required
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        className="cyber-input"
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        CIPHER ALGORITHM TYPE
                      </label>
                      <input
                        type="text"
                        required
                        value={editForm.cipher_type}
                        onChange={(e) => setEditForm({ ...editForm, cipher_type: e.target.value })}
                        className="cyber-input"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        POINTS AWARDED
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={editForm.points}
                        onChange={(e) => setEditForm({ ...editForm, points: Number(e.target.value) })}
                        className="cyber-input cyber-input-mono"
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        DIFFICULTY LEVEL
                      </label>
                      <select
                        value={editForm.difficulty}
                        onChange={(e) => setEditForm({ ...editForm, difficulty: e.target.value as any })}
                        className="cyber-input"
                        style={{ background: '#0b1221', color: '#ffffff' }}
                      >
                        <option value="Beginner">Beginner</option>
                        <option value="Intermediate">Intermediate</option>
                        <option value="Advanced">Advanced</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      CIPHERTEXT (ENCRYPTED MESSAGE PRESENTED TO TEAMS)
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={editForm.ciphertext}
                      onChange={(e) => setEditForm({ ...editForm, ciphertext: e.target.value })}
                      className="cyber-input cyber-input-mono"
                      style={{ resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      TACTICAL CLUE (OPTIONAL - LEAVE BLANK TO OMIT CLUE)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Shift each letter backward by 3 positions... (or empty for no clue)"
                      value={editForm.clue || ''}
                      onChange={(e) => setEditForm({ ...editForm, clue: e.target.value.trim() ? e.target.value : null })}
                      className="cyber-input"
                      style={{ resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--neon-green)', fontWeight: 700, marginBottom: '4px' }}>
                      EXPECTED DECRYPTION ANSWER (FLAG FORMAT) <span style={{ color: 'var(--neon-cyan)' }}>* EQUATED ON SUBMISSION</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. ASTHRA{SECRET_FLAG}"
                      value={editForm.answer}
                      onChange={(e) => setEditForm({ ...editForm, answer: e.target.value })}
                      className="cyber-input cyber-input-mono"
                      style={{ borderColor: 'var(--neon-green)', background: 'rgba(0, 255, 157, 0.05)', color: 'var(--neon-green)', fontWeight: 700 }}
                    />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                      When participants submit answers, their input is compared directly with this string (case-insensitive, trimmed).
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setEditingQuestion(null)}
                      className="cyber-btn cyber-btn-ghost"
                      style={{ padding: '10px 18px' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingQuestion}
                      className="cyber-btn cyber-btn-primary"
                      style={{ padding: '10px 22px' }}
                    >
                      <Save size={16} />
                      {savingQuestion ? 'Saving Changes...' : 'Save & Sync to Supabase'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Add Question Modal */}
          {showAddQuestion && (
            <div style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(3, 7, 18, 0.85)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}>
              <div className="glass-card" style={{
                maxWidth: '680px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                background: 'linear-gradient(180deg, rgba(14, 20, 36, 0.98) 0%, rgba(7, 12, 22, 0.99) 100%)',
                border: '1px solid var(--neon-green)',
                padding: '28px',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 0 40px rgba(0, 255, 157, 0.25)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Plus size={20} color="var(--neon-green)" />
                    <h3 style={{ fontSize: '1.25rem', color: '#ffffff' }}>
                      Add Round {questions.length + 1} — New Question &amp; Flag
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowAddQuestion(false)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleAddQuestion}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        QUESTION TITLE *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Round 4: The XOR Vault"
                        value={addForm.title}
                        onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                        className="cyber-input"
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        CIPHER ALGORITHM TYPE *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. XOR Cipher"
                        value={addForm.cipher_type}
                        onChange={(e) => setAddForm({ ...addForm, cipher_type: e.target.value })}
                        className="cyber-input"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        POINTS AWARDED *
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={addForm.points}
                        onChange={(e) => setAddForm({ ...addForm, points: Number(e.target.value) })}
                        className="cyber-input cyber-input-mono"
                      />
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                        Full value if solved instantly; decays −{compSettings.decay_per_second}/s.
                      </span>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        DIFFICULTY LEVEL
                      </label>
                      <select
                        value={addForm.difficulty}
                        onChange={(e) => setAddForm({ ...addForm, difficulty: e.target.value as any })}
                        className="cyber-input"
                        style={{ background: '#0b1221', color: '#ffffff' }}
                      >
                        <option value="Beginner">Beginner</option>
                        <option value="Intermediate">Intermediate</option>
                        <option value="Advanced">Advanced</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      CIPHERTEXT (ENCRYPTED MESSAGE PRESENTED TO TEAMS) *
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={addForm.ciphertext}
                      onChange={(e) => setAddForm({ ...addForm, ciphertext: e.target.value })}
                      className="cyber-input cyber-input-mono"
                      style={{ resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      TACTICAL CLUE (OPTIONAL - LEAVE BLANK TO OMIT CLUE)
                    </label>
                    <textarea
                      rows={2}
                      value={addForm.clue}
                      onChange={(e) => setAddForm({ ...addForm, clue: e.target.value })}
                      className="cyber-input"
                      style={{ resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--neon-green)', fontWeight: 700, marginBottom: '4px' }}>
                      EXPECTED DECRYPTION ANSWER (FLAG FORMAT) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. ASTHRA{SECRET_FLAG}"
                      value={addForm.answer}
                      onChange={(e) => setAddForm({ ...addForm, answer: e.target.value })}
                      className="cyber-input cyber-input-mono"
                      style={{ borderColor: 'var(--neon-green)', background: 'rgba(0, 255, 157, 0.05)', color: 'var(--neon-green)', fontWeight: 700 }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddQuestion(false)}
                      className="cyber-btn cyber-btn-ghost"
                      style={{ padding: '10px 18px' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addingQuestion}
                      className="cyber-btn cyber-btn-primary"
                      style={{ padding: '10px 22px' }}
                    >
                      <Plus size={16} />
                      {addingQuestion ? 'Adding...' : 'Add Question & Sync'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: WARNINGS & ANTI-CHEAT PROCTORING */}
      {adminTab === 'warnings' && (
        <div className="glass-card" style={{ padding: '28px', background: 'rgba(8, 14, 26, 0.95)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.3rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertOctagon size={20} color="var(--neon-red)" />
                Proctoring &amp; Anti-Cheat Incident Logs ({warnings.length})
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Real-time alerts for participants switching browser tabs, minimizing the quiz window, or losing active focus. Apply point deduction timeouts or ban cheating teams immediately.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={refreshWarnings}
                disabled={loadingWarnings}
                className="cyber-btn cyber-btn-ghost"
                style={{ fontSize: '0.8rem', padding: '6px 12px' }}
              >
                <RotateCcw size={14} className={loadingWarnings ? 'animate-pulse' : ''} />
                {loadingWarnings ? 'Refreshing...' : 'Refresh Logs'}
              </button>
              {warnings.length > 0 && (
                <button
                  onClick={handleClearWarnings}
                  className="cyber-btn cyber-btn-ghost"
                  style={{ fontSize: '0.8rem', padding: '6px 12px', color: 'var(--neon-red)' }}
                >
                  Clear Logs
                </button>
              )}
            </div>
          </div>

          {/* Penalty Toast */}
          {penaltyFeedback && (
            <div style={{
              marginBottom: '20px',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(255, 170, 0, 0.12)',
              border: '1px solid rgba(255, 170, 0, 0.4)',
              color: 'var(--neon-amber)'
            }}>
              <AlertCircle size={18} />
              <span>{penaltyFeedback}</span>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{
                  background: 'rgba(5, 8, 17, 0.9)',
                  borderBottom: '1px solid rgba(255, 51, 102, 0.3)',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase'
                }}>
                  <th style={{ padding: '12px 16px' }}>Participant / Team</th>
                  <th style={{ padding: '12px 16px' }}>Violation Type</th>
                  <th style={{ padding: '12px 16px' }}>Incident Details</th>
                  <th style={{ padding: '12px 16px' }}>Timestamp</th>
                  <th style={{ padding: '12px 16px' }}>User Warnings</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Penalties &amp; Elimination</th>
                </tr>
              </thead>
              <tbody>
                {warnings.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No proctoring violations recorded. Participants are adhering to competition integrity rules.
                    </td>
                  </tr>
                ) : (
                  warnings.map((w) => {
                    const participantObj = participants.find(p => p.id === w.participant_id);
                    const isBanned = participantObj?.is_banned;
                    const totalWarnings = participantObj?.warning_count || 1;

                    return (
                      <tr
                        key={w.id}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          backgroundColor: isBanned ? 'rgba(255, 51, 102, 0.08)' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                            {w.username}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                            {w.team_name || 'Solo Participant'}
                          </div>
                        </td>

                        <td style={{ padding: '14px 16px' }}>
                          {w.event_type === 'tab_switch' ? (
                            <span className="cyber-badge cyber-badge-red" style={{ fontSize: '0.72rem' }}>
                              TAB SWITCH / MINIMIZE
                            </span>
                          ) : (
                            <span className="cyber-badge cyber-badge-amber" style={{ fontSize: '0.72rem' }}>
                              WINDOW FOCUS BLUR
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '14px 16px', fontSize: '0.84rem', color: 'var(--text-secondary)', maxWidth: '280px' }}>
                          {w.details || w.event_type}
                        </td>

                        <td style={{ padding: '14px 16px', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} />
                            {new Date(w.timestamp).toLocaleTimeString()}
                          </span>
                          <div style={{ fontSize: '0.7rem' }}>{new Date(w.timestamp).toLocaleDateString()}</div>
                        </td>

                        <td style={{ padding: '14px 16px' }}>
                          <span className="cyber-badge cyber-badge-amber" style={{ fontSize: '0.75rem', fontWeight: 800 }}>
                            ⚠️ {totalWarnings} Total
                          </span>
                        </td>

                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {/* Timeout / Point Deduction Options */}
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '2px' }}>
                              Timeout Penalty:
                            </span>
                            <button
                              onClick={() => handleDeductPoints(w.participant_id, 50, w.username)}
                              title="Deduct 50 points from participant score"
                              className="cyber-btn cyber-btn-ghost"
                              style={{ padding: '4px 8px', fontSize: '0.72rem', color: 'var(--neon-amber)', borderColor: 'rgba(255, 170, 0, 0.3)' }}
                            >
                              -50 PTS
                            </button>
                            <button
                              onClick={() => handleDeductPoints(w.participant_id, 100, w.username)}
                              title="Deduct 100 points from participant score"
                              className="cyber-btn cyber-btn-ghost"
                              style={{ padding: '4px 8px', fontSize: '0.72rem', color: 'var(--neon-amber)', borderColor: 'rgba(255, 170, 0, 0.3)' }}
                            >
                              -100 PTS
                            </button>
                            <button
                              onClick={() => handleCustomPenalty(w.participant_id, w.username)}
                              title="Custom penalty point deduction"
                              className="cyber-btn cyber-btn-ghost"
                              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                            >
                              Custom...
                            </button>

                            {/* Direct Ban Option */}
                            <button
                              onClick={() => handleToggleBan(w.participant_id, !isBanned, w.username)}
                              className={`cyber-btn ${isBanned ? 'cyber-btn-secondary' : 'cyber-btn-danger'}`}
                              style={{ padding: '5px 10px', fontSize: '0.75rem', marginLeft: '6px' }}
                            >
                              {isBanned ? <Unlock size={14} /> : <Ban size={14} />}
                              {isBanned ? 'Unban' : 'Direct Ban'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: SUPABASE DATABASE CONFIG & MIGRATIONS */}
      {adminTab === 'database' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
          {/* Connection Manager */}
          <div className="glass-card" style={{ padding: '28px', background: 'rgba(8, 14, 26, 0.95)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <Database size={22} color="var(--neon-cyan)" />
              <h3 style={{ fontSize: '1.25rem', color: '#ffffff' }}>Supabase Connection Settings</h3>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Enter your project URL and public Anon Key from your Supabase project dashboard. If empty, the system automatically uses a persistent local storage fallback engine.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                SUPABASE PROJECT URL
              </label>
              <input
                type="text"
                placeholder="https://xyzproject.supabase.co"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                className="cyber-input cyber-input-mono"
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                SUPABASE ANON KEY
              </label>
              <input
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                className="cyber-input"
              />
            </div>

            <button
              onClick={handleSaveSupabaseConfig}
              disabled={connectionStatus.testing}
              className="cyber-btn cyber-btn-primary"
              style={{ width: '100%', padding: '12px' }}
            >
              {connectionStatus.testing ? 'Testing...' : 'Save & Verify Connection'}
            </button>

            {connectionStatus.message && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                background: connectionStatus.success ? 'rgba(0, 255, 157, 0.12)' : 'rgba(255, 51, 102, 0.12)',
                border: `1px solid ${connectionStatus.success ? 'rgba(0, 255, 157, 0.4)' : 'rgba(255, 51, 102, 0.4)'}`,
                color: connectionStatus.success ? 'var(--neon-green)' : 'var(--neon-red)'
              }}>
                {connectionStatus.message}
              </div>
            )}
          </div>

          {/* SQL Schema Script Assistant */}
          <div className="glass-card" style={{ padding: '28px', background: 'rgba(8, 14, 26, 0.95)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Terminal size={22} color="var(--neon-green)" />
                <h3 style={{ fontSize: '1.25rem', color: '#ffffff' }}>Supabase SQL Migration</h3>
              </div>
              <button
                onClick={copySqlSchema}
                className="cyber-btn cyber-btn-secondary"
                style={{ fontSize: '0.78rem', padding: '6px 12px' }}
              >
                {copiedSql ? <Check size={14} color="var(--neon-green)" /> : <Copy size={14} />}
                {copiedSql ? 'SQL Copied!' : 'Copy SQL Schema'}
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Copy and execute this script in your Supabase SQL Editor. It creates the <code>participants</code>, <code>questions</code>, and <code>submissions</code> tables, configures RLS policies, and registers Realtime channels.
            </p>

            <div style={{
              background: 'rgba(4, 7, 14, 0.95)',
              padding: '16px',
              borderRadius: '6px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              maxHeight: '260px',
              overflowY: 'auto',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <pre>{`-- 1. Create Participants Table
CREATE TABLE public.participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    team_name TEXT,
    current_question_index INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 2. Create Questions & Submissions...`}</pre>
            </div>

            <div style={{ marginTop: '16px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Note: Schema file is also saved directly in the project root at <code style={{ color: 'var(--neon-cyan)' }}>/supabase_schema.sql</code>.
            </div>
          </div>
        </div>
      )}

      {/* PASSWORD RESET MODAL */}
      {resetPasswordModal.isOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(3, 7, 18, 0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div className="glass-card glow-border-amber" style={{
            maxWidth: '480px',
            width: '100%',
            padding: '32px',
            position: 'relative',
            background: 'rgba(14, 20, 30, 0.98)',
            border: '1px solid var(--accent-amber-border)'
          }}>
            <button
              onClick={() => setResetPasswordModal(prev => ({ ...prev, isOpen: false }))}
              style={{
                position: 'absolute',
                top: '18px',
                right: '18px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>

            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-amber-subtle)',
                border: '1px solid var(--accent-amber-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
                color: 'var(--accent-amber)',
                boxShadow: '0 2px 10px rgba(245, 158, 11, 0.2)'
              }}>
                <Key size={26} />
              </div>
              <h2 style={{ fontSize: '1.45rem', color: '#ffffff', marginBottom: '6px' }}>Reset Participant Password</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Set a new access password for <strong style={{ color: 'var(--accent-amber)' }}>{resetPasswordModal.participantUsername}</strong>
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                CURRENT PASSWORD
              </label>
              <div style={{
                background: 'rgba(7, 10, 16, 0.95)',
                padding: '12px 14px',
                borderRadius: '6px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.9rem',
                color: 'var(--text-secondary)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Lock size={16} color="var(--text-muted)" />
                {resetPasswordModal.currentPassword || '(not set)'}
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                NEW PASSWORD
              </label>
              <div style={{ position: 'relative' }}>
                <Key size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-muted)' }} />
                <input
                  type="password"
                  required
                  minLength={4}
                  value={resetPasswordModal.newPassword}
                  onChange={(e) => setResetPasswordModal(prev => ({ ...prev, newPassword: e.target.value }))}
                  placeholder="Enter new password (min 4 characters)"
                  className="cyber-input"
                  style={{ paddingLeft: '42px' }}
                  autoFocus
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setResetPasswordModal(prev => ({ ...prev, isOpen: false }))}
                className="cyber-btn cyber-btn-ghost"
                style={{ padding: '10px 18px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetPasswordModal.isSubmitting || !resetPasswordModal.newPassword.trim()}
                onClick={handleResetPassword}
                className="cyber-btn cyber-btn-primary"
                style={{ padding: '10px 22px' }}
              >
                <Save size={16} />
                {resetPasswordModal.isSubmitting ? 'Saving...' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ROLE EDIT MODAL (RBAC) */}
      {roleEditModal.isOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(3, 7, 18, 0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div className="glass-card glow-border-cyan" style={{
            maxWidth: '460px',
            width: '100%',
            padding: '32px',
            position: 'relative',
            background: 'rgba(14, 20, 30, 0.98)',
            border: '1px solid var(--neon-cyan)'
          }}>
            <button
              onClick={() => setRoleEditModal(prev => ({ ...prev, isOpen: false }))}
              style={{
                position: 'absolute',
                top: '18px',
                right: '18px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>

            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--electric-cyan-subtle)',
                border: '1px solid var(--electric-cyan-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
                color: 'var(--neon-cyan)',
                boxShadow: '0 2px 10px rgba(0, 240, 255, 0.2)'
              }}>
                <Shield size={26} />
              </div>
              <h2 style={{ fontSize: '1.45rem', color: '#ffffff', marginBottom: '6px' }}>Edit Participant Role</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Change access level for <strong style={{ color: 'var(--neon-cyan)' }}>{roleEditModal.participantUsername}</strong>
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                CURRENT ROLE
              </label>
              <span className={`cyber-badge ${
                roleEditModal.currentRole === 'admin' ? 'cyber-badge-red' :
                roleEditModal.currentRole === 'moderator' ? 'cyber-badge-amber' :
                'cyber-badge-slate'
              }`} style={{ fontSize: '0.75rem', padding: '6px 12px' }}>
                {(roleEditModal.currentRole || 'participant').toUpperCase()}
              </span>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                SELECT NEW ROLE
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { value: 'participant', label: 'Participant', desc: 'Standard competitor access', color: 'var(--text-secondary)' },
                  { value: 'moderator', label: 'Moderator', desc: 'Limited proctoring access', color: 'var(--warning-amber)' },
                  { value: 'admin', label: 'Admin', desc: 'Full administrative access', color: 'var(--neon-red)' },
                ].map(role => (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() => setRoleEditModal(prev => ({ ...prev, newRole: role.value as 'admin' | 'moderator' | 'participant' }))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: roleEditModal.newRole === role.value ? 'rgba(0, 240, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                      border: `1px solid ${roleEditModal.newRole === role.value ? 'var(--electric-cyan)' : 'rgba(255, 255, 255, 0.08)'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      textAlign: 'left'
                    }}
                  >
                    <div>
                      <div style={{ color: role.color, fontWeight: 700, fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
                        {role.label}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {role.desc}
                      </div>
                    </div>
                    {roleEditModal.newRole === role.value && (
                      <Check size={18} color="var(--neon-cyan)" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setRoleEditModal(prev => ({ ...prev, isOpen: false }))}
                className="cyber-btn cyber-btn-ghost"
                style={{ padding: '10px 18px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={roleEditModal.isSubmitting || roleEditModal.newRole === roleEditModal.currentRole}
                onClick={handleRoleEdit}
                className="cyber-btn cyber-btn-primary"
                style={{ padding: '10px 22px' }}
              >
                <Save size={16} />
                {roleEditModal.isSubmitting ? 'Saving...' : 'Update Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
