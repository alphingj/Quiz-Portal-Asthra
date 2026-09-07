import React from 'react';
import { soundManager } from '../services/audio';
import { Terminal, Trophy, ShieldCheck, Key, Zap, Lock, Cpu } from 'lucide-react';

interface HeroRulesProps {
  onStartQuiz: () => void;
  onViewLeaderboard: () => void;
  isLoggedIn: boolean;
}

export const HeroRules: React.FC<HeroRulesProps> = ({
  onStartQuiz,
  onViewLeaderboard,
  isLoggedIn,
}) => {
  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '40px 24px 80px' }}>
      {/* Top Tech Fest & College Banner */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        marginBottom: '48px',
        position: 'relative'
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '6px 16px',
          borderRadius: '999px',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          marginBottom: '20px',
          fontWeight: 600,
          letterSpacing: '0.06em'
        }}>
          <Cpu size={14} color="var(--accent-amber)" />
          ST. JOSEPH'S COLLEGE OF ENGINEERING & TECHNOLOGY, PALAI (AUTONOMOUS)
        </div>

        {/* Big Asthra Logo Presentation */}
        <div style={{ marginBottom: '16px', position: 'relative' }}>
          <img 
            src="/assets/asthra_green.png" 
            alt="Asthra 11.0" 
            style={{
              height: '105px',
              objectFit: 'contain',
              filter: 'drop-shadow(0 6px 20px rgba(0, 0, 0, 0.5))'
            }}
          />
        </div>

        <h1 style={{
          fontSize: 'clamp(2.5rem, 6vw, 4.2rem)',
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.035em',
          marginBottom: '16px',
          color: 'var(--text-primary)',
        }}>
          KEYBREAK : <span style={{ color: 'var(--accent-amber)' }}>CIPHER CLASH</span>
        </h1>

        <p style={{
          fontSize: '1.15rem',
          color: 'var(--text-secondary)',
          maxWidth: '820px',
          margin: '0 auto 32px',
          lineHeight: 1.7,
        }}>
          The flagship cryptography & cyber-defense challenge of Asthra 11.0. Decrypt locked transmissions one cipher at a time, climb the live leaderboard, and demonstrate your analytical prowess.
        </p>

        {/* Action CTAs */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => { soundManager.playKeypress(); onStartQuiz(); }}
            className="cyber-btn cyber-btn-primary"
            style={{ fontSize: '1.05rem', padding: '14px 32px', borderRadius: 'var(--radius-md)' }}
          >
            <Terminal size={20} />
            {isLoggedIn ? 'Enter KeyBreak Terminal' : 'Login & Begin Cipher Challenge'}
          </button>

          <button
            onClick={() => { soundManager.playKeypress(); onViewLeaderboard(); }}
            className="cyber-btn cyber-btn-secondary"
            style={{ fontSize: '1.05rem', padding: '14px 28px', borderRadius: 'var(--radius-md)' }}
          >
            <Trophy size={20} />
            View Live Standings
          </button>
        </div>
      </div>

      {/* Official Cipher Clash Description Box */}
      <div className="glass-card" style={{
        padding: '36px',
        marginBottom: '40px',
        position: 'relative',
        overflow: 'hidden',
        borderLeft: '3px solid var(--accent-amber)'
      }}>
        <div style={{
          position: 'absolute',
          top: '-15%',
          right: '-5%',
          opacity: 0.03,
          pointerEvents: 'none'
        }}>
          <Lock size={300} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{
            padding: '8px',
            background: 'var(--accent-amber-subtle)',
            borderRadius: '6px',
            color: 'var(--accent-amber)'
          }}>
            <ShieldCheck size={22} />
          </div>
          <h2 style={{ fontSize: '1.4rem', color: '#ffffff' }}>Official Event Overview</h2>
          <span className="cyber-badge cyber-badge-amber">Asthra 11.0 Edition</span>
        </div>

        <blockquote style={{
          fontSize: '1.05rem',
          lineHeight: '1.8',
          color: '#cbd5e1',
          fontStyle: 'normal',
          borderLeft: 'none',
          background: 'rgba(11, 16, 24, 0.75)',
          padding: '20px 24px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          marginBottom: '20px'
        }}>
          "Cipher Clash is a cybersecurity competition that challenges participants in encryption, decryption, and logical problem-solving through engaging cryptography-based tasks involving coded messages and hidden information. Across multiple rounds of increasing difficulty, participants will decode messages, identify cipher techniques, and apply the correct methods to retrieve original data. The event is designed to be competitive, beginner-friendly, and focused on building analytical thinking and problem-solving skills."
        </blockquote>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '16px'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            padding: '16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-forest)', fontWeight: 700, marginBottom: '6px' }}>
              <Zap size={18} /> 1 Question at a Time
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              Participants face 1 encrypted transmission at a time. The correct flag unlocks the subsequent security layer.
            </p>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            padding: '16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-amber)', fontWeight: 700, marginBottom: '6px' }}>
              <Key size={18} /> Dynamic Clues
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              Some rounds feature cryptanalysis hints and algorithm clues, while others test pure decryption instincts.
            </p>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            padding: '16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 700, marginBottom: '6px' }}>
              <Trophy size={18} color="var(--accent-amber)" /> Live Scoreboard
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              Points and completion times are synced to Supabase with real-time updates projected on screen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

