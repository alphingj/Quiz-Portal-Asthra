import { useState } from 'react';
import type { Participant } from '../types';
import { store } from '../services/store';
import { soundManager } from '../services/audio';
import { Lock, User, Users, ShieldAlert, ShieldCheck, CheckCircle2, ArrowRight, X } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (participant: Participant) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Step 2: Team Name setup if admin did not set one
  const [pendingParticipant, setPendingParticipant] = useState<Participant | null>(null);
  const [customTeamName, setCustomTeamName] = useState('');

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Please enter both username and password.');
      soundManager.playError();
      return;
    }

    setLoading(true);
    soundManager.playKeypress();

    try {
      const res = await store.loginParticipant(username, password);
      if (!res.success || !res.participant) {
        setErrorMsg(res.message);
        soundManager.playError();
        setLoading(false);
        return;
      }

      soundManager.playSuccess();

      // Check if team name needs to be set
      if (res.needsTeamName) {
        setPendingParticipant(res.participant);
        setCustomTeamName('');
        setLoading(false);
      } else {
        // Admin already provided a team name!
        onLoginSuccess(res.participant);
        onClose();
      }
    } catch {
      setErrorMsg('Login failed. Check connection.');
      soundManager.playError();
      setLoading(false);
    }
  };

  const handleTeamNameConfirm = async (useDefaultUsername: boolean) => {
    if (!pendingParticipant) return;
    soundManager.playKeypress();
    setLoading(true);

    const chosenName = useDefaultUsername || !customTeamName.trim()
      ? pendingParticipant.username
      : customTeamName.trim();

    try {
      const updated = await store.setTeamName(pendingParticipant.id, chosenName);
      soundManager.playSuccess();
      onLoginSuccess(updated || { ...pendingParticipant, team_name: chosenName });
      onClose();
    } catch {
      setErrorMsg('Failed to save team name.');
      soundManager.playError();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(2, 4, 10, 0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div className="glass-card glow-border-amber" style={{
        maxWidth: '460px',
        width: '100%',
        padding: '32px',
        position: 'relative',
        background: 'rgba(14, 20, 30, 0.98)',
        border: '1px solid var(--accent-amber-border)'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
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

        {!pendingParticipant ? (
          /* STEP 1: Participant Login */
          <div>
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
                <Lock size={26} />
              </div>
              <h2 style={{ fontSize: '1.45rem', color: '#ffffff', marginBottom: '6px' }}>Participant Access</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Enter the credentials issued at the Asthra registration desk
              </p>
            </div>

            {errorMsg && (
              <div style={{
                background: 'rgba(255, 51, 102, 0.12)',
                border: '1px solid rgba(255, 51, 102, 0.4)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--neon-red)',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '18px'
              }}>
                <ShieldAlert size={18} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  PARTICIPANT USERNAME / ID
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. cipher_wolf"
                    className="cyber-input cyber-input-mono"
                    style={{ paddingLeft: '42px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  ACCESS PASSWORD
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-muted)' }} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="cyber-input"
                    style={{ paddingLeft: '42px' }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="cyber-btn cyber-btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: '1rem' }}
              >
                {loading ? 'Authenticating...' : 'Authorize Terminal Access'}
                <ArrowRight size={18} />
              </button>

              <div style={{
                marginTop: '18px',
                padding: '10px 12px',
                background: 'rgba(0, 240, 255, 0.04)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(0, 240, 255, 0.15)',
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                textAlign: 'center'
              }}>
                <ShieldCheck size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px', color: 'var(--electric-cyan)' }} />
                Please enter the participant credentials issued by the <strong>Asthra 11.0</strong> event desk.
              </div>
            </form>
          </div>
        ) : (
          /* STEP 2: Optional Team Name Setup */
          <div>
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
                <Users size={26} />
              </div>
              <h2 style={{ fontSize: '1.45rem', color: '#ffffff', marginBottom: '6px' }}>Set Team Name (Optional)</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                No team name was set by the admin for <strong style={{ color: 'var(--accent-amber)' }}>{pendingParticipant.username}</strong>.
              </p>
            </div>

            <div style={{
              background: 'var(--accent-amber-subtle)',
              border: '1px solid var(--accent-amber-border)',
              padding: '14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              color: '#fef3c7',
              marginBottom: '20px'
            }}>
              You can enter a custom team name to display on the live leaderboard, or skip to automatically use your username <code style={{ color: 'var(--accent-amber)' }}>{pendingParticipant.username}</code>.
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                TEAM NAME (OPTIONAL)
              </label>
              <input
                type="text"
                value={customTeamName}
                onChange={(e) => setCustomTeamName(e.target.value)}
                placeholder={`Leave blank to use "${pendingParticipant.username}"`}
                className="cyber-input"
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleTeamNameConfirm(false)}
                className="cyber-btn cyber-btn-primary"
                style={{ width: '100%', padding: '12px' }}
              >
                <CheckCircle2 size={18} />
                {customTeamName.trim() ? `Confirm "${customTeamName.trim()}"` : `Use "${pendingParticipant.username}" as Team Name`}
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => handleTeamNameConfirm(true)}
                className="cyber-btn cyber-btn-ghost"
                style={{ width: '100%', padding: '10px' }}
              >
                Skip & Default to Username ({pendingParticipant.username})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
