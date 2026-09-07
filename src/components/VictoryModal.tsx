import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import type { Participant } from '../types';
import { soundManager } from '../services/audio';
import { Trophy, CheckCircle, Clock, Zap, ArrowRight, ShieldCheck } from 'lucide-react';

interface VictoryModalProps {
  isOpen: boolean;
  participant: Participant;
  onClose: () => void;
  onViewLeaderboard: () => void;
  totalRounds?: number;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  isOpen,
  participant,
  onClose,
  onViewLeaderboard,
  totalRounds = 3,
}) => {
  useEffect(() => {
    if (isOpen) {
      soundManager.playVictory();
      // Launch celebratory cyber confetti
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#06b6d4', '#f59e0b', '#f8fafc'],
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const timeElapsed = participant.completed_at
    ? Math.max(0, Math.floor((new Date(participant.completed_at).getTime() - new Date(participant.started_at).getTime()) / 1000))
    : 0;

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}m ${s < 10 ? '0' : ''}${s}s`;
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(5, 8, 14, 0.92)',
      backdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '20px'
    }}>
      <div className="glass-card glow-border-amber" style={{
        maxWidth: '520px',
        width: '100%',
        padding: '36px',
        textAlign: 'center',
        background: 'rgba(15, 22, 32, 0.98)',
        position: 'relative',
        border: '1px solid rgba(245, 158, 11, 0.4)'
      }}>
        {/* Glow Medallion */}
        <div style={{
          width: '74px',
          height: '74px',
          borderRadius: '50%',
          background: 'rgba(245, 158, 11, 0.12)',
          border: '2px solid var(--accent-amber)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 18px',
          color: 'var(--accent-amber)',
          boxShadow: '0 0 24px rgba(245, 158, 11, 0.3)'
        }}>
          <Trophy size={36} />
        </div>

        <div className="cyber-badge cyber-badge-amber" style={{ marginBottom: '12px' }}>
          Asthra 11.0 • Cipher Master
        </div>

        <h2 style={{ fontSize: '1.9rem', color: '#ffffff', marginBottom: '8px' }}>
          CYBER WALL BREACHED!
        </h2>

        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>
          Team <strong style={{ color: 'var(--accent-amber)' }}>{participant.team_name || participant.username}</strong> successfully decoded all {totalRounds} cryptography defense layer{totalRounds === 1 ? '' : 's'}.
        </p>

        {/* Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          marginBottom: '28px'
        }}>
          <div style={{
            background: 'var(--accent-amber-subtle)',
            border: '1px solid var(--accent-amber-border)',
            padding: '12px 8px',
            borderRadius: 'var(--radius-sm)'
          }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '4px' }}>
              <Zap size={14} /> SCORE
            </div>
            <div style={{ color: 'var(--accent-amber)', fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
              {participant.score}
            </div>
          </div>

          <div style={{
            background: 'var(--status-forest-subtle)',
            border: '1px solid var(--status-forest-border)',
            padding: '12px 8px',
            borderRadius: 'var(--radius-sm)'
          }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '4px' }}>
              <CheckCircle size={14} /> SOLVED
            </div>
            <div style={{ color: 'var(--status-forest)', fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
              {totalRounds} / {totalRounds}
            </div>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '12px 8px',
            borderRadius: 'var(--radius-sm)'
          }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '4px' }}>
              <Clock size={14} /> TIME
            </div>
            <div style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
              {formatTime(timeElapsed)}
            </div>
          </div>
        </div>

        {/* Security Certificate / Verification Alert */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px dashed rgba(255, 255, 255, 0.15)',
          padding: '12px 16px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.82rem',
          color: 'var(--text-secondary)',
          textAlign: 'left',
          marginBottom: '24px'
        }}>
          <ShieldCheck size={20} color="var(--neon-green)" style={{ flexShrink: 0 }} />
          <span>Your completion timestamp has been recorded in the database. Rank is determined by highest score and fastest decryption time.</span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={() => {
              onClose();
              onViewLeaderboard();
            }}
            className="cyber-btn cyber-btn-primary"
            style={{ flex: 1, padding: '12px' }}
          >
            <Trophy size={18} />
            View Live Leaderboard
            <ArrowRight size={16} />
          </button>

          <button
            onClick={onClose}
            className="cyber-btn cyber-btn-ghost"
            style={{ padding: '12px 18px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
