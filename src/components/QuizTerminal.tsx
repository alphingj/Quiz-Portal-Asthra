import { useState, useEffect, useRef } from 'react';
import type { Participant, Question, CompetitionSettings } from '../types';
import { DEFAULT_COMPETITION_SETTINGS } from '../types';
import { store } from '../services/store';
import { soundManager } from '../services/audio';
import { CryptoToolbox } from './CryptoToolbox';
import { VictoryModal } from './VictoryModal';
import { 
  Terminal, 
  Lock, 
  Unlock, 
  Key, 
  HelpCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  User, 
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Trophy,
  AlertOctagon,
  Timer,
  SkipForward
} from 'lucide-react';

interface QuizTerminalProps {
  participant: Participant | null;
  onOpenLogin: () => void;
  onViewLeaderboard: () => void;
  onParticipantUpdated: (participant: Participant) => void;
}

export const QuizTerminal: React.FC<QuizTerminalProps> = ({
  participant,
  onOpenLogin,
  onViewLeaderboard,
  onParticipantUpdated,
}) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<{ isError: boolean; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showClue, setShowClue] = useState(false);
  const [copiedCipher, setCopiedCipher] = useState(false);
  const [showShake, setShowShake] = useState(false);
  const [showVictoryModal, setShowVictoryModal] = useState(false);

  // Timed-competition mode
  const [compSettings, setCompSettings] = useState<CompetitionSettings>({ ...DEFAULT_COMPETITION_SETTINGS });
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [isSkipping, setIsSkipping] = useState(false);

  // Anti-cheat warning modal state
  const [cheatWarning, setCheatWarning] = useState<{
    visible: boolean;
    reason: string;
    warningCount: number;
  }>({
    visible: false,
    reason: '',
    warningCount: participant?.warning_count || 0,
  });

  const lastCheatReportRef = useRef<number>(0);

  // Loading error state (#25)
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load questions + competition settings
  useEffect(() => {
    const fetchQ = async () => {
      setLoading(true);
      try {
        const [qList, settings] = await Promise.all([
          store.getQuestions(),
          store.getCompetitionSettings(),
        ]);
        setQuestions(qList);
        setCompSettings(settings);
        setLoadError(null);
      } catch (err: any) {
        setLoadError(err.message || 'Failed to load quiz data.');
      } finally {
        setLoading(false);
      }
    };
    fetchQ();

    // Competition settings can flip live/ended mid-session (admin Start/End),
    // and the question list can change (admin add/delete/count)
    const handleSettingsUpdate = async () => {
      try {
        const [qList, settings] = await Promise.all([
          store.getQuestions(),
          store.getCompetitionSettings(),
        ]);
        setQuestions(qList);
        setCompSettings(settings);
        setLoadError(null);
      } catch (err: any) {
        setLoadError(err.message || 'Failed to refresh quiz data.');
      }
    };
    window.addEventListener('asthra_data_update', handleSettingsUpdate);
    window.addEventListener('storage', handleSettingsUpdate);
    return () => {
      window.removeEventListener('asthra_data_update', handleSettingsUpdate);
      window.removeEventListener('storage', handleSettingsUpdate);
    };
  }, []);

  // 1-second ticker driving the per-question countdown (display only —
  // scoring authority is the stored timestamp inside store.submitAnswer)
  useEffect(() => {
    if (!participant || participant.completed || participant.is_banned) return;
    if (compSettings.status !== 'live') return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [participant?.id, participant?.completed, participant?.is_banned, compSettings.status]);

  // Backfill the per-question start timestamp for legacy rows / late joiners
  useEffect(() => {
    if (!participant || participant.completed || participant.current_question_started_at) return;
    let cancelled = false;
    store.ensureQuestionStart(participant.id).then((fresh) => {
      if (!cancelled && fresh) onParticipantUpdated(fresh);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participant?.id]);

  // Anti-cheat proctoring listeners (visibilitychange & blur)
  useEffect(() => {
    if (!participant || participant.completed || participant.is_banned) return;

    const handleCheatViolation = async (eventType: 'tab_switch' | 'window_blur' | 'window_minimize', description: string) => {
      const now = Date.now();
      // Throttle violation logging by 4 seconds to avoid spamming the DB on rapid focus changes
      if (now - lastCheatReportRef.current < 4000) return;
      lastCheatReportRef.current = now;

      soundManager.playError();

      try {
        await store.logCheatingWarning(
          participant.id,
          participant.username,
          participant.team_name,
          eventType,
          description
        );
        const updatedCount = (participant.warning_count || 0) + 1;
        setCheatWarning({
          visible: true,
          reason: description,
          warningCount: updatedCount,
        });
        onParticipantUpdated({ ...participant, warning_count: updatedCount });
      } catch (err) {
        console.warn('Failed to log cheat warning', err);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleCheatViolation('tab_switch', 'Browser tab switched or screen minimized during active round');
      }
    };

    const handleWindowBlur = () => {
      handleCheatViolation('window_blur', 'Window focus lost / external application switch detected');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [participant]);

  // Active rounds in play: first N by order (admin-configurable count)
  const activeCount = Math.max(1, Math.min(compSettings.active_question_count, Math.max(questions.length, 1)));
  const activeQuestions = questions.slice(0, activeCount);

  // Current question index based on participant's progress
  const currentIdx = participant ? participant.current_question_index : 0;
  const currentQuestion = activeQuestions[currentIdx] || null;
  const isCompleted = participant ? participant.completed || currentIdx >= activeQuestions.length : false;

  // Per-question countdown (display): deadline = question start + time limit
  const questionStartMs = participant?.current_question_started_at
    ? new Date(participant.current_question_started_at).getTime()
    : nowTick;
  const elapsedSeconds = Math.max(0, Math.floor((nowTick - questionStartMs) / 1000));
  const remainingSeconds = compSettings.time_limit_seconds - elapsedSeconds;
  const isTimedOut = compSettings.status === 'live' && !isCompleted && remainingSeconds <= 0;
  const currentValue = currentQuestion
    ? Math.max(0, currentQuestion.points - elapsedSeconds * compSettings.decay_per_second)
    : 0;
  const timerFraction = currentQuestion
    ? Math.max(0, Math.min(1, remainingSeconds / compSettings.time_limit_seconds))
    : 0;

  const formatCountdown = (totalSeconds: number) => {
    const s = Math.max(0, totalSeconds);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
  };

  // Reset answer input when question advances
  useEffect(() => {
    setUserAnswer('');
    setFeedback(null);
    setShowClue(false);
  }, [currentIdx]);

  const handleCopyCipher = (text: string) => {
    soundManager.playKeypress();
    navigator.clipboard.writeText(text);
    setCopiedCipher(true);
    setTimeout(() => setCopiedCipher(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!participant || !currentQuestion || isSubmitting) return;

    if (!userAnswer.trim()) {
      soundManager.playError();
      setFeedback({ isError: true, message: 'Please input the decoded message or flag before submitting.' });
      return;
    }

    setIsSubmitting(true);
    soundManager.playKeypress();

    try {
      const result = await store.submitAnswer(participant.id, currentQuestion.id, userAnswer);

      if (result.isCorrect) {
        soundManager.playSuccess();
        setFeedback({ isError: false, message: result.message });
        if (result.updatedParticipant) {
          onParticipantUpdated(result.updatedParticipant);
        }
        if (result.completedEvent && result.updatedParticipant) {
          setShowVictoryModal(true);
        }
      } else {
        soundManager.playError();
        setShowShake(true);
        setTimeout(() => setShowShake(false), 500);
        setFeedback({ isError: true, message: result.message });
        if (result.timedOut && result.updatedParticipant) {
          onParticipantUpdated(result.updatedParticipant);
        }
      }
    } catch {
      soundManager.playError();
      setFeedback({ isError: true, message: 'Transmission error. Please re-attempt submission.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (!participant || isSkipping) return;
    setIsSkipping(true);
    soundManager.playKeypress();
    try {
      const result = await store.skipQuestion(participant.id);
      if (result.success && result.updatedParticipant) {
        onParticipantUpdated(result.updatedParticipant);
        setFeedback({ isError: false, message: result.message });
        if (result.completedEvent) {
          setShowVictoryModal(true);
        }
      } else {
        soundManager.playError();
        setFeedback({ isError: true, message: result.message });
      }
    } catch {
      soundManager.playError();
      setFeedback({ isError: true, message: 'Skip failed. Please try again.' });
    } finally {
      setIsSkipping(false);
    }
  };

  // State 0: Participant BANNED / DISQUALIFIED
  if (participant?.is_banned) {
    return (
      <div style={{ maxWidth: '800px', margin: '60px auto', padding: '0 20px' }}>
        <div className="glass-card" style={{
          padding: '48px 32px',
          textAlign: 'center',
          background: 'rgba(18, 5, 8, 0.95)',
          border: '2px solid var(--neon-red)',
          boxShadow: '0 0 40px rgba(255, 51, 102, 0.3)',
          position: 'relative'
        }}>
          <div style={{
            width: '74px',
            height: '74px',
            borderRadius: '50%',
            background: 'rgba(255, 51, 102, 0.15)',
            border: '2px solid var(--neon-red)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            color: 'var(--neon-red)',
            boxShadow: '0 0 30px rgba(255, 51, 102, 0.4)'
          }}>
            <ShieldAlert size={40} />
          </div>

          <span className="cyber-badge cyber-badge-red" style={{ marginBottom: '12px' }}>
            TERMINAL DISQUALIFICATION
          </span>

          <h2 style={{ fontSize: '2.2rem', color: '#ffffff', marginBottom: '12px' }}>
            Account Disqualified &amp; Banned
          </h2>

          <p style={{ fontSize: '1.05rem', color: '#fca5a5', maxWidth: '560px', margin: '0 auto 24px', lineHeight: 1.6 }}>
            Participant <strong style={{ color: '#ffffff' }}>{participant.team_name || participant.username}</strong> has been disqualified by the Asthra 11.0 event proctoring system due to rule violations. All challenge interactions have been suspended.
          </p>

          <div style={{
            background: 'rgba(0, 0, 0, 0.5)',
            padding: '16px',
            borderRadius: '6px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            color: 'var(--text-muted)',
            display: 'inline-block',
            border: '1px solid rgba(255, 51, 102, 0.2)'
          }}>
            INCIDENT STATUS: BANNED_BY_COORDINATOR • CONTACT ADMIN TABLE
          </div>
        </div>
      </div>
    );
  }

  // State 1: Participant NOT logged in
  if (!participant) {
    return (
      <div style={{ maxWidth: '800px', margin: '60px auto', padding: '0 20px' }}>
        <div className="glass-card glow-border-cyan" style={{
          padding: '48px 32px',
          textAlign: 'center',
          background: 'rgba(8, 14, 26, 0.9)',
          position: 'relative'
        }}>
          <div style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            background: 'rgba(0, 240, 255, 0.1)',
            border: '2px solid var(--neon-cyan)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            color: 'var(--neon-cyan)',
            boxShadow: '0 0 25px rgba(0, 240, 255, 0.3)'
          }}>
            <Lock size={32} />
          </div>

          <div className="cyber-badge cyber-badge-cyan" style={{ marginBottom: '12px' }}>
            Security Checkpoint
          </div>

          <h2 style={{ fontSize: '2rem', color: '#ffffff', marginBottom: '12px' }}>
            Terminal Locked : Credentials Required
          </h2>

          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto 28px', lineHeight: 1.6 }}>
            The KeyBreak cipher challenge requires an authorized participant profile. Enter the participant credentials assigned by the Asthra 11.0 event coordinator.
          </p>

          <button
            onClick={() => { soundManager.playKeypress(); onOpenLogin(); }}
            className="cyber-btn cyber-btn-primary"
            style={{ fontSize: '1.05rem', padding: '14px 36px', borderRadius: 'var(--radius-md)' }}
          >
            <User size={18} />
            Authorize & Access Terminal
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  // State 2: Loading
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--neon-cyan)' }}>
        <RefreshCw size={36} className="animate-pulse" style={{ animationDuration: '1s' }} />
        <p style={{ marginTop: '16px', fontFamily: 'var(--font-mono)' }}>INITIALIZING CIPHER REPOSITORY...</p>
      </div>
    );
  }

  // State 2a: Load Error
  if (loadError) {
    return (
      <div style={{ maxWidth: '600px', margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
        <div className="glass-card" style={{ padding: '40px', border: '1px solid rgba(255, 51, 102, 0.4)' }}>
          <p style={{ color: 'var(--neon-red)', fontFamily: 'var(--font-mono)', marginBottom: '20px' }}>
            {loadError}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="cyber-btn cyber-btn-primary"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // State 2b: Competition hasn't started yet — waiting room
  if (participant && !participant.completed && compSettings.status === 'waiting') {
    return (
      <div style={{ maxWidth: '800px', margin: '60px auto', padding: '0 20px' }}>
        <div className="glass-card glow-border-amber" style={{
          padding: '48px 32px',
          textAlign: 'center',
          background: 'rgba(8, 14, 26, 0.9)',
          position: 'relative'
        }}>
          <div style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            background: 'rgba(255, 176, 32, 0.1)',
            border: '2px solid var(--accent-amber)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            color: 'var(--accent-amber)',
            boxShadow: '0 0 25px rgba(255, 176, 32, 0.3)'
          }}>
            <Timer size={32} />
          </div>

          <div className="cyber-badge cyber-badge-amber" style={{ marginBottom: '12px' }}>
            ○ STANDBY — AWAITING START SIGNAL
          </div>

          <h2 style={{ fontSize: '2rem', color: '#ffffff', marginBottom: '12px' }}>
            Competition Has Not Started
          </h2>

          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto 12px', lineHeight: 1.6 }}>
            Welcome, <strong style={{ color: '#ffffff' }}>{participant.team_name || participant.username}</strong>. The event coordinator has not pressed <strong>Start Competition</strong> yet. This screen goes live automatically.
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {activeCount} ROUND{activeCount === 1 ? '' : 'S'} • {formatCountdown(compSettings.time_limit_seconds)} PER ROUND • −{compSettings.decay_per_second} PT/S DECAY
          </p>
        </div>
      </div>
    );
  }

  // State 2c: Competition ended — terminal locked
  if (participant && !participant.completed && compSettings.status === 'ended') {
    return (
      <div style={{ maxWidth: '800px', margin: '60px auto', padding: '0 20px' }}>
        <div className="glass-card" style={{
          padding: '48px 32px',
          textAlign: 'center',
          background: 'rgba(18, 5, 8, 0.95)',
          border: '2px solid var(--neon-red)',
          position: 'relative'
        }}>
          <span className="cyber-badge cyber-badge-red" style={{ marginBottom: '12px' }}>
            ■ COMPETITION ENDED
          </span>

          <h2 style={{ fontSize: '2rem', color: '#ffffff', marginBottom: '12px' }}>
            Terminal Locked : Time Called
          </h2>

          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto 24px', lineHeight: 1.6 }}>
            The coordinator has ended the competition. Final score for <strong style={{ color: '#ffffff' }}>{participant.team_name || participant.username}</strong>: <strong style={{ color: 'var(--neon-green)', fontFamily: 'var(--font-mono)' }}>{participant.score} PTS</strong>
          </p>

          <button
            onClick={() => { soundManager.playKeypress(); onViewLeaderboard(); }}
            className="cyber-btn cyber-btn-primary"
            style={{ fontSize: '1rem', padding: '14px 32px' }}
          >
            <Trophy size={18} />
            View Final Standings
          </button>
        </div>
      </div>
    );
  }

  // State 3: Participant has completed all rounds
  if (isCompleted) {
    return (
      <div style={{ maxWidth: '860px', margin: '40px auto', padding: '0 20px' }}>
        <div className="glass-card glow-border-green" style={{
          padding: '48px 36px',
          textAlign: 'center',
          background: 'rgba(7, 13, 24, 0.95)'
        }}>
          <div style={{
            width: '70px',
            height: '70px',
            borderRadius: '50%',
            background: 'rgba(0, 255, 157, 0.15)',
            border: '2px solid var(--neon-green)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            color: 'var(--neon-green)',
            boxShadow: '0 0 25px rgba(0, 255, 157, 0.4)'
          }}>
            <CheckCircle2 size={36} />
          </div>

          <h2 style={{ fontSize: '2.2rem', color: '#ffffff', marginBottom: '10px' }}>
            Mission Complete : All Ciphers Decrypted!
          </h2>

          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: '580px', margin: '0 auto 24px' }}>
            Outstanding cryptanalysis work, <strong style={{ color: 'var(--neon-green)' }}>{participant.team_name || participant.username}</strong>! You have successfully solved all {activeCount} round{activeCount === 1 ? '' : 's'} of Asthra 11.0 KeyBreak.
          </p>

          <div style={{
            display: 'inline-flex',
            gap: '24px',
            background: 'rgba(0, 255, 157, 0.08)',
            border: '1px solid rgba(0, 255, 157, 0.25)',
            padding: '16px 32px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '32px'
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>FINAL SCORE</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--neon-green)', fontFamily: 'var(--font-mono)' }}>
                {participant.score} PTS
              </div>
            </div>
            <div style={{ width: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ROUNDS CRACKED</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--neon-cyan)', fontFamily: 'var(--font-mono)' }}>
                {Math.min(currentIdx, activeCount)} / {activeCount}
              </div>
            </div>
          </div>

          <div>
            <button
              onClick={() => { soundManager.playKeypress(); onViewLeaderboard(); }}
              className="cyber-btn cyber-btn-primary"
              style={{ fontSize: '1rem', padding: '14px 32px' }}
            >
              <Trophy size={18} />
              Inspect Live Leaderboard Standings
            </button>
          </div>
        </div>

        {/* Cryptanalysis Toolbox still accessible for reference */}
        <CryptoToolbox />
      </div>
    );
  }

  // State 4: Active Question Display (1 Question at a time)
  return (
    <div style={{ maxWidth: '960px', margin: '30px auto 60px', padding: '0 20px' }}>
      {/* Victory Modal if triggered */}
      {showVictoryModal && participant && (
        <VictoryModal
          isOpen={showVictoryModal}
          participant={participant}
          onClose={() => setShowVictoryModal(false)}
          onViewLeaderboard={onViewLeaderboard}
          totalRounds={activeCount}
        />
      )}

      {/* Progress HUD bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            padding: '6px 12px',
            background: 'var(--accent-amber-subtle)',
            border: '1px solid var(--accent-amber-border)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.82rem',
            color: 'var(--accent-amber)',
            fontWeight: 700
          }}>
            ROUND {currentIdx + 1} OF {activeCount}
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Playing as: <strong style={{ color: '#ffffff' }}>{participant.team_name || participant.username}</strong>
          </span>
        </div>

        {/* Per-question countdown (timed mode) */}
        {compSettings.status === 'live' && currentQuestion && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '20px',
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            background: isTimedOut ? 'rgba(255, 51, 102, 0.1)' : 'rgba(0, 240, 255, 0.05)',
            border: `1px solid ${isTimedOut ? 'rgba(255, 51, 102, 0.5)' : 'rgba(0, 240, 255, 0.25)'}`
          }}>
            <Timer size={20} color={isTimedOut ? 'var(--neon-red)' : 'var(--neon-cyan)'} />
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '1.5rem',
              fontWeight: 800,
              color: isTimedOut ? 'var(--neon-red)' : remainingSeconds <= 60 ? 'var(--accent-amber)' : 'var(--neon-cyan)',
              minWidth: '76px'
            }}>
              {isTimedOut ? '00:00' : formatCountdown(remainingSeconds)}
            </div>
            <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${timerFraction * 100}%`,
                borderRadius: '4px',
                background: isTimedOut ? 'var(--neon-red)' : remainingSeconds <= 60 ? 'var(--accent-amber)' : 'var(--neon-cyan)',
                transition: 'width 1s linear'
              }} />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              VALUE: <strong style={{ color: isTimedOut ? 'var(--neon-red)' : 'var(--neon-green)' }}>{currentValue} PTS</strong>
              <span style={{ color: 'var(--text-muted)' }}> (−{compSettings.decay_per_second}/s)</span>
            </div>
          </div>
        )}

        {/* Multi-step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {activeQuestions.map((q, i) => (
            <div
              key={q.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                background: i < currentIdx 
                  ? 'var(--status-forest-subtle)' 
                  : i === currentIdx 
                  ? 'var(--accent-amber-subtle)' 
                  : 'rgba(255, 255, 255, 0.04)',
                color: i < currentIdx 
                  ? 'var(--status-forest)' 
                  : i === currentIdx 
                  ? 'var(--accent-amber)' 
                  : 'var(--text-muted)',
                border: i === currentIdx 
                  ? '1px solid var(--accent-amber)' 
                  : '1px solid transparent'
              }}
            >
              {i < currentIdx ? <CheckCircle2 size={12} /> : null}
              Q{i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Main Cipher Terminal Card */}
      {currentQuestion && (
        <div 
          className={`glass-card ${showShake ? 'shake-error' : ''}`} 
          style={{
            padding: '36px',
            background: 'rgba(12, 17, 26, 0.96)',
            border: '1px solid rgba(255, 255, 255, 0.09)',
            position: 'relative'
          }}
        >
          {/* Top Bar inside Terminal */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            paddingBottom: '18px',
            marginBottom: '24px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                padding: '6px',
                borderRadius: '6px',
                background: 'var(--accent-amber-subtle)',
                color: 'var(--accent-amber)'
              }}>
                <Terminal size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.35rem', color: '#ffffff', lineHeight: 1.2 }}>
                  {currentQuestion.title}
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  CIPHER TYPE: <span style={{ color: 'var(--accent-amber)' }}>{currentQuestion.cipher_type}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`cyber-badge ${
                currentQuestion.difficulty === 'Beginner' 
                  ? 'cyber-badge-green' 
                  : currentQuestion.difficulty === 'Intermediate' 
                  ? 'cyber-badge-slate' 
                  : 'cyber-badge-amber'
              }`}>
                {currentQuestion.difficulty}
              </span>
              <span className="cyber-badge cyber-badge-amber" title={compSettings.status === 'live' ? `Decays −${compSettings.decay_per_second}/s from ${currentQuestion.points} PTS` : undefined}>
                {compSettings.status === 'live' ? `+${currentValue} / ${currentQuestion.points} PTS` : `+${currentQuestion.points} PTS`}
              </span>
            </div>
          </div>

          {/* Cipher Text Display Box */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px'
            }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.06em' }}>
                LOCKED TRANSMISSION (CIPHERTEXT):
              </span>
              <button
                onClick={() => handleCopyCipher(currentQuestion.ciphertext)}
                className="cyber-btn cyber-btn-ghost"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                title="Copy encrypted text"
              >
                {copiedCipher ? <Check size={14} color="var(--status-forest)" /> : <Copy size={14} />}
                {copiedCipher ? 'Copied' : 'Copy Ciphertext'}
              </button>
            </div>

            <div style={{
              background: 'rgba(7, 10, 16, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 'var(--radius-md)',
              padding: '20px 24px',
              fontFamily: 'var(--font-mono)',
              fontSize: '1.2rem',
              color: 'var(--accent-amber)',
              letterSpacing: '0.06em',
              wordBreak: 'break-all',
              position: 'relative',
              boxShadow: 'inset 0 2px 10px rgba(0, 0, 0, 0.5)'
            }}>
              <span style={{ color: 'var(--text-muted)', marginRight: '10px', userSelect: 'none' }}>&gt;</span>
              {currentQuestion.ciphertext}
            </div>
          </div>

          {/* Clue Section: Some questions have clues, some don't! */}
          <div style={{ marginBottom: '28px' }}>
            {currentQuestion.clue ? (
              <div>
                <button
                  onClick={() => {
                    soundManager.playKeypress();
                    setShowClue(!showClue);
                  }}
                  className="cyber-btn cyber-btn-ghost"
                  style={{
                    fontSize: '0.82rem',
                    color: 'var(--accent-amber)',
                    borderColor: 'var(--accent-amber-border)',
                    padding: '8px 16px'
                  }}
                >
                  <HelpCircle size={16} />
                  {showClue ? 'Hide Tactical Clue' : 'Reveal Tactical Clue'}
                </button>

                {showClue && (
                  <div style={{
                    marginTop: '12px',
                    background: 'var(--accent-amber-subtle)',
                    border: '1px solid var(--accent-amber-border)',
                    padding: '14px 18px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.9rem',
                    color: '#fef3c7',
                    lineHeight: 1.6,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px'
                  }}>
                    <Key size={18} color="var(--accent-amber)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong style={{ color: 'var(--accent-amber)', display: 'block', marginBottom: '2px' }}>
                        Cryptanalytic Intel:
                      </strong>
                      {currentQuestion.clue}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px dashed rgba(255, 255, 255, 0.1)',
                padding: '10px 16px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.82rem',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <ShieldAlert size={16} />
                <span>No tactical clues available for this round. Analyze the raw byte format directly.</span>
              </div>
            )}
          </div>

          {/* Timeout: submissions locked, skip-only */}
          {isTimedOut ? (
            <div style={{
              marginTop: '4px',
              padding: '20px 22px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 51, 102, 0.08)',
              border: '1px solid rgba(255, 51, 102, 0.4)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--neon-red)', marginBottom: '6px', letterSpacing: '0.04em' }}>
                TIME EXPIRED — ROUND VALUE DEPLETED (0 PTS)
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                The {formatCountdown(compSettings.time_limit_seconds)} window for this round has closed. Submissions are locked — skip to the next round to continue.
              </p>
              <button
                onClick={handleSkip}
                disabled={isSkipping}
                className="cyber-btn cyber-btn-primary"
                style={{ padding: '14px 32px', fontSize: '1rem' }}
              >
                <SkipForward size={18} />
                {isSkipping ? 'Skipping...' : 'Skip to Next Round (0 PTS)'}
              </button>
            </div>
          ) : (
          /* Answer Submission Form */
          <form onSubmit={handleSubmit}>
            <label style={{
              display: 'block',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: '8px',
              letterSpacing: '0.04em'
            }}>
              DECRYPTED MESSAGE / FLAG INPUT:
            </label>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <input
                type="text"
                required
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Enter decoded text, e.g. ASTHRA{...}"
                className="cyber-input cyber-input-mono"
                style={{
                  flex: 1,
                  minWidth: '240px',
                  fontSize: '1rem',
                  padding: '14px 18px'
                }}
              />

              <button
                type="submit"
                disabled={isSubmitting}
                className="cyber-btn cyber-btn-primary"
                style={{ padding: '14px 28px', fontSize: '1rem' }}
              >
                {isSubmitting ? (
                  <>Verifying...</>
                ) : (
                  <>
                    <Unlock size={18} />
                    Submit Decryption
                  </>
                )}
              </button>
            </div>
          </form>
          )}

          {/* Feedback Alert */}
          {feedback && (
            <div style={{
              marginTop: '20px',
              padding: '14px 18px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: feedback.isError ? 'rgba(255, 51, 102, 0.12)' : 'rgba(0, 255, 157, 0.12)',
              border: `1px solid ${feedback.isError ? 'rgba(255, 51, 102, 0.4)' : 'rgba(0, 255, 157, 0.4)'}`,
              color: feedback.isError ? 'var(--neon-red)' : 'var(--neon-green)'
            }}>
              {feedback.isError ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
              <span>{feedback.message}</span>
            </div>
          )}
        </div>
      )}

      {/* Built-in Cryptanalysis Helper Toolbox */}
      <CryptoToolbox />

      {/* Victory Celebration Modal */}
      {showVictoryModal && participant && (
        <VictoryModal
          isOpen={showVictoryModal}
          participant={participant}
          onClose={() => setShowVictoryModal(false)}
          onViewLeaderboard={onViewLeaderboard}
          totalRounds={activeCount}
        />
      )}

      {/* Anti-Cheat Warning Alert Modal */}
      {cheatWarning.visible && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(3, 7, 18, 0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            maxWidth: '520px',
            width: '100%',
            background: 'linear-gradient(180deg, rgba(25, 12, 14, 0.98) 0%, rgba(12, 16, 26, 0.99) 100%)',
            border: '2px solid var(--neon-red)',
            boxShadow: '0 0 50px rgba(255, 51, 102, 0.35)',
            padding: '32px 28px',
            textAlign: 'center',
            position: 'relative',
            borderRadius: 'var(--radius-md)'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(255, 51, 102, 0.15)',
              border: '2px solid var(--neon-red)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: 'var(--neon-red)',
              boxShadow: '0 0 20px rgba(255, 51, 102, 0.4)'
            }}>
              <AlertOctagon size={34} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '12px' }}>
              <span className="cyber-badge cyber-badge-red">
                PROCTORING VIOLATION LOGGED
              </span>
              <span className="cyber-badge cyber-badge-amber">
                WARNING #{cheatWarning.warningCount}
              </span>
            </div>

            <h3 style={{ fontSize: '1.45rem', color: '#ffffff', marginBottom: '12px' }}>
              Unauthorized Screen Deviation Detected
            </h3>

            <p style={{ fontSize: '0.92rem', color: '#fca5a5', lineHeight: 1.6, marginBottom: '16px' }}>
              The Asthra 11.0 proctoring engine detected that you switched tabs, minimized the competition screen, or switched applications.
            </p>

            <div style={{
              background: 'rgba(0, 0, 0, 0.6)',
              padding: '12px 14px',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--neon-cyan)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              marginBottom: '20px',
              textAlign: 'left'
            }}>
              <div><strong>REASON:</strong> {cheatWarning.reason}</div>
              <div style={{ marginTop: '4px', color: 'var(--neon-red)' }}>
                <strong>ACTION:</strong> Incident recorded in event coordinator's Warnings panel. Repeat violations will lead to point deduction timeouts or immediate disqualification.
              </div>
            </div>

            <button
              onClick={() => {
                soundManager.playKeypress();
                setCheatWarning(prev => ({ ...prev, visible: false }));
              }}
              className="cyber-btn cyber-btn-primary"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '0.95rem',
                justifyContent: 'center'
              }}
            >
              Acknowledge &amp; Return to Decryption
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
