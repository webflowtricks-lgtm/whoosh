/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense } from 'react';
import { GameScreen, Character, UserProfile, Quest } from './types';
import { evaluateQuestGoal } from './lib/questUtils';
import { safeFetchJson } from './lib/api';
import { fetchCharactersFromServer } from './lib/characterStorage';
import { fetchRanksFromServer } from './lib/rankStorage';
import { fetchShopItemsFromServer } from './lib/shopStorage';
import { fetchEventsFromServer } from './lib/eventStorage';
import { fetchCustomBannersFromServer } from './lib/bannerStorage';
import { fetchPngFramesFromServer } from './lib/frameStorage';
import { calculateBattleXp } from './lib/xpSystem';
import { getRanks, getUserRankFromConfig } from './lib/rankStorage';
import { preloadCommonUI, preloadCharacters } from './lib/imagePreloader';
import { motion, AnimatePresence } from 'motion/react';
import { Swords, Flag } from 'lucide-react';

import MainMenu from './components/MainMenu';
import CharacterSelect from './components/CharacterSelect';
import BattleBoard from './components/BattleBoard';
import ArenaLoading from './components/ArenaLoading';
import AdminDashboard from './components/AdminDashboard';
import AuthScreen from './components/AuthScreen';
import QuestBoard from './components/QuestBoard';
import RotateOverlay from './components/RotateOverlay';

function ScreenLoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 select-none gpu-accelerated">
      <div className="relative flex items-center justify-center mb-6">
        <img src="/static/img/icon/star.svg" alt="Loading" className="w-16 h-16 animate-spin object-contain" />
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
  const [reconnectChecking, setReconnectChecking] = useState(false);
  const [reconnectRoomLost, setReconnectRoomLost] = useState(false);
  
  // Active Quest State
  const [activeQuest, setActiveQuest] = useState<Quest | null>(null);

  // Login on demand (only when entering the arena) + arena loading screen
  const [showAuth, setShowAuth] = useState(false);
  const [showArenaLoading, setShowArenaLoading] = useState(false);
  
  // User Profile state
  const [user, setUser] = useState<UserProfile | null>(() => {
    const stored = localStorage.getItem('naruto_user_profile');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed) {
          if (typeof parsed.xp === 'number' && parsed.xp < 0) {
            parsed.xp = 0;
            try {
              localStorage.setItem('naruto_user_profile', JSON.stringify(parsed));
            } catch {}
          }
          return parsed;
        }
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  // Sync all configurations (characters, ranks, shop, events, banners, frames) from server on startup
  useEffect(() => {
    preloadCommonUI();
    fetchCharactersFromServer().catch(() => {});
    fetchRanksFromServer().catch(() => {});
    fetchShopItemsFromServer().catch(() => {});
    fetchEventsFromServer().catch(() => {});
    fetchCustomBannersFromServer().catch(() => {});
    fetchPngFramesFromServer().catch(() => {});
  }, []);

  // Check for active match/reconnection on load
  useEffect(() => {
    if (!user) return;

    const saved = localStorage.getItem('active_match_save');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.playerCombatants && parsed.playerCombatants.length > 0) {
          // Show the modal IMMEDIATELY; for online matches verify the room in background.
          setReconnectData(parsed);
          setReconnectRoomLost(false);
          if (parsed.onlineParams?.isOnline) {
            setReconnectChecking(true);
            fetch(`/api/matchmaking/status?username=${encodeURIComponent(user.username)}`)
              .then(r => r.json())
              .then(data => {
                setReconnectChecking(false);
                if (data.status === 'matched' && data.roomId === parsed.onlineParams.roomId) {
                  setReconnectRoomLost(false);
                } else {
                  // Server match is no longer active
                  setReconnectRoomLost(true);
                }
              })
              .catch(() => {
                // Network error, allow to try resuming anyway
                setReconnectChecking(false);
                setReconnectRoomLost(false);
              });
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
    preloadCharacters([...playerSquad, ...enemySquad]);
    setPlayerTeam(playerSquad);
    setEnemyTeam(enemySquad);
    setOnlineParams(savedState.onlineParams || null);
    setIsSandbox(!!savedState.isSandbox);
    setRestoredState(savedState);
    setScreen('battle');
    setReconnectData(null);
    setReconnectChecking(false);
    setReconnectRoomLost(false);
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
    try {
      localStorage.removeItem('active_match_save');
    } catch {}
    setReconnectData(null);
    setReconnectChecking(false);
    setReconnectRoomLost(false);
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
    if (!user) {
      setShowAuth(true);
      return;
    }
    setShowArenaLoading(true);
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
    preloadCharacters([...playerSquad, ...enemySquad]);
    setPlayerTeam(playerSquad);
    setEnemyTeam(enemySquad);
    setOnlineParams(online || null);
    setIsSandbox(!!sandbox);
    setScreen('battle');
  };

  const handleBattleEnd = async (victory: boolean, stats: any, earnedXp?: number) => {
    if (!user) return;

    // Calculate XP gained
    const turns = stats?.turn || 1;
    const aliveCount = stats?.alivePlayerCount || (victory ? 1 : 0);
    const damageDealt = stats?.damageDealt || 0;
    const xpGained = earnedXp ?? calculateBattleXp(victory, turns, aliveCount, damageDealt);

    const oldXp = Math.max(0, user.xp || 0);
    const newXp = Math.max(0, oldXp + xpGained);
    const ranksList = getRanks();
    const newRank = getUserRankFromConfig(newXp, ranksList);

    const updatedUser: UserProfile = {
      ...user,
      xp: newXp,
      rank: newRank,
      wins: victory ? (user.wins || 0) + 1 : (user.wins || 0),
      losses: !victory ? (user.losses || 0) + 1 : (user.losses || 0),
    };

    setUser(updatedUser);
    localStorage.setItem('naruto_user_profile', JSON.stringify(updatedUser));

    // Sync profile updates to server
    try {
      await safeFetchJson('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUser)
      });
    } catch (err) {
      console.error('Failed to sync profile update:', err);
    }

    // Process quests if active
    if (activeQuest) {
      const updatedGoals = activeQuest.goals.map((goal) => {
        const { nextValue, nextStreak } = evaluateQuestGoal(goal, victory, stats);
        return {
          ...goal,
          currentValue: nextValue,
          currentStreak: nextStreak
        };
      });

      const isNowFinished = updatedGoals.every((g) => g.currentValue >= g.targetValue);

      const updatedQuest: Quest = {
        ...activeQuest,
        goals: updatedGoals,
        completed: isNowFinished ? true : activeQuest.completed
      };

      setActiveQuest(updatedQuest);

      try {
        const data = await safeFetchJson<{ success?: boolean; quests?: Quest[] }>('/api/quests');
        if (data && data.success && Array.isArray(data.quests)) {
          const updatedQuestsList = data.quests.map((q: any) =>
            q.id === updatedQuest.id ? updatedQuest : q
          );
          await safeFetchJson('/api/quests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quests: updatedQuestsList })
          });
        }
      } catch (err) {
        console.error('Failed to sync updated quest on battle end:', err);
      }
    }
  };

  const handleQuit = () => {
    setPlayerTeam([]);
    setEnemyTeam([]);
    setOnlineParams(null);
    setIsSandbox(false);
    setRestoredState(null);
    setActiveQuest(null); // Reset active quest on exit
    setScreen('character-select'); // Return directly to character selection!
  };

  const handleLoginSuccess = (profile: UserProfile) => {
    const safeProfile = {
      ...profile,
      xp: Math.max(0, profile.xp ?? 0),
    };
    setUser(safeProfile);
    try {
      localStorage.setItem('naruto_user_profile', JSON.stringify(safeProfile));
    } catch {}
    setShowAuth(false);
    setShowArenaLoading(true);
  };

  const handleLogout = () => {
    playClickSound();
    setUser(null);
    try {
      localStorage.removeItem('naruto_user_profile');
    } catch {}
    setScreen('main-menu');
  };

  // If not logged in, only ask for login when the user wants to enter the arena
  if (!user && showAuth) {
    return (
      <Suspense fallback={<ScreenLoadingFallback />}>
        <AuthScreen
          onLoginSuccess={handleLoginSuccess}
          playClickSound={playClickSound}
          onBack={() => setShowAuth(false)}
        />
      </Suspense>
    );
  }

  return (
    <div className={`relative z-10 min-h-screen text-slate-100 flex flex-col justify-between selection:bg-orange-600 selection:text-white ${screen === 'battle' ? '' : 'bg-slate-950'}`}>
      <RotateOverlay />
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
                      {reconnectChecking ? 'Verificando Sala...' : reconnectRoomLost ? 'Sala Perdida' : 'Combate Ativo Encontrado!'}
                    </h2>
                  </div>
                  {reconnectChecking ? (
                    <p className="text-xs sm:text-sm text-stone-800 font-bold leading-relaxed max-w-xs mx-auto">
                      Sua batalha em andamento foi encontrada. Verificando a sala no servidor...
                    </p>
                  ) : reconnectRoomLost ? (
                    <p className="text-xs sm:text-sm text-stone-800 font-bold leading-relaxed max-w-xs mx-auto">
                      A sala desta batalha não existe mais no servidor, então o combate será encerrado.
                    </p>
                  ) : (
                    <p className="text-xs sm:text-sm text-stone-800 font-bold leading-relaxed max-w-xs mx-auto">
                      Você possui uma batalha em andamento na Arena. Deseja retornar ao confronto ou declarar rendição?
                    </p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-1">
                  {reconnectChecking ? (
                    <div className="flex items-center justify-center gap-3 py-1 w-full">
                      <img src="/static/img/icon/star.svg" alt="Verificando" className="w-8 h-8 animate-spin object-contain" />
                      <span className="text-xs text-stone-700 font-mono font-bold uppercase tracking-wider">Aguarde...</span>
                    </div>
                  ) : reconnectRoomLost ? (
                    <button
                      onClick={handleDeclineReconnect}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-600 hover:to-slate-800 text-amber-100 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-slate-950/40 border border-slate-600/50 transition cursor-pointer active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Flag className="w-4 h-4" />
                      <span>Encerrar Batalha</span>
                    </button>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Suspense fallback={<ScreenLoadingFallback />}>
        {/* ARENA LOADING OVERLAY (preloads everything on Enter the Arena) */}
        <AnimatePresence>
          {showArenaLoading && (
            <ArenaLoading
              onComplete={() => {
                setShowArenaLoading(false);
                setScreen('quests');
              }}
            />
          )}
        </AnimatePresence>

        {screen === 'main-menu' && (
          <MainMenu
            onStartGame={handleStartGame}
            isMuted={isMuted}
            onToggleMute={() => setIsMuted(!isMuted)}
            playClickSound={playClickSound}
            playScrollSound={playScrollSound}
            onOpenAdmin={() => setScreen('admin')}
            user={user}
            onLogout={handleLogout}
            onUpdateUser={(updated) => {
              const safe = { ...updated, xp: Math.max(0, updated.xp ?? 0) };
              setUser(safe);
              localStorage.setItem('naruto_user_profile', JSON.stringify(safe));
            }}
          />
        )}

        {screen === 'quests' && user && (
          <QuestBoard
            user={user}
            onUpdateUser={(updated) => {
              const safe = { ...updated, xp: Math.max(0, updated.xp ?? 0) };
              setUser(safe);
              localStorage.setItem('naruto_user_profile', JSON.stringify(safe));
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
            activeQuest={activeQuest}
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

 