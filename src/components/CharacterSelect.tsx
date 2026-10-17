/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Shield, ChevronLeft, ChevronRight, ArrowLeft, Swords, RefreshCw, Sparkles, Search, Filter, Star, AlertTriangle, Shirt, Lock, X, Eye } from 'lucide-react';
import { Character, ChakraType, UserProfile, Quest, Skill } from '../types';
import { getCharacters, fetchCharactersFromServer } from '../lib/characterStorage';
import {
  DEFAULT_AI_ENEMY_CHARACTER_LIMIT,
  fetchAiMatchSettings,
} from '../lib/aiMatchSettings';
import { safeFetchJson } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage, translateGameText, translateSkillName, translateTargetType } from '../lib/i18n';
import { playGlobalSound } from '../lib/soundUtils';
import { matchFetch } from '../lib/matchFetch';
import { getCharacterLockReason, isCharacterUnlocked } from '../lib/characterUnlocks';
import MangekyoLoader from './MangekyoLoader';
import SkinMedia from './SkinMedia';

const MATCHMAKING_TIMEOUT_MS = 90_000;

interface CharacterSelectProps {
  onConfirmTeams: (
    playerTeam: Character[],
    enemyTeam: Character[],
    online?: { isOnline: boolean; roomId: string; playerIndex: number; seed: number; opponentProfile: UserProfile },
    sandbox?: boolean,
    sandboxPauseChakraGen?: boolean
  ) => void;
  playClickSound: () => void;
  playScrollSound: () => void;
  playUahSound: () => void;
  playTargetSound: () => void;
  onProcessingChange: (processing: boolean) => void;
  user: UserProfile;
  activeQuest?: Quest | null;
  onBack?: () => void;
}

export default function CharacterSelect({ onConfirmTeams, playClickSound, playScrollSound, playUahSound, playTargetSound, onProcessingChange, user, activeQuest, onBack }: CharacterSelectProps) {
  const { t, language } = useLanguage();
  const [charList, setCharList] = useState<Character[]>(() => getCharacters());
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalogError, setCatalogError] = useState('');
  const [catalogProgress, setCatalogProgress] = useState<number | null>(null);
  const [catalogReloadKey, setCatalogReloadKey] = useState(0);
  const [aiEnemyCharacterLimit, setAiEnemyCharacterLimit] = useState(DEFAULT_AI_ENEMY_CHARACTER_LIMIT);
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
  const pendingCharacterClickRef = useRef<{ id: string; at: number } | null>(null);
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
  const [isMobilePortrait, setIsMobilePortrait] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(orientation: portrait) and (max-width: 500px)').matches
  );
  const [showCharacterDetails, setShowCharacterDetails] = useState(false);
  const [showCharacterFilters, setShowCharacterFilters] = useState(false);
  const [favoriteCharacterIds, setFavoriteCharacterIds] = useState<string[]>(() => {
    try {
      const savedFavorites = localStorage.getItem('naruto_favorite_characters');
      const parsedFavorites: unknown = savedFavorites ? JSON.parse(savedFavorites) : [];
      return Array.isArray(parsedFavorites)
        ? parsedFavorites.filter((id): id is string => typeof id === 'string')
        : [];
    } catch (error) {
      console.error('Failed to load favorite characters:', error);
      return [];
    }
  });
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [previewSkillsPage, setPreviewSkillsPage] = useState(0);
  const skillEffectSwipeStartRef = useRef<number | null>(null);
  const characterPageSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressCharacterClickRef = useRef(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(orientation: portrait) and (max-width: 500px)');
    const update = () => setIsMobilePortrait(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!showCharacterDetails) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        playScrollSound();
        setShowCharacterDetails(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showCharacterDetails, playScrollSound]);

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

  // Sync with server on mount
  useEffect(() => {
    let active = true;
    setCatalogProgress(null);
    fetchCharactersFromServer({
      required: true,
      onProgress: progress => {
        if (active) setCatalogProgress(progress);
      },
    }).then(updated => {
      if (!active) return;
      if (updated && updated.length > 0) {
        setCharList(updated);
        setCatalogStatus('ready');
        setCatalogError('');
        // Set preview character if current preview isn't in list or as default
        setPreviewCharacter(prev => {
          if (prev) {
            const found = updated.find(c => c.id === prev.id);
            if (found) return found;
          }
          return updated[0];
        });
      }
    }).catch(error => {
      if (!active) return;
      console.error('Failed to load the authoritative character catalog:', error);
      setCatalogError(error instanceof Error ? error.message : 'Não foi possível carregar os personagens oficiais.');
      setCatalogStatus('error');
    });
    return () => { active = false; };
  }, [catalogReloadKey]);

  // Matchmaking State
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  useEffect(() => {
    onProcessingChange(isMatchmaking);
    return () => onProcessingChange(false);
  }, [isMatchmaking, onProcessingChange]);
  const [matchmakingTime, setMatchmakingTime] = useState(0);
  const [matchmakingStatus, setMatchmakingStatus] = useState<'searching' | 'matched' | 'error'>('searching');
  const [matchmakingError, setMatchmakingError] = useState('');
  const [opponent, setOpponent] = useState<UserProfile | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [lobbyTip, setLobbyTip] = useState('Dica: Acumule chakra de linhagem (Blood) para liberar jutsus supremos.');

  const matchmakingPollRef = useRef<any | null>(null);
  const timeIntervalRef = useRef<any | null>(null);
  const matchmakingTimeoutRef = useRef<any | null>(null);
  const countdownIntervalRef = useRef<any | null>(null);
  const matchmakingAttemptActiveRef = useRef(false);
  const matchmakingLogoRef = useRef<HTMLImageElement | null>(null);
  const matchmakingStopAnimationRef = useRef<Animation | null>(null);

  useEffect(() => {
    const logo = matchmakingLogoRef.current;
    if (!logo) return;

    if (matchmakingStatus === 'searching') {
      matchmakingStopAnimationRef.current?.cancel();
      matchmakingStopAnimationRef.current = null;
      return;
    }

    const startTransform = window.getComputedStyle(logo).transform;
    const matrix = new DOMMatrixReadOnly(startTransform === 'none' ? undefined : startTransform);
    const currentAngle = (Math.atan2(matrix.b, matrix.a) * 180 / Math.PI + 360) % 360;

    matchmakingStopAnimationRef.current?.cancel();
    matchmakingStopAnimationRef.current = logo.animate(
      [
        { transform: startTransform },
        { transform: `rotate(${currentAngle + 360}deg)` },
      ],
      {
        duration: 1200,
        easing: 'cubic-bezier(0.12, 0.72, 0.2, 1)',
        fill: 'forwards',
      },
    );
  }, [matchmakingStatus]);

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
  const [skillEffectPages, setSkillEffectPages] = useState<Record<string, number>>({});
  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const handleTagChange = (val: string) => {
    setSelectedTag(val);
    setCurrentPage(1);
  };

  const toggleFavoriteCharacter = () => {
    if (!previewCharacter) return;
    const nextFavorites = favoriteCharacterIds.includes(previewCharacter.id)
      ? favoriteCharacterIds.filter(id => id !== previewCharacter.id)
      : [...favoriteCharacterIds, previewCharacter.id];
    try {
      localStorage.setItem('naruto_favorite_characters', JSON.stringify(nextFavorites));
      setFavoriteCharacterIds(nextFavorites);
      setCurrentPage(1);
    } catch (error) {
      console.error('Failed to save favorite characters:', error);
    }
  };

  // Tag list for filtering
  const FILTER_TAGS = ['Todos', 'Clássico', 'Shippuden', 'Reencarnado', 'Akatsuki', 'Vila da Folha', 'Vila da Areia', 'Vila da Névoa', 'Vila da Nuvem', 'Vila da Pedra'];

  // Apply search and tag filters
  const filteredCharacters = charList.filter(char => {
    const matchesSearch = char.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          char.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTag = selectedTag === 'Todos' || char.tags.includes(selectedTag);
    const matchesFavorites = !showFavoritesOnly || favoriteCharacterIds.includes(char.id);
    return matchesSearch && matchesTag && matchesFavorites;
  });

  const ITEMS_PER_PAGE = isMobilePortrait ? 20 : 18;
  const totalPages = Math.ceil(filteredCharacters.length / ITEMS_PER_PAGE);
  const activePage = Math.min(currentPage, Math.max(totalPages, 1));
  const startIndex = (activePage - 1) * ITEMS_PER_PAGE;
  const paginatedCharacters = filteredCharacters.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleSelectCharacter = (character: Character) => {
    playClickSound();

    // Always update preview character details on click
    setPreviewCharacter(character);
    setPreviewSkillsPage(0);

    const isLocked = !isCharacterUnlocked(character, user, questsList);
    const reason = getCharacterLockReason(character, user, questsList);
    if (isLocked) {
      setLockedNotice(reason || 'Este personagem está bloqueado!');
      setTimeout(() => setLockedNotice(null), 3500);
      return;
    }

    if (selectedIds.includes(character.id)) {
      pendingCharacterClickRef.current = null;
      setSelectedIds(selectedIds.filter(id => id !== character.id));
    } else {
      if (selectedIds.length < 3) {
        const now = Date.now();
        const pending = pendingCharacterClickRef.current;
        if (pending?.id === character.id && now - pending.at <= 500) {
          pendingCharacterClickRef.current = null;
          setSelectedIds([...selectedIds, character.id]);
          playUahSound();
          playTargetSound();
        } else {
          pendingCharacterClickRef.current = { id: character.id, at: now };
        }
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
    playUahSound();

    const rawPlayerTeam = charList.filter(c => selectedIds.includes(c.id));
    const playerTeam = attachSkinsToTeam(rawPlayerTeam);

    const remaining = charList
      .slice(0, aiEnemyCharacterLimit)
      .filter(character => !selectedIds.includes(character.id));
    if (remaining.length < 3) {
      setLockedNotice(t(
        `O limite atual permite apenas ${remaining.length} personagem(ns) disponível(is) para o time da IA. Aumente o limite no painel de controle ou escolha outros personagens.`,
        `The current limit leaves only ${remaining.length} character(s) available for the AI team. Increase the limit in the developer dashboard or choose different characters.`,
      ));
      setTimeout(() => setLockedNotice(null), 5000);
      return;
    }
    for (let index = remaining.length - 1; index > 0; index--) {
      const otherIndex = Math.floor(Math.random() * (index + 1));
      [remaining[index], remaining[otherIndex]] = [remaining[otherIndex], remaining[index]];
    }
    const enemyTeam = attachSkinsToTeam(remaining.slice(0, 3));

    onConfirmTeams(playerTeam, enemyTeam);
  };

  const handleStartSandboxPhase = () => {
    if (selectedIds.length !== 3) return;
    playUahSound();
    const rawPlayerTeam = charList.filter(c => selectedIds.includes(c.id));
    const playerTeam = attachSkinsToTeam(rawPlayerTeam);
    setSandboxPlayerTeam(playerTeam);
    setSelectedIds([]); // clear for enemy team selection
  };

  const handleBackToPlayerSelect = () => {
    if (sandboxPlayerTeam) {
      setSelectedIds(sandboxPlayerTeam.map(c => c.id));
      setSandboxPlayerTeam(null);
    }
  };

  const handleConfirmSandboxMatch = () => {
    if (selectedIds.length !== 3 || !sandboxPlayerTeam) return;
    playUahSound();
    // Abre o modal perguntando sobre pausar a geração de chakra (só em sandbox)
    setShowSandboxChakraModal(true);
    playScrollSound();
  };

  const finalizeSandboxMatch = (pauseChakraGen: boolean) => {
    if (selectedIds.length !== 3 || !sandboxPlayerTeam) return;
    playUahSound();
    const rawEnemyTeam = charList.filter(c => selectedIds.includes(c.id));
    const enemyTeam = attachSkinsToTeam(rawEnemyTeam);
    setShowSandboxChakraModal(false);
    onConfirmTeams(sandboxPlayerTeam, enemyTeam, undefined, true, pauseChakraGen);
  };

  // Handle Online Matchmaking Flow
  const handleStartMatchmaking = async () => {
    if (selectedIds.length !== 3) return;
    playUahSound();

    const playerTeam = attachSkinsToTeam(charList.filter(c => selectedIds.includes(c.id)));

    setIsMatchmaking(true);
    setMatchmakingStatus('searching');
    setMatchmakingError('');
    setMatchmakingTime(0);
    setCountdown(5);
    setOpponent(null);
    matchmakingAttemptActiveRef.current = true;

    // Increment searching timer
    timeIntervalRef.current = setInterval(() => {
      setMatchmakingTime(prev => prev + 1);
    }, 1000);
    matchmakingTimeoutRef.current = setTimeout(() => {
      if (!matchmakingAttemptActiveRef.current) return;
      matchmakingAttemptActiveRef.current = false;
      if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
      if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
      setMatchmakingTime(90);
      setMatchmakingError('Não encontramos uma partida em 90 segundos. Tente novamente.');
      setMatchmakingStatus('error');
      matchFetch('/api/matchmaking/quit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username })
      }).catch(err => console.error('Error leaving matchmaking queue after timeout:', err));
    }, MATCHMAKING_TIMEOUT_MS);

    try {
      // Join matchmaking queue
      const joinRes = await matchFetch('/api/matchmaking/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          name: user.name,
          photoUrl: user.photoUrl,
          profile: user,
          team: playerTeam,
          activeQuestId: activeQuest?.id
        })
      });

      if (!matchmakingAttemptActiveRef.current) return;
      if (!joinRes.ok) {
        const errData = await joinRes.json().catch(() => ({}));
        if (!matchmakingAttemptActiveRef.current) return;
        matchmakingAttemptActiveRef.current = false;
        if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
        if (matchmakingTimeoutRef.current) clearTimeout(matchmakingTimeoutRef.current);
        console.error('Join queue error:', errData);
        setMatchmakingError(typeof errData.error === 'string' ? errData.error : 'Não foi possível encontrar um oponente. Tente novamente.');
        setMatchmakingStatus('error');
        return;
      }

      const joinData = await joinRes.json();
      if (!matchmakingAttemptActiveRef.current) return;

      if (joinData.status === 'matched') {
        handleMatchFound(joinData.roomId, joinData.myIndex, joinData.seed, joinData.opponent, playerTeam);
        return;
      }

      if (joinData.status !== 'searching') {
        matchmakingAttemptActiveRef.current = false;
        if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
        if (matchmakingTimeoutRef.current) clearTimeout(matchmakingTimeoutRef.current);
        console.error('Unexpected join response:', joinData);
        setMatchmakingStatus('error');
        return;
      }

      // Start polling for matchmaking status
      const pollInterval = 3000;
      let pollCount = 0;
      matchmakingPollRef.current = setInterval(async () => {
        if (!matchmakingAttemptActiveRef.current) return;
        try {
          pollCount++;
          const statusRes = await matchFetch(`/api/matchmaking/status?username=${encodeURIComponent(user.username)}`);
          if (!matchmakingAttemptActiveRef.current || !statusRes.ok) return;
          const statusData = await statusRes.json();
          if (!matchmakingAttemptActiveRef.current) return;

          if (statusData.status === 'matched') {
            handleMatchFound(statusData.roomId, statusData.myIndex, statusData.seed, statusData.opponent, playerTeam);
          } else if (statusData.status === 'idle' && pollCount > 3) {
            // Re-join queue if we got idle (might have been cleaned up)
            matchFetch('/api/matchmaking/join', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: user.username,
                name: user.name,
                photoUrl: user.photoUrl,
                profile: user,
                team: playerTeam,
                activeQuestId: activeQuest?.id
              })
            }).catch(() => {});
          }
        } catch (err) {
          console.error('Error polling matchmaking status:', err);
        }
      }, pollInterval);

    } catch (err) {
      if (!matchmakingAttemptActiveRef.current) return;
      matchmakingAttemptActiveRef.current = false;
      if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
      if (matchmakingTimeoutRef.current) clearTimeout(matchmakingTimeoutRef.current);
      console.error('Error joining matchmaking queue:', err);
      setMatchmakingStatus('error');
    }
  };

  const handleMatchFound = (roomId: string, myIndex: number, seed: number, opponentData: any, playerTeam: Character[]) => {
    // Prevent double-trigger (both the join response and a poll tick can fire)
    if (!matchmakingAttemptActiveRef.current) return;
    matchmakingAttemptActiveRef.current = false;

    // Clear queue timers
    if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
    if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
    if (matchmakingTimeoutRef.current) clearTimeout(matchmakingTimeoutRef.current);

    setMatchmakingStatus('matched');
    setOpponent(opponentData);

    playGlobalSound('sharingan', 0.55);

    // Start 5 second countdown before starting battle
    let currentCountdown = 5;
    setCountdown(currentCountdown);
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
          playerIndex: myIndex,
          seed,
          opponentProfile: (opponentData.profile || {
            username: opponentData.username,
            name: opponentData.name,
            photoUrl: opponentData.photoUrl
          }) as UserProfile
        });
      }
    }, 1000);
  };

  const handleCancelMatchmaking = async () => {
    playClickSound();
    matchmakingAttemptActiveRef.current = false;
    
    // Clear all interval timers
    if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
    if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
    if (matchmakingTimeoutRef.current) clearTimeout(matchmakingTimeoutRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    setIsMatchmaking(false);

    try {
      await matchFetch('/api/matchmaking/quit', {
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
      matchmakingAttemptActiveRef.current = false;
      if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
      if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
      if (matchmakingTimeoutRef.current) clearTimeout(matchmakingTimeoutRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchAiMatchSettings()
      .then(settings => {
        if (active) setAiEnemyCharacterLimit(settings.maxEnemyCharacterNumber);
      })
      .catch(error => {
        console.error('Failed to load AI match settings; using the default character limit.', error);
      });
    return () => { active = false; };
  }, []);

  const renderChakraCosts = (costs: ChakraType[]) => {
    return (
      <div className="flex items-center gap-1">
        {costs.map((cost, idx) => {
          // Mesma estilização (gradiente radial + brilho) usada na batalha
          let bg = '';
          let glow = '';
          let border = '';
          if (cost === 'Tai') {
            bg = 'radial-gradient(circle at 35% 30%, #bbf7d0, #22c55e 45%, #14532d)';
            glow = '0 0 5px rgba(34,197,94,0.95), 0 0 12px rgba(34,197,94,0.55)';
            border = 'border-green-300/80';
          } else if (cost === 'Nin') {
            bg = 'radial-gradient(circle at 35% 30%, #bfdbfe, #2563eb 45%, #1e3a8a)';
            glow = '0 0 5px rgba(37,99,235,0.95), 0 0 12px rgba(37,99,235,0.55)';
            border = 'border-blue-300/80';
          } else if (cost === 'Gen') {
            bg = 'radial-gradient(circle at 35% 30%, #ffffff, #e2e8f0 55%, #94a3b8)';
            glow = '0 0 5px rgba(255,255,255,0.95), 0 0 12px rgba(255,255,255,0.5)';
            border = 'border-white/80';
          } else if (cost === 'Blood') {
            bg = 'radial-gradient(circle at 35% 30%, #fecaca, #dc2626 45%, #7f1d1d)';
            glow = '0 0 5px rgba(220,38,38,0.95), 0 0 12px rgba(220,38,38,0.55)';
            border = 'border-red-300/80';
          } else {
            bg = 'radial-gradient(circle at 35% 30%, #cbd5e1, #475569 50%, #1e293b)';
            glow = '0 0 5px rgba(100,116,139,0.75), 0 0 12px rgba(100,116,139,0.35)';
            border = 'border-slate-400/80';
          }

          return (
            <span
              key={idx}
              className={`w-3.5 h-3.5 rounded-full border ${border} flex items-center justify-center shrink-0`}
              style={{ background: bg, boxShadow: glow }}
              title={`${cost} Chakra`}
            />
          );
        })}
      </div>
    );
  };

  const getSkillAttributeTargetLabel = (target: string) => target === 'Self'
    ? t('Conjurador (Mim)', 'Caster (Me)')
    : target === 'Target'
      ? t('Alvo Principal', 'Main Target')
      : translateTargetType(target, language);

  const getSkillAttributeEffects = (skill: Skill) => {
    const effects: { label: string; value: string; target?: string }[] = [];
    const duration = (turns?: number) => {
      const value = turns || 1;
      if (value >= 99999) return '∞';
      return `${value} ${value === 1 ? t('turno', 'turn') : t('turnos', 'turns')}`;
    };
    const addEffect = (label: string, value: string, target?: string) => effects.push({ label, value, target });

    if (skill.damage && skill.damage > 0) addEffect(t('Dano', 'Damage'), `${skill.damage} ${t('de dano', 'damage')}`, skill.damageTarget || 'Target');
    if (skill.directDamage && skill.directDamage > 0) addEffect(t('Dano Direto', 'Direct Damage'), `${skill.directDamage} ${t('de dano direto', 'direct damage')}`, skill.directDamageTarget || 'Target');
    if (skill.heal && skill.heal > 0) {
      const healing = skill.healDuration && skill.healDuration > 1
        ? `${skill.heal} ${t('de cura por turno durante', 'healing per turn for')} ${duration(skill.healDuration)}`
        : `${skill.heal} ${t('de cura', 'healing')}`;
      addEffect(t(skill.healDuration && skill.healDuration > 1 ? 'Cura Contínua' : 'Cura', skill.healDuration && skill.healDuration > 1 ? 'Healing over Time' : 'Heal'), healing, skill.healTarget || 'Target');
    }
    if (skill.afflictionInstant && skill.afflictionInstant > 0) {
      addEffect(
        t('Aflição Instantânea', 'Instant Affliction'),
        t(`Sofre ${skill.afflictionInstant} de dano de aflição ao usar`, `Takes ${skill.afflictionInstant} affliction damage when used`),
        skill.afflictionTarget || (skill.targetType === 'Self' ? 'Self' : 'Target'),
      );
    }
    if ((skill.immortalDuration || 0) > 0 || (skill.immortalHpThreshold || 0) > 0) {
      const condition = skill.immortalHpThreshold && skill.immortalHpThreshold > 0
        ? t(`quando tiver ${skill.immortalHpThreshold} ou menos de vida`, `when at ${skill.immortalHpThreshold} HP or less`)
        : t('ao usar a habilidade', 'when the skill is used');
      addEffect(
        t('Imortalidade', 'Immortality'),
        t(`Fica imortal por ${duration(skill.immortalDuration)} ${condition}`, `Becomes immortal for ${duration(skill.immortalDuration)} ${condition}`),
        skill.shieldTarget || 'Self',
      );
    }
    const cleanseTypeLabels: Record<string, string> = {
      affliction: t('Aflição', 'Affliction'),
      dot: t('Queimadura', 'Burn'),
      bleeding: t('Sangramento', 'Bleeding'),
      stun: t('Atordoamento', 'Stun'),
      damage_debuff: t('Redução de dano causado', 'Damage debuff'),
      damage_vulnerability: t('Vulnerabilidade', 'Vulnerability'),
      cannot_be_invulnerable: t('Incapaz de ficar invulnerável', 'Cannot become invulnerable'),
      cannot_receive_friendly: t('Bloqueio de efeitos amigáveis', 'Friendly effects blocked'),
      damage_buff: t('Aumento de dano', 'Damage boost'),
      damage_reduction: t('Redução de dano recebido', 'Damage reduction'),
      shield: t('Escudo', 'Shield'),
      invulnerable: t('Invulnerabilidade', 'Invulnerability'),
      invisible: t('Invisibilidade', 'Invisibility'),
      heal_over_time: t('Cura por turno', 'Healing over time'),
      counter_attack: t('Contra-ataque', 'Counterattack'),
      reflect: t('Reflexão', 'Reflection'),
      retaliate_damage: t('Retaliação', 'Retaliation'),
      stack: t('Stacks', 'Stacks'),
      all_debuffs: t('todos os debuffs', 'all debuffs'),
      all_buffs: t('todos os buffs', 'all buffs'),
    };
    const formatCleanseTypes = (types: string[] | undefined, fallback: string) =>
      types?.length
        ? types.map(type => cleanseTypeLabels[type] || type).join(', ')
        : fallback;
    if (skill.cleanseDebuffs || (skill.cleanseDebuffTypes?.length || 0) > 0) {
      addEffect(
        t('Limpeza de Debuffs', 'Debuff Cleanse'),
        t(
          `Remove ${formatCleanseTypes(skill.cleanseDebuffTypes, 'todos os debuffs')} do alvo`,
          `Removes ${formatCleanseTypes(skill.cleanseDebuffTypes, 'all debuffs')} from the target`,
        ),
        skill.cleanseDebuffTarget || 'Target',
      );
    }
    if (skill.cleanseBuffs || (skill.cleanseBuffTypes?.length || 0) > 0) {
      addEffect(
        t('Limpeza de Buffs', 'Buff Cleanse'),
        t(
          `Remove ${formatCleanseTypes(skill.cleanseBuffTypes, 'todos os buffs')} do alvo`,
          `Removes ${formatCleanseTypes(skill.cleanseBuffTypes, 'all buffs')} from the target`,
        ),
        skill.cleanseBuffTarget || 'Target',
      );
    }
    if (skill.healRemoveType) {
      addEffect(
        t('Limpeza ao Curar', 'Cleanse on Heal'),
        t(
          `Remove ${cleanseTypeLabels[skill.healRemoveType] || skill.healRemoveType} do alvo curado`,
          `Removes ${cleanseTypeLabels[skill.healRemoveType] || skill.healRemoveType} from the healed target`,
        ),
        skill.healTarget || 'Target',
      );
    }
    if (skill.retaliateDamage && (skill.retaliateDamageVal || 0) > 0) {
      const retaliateDuration = skill.retaliateDamagePermanent
        ? t('permanentemente', 'permanently')
        : `${t('por', 'for')} ${duration(skill.retaliateDamageDuration)}`;
      const damageType = skill.retaliateDamageType === 'direct_damage' || skill.retaliateDamageType === 'piercing'
        ? t('dano direto', 'direct damage')
        : t('dano', 'damage');
      addEffect(
        t('Retaliação', 'Retaliation'),
        t(
          `Devolve ${skill.retaliateDamageVal} de ${damageType} a quem atacar ${retaliateDuration}${skill.stackable ? t(' (o efeito acumula por stack)', ' (stacks increase this effect)') : ''}`,
          `Deals ${skill.retaliateDamageVal} ${damageType} to attackers ${retaliateDuration}${skill.stackable ? ' (stacks increase this effect)' : ''}`,
        ),
        skill.retaliateDamageTarget || 'Self',
      );
    }
    if (skill.shieldVal && skill.shieldVal > 0) addEffect(t('Escudo', 'Shield'), `+${skill.shieldVal} ${t('de escudo por', 'shield for')} ${duration(skill.shieldDuration)}`, skill.shieldTarget || 'Self');
    if (skill.damageReductionVal && skill.damageReductionVal > 0) {
      addEffect(t('Redução de Dano', 'Damage Reduction'), `-${skill.damageReductionVal} ${t('de dano recebido por', 'damage received for')} ${duration(skill.damageReductionDuration)}`, skill.shieldTarget || 'Self');
    }
    if (skill.damageReductionPierceVal && skill.damageReductionPierceVal > 0) {
      addEffect(t('Redução de Dano Direto', 'Direct Damage Reduction'), `-${skill.damageReductionPierceVal} ${t('de dano recebido por', 'damage received for')} ${duration(skill.damageReductionPierceDuration)}`, skill.damageReductionPierceTarget || 'Self');
    }
    if (skill.damageBuffVal && skill.damageBuffVal > 0) addEffect(t('Aumento de Dano', 'Damage Boost'), `+${skill.damageBuffVal} ${t('de dano causado por', 'damage dealt for')} ${duration(skill.damageBuffDuration)}`, skill.damageBuffTarget || 'Self');
    if (skill.damageDebuffVal && skill.damageDebuffVal > 0) addEffect(t('Redução de Dano Causado', 'Damage Debuff'), `-${skill.damageDebuffVal} ${t('de dano causado por', 'damage dealt for')} ${duration(skill.damageDebuffDuration)}`, skill.damageDebuffTarget || 'Target');
    if (skill.damageVulnerabilityVal && skill.damageVulnerabilityVal > 0) addEffect(t('Vulnerabilidade', 'Vulnerability'), `+${skill.damageVulnerabilityVal} ${t('de dano recebido por', 'damage received for')} ${duration(skill.damageVulnerabilityDuration)}`, skill.damageVulnerabilityTarget || 'Target');
    if (skill.stunTurns && skill.stunTurns > 0) addEffect(t('Atordoamento', 'Stun'), `${t('Bloqueia habilidades por', 'Blocks skills for')} ${duration(skill.stunTurns)}`, skill.stunTarget || 'Target');
    if (skill.dotVal && skill.dotVal > 0) addEffect(t('Queimadura', 'Burn'), `${skill.dotVal} ${t('de dano por turno por', 'damage per turn for')} ${duration(skill.dotDuration)}`, skill.dotTarget || 'Target');
    if (skill.bleedingVal && skill.bleedingVal > 0) addEffect(t('Sangramento', 'Bleeding'), `${skill.bleedingVal} ${t('de dano por turno por', 'damage per turn for')} ${duration(skill.bleedingDuration)}`, skill.bleedingTarget || 'Target');
    if (skill.afflictionVal && skill.afflictionVal > 0) addEffect(t('Aflição', 'Affliction'), `${skill.afflictionVal} ${t('de dano por turno por', 'damage per turn for')} ${duration(skill.afflictionDuration)}`, skill.afflictionTarget || 'Target');
    if (skill.invulnerableDuration && skill.invulnerableDuration > 0) addEffect(t('Invulnerabilidade', 'Invulnerability'), `${t('Fica invulnerável por', 'Invulnerable for')} ${duration(skill.invulnerableDuration)}`, skill.invulnerableTarget || 'Self');
    if (skill.cannotReduceDamageDuration && skill.cannotReduceDamageDuration > 0) addEffect(t('Incapaz de Reduzir Dano', 'Cannot Reduce Damage'), `${t('Não pode reduzir dano por', 'Cannot reduce damage for')} ${duration(skill.cannotReduceDamageDuration)}`, skill.cannotReduceDamageTarget || 'Target');
    if (skill.cannotBeInvulnerableDuration && skill.cannotBeInvulnerableDuration > 0) addEffect(t('Incapaz de Ficar Invulnerável', 'Cannot Become Invulnerable'), `${t('Não pode ficar invulnerável por', 'Cannot become invulnerable for')} ${duration(skill.cannotBeInvulnerableDuration)}`, skill.cannotBeInvulnerableTarget || 'Target');
    if (skill.cannotReceiveFriendlyDuration && skill.cannotReceiveFriendlyDuration > 0) addEffect(t('Bloqueio de Efeitos Amigáveis', 'Friendly Effects Blocked'), `${t('Não recebe efeitos amigáveis por', 'Cannot receive friendly effects for')} ${duration(skill.cannotReceiveFriendlyDuration)}`, skill.cannotReceiveFriendlyTarget || 'Target');
    if (skill.negateFriendlyDuration && skill.negateFriendlyDuration > 0) addEffect(t('Anulação de Efeitos Amigáveis', 'Negate Friendly Effects'), `${t('Anula efeitos amigáveis por', 'Negates friendly effects for')} ${duration(skill.negateFriendlyDuration)}`, skill.negateFriendlyTarget || 'Target');
    if (skill.damageImmunityDuration && skill.damageImmunityDuration > 0) addEffect(t('Imunidade a Dano', 'Damage Immunity'), `${t('Imune a dano por', 'Immune to damage for')} ${duration(skill.damageImmunityDuration)}`, skill.damageImmunityTarget || 'Self');
    if (skill.gainChakra && skill.gainChakra > 0) addEffect(t('Ganhar Chakra', 'Gain Chakra'), `+${skill.gainChakra} ${t('chakra por', 'chakra for')} ${duration(skill.gainChakraDuration)}`, skill.gainChakraTarget || 'Self');
    if (skill.drainChakra && skill.drainChakra > 0) addEffect(t('Drenar Chakra', 'Drain Chakra'), `-${skill.drainChakra} ${t('chakra por', 'chakra for')} ${duration(skill.drainChakraDuration)}`, skill.drainChakraTarget || 'Target');
    if (skill.removeChakra && skill.removeChakra > 0) addEffect(t('Remover Chakra', 'Remove Chakra'), `-${skill.removeChakra} ${t('chakra por', 'chakra for')} ${duration(skill.removeChakraDuration)}`, skill.removeChakraTarget || 'Target');
    if (skill.stealChakra && skill.stealChakra > 0) addEffect(t('Roubar Chakra', 'Steal Chakra'), `${skill.stealChakra} ${t('chakra por', 'chakra for')} ${duration(skill.stealChakraDuration)}`, skill.stealChakraTarget || 'Target');
    if (skill.cooldownIncreaseAmount && skill.cooldownIncreaseAmount > 0) addEffect(t('Aumentar Recarga', 'Increase Cooldown'), `+${skill.cooldownIncreaseAmount} ${t('de recarga por', 'cooldown for')} ${duration(skill.cooldownIncreaseDuration)}`, skill.cooldownIncreaseTarget || 'Target');
    if (skill.reviveHp && skill.reviveHp > 0) addEffect(t('Ressurreição', 'Revive'), `${t('Ressuscita com', 'Revives with')} ${skill.reviveHp} ${t('de vida', 'health')}`, skill.shieldTarget || 'Self');
    if (skill.stackable && skill.stackType) {
      addEffect(
        t('Acúmulo de Stack', 'Stack Gain'),
        `${t('Adiciona +1 stack de', 'Adds +1 stack of')} [${skill.stackType}] ${t('por', 'for')} ${duration(skill.stackDuration)}`,
        skill.stackTarget || 'Self'
      );
    } else if (skill.stackType && skill.stackUseEffectRules?.length) {
      addEffect(
        t('Progressão de Combo', 'Combo Progression'),
        `${t('Contribui para o combo de stacks', 'Contributes to the stack combo')} [${skill.stackType}]`,
        skill.stackTarget || 'Self'
      );
    }
    skill.stackUseEffectRules?.forEach(rule => {
      const conditions = rule.onwards
        ? `${rule.requiredStacks}+`
        : `${rule.requiredStacks}`;
      const effects: string[] = [];
      if (rule.stun) effects.push(`${t('Atordoa por', 'Stuns for')} ${duration(rule.stunDuration)}`);
      if (rule.chakraRemove && rule.chakraRemove > 0) effects.push(`${t('remove', 'removes')} ${rule.chakraRemove} ${t('chakra(s)', 'chakra')}`);
      if (effects.length > 0) {
        addEffect(
          `${t('Combo por Stacks', 'Stack Combo')} (${conditions} ${t('stacks', 'stacks')})`,
          `${t('Ao usar com', 'When used with')} ${conditions} ${rule.stackType || skill.stackType || t('stacks', 'stacks')}: ${effects.join(' + ')}`,
          'Target'
        );
      }
    });
    skill.ignoreInvulnWhenActiveRules?.forEach(rule => {
      if (!rule.activeSkillName) return;
      addEffect(
        t('Ignora Invulnerabilidade', 'Ignore Invulnerability'),
        `${t('Ignora a invulnerabilidade quando', 'Ignores invulnerability while')} [${rule.activeSkillName}] ${rule.activeOn === 'self' ? t('estiver ativo em mim', 'is active on me') : t('estiver ativo no oponente', 'is active on the opponent')}`,
        'Target'
      );
    });
    skill.damageRules?.forEach(rule => {
      if (!rule.activeSkillName || rule.damageBoost <= 0) return;
      addEffect(
        `${t('Dano Condicional', 'Conditional Damage')} (${rule.activeSkillName})`,
        `+${rule.damageBoost} ${t('de dano quando', 'damage while')} [${rule.activeSkillName}] ${t('estiver ativo', 'is active')}`,
        skill.damageTarget || 'Target'
      );
    });
    if (
      (previewCharacter.id === 'young-kakashi' || previewCharacter.folder === 'young-kakashi') &&
      skill.name === 'Implanted Sharingan'
    ) {
      addEffect(
        t('Marca do Sharingan', 'Sharingan Mark'),
        t('Marca o inimigo por 2 turnos; os gatilhos abaixo ativam quando ele usa uma habilidade.', 'Marks the enemy for 2 turns; the triggers below activate when they use a skill.'),
        'Target'
      );
      addEffect(
        t('Cópia de Stun', 'Stun Copy'),
        t('Se o inimigo marcado usar uma habilidade que causa stun, as habilidades de Kakashi causam stun completo por 1 turno.', 'If the marked enemy uses a skill that stuns, Kakashi’s skills inflict full stun for 1 turn.'),
        'Self'
      );
      addEffect(
        t('Leitura de Dano', 'Damage Analysis'),
        t('Se o inimigo marcado usar uma habilidade que causa dano, Kakashi ganha +10 de dano por 1 turno.', 'If the marked enemy uses a damaging skill, Kakashi gains +10 damage for 1 turn.'),
        'Self'
      );
    }

    return effects;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative selection:bg-orange-600 selection:text-white overflow-x-hidden">
      {catalogStatus !== 'ready' && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-[#061b35]/90 p-4 backdrop-blur-sm">
          <div role="alert" aria-live="polite" className="w-full max-w-md overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br from-[#123f70] via-[#0a2a4d] to-[#071b33] p-6 text-center text-white shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
            {catalogStatus === 'loading' ? (
              <>
                <img
                  src="/static/img/icon/mangeky.svg"
                  alt=""
                  aria-hidden="true"
                  className="mx-auto h-10 w-10 animate-spin object-contain"
                  style={{
                    animationDuration: '900ms',
                    animationTimingFunction: 'linear',
                    filter: 'hue-rotate(155deg) saturate(1.35) brightness(1.2) drop-shadow(0 0 9px rgba(59, 130, 246, 0.8))',
                  }}
                />
                <h2 className="mt-4 text-lg font-black text-white">
                  {t('Carregando personagens', 'Loading characters')}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-blue-100">
                  {t('Aguarde enquanto confirmamos as configurações globais do jogo.', 'Please wait while we confirm the game-wide settings.')}
                </p>
                {catalogProgress !== null ? (
                  <div className="mt-5">
                    <div
                      className="mb-2 flex items-center justify-between text-xs font-bold text-orange-200"
                      role="status"
                      aria-live="polite"
                    >
                      <span>{t('Progresso do carregamento', 'Loading progress')}</span>
                      <span>{catalogProgress}%</span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full border border-white/25 bg-[#06172d]"
                      role="progressbar"
                      aria-label={t('Progresso do carregamento dos personagens', 'Character loading progress')}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={catalogProgress}
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-300 to-blue-600 shadow-[0_0_12px_rgba(59,130,246,0.45)] transition-[width] duration-150"
                        style={{ width: `${catalogProgress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-blue-200">
                    {t('Preparando o carregamento...', 'Preparing to load...')}
                  </p>
                )}
              </>
            ) : (
              <>
                <AlertTriangle className="mx-auto h-10 w-10 text-orange-300" />
                <h2 className="mt-4 text-lg font-black text-white">
                  {t('Não foi possível carregar os personagens oficiais', 'Could not load official characters')}
                </h2>
                <p className="mt-2 text-sm text-blue-100">
                  {catalogError || t('A seleção foi bloqueada para evitar usar habilidades desatualizadas.', 'Selection is blocked to prevent using outdated skills.')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCatalogStatus('loading');
                    setCatalogProgress(null);
                    setCatalogReloadKey(value => value + 1);
                  }}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-white/70 bg-gradient-to-r from-blue-700 to-orange-600 px-4 py-3 text-sm font-bold text-white hover:from-blue-600 hover:to-orange-500"
                >
                  <RefreshCw className="h-4 w-4" />
                  {t('Tentar novamente', 'Try again')}
                </button>
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="mt-3 block w-full rounded-xl border border-white/40 bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/20"
                  >
                    {t('Voltar', 'Go back')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {/* Background Image: choose team background */}
      <img 
        src="/static/img/bg/bg-battle.webp"
        alt="Background Choose Team" 
        className="fixed inset-0 w-full h-full object-cover z-0 pointer-events-none filter brightness-100"
      />
      {/* Visual background accents and subtle transparent overlay */}
      <div className="fixed inset-0 bg-transparent pointer-events-none z-0" />
      <div className="absolute top-[10%] right-[10%] w-[40%] h-[40%] rounded-full bg-orange-500/5 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[15%] left-[5%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none z-0" />
      <img
        src="/static/img/tronco.webp"
        alt=""
        aria-hidden="true"
        className="character-select-mobile-topbar-bg pointer-events-none"
      />

      {/* Draft Status Header in Parchment Scroll (Fixed at top, full width) */}
      <header className="fixed top-0 left-0 right-0 z-30 w-full shadow-2xl">
        <div className="character-select-topbar w-full relative overflow-hidden flex items-center border-b border-amber-950/40">
          {/* Topbar Parchment Background */}
          <img 
            src="/static/img/tronco.webp"
            alt="Topbar"
            className="mv-pergaminho-top-bar absolute inset-0 w-full h-full object-fill z-0 pointer-events-none filter drop-shadow-md"
            onError={(e) => {
              e.currentTarget.src = '/static/img/filtro_pergaminho.webp';
            }}
          />

          {/* Topbar Content */}
          <div className="top-items-battle relative z-10 w-full max-w-7xl mx-auto flex flex-col md:flex-row justify-center items-center gap-4 md:gap-10 px-4 sm:px-8 py-2.5">
            <div className="text-center md:text-left shrink-0">
        
              <h2 className="main-title-teams text-xl sm:text-2xl font-brush tracking-tight text-[#ece4cc] uppercase">
                {sandboxPlayerTeam ? t("ESCOLHA O ESQUADRÃO ADVERSÁRIO", "CHOOSE OPPONENT SQUAD") : t("ESCOLHA SEU ESQUADRÃO", "CHOOSE YOUR SQUAD")}
              </h2>
            </div>

            {/* Player Selection Status Indicator & Game Mode Buttons */}
            <div className="mv-personagens-btns flex flex-wrap items-center gap-3 sm:gap-5 justify-center">
              <div className="flex items-center gap-2">
                {[0, 1, 2].map(idx => {
                  const charId = selectedIds[idx];
                  const char = charList.find(c => c.id === charId);

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!char) return;
                        playClickSound();
                        pendingCharacterClickRef.current = null;
                        setSelectedIds(prev => prev.filter((_, slotIndex) => slotIndex !== idx));
                      }}
                      data-sound={char ? 'uah' : undefined}
                      title={char ? `${char.name} (${t("Clique para remover", "Click to remove")})` : `Slot ${idx + 1}`}
                      aria-label={char ? t(`Remover ${char.name} do time`, `Remove ${char.name} from team`) : `Slot ${idx + 1}`}
                      className={`group relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg border-2 overflow-hidden flex items-center justify-center transition-all ${
                        char
                          ? 'border-[#ece4cc] bg-amber-950/30 shadow-md ring-1 ring-[#ece4cc]/50 cursor-pointer hover:border-red-500 hover:ring-2 hover:ring-red-500/80 active:scale-95'
                          : 'border-dashed border-[#ece4cc]/50 bg-amber-950/10 cursor-default'
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
                        <span className="text-[#ece4cc]/60 text-[10px] sm:text-xs font-bold font-mono">Slot</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mv-footer-actions flex flex-wrap items-center gap-2 sm:gap-2.5">
                {sandboxPlayerTeam ? (
                  <>
                    {!isMobilePortrait && (
                      <button
                        onClick={handleBackToPlayerSelect}
                        data-sound="Click"
                        aria-label={t("Voltar para seleção do Time A", "Back to Team A selection")}
                        className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-700 bg-amber-900/80 text-amber-100 shadow-md shadow-black/20 transition-all hover:bg-amber-800 active:scale-95 cursor-pointer"
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </button>
                    )}

                    <button
                      onClick={handleConfirmSandboxMatch}
                      data-sound="uah"
                      disabled={selectedIds.length !== 3}
                      className={`px-4 py-2.5 rounded-lg font-black flex items-center gap-1.5 tracking-wide text-xs uppercase cursor-pointer border select-none active:scale-95 transition-all font-mono ${
                        selectedIds.length === 3
                          ? 'bg-gradient-to-r from-emerald-700 to-teal-600 hover:brightness-110 text-white border-emerald-500 shadow-lg shadow-black/25'
                          : 'bg-amber-950/20 text-amber-900/50 border-amber-900/30 cursor-not-allowed font-medium shadow-sm shadow-black/10'
                      }`}
                    >
                      <Swords className="w-4 h-4 animate-pulse" />
                      {t("Iniciar Sandbox", "Start Sandbox")}
                    </button>
                  </>
                ) : (
                  <>
                    {onBack && !isMobilePortrait && (
                      <button
                        onClick={() => {
                          onBack();
                        }}
                        data-sound="Click"
                        aria-label={t("Voltar", "Back")}
                        className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-700 bg-amber-900/80 text-amber-100 shadow-md shadow-black/20 transition-all hover:bg-amber-800 active:scale-95 cursor-pointer"
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </button>
                    )}

                    <button
                      onClick={handleConfirm}
                      data-sound="uah"
                      disabled={selectedIds.length !== 3}
                      className={`px-3.5 py-2.5 rounded-lg font-black flex items-center gap-1.5 tracking-wide text-xs uppercase cursor-pointer border select-none active:scale-95 transition-all font-mono ${
                        selectedIds.length === 3
                          ? 'bg-amber-900 hover:bg-amber-800 text-amber-100 border-amber-700 shadow-md shadow-black/20'
                          : 'bg-amber-950/20 text-amber-900/50 border-amber-900/30 cursor-not-allowed font-medium shadow-sm shadow-black/10'
                      }`}
                    >
                      <Swords className="w-4 h-4" />
                      {t("Lutar contra IA", "Fight vs AI")}
                    </button>

                    <button
                      onClick={handleStartSandboxPhase}
                      data-sound="uah"
                      disabled={selectedIds.length !== 3}
                      className={`mv-hide-sandbox px-3.5 py-2.5 rounded-lg font-black flex items-center gap-1.5 tracking-wide text-xs uppercase cursor-pointer border select-none active:scale-95 transition-all font-mono ${
                        selectedIds.length === 3
                          ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:brightness-110 text-amber-950 border-amber-500 shadow-md shadow-black/20'
                          : 'bg-amber-950/20 text-amber-900/50 border-amber-900/30 cursor-not-allowed font-medium shadow-sm shadow-black/10'
                      }`}
                    >
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      Sandbox
                    </button>

                    <div
                      className={`clip-diamond p-[2px] transition-all ${
                        selectedIds.length === 3
                          ? 'bg-amber-700 [filter:drop-shadow(0_4px_6px_rgba(0,0,0,0.2))_drop-shadow(0_2px_4px_rgba(0,0,0,0.2))]'
                          : 'bg-amber-900/30 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.1))]'
                      }`}
                    >
                      <button
                        onClick={handleStartMatchmaking}
                        data-sound="uah"
                        disabled={selectedIds.length !== 3}
                        className={`clip-diamond px-5 py-2 font-black flex items-center gap-2 tracking-wide text-xs uppercase cursor-pointer select-none active:scale-95 transition-all font-mono ${
                          selectedIds.length === 3
                            ? 'bg-amber-950 text-amber-100 hover:bg-amber-900'
                            : 'bg-amber-950/20 text-amber-900/50 cursor-not-allowed font-medium'
                        }`}
                      >
                        <img src="/static/img/icon/star.svg" alt="Shuriken" className="w-4 h-4 animate-spin object-contain" />
                        {t("Partida Rápida", "Quick Match")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Draft Area */}
      <main className={`character-select-main max-w-[1400px] w-full mx-auto px-0 pt-20 sm:pt-24 pb-6 grid lg:grid-cols-12 gap-6 flex-1 items-start scale-[0.95] sm:scale-[0.92] lg:scale-[0.90] xl:scale-[0.92] origin-top transition-transform ${showCharacterFilters ? 'character-select-filter-open' : 'character-select-filter-closed'}`}>
        {/* Roster Grid (Left Side) */}
        <div className="lg:col-span-6 space-y-6">
          <div className="mv-filtro flex flex-col gap-4">
       

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
              <div className="mv-filter-row mb-[5px] mt-[2px] relative z-10 w-full grid sm:grid-cols-2 gap-2.5 px-7 sm:px-10 py-3">
                {/* Search Input */}
                <div className="relative flex items-center">
                  <Search className="absolute left-3 w-4 h-4 text-amber-950/70" />
                  <input
                    type="text"
                    placeholder="Buscar ninja..."
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

          <div className="character-select-roster relative">
            {totalPages > 1 && (
              <button
                type="button"
                onClick={() => {
                  playScrollSound();
                  setCurrentPage(page => Math.max(1, page - 1));
                }}
                data-sound="Scroll"
                disabled={activePage <= 1}
                className="character-select-page-arrow character-select-page-arrow-left"
                aria-label={t('Página anterior de personagens', 'Previous character page')}
              >
                <ChevronLeft className="h-3 w-3" strokeWidth={1.5} />
              </button>
            )}
            <div
              className="character-select-grid grid grid-cols-3 sm:grid-cols-6 gap-2.5 sm:gap-3"
              style={{ touchAction: 'pan-y' }}
              onPointerDown={event => {
                characterPageSwipeStartRef.current = { x: event.clientX, y: event.clientY };
              }}
              onPointerUp={event => {
                const start = characterPageSwipeStartRef.current;
                characterPageSwipeStartRef.current = null;
                if (!start || totalPages <= 1) return;
                const deltaX = event.clientX - start.x;
                const deltaY = event.clientY - start.y;
                if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
                suppressCharacterClickRef.current = true;
                window.setTimeout(() => {
                  suppressCharacterClickRef.current = false;
                }, 500);
                playScrollSound();
                setCurrentPage(page => Math.max(1, Math.min(totalPages, page + (deltaX < 0 ? 1 : -1))));
              }}
              onPointerCancel={() => {
                characterPageSwipeStartRef.current = null;
              }}
              onClickCapture={event => {
                if (!suppressCharacterClickRef.current) return;
                suppressCharacterClickRef.current = false;
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              {paginatedCharacters.map(char => {
                const isSelected = selectedIds.includes(char.id);
                const isFull = selectedIds.length >= 3 && !isSelected;
                const isLocked = !isCharacterUnlocked(char, user, questsList);
                const reason = getCharacterLockReason(char, user, questsList);
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
                    <div className="character-select-card-info w-full text-center px-1 py-0.5 min-h-[32px] flex flex-col justify-center">
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
            {totalPages > 1 && (
              <button
                type="button"
                onClick={() => {
                  playScrollSound();
                  setCurrentPage(page => Math.min(totalPages, page + 1));
                }}
                data-sound="Scroll"
                disabled={activePage >= totalPages}
                className="character-select-page-arrow character-select-page-arrow-right"
                aria-label={t('Próxima página de personagens', 'Next character page')}
              >
                <ChevronRight className="h-3 w-3" strokeWidth={1.5} />
              </button>
            )}
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
                  playScrollSound();
                  setCurrentPage(prev => Math.max(prev - 1, 1));
                }}
                data-sound="Scroll"
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
                            playScrollSound();
                            setCurrentPage(pageNum);
                          }}
                          data-sound="Scroll"
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
                  playScrollSound();
                  setCurrentPage(prev => Math.min(prev + 1, totalPages));
                }}
                data-sound="Scroll"
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
        <div
          className={`character-select-details-panel lg:col-span-6 sticky top-28 space-y-6 z-10 ${
            isMobilePortrait ? (showCharacterDetails ? 'character-select-details-open' : 'character-select-details-hidden') : ''
          }`}
          role={isMobilePortrait && showCharacterDetails ? 'dialog' : undefined}
          aria-modal={isMobilePortrait && showCharacterDetails ? true : undefined}
          aria-label={isMobilePortrait && showCharacterDetails ? `${previewCharacter.name} - ${t('Detalhes do personagem', 'Character details')}` : undefined}
          onClick={event => {
            if (event.target === event.currentTarget) {
              playScrollSound();
              setShowCharacterDetails(false);
            }
          }}
        >
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

            <div className=" relative z-10 space-y-6 px-3 pt-[0px] pb-[10px]">
              {/* Header Portrait + Description */}
              <div className="mb-[0px] flex gap-4 items-center p-2.5">
                <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-amber-900/60 bg-amber-950/20 flex-shrink-0 shadow-md">
                  <MangekyoLoader
                    src={previewCharacter.portrait}
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
                        playScrollSound();
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
                        : [];

                      if (skinsList.length === 0) {
                        return (
                          <div className="flex flex-col items-center justify-center gap-2 text-amber-900/60 py-4">
                            <Shirt className="w-8 h-8 opacity-30" />
                            <span className="text-xs font-mono font-bold uppercase tracking-wider">Sem skins disponíveis</span>
                          </div>
                        );
                      }

                      return skinsList.map((skin) => {
                        const isEquipped = (equippedSkins[previewCharacter.id] || skinsList[0]?.id) === skin.id;

                        return (
                          <div
                            key={skin.id}
                            onClick={() => {
                              playUahSound();
                              setEquippedSkins(prev => ({
                                ...prev,
                                [previewCharacter.id]: skin.id
                              }));
                            }}
                            data-sound="uah"
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
                              <SkinMedia
                                src={skin.image}
                                alt={skin.name}
                                className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105"
                                autoPlay
                                onImageError={e => {
                                  e.currentTarget.onerror = null;
                                  e.currentTarget.src = previewCharacter.portrait;
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
                <p className="text-amber-950 text-xs leading-relaxed mb-[15px] font-medium p-1" >
                  {translateGameText(previewCharacter.description, language)}
                </p>
              )}

              {!showSkinsTab && (
              /* Section HABILIDADES - Individual Parchment Scrolls per Skill */
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs font-mono font-bold uppercase tracking-wider text-amber-950 px-1">
                  <span className="flex items-center gap-1.5 text-amber-950 font-black">
                    <svg
                      className="w-3.5 h-3.5 text-amber-800"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <path fillRule="evenodd" clipRule="evenodd" d="M7.7572 6.3431L11.9998 2.10046L16.2425 6.3431L11.9998 10.5857L7.7572 6.3431ZM10.5856 6.3431L11.9998 4.92889L13.4141 6.3431L11.9998 7.75732L10.5856 6.3431Z" fill="currentColor" />
                      <path fillRule="evenodd" clipRule="evenodd" d="M2.10046 11.9999L6.3431 7.75726L10.5857 11.9999L6.3431 16.2425L2.10046 11.9999ZM4.92889 11.9999L6.3431 10.5857L7.75732 11.9999L6.3431 13.4141L4.92889 11.9999Z" fill="currentColor" />
                      <path fillRule="evenodd" clipRule="evenodd" d="M13.4142 11.9999L17.6568 16.2425L21.8995 11.9999L17.6568 7.75726L13.4142 11.9999ZM17.6568 10.5857L16.2426 11.9999L17.6568 13.4141L19.071 11.9999L17.6568 10.5857Z" fill="currentColor" />
                      <path fillRule="evenodd" clipRule="evenodd" d="M7.7572 17.6569L11.9998 13.4142L16.2425 17.6569L11.9998 21.8995L7.7572 17.6569ZM10.5856 17.6569L11.9998 16.2427L13.4141 17.6569L11.9998 19.0711L10.5856 17.6569Z" fill="currentColor" />
                    </svg>
                    {t("HABILIDADES", "SKILLS")}
                  </span>
                  {previewCharacter.skills.length > 2 && (
                    <span className="text-[11px] text-amber-900/90 font-bold">
                      {t("PÁG.", "PAGE")} {previewSkillsPage + 1} {t("DE", "OF")} {Math.ceil(previewCharacter.skills.length / 2)}
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {(() => {
                    const skillsPerPage = 2;
                    const paginated = previewCharacter.skills.slice(previewSkillsPage * skillsPerPage, (previewSkillsPage + 1) * skillsPerPage);
                    return paginated.map((skill, sIdx) => {
                      const skillEffects = getSkillAttributeEffects(skill);
                      const translatedSkillName = translateSkillName(skill.name, language);
                      const skillEffectPageSize = 2;
                      const effectPageCount = Math.max(1, Math.ceil(skillEffects.length / skillEffectPageSize));
                      const skillEffectKey = `${previewCharacter.id}:${skill.name}`;
                      const effectPage = Math.min(skillEffectPages[skillEffectKey] || 0, effectPageCount - 1);
                      const visibleEffects = skillEffects.slice(effectPage * skillEffectPageSize, (effectPage + 1) * skillEffectPageSize);
                      const setEffectPage = (page: number) => {
                        setSkillEffectPages(previous => ({ ...previous, [skillEffectKey]: page }));
                      };

                      return (
                        <div
                          key={`${skill.name}-${sIdx}`}
                          className="relative w-full rounded-xl overflow-hidden min-h-[100px] flex items-center transition-transform hover:scale-[1.01] group"
                          onPointerDown={event => {
                            skillEffectSwipeStartRef.current = event.clientX;
                          }}
                          onPointerUp={event => {
                            const startX = skillEffectSwipeStartRef.current;
                            skillEffectSwipeStartRef.current = null;
                            if (startX === null || effectPageCount < 2) return;
                            const deltaX = event.clientX - startX;
                            if (Math.abs(deltaX) < 40) return;
                            playScrollSound();
                            setEffectPage(Math.max(0, Math.min(effectPageCount - 1, effectPage + (deltaX < 0 ? 1 : -1))));
                          }}
                          onPointerCancel={() => {
                            skillEffectSwipeStartRef.current = null;
                          }}
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
                          <div className="relative z-10 w-full px-6 sm:px-8 py-[20px]" style={{ touchAction: 'pan-y' }}>
                            <div className="flex items-start justify-between gap-1.5 text-left">
                              <span className="min-w-0 truncate text-left font-extrabold text-xs sm:text-sm text-amber-950 font-sans tracking-tight drop-shadow-sm">
                                {translatedSkillName}
                              </span>
                              <div className="flex-shrink-0 bg-amber-950/10 px-1 py-0.5 rounded border border-amber-900/20">
                                {renderChakraCosts(skill.cost)}
                              </div>
                            </div>

                            <div className="mt-1 flex items-center gap-2 sm:gap-2.5">
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

                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="grid grid-cols-2 gap-1">
                                  {skillEffects.length > 0 ? visibleEffects.map((effect, effectIndex) => (
                                    <div key={effectIndex} className="min-w-0 rounded-md border border-amber-900/30 bg-amber-100/75 px-1.5 py-1 text-[8px] leading-tight text-amber-950 shadow-sm">
                                      <div className="font-black">{effect.label}</div>
                                      <div className="mt-0.5 font-semibold">{effect.value}</div>
                                      {effect.target && (
                                        <div className="mt-1 flex justify-end">
                                          <span className="rounded border border-amber-900/20 bg-amber-900/10 px-1 py-0.5 text-[7px] font-extrabold">
                                            🎯 {getSkillAttributeTargetLabel(effect.target)}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  )) : (
                                    <span className="text-[9px] font-medium text-amber-950/70">
                                      {t('Sem efeitos adicionais configurados.', 'No additional effects configured.')}
                                    </span>
                                  )}
                                </div>

                                {effectPageCount > 1 && (
                                  <div className="flex items-center justify-center gap-2 pt-0.5 text-amber-950" aria-label={t('Paginação dos efeitos', 'Effects pagination')}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        playScrollSound();
                                        setEffectPage(Math.max(0, effectPage - 1));
                                      }}
                                      disabled={effectPage === 0}
                                      className="rounded p-0.5 disabled:opacity-30"
                                      aria-label={t('Efeitos anteriores', 'Previous effects')}
                                    >
                                      <ChevronLeft className="h-3 w-3" />
                                    </button>
                                    <span className="font-mono text-[8px] font-bold">
                                      {effectPage + 1}/{effectPageCount} · {t('deslize', 'swipe')}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        playScrollSound();
                                        setEffectPage(Math.min(effectPageCount - 1, effectPage + 1));
                                      }}
                                      disabled={effectPage === effectPageCount - 1}
                                      className="rounded p-0.5 disabled:opacity-30"
                                      aria-label={t('Próximos efeitos', 'Next effects')}
                                    >
                                      <ChevronRight className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                              
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-amber-900/20 pt-1 text-[9px] font-mono font-bold text-amber-900/90">
                              {skill.cooldown > 0 && (
                                <span>
                                  <span className="text-amber-950">{t('Recarga', 'Cooldown')}:</span>{' '}
                                  {skill.cooldown} {t('turnos', 'turns')}
                                </span>
                              )}
                              <span className="truncate">
                                <span className="text-amber-950">{t('Alvo', 'Target')}:</span>{' '}
                                {translateTargetType(skill.targetType, language)}
                              </span>
                              {(skill.invisible || (skill.invisibleDuration || 0) > 0) && (
                                <span className="inline-flex items-center gap-1 text-violet-900">
                                  <Eye className="h-3 w-3 shrink-0" aria-hidden="true" />
                                  {t('Invisível para o oponente', 'Invisible to the opponent')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Skills list pagination controls */}
                {previewCharacter.skills.length > 2 && (() => {
                  const totalPages = Math.ceil(previewCharacter.skills.length / 2);
                  return (
                    <div className="flex items-center justify-between bg-amber-950/10 p-2 rounded-xl border border-amber-900/20 mt-2">
                      <button
                        onClick={() => {
                          playScrollSound();
                          setPreviewSkillsPage(prev => Math.max(prev - 1, 0));
                        }}
                        disabled={previewSkillsPage === 0}
                        data-sound="Scroll"
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
                              playScrollSound();
                              setPreviewSkillsPage(idx);
                            }}
                            data-sound="Scroll"
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
                          playScrollSound();
                          setPreviewSkillsPage(prev => Math.min(prev + 1, totalPages - 1));
                        }}
                        disabled={previewSkillsPage === totalPages - 1}
                        data-sound="Scroll"
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
              )}
            </div>
          </div>
        </div>
      </main>

      {isMobilePortrait && !showCharacterDetails && (sandboxPlayerTeam || onBack) && (
        <button
          type="button"
          onClick={() => {
            if (sandboxPlayerTeam) handleBackToPlayerSelect();
            else onBack?.();
          }}
          data-sound="Click"
          aria-label={sandboxPlayerTeam ? t("Voltar para seleção do Time A", "Back to Team A selection") : t("Voltar", "Back")}
          className="character-select-mobile-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}

      {isMobilePortrait && showCharacterDetails && (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            playClickSound();
            toggleFavoriteCharacter();
          }}
          data-sound="Click"
          className={`character-select-favorite-action ${favoriteCharacterIds.includes(previewCharacter.id) ? 'is-favorite' : ''}`}
          aria-label={favoriteCharacterIds.includes(previewCharacter.id) ? t('Remover dos favoritos', 'Remove from favorites') : t('Favoritar', 'Add to favorites')}
          aria-pressed={favoriteCharacterIds.includes(previewCharacter.id)}
        >
          <Star className="h-4 w-4" fill={favoriteCharacterIds.includes(previewCharacter.id) ? 'currentColor' : 'none'} />
          <span>{favoriteCharacterIds.includes(previewCharacter.id) ? t('Favoritado', 'Favorited') : t('Favoritar', 'Favorite')}</span>
        </button>
      )}

      {isMobilePortrait && showCharacterDetails && (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            setShowCharacterDetails(false);
          }}
          data-sound="Click"
          className="character-select-details-close"
          aria-label={t('Fechar detalhes', 'Close details')}
        >
          <X className="h-5 w-5" />
        </button>
      )}

      {isMobilePortrait && !showCharacterDetails && (
        <button
          type="button"
          onClick={() => {
            playScrollSound();
            setShowFavoritesOnly(showing => !showing);
            setCurrentPage(1);
          }}
          className={`character-select-favorites-trigger ${showFavoritesOnly ? 'is-active' : ''}`}
          aria-label={showFavoritesOnly ? t('Mostrar todos os personagens', 'Show all characters') : t('Mostrar personagens favoritados', 'Show favorite characters')}
          aria-pressed={showFavoritesOnly}
        >
          <Star className="h-5 w-5" fill={showFavoritesOnly ? 'currentColor' : 'none'} />
        </button>
      )}

      {isMobilePortrait && !showCharacterDetails && (
        <button
          type="button"
          onClick={() => {
            playScrollSound();
            setShowCharacterDetails(true);
          }}
          className="character-select-details-trigger"
          aria-label={`${t('Ver detalhes de', 'View details for')} ${previewCharacter.name}`}
        >
          <Eye className="h-4 w-4 shrink-0" />
          <span className="truncate">{previewCharacter.name}</span>
        </button>
      )}

      {isMobilePortrait && !showCharacterDetails && (
        <button
          type="button"
          onClick={() => {
            playScrollSound();
            setShowCharacterFilters(open => !open);
          }}
          className="character-select-filter-trigger"
          aria-label={showCharacterFilters ? t('Ocultar filtros', 'Hide filters') : t('Mostrar filtros', 'Show filters')}
          aria-expanded={showCharacterFilters}
        >
          <Filter className="h-5 w-5" />
        </button>
      )}

      {/* Matchmaking Overlay */}
      <AnimatePresence>
        {isMatchmaking && (
          <motion.div
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="matchmaking-overlay fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 select-none"
          >
            {/* Ambient Red glow background */}
            <div className="absolute top-[25%] left-[25%] w-[50%] h-[50%] rounded-full bg-orange-600/10 blur-[150px] pointer-events-none" />

            <div className="max-w-md w-full text-center space-y-8 z-10">
              {/* Spinning Logo / Matchmaking Status indicator */}
              <div className="relative w-28 h-28 mx-auto">
                <div className="absolute inset-0 flex items-center justify-center">
                  <img
                    ref={matchmakingLogoRef}
                    src="/static/img/icon/mangeky.svg"
                    alt="Processando"
                    className="w-24 h-24 animate-spin"
                  />
                </div>
              </div>

              {/* Status Header */}
              <div className="space-y-2">
                <h3 className="text-2xl font-black tracking-tight text-white uppercase">
                  {matchmakingStatus === 'error' ? 'Erro no Matchmaking' : matchmakingStatus === 'matched' ? 'Oponente Encontrado!' : 'Procurando Oponente...'}
                </h3>
                {matchmakingStatus === 'error' ? (
                  <p className="text-xs font-mono text-red-400">
                    {matchmakingError || 'Não foi possível encontrar um oponente. Tente novamente.'}
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
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setShowSandboxChakraModal(false)}
          >
            <motion.div
              initial={false}
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
                  data-sound="uah"
                  className="w-full rounded-lg py-3 text-sm font-bold font-mono tracking-wider uppercase transition-all active:scale-95 cursor-pointer bg-gradient-to-r from-cyan-700 to-cyan-900 hover:from-cyan-600 hover:to-cyan-800 text-cyan-50 border border-cyan-600/60"
                >
                  🧊 {t('Sim, pausar (10 chakras cada)', 'Yes, pause (10 chakras each)')}
                </button>
                <button
                  onClick={() => finalizeSandboxMatch(false)}
                  data-sound="uah"
                  className="w-full rounded-lg py-3 text-sm font-bold font-mono tracking-wider uppercase transition-all active:scale-95 cursor-pointer bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
                >
                  {t('Não, geração normal', 'No, normal generation')}
                </button>
                <button
                  onClick={() => setShowSandboxChakraModal(false)}
                  data-sound="uah"
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
