/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Shield, ChevronLeft, ChevronRight, Swords, RefreshCw, Sparkles, Search, Filter, Loader2, AlertTriangle } from 'lucide-react';
import { Character, ChakraType, UserProfile } from '../types';
import { getCharacters, fetchCharactersFromServer } from '../lib/characterStorage';
import { motion, AnimatePresence } from 'motion/react';

interface CharacterSelectProps {
  onConfirmTeams: (
    playerTeam: Character[],
    enemyTeam: Character[],
    online?: { isOnline: boolean; roomId: string; playerIndex: number; opponentProfile: UserProfile },
    sandbox?: boolean
  ) => void;
  playClickSound: () => void;
  playScrollSound: () => void;
  user: UserProfile;
}

export default function CharacterSelect({ onConfirmTeams, playClickSound, playScrollSound, user }: CharacterSelectProps) {
  const [charList, setCharList] = useState<Character[]>(() => getCharacters());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sandboxPlayerTeam, setSandboxPlayerTeam] = useState<Character[] | null>(null);
  const [previewCharacter, setPreviewCharacter] = useState<Character>(() => charList[0] || null);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewSkillsPage, setPreviewSkillsPage] = useState(0);

  // Sync with server on mount
  useEffect(() => {
    let active = true;
    fetchCharactersFromServer().then(updated => {
      if (!active) return;
      if (updated && updated.length > 0) {
        setCharList(updated);
        // Set preview character if current preview isn't in list or as default
        setPreviewCharacter(prev => {
          if (prev && updated.some(c => c.id === prev.id)) return prev;
          return updated[0];
        });
      }
    });
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

  const ITEMS_PER_PAGE = 20;
  const totalPages = Math.ceil(filteredCharacters.length / ITEMS_PER_PAGE);
  const activePage = Math.min(currentPage, Math.max(totalPages, 1));
  const startIndex = (activePage - 1) * ITEMS_PER_PAGE;
  const paginatedCharacters = filteredCharacters.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleSelectCharacter = (character: Character) => {
    playClickSound();
    if (selectedIds.includes(character.id)) {
      setSelectedIds(selectedIds.filter(id => id !== character.id));
    } else {
      if (selectedIds.length < 3) {
        setSelectedIds([...selectedIds, character.id]);
        setPreviewCharacter(character);
        setPreviewSkillsPage(0);
      }
    }
  };

  const handleHoverCharacter = (character: Character) => {
    if (previewCharacter.id !== character.id) {
      playScrollSound();
      setPreviewCharacter(character);
      setPreviewSkillsPage(0);
    }
  };

  const handleConfirm = () => {
    if (selectedIds.length !== 3) return;
    playClickSound();

    const playerTeam = charList.filter(c => selectedIds.includes(c.id));
    
    // Select 3 random unique characters for the enemy team
    const remaining = charList.filter(c => !selectedIds.includes(c.id));
    const shuffled = [...remaining].sort(() => 0.5 - Math.random());
    const enemyTeam = shuffled.slice(0, 3);

    onConfirmTeams(playerTeam, enemyTeam);
  };

  const handleStartSandboxPhase = () => {
    if (selectedIds.length !== 3) return;
    playClickSound();
    const playerTeam = charList.filter(c => selectedIds.includes(c.id));
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
    const enemyTeam = charList.filter(c => selectedIds.includes(c.id));
    onConfirmTeams(sandboxPlayerTeam, enemyTeam, undefined, true);
  };

  // Handle Online Matchmaking Flow
  const handleStartMatchmaking = async () => {
    if (selectedIds.length !== 3) return;
    playClickSound();

    const playerTeam = charList.filter(c => selectedIds.includes(c.id));

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

      const joinData = await joinRes.json();

      if (joinData.status === 'matched') {
        handleMatchFound(joinData.roomId, joinData.playerIndex, joinData.opponent, playerTeam);
      } else {
        // Start polling for matchmaking status
        matchmakingPollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/matchmaking/status?username=${encodeURIComponent(user.username)}`);
            const statusData = await statusRes.json();

            if (statusData.status === 'matched') {
              handleMatchFound(statusData.roomId, statusData.playerIndex, statusData.opponent, playerTeam);
            }
          } catch (err) {
            console.error('Error polling matchmaking status:', err);
          }
        }, 1500);
      }

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
          if (cost === 'Tai') bgClass = 'bg-red-600 border border-red-400';
          else if (cost === 'Nin') bgClass = 'bg-blue-600 border border-blue-400';
          else if (cost === 'Gen') bgClass = 'bg-emerald-600 border border-emerald-400';
          else if (cost === 'Blood') bgClass = 'bg-purple-600 border border-purple-400';
          else if (cost === 'Rand') bgClass = 'bg-slate-500 border border-slate-400';

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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative selection:bg-orange-600 selection:text-white">
      {/* Visual background accents */}
      <div className="absolute top-[10%] right-[10%] w-[40%] h-[40%] rounded-full bg-orange-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[15%] left-[5%] w-[40%] h-[40%] rounded-full bg-blue-600/5 blur-[120px] pointer-events-none" />

      {/* Draft Status Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-20 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <span className="text-xs font-mono text-orange-400 font-semibold tracking-wider uppercase">
              {sandboxPlayerTeam ? "Fase 02: Oponente Sandbox" : "Fase 01: Escolha dos Shinobis"}
            </span>
            <h2 className="text-2xl font-bold tracking-tight">
              {sandboxPlayerTeam ? "ESCOLHA O ESQUADRÃO ADVERSÁRIO" : "ESCOLHA SEU ESQUADRÃO"}
            </h2>
          </div>

          {/* Player Selection Status Indicator */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              {[0, 1, 2].map(idx => {
                const charId = selectedIds[idx];
                const char = charList.find(c => c.id === charId);

                return (
                  <div
                    key={idx}
                    className={`w-14 h-14 rounded-lg border-2 overflow-hidden flex items-center justify-center transition-all ${
                      char ? 'border-orange-500 bg-slate-900 shadow-md shadow-orange-600/10' : 'border-dashed border-slate-800 bg-slate-950'
                    }`}
                  >
                    {char ? (
                      <img 
                        src={char.portrait} 
                        alt={char.name} 
                        className="w-full h-full object-cover" 
                        onError={(e) => {
                          const img = e.currentTarget;
                          img.onerror = null;
                          img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg';
                        }}
                      />
                    ) : (
                      <span className="text-slate-700 text-xs font-semibold font-mono">Slot</span>
                    )}
                  </div>
                );
              })}
            </div>

            {sandboxPlayerTeam ? (
              <>
                <button
                  onClick={handleBackToPlayerSelect}
                  className="px-4 py-3 rounded-lg font-bold flex items-center gap-1.5 tracking-wide text-xs uppercase cursor-pointer border select-none active:scale-95 transition-all bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 shadow-lg"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Voltar (Time A)
                </button>

                <button
                  onClick={handleConfirmSandboxMatch}
                  disabled={selectedIds.length !== 3}
                  className={`px-5 py-3 rounded-lg font-bold flex items-center gap-2 tracking-wide text-xs uppercase cursor-pointer border select-none active:scale-95 transition-all ${
                    selectedIds.length === 3
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:brightness-110 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-600/10'
                      : 'bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed font-medium'
                  }`}
                >
                  <Swords className="w-4 h-4 animate-pulse" />
                  Iniciar Sandbox
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleConfirm}
                  disabled={selectedIds.length !== 3}
                  className={`px-4 py-3 rounded-lg font-bold flex items-center gap-1.5 tracking-wide text-xs uppercase cursor-pointer border select-none active:scale-95 transition-all ${
                    selectedIds.length === 3
                      ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 shadow-lg'
                      : 'bg-slate-950 text-slate-600 border-slate-900 cursor-not-allowed font-medium'
                  }`}
                >
                  <Swords className="w-4 h-4" />
                  Treino (I.A.)
                </button>

                <button
                  onClick={handleStartSandboxPhase}
                  disabled={selectedIds.length !== 3}
                  className={`px-4 py-3 rounded-lg font-bold flex items-center gap-1.5 tracking-wide text-xs uppercase cursor-pointer border select-none active:scale-95 transition-all ${
                    selectedIds.length === 3
                      ? 'bg-gradient-to-r from-orange-600 to-amber-500 hover:brightness-110 text-slate-950 border-orange-400 shadow-lg shadow-orange-600/10'
                      : 'bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed font-medium'
                  }`}
                >
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Eu vs Eu Mesmo (Sandbox)
                </button>

                <button
                  onClick={handleStartMatchmaking}
                  disabled={selectedIds.length !== 3}
                  className={`px-5 py-3 rounded-lg font-bold flex items-center gap-2 tracking-wide text-xs uppercase cursor-pointer border select-none active:scale-95 transition-all ${
                    selectedIds.length === 3
                      ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 shadow-lg'
                      : 'bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed font-medium'
                  }`}
                >
                  <Sparkles className="w-4 h-4 animate-pulse" />
                  Partida Rápida (Online)
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Draft Area */}
      <main className="max-w-7xl w-full mx-auto px-6 py-8 grid lg:grid-cols-12 gap-8 flex-1 items-start">
        {/* Roster Grid (Left Side) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 font-bold">
                Shinobis Disponíveis ({filteredCharacters.length})
              </h3>
              <span className="text-xs bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-full text-slate-400 flex items-center gap-1 font-mono">
                <Sparkles className="w-3.5 h-3.5 text-orange-400" /> Escolha exatamente 3
              </span>
            </div>

            {/* Filter and Search Bar */}
            <div className="grid sm:grid-cols-2 gap-3 bg-slate-900/30 p-3 rounded-xl border border-slate-900">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Buscar ninja pelo nome..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-orange-500 transition-all font-sans"
                />
              </div>

              {/* Tag Selection */}
              <div className="relative">
                <Filter className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <select
                  value={selectedTag}
                  onChange={(e) => handleTagChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-orange-500 transition-all font-sans text-slate-300 appearance-none cursor-pointer"
                >
                  {FILTER_TAGS.map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-3 pointer-events-none border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-500 w-0 h-0" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {paginatedCharacters.map(char => {
              const isSelected = selectedIds.includes(char.id);
              const isFull = selectedIds.length >= 3 && !isSelected;

              return (
                <motion.div
                  key={char.id}
                  whileHover={{ scale: isFull ? 1 : 1.02 }}
                  onClick={() => !isFull && handleSelectCharacter(char)}
                  onMouseEnter={() => handleHoverCharacter(char)}
                  className={`group relative rounded-xl border p-2.5 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-orange-950/20 border-orange-500 shadow-md shadow-orange-600/10'
                      : isFull
                      ? 'border-slate-900 bg-slate-950/40 opacity-40 cursor-not-allowed'
                      : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-slate-950 mb-2 border border-slate-800">
                    <img
                      src={char.portrait}
                      alt={char.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        const img = e.currentTarget;
                        img.onerror = null;
                        img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg';
                      }}
                    />

                    {/* Active Selected Badge */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-orange-600/15 border-2 border-orange-500 flex items-center justify-center rounded-lg">
                        <div className="bg-orange-500 text-slate-950 text-[8px] font-mono font-black uppercase px-1 py-0.5 rounded shadow-md">
                          EQUIPE
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    <h4 className={`font-bold tracking-tight text-xs truncate ${isSelected ? 'text-orange-400' : 'text-slate-100'}`}>
                      {char.name}
                    </h4>
                    <p className="text-[9px] font-mono text-slate-500 truncate">
                      {char.tags[0]}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-slate-900/40 border border-slate-800/80 p-2.5 rounded-xl mt-4">
              <button
                onClick={() => {
                  playClickSound();
                  setCurrentPage(prev => Math.max(prev - 1, 1));
                }}
                disabled={activePage === 1}
                className={`p-1.5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                  activePage === 1
                    ? 'border-slate-800 bg-slate-950/40 text-slate-600 cursor-not-allowed'
                    : 'border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-300'
                }`}
                title="Página Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1.5">
                {(() => {
                  const maxButtons = 5;
                  let startPage = Math.max(1, activePage - Math.floor(maxButtons / 2));
                  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
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
                        className={`w-7 h-7 rounded-lg text-xs font-mono font-bold flex items-center justify-center transition-all cursor-pointer border ${
                          isActive
                            ? 'bg-orange-600 border-orange-500 text-slate-950 shadow-md shadow-orange-600/10'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  });
                })()}
              </div>

              <button
                onClick={() => {
                  playClickSound();
                  setCurrentPage(prev => Math.min(prev + 1, totalPages));
                }}
                disabled={activePage === totalPages}
                className={`p-1.5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                  activePage === totalPages
                    ? 'border-slate-800 bg-slate-950/40 text-slate-600 cursor-not-allowed'
                    : 'border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-300'
                }`}
                title="Próxima Página"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Detailed Inspection sidebar (Right Side) */}
        <div className="lg:col-span-5 sticky top-28">
          <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-6 space-y-6">
            {/* Header Portrait + Description */}
            <div className="flex gap-4">
              <div className="w-20 h-20 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex-shrink-0">
                <img
                  src={previewCharacter.portrait}
                  alt={previewCharacter.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const img = e.currentTarget;
                    img.onerror = null;
                    img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg';
                  }}
                />
              </div>

              <div className="space-y-1.5 flex-1">
                <h3 className="text-xl font-bold tracking-tight text-slate-100 uppercase">{previewCharacter.name}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {previewCharacter.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="text-[9px] font-mono font-medium px-2 py-0.5 bg-slate-950 border border-slate-800 text-slate-400 rounded-md"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-slate-400 text-xs leading-relaxed border-b border-slate-800/80 pb-4">
              {previewCharacter.description}
            </p>

            {/* Skills List */}
            <div className="space-y-4">
              <h4 className="text-xs font-mono uppercase tracking-wider text-slate-500 font-bold flex justify-between items-center">
                <span>Habilidades</span>
                {previewCharacter.skills.length > 3 && (
                  <span className="text-[10px] text-slate-400 font-normal">
                    Pág. {previewSkillsPage + 1} de {Math.ceil(previewCharacter.skills.length / 3)}
                  </span>
                )}
              </h4>
              
              <div className="space-y-3.5">
                {(() => {
                  const skillsPerPage = 3;
                  const paginated = previewCharacter.skills.slice(previewSkillsPage * skillsPerPage, (previewSkillsPage + 1) * skillsPerPage);
                  return paginated.map((skill, sIdx) => (
                    <div
                      key={sIdx}
                      className="flex gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800 hover:border-slate-700 transition-all"
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-800 bg-slate-900 flex-shrink-0">
                        <img 
                          src={skill.icon} 
                          alt={skill.name} 
                          className="w-full h-full object-cover" 
                          onError={(e) => {
                            const img = e.currentTarget;
                            img.onerror = null;
                            img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                          }}
                        />
                      </div>

                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-start gap-2">
                          <span className="font-semibold text-xs text-slate-200">{skill.name}</span>
                          {renderChakraCosts(skill.cost)}
                        </div>
                        <p className="text-[10px] text-slate-400 leading-normal">{skill.desc}</p>
                        <div className="flex items-center gap-3 pt-0.5 text-[9px] font-mono text-slate-500">
                          {skill.cooldown > 0 && (
                            <span>Recarga: {skill.cooldown} turnos</span>
                          )}
                          <span>
                            Alvo: {' '}
                            {skill.targetType === 'Enemy' && 'Inimigo Único'}
                            {skill.targetType === 'Self' && 'Próprio'}
                            {skill.targetType === 'Ally' && 'Aliado Único'}
                            {skill.targetType === 'AllEnemies' && 'Todos os Inimigos'}
                            {skill.targetType === 'AllAllies' && 'Todos os Aliados'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Skills list pagination buttons */}
              {previewCharacter.skills.length > 3 && (() => {
                const totalPages = Math.ceil(previewCharacter.skills.length / 3);
                return (
                  <div className="flex items-center justify-between bg-slate-950/40 p-2 rounded-xl border border-slate-800 mt-3">
                    <button
                      onClick={() => {
                        playClickSound();
                        setPreviewSkillsPage(prev => Math.max(prev - 1, 0));
                      }}
                      disabled={previewSkillsPage === 0}
                      className={`p-1.5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                        previewSkillsPage === 0
                          ? 'border-slate-800 bg-slate-950/40 text-slate-600 cursor-not-allowed'
                          : 'border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-300'
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
                          className={`w-5 h-5 rounded-md text-[10px] font-mono font-bold flex items-center justify-center transition-all cursor-pointer border ${
                            idx === previewSkillsPage
                              ? 'bg-orange-600 border-orange-500 text-slate-950 shadow-md'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'
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
                          ? 'border-slate-800 bg-slate-950/40 text-slate-600 cursor-not-allowed'
                          : 'border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-300'
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
                  {matchmakingStatus === 'searching' ? 'Procurando Oponente...' : 'Oponente Encontrado!'}
                </h3>
                {matchmakingStatus === 'searching' ? (
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
                    <img src={user.photoUrl} alt={user.name} className="w-full h-full object-cover" />
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
                      <img src={opponent.photoUrl} alt={opponent.name} className="w-full h-full object-cover" />
                    ) : (
                      <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
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
              {matchmakingStatus === 'searching' && (
                <button
                  onClick={handleCancelMatchmaking}
                  className="w-full bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 rounded-lg py-2.5 text-xs font-bold font-mono tracking-wider uppercase transition-all active:scale-95 cursor-pointer"
                >
                  Cancelar Matchmaking
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
