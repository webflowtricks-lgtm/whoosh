/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Shield, ChevronLeft, ChevronRight, Swords, RefreshCw, Sparkles, Search, Filter, Loader2, AlertTriangle, Shirt, Lock, X } from 'lucide-react';
import { Character, ChakraType, UserProfile, Quest } from '../types';
import { getCharacters, fetchCharactersFromServer } from '../lib/characterStorage';
import { safeFetchJson } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage, translateGameText, translateSkillName, translateTargetType } from '../lib/i18n';
import { RichText, stripRichMarkup } from '../lib/richText';
import MangekyoLoader from './MangekyoLoader';

interface CharacterSelectProps {
  onConfirmTeams: (
    playerTeam: Character[],
    enemyTeam: Character[],
    online?: { isOnline: boolean; roomId: string; playerIndex: number; opponentProfile: UserProfile },
    sandbox?: boolean,
    sandboxPauseChakraGen?: boolean
  ) => void;
  playClickSound: () => void;
  playScrollSound: () => void;
  user: UserProfile;
  activeQuest?: Quest | null;
  onBack?: () => void;
}

export default function CharacterSelect({ onConfirmTeams, playClickSound, playScrollSound, user, activeQuest, onBack }: CharacterSelectProps) {
  const { t, language } = useLanguage();
  const [charList, setCharList] = useState<Character[]>(() => getCharacters());
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('naruto_last_selected_team');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {}
    return [];
  });
  const [sandboxPlayerTeam, setSandboxPlayerTeam] = useState<Character[] | null>(null);
  // 🧊 Sandbox: modal perguntando se deseja pausar a geração de chakra (10 chakras fixos p/ ambos)
  const [showSandboxChakraModal, setShowSandboxChakraModal] = useState(false);
  const [previewCharacter, setPreviewCharacter] = useState<Character>(() => {
    const list = getCharacters();
    try {
      const saved = localStorage.getItem('naruto_last_selected_team');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const found = list.find(c => c.id === parsed[0]);
          if (found) return found;
        }
      }
    } catch (e) {}
    return list[0] || null;
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [previewSkillsPage, setPreviewSkillsPage] = useState(0);

  // Auto-persist last selected team whenever selection changes (outside sandbox opponent picking)
  useEffect(() => {
    if (!sandboxPlayerTeam && selectedIds && selectedIds.length > 0) {
      try {
        localStorage.setItem('naruto_last_selected_team', JSON.stringify(selectedIds));
      } catch (e) {}
    }
  }, [selectedIds, sandboxPlayerTeam]);

  // Quests & Character Lock State
  const [questsList, setQuestsList] = useState<Quest[]>([]);
  const [lockedNotice, setLockedNotice] = useState<string | null>(null);

  useEffect(() => {
    safeFetchJson<{ success?: boolean; quests?: Quest[] }>('/api/quests')
      .then(data => {
        if (data && data.success && Array.isArray(data.quests)) {
          setQuestsList(data.quests);
        }
      })
      .catch(() => {});
  }, []);

  // Helper to check if a character is locked based on missing quest requirements
  const checkCharacterLocked = (char: Character): { isLocked: boolean; reason?: string } => {
    if (!char.requiredQuestIds || char.requiredQuestIds.length === 0) {
      return { isLocked: false };
    }
    // Check if explicitly unlocked for user profile
    if (user?.unlockedCharacterNames?.some(n => n.toLowerCase() === char.name.toLowerCase() || n.toLowerCase() === char.id.toLowerCase())) {
      return { isLocked: false };
    }
    
    const completed = user?.completedQuestIds || [];
    const missing: string[] = [];

    for (const req of char.requiredQuestIds) {
      const isDone = completed.some(cid => {
        if (cid.toLowerCase() === req.toLowerCase()) return true;
        const q = questsList.find(quest => quest.id === cid);
        if (q && q.title.toLowerCase() === req.toLowerCase()) return true;
        return false;
      });

      if (!isDone) {
        const q = questsList.find(quest => quest.id === req);
        missing.push(q ? q.title : req);
      }
    }

    if (missing.length > 0) {
      return {
        isLocked: true,
        reason: `Bloqueado! Requer a missão "${missing.join(', ')}"`
      };
    }
    return { isLocked: false };
  };

  // Sync with server on mount
  useEffect(() => {
    let active = true;
    fetchCharactersFromServer().then(updated => {
      if (!active) return;
      if (updated && updated.length > 0) {
        setCharList(updated);
        // Set preview character if current preview isn't in list or as default
        setPreviewCharacter(prev => {
          if (prev) {
            const found = updated.find(c => c.id === prev.id);
            if (found) return found;
          }
          return updated[0];
        });
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Matchmaking State
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [matchmakingTime, setMatchmakingTime] = useState(0);
  const [matchmakingStatus, setMatchmakingStatus] = useState<'searching' | 'matched' | 'error'>('searching');
  const [opponent, setOpponent] = useState<UserProfile | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [lobbyTip, setLobbyTip] = useState('Dica: Acumule chakra de linhagem (Blood) para liberar jutsus supremos.');

  const matchmakingPollRef = useRef<any | null>(null);
  const timeIntervalRef = useRef<any | null>(null);
  const countdownIntervalRef = useRef<any | null>(null);

  const tips = [
    'Dica: Acumule chakra de linhagem (Blood) para liberar os jutsus supremos.',
    'Dica: Mantenha seus oponentes atordoados para controlar o ritmo de batalha.',
    'Dica: Habilidades de fuga te deixam totalmente invulnerável por alguns turnos.',
    'Dica: Converta 4 chakras quaisquer em 1 chakra de sua escolha no painel inferior.',
    'Dica: Os efeitos de Sangramento causam dano constante a cada final de turno.',
    'Dica: Purifique seus aliados usando habilidades de suporte para remover efeitos negativos.',
    'Dica: Personagens invisíveis não podem ser alvos diretos de ataques inimigos.',
    'Dica: O escudo protege sua vida, mas pode ser desfeito por habilidades destruidoras de escudo.'
  ];

  // Rotate tips
  useEffect(() => {
    if (!isMatchmaking) return;
    const interval = setInterval(() => {
      const randTip = tips[Math.floor(Math.random() * tips.length)];
      setLobbyTip(randTip);
    }, 4500);
    return () => clearInterval(interval);
  }, [isMatchmaking]);

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('Todos');
  const [expandedSkills, setExpandedSkills] = useState<Record<string, boolean>>({});

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const handleTagChange = (val: string) => {
    setSelectedTag(val);
    setCurrentPage(1);
  };

  // Tag list for filtering
  const FILTER_TAGS = ['Todos', 'Clássico', 'Shippuden', 'Reencarnado', 'Akatsuki', 'Vila da Folha', 'Vila da Areia', 'Vila da Névoa', 'Vila da Nuvem', 'Vila da Pedra'];

  // Apply search and tag filters
  const filteredCharacters = charList.filter(char => {
    const matchesSearch = char.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          char.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTag = selectedTag === 'Todos' || char.tags.includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  const ITEMS_PER_PAGE = 18;
  const totalPages = Math.ceil(filteredCharacters.length / ITEMS_PER_PAGE);
  const activePage = Math.min(currentPage, Math.max(totalPages, 1));
  const startIndex = (activePage - 1) * ITEMS_PER_PAGE;
  const paginatedCharacters = filteredCharacters.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleSelectCharacter = (character: Character) => {
    playClickSound();

    // Always update preview character details on click
    setPreviewCharacter(character);
    setPreviewSkillsPage(0);

    const { isLocked, reason } = checkCharacterLocked(character);
    if (isLocked) {
      setLockedNotice(reason || 'Este personagem está bloqueado!');
      setTimeout(() => setLockedNotice(null), 3500);
      return;
    }

    if (selectedIds.includes(character.id)) {
      setSelectedIds(selectedIds.filter(id => id !== character.id));
    } else {
      if (selectedIds.length < 3) {
        setSelectedIds([...selectedIds, character.id]);
      }
    }
  };

  const handleHoverCharacter = (_character: Character) => {
    // Disabled hover preview - characteristics only display on click/selection as requested
  };

  // Skins state
  const [showSkinsTab, setShowSkinsTab] = useState(false);
  const [equippedSkins, setEquippedSkins] = useState<Record<string, string>>({});

  const attachSkinsToTeam = (team: Character[]) => {
    return (team || []).map(char => {
      if (!char) return char;
      const skinId = equippedSkins[char.id];
      let selectedSkinUrl: string | undefined = char.selectedSkinUrl;
      const charSkins = Array.isArray(char.skins) ? char.skins : [];

      if (skinId) {
        if (skinId === 'default') {
          selectedSkinUrl = char.portrait;
        } else if (charSkins.length > 0) {
          const skinObj = charSkins.find(s => s && s.id === skinId);
          if (skinObj && skinObj.image) {
            selectedSkinUrl = skinObj.image;
          }
        }
      }

      if (!selectedSkinUrl) {
        if (charSkins.length > 0 && charSkins[0]?.image) {
          selectedSkinUrl = charSkins[0].image;
        } else {
          selectedSkinUrl = char.portrait;
        }
      }

      return {
        ...char,
        skins: charSkins,
        skills: Array.isArray(char.skills) ? char.skills : [],
        selectedSkinId: skinId || 'default',
        selectedSkinUrl: selectedSkinUrl
      };
    });
  };

  const handleConfirm = () => {
    if (selectedIds.length !== 3) return;
    playClickSound();

    const rawPlayerTeam = charList.filter(c => selectedIds.includes(c.id));
    const playerTeam = attachSkinsToTeam(rawPlayerTeam);
    
    // Select 3 random unique characters for the enemy team
    const remaining = charList.filter(c => !selectedIds.includes(c.id));
    const shuffled = [...remaining].sort(() => 0.5 - Math.random());
    const enemyTeam = attachSkinsToTeam(shuffled.slice(0, 3));

    onConfirmTeams(playerTeam, enemyTeam);
  };

  const handleStartSandboxPhase = () => {
    if (selectedIds.length !== 3) return;
    playClickSound();
    const rawPlayerTeam = charList.filter(c => selectedIds.includes(c.id));
    const playerTeam = attachSkinsToTeam(rawPlayerTeam);
    setSandboxPlayerTeam(playerTeam);
    setSelectedIds([]); // clear for enemy team selection
  };

  const handleBackToPlayerSelect = () => {
    playClickSound();
    if (sandboxPlayerTeam) {
      setSelectedIds(sandboxPlayerTeam.map(c => c.id));
      setSandboxPlayerTeam(null);
    }
  };

  const handleConfirmSandboxMatch = () => {
    if (selectedIds.length !== 3 || !sandboxPlayerTeam) return;
    playClickSound();
    // Abre o modal perguntando sobre pausar a geração de chakra (só em sandbox)
    setShowSandboxChakraModal(true);
  };

  const finalizeSandboxMatch = (pauseChakraGen: boolean) => {
    if (selectedIds.length !== 3 || !sandboxPlayerTeam) return;
    playClickSound();
    const rawEnemyTeam = charList.filter(c => selectedIds.includes(c.id));
    const enemyTeam = attachSkinsToTeam(rawEnemyTeam);
    setShowSandboxChakraModal(false);
    onConfirmTeams(sandboxPlayerTeam, enemyTeam, undefined, true, pauseChakraGen);
  };

  // Handle Online Matchmaking Flow
  const handleStartMatchmaking = async () => {
    if (selectedIds.length !== 3) return;
    playClickSound();

    const playerTeam = attachSkinsToTeam(charList.filter(c => selectedIds.includes(c.id)));

    setIsMatchmaking(true);
    setMatchmakingStatus('searching');
    setMatchmakingTime(0);
    setCountdown(5);
    setOpponent(null);

    // Increment searching timer
    timeIntervalRef.current = setInterval(() => {
      setMatchmakingTime(prev => prev + 1);
    }, 1000);

    try {
      // Join matchmaking queue
      const joinRes = await fetch('/api/matchmaking/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          name: user.name,
          photoUrl: user.photoUrl,
          team: playerTeam
        })
      });

      if (!joinRes.ok) {
        const errData = await joinRes.json().catch(() => ({}));
        console.error('Join queue error:', errData);
        setMatchmakingStatus('error');
        return;
      }

      const joinData = await joinRes.json();

      if (joinData.status === 'matched') {
        handleMatchFound(joinData.roomId, joinData.playerIndex, joinData.opponent, playerTeam);
        return;
      }

      if (joinData.status !== 'searching') {
        console.error('Unexpected join response:', joinData);
        setMatchmakingStatus('error');
        return;
      }

      // Start polling for matchmaking status
      const pollInterval = 1500;
      let pollCount = 0;
      matchmakingPollRef.current = setInterval(async () => {
        try {
          pollCount++;
          const statusRes = await fetch(`/api/matchmaking/status?username=${encodeURIComponent(user.username)}`);
          if (!statusRes.ok) {
            if (pollCount > 60) { // 90 seconds timeout
              setMatchmakingStatus('error');
            }
            return;
          }
          const statusData = await statusRes.json();

          if (statusData.status === 'matched') {
            handleMatchFound(statusData.roomId, statusData.playerIndex, statusData.opponent, playerTeam);
          } else if (statusData.status === 'idle' && pollCount > 3) {
            // Re-join queue if we got idle (might have been cleaned up)
            fetch('/api/matchmaking/join', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: user.username,
                name: user.name,
                photoUrl: user.photoUrl,
                team: playerTeam
              })
            }).catch(() => {});
          }
        } catch (err) {
          console.error('Error polling matchmaking status:', err);
          if (pollCount > 60) setMatchmakingStatus('error');
        }
      }, pollInterval);

    } catch (err) {
      console.error('Error joining matchmaking queue:', err);
      setMatchmakingStatus('error');
    }
  };

  const handleMatchFound = (roomId: string, playerIndex: number, opponentData: any, playerTeam: Character[]) => {
    // Clear queue timers
    if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
    if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);

    setMatchmakingStatus('matched');
    setOpponent(opponentData);

    // Audio cue
    try {
      const audio = new Audio('/static/audio/NextTurn.ogg');
      audio.volume = 0.55;
      audio.play().catch(() => {});
    } catch (e) {}

    // Start 5 second countdown before starting battle
    let currentCountdown = 5;
    countdownIntervalRef.current = setInterval(() => {
      currentCountdown--;
      setCountdown(currentCountdown);

      if (currentCountdown <= 0) {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        
        // Finalize selection and start!
        setIsMatchmaking(false);
        onConfirmTeams(playerTeam, opponentData.team, {
          isOnline: true,
          roomId,
          playerIndex,
          opponentProfile: {
            username: opponentData.username,
            name: opponentData.name,
            photoUrl: opponentData.photoUrl
          }
        });
      }
    }, 1000);
  };

  const handleCancelMatchmaking = async () => {
    playClickSound();
    
    // Clear all interval timers
    if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
    if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    setIsMatchmaking(false);

    try {
      await fetch('/api/matchmaking/quit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username })
      });
    } catch (err) {
      console.error('Error quitting matchmaking:', err);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
      if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  const renderChakraCosts = (costs: ChakraType[]) => {
    return (
      <div className="flex items-center gap-1">
        {costs.map((cost, idx) => {
          let bgClass = 'bg-slate-600';
          if (cost === 'Tai') bgClass = 'bg-green-600 border border-green-400';
          else if (cost === 'Nin') bgClass = 'bg-blue-600 border border-blue-400';
          else if (cost === 'Gen') bgClass = 'bg-white border border-white/60';
          else if (cost === 'Blood') bgClass = 'bg-red-600 border border-red-400';
          else if (cost === 'Rand') bgClass = 'bg-slate-600 border border-slate-500';

          return (
            <span
              key={idx}
              className={`w-3.5 h-3.5 rounded-full ${bgClass} shadow-inner flex items-center justify-center`}
              title={`${cost} Chakra`}
            >
              <span className="text-[9px] font-bold text-white leading-none scale-90">
                {cost[0]}
              </span>
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative selection:bg-orange-600 selection:text-white overflow-x-hidden">
      {/* Background Image: choose team background */}
      <img 
        src="/static/img/bg/background_choose_team.webp" 
        alt="Background Choose Team" 
        className="fixed inset-0 w-full h-full object-cover z-0 pointer-events-none filter brightness-100"
        onError={(e) => {
          e.currentTarget.src = '/static/img/bg/background-battle.webp';
        }}
      />
      {/* Visual background accents and subtle transparent overlay */}
      <div className="fixed inset-0 bg-transparent pointer-events-none z-0" />
      <div className="absolute top-[10%] right-[10%] w-[40%] h-[40%] rounded-full bg-orange-500/5 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[15%] left-[5%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none z-0" />

      {/* Draft Status Header in Parchment Scroll (Fixed at top, full width) */}
      <header className="fixed top-0 left-0 right-0 z-30 w-full shadow-2xl">
        <div className="w-full relative overflow-hidden flex items-center border-b border-amber-950/40">
          {/* Topbar Parchment Background */}
          <img 
            src="/static/img/topbar.webp" 
            alt="Topbar Pergaminho" 
            className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none filter drop-shadow-md"
            onError={(e) => {
              e.currentTarget.src = '/static/img/filtro_pergaminho.webp';
            }}
          />

          {/* Topbar Content */}
          <div className="top-items-battle relative z-10 w-full max-w-7xl mx-auto flex flex-col md:flex-row justify-center items-center gap-4 md:gap-10 px-4 sm:px-8 py-2.5">
            <div className="text-center md:text-left shrink-0">
        
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-amber-950 font-mono uppercase drop-shadow-sm">
                {sandboxPlayerTeam ? t("ESCOLHA O ESQUADRÃO ADVERSÁRIO", "CHOOSE OPPONENT SQUAD") : t("ESCOLHA SEU ESQUADRÃO", "CHOOSE YOUR SQUAD")}
              </h2>
            </div>

            {/* Player Selection Status Indicator & Game Mode Buttons */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-5 justify-center">
              <div className="flex items-center gap-2">
                {[0, 1, 2].map(idx => {
                  const charId = selectedIds[idx];
                  const char = charList.find(c => c.id === charId);

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (char) {
                          playClickSound();
                          setSelectedIds(prev => prev.filter(id => id !== char.id));
                        }
                      }}
                      title={char ? `${char.name} (${t("Clique para remover", "Click to remove")})` : `Slot ${idx + 1}`}
                      className={`group relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg border-2 overflow-hidden flex items-center justify-center transition-all ${
                        char
                          ? 'border-amber-800 bg-amber-950/30 shadow-md ring-1 ring-amber-700/50 cursor-pointer hover:border-red-500 hover:ring-2 hover:ring-red-500/80 active:scale-95'
                          : 'border-dashed border-amber-900/40 bg-amber-950/10 cursor-default'
                      }`}
                    >
                      {char ? (
                        <>
                          <MangekyoLoader
                            src={char.portrait}
                            alt={char.name}
                            className="w-full h-full"
                            imgClassName="transition-all group-hover:brightness-75"
                            iconScale={0.55}
                          />
                          <div className="absolute inset-0 bg-red-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <X className="w-5 h-5 text-red-400 drop-shadow" />
                          </div>
                        </>
                      ) : (
                        <span className="text-amber-900/60 text-[10px] sm:text-xs font-bold font-mono">Slot</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                {sandboxPlayerTeam ? (
                  <>
                    <button
                      onClick={handleBackToPlayerSelect}
                      className="px-3.5 py-2.5 rounded-lg font-black flex items-center gap-1.5 tracking-wide text-xs uppercase cursor-pointer border select-none active:scale-95 transition-all bg-amber-900/80 hover:bg-amber-800 text-amber-100 border-amber-700 shadow-md font-mono"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      {t("Voltar (Time A)", "Back (Team A)")}
                    </button>

                    <button
                      onClick={handleConfirmSandboxMatch}
                      disabled={selectedIds.length !== 3}
                      className={`px-4 py-2.5 rounded-lg font-black flex items-center gap-1.5 tracking-wide text-xs uppercase cursor-pointer border select-none active:scale-95 transition-all font-mono ${
                        selectedIds.length === 3
                          ? 'bg-gradient-to-r from-emerald-700 to-teal-600 hover:brightness-110 text-white border-emerald-500 shadow-lg'
                          : 'bg-amber-950/20 text-amber-900/50 border-amber-900/30 cursor-not-allowed font-medium'
                      }`}
                    >
                      <Swords className="w-4 h-4 animate-pulse" />
                      {t("Iniciar Sandbox", "Start Sandbox")}
                    </button>
                  </>
                ) : (
                  <>
                    {onBack && (
                      <button
                        onClick={() => {
                          playClickSound();
                          onBack();
                        }}
                        className="px-3.5 py-2.5 rounded-lg font-black flex items-center gap-1.5 tracking-wide text-xs uppercase cursor-pointer border select-none active:scale-95 transition-all bg-amber-900/80 hover:bg-amber-800 text-amber-100 border-amber-700 shadow-md font-mono"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        {t("Voltar", "Back")}
                      </button>
                    )}

                    <button
                      onClick={handleConfirm}
                      disabled={selectedIds.length !== 3}
                      className={`px-3.5 py-2.5 rounded-lg font-black flex items-center gap-1.5 tracking-wide text-xs uppercase cursor-pointer border select-none active:scale-95 transition-all font-mono ${
                        selectedIds.length === 3
                          ? 'bg-amber-900 hover:bg-amber-800 text-amber-100 border-amber-700 shadow-md'
                          : 'bg-amber-950/20 text-amber-900/50 border-amber-900/30 cursor-not-allowed font-medium'
                      }`}
                    >
                      <Swords className="w-4 h-4" />
                      {t("Lutar contra IA", "Fight vs AI")}
                    </button>

                    <button
                      onClick={handleStartSandboxPhase}
                      disabled={selectedIds.length !== 3}
                      className={`px-3.5 py-2.5 rounded-lg font-black flex items-center gap-1.5 tracking-wide text-xs uppercase cursor-pointer border select-none active:scale-95 transition-all font-mono ${
                        selectedIds.length === 3
                          ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:brightness-110 text-amber-950 border-amber-500 shadow-md'
                          : 'bg-amber-950/20 text-amber-900/50 border-amber-900/30 cursor-not-allowed font-medium'
                      }`}
                    >
                      <img src="/static/img/icon/star.svg" alt="Loading" className="w-4 h-4 animate-spin object-contain" />
                      Sandbox
                    </button>

                    <button
                      onClick={handleStartMatchmaking}
                      disabled={selectedIds.length !== 3}
                      className={`px-4 py-2.5 rounded-lg font-black flex items-center gap-2 tracking-wide text-xs uppercase cursor-pointer border select-none active:scale-95 transition-all font-mono ${
                        selectedIds.length === 3
                          ? 'bg-amber-950 text-amber-100 border-amber-700 hover:bg-amber-900 shadow-md'
                          : 'bg-amber-950/20 text-amber-900/50 border-amber-900/30 cursor-not-allowed font-medium'
                      }`}
                    >
                      <Sparkles className="w-4 h-4 animate-pulse text-amber-400" />
                      {t("Partida Rápida", "Quick Match")}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Draft Area */}
      <main className="max-w-[1400px] w-full mx-auto px-3 sm:px-6 pt-20 sm:pt-24 pb-6 grid lg:grid-cols-12 gap-6 flex-1 items-start scale-[0.95] sm:scale-[0.92] lg:scale-[0.90] xl:scale-[0.92] origin-top transition-transform">
        {/* Roster Grid (Left Side) */}
        <div className="lg:col-span-6 space-y-6">
          <div className="flex flex-col gap-4">
       

            {/* Filter and Search Bar inside Parchment Scroll */}
            <div className="relative w-full rounded-xl overflow-hidden   flex items-center group">
              {/* Parchment background */}
              <img 
                src="/static/img/filtro_pergaminho.webp" 
                alt="Filtro Pergaminho" 
                className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none filter"
                onError={(e) => {
                  e.currentTarget.src = '/static/img/pergaminho_skills.webp';
                }}
              />

              {/* Filter inputs inside parchment printable bounds */}
              <div className="relative z-10 w-full grid sm:grid-cols-2 gap-2.5 px-7 sm:px-10 py-3">
                {/* Search Input */}
                <div className="relative flex items-center">
                  <Search className="absolute left-3 w-4 h-4 text-amber-950/70" />
                  <input
                    type="text"
                    placeholder="Buscar ninja pelo nome..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="w-full  rounded-lg pl-9 pr-3 py-1.5 text-xs text-amber-950   font-sans font-medium focus:outline-none transition-all"
                  />
                </div>

                {/* Tag Selection Dropdown */}
                <div className="relative flex items-center">
                  <Filter className="absolute left-3 w-4 h-4 text-amber-950/70" />
                  <select
                    value={selectedTag}
                    onChange={(e) => handleTagChange(e.target.value)}
                    className="w-full  hover:bg-amber-950/15 focus:bg-amber-950/20   focus:border-amber-900/60 rounded-lg pl-9 pr-8 py-1.5 text-xs text-amber-950 font-sans font-bold appearance-none cursor-pointer focus:outline-none transition-all"
                  >
                    {FILTER_TAGS.map(tag => (
                      <option key={tag} value={tag} className="bg-amber-50 text-amber-950 font-sans font-medium">
                        {tag}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 pointer-events-none border-l-4 border-r-4 border-t-4 border-transparent border-t-amber-900/80 w-0 h-0" />
                </div>
              </div>
            </div>
          </div>

          {/* Toast Notification for Locked Character */}
          <AnimatePresence>
            {lockedNotice && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-red-950/90 border border-red-500/60 text-red-200 px-4 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-3 font-mono text-xs max-w-md"
              >
                <Lock className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="flex-1 font-semibold">{lockedNotice}</span>
                <button onClick={() => setLockedNotice(null)} className="text-red-400 hover:text-white p-0.5 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 sm:gap-3">
            {paginatedCharacters.map(char => {
              const isSelected = selectedIds.includes(char.id);
              const isFull = selectedIds.length >= 3 && !isSelected;
              const { isLocked, reason } = checkCharacterLocked(char);
              const villageTag = char.tags.find(t => t.includes('Vila')) || char.tags[0];

              return (
                <motion.div
                  key={char.id}
                  whileHover={{ scale: isFull || isLocked ? 1 : 1.03 }}
                  onClick={() => handleSelectCharacter(char)}
                  className={`group relative flex flex-col items-center justify-between p-0 cursor-pointer transition-all aspect-[1/1.25] w-full select-none ${
                    isFull && !isSelected ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  title={isLocked ? reason : char.name}
                >
                  {/* Parchment background scroll image - no border */}
                  <img 
                    src="/static/img/personagem_pergaminho.webp" 
                    alt="Pergaminho Personagem" 
                    className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none filter drop-shadow-md"
                    onError={(e) => {
                      e.currentTarget.src = '/static/img/ui/pergaminho.webp';
                    }}
                  />

                  {/* Content inside scroll bounds */}
                  <div className="relative z-10 w-full h-full flex flex-col items-center justify-between pt-1.5 sm:pt-2 pb-1.5 px-1 sm:px-1.5">
                    {/* Character Portrait */}
                    <div className="relative w-[92%] sm:w-[94%] aspect-square rounded-md overflow-hidden bg-amber-950/20 flex-shrink-0 shadow-sm mt-0.5">
                      <MangekyoLoader
                        src={char.portrait}
                        alt={char.name}
                        className="w-full h-full"
                        imgClassName={`transition-transform duration-300 ${isLocked ? 'grayscale opacity-50' : 'group-hover:scale-105'}`}
                        iconScale={0.45}
                      />

                      {/* Active Selected Badge */}
                      {isSelected && (
                        <div className="absolute inset-0 bg-amber-600/35 border-2 border-amber-600 flex items-center justify-center rounded-md">
                          <div className="bg-amber-600 text-amber-950 text-[8px] font-mono font-black uppercase px-1 py-0.5 rounded shadow-md">
                            EQUIPE
                          </div>
                        </div>
                      )}

                      {/* Locked Badge */}
                      {isLocked && (
                        <div className="absolute inset-0 bg-slate-950/45 flex items-center justify-center rounded-md">
                          <img
                            src="/static/img/icon/selo.svg"
                            alt="Bloqueado"
                            className="selo-lock-anim w-3/5 h-3/5 object-contain"
                          />
                        </div>
                      )}
                    </div>

                    {/* Character Name and Village */}
                    <div className="w-full text-center px-1 py-0.5 min-h-[32px] flex flex-col justify-center">
                      <h4 className={`ninja-name-tag font-black font-mono tracking-tight text-xs sm:text-[13px] leading-tight truncate uppercase ${isLocked ? 'text-red-950 font-bold' : isSelected ? 'text-amber-900 font-extrabold' : 'text-amber-950'}`}>
                        {char.name}
                      </h4>
                      <p className="ninja-village-tag text-[9px] sm:text-[10px] font-mono font-bold text-amber-900/90 truncate mt-0.5">
                        {isLocked ? 'Bloqueado' : villageTag}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Pagination Controls - Embedded inside public/static/img/paginação.webp pergaminho */}
          <div className="relative w-full rounded-xl overflow-hidden flex items-center mt-4 group">
            {/* Background Parchment for Pagination */}
            <img 
              src="/static/img/paginação.webp" 
              alt="Paginação Pergaminho" 
              className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none filter drop-shadow-md"
              onError={(e) => {
                e.currentTarget.src = '/static/img/pergaminho_skills.webp';
              }}
            />

            {/* Pagination Controls Content */}
            <div className="relative z-10 w-full flex items-center justify-center gap-3 sm:gap-6 px-6 sm:px-10 py-3">
              <button
                onClick={() => {
                  playClickSound();
                  setCurrentPage(prev => Math.max(prev - 1, 1));
                }}
                disabled={activePage <= 1}
                className={`px-3 py-1.5 rounded-lg border flex items-center gap-1 transition-all cursor-pointer text-xs font-mono font-bold ${
                  activePage <= 1
                    ? 'border-amber-900/20 bg-amber-950/10 text-amber-900/40 cursor-not-allowed'
                    : 'border-amber-800 bg-amber-900/60 hover:bg-amber-800 text-amber-100 shadow'
                }`}
                title="Página Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Anterior</span>
              </button>

              <div className="flex items-center gap-2">
             

                <div className="flex items-center gap-1.5">
                  {(() => {
                    const total = Math.max(totalPages, 1);
                    const maxButtons = 5;
                    let startPage = Math.max(1, activePage - Math.floor(maxButtons / 2));
                    let endPage = Math.min(total, startPage + maxButtons - 1);
                    if (endPage - startPage + 1 < maxButtons) {
                      startPage = Math.max(1, endPage - maxButtons + 1);
                    }
                    
                    const buttons = [];
                    for (let i = startPage; i <= endPage; i++) {
                      buttons.push(i);
                    }
                    
                    return buttons.map(pageNum => {
                      const isActive = activePage === pageNum;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => {
                            playClickSound();
                            setCurrentPage(pageNum);
                          }}
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-xs font-mono font-bold flex items-center justify-center transition-all cursor-pointer border ${
                            isActive
                              ? 'bg-amber-800 border-amber-700 text-amber-50 shadow-md font-black scale-105'
                              : 'bg-amber-950/15 border-amber-900/20 text-amber-950 hover:bg-amber-950/30'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>

              <button
                onClick={() => {
                  playClickSound();
                  setCurrentPage(prev => Math.min(prev + 1, totalPages));
                }}
                disabled={activePage >= totalPages || totalPages <= 1}
                className={`px-3 py-1.5 rounded-lg border flex items-center gap-1 transition-all cursor-pointer text-xs font-mono font-bold ${
                  activePage >= totalPages || totalPages <= 1
                    ? 'border-amber-900/20 bg-amber-950/10 text-amber-900/40 cursor-not-allowed'
                    : 'border-amber-800 bg-amber-900/60 hover:bg-amber-800 text-amber-100 shadow'
                }`}
                title="Próxima Página"
              >
                <span className="hidden sm:inline">Próxima</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Detailed Inspection sidebar (Right Side) */}
        <div className="lg:col-span-6 sticky top-28 space-y-6 z-10">
          {/* Main Pergaminho Character Details Card */}
          <div className="relative p-7 sm:p-10 md:p-12 flex flex-col justify-between group">
            {/* Pergaminho Personagem Detalhes background asset */}
            <img 
              src="/static/img/pergaminho_personagem_detalhes.webp" 
              alt="Pergaminho Personagem Detalhes" 
              className="pergaminho_personagem_detalhes absolute inset-0 w-full h-full object-fill z-0 pointer-events-none filter drop-shadow-2xl"
              onError={(e) => {
                e.currentTarget.src = '/static/img/personagem_pergaminho.webp';
              }}
            />

            <div className="relative z-10 space-y-6 px-3 sm:px-6 py-2">
              {/* Header Portrait + Description */}
              <div className="flex gap-4 items-center p-2.5">
                <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-amber-900/60 bg-amber-950/20 flex-shrink-0 shadow-md">
                  <MangekyoLoader
                    src={
                      (equippedSkins[previewCharacter.id] && previewCharacter.skins?.find(s => s.id === equippedSkins[previewCharacter.id])?.image) ||
                      previewCharacter.portrait
                    }
                    alt={previewCharacter.name}
                    className="w-full h-full"
                    iconScale={0.5}
                  />
                </div>

                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xl font-black tracking-tight text-amber-950 uppercase font-mono drop-shadow-sm">{previewCharacter.name}</h3>
                    <button
                      onClick={() => {
                        playClickSound();
                        setShowSkinsTab(prev => !prev);
                      }}
                      className={`px-3 py-1 rounded-lg font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-md font-mono ${
                        showSkinsTab
                          ? 'bg-amber-600 text-amber-950 ring-2 ring-amber-500 scale-105 font-black'
                          : 'bg-gradient-to-r from-amber-700 to-amber-600 text-amber-950 hover:brightness-110 font-black'
                      }`}
                      title="Galeria de Skins"
                    >
                      <Shirt className="w-3.5 h-3.5 stroke-[2.5]" />
                      SKINS
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {previewCharacter.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[9px] font-mono font-bold px-2 py-0.5 bg-amber-950/15 border border-amber-900/30 text-amber-950 rounded-md shadow-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {showSkinsTab ? (
                <div className="bg-amber-950/10 border border-amber-900/30 rounded-xl p-4 space-y-3 shadow-inner">
                  <div className="flex justify-between items-center border-b border-amber-900/20 pb-2">
                    <span className="text-xs font-mono font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                      <Shirt className="w-4 h-4 text-amber-800" />
                      GALERIA DE SKINS
                    </span>
                    <span className="text-[10px] text-amber-900/90 font-mono font-semibold">
                      Clique para equipar
                    </span>
                  </div>

                  <div className="flex gap-4 overflow-x-auto pb-2 pt-2 items-center justify-center min-h-[160px] max-h-[220px] bg-amber-950/10 rounded-xl border border-amber-900/20 p-3">
                    {(() => {
                      const skinsList = (previewCharacter.skins && previewCharacter.skins.length > 0)
                        ? previewCharacter.skins 
                        : [
                            { id: 'default', name: 'Padrão', image: previewCharacter.portrait }
                          ];
                      
                      return skinsList.map((skin) => {
                        const isEquipped = (equippedSkins[previewCharacter.id] || skinsList[0]?.id) === skin.id;

                        return (
                          <div
                            key={skin.id}
                            onClick={() => {
                              playClickSound();
                              setEquippedSkins(prev => ({
                                ...prev,
                                [previewCharacter.id]: skin.id
                              }));
                            }}
                            className={`relative group flex-shrink-0 w-32 h-44 rounded-xl border-2 overflow-hidden flex flex-col items-center justify-between p-2 cursor-pointer transition-all ${
                              isEquipped
                                ? 'border-amber-700 ring-2 ring-amber-600/50 shadow-xl bg-amber-500/20 scale-102'
                                : 'border-amber-900/30 hover:border-amber-700 bg-amber-950/10 hover:bg-amber-950/20'
                            }`}
                          >
                            {isEquipped && (
                              <div className="absolute top-1.5 right-1.5 bg-amber-600 text-amber-950 text-[8px] font-black font-mono px-1.5 py-0.5 rounded shadow z-10 uppercase tracking-wider">
                                EQUIPADA
                              </div>
                            )}

                            <div className="w-full h-32 flex items-center justify-center overflow-hidden p-1">
                              <img
                                src={skin.image || null}
                                alt={skin.name}
                                referrerPolicy="no-referrer"
                                className="max-h-full max-w-full object-contain filter drop-shadow-[0_4px_10px_rgba(0,0,0,0.85)] transition-transform group-hover:scale-105"
                                onError={(e) => {
                                  const img = e.currentTarget; img.onerror = null; img.src = previewCharacter.portrait;
                                }}
                              />
                            </div>

                            <span className="text-[10px] font-bold text-amber-950 truncate w-full text-center font-mono uppercase tracking-tight">
                              {skin.name}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              ) : (
                <p className="text-amber-950 text-xs leading-relaxed font-medium p-1">
                  {translateGameText(previewCharacter.description, language)}
                </p>
              )}

              {/* Section HABILIDADES - Individual Parchment Scrolls per Skill */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs font-mono font-bold uppercase tracking-wider text-amber-950 px-1">
                  <span className="flex items-center gap-1.5 text-amber-950 font-black">
                    <Sparkles className="w-3.5 h-3.5 text-amber-800" /> {t("HABILIDADES", "SKILLS")}
                  </span>
                  {previewCharacter.skills.length > 3 && (
                    <span className="text-[11px] text-amber-900/90 font-bold">
                      {t("PÁG.", "PAGE")} {previewSkillsPage + 1} {t("DE", "OF")} {Math.ceil(previewCharacter.skills.length / 3)}
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {(() => {
                    const skillsPerPage = 3;
                    const paginated = previewCharacter.skills.slice(previewSkillsPage * skillsPerPage, (previewSkillsPage + 1) * skillsPerPage);
                    return paginated.map((skill, sIdx) => {
                      const skillKey = `${previewCharacter.id}_${sIdx}_${skill.name}`;
                      const isExpanded = !!expandedSkills[skillKey];
                      const maxLen = 75;
                      const translatedDesc = translateGameText(skill.desc, language);
                      const translatedSkillName = translateSkillName(skill.name, language);
                      const isLongText = stripRichMarkup(translatedDesc).length > maxLen;
                      const plainDesc = stripRichMarkup(translatedDesc);
                      const displayDesc = (isLongText && !isExpanded) ? `${plainDesc.slice(0, maxLen)}...` : translatedDesc;

                      return (
                        <div
                          key={sIdx}
                          className="relative w-full rounded-xl overflow-hidden min-h-[100px] flex items-center transition-transform hover:scale-[1.01] group"
                        >
                          {/* Background Pergaminho Scroll Asset for each skill */}
                          <img 
                            src="/static/img/pergaminho_skills.webp" 
                            alt="Pergaminho Skill" 
                            className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none filter drop-shadow"
                            onError={(e) => {
                              e.currentTarget.src = '/static/img/ui/pergaminho.webp';
                            }}
                          />

                          {/* Content sit on top of parchment paper area inside wooden handles */}
                          <div className="relative z-10 w-full flex items-center gap-2 sm:gap-2.5 px-6 sm:px-8 py-2.5">
                            {/* Larger Skill Icon */}
                            <div className="w-14 h-14 sm:w-[60px] sm:h-[60px] rounded-lg overflow-hidden border-2 border-amber-900/60 bg-amber-950/40 flex-shrink-0 shadow-md">
                              <img 
                                src={skill.icon || null} 
                                alt={translatedSkillName} 
                                className="w-full h-full object-cover" 
                                onError={(e) => {
                                  const img = e.currentTarget;
                                  img.onerror = null;
                                  img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                                }}
                              />
                            </div>

                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className="flex justify-between items-start gap-1.5">
                                <div className="inline-block max-w-full">
                                  <span 
                                    className="font-extrabold text-xs sm:text-sm text-amber-950 font-sans tracking-tight truncate drop-shadow-sm block"
                                  >
                                    {translatedSkillName}
                                  </span>
                                </div>
                                <div className="flex-shrink-0 bg-amber-950/10 px-1 py-0.5 rounded border border-amber-900/20">
                                  {renderChakraCosts(skill.cost)}
                                </div>
                              </div>
                              
                              <p className="text-[10px] sm:text-[11px] text-stone-900 font-medium leading-snug">
                                {isLongText && !isExpanded ? displayDesc : <RichText text={displayDesc} />}{' '}
                                {isLongText && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedSkills(prev => ({
                                        ...prev,
                                        [skillKey]: !prev[skillKey]
                                      }));
                                    }}
                                    className="text-amber-950 font-black hover:underline cursor-pointer text-[9px] sm:text-[10px] uppercase font-mono tracking-wider ml-1 px-1 py-0.2 bg-amber-900/15 rounded border border-amber-900/20 inline-block"
                                  >
                                    {isExpanded ? t('Ver menos', 'See less') : t('Ver mais', 'See more')}
                                  </button>
                                )}
                              </p>
                              
                              <div className="flex items-center gap-3 pt-0.5 text-[9px] font-mono font-bold text-amber-900/90">
                                {skill.cooldown > 0 && (
                                  <span>{t('Recarga', 'Cooldown')}: {skill.cooldown} {t('turnos', 'turns')}</span>
                                )}
                                <span className="truncate">
                                  {t('Alvo', 'Target')}: {' '}
                                  {translateTargetType(skill.targetType, language)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Skills list pagination controls */}
                {previewCharacter.skills.length > 3 && (() => {
                  const totalPages = Math.ceil(previewCharacter.skills.length / 3);
                  return (
                    <div className="flex items-center justify-between bg-amber-950/10 p-2 rounded-xl border border-amber-900/20 mt-2">
                      <button
                        onClick={() => {
                          playClickSound();
                          setPreviewSkillsPage(prev => Math.max(prev - 1, 0));
                        }}
                        disabled={previewSkillsPage === 0}
                        className={`p-1.5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                          previewSkillsPage === 0
                            ? 'border-amber-900/10 bg-amber-950/5 text-amber-900/30 cursor-not-allowed'
                            : 'border-amber-900/30 bg-amber-950/15 hover:bg-amber-950/25 text-amber-950 font-bold'
                        }`}
                        title="Habilidades Anteriores"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex gap-1.5">
                        {Array.from({ length: totalPages }).map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              playClickSound();
                              setPreviewSkillsPage(idx);
                            }}
                            className={`w-6 h-6 rounded-md text-[10px] font-mono font-bold flex items-center justify-center transition-all cursor-pointer border ${
                              idx === previewSkillsPage
                                ? 'bg-amber-700 border-amber-800 text-amber-50 shadow-md font-black'
                                : 'bg-amber-950/10 border-amber-900/20 text-amber-950 hover:bg-amber-950/20'
                            }`}
                          >
                            {idx + 1}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => {
                          playClickSound();
                          setPreviewSkillsPage(prev => Math.min(prev + 1, totalPages - 1));
                        }}
                        disabled={previewSkillsPage === totalPages - 1}
                        className={`p-1.5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                          previewSkillsPage === totalPages - 1
                            ? 'border-amber-900/10 bg-amber-950/5 text-amber-900/30 cursor-not-allowed'
                            : 'border-amber-900/30 bg-amber-950/15 hover:bg-amber-950/25 text-amber-950 font-bold'
                        }`}
                        title="Próximas Habilidades"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Matchmaking Overlay */}
      <AnimatePresence>
        {isMatchmaking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 select-none"
          >
            {/* Ambient Red glow background */}
            <div className="absolute top-[25%] left-[25%] w-[50%] h-[50%] rounded-full bg-orange-600/10 blur-[150px] pointer-events-none" />

            <div className="max-w-md w-full text-center space-y-8 z-10">
              {/* Spinning Logo / Matchmaking Status indicator */}
              <div className="relative w-28 h-28 mx-auto">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                  className="absolute inset-0 rounded-full border-4 border-t-orange-500 border-r-transparent border-b-amber-500 border-l-transparent"
                />
                <div className="absolute inset-2 bg-slate-900 rounded-full flex items-center justify-center border border-slate-800">
                  <Swords className="w-10 h-10 text-orange-500 animate-pulse" />
                </div>
              </div>

              {/* Status Header */}
              <div className="space-y-2">
                <h3 className="text-2xl font-black tracking-tight text-white uppercase">
                  {matchmakingStatus === 'error' ? 'Erro no Matchmaking' : matchmakingStatus === 'matched' ? 'Oponente Encontrado!' : 'Procurando Oponente...'}
                </h3>
                {matchmakingStatus === 'error' ? (
                  <p className="text-xs font-mono text-red-400">
                    Não foi possível encontrar um oponente. Tente novamente.
                  </p>
                ) : matchmakingStatus === 'searching' ? (
                  <p className="text-xs font-mono text-slate-400">
                    Tempo de espera: <span className="text-orange-400 font-bold">{matchmakingTime}s</span>
                  </p>
                ) : (
                  <p className="text-sm font-mono text-emerald-400 font-black tracking-wide animate-pulse">
                    INICIANDO COMBATE EM {countdown}s...
                  </p>
                )}
              </div>

              {/* Matchmaking Lobby Display (Players comparison) */}
              <div className="grid grid-cols-5 items-center gap-2 bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80 shadow-2xl">
                {/* Current Player Profile Card */}
                <div className="col-span-2 text-center space-y-2">
                  <div className="w-16 h-16 mx-auto rounded-xl border-2 border-orange-500 overflow-hidden bg-slate-950">
                    <img src={user.photoUrl || null} alt={user.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="text-xs font-black truncate text-orange-400 uppercase font-mono">{user.name}</div>
                  <div className="text-[9px] font-mono text-slate-500">SEU TIME</div>
                </div>

                {/* VS Badge */}
                <div className="col-span-1 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center font-black text-xs text-orange-500 font-mono shadow-md">
                    VS
                  </div>
                </div>

                {/* Opponent Profile Card */}
                <div className="col-span-2 text-center space-y-2">
                  <div className="w-16 h-16 mx-auto rounded-xl border-2 border-dashed border-slate-700 overflow-hidden bg-slate-950 flex items-center justify-center">
                    {opponent ? (
                      <img src={opponent.photoUrl || null} alt={opponent.name} className="w-full h-full object-cover scale-x-[-1]" />
                    ) : (
                      <img src="/static/img/icon/star.svg" alt="Loading" className="w-6 h-6 animate-spin object-contain" />
                    )}
                  </div>
                  <div className="text-xs font-black truncate text-slate-300 uppercase font-mono">
                    {opponent ? opponent.name : 'PROCURANDO...'}
                  </div>
                  <div className="text-[9px] font-mono text-slate-500">OPONENTE</div>
                </div>
              </div>

              {/* Game Tips Scroll */}
              <div className="bg-slate-900/30 border border-slate-900 p-4 rounded-xl text-center min-h-[70px] flex items-center justify-center">
                <p className="text-xs text-slate-400 italic font-medium leading-relaxed">
                  {lobbyTip}
                </p>
              </div>

              {/* Action Buttons */}
              {(matchmakingStatus === 'searching' || matchmakingStatus === 'error') && (
                <button
                  onClick={handleCancelMatchmaking}
                  className={`w-full rounded-lg py-2.5 text-xs font-bold font-mono tracking-wider uppercase transition-all active:scale-95 cursor-pointer ${
                    matchmakingStatus === 'error'
                      ? 'bg-red-900/50 hover:bg-red-800/60 text-red-300 border border-red-800'
                      : 'bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800'
                  }`}
                >
                  {matchmakingStatus === 'error' ? 'Voltar' : 'Cancelar Matchmaking'}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 🧊 Sandbox: Modal de Pausar Geração de Chakra */}
      <AnimatePresence>
        {showSandboxChakraModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setShowSandboxChakraModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-slate-950 border border-cyan-800/50 rounded-2xl shadow-2xl p-6 space-y-4"
            >
              <div className="text-center space-y-2">
                <div className="text-4xl">🧊</div>
                <h3 className="text-lg font-black text-cyan-300 font-display uppercase tracking-wide">
                  {t('Pausar Geração de Chakra?', 'Pause Chakra Generation?')}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t(
                    'Modo exclusivo do Sandbox. Se ativado: você e o Jogador 2 começam com 10 chakras variados cada, e passar o turno NÃO gera novos chakras. O gasto e a remoção de chakra continuam funcionando normalmente.',
                    'Sandbox-only mode. If enabled: you and Player 2 each start with 10 varied chakras, and passing the turn does NOT generate new chakra. Chakra spending and removal still work normally.'
                  )}
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => finalizeSandboxMatch(true)}
                  className="w-full rounded-lg py-3 text-sm font-bold font-mono tracking-wider uppercase transition-all active:scale-95 cursor-pointer bg-gradient-to-r from-cyan-700 to-cyan-900 hover:from-cyan-600 hover:to-cyan-800 text-cyan-50 border border-cyan-600/60"
                >
                  🧊 {t('Sim, pausar (10 chakras cada)', 'Yes, pause (10 chakras each)')}
                </button>
                <button
                  onClick={() => finalizeSandboxMatch(false)}
                  className="w-full rounded-lg py-3 text-sm font-bold font-mono tracking-wider uppercase transition-all active:scale-95 cursor-pointer bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
                >
                  {t('Não, geração normal', 'No, normal generation')}
                </button>
                <button
                  onClick={() => setShowSandboxChakraModal(false)}
                  className="w-full rounded-lg py-2 text-[11px] font-mono text-slate-500 hover:text-slate-300 transition-all cursor-pointer"
                >
                  {t('Cancelar', 'Cancel')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
