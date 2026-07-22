/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense } from 'react';
import { GameScreen, Character, UserProfile, Quest } from './types';
import { fetchCharactersFromServer } from './lib/characterStorage';
import { motion, AnimatePresence } from 'motion/react';
import { Swords, Flag } from 'lucide-react';

import MainMenu from './components/MainMenu';
import CharacterSelect from './components/CharacterSelect';
import BattleBoard from './components/BattleBoard';
import AdminDashboard from './components/AdminDashboard';
import AuthScreen from './components/AuthScreen';
import QuestBoard from './components/QuestBoard';

function ScreenLoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 select-none gpu-accelerated">
      <div className="relative flex items-center justify-center mb-6">
        <div className="w-20 h-20 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin" />
        <div className="absolute inset-0 w-20 h-20 rounded-full border-4 border-amber-400/10 border-b-amber-400 animate-[spin_1.5s_linear_infinite_reverse]" />
        <Swords className="w-8 h-8 text-orange-400 absolute animate-pulse" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-orange-400 animate-pulse">
          Concentrando Chakra...
        </h3>
        <p className="text-xs text-slate-400 font-sans">Carregando modulo do jogo...</p>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<GameScreen>('main-menu');
  const [playerTeam, setPlayerTeam] = useState<Character[]>([]);
  const [enemyTeam, setEnemyTeam] = useState<Character[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isSandbox, setIsSandbox] = useState(false);
  const [onlineParams, setOnlineParams] = useState<{
    isOnline: boolean;
    roomId: string;
    playerIndex: number;
    opponentProfile: UserProfile;
  } | null>(null);
  
  const [reconnectData, setReconnectData] = useState<any | null>(null);
  const [restoredState, setRestoredState] = useState<any | null>(null);
  
  // Active Quest State
  const [activeQuest, setActiveQuest] = useState<Quest | null>(null);
  
  // User Profile state
  const [user, setUser] = useState<UserProfile | null>(() => {
    const stored = localStorage.getItem('naruto_user_profile');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  // Sync characters from database server on startup
  useEffect(() => {
    fetchCharactersFromServer().catch(err => {
      console.error('Failed initial character sync:', err);
    });
  }, []);

  // Check for active match/reconnection on load
  useEffect(() => {
    if (!user) return;

    const saved = localStorage.getItem('active_match_save');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.playerCombatants && parsed.playerCombatants.length > 0) {
          if (parsed.onlineParams?.isOnline) {
            fetch(`/api/matchmaking/status?username=${encodeURIComponent(user.username)}`)
              .then(r => r.json())
              .then(data => {
                if (data.status === 'matched' && data.roomId === parsed.onlineParams.roomId) {
                  setReconnectData(parsed);
                } else {
                  // Server match is no longer active
                  localStorage.removeItem('active_match_save');
                }
              })
              .catch(() => {
                // Network error, allow to try resuming anyway
                setReconnectData(parsed);
              });
          } else {
            // Offline/Sandbox match, can always resume!
            setReconnectData(parsed);
          }
        }
      } catch (e) {
        console.error("Error reading reconnect data:", e);
      }
    }
  }, [user]);

  const handleRestoreGame = (savedState: any) => {
    playClickSound();
    const playerSquad = savedState.playerCombatants.map((c: any) => c.character);
    const enemySquad = savedState.enemyCombatants.map((c: any) => c.character);
    setPlayerTeam(playerSquad);
    setEnemyTeam(enemySquad);
    setOnlineParams(savedState.onlineParams || null);
    setIsSandbox(!!savedState.isSandbox);
    setRestoredState(savedState);
    setScreen('battle');
    setReconnectData(null);
  };

  const handleDeclineReconnect = async () => {
    playClickSound();
    if (reconnectData && reconnectData.onlineParams?.isOnline) {
      try {
        await fetch('/api/match/surrender', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: reconnectData.onlineParams.roomId,
            username: user.username
          })
        });
      } catch (err) {
        console.error('Error surrendering on decline reconnect:', err);
      }
    }
    localStorage.removeItem('active_match_save');
    setReconnectData(null);
  };

  // Global sound effect triggers
  const playSound = (soundName: string) => {
    if (isMuted) return;
    try {
      const audio = new Audio(`/static/audio/${soundName}.ogg`);
      audio.volume = 0.45;
      audio.play().catch(e => {
        console.log('Audio autoplay prevented:', e);
      });
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  };

  const playClickSound = () => playSound('Click');
  const playScrollSound = () => playSound('Scroll');
  const playWinSound = () => playSound('Win');
  const playLoseSound = () => playSound('Lose');

  const handleStartGame = () => {
    setScreen('quests');
  };

  const handleSelectQuest = (quest: Quest) => {
    setActiveQuest(quest);
    setScreen('character-select');
  };

  const handleConfirmTeams = (
    playerSquad: Character[],
    enemySquad: Character[],
    online?: { isOnline: boolean; roomId: string; playerIndex: number; opponentProfile: UserProfile },
    sandbox?: boolean
  ) => {
    setPlayerTeam(playerSquad);
    setEnemyTeam(enemySquad);
    setOnlineParams(online || null);
    setIsSandbox(!!sandbox);
    setScreen('battle');
  };

  const handleBattleEnd = async (victory: boolean, stats: any) => {
    if (!activeQuest || !user) return;

    // Update goals based on battle stats
    const updatedGoals = activeQuest.goals.map(goal => {
      let valueToAdd = 0;
      let newStreak = goal.currentStreak || 0;
      let currentVal = goal.singleMatch ? 0 : goal.currentValue;

      switch (goal.type) {
        case 'win_battles_with_chars':
          if (victory) {
            const hasRequiredChars = goal.targetCharacters?.every(name => 
              stats.playerCharactersUsed.includes(name)
            );
            if (hasRequiredChars) {
              valueToAdd = 1;
            }
          }
          break;

        case 'win_consecutive_battles_with_chars':
          const hasStreakChars = goal.targetCharacters?.every(name => 
            stats.playerCharactersUsed.includes(name)
          );
          if (hasStreakChars) {
            if (victory) {
              newStreak += 1;
              valueToAdd = 1;
            } else {
              newStreak = 0;
              currentVal = 0;
            }
          }
          break;

        case 'use_skill':
          if (goal.targetSkill && stats.skillsUsed[goal.targetSkill]) {
            valueToAdd = stats.skillsUsed[goal.targetSkill];
          }
          break;

        case 'heal':
          valueToAdd = stats.healingDone;
          break;

        case 'kill_with_skill':
          if (goal.targetSkill && stats.killsWithSkill[goal.targetSkill]) {
            valueToAdd = stats.killsWithSkill[goal.targetSkill];
          }
          break;

        case 'shield':
          valueToAdd = stats.shieldGenerated;
          break;

        case 'damage_received':
          valueToAdd = stats.damageReceived;
          break;

        case 'damage_dealt':
          valueToAdd = stats.damageDealt;
          break;

        case 'stun_enemy':
          valueToAdd = stats.stunsApplied;
          break;
      }

      const nextVal = Math.min(goal.targetValue, currentVal + valueToAdd);

      return {
        ...goal,
        currentValue: nextVal,
        currentStreak: newStreak
      };
    });

    const isNowFinished = updatedGoals.every(g => g.currentValue >= g.targetValue);

    const updatedQuest: Quest = {
      ...activeQuest,
      goals: updatedGoals,
      completed: isNowFinished ? true : activeQuest.completed
    };

    setActiveQuest(updatedQuest);

    try {
      const res = await fetch('/api/quests');
      const data = await res.json();
      if (data.success) {
        const updatedQuestsList = data.quests.map((q: any) => 
          q.id === updatedQuest.id ? updatedQuest : q
        );
        await fetch('/api/quests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quests: updatedQuestsList })
        });
      }
    } catch (err) {
      console.error('Failed to sync updated quest on battle end:', err);
    }
  };

  const handleQuit = () => {
    setPlayerTeam([]);
    setEnemyTeam([]);
    setOnlineParams(null);
    setIsSandbox(false);
    setRestoredState(null);
    setActiveQuest(null); // Reset active quest on exit
    setScreen('quests'); // Return to the Quests select board!
  };

  const handleLoginSuccess = (profile: UserProfile) => {
    setUser(profile);
    localStorage.setItem('naruto_user_profile', JSON.stringify(profile));
  };

  const handleLogout = () => {
    playClickSound();
    setUser(null);
    localStorage.removeItem('naruto_user_profile');
    setScreen('main-menu');
  };

  // If not logged in, show Auth Screen
  if (!user) {
    return (
      <Suspense fallback={<ScreenLoadingFallback />}>
        <AuthScreen
          onLoginSuccess={handleLoginSuccess}
          playClickSound={playClickSound}
        />
      </Suspense>
    );
  }

  return (
    <div className={`relative z-10 min-h-screen text-slate-100 flex flex-col justify-between selection:bg-orange-600 selection:text-white ${screen === 'battle' ? '' : 'bg-slate-950'}`}>
      {/* RECONNECTION / RECOVERY MODAL */}
      <AnimatePresence>
        {reconnectData && (
          <div className="fixed inset-0 bg-slate-950/85 z-50 flex items-center justify-center backdrop-blur-sm p-4 select-none">
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative rounded-3xl overflow-hidden shadow-2xl max-w-md w-full min-h-[260px] flex flex-col justify-between p-8 sm:p-10"
            >
              {/* Background Pergaminho Image */}
              <img
                src="/static/img/ui/pergaminho.webp"
                alt="Pergaminho Shinobi"
                className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none filter drop-shadow-xl"
              />

              <div className="relative z-10 flex flex-col items-center justify-between text-center space-y-6 h-full">
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-center gap-2">
                    <Swords className="w-6 h-6 text-orange-800 animate-pulse" />
                    <h2 className="text-xl font-black uppercase tracking-tight text-stone-950 font-sans">
                      Combate Ativo Encontrado!
                    </h2>
                  </div>
                  <p className="text-xs sm:text-sm text-stone-800 font-bold leading-relaxed max-w-xs mx-auto">
                    Você possui uma batalha em andamento na Arena. Deseja retornar ao confronto ou declarar rendição?
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-1">
                  <button
                    onClick={() => handleRestoreGame(reconnectData)}
                    className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-orange-800 to-amber-800 hover:from-orange-700 hover:to-amber-700 text-amber-100 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-orange-950/40 border border-orange-600/50 transition cursor-pointer active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Swords className="w-4 h-4" />
                    <span>Voltar à Batalha</span>
                  </button>

                  <button
                    onClick={handleDeclineReconnect}
                    className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-800 to-rose-900 hover:from-red-700 hover:to-rose-800 text-amber-100 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-red-950/40 border border-red-600/50 transition cursor-pointer active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Flag className="w-4 h-4" />
                    <span>Render-se</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Suspense fallback={<ScreenLoadingFallback />}>
        {screen === 'main-menu' && (
          <MainMenu
            onStartGame={handleStartGame}
            isMuted={isMuted}
            onToggleMute={() => setIsMuted(!isMuted)}
            playClickSound={playClickSound}
            onOpenAdmin={() => setScreen('admin')}
            user={user}
            onLogout={handleLogout}
            onUpdateUser={(updated) => {
              setUser(updated);
              localStorage.setItem('naruto_user_profile', JSON.stringify(updated));
            }}
          />
        )}

        {screen === 'quests' && user && (
          <QuestBoard
            user={user}
            onUpdateUser={(updated) => {
              setUser(updated);
              localStorage.setItem('naruto_user_profile', JSON.stringify(updated));
            }}
            onSelectQuest={handleSelectQuest}
            onGoToBattle={() => setScreen('character-select')}
            onBack={() => setScreen('main-menu')}
            playClickSound={playClickSound}
            playWinSound={playWinSound}
          />
        )}

        {screen === 'character-select' && (
          <CharacterSelect
            onConfirmTeams={handleConfirmTeams}
            playClickSound={playClickSound}
            playScrollSound={playScrollSound}
            user={user}
            activeQuest={activeQuest}
            onBack={() => setScreen('quests')}
          />
        )}

        {screen === 'battle' && (
          <BattleBoard
            playerTeam={playerTeam}
            enemyTeam={enemyTeam}
            isMuted={isMuted}
            onToggleMute={() => setIsMuted(!isMuted)}
            onQuit={handleQuit}
            playClickSound={playClickSound}
            playScrollSound={playScrollSound}
            playWinSound={playWinSound}
            playLoseSound={playLoseSound}
            user={user}
            onlineParams={onlineParams}
            isSandbox={isSandbox}
            restoredState={restoredState}
            onBattleEnd={handleBattleEnd}
          />
        )}

        {screen === 'admin' && (
          <AdminDashboard
            onBack={() => setScreen('main-menu')}
            playClickSound={playClickSound}
          />
        )}
      </Suspense>
    </div>
  );
}

