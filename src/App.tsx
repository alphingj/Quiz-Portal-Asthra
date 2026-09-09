import { useState, useEffect } from 'react';
import type { Participant } from './types';
import { soundManager } from './services/audio';
import { clearParticipantToken, store } from './services/store';
import { Navbar } from './components/Navbar';
import { HeroRules } from './components/HeroRules';
import { QuizTerminal } from './components/QuizTerminal';
import { LiveLeaderboard } from './components/LiveLeaderboard';
import { AdminPanel } from './components/AdminPanel';
import { LoginModal } from './components/LoginModal';
import { ShieldCheck } from 'lucide-react';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<'rules' | 'quiz' | 'leaderboard' | 'admin'>('rules');
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(soundManager.isMuted());
  const [activeQuestionCount, setActiveQuestionCount] = useState(3);

  // Check URL pathname or hash for hidden admin route (/challenge/admin) to avoid directory scanners
  useEffect(() => {
    const checkAdminRoute = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path.startsWith('/challenge/admin') || hash.startsWith('#/challenge/admin')) {
        setCurrentTab('admin');
      }
    };

    checkAdminRoute();
    window.addEventListener('popstate', checkAdminRoute);
    window.addEventListener('hashchange', checkAdminRoute);

    return () => {
      window.removeEventListener('popstate', checkAdminRoute);
      window.removeEventListener('hashchange', checkAdminRoute);
    };
  }, []);

  // Load participant session from localStorage and re-verify against DB (#27)
  useEffect(() => {
    const saved = localStorage.getItem('asthra_active_participant');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setParticipant(parsed);
        // Re-fetch from DB to detect bans/resets/deletions (#27)
        store.refreshParticipant(parsed.id).then(fresh => {
          if (!fresh) {
            // Participant was deleted from DB — clear session
            setParticipant(null);
            localStorage.removeItem('asthra_active_participant');
          } else if (fresh.is_banned) {
            // Participant was banned — clear session
            setParticipant(null);
            localStorage.removeItem('asthra_active_participant');
          } else {
            // Update with fresh data from DB
            setParticipant(fresh);
            localStorage.setItem('asthra_active_participant', JSON.stringify(fresh));
          }
        }).catch(() => {
          // DB unreachable — keep local session as fallback
        });
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Load competition settings for Navbar active count (#24)
  useEffect(() => {
    store.getCompetitionSettings().then(s => {
      setActiveQuestionCount(s.active_question_count);
    }).catch(() => {});

    const handleUpdate = () => {
      store.getCompetitionSettings().then(s => {
        setActiveQuestionCount(s.active_question_count);
      }).catch(() => {});
    };
    window.addEventListener('asthra_data_update', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('asthra_data_update', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const [isProjectorMode, setIsProjectorMode] = useState(false);

  // Automatically reset projector mode if tab changes
  const handleTabChange = (tab: 'rules' | 'quiz' | 'leaderboard' | 'admin') => {
    if (tab !== 'leaderboard') {
      setIsProjectorMode(false);
    }
    setCurrentTab(tab);
  };

  const handleLoginSuccess = (p: Participant) => {
    setParticipant(p);
    localStorage.setItem('asthra_active_participant', JSON.stringify(p));
    // Transition to quiz terminal
    handleTabChange('quiz');
  };

  const handleLogout = () => {
    soundManager.playKeypress();
    setParticipant(null);
    localStorage.removeItem('asthra_active_participant');
    clearParticipantToken();
    handleTabChange('rules');
  };

  const handleParticipantUpdated = (updated: Participant) => {
    setParticipant(updated);
    localStorage.setItem('asthra_active_participant', JSON.stringify(updated));
  };

  const handleToggleMute = () => {
    const muted = soundManager.toggleMute();
    setIsMuted(muted);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar - Hidden when Stage Projector Telemetry mode is engaged */}
      {!isProjectorMode && (
        <Navbar
          currentTab={currentTab}
          setCurrentTab={handleTabChange}
          participant={participant}
          onLogout={handleLogout}
          onOpenLogin={() => setIsLoginModalOpen(true)}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          activeQuestionCount={activeQuestionCount}
        />
      )}

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: 0, margin: 0 }}>
        {currentTab === 'rules' && (
          <HeroRules
            onStartQuiz={() => {
              if (participant) {
                handleTabChange('quiz');
              } else {
                setIsLoginModalOpen(true);
              }
            }}
            onViewLeaderboard={() => handleTabChange('leaderboard')}
            isLoggedIn={!!participant}
          />
        )}

        {currentTab === 'quiz' && (
          <QuizTerminal
            participant={participant}
            onOpenLogin={() => setIsLoginModalOpen(true)}
            onViewLeaderboard={() => handleTabChange('leaderboard')}
            onParticipantUpdated={handleParticipantUpdated}
          />
        )}

        {currentTab === 'leaderboard' && (
          <LiveLeaderboard
            currentParticipantId={participant?.id}
            isProjectorMode={isProjectorMode}
            onToggleProjectorMode={setIsProjectorMode}
          />
        )}

        {currentTab === 'admin' && (
          <AdminPanel />
        )}
      </main>

      {/* Participant Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Footer - Hidden when Stage Projector Telemetry mode is engaged */}
      {!isProjectorMode && (
        <footer style={{
          background: 'rgba(4, 7, 14, 0.95)',
          borderTop: '1px solid rgba(0, 240, 255, 0.15)',
          padding: '30px 24px',
          marginTop: 'auto'
        }}>
          <div style={{
            maxWidth: '1280px',
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px'
        }}>
          {/* Left Footer Details */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <img 
              src="/assets/sjcet_logo.png" 
              alt="SJCET Palai" 
              style={{
                height: '32px',
                objectFit: 'contain',
                background: 'rgba(255, 255, 255, 0.9)',
                padding: '3px 8px',
                borderRadius: '4px'
              }}
            />
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <div><strong>St. Joseph's College of Engineering and Technology, Palai</strong> (Autonomous)</div>
              <div>Asthra 11.0 National Level Tech Fest • KeyBreak Cipher Clash</div>
            </div>
          </div>

          {/* Center / Right Footer */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            fontSize: '0.78rem',
            color: 'var(--text-muted)'
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={14} color="var(--neon-green)" />
              Cybersecurity Competition Engine • Asthra 11.0
            </span>
          </div>
        </div>
      </footer>
      )}
    </div>
  );
};

export default App;
