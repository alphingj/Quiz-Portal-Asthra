import type { Participant } from '../types';
import { soundManager } from '../services/audio';
import { Terminal, Trophy, Volume2, VolumeX, LogOut, User, Sparkles } from 'lucide-react';

interface NavbarProps {
  currentTab: 'rules' | 'quiz' | 'leaderboard' | 'admin';
  setCurrentTab: (tab: 'rules' | 'quiz' | 'leaderboard' | 'admin') => void;
  participant: Participant | null;
  onLogout: () => void;
  onOpenLogin: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  activeQuestionCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  participant,
  onLogout,
  onOpenLogin,
  isMuted,
  onToggleMute,
  activeQuestionCount = 5,
}) => {
  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backgroundColor: 'rgba(5, 8, 17, 0.85)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(0, 240, 255, 0.15)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
    }}>
      <div style={{
        maxWidth: '1440px',
        margin: '0 auto',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        {/* Left: Dual College & Fest Logos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          {/* St. Joseph's College Logo */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.95)',
            padding: '4px 10px',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
          }}>
            <img 
              src="/assets/sjcet_logo.png" 
              alt="St. Joseph's College of Engineering and Technology, Palai" 
              style={{ height: '36px', objectFit: 'contain' }}
            />
          </div>

          {/* Divider */}
          <div style={{ width: '1px', height: '36px', background: 'rgba(255, 255, 255, 0.15)' }} />

          {/* Asthra 11.0 Logo */}
          <div 
            onClick={() => { soundManager.playKeypress(); setCurrentTab('rules'); }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          >
            <img 
              src="/assets/asthra_cyan.png" 
              alt="Asthra 11.0 National Level Tech Fest" 
              style={{ height: '42px', objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(0, 240, 255, 0.6))' }}
            />
            <div>
              <div style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '1.25rem',
                fontWeight: 800,
                letterSpacing: '0.04em',
                lineHeight: 1.1,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                KEYBREAK
                <span style={{
                  fontSize: '0.65rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'var(--accent-amber-subtle)',
                  color: 'var(--accent-amber)',
                  border: '1px solid var(--accent-amber-border)',
                  fontWeight: 700
                }}>
                  11.0
                </span>
              </div>
              <div style={{
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                letterSpacing: '0.04em',
                fontWeight: 500
              }}>
                CIPHER CLASH • SJCET PALAI
              </div>
            </div>
          </div>
        </div>

        {/* Center: Navigation Buttons */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => { soundManager.playKeypress(); setCurrentTab('rules'); }}
            className={`cyber-btn ${currentTab === 'rules' ? 'cyber-btn-secondary' : 'cyber-btn-ghost'}`}
            style={{ fontSize: '0.88rem', padding: '8px 14px' }}
          >
            <Sparkles size={16} />
            Event Brief
          </button>

          <button
            onClick={() => { soundManager.playKeypress(); setCurrentTab('quiz'); }}
            className={`cyber-btn ${currentTab === 'quiz' ? 'cyber-btn-primary' : 'cyber-btn-ghost'}`}
            style={{ fontSize: '0.88rem', padding: '8px 14px' }}
          >
            <Terminal size={16} />
            Terminal Quiz
          </button>

          <button
            onClick={() => { soundManager.playKeypress(); setCurrentTab('leaderboard'); }}
            className={`cyber-btn ${currentTab === 'leaderboard' ? 'cyber-btn-secondary' : 'cyber-btn-ghost'}`}
            style={{ fontSize: '0.88rem', padding: '8px 14px', position: 'relative' }}
          >
            <Trophy size={16} />
            Leaderboard
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-amber)',
              boxShadow: '0 0 8px var(--accent-amber)',
              display: 'inline-block'
            }} className="animate-pulse" />
          </button>
        </nav>

        {/* Right Section: Audio & Participant Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Audio FX Toggle */}
          <button
            onClick={onToggleMute}
            title={isMuted ? 'Unmute Cyber SFX' : 'Mute Cyber SFX'}
            className="cyber-btn cyber-btn-ghost"
            style={{ padding: '8px', borderRadius: '50%' }}
          >
            {isMuted ? <VolumeX size={18} color="var(--text-muted)" /> : <Volume2 size={18} color="var(--accent-amber)" />}
          </button>

          {/* Participant Info or Login Button */}
          {participant ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'rgba(17, 24, 34, 0.9)',
              padding: '6px 14px',
              borderRadius: '999px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'var(--accent-amber)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#090d12',
                fontWeight: 700,
                fontSize: '0.8rem'
              }}>
                <User size={16} />
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  {participant.team_name || participant.username}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)' }}>
                  {participant.score} PTS • {participant.completed ? 'FINISHED' : `ROUND ${participant.current_question_index + 1}/${activeQuestionCount}`}
                </div>
              </div>
              <button
                onClick={onLogout}
                title="Log out"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                  marginLeft: '4px'
                }}
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { soundManager.playKeypress(); onOpenLogin(); }}
              className="cyber-btn cyber-btn-primary"
              style={{ fontSize: '0.88rem', padding: '8px 16px' }}
            >
              <User size={16} />
              Participant Login
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
