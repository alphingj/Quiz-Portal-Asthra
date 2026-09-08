import { useState, useEffect } from 'react';
import type { LeaderboardEntry, Question, CompetitionSettings } from '../types';
import { DEFAULT_COMPETITION_SETTINGS } from '../types';
import { store } from '../services/store';
import { soundManager } from '../services/audio';
import { getSupabase } from '../services/supabaseClient';
import { 
  Clock, 
  Search, 
  RefreshCw, 
  Maximize2, 
  Minimize2, 
  CheckCircle2, 
  Flame, 
  Flag, 
  Users, 
  Zap, 
  ShieldCheck, 
  Lock, 
  Terminal, 
  Crosshair,
  Crown,
  Activity
} from 'lucide-react';

interface LiveLeaderboardProps {
  currentParticipantId?: string;
  isProjectorMode?: boolean;
  onToggleProjectorMode?: (active: boolean) => void;
}

export const LiveLeaderboard: React.FC<LiveLeaderboardProps> = ({
  currentParticipantId,
  isProjectorMode = false,
  onToggleProjectorMode
}) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [compSettings, setCompSettings] = useState<CompetitionSettings>({ ...DEFAULT_COMPETITION_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [displayCount, setDisplayCount] = useState<number | 'all'>(3);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [autoRefreshCountdown, setAutoRefreshCountdown] = useState(5);
  const [clockString, setClockString] = useState('');

  // Live military clock for terminal telemetry
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const pad = (n: number) => (n < 10 ? '0' + n : n);
      const hours = pad(now.getHours());
      const mins = pad(now.getMinutes());
      const secs = pad(now.getSeconds());
      const ms = Math.floor(now.getMilliseconds() / 100);
      setClockString(`${hours}:${mins}:${secs}.${ms}`);
    };
    updateClock();
    const interval = setInterval(updateClock, 100);
    return () => clearInterval(interval);
  }, []);

  // Listen for Escape key to exit projector mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isProjectorMode) {
        soundManager.playKeypress();
        onToggleProjectorMode?.(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProjectorMode, onToggleProjectorMode]);

  const fetchLeaderboard = async () => {
    const [list, qList, settings] = await Promise.all([
      store.getLeaderboard(),
      store.getQuestions(),
      store.getCompetitionSettings()
    ]);
    setEntries(list);
    setQuestions(qList);
    setCompSettings(settings);
    setLoading(false);
    setLastRefreshed(new Date());
  };

  useEffect(() => {
    fetchLeaderboard();

    // Auto-refresh countdown interval (5s fallback)
    const timer = setInterval(() => {
      setAutoRefreshCountdown((prev) => {
        if (prev <= 1) {
          fetchLeaderboard();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    // Realtime Supabase subscription
    const client = getSupabase();
    let channel: any = null;
    if (client) {
      try {
        channel = client
          .channel('public:live_leaderboard')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => {
            fetchLeaderboard();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, () => {
            fetchLeaderboard();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, () => {
            fetchLeaderboard();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_settings' }, () => {
            fetchLeaderboard();
          })
          .subscribe();
      } catch (err) {
        console.warn('Realtime channel subscribe failed:', err);
      }
    }

    // Local / cross-tab broadcast updates
    const handleLocalUpdate = () => {
      fetchLeaderboard();
    };
    window.addEventListener('asthra_data_update', handleLocalUpdate);
    window.addEventListener('storage', handleLocalUpdate);

    return () => {
      clearInterval(timer);
      if (client && channel) {
        client.removeChannel(channel);
      }
      window.removeEventListener('asthra_data_update', handleLocalUpdate);
      window.removeEventListener('storage', handleLocalUpdate);
    };
  }, []);

  const handleManualRefresh = () => {
    soundManager.playKeypress();
    setLoading(true);
    fetchLeaderboard();
    setAutoRefreshCountdown(5);
  };

  // Filter out banned participants
  const activeEntries = entries.filter((e) => !e.is_banned);

  const filteredEntries = activeEntries.filter((e) => {
    const term = searchTerm.toLowerCase();
    return (
      e.team_name.toLowerCase().includes(term) ||
      e.username.toLowerCase().includes(term)
    );
  });

  const displayedEntries = displayCount === 'all' 
    ? filteredEntries 
    : filteredEntries.slice(0, displayCount);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  const toggleProjectorMode = () => {
    soundManager.playKeypress();
    onToggleProjectorMode?.(!isProjectorMode);
  };

  // Active rounds in play: first N by order (admin-configurable count)
  const activeCount = Math.max(1, Math.min(
    compSettings.active_question_count,
    Math.max(questions.length, 1)
  ));
  const activeQuestions = questions.slice(0, activeCount);
  const totalPossibleScore = activeQuestions.reduce((acc, q) => acc + q.points, 0);

  // Real contest metrics computed strictly from active participants
  const totalParticipants = activeEntries.length;
  const completedCount = activeEntries.filter((e) => e.completed).length;
  const totalQuestionsCount = activeCount;
  const totalFlagsSolved = activeEntries.reduce((acc, curr) => acc + Math.min(curr.current_question_index, activeCount), 0);
  const totalPossibleFlags = totalParticipants * totalQuestionsCount;
  const clearPercentage = totalParticipants > 0 ? Math.round((completedCount / totalParticipants) * 100) : 0;
  const flagProgressPercentage = totalPossibleFlags > 0 ? Math.round((totalFlagsSolved / totalPossibleFlags) * 100) : 0;
  const fastestBreaker = activeEntries.find((e) => e.completed);

  // Dynamic per-flag labels + first solvers, one slot per active round.
  // Solved check: index past the round (completed implies past the last one).
  const flagLabels: string[] = activeQuestions.map((q, i) =>
    i === activeQuestions.length - 1
      ? `F${i + 1}: ROOT`
      : `F${i + 1}: ${q.cipher_type.split(' ')[0].toUpperCase()}`
  );
  const flagWinners: (LeaderboardEntry | undefined)[] = activeQuestions.map((_, i) =>
    activeEntries.find(e => e.current_question_index >= i + 1)
  );
  const solvedFlagsFor = (entry: LeaderboardEntry): boolean[] =>
    activeQuestions.map((_, i) => entry.current_question_index >= i + 1 || entry.completed);

  const statusBadge = compSettings.status === 'live'
    ? { text: '● LIVE', cls: 'cyber-badge-green' }
    : compSettings.status === 'ended'
    ? { text: '■ ENDED', cls: 'cyber-badge-red' }
    : { text: '○ WAITING', cls: 'cyber-badge-amber' };

  // =========================================================================
  // DEDICATED TERMINAL-STYLE TELEMETRY UI (STAGE PROJECTOR MODE)
  // High-contrast, edge-to-edge command center display for auditorium projectors
  // Strictly complies with color ban (zero purple/violet/magenta)
  // =========================================================================
  if (isProjectorMode) {
    return (
      <div className="telemetry-viewport telemetry-scanlines" style={{
        minHeight: '100vh',
        width: '100vw',
        padding: '20px 32px 28px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        background: '#03060d'
      }}>
        {/* TOP TELEMETRY HUD BAR */}
        <div className="telemetry-box" style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          {/* Left: Station Identity & Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <img 
              src="/assets/sjcet_logo.png" 
              alt="SJCET Palai" 
              style={{
                height: '36px',
                objectFit: 'contain',
                background: 'rgba(255, 255, 255, 0.95)',
                padding: '3px 8px',
                borderRadius: '3px'
              }}
            />
            <div>
              <div style={{
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
                letterSpacing: '0.12em',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>ST. JOSEPH'S COLLEGE OF ENGINEERING & TECHNOLOGY, PALAI</span>
                <span>•</span>
                <span style={{ color: 'var(--electric-cyan)' }}>AUTONOMOUS</span>
              </div>
              <div style={{
                fontSize: '1.25rem',
                fontWeight: 900,
                color: '#ffffff',
                letterSpacing: '0.04em',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span>ASTHRA 11.0</span>
                <span style={{ color: 'var(--electric-cyan)' }}>//</span>
                <span className="glow-text-cyan">KEYBREAK TELEMETRY STATION</span>
                <span style={{
                  fontSize: '0.68rem',
                  padding: '2px 8px',
                  background: compSettings.status === 'live'
                    ? 'rgba(0, 255, 136, 0.12)'
                    : compSettings.status === 'ended'
                    ? 'rgba(255, 51, 102, 0.12)'
                    : 'rgba(245, 158, 11, 0.12)',
                  color: compSettings.status === 'live'
                    ? 'var(--phosphor-green)'
                    : compSettings.status === 'ended'
                    ? 'var(--neon-red)'
                    : 'var(--warning-amber)',
                  border: `1px solid ${compSettings.status === 'live'
                    ? 'rgba(0, 255, 136, 0.4)'
                    : compSettings.status === 'ended'
                    ? 'rgba(255, 51, 102, 0.4)'
                    : 'rgba(245, 158, 11, 0.4)'}`,
                  borderRadius: '2px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <span className="telemetry-blink" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
                  {compSettings.status === 'live'
                    ? `LIVE OPERATIONAL • ${activeCount} ROUNDS`
                    : compSettings.status === 'ended'
                    ? 'COMPETITION ENDED'
                    : 'STANDBY • AWAITING START'}
                </span>
              </div>
            </div>
          </div>

          {/* Center: Realtime Military Clock */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            background: 'rgba(3, 6, 13, 0.9)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            padding: '6px 16px',
            borderRadius: '2px'
          }}>
            <Clock size={16} color="var(--electric-cyan)" />
            <div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
                MISSION CLOCK [UTC+05:30 IST]
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--phosphor-green)', letterSpacing: '0.08em' }}>
                {clockString || '00:00:00.0'}
              </div>
            </div>
          </div>

          {/* Right: Controls (Limit, Refresh, Exit) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Filter Buttons */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(3, 6, 13, 0.9)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              borderRadius: '2px',
              padding: '2px'
            }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', padding: '0 8px', letterSpacing: '0.06em' }}>
                SHOW:
              </span>
              {[
                { label: 'TOP 3', val: 3 },
                { label: 'TOP 5', val: 5 },
                { label: 'TOP 10', val: 10 },
                { label: 'ALL', val: 'all' as const }
              ].map(opt => (
                <button
                  key={opt.label}
                  onClick={() => {
                    soundManager.playKeypress();
                    setDisplayCount(opt.val);
                  }}
                  style={{
                    background: displayCount === opt.val ? 'var(--electric-cyan)' : 'transparent',
                    color: displayCount === opt.val ? '#03060d' : 'var(--text-secondary)',
                    border: 'none',
                    padding: '4px 10px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    borderRadius: '2px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Sync Status Button */}
            <button
              onClick={handleManualRefresh}
              style={{
                background: 'rgba(0, 240, 255, 0.08)',
                border: '1px solid rgba(0, 240, 255, 0.3)',
                color: 'var(--electric-cyan)',
                padding: '6px 12px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                borderRadius: '2px'
              }}
              title="Manual Telemetry Sync"
            >
              <RefreshCw size={13} className={loading ? 'animate-pulse' : ''} />
              SYNC ({autoRefreshCountdown}s)
            </button>

            {/* Big Exit Button */}
            <button
              onClick={toggleProjectorMode}
              style={{
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid var(--warning-amber)',
                color: 'var(--warning-amber)',
                padding: '6px 14px',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                borderRadius: '2px',
                letterSpacing: '0.05em'
              }}
            >
              <Minimize2 size={14} />
              [ ⎋ EXIT TELEMETRY (ESC) ]
            </button>
          </div>
        </div>

        {/* TELEMETRY SENSORS & METRICS HUD */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '14px'
        }}>
          {/* Gauge 1: Connected Squads */}
          <div className="telemetry-box" style={{ padding: '12px 18px' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={13} color="var(--electric-cyan)" />
              [01 // CONNECTED_SQUADS]
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--electric-cyan)', lineHeight: 1.2, marginTop: '4px' }}>
              {totalParticipants.toString().padStart(2, '0')} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TEAMS ONLINE</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              STATUS: REALTIME LINK ACTIVE
            </div>
          </div>

          {/* Gauge 2: Flags Captured */}
          <div className="telemetry-box telemetry-box-green" style={{ padding: '12px 18px' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Flag size={13} color="var(--phosphor-green)" />
              [02 // FLAGS_COMPROMISED]
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--phosphor-green)', lineHeight: 1.2, marginTop: '4px' }}>
              {totalFlagsSolved.toString().padStart(2, '0')} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/ {totalPossibleFlags.toString().padStart(2, '0')} SOLVED</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--phosphor-green)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
              [{'█'.repeat(Math.min(10, Math.round((totalFlagsSolved / Math.max(1, totalPossibleFlags)) * 10)))}{'░'.repeat(10 - Math.min(10, Math.round((totalFlagsSolved / Math.max(1, totalPossibleFlags)) * 10)))}] {flagProgressPercentage}%
            </div>
          </div>

          {/* Gauge 3: Fastest Intrusion */}
          <div className="telemetry-box telemetry-box-amber" style={{ padding: '12px 18px' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={13} color="var(--warning-amber)" />
              [03 // FIRST_BLOOD_INTERCEPT]
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--warning-amber)', lineHeight: 1.2, marginTop: '4px' }}>
              {fastestBreaker ? formatTime(fastestBreaker.time_taken_seconds) : '--:--'}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--warning-amber)', marginTop: '2px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              HACKER: {fastestBreaker ? fastestBreaker.team_name : flagWinners[0] ? `${flagWinners[0].team_name} (F1)` : 'AWAITING SOLVE'}
            </div>
          </div>

          {/* Gauge 4: Root Clearance */}
          <div className="telemetry-box" style={{ padding: '12px 18px' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={13} color="#ffffff" />
              [04 // ROOT_CLEARANCE_RATIO]
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#ffffff', lineHeight: 1.2, marginTop: '4px' }}>
              {clearPercentage}% <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>OF CONTESTANTS</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              FULL {activeCount}-ROUND COMPROMISES: {completedCount}
            </div>
          </div>
        </div>

        {/* LIVE TERMINAL INTEL LOG / TICKER */}
        <div style={{
          background: 'rgba(4, 8, 16, 0.95)',
          border: '1px solid rgba(0, 240, 255, 0.2)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '0.75rem',
          borderRadius: '2px',
          overflow: 'hidden'
        }}>
          <span style={{
            background: 'rgba(245, 158, 11, 0.15)',
            color: 'var(--warning-amber)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            padding: '2px 8px',
            fontSize: '0.68rem',
            fontWeight: 800,
            whiteSpace: 'nowrap'
          }}>
            LIVE_LOG_STREAM
          </span>
          <div style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ color: 'var(--phosphor-green)' }}>&gt;</span> {
              activeEntries.length === 0
                ? '[SYS_READY] Telemetry node active • Awaiting participant registrations from event desk • 0 squads currently on-grid '
                : `[TELEMETRY] ${totalFlagsSolved} of ${totalPossibleFlags} flags cracked across ${totalParticipants} active teams • ${flagWinners[0] ? `Flag 1 breached by ${flagWinners[0].team_name} • ` : ''}${activeEntries[0] ? `Rank #1 held by ${activeEntries[0].team_name} (${activeEntries[0].score} PTS) • ` : ''}Anti-cheat proctoring active `
            }<span className="telemetry-blink">_</span>
          </div>
        </div>

        {/* MAIN TERMINAL CTF MATRIX TABLE */}
        <div className="telemetry-box" style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Table Monospace Telemetry */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontFamily: 'var(--font-mono)'
            }}>
              <thead>
                <tr style={{
                  background: 'rgba(7, 14, 28, 0.95)',
                  borderBottom: '1px solid rgba(0, 240, 255, 0.3)',
                  color: 'var(--text-muted)',
                  fontSize: '0.76rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase'
                }}>
                  <th style={{ padding: '14px 20px', width: '90px' }}>[RANK]</th>
                  <th style={{ padding: '14px 20px' }}>[SQUAD_CALLSIGN // OPERATOR]</th>
                  <th style={{ padding: '14px 20px' }}>[CIPHER_FLAGS: {flagLabels.map((_, i) => `F${i + 1}`).join(' / ') || 'F1'}]</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right', width: '130px' }}>[CHRONO]</th>
                  <th style={{ padding: '14px 20px', width: '220px' }}>[INTRUSION_STATE]</th>
                  <th style={{ padding: '14px 24px', textAlign: 'right', width: '140px' }}>[SCORE]</th>
                </tr>
              </thead>
              <tbody>
                {displayedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '60px 20px', textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px' }}>
                        [ STANDBY: AWAITING CIPHER SQUAD ENGAGEMENT ]
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--electric-cyan)' }}>
                        &gt; TELEMETRY SCANNING FOR AUTHENTICATED NODES...
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedEntries.map((item) => {
                    const isCurrent = item.id === currentParticipantId;
                    const solved = solvedFlagsFor(item);

                    const rankStyle = item.rank === 1
                      ? { color: 'var(--warning-amber)', borderColor: 'var(--warning-amber)', bg: 'rgba(245, 158, 11, 0.15)' }
                      : item.rank === 2
                      ? { color: 'var(--electric-cyan)', borderColor: 'var(--electric-cyan)', bg: 'rgba(0, 240, 255, 0.12)' }
                      : item.rank === 3
                      ? { color: 'var(--phosphor-green)', borderColor: 'var(--phosphor-green)', bg: 'rgba(0, 255, 136, 0.12)' }
                      : { color: 'var(--text-secondary)', borderColor: 'rgba(255, 255, 255, 0.15)', bg: 'rgba(255, 255, 255, 0.03)' };

                    return (
                      <tr
                        key={item.id}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                          background: isCurrent 
                            ? 'rgba(0, 240, 255, 0.06)' 
                            : item.rank === 1 
                            ? 'rgba(245, 158, 11, 0.03)' 
                            : 'transparent',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {/* Rank */}
                        <td style={{ padding: '16px 20px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            background: rankStyle.bg,
                            border: `1px solid ${rankStyle.borderColor}`,
                            color: rankStyle.color,
                            fontWeight: 900,
                            fontSize: '0.85rem',
                            borderRadius: '2px'
                          }}>
                            {item.rank === 1 && <Crown size={12} />}
                            #{item.rank.toString().padStart(2, '0')}
                          </span>
                        </td>

                        {/* Squad Callsign */}
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              fontSize: '1.1rem',
                              fontWeight: 800,
                              color: '#ffffff',
                              letterSpacing: '-0.01em'
                            }}>
                              root@asthra:~# {item.team_name}
                            </span>
                            {isCurrent && (
                              <span style={{
                                background: 'var(--electric-cyan)',
                                color: '#03060d',
                                fontSize: '0.62rem',
                                fontWeight: 900,
                                padding: '1px 5px',
                                borderRadius: '2px'
                              }}>
                                ACTIVE_NODE
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            CALLSIGN: @{item.username}
                          </div>
                        </td>

                        {/* Flags (one block per active round) */}
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {flagLabels.map((label, i) => (
                              <span key={label} className={`telemetry-flag-block ${solved[i] ? 'telemetry-flag-solved' : 'telemetry-flag-locked'}`}>
                                {solved[i] ? `██ ${label}` : `░░ ${label}`}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Chrono */}
                        <td style={{ padding: '16px 20px', textAlign: 'right', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <Clock size={13} color="var(--text-muted)" />
                            {formatTime(item.time_taken_seconds)}
                          </span>
                        </td>

                        {/* Intrusion State */}
                        <td style={{ padding: '16px 20px' }}>
                          {item.completed ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 10px',
                              background: 'rgba(0, 255, 136, 0.14)',
                              border: '1px solid var(--phosphor-green)',
                              color: 'var(--phosphor-green)',
                              fontSize: '0.74rem',
                              fontWeight: 800,
                              borderRadius: '2px'
                            }}>
                              <ShieldCheck size={13} />
                              [★ SYSTEM_ROOTED {activeCount}/{activeCount}]
                            </span>
                          ) : (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 10px',
                              background: 'rgba(0, 240, 255, 0.08)',
                              border: '1px solid rgba(0, 240, 255, 0.3)',
                              color: 'var(--electric-cyan)',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              borderRadius: '2px'
                            }}>
                              <Crosshair size={13} />
                              [▶ INFILTRATING R{item.current_question_index + 1}]
                            </span>
                          )}
                        </td>

                        {/* Score */}
                        <td style={{
                          padding: '16px 24px',
                          textAlign: 'right',
                          fontSize: '1.45rem',
                          fontWeight: 900,
                          color: item.rank === 1 ? 'var(--warning-amber)' : 'var(--phosphor-green)'
                        }}>
                          {item.score} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PTS</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* BOTTOM TELEMETRY STATUS BAR */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.72rem',
          color: 'var(--text-muted)',
          padding: '4px 6px',
          letterSpacing: '0.06em'
        }}>
          <div>
            ASTHRA 11.0 CIPHER CLASH TELEMETRY HUB • SJCET PALAI (AUTONOMOUS)
          </div>
          <div>
            PRESS <kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '2px 6px', borderRadius: '3px', color: '#ffffff' }}>ESC</kbd> TO RETURN TO CONVENTIONAL DISPLAY
          </div>
        </div>
      </div>
    );
  }

  // Standard TryHackMe Room Scoreboard View
  return (
    <div style={{
      maxWidth: isProjectorMode ? '100%' : '1360px',
      margin: '0 auto',
      padding: isProjectorMode ? '24px 40px' : '28px 24px 80px',
      transition: 'all 0.3s ease'
    }}>
      {/* THM Room Header Banner */}
      <div className="thm-panel" style={{
        padding: '24px 28px',
        marginBottom: '24px',
        background: 'linear-gradient(180deg, rgba(14, 23, 42, 0.95) 0%, rgba(8, 14, 26, 0.98) 100%)',
        border: '1px solid rgba(0, 240, 255, 0.2)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: '18px',
          marginBottom: '20px'
        }}>
          {/* Room Title & CTF Badges */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                letterSpacing: '0.08em'
              }}>
                ROOM://ASTHRA-11.0/KEYBREAK
              </span>
              <span className="thm-flag-badge thm-flag-solved" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                <Activity size={12} className="animate-pulse" />
                LIVE SCOREBOARD
              </span>
            </div>

            <h1 style={{
              fontSize: isProjectorMode ? '2.4rem' : '1.9rem',
              color: '#ffffff',
              fontFamily: 'var(--font-heading)',
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              KEYBREAK <span className="glow-text-cyan">CTF SCOREBOARD</span>
            </h1>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              <span className="cyber-badge cyber-badge-cyan">
                <Terminal size={12} /> CRYPTOGRAPHY ROOM
              </span>
              <span className="cyber-badge cyber-badge-green">
                <Flag size={12} /> {activeCount} FLAGS TOTAL
              </span>
              <span className="cyber-badge cyber-badge-amber">
                <Flame size={12} /> ASTHRA 11.0 OFFICIAL
              </span>
              <span className={`cyber-badge ${statusBadge.cls}`}>
                {statusBadge.text} • {activeCount} ROUND{activeCount === 1 ? '' : 'S'}
              </span>
            </div>
          </div>

          {/* Action Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search hacker / team..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="cyber-input"
                style={{
                  paddingLeft: '34px',
                  paddingTop: '8px',
                  paddingBottom: '8px',
                  fontSize: '0.82rem',
                  background: 'rgba(7, 12, 22, 0.95)',
                  borderColor: 'rgba(0, 240, 255, 0.2)'
                }}
              />
            </div>

            {/* Manual Refresh */}
            <button
              onClick={handleManualRefresh}
              className="cyber-btn cyber-btn-ghost"
              style={{ fontSize: '0.82rem', padding: '8px 14px' }}
              title={`Last synchronized at ${lastRefreshed.toLocaleTimeString()}`}
            >
              <RefreshCw size={14} className={loading ? 'animate-pulse' : ''} />
              Sync ({autoRefreshCountdown}s)
            </button>

            {/* Display Limit Selector */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(7, 12, 22, 0.95)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 8px'
            }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                SHOW:
              </span>
              <select
                value={displayCount}
                onChange={(e) => {
                  soundManager.playKeypress();
                  const val = e.target.value;
                  setDisplayCount(val === 'all' ? 'all' : Number(val));
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--neon-cyan)',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  outline: 'none',
                  padding: '5px 2px'
                }}
              >
                <option value={3} style={{ background: '#0b1221', color: '#fff' }}>Top 3 (Default)</option>
                <option value={5} style={{ background: '#0b1221', color: '#fff' }}>Top 5 Teams</option>
                <option value={10} style={{ background: '#0b1221', color: '#fff' }}>Top 10 Teams</option>
                <option value="all" style={{ background: '#0b1221', color: '#fff' }}>All Teams</option>
              </select>
            </div>

            {/* Stage Projector Mode Toggle */}
            <button
              onClick={toggleProjectorMode}
              className="cyber-btn cyber-btn-secondary"
              style={{ fontSize: '0.82rem', padding: '8px 14px' }}
            >
              {isProjectorMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              {isProjectorMode ? 'Exit Stage' : 'Stage Projector'}
            </button>
          </div>
        </div>

        {/* THM Room Telemetry Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px'
        }}>
          {/* Stat 1: Active Hackers */}
          <div style={{
            background: 'rgba(7, 12, 22, 0.75)',
            border: '1px solid rgba(0, 240, 255, 0.15)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 16px'
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <Users size={14} color="var(--electric-cyan)" /> Connected Teams
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--electric-cyan)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
              {totalParticipants} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ONLINE</span>
            </div>
          </div>

          {/* Stat 2: Total Flags Solved */}
          <div style={{
            background: 'rgba(7, 12, 22, 0.75)',
            border: '1px solid rgba(0, 255, 136, 0.15)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 16px'
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <Flag size={14} color="var(--phosphor-green)" /> Flags Captured
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--phosphor-green)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
              {totalFlagsSolved} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/ {totalPossibleFlags}</span>
            </div>
          </div>

          {/* Stat 3: Fastest Intrusion */}
          <div style={{
            background: 'rgba(7, 12, 22, 0.75)',
            border: '1px solid rgba(245, 158, 11, 0.15)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 16px'
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <Zap size={14} color="var(--warning-amber)" /> Fastest Clear
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--warning-amber)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
              {fastestBreaker ? formatTime(fastestBreaker.time_taken_seconds) : '--:--'}
            </div>
          </div>

          {/* Stat 4: Clear Rate */}
          <div style={{
            background: 'rgba(7, 12, 22, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 16px'
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <ShieldCheck size={14} color="var(--text-secondary)" /> Root Clearance
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
              {clearPercentage}% <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SOLVED</span>
            </div>
          </div>
        </div>
      </div>

      {/* First Blood Speed Breakers Ticker */}
      {activeEntries.length > 0 && !searchTerm && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'rgba(11, 18, 33, 0.75)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 18px',
          marginBottom: '24px',
          overflowX: 'auto'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--warning-amber)',
            fontWeight: 800,
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap'
          }}>
            <Flame size={15} /> FIRST BLOOD FEED:
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '0.78rem' }}>
            {flagLabels.map((label, i) => {
              const winner = flagWinners[i];
              const isLast = i === flagLabels.length - 1;
              return (
                <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: '14px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                    <span
                      className="thm-first-blood-tag"
                      style={isLast ? { background: 'var(--phosphor-green-subtle)', color: 'var(--phosphor-green)', borderColor: 'var(--phosphor-green-border)' } : undefined}
                    >
                      {isLast ? label : label.split(':')[0]}
                    </span>
                    <span style={{ color: '#ffffff', fontWeight: 600 }}>{winner ? winner.team_name : 'Unclaimed'}</span>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                      ({winner ? formatTime(winner.time_taken_seconds) : '--'})
                    </span>
                  </span>
                  {!isLast && <span style={{ color: 'rgba(255, 255, 255, 0.15)' }}>•</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Top 3 TryHackMe Hacker Cards */}
      {!isProjectorMode && activeEntries.length >= 3 && !searchTerm && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          {/* #1 GOLD HACKER */}
          {activeEntries[0] && (
            <div className="glass-card" style={{
              padding: '20px',
              background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, rgba(11, 18, 33, 0.95) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              position: 'relative'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{
                  background: 'var(--warning-amber-subtle)',
                  color: 'var(--warning-amber)',
                  border: '1px solid var(--warning-amber-border)',
                  padding: '3px 10px',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <Crown size={14} /> RANK #1 [LEADER]
                </div>
                <Flame size={18} color="var(--warning-amber)" />
              </div>

              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }}>
                {activeEntries[0].team_name}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '14px' }}>
                @{activeEntries[0].username}
              </div>

              {/* Dynamic Flags Matrix Breakdown (#22) */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {solvedFlagsFor(activeEntries[0]).map((solved, i) => (
                  <span key={i} className={`thm-flag-badge ${solved ? 'thm-flag-solved' : 'thm-flag-locked'}`}>
                    {flagLabels[i] || `F${i + 1}`}
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>POINTS</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--warning-amber)', fontFamily: 'var(--font-mono)' }}>
                    {activeEntries[0].score} <span style={{ fontSize: '0.75rem' }}>PTS</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>TIME</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {formatTime(activeEntries[0].time_taken_seconds)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* #2 CYAN HACKER */}
          {activeEntries[1] && (
            <div className="glass-card" style={{
              padding: '20px',
              background: 'linear-gradient(180deg, rgba(0, 240, 255, 0.06) 0%, rgba(11, 18, 33, 0.95) 100%)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              position: 'relative'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{
                  background: 'var(--electric-cyan-subtle)',
                  color: 'var(--electric-cyan)',
                  border: '1px solid var(--electric-cyan-border)',
                  padding: '3px 10px',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <Crosshair size={14} /> RANK #2 [RUNNER-UP]
                </div>
              </div>

              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }}>
                {activeEntries[1].team_name}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '14px' }}>
                @{activeEntries[1].username}
              </div>

              {/* Dynamic Flags Matrix Breakdown (#22) */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {solvedFlagsFor(activeEntries[1]).map((solved, i) => (
                  <span key={i} className={`thm-flag-badge ${solved ? 'thm-flag-solved' : 'thm-flag-locked'}`}>
                    {flagLabels[i] || `F${i + 1}`}
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>POINTS</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--electric-cyan)', fontFamily: 'var(--font-mono)' }}>
                    {activeEntries[1].score} <span style={{ fontSize: '0.75rem' }}>PTS</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>TIME</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {formatTime(activeEntries[1].time_taken_seconds)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* #3 PHOSPHOR GREEN HACKER */}
          {activeEntries[2] && (
            <div className="glass-card" style={{
              padding: '20px',
              background: 'linear-gradient(180deg, rgba(0, 255, 136, 0.06) 0%, rgba(11, 18, 33, 0.95) 100%)',
              border: '1px solid rgba(0, 255, 136, 0.25)',
              position: 'relative'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{
                  background: 'var(--phosphor-green-subtle)',
                  color: 'var(--phosphor-green)',
                  border: '1px solid var(--phosphor-green-border)',
                  padding: '3px 10px',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <ShieldCheck size={14} /> RANK #3 [VANGUARD]
                </div>
              </div>

              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }}>
                {activeEntries[2].team_name}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '14px' }}>
                @{activeEntries[2].username}
              </div>

              {/* Dynamic Flags Matrix Breakdown (#22) */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {solvedFlagsFor(activeEntries[2]).map((solved, i) => (
                  <span key={i} className={`thm-flag-badge ${solved ? 'thm-flag-solved' : 'thm-flag-locked'}`}>
                    {flagLabels[i] || `F${i + 1}`}
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>POINTS</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--phosphor-green)', fontFamily: 'var(--font-mono)' }}>
                    {activeEntries[2].score} <span style={{ fontSize: '0.75rem' }}>PTS</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>TIME</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {formatTime(activeEntries[2].time_taken_seconds)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TryHackMe CTF Scoreboard Matrix Table */}
      <div className="thm-panel" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
            fontFamily: 'var(--font-sans)'
          }}>
            <thead>
              <tr style={{
                background: 'rgba(7, 12, 22, 0.98)',
                borderBottom: '1px solid rgba(0, 240, 255, 0.16)',
                color: 'var(--text-secondary)',
                fontSize: '0.74rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em'
              }}>
                <th style={{ padding: '16px 20px', width: '80px' }}>Rank</th>
                <th style={{ padding: '16px 20px' }}>Hacker / Squad</th>
                <th style={{ padding: '16px 20px', width: '280px' }}>Flag Matrix ({activeCount} Flag{activeCount === 1 ? '' : 's'} • {totalPossibleScore} PTS)</th>
                <th style={{ padding: '16px 20px', width: '130px', textAlign: 'right' }}>Time</th>
                <th style={{ padding: '16px 20px', width: '180px' }}>Intrusion State</th>
                <th style={{ padding: '16px 24px', width: '130px', textAlign: 'right' }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {displayedEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No participant scores recorded yet in this room.
                  </td>
                </tr>
              ) : (
                displayedEntries.map((item) => {
                  const isCurrent = currentParticipantId === item.id;
                  const solved = solvedFlagsFor(item);

                  return (
                    <tr
                      key={item.id}
                      className="thm-table-row"
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        backgroundColor: isCurrent 
                          ? 'rgba(0, 240, 255, 0.08)' 
                          : 'transparent'
                      }}
                    >
                      {/* Rank Position */}
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '32px',
                          height: '32px',
                          borderRadius: '4px',
                          fontWeight: 800,
                          fontSize: '0.9rem',
                          fontFamily: 'var(--font-mono)',
                          background: item.rank === 1
                            ? 'var(--warning-amber)'
                            : item.rank === 2
                            ? 'var(--electric-cyan)'
                            : item.rank === 3
                            ? 'var(--phosphor-green)'
                            : 'rgba(255, 255, 255, 0.05)',
                          color: item.rank <= 3 ? '#070b14' : 'var(--text-secondary)',
                          boxShadow: item.rank === 1 ? '0 2px 10px rgba(245, 158, 11, 0.3)' : 'none'
                        }}>
                          #{item.rank}
                        </div>
                      </td>

                      {/* Team Name and Username */}
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            fontSize: '0.98rem',
                            fontWeight: 700,
                            color: isCurrent ? 'var(--electric-cyan)' : '#ffffff'
                          }}>
                            {item.team_name}
                          </span>
                          {isCurrent && (
                            <span className="cyber-badge cyber-badge-cyan" style={{ fontSize: '0.62rem', padding: '1px 6px' }}>
                              YOU
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          @{item.username}
                        </div>
                      </td>

                      {/* TryHackMe Flag Progress Matrix (one badge per active round) */}
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {flagLabels.map((label, i) => {
                            const isLast = i === flagLabels.length - 1;
                            const shortTag = isLast ? `F${i + 1}: ROOT` : `F${i + 1}`;
                            return (
                              <span
                                key={label}
                                title={solved[i] ? `${label} [SOLVED]` : `${label} [LOCKED]`}
                                className={`thm-flag-badge ${solved[i] ? 'thm-flag-solved' : 'thm-flag-locked'}`}
                              >
                                {solved[i] ? <CheckCircle2 size={11} /> : <Lock size={11} />}
                                {shortTag}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Time Taken */}
                      <td style={{
                        padding: '16px 20px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.86rem',
                        color: 'var(--text-secondary)'
                      }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <Clock size={12} color="var(--text-muted)" />
                          {formatTime(item.time_taken_seconds)}
                        </span>
                      </td>

                      {/* Intrusion Status Badge */}
                      <td style={{ padding: '16px 20px' }}>
                        {item.completed ? (
                          <span className="thm-flag-badge thm-flag-solved" style={{ fontSize: '0.72rem' }}>
                            <ShieldCheck size={12} />
                            SYSTEM ROOTED ({activeCount}/{activeCount})
                          </span>
                        ) : (
                          <span className="thm-flag-badge" style={{
                            background: 'rgba(0, 240, 255, 0.08)',
                            color: 'var(--electric-cyan)',
                            border: '1px solid rgba(0, 240, 255, 0.25)'
                          }}>
                            <Crosshair size={12} />
                            INFILTRATING ROUND {item.current_question_index + 1}
                          </span>
                        )}
                      </td>

                      {/* Score Points */}
                      <td style={{
                        padding: '16px 24px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '1.2rem',
                        fontWeight: 800,
                        color: item.rank === 1 ? 'var(--warning-amber)' : 'var(--phosphor-green)'
                      }}>
                        {item.score} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>PTS</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
