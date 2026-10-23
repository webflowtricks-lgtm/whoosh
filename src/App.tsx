/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { GameScreen, Character, UserProfile, Quest } from './types';
import { safeFetchJson } from './lib/api';
import { matchFetch } from './lib/matchFetch';
import { fetchCharactersFromServer } from './lib/characterStorage';
import { fetchRanksFromServer } from './lib/rankStorage';
import { fetchShopItemsFromServer } from './lib/shopStorage';
import { fetchEventsFromServer } from './lib/eventStorage';
import { fetchCustomBannersFromServer } from './lib/bannerStorage';
import { fetchPngFramesFromServer } from './lib/frameStorage';
import { calculateBattleXp } from './lib/xpSystem';
import type { QuestBattleStats } from './lib/questProgress';
import { getRanks, getUserRankFromConfig } from './lib/rankStorage';
import { preloadCommonUI, preloadCharacters } from './lib/imagePreloader';
import { isVillageId } from './lib/villages';
import { playGlobalSound, bindGlobalClickSound, bindGlobalModalSound, preloadGlobalSounds, setEffectsVolumeMultiplier } from './lib/soundUtils';
import { motion, AnimatePresence } from 'motion/react';
import { Swords, Flag, Smartphone, ShieldAlert, LogOut } from 'lucide-react';

import MainMenu from './components/MainMenu';
import LobbyScreen from './components/LobbyScreen';
import CharacterSelect from './components/CharacterSelect';
import BattleBoard from './components/BattleBoard';
import ArenaLoading from './components/ArenaLoading';
import AdminDashboard from './components/AdminDashboard';
import AuthScreen from './components/AuthScreen';
import QuestBoard from './components/QuestBoard';
// import RotateOverlay from './components/RotateOverlay'; // DESABILITADO temporariamente — reativar quando necessário

function ScreenLoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 select-none gpu-accelerated">
      <div className="relative flex items-center justify-center mb-6">
        <img
          src="/static/img/icon/mangeky.svg"
          alt="Loading"
          className="w-16 h-16 animate-spin object-contain"
          style={{
            filter: 'hue-rotate(-25deg) saturate(2) brightness(1.1) drop-shadow(0 0 10px rgba(239, 68, 68, 0.8))',
            animationDuration: '900ms',
            animationTimingFunction: 'linear',
          }}
        />
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

function AccountSessionPrompt({
  status,
  error,
  busy,
  onTakeover,
  onCancel,
}: {
  status: 'initializing' | 'pending' | 'requested' | 'error';
  error: string | null;
  busy: boolean;
  onTakeover: () => void;
  onCancel: () => void;
}) {
  const isRequester = status === 'pending';
  const isWaiting = status === 'initializing';
  const hasError = status === 'error';

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-orange-500/40 bg-slate-900 p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/15 text-orange-400">
          {isRequester ? <Smartphone className="h-7 w-7" /> : <ShieldAlert className="h-7 w-7" />}
        </div>
        <h2 className="text-xl font-black uppercase tracking-wide text-amber-300">
          {isWaiting ? 'Verificando sessão' : hasError ? 'Não foi possível verificar a sessão' : 'Conta conectada em outro aparelho'}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          {isWaiting
            ? 'Estamos confirmando sua sessão com o servidor. Aguarde um instante.'
            : hasError
              ? 'A conexão com o servidor falhou. Tente verificar sua sessão novamente.'
              : isRequester
              ? 'Esta conta já está aberta em outro aparelho. Deseja desconectá-lo para continuar neste?'
              : 'Alguém tentou entrar nesta conta por outro aparelho. Deseja desconectá-lo e continuar aqui?'}
        </p>
        {status === 'error' && error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-rose-300">{error}</p>
        )}
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            disabled={busy || isWaiting}
            onClick={onTakeover}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-red-700 px-4 py-3 text-sm font-black uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {hasError ? 'Tentar novamente' : 'Desconectar outro aparelho e continuar aqui'}
          </button>
          <button
            type="button"
            disabled={busy || isWaiting || hasError}
            onClick={onCancel}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-60"
          >
            {isRequester ? 'Cancelar login' : 'Continuar neste aparelho'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionTakeoverResult({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
      <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-rose-500/50 bg-slate-900 p-7 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/15 text-rose-400">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-black uppercase tracking-wide text-rose-300">Derrota por desconexão</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          Sua conta foi conectada em outro aparelho. Você saiu da partida e ela foi registrada como derrota por abandono.
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 w-full rounded-xl bg-slate-700 px-4 py-3 text-sm font-black uppercase tracking-wide text-white transition hover:bg-slate-600"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<GameScreen>('main-menu');
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const [battleFinished, setBattleFinished] = useState(false);
  const [playerTeam, setPlayerTeam] = useState<Character[]>([]);
  const [enemyTeam, setEnemyTeam] = useState<Character[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [audioSettings, setAudioSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ninja_audio_settings') || '{}');
      return {
        master: typeof saved.master === 'number' ? Math.max(0, Math.min(1, saved.master)) : 1,
        effects: typeof saved.effects === 'number' ? Math.max(0, Math.min(1, saved.effects)) : 1,
        music: typeof saved.music === 'number' ? Math.max(0, Math.min(1, saved.music)) : 0.27,
      };
    } catch {
      return { master: 1, effects: 1, music: 0.27 };
    }
  });
  const characterSelectMusicRef = useRef<HTMLAudioElement | null>(null);
  const battleMusicRef = useRef<HTMLAudioElement | null>(null);
  const resultMusicRef = useRef<HTMLAudioElement | null>(null);
  const resultMusicGainRef = useRef(4);
  const resultMusicGain = 4;
  const [isSandbox, setIsSandbox] = useState(false);
  const [sandboxPauseChakraGen, setSandboxPauseChakraGen] = useState(false);
  const [onlineParams, setOnlineParams] = useState<{
    isOnline: boolean;
    roomId: string;
    playerIndex: number;
    seed: number;
    opponentProfile: UserProfile;
  } | null>(null);
  
  const [reconnectData, setReconnectData] = useState<any | null>(null);
  const [restoredState, setRestoredState] = useState<any | null>(null);
  const [reconnectChecking, setReconnectChecking] = useState(false);
  const [reconnectRoomLost, setReconnectRoomLost] = useState(false);
  const [reconnectSurrender, setReconnectSurrender] = useState<{ surrenderedBy: string; isVictory: boolean; reason: string | null } | null>(null);
  
  // Active Quest State
  const [activeQuest, setActiveQuest] = useState<Quest | null>(null);

  // Login on demand (only when entering the arena) + arena loading screen
  const [showAuth, setShowAuth] = useState(false);
  const [showArenaLoading, setShowArenaLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    try { return sessionStorage.getItem('naruto_account_session_token'); } catch { return null; }
  });
  const [sessionTicket, setSessionTicket] = useState<string | null>(null);
  const sessionClaimPromiseRef = useRef<{
    ticket: string;
    promise: Promise<{
      ok: boolean;
      status: number;
      data: { status?: string; takeoverRequested?: boolean; error?: string };
    }>;
  } | null>(null);
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'initializing' | 'active' | 'pending' | 'requested' | 'revoked' | 'error'>('idle');
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionRevoked, setSessionRevoked] = useState(false);
  const [sessionTakeoverResult, setSessionTakeoverResult] = useState(false);
  const sessionRevocationHandledRef = useRef(false);
  
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

  useEffect(() => {
    if (user && screen === 'main-menu') {
      setScreen('lobby');
    }
  }, [user, screen]);

  // Sync all configurations (characters, ranks, shop, events, banners, frames) from server on startup
  useEffect(() => {
    preloadCommonUI();
    preloadGlobalSounds(['Scroll']);
    fetchCharactersFromServer().catch(() => {});
    fetchRanksFromServer().catch(() => {});
    fetchShopItemsFromServer().catch(() => {});
    fetchEventsFromServer().catch(() => {});
    fetchCustomBannersFromServer().catch(() => {});
    fetchPngFramesFromServer().catch(() => {});
  }, []);

  // Pull the full profile (incl. collectedCardIds/collection) from the server and
  // merge with the local cached profile so collection edits made elsewhere persist.
  useEffect(() => {
    if (!user || !user.username) return;
    let cancelled = false;
    fetch(`/api/user/profile?username=${encodeURIComponent(user.username)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (cancelled || !data?.success || !data.user) return;
        const serverProfile = data.user;
        const localCollected = user.collectedCardIds || [];
        const serverCollected = Array.isArray(serverProfile.collectedCardIds)
          ? serverProfile.collectedCardIds
          : (serverProfile.collectedCardIds ? [serverProfile.collectedCardIds] : []);
        // Union (não destrutiva) entre coleção local e do servidor
        const collectedCounts = new Map<string, { local: number; server: number }>();
        for (const id of localCollected) {
          const counts = collectedCounts.get(id) || { local: 0, server: 0 };
          counts.local += 1;
          collectedCounts.set(id, counts);
        }
        for (const id of serverCollected) {
          const counts = collectedCounts.get(id) || { local: 0, server: 0 };
          counts.server += 1;
          collectedCounts.set(id, counts);
        }
        const merged = Array.from(collectedCounts).flatMap(([id, counts]) =>
          Array.from({ length: Math.max(counts.local, counts.server) }, () => id),
        );
        const mergedUser = {
          ...user,
          ...serverProfile,
          collectedCardIds: merged,
        };
        mergedUser.xp = Math.max(0, serverProfile.xp ?? user.xp ?? 0);
        setUser(mergedUser);
        try { localStorage.setItem('naruto_user_profile', JSON.stringify(mergedUser)); } catch {}
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.username]);

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
          playScrollSound();
          if (parsed.onlineParams?.isOnline) {
            setReconnectChecking(true);
            matchFetch(`/api/matchmaking/status?username=${encodeURIComponent(user.username)}`)
              .then(r => r.json())
              .then(data => {
                if (data.status === 'matched' && data.roomId === parsed.onlineParams.roomId) {
                  setReconnectChecking(false);
                  setReconnectRoomLost(false);
                  setReconnectSurrender(null);
                } else {
                  // Server match idle - verifica se foi rendição antes de declarar sala perdida
                  matchFetch(`/api/match/room-state?roomId=${encodeURIComponent(parsed.onlineParams.roomId)}&username=${encodeURIComponent(user.username)}`)
                    .then(r => r.json())
                    .then(roomData => {
                      setReconnectChecking(false);
                      if (roomData?.success && roomData?.room?.surrenderedBy) {
                        const sb = String(roomData.room.surrenderedBy).toLowerCase();
                        const isVictory = sb !== user.username.toLowerCase();
                        const reason = roomData.room.surrenderReason || 'manual';
                        setReconnectSurrender({ surrenderedBy: String(roomData.room.surrenderedBy), isVictory, reason });
                        setReconnectRoomLost(false);
                      } else {
                        setReconnectSurrender(null);
                        setReconnectRoomLost(true);
                      }
                    })
                    .catch(() => {
                      setReconnectChecking(false);
                      setReconnectSurrender(null);
                      setReconnectRoomLost(true);
                    });
                }
              })
              .catch(() => {
                // Network error, allow to try resuming anyway
                setReconnectChecking(false);
                setReconnectRoomLost(false);
                setReconnectSurrender(null);
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
    setSandboxPauseChakraGen(!!savedState.isSandbox && !!savedState.sandboxPauseChakraGen);
    setBattleFinished(false);
    startBattleMusic();
    setRestoredState(savedState);
    setScreen('battle');
    setReconnectData(null);
    setReconnectChecking(false);
    setReconnectRoomLost(false);
    setReconnectSurrender(null);
  };

  const handleDeclineReconnect = async () => {
    playClickSound();
    if (reconnectData && reconnectData.onlineParams?.isOnline) {
      try {
        await matchFetch('/api/match/surrender', {
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
    setReconnectSurrender(null);
  };

  // Global sound effect triggers (mp3, com throttle anti-duplicação)
  const playSound = (soundName: string, volume = 0.45) => {
    if (isMuted || screen === 'admin') return;
    playGlobalSound(soundName, volume);
  };

  const updateAudioSetting = (key: 'master' | 'effects' | 'music', value: number) => {
    setAudioSettings(prev => {
      const next = { ...prev, [key]: Math.max(0, Math.min(1, value)) };
      try { localStorage.setItem('ninja_audio_settings', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const playClickSound = () => playSound('Click');
  const playScrollSound = () => playSound('Scroll');
  const playUahSound = () => playSound('uah');
  const playTargetSound = () => playSound('Target');
  const playWinSound = () => playResultMusic('Win');
  const playLoseSound = () => playResultMusic('Lose');

  // 🔊 SOM DE CLIQUE GLOBAL: qualquer elemento clicável no jogo inteiro toca Click.mp3
  useEffect(() => {
    bindGlobalClickSound(() => !isMuted && screen !== 'admin');
    bindGlobalModalSound(() => !isMuted && screen !== 'admin');
  }, [isMuted, screen]);

  useEffect(() => {
    if (!isProcessing || screen === 'character-select') {
      document.body.classList.remove('processing-cursor');
      return;
    }
    const handleMouseMove = (event: MouseEvent) => setCursorPosition({ x: event.clientX, y: event.clientY });
    document.addEventListener('mousemove', handleMouseMove);
    document.body.classList.add('processing-cursor');
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.body.classList.remove('processing-cursor');
    };
  }, [isProcessing, screen]);

  useEffect(() => {
    setEffectsVolumeMultiplier(audioSettings.effects * audioSettings.master);
    const musicVolume = 0.45 * audioSettings.music * audioSettings.master;
    if (battleMusicRef.current) battleMusicRef.current.volume = musicVolume;
    if (characterSelectMusicRef.current) characterSelectMusicRef.current.volume = musicVolume;
    if (resultMusicRef.current) resultMusicRef.current.volume = Math.min(1, musicVolume * resultMusicGainRef.current);
  }, [audioSettings.music, audioSettings.master]);

  const stopCharacterSelectMusic = () => {
    const audio = characterSelectMusicRef.current;
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.currentTime = 0;
    characterSelectMusicRef.current = null;
  };

  const stopBattleMusic = useCallback(() => {
    const audio = battleMusicRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.onerror = null;
    battleMusicRef.current = null;
  }, []);

  const handleBattleFinished = useCallback(() => {
    setBattleFinished(true);
    stopBattleMusic();
  }, [stopBattleMusic]);

  const stopResultMusic = () => {
    const audio = resultMusicRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.onended = null;
    resultMusicRef.current = null;
  };

  const playResultMusic = (soundName: 'Win' | 'Lose') => {
    if (isMuted) return;
    stopResultMusic();
    resultMusicGainRef.current = soundName === 'Win' ? 1 : resultMusicGain;
    const audioFileName = soundName === 'Win' ? 'win.mp3' : `${soundName}.mp3`;
    const audio = new Audio(`/static/audio/${audioFileName}`);
    audio.preload = 'auto';
    audio.volume = Math.min(1, 0.45 * audioSettings.music * audioSettings.master * resultMusicGainRef.current);
    resultMusicRef.current = audio;
    audio.onended = () => {
      if (resultMusicRef.current === audio) resultMusicRef.current = null;
    };
    void audio.play().catch(() => {});
  };

  const startBattleMusic = () => {
    if (isMuted) return;
    stopResultMusic();
    const currentAudio = battleMusicRef.current;
    if (currentAudio) {
      void currentAudio.play().catch((error) => {
        console.log('Battle music playback prevented:', error);
      });
      return;
    }

    stopCharacterSelectMusic();
    const audio = new Audio('/static/audio/battle-theme.mp3');
    audio.preload = 'metadata';
    audio.loop = true;
    audio.volume = 0.45 * audioSettings.music * audioSettings.master;
    battleMusicRef.current = audio;
    audio.onerror = () => {
      if (battleMusicRef.current === audio) battleMusicRef.current = null;
    };
    void audio.play().catch((error) => {
      console.log('Battle music playback prevented:', error);
    });
  };

  const startCharacterSelectMusic = () => {
    if (isMuted) return;
    stopResultMusic();
    stopBattleMusic();
    const currentAudio = characterSelectMusicRef.current;
    if (currentAudio) {
      if (!currentAudio.paused) return;
      void currentAudio.play().catch(error => {
        console.warn('Character select music playback prevented; it will retry on the next user interaction:', error);
      });
      return;
    }

    const audio = new Audio('/static/audio/character-select-theme.mp3');
    audio.preload = 'metadata';
    audio.loop = true;
    audio.volume = 0.45 * audioSettings.music * audioSettings.master;
    characterSelectMusicRef.current = audio;
    audio.onerror = () => {
      if (characterSelectMusicRef.current === audio) characterSelectMusicRef.current = null;
    };
    void audio.play().catch(error => {
      console.warn('Character select music playback prevented; it will retry on the next user interaction:', error);
    });
  };

  useEffect(() => {
    if ((screen === 'lobby' || screen === 'quests' || screen === 'character-select') && !isMuted) {
      startCharacterSelectMusic();
    } else {
      stopCharacterSelectMusic();
    }
  }, [screen, isMuted]);

  useEffect(() => {
    const resumeScreenMusic = () => {
      const currentScreen = screenRef.current;
      if (currentScreen === 'lobby' || currentScreen === 'quests' || currentScreen === 'character-select') {
        startCharacterSelectMusic();
      } else if (currentScreen === 'battle' && !battleFinished) {
        startBattleMusic();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') resumeScreenMusic();
    };

    document.addEventListener('pointerdown', resumeScreenMusic, true);
    document.addEventListener('keydown', resumeScreenMusic, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', resumeScreenMusic);
    return () => {
      document.removeEventListener('pointerdown', resumeScreenMusic, true);
      document.removeEventListener('keydown', resumeScreenMusic, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', resumeScreenMusic);
    };
  }, [isMuted, audioSettings.music, audioSettings.master, battleFinished]);

  useEffect(() => {
    if (screen === 'battle' && !battleFinished && !isMuted) {
      if (!battleMusicRef.current) startBattleMusic();
    } else {
      stopBattleMusic();
      if (screen !== 'battle' || isMuted) stopResultMusic();
    }
  }, [screen, isMuted, battleFinished]);

  useEffect(() => () => {
    stopCharacterSelectMusic();
    stopBattleMusic();
    stopResultMusic();
  }, []);

  const handleStartGame = () => {
    if (!user) {
      setShowAuth(true);
      return;
    }
    setScreen('lobby');
  };

  const handleSelectQuest = (quest: Quest) => {
    setActiveQuest(quest);
    startCharacterSelectMusic();
    setScreen('character-select');
  };

  const handleConfirmTeams = (
    playerSquad: Character[],
    enemySquad: Character[],
    online?: { isOnline: boolean; roomId: string; playerIndex: number; seed: number; opponentProfile: UserProfile },
    sandbox?: boolean,
    sandboxPauseChakraGen?: boolean
  ) => {
    preloadCharacters([...playerSquad, ...enemySquad]);
    setPlayerTeam(playerSquad);
    setEnemyTeam(enemySquad);
    setOnlineParams(online || null);
    setIsSandbox(!!sandbox);
    setSandboxPauseChakraGen(!!sandbox && !!sandboxPauseChakraGen);
    setBattleFinished(false);
    startBattleMusic();
    setScreen('battle');
  };

  const handleBattleEnd = async (
    victory: boolean,
    stats: QuestBattleStats & { turn?: number; alivePlayerCount?: number; questBattleId?: string },
    earnedXp?: number,
  ) => {
    if (!user) return;

    let updatedUser: UserProfile;
    if (onlineParams?.isOnline) {
      const response = await matchFetch('/api/match/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: onlineParams.roomId, username: user.username }),
      });
      if (!response.ok) {
        throw new Error(`O servidor não confirmou as recompensas da partida (HTTP ${response.status}).`);
      }
      const result = await response.json() as {
        reward?: { user?: UserProfile | null } | null;
      };
      updatedUser = result.reward?.user
        ? { ...user, ...result.reward.user }
        : user;
    } else {
      const turns = stats?.turn || 1;
      const aliveCount = stats?.alivePlayerCount || (victory ? 1 : 0);
      const damageDealt = stats?.damageDealt || 0;
      const xpGained = earnedXp ?? calculateBattleXp(victory, turns, aliveCount, damageDealt);
      const oldXp = Math.max(0, user.xp || 0);
      const newXp = Math.max(0, oldXp + xpGained);
      const ranksList = getRanks();
      const newRank = getUserRankFromConfig(newXp, ranksList);

      updatedUser = {
        ...user,
        xp: newXp,
        rank: newRank,
        wins: victory ? (user.wins || 0) + 1 : (user.wins || 0),
        losses: !victory ? (user.losses || 0) + 1 : (user.losses || 0),
      };

      if (!isSandbox && user.username.trim().toLowerCase() !== 'convidado') {
        if (!stats.questBattleId) {
          throw new Error('Não foi possível identificar a batalha contra IA para registrar a missão.');
        }
        const response = await matchFetch('/api/quests/ai-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: user.username,
            battleId: stats.questBattleId,
            victory,
            stats: {
              ...stats,
              playerTeamCharacters: stats.playerTeamCharacters.map(({ name, tags }) => ({ name, tags })),
            },
          }),
        });
        const result = await response.json().catch(() => null) as {
          error?: string;
          user?: UserProfile;
        } | null;
        if (!response.ok || !result?.user) {
          throw new Error(result?.error || `Falha ao registrar progresso da missão contra IA (HTTP ${response.status}).`);
        }
        updatedUser = {
          ...updatedUser,
          questProgress: result.user.questProgress,
          completedQuestIds: result.user.completedQuestIds,
        };
      }
    }

    setUser(updatedUser);
    localStorage.setItem('naruto_user_profile', JSON.stringify(updatedUser));

    if (activeQuest && (onlineParams?.isOnline || !isSandbox)) {
      const savedGoals = updatedUser.questProgress?.[activeQuest.id];
      if (savedGoals) {
        const savedById = new Map(savedGoals.map(goal => [goal.id, goal]));
        const updatedGoals = activeQuest.goals.map(goal => ({
          ...goal,
          ...savedById.get(goal.id),
        }));
        setActiveQuest({
          ...activeQuest,
          goals: updatedGoals,
          completed: updatedGoals.every(goal => goal.currentValue >= goal.targetValue),
        });
      }
    }
  };

  const completeSessionRevocation = async (battleStats?: any) => {
    if (sessionRevocationHandledRef.current || !user) return;
    sessionRevocationHandledRef.current = true;

    let savedMatch: any = null;
    try {
      const raw = localStorage.getItem('active_match_save');
      savedMatch = raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error('Failed to read the active match while disconnecting this session:', error);
    }
    const battleWasActive = screen === 'battle' || !!savedMatch?.playerCombatants?.length;
    const activeOnlineMatch = onlineParams?.isOnline
      ? onlineParams
      : savedMatch?.onlineParams?.isOnline
        ? savedMatch.onlineParams
        : null;

    if (battleWasActive && activeOnlineMatch?.roomId && !battleStats?.sessionTakeoverAlreadyFinished) {
      const surrenderBody = JSON.stringify({
        roomId: activeOnlineMatch.roomId,
        username: user.username,
        reason: 'disconnect',
      });
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await matchFetch('/api/match/surrender', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: surrenderBody,
          });
          if (response.ok) break;
          console.error(`Failed to surrender the online match after session takeover (attempt ${attempt + 1}): HTTP ${response.status}`);
        } catch (error) {
          console.error(`Failed to surrender the online match after session takeover (attempt ${attempt + 1}):`, error);
        }
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    if (battleWasActive) {
      const battleOutcomeWasAlreadyDetermined = !!battleStats?.sessionTakeoverAlreadyFinished;
      await handleBattleEnd(
        battleOutcomeWasAlreadyDetermined && !!battleStats?.sessionTakeoverVictory,
        battleStats || {
          damageDealt: 0,
          damageReceived: 0,
          healingDone: 0,
          shieldGenerated: 0,
          stunsApplied: 0,
          skillsUsed: {},
          killsWithSkill: {},
          playerCharactersUsed: savedMatch?.playerCombatants?.map((combatant: any) => combatant.character?.name).filter(Boolean) || [],
          turn: savedMatch?.turn || 1,
          alivePlayerCount: 0,
        }
      );
    }

    setSessionTakeoverResult(battleWasActive && !battleStats?.sessionTakeoverAlreadyFinished);
    setSessionStatus('idle');
    setSessionTicket(null);
    setSessionToken(null);
    setSessionRevoked(false);
    setUser(null);
    setScreen('main-menu');
    setShowAuth(true);
    try {
      localStorage.removeItem('naruto_user_profile');
      localStorage.removeItem('active_match_save');
      sessionStorage.removeItem('naruto_account_session_token');
    } catch (error) {
      console.error('Failed to clear local account session data:', error);
    }
  };

  const handleQuit = () => {
    setPlayerTeam([]);
    setEnemyTeam([]);
    setOnlineParams(null);
    setIsSandbox(false);
    setSandboxPauseChakraGen(false);
    setRestoredState(null);
    setActiveQuest(null); // Reset active quest on exit
    startCharacterSelectMusic();
    setScreen('character-select'); // Return directly to character selection!
  };

  const createAccountSessionToken = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  };

  const handleLoginSuccess = (profile: UserProfile, ticket?: string) => {
    const isGuest = !ticket && profile.username.trim().toLowerCase() === 'convidado';
    if (!ticket && !isGuest) {
      console.error('Login succeeded without a session ticket; refusing to start an unprotected account session.');
      return;
    }
    const safeProfile = {
      ...profile,
      xp: Math.max(0, profile.xp ?? 0),
    };
    const token = ticket ? createAccountSessionToken() : null;
    if (token) {
      try {
        sessionStorage.setItem('naruto_account_session_token', token);
      } catch (error) {
        console.error('Failed to save this device session:', error);
      }
    }
    sessionRevocationHandledRef.current = false;
    setSessionToken(token);
    setSessionTicket(ticket || null);
    setSessionStatus(ticket ? 'initializing' : 'idle');
    setSessionError(null);
    setSessionRevoked(false);
    setSessionTakeoverResult(false);
    setUser(safeProfile);
    setScreen('lobby');
    try {
      localStorage.setItem('naruto_user_profile', JSON.stringify(safeProfile));
    } catch {}
    setShowAuth(false);
    // DESATIVADO TEMPORARIAMENTE (preload/download de tudo antes da arena)
    // Reativar: descomente a linha abaixo
    // setShowArenaLoading(true);
  };

  const handleLogout = () => {
    playClickSound();
    if (user && sessionToken) {
      const isPendingSession = sessionStatus === 'pending';
      fetch(`/api/auth/session/${isPendingSession ? 'cancel' : 'release'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, sessionToken }),
        keepalive: true,
      }).catch(error => console.error('Failed to release the account session:', error));
    }
    setUser(null);
    setSessionToken(null);
    setSessionTicket(null);
    setSessionStatus('idle');
    setSessionRevoked(false);
    sessionRevocationHandledRef.current = false;
    try {
      localStorage.removeItem('naruto_user_profile');
      sessionStorage.removeItem('naruto_account_session_token');
    } catch {}
    setScreen('main-menu');
  };

  const handleSessionTakeover = async () => {
    if (!user || !sessionToken || sessionBusy) return;
    setSessionBusy(true);
    setSessionError(null);
    try {
      if (sessionStatus === 'error') {
        const response = await fetch('/api/auth/session/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user.username, sessionToken }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao verificar a sessão.');
        if (data.status === 'revoked') {
          setSessionStatus('revoked');
          if (screen === 'battle') setSessionRevoked(true);
          else await completeSessionRevocation();
        } else if (data.status === 'pending') {
          setSessionStatus('pending');
        } else if (data.status === 'active') {
          setSessionStatus(data.takeoverRequested ? 'requested' : 'active');
        } else {
          throw new Error('O servidor retornou um estado de sessão desconhecido.');
        }
        return;
      }

      const response = await fetch('/api/auth/session/takeover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          sessionToken,
          requestingSessionToken: sessionStatus === 'pending' ? sessionToken : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível trocar de aparelho.');
      if (sessionStatus === 'pending') setSessionStatus('active');
    } catch (error) {
      console.error('Failed to confirm account session takeover:', error);
      setSessionError(error instanceof Error ? error.message : 'Não foi possível trocar de aparelho.');
      setSessionStatus('error');
    } finally {
      setSessionBusy(false);
    }
  };

  const handleCancelSessionTakeover = async () => {
    if (!user || !sessionToken || sessionBusy) return;
    setSessionBusy(true);
    setSessionError(null);
    try {
      const response = await fetch('/api/auth/session/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, sessionToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível cancelar a solicitação.');

      if (sessionStatus === 'pending') {
        setUser(null);
        setSessionToken(null);
        setSessionTicket(null);
        setSessionStatus('idle');
        setShowAuth(true);
        try {
          localStorage.removeItem('naruto_user_profile');
          sessionStorage.removeItem('naruto_account_session_token');
        } catch (error) {
          console.error('Failed to clear cancelled login data:', error);
        }
      } else {
        setSessionStatus('active');
      }
    } catch (error) {
      console.error('Failed to cancel account session takeover:', error);
      setSessionError(error instanceof Error ? error.message : 'Não foi possível cancelar a solicitação.');
      setSessionStatus('error');
    } finally {
      setSessionBusy(false);
    }
  };

  useEffect(() => {
    if (!user || !sessionToken) return;
    let cancelled = false;

    const checkSession = async () => {
      try {
        const claiming = !!sessionTicket;
        let initialVillageId = isVillageId(user.village) ? user.village : undefined;
        if (claiming && !initialVillageId) {
          try {
            const savedVillage = localStorage.getItem('naruto_ninja_affiliation');
            if (isVillageId(savedVillage)) initialVillageId = savedVillage;
          } catch (error) {
            console.error('Could not read the initial village for this account:', error);
          }
        }
        const endpoint = claiming
          ? 'claim'
          : screenRef.current === 'battle'
            ? 'heartbeat'
            : 'status';
        const requestBody = JSON.stringify({
          username: user.username,
          sessionToken,
          ...(claiming ? { sessionTicket, ...(initialVillageId ? { initialVillageId } : {}) } : {}),
        });
        const readResponse = async (response: Response) => ({
          ok: response.ok,
          status: response.status,
          data: await response.json() as {
            status?: string;
            takeoverRequested?: boolean;
            error?: string;
          },
        });
        let result: Awaited<ReturnType<typeof readResponse>>;
        if (claiming && sessionTicket) {
          let claimRequest = sessionClaimPromiseRef.current;
          if (!claimRequest || claimRequest.ticket !== sessionTicket) {
            claimRequest = {
              ticket: sessionTicket,
              promise: fetch(`/api/auth/session/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: requestBody,
              }).then(readResponse),
            };
            sessionClaimPromiseRef.current = claimRequest;
          }
          result = await claimRequest.promise;
        } else {
          result = await readResponse(await fetch(`/api/auth/session/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody,
          }));
        }
        if (cancelled) return;
        if (claiming && sessionClaimPromiseRef.current?.ticket === sessionTicket) {
          sessionClaimPromiseRef.current = null;
        }

        if (!result.ok) {
          if (claiming && result.status === 401) {
            setSessionTicket(null);
            return;
          }
          throw new Error(result.data.error || 'Falha ao verificar a sessão da conta.');
        }

        if (claiming) setSessionTicket(null);
        setSessionError(null);
        if (result.data.status === 'active') {
          setSessionStatus(result.data.takeoverRequested ? 'requested' : 'active');
        } else if (result.data.status === 'pending') {
          setSessionStatus('pending');
        } else if (result.data.status === 'revoked') {
          setSessionStatus('revoked');
          if (screenRef.current === 'battle') {
            setSessionRevoked(true);
          } else {
            await completeSessionRevocation();
          }
        } else {
          throw new Error('O servidor retornou um estado de sessão desconhecido.');
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to check account session:', error);
        setSessionError(error instanceof Error ? error.message : 'Falha ao verificar a sessão da conta.');
        setSessionStatus('error');
      }
    };

    void checkSession();
    const interval = window.setInterval(() => {
      if (screenRef.current === 'battle') void checkSession();
    }, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (screen === 'battle' && screenRef.current !== 'battle') {
        fetch('/api/auth/session/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user.username, sessionToken }),
          keepalive: true,
        }).catch(error => console.error('Failed to release the battle session lease:', error));
      }
    };
  }, [user?.username, sessionToken, sessionTicket, screen]);

  useEffect(() => {
    if (!user || sessionToken || user.username.trim().toLowerCase() === 'convidado') return;
    setUser(null);
    setShowAuth(true);
    setSessionStatus('idle');
    try {
      localStorage.removeItem('naruto_user_profile');
      sessionStorage.removeItem('naruto_account_session_token');
    } catch (error) {
      console.error('Failed to clear the legacy account session:', error);
    }
  }, [user?.username, sessionToken]);

  const sessionPromptStatus = sessionStatus === 'initializing' ||
    sessionStatus === 'pending' ||
    sessionStatus === 'requested' ||
    sessionStatus === 'error'
    ? sessionStatus
    : null;

  // If not logged in, only ask for login when the user wants to enter the arena
  if (!user && showAuth) {
    return (
      <>
        <Suspense fallback={<ScreenLoadingFallback />}>
          <AuthScreen
            onLoginSuccess={handleLoginSuccess}
            playClickSound={playClickSound}
            playScrollSound={playScrollSound}
            onBack={() => setShowAuth(false)}
          />
        </Suspense>
        {sessionTakeoverResult && (
          <SessionTakeoverResult onDismiss={() => setSessionTakeoverResult(false)} />
        )}
      </>
    );
  }

  return (
    <div className={`relative z-10 min-h-screen text-slate-100 flex flex-col justify-between selection:bg-orange-600 selection:text-white ${screen === 'battle' ? '' : 'bg-slate-950'}`}>
      {/* <RotateOverlay /> DESABILITADO temporariamente — reativar quando necessário */}
      {isProcessing && screen !== 'character-select' && (
        <div
          className="pointer-events-none fixed z-[1000000] -translate-x-1/2 -translate-y-1/2"
          style={{ left: cursorPosition.x, top: cursorPosition.y }}
        > 
          <img src="/static/img/icon/mangeky.svg" alt="Processando" className="h-16 w-16 animate-spin object-contain drop-shadow-lg" />
        </div>
      )}
      {user && sessionToken && sessionPromptStatus && (
        <AccountSessionPrompt
          status={sessionPromptStatus}
          error={sessionError}
          busy={sessionBusy}
          onTakeover={handleSessionTakeover}
          onCancel={handleCancelSessionTakeover}
        />
      )}
      {sessionTakeoverResult && (
        <SessionTakeoverResult onDismiss={() => setSessionTakeoverResult(false)} />
      )}
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

              <div className="text-surrender relative z-10 flex flex-col items-center justify-between text-center space-y-6 h-full">
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-center gap-2">
                    <Swords className="w-6 h-6 text-orange-800 animate-pulse" />
                    <h2 className="text-xl font-black uppercase tracking-tight text-stone-950 font-sans">
                      {reconnectChecking ? 'Verificando Sala...' : reconnectSurrender ? (['timeout', 'inactivity'].includes(reconnectSurrender.reason) ? (reconnectSurrender.isVictory ? 'Vitória por Inatividade!' : 'Derrota por Inatividade') : reconnectSurrender.reason === 'disconnect' ? (reconnectSurrender.isVictory ? 'Vitória por Desconexão!' : 'Derrota por Desconexão') : (reconnectSurrender.isVictory ? 'Vitória por Rendição!' : 'Derrota por Rendição')) : reconnectRoomLost ? 'Sala Perdida' : 'Combate Encontrado!'}
                    </h2>
                  </div>
                  {reconnectChecking ? (
                    <p className="text-xs sm:text-sm text-stone-800 font-bold leading-relaxed max-w-xs mx-auto">
                      Sua batalha em andamento foi encontrada. Verificando a sala no servidor...
                    </p>
                  ) : reconnectSurrender ? (
                    <p className="text-xs sm:text-sm text-stone-800 font-bold leading-relaxed max-w-xs mx-auto">
                      {reconnectSurrender.reason === 'inactivity' ? (reconnectSurrender.isVictory ? `O oponente ${reconnectSurrender.surrenderedBy} ficou 120 segundos sem interagir com a batalha. Você venceu!` : `Você perdeu por ficar 120 segundos sem interagir com a batalha.`) : reconnectSurrender.reason === 'timeout' ? (reconnectSurrender.isVictory ? `O oponente ${reconnectSurrender.surrenderedBy} perdeu por falta de conexão (2 turnos offline)! Você venceu.` : `Você perdeu por falta de conexão (2 turnos sem jogar).`) : reconnectSurrender.reason === 'disconnect' ? (reconnectSurrender.isVictory ? `O oponente ${reconnectSurrender.surrenderedBy} desconectou! Você venceu.` : `Você desconectou e perdeu.`) : (reconnectSurrender.isVictory ? `O oponente ${reconnectSurrender.surrenderedBy} se rendeu! Você venceu por rendição.` : `Você se rendeu para ${reconnectSurrender.surrenderedBy}. Derrota por rendição.`)} A partida foi encerrada.
                    </p>
                  ) : reconnectRoomLost ? (
                    <p className="text-xs sm:text-sm text-stone-800 font-bold leading-relaxed max-w-xs mx-auto">
                      A sala desta batalha no existe mais no servidor, ento o combate ser encerrado.
                    </p>
                  ) : (
                    <p className="text-xs sm:text-sm text-stone-800 font-bold leading-relaxed max-w-xs mx-auto">
                      Voc possui uma batalha em andamento na Arena. Deseja retornar ao confronto ou declarar rendio?
                    </p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full pt-1">
                  {reconnectChecking ? (
                    <div className="flex items-center justify-center gap-3 py-1 w-full">
                      <img src="/static/img/icon/star.svg" alt="Verificando" className="w-8 h-8 animate-spin object-contain" />
                      <span className="text-xs text-stone-700 font-mono font-bold uppercase tracking-wider">Aguarde...</span>
                    </div>
                  ) : reconnectSurrender ? (
                    <button
                      onClick={() => {
                        playClickSound();
                        try { localStorage.removeItem('active_match_save'); } catch {}
                        setReconnectData(null);
                        setReconnectRoomLost(false);
                        setReconnectSurrender(null);
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-700 to-emerald-800 hover:from-emerald-600 hover:to-emerald-700 text-amber-100 font-extrabold text-xs uppercase tracking-wider shadow-lg border border-emerald-600/50 transition cursor-pointer active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Flag className="w-4 h-4" />
                      <span>{reconnectSurrender.isVictory ? 'Coletar Vitória' : 'Encerrar'}</span>
                    </button>
                  ) : reconnectRoomLost ? (
                    <button
                      onClick={handleDeclineReconnect}
                        data-sound="uah"
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-600 hover:to-slate-800 text-amber-100 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-slate-950/40 border border-slate-600/50 transition cursor-pointer active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Flag className="w-4 h-4" />
                      <span>Encerrar Batalha</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleRestoreGame(reconnectData)}
                        data-sound="uah"
                        className="sm:w-auto sm:flex-none w-full py-2.5 px-5 rounded-xl bg-gradient-to-r from-green-800 to-emerald-700 hover:from-green-700 hover:to-emerald-600 text-green-50 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-green-950/40 border border-green-500/50 transition cursor-pointer active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Swords className="w-4 h-4" />
                        <span>Continuar</span>
                      </button>

                      <button
                        onClick={handleDeclineReconnect}
                        data-sound="uah"
                        className="sm:w-auto sm:flex-none w-full py-2.5 px-5 rounded-xl bg-gradient-to-r from-red-800 to-rose-900 hover:from-red-700 hover:to-rose-800 text-amber-100 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-red-950/40 border border-red-600/50 transition cursor-pointer active:scale-95 flex items-center justify-center gap-2"
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
            playWinSound={playWinSound}
            playUahSound={playUahSound}
            onOpenAdmin={() => {
              if (user?.username.trim().toLowerCase() === '2') setScreen('admin');
            }}
            user={user}
            onLogout={handleLogout}
            audioSettings={audioSettings}
            onUpdateAudioSetting={updateAudioSetting}
            onUpdateUser={(updated) => {
              const safe = { ...updated, xp: Math.max(0, updated.xp ?? 0) };
              setUser(safe);
              localStorage.setItem('naruto_user_profile', JSON.stringify(safe));
            }}
          />
        )}

        {(screen === 'lobby' || (screen === 'admin' && user?.username.trim().toLowerCase() !== '2')) && (
          <LobbyScreen
            onStartGame={handleStartGame}
            onBattle={() => {
              setActiveQuest(null);
              startCharacterSelectMusic();
              setScreen('character-select');
            }}
            onOpenQuests={() => setScreen('quests')}
            isMuted={isMuted}
            onToggleMute={() => setIsMuted(!isMuted)}
            playClickSound={playClickSound}
            playScrollSound={playScrollSound}
            playWinSound={playWinSound}
            playUahSound={playUahSound}
            onOpenAdmin={() => {
              if (user?.username.trim().toLowerCase() === '2') setScreen('admin');
            }}
            user={user}
            onLogout={handleLogout}
            audioSettings={audioSettings}
            onUpdateAudioSetting={updateAudioSetting}
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
            onBack={() => setScreen('lobby')}
            playClickSound={playClickSound}
            playScrollSound={playScrollSound}
            playUahSound={playUahSound}
            playWinSound={playWinSound}
          />
        )}

        {screen === 'character-select' && (
          <CharacterSelect
            onConfirmTeams={handleConfirmTeams}
            playClickSound={playClickSound}
            playScrollSound={playScrollSound}
            playUahSound={playUahSound}
            playTargetSound={playTargetSound}
            onProcessingChange={setIsProcessing}
            user={user}
            activeQuest={activeQuest}
            onBack={() => setScreen(activeQuest ? 'quests' : 'lobby')}
          />
        )}

        {screen === 'battle' && (
          <BattleBoard
            playerTeam={playerTeam}
            enemyTeam={enemyTeam}
            isMuted={isMuted}
            onToggleMute={() => setIsMuted(!isMuted)}
            audioSettings={audioSettings}
            onUpdateAudioSetting={updateAudioSetting}
            onQuit={handleQuit}
            onOpenAdmin={user?.username.trim().toLowerCase() === '2' ? () => setScreen('admin') : undefined}
            playClickSound={playClickSound}
            playScrollSound={playScrollSound}
            playUahSound={playUahSound}
            playTargetSound={playTargetSound}
            playWinSound={playWinSound}
            playLoseSound={playLoseSound}
            onBattleFinished={handleBattleFinished}
            onProcessingChange={setIsProcessing}
            user={user}
            onlineParams={onlineParams}
            isSandbox={isSandbox}
            sandboxPauseChakraGen={sandboxPauseChakraGen}
            restoredState={restoredState}
            onBattleEnd={handleBattleEnd}
            sessionRevoked={sessionRevoked}
            onSessionRevoked={(stats) => { void completeSessionRevocation(stats); }}
            activeQuest={activeQuest}
          />
        )}

        {screen === 'admin' && user?.username.trim().toLowerCase() === '2' && (
          <AdminDashboard
            onBack={() => setScreen('lobby')}
            playClickSound={playClickSound}
            playScrollSound={playScrollSound}
          />
        )}
      </Suspense>
    </div>
  );
}

 