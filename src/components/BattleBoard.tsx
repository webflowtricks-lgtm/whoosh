/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Shield, Swords, RefreshCw, Volume2, VolumeX, ArrowLeft, Send, Sparkles, Flame, User, Info, ChevronLeft, ChevronRight, Clock, Flag, MessageSquare, X, Lock, Trophy } from 'lucide-react';
import { Character, ChakraPool, CombatCharacter, ActiveEffect, CombatLog, FloatingText, Skill, ChakraType, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import ProfileCardModal, { ProfileCardData } from './ProfileCardModal';

interface BattleBoardProps {
  playerTeam: Character[];
  enemyTeam: Character[];
  isMuted: boolean;
  onToggleMute: () => void;
  onQuit: () => void;
  playClickSound: () => void;
  playScrollSound: () => void;
  playWinSound: () => void;
  playLoseSound: () => void;
  user: UserProfile;
  onlineParams?: {
    isOnline: boolean;
    roomId: string;
    playerIndex: number;
    opponentProfile: UserProfile;
  } | null;
  isSandbox?: boolean;
  restoredState?: {
    turn: number;
    playerCombatants: CombatCharacter[];
    enemyCombatants: CombatCharacter[];
    playerChakra: ChakraPool;
    enemyChakra: ChakraPool;
  } | null;
  onBattleEnd?: (victory: boolean, stats: {
    damageDealt: number;
    damageReceived: number;
    healingDone: number;
    shieldGenerated: number;
    stunsApplied: number;
    skillsUsed: { [skillName: string]: number };
    killsWithSkill: { [skillName: string]: number };
    playerCharactersUsed: string[];
  }) => void;
}

interface CuedAction {
  sourceId: string; // 'player-0', etc.
  skillIndex: number;
  targetId: string; // 'player-1', 'enemy-0', etc.
}

interface BattleChatMessage {
  id: string;
  senderName: string;
  senderTitle?: string;
  text: string;
  timestamp: number;
  isSelf: boolean;
}

// Client Sanitization Function (Blocks emojis, HTML, URLs, media links)
function sanitizeBattleChatMessage(rawText: string): string {
  if (!rawText) return '';
  let text = String(rawText).trim();

  // Strip HTML / XML tags
  text = text.replace(/<[^>]*>/g, '');

  // Strip Emojis
  text = text.replace(
    /([\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F251}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{FE00}-\u{FE0F}])/gu,
    ''
  );

  // Replace web URLs & domain patterns
  const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(com|net|org|io|br|edu|gov|xyz|app|dev)(\/[^\s]*)?)/gi;
  text = text.replace(urlPattern, '[link removido]');

  // Replace media file references (.png, .jpg, .gif, .mp4, etc.)
  const mediaPattern = /[a-zA-Z0-9_.-]+\.(png|jpg|jpeg|gif|webp|mp4|webm|mov|avi|mkv)/gi;
  text = text.replace(mediaPattern, '[mídia removida]');

  if (text.length > 100) {
    text = text.substring(0, 100);
  }

  return text.trim();
}

interface EffectDisplayItem {
  effect: ActiveEffect;
  stacks: number;
  description: string;
}

function isSkillBlockedByStun(skill: Skill | null, activeEffects: ActiveEffect[]): boolean {
  const stunEffects = activeEffects.filter(e => e.type === 'stun');
  if (stunEffects.length === 0) return false;
  if (!skill) return true;

  for (const eff of stunEffects) {
    if (!eff.stunType || eff.stunType.length === 0 || eff.stunType.length >= 4) {
      return true; // Complete stun
    }
    const skillClasses = (skill.classes || []).map(c => c.toLowerCase());
    for (const st of eff.stunType) {
      if (st === 'physical' && (skillClasses.includes('physical') || skillClasses.includes('físico') || skillClasses.includes('melee') || skillClasses.includes('corpo a corpo') || skillClasses.includes('taijutsu'))) {
        return true;
      }
      if (st === 'mental' && (skillClasses.includes('mental') || skillClasses.includes('genjutsu'))) {
        return true;
      }
      if (st === 'affliction' && (skillClasses.includes('affliction') || skillClasses.includes('aflição') || skillClasses.includes('dot'))) {
        return true;
      }
      if (st === 'chakra' && (skillClasses.includes('chakra') || skillClasses.includes('ninjutsu') || skillClasses.includes('ranged') || skillClasses.includes('à distância'))) {
        return true;
      }
    }
  }
  return false;
}

export function isEffectVisibleToViewer(eff: ActiveEffect, viewerSide: 'player' | 'enemy' = 'player'): boolean {
  if (eff.isInvisible || eff.type === 'invisible') {
    if (eff.casterSide) {
      return eff.casterSide === viewerSide;
    }
    return true;
  }
  return true;
}

function getGroupedActiveEffects(effects: ActiveEffect[], viewerSide: 'player' | 'enemy' = 'player'): EffectDisplayItem[] {
  if (!effects || effects.length === 0) return [];

  const visibleEffects = effects.filter(eff => isEffectVisibleToViewer(eff, viewerSide));
  if (visibleEffects.length === 0) return [];

  const map = new Map<string, { effect: ActiveEffect; stacks: number }>();

  for (const eff of visibleEffects) {
    const key = `${eff.name}_${eff.type}`;
    const existing = map.get(key);
    const effStacks = (eff as any).stacks || (eff.reflectCharges && eff.reflectCharges > 1 ? eff.reflectCharges : 1);

    if (existing) {
      existing.stacks += effStacks;
      if (eff.duration > existing.effect.duration) {
        existing.effect = eff;
      }
    } else {
      map.set(key, { effect: eff, stacks: effStacks });
    }
  }

  return Array.from(map.values()).map(({ effect, stacks }) => {
    let desc = (effect as any).description || '';
    if (!desc) {
      const durText = effect.duration === 1 ? '1 turno' : `${effect.duration} turnos`;
      const val = effect.value || 0;

      switch (effect.type) {
        case 'stun': {
          const typesMap: Record<string, string> = {
            physical: 'Físicas (Corpo a Corpo/Ataque)',
            mental: 'Mentais (Genjutsu/Ilusão)',
            affliction: 'Aflição (Sangramento/Veneno/Efeito)',
            chakra: 'Chakra (Ninjutsu/Energia/Distância)'
          };
          const resolvedTypes = (!effect.stunType || effect.stunType.length === 0 || effect.stunType.length >= 4)
            ? ['physical', 'mental', 'affliction', 'chakra']
            : effect.stunType;

          const isComplete = resolvedTypes.length >= 4;
          const stTypes = resolvedTypes.map(t => typesMap[t] || t).join(', ');

          if (isComplete) {
            desc = `🚫 DEBUFF (Atordoado Completo): Unidade completamente atordoada! Não pode usar QUALQUER habilidade (Físicas, Mentais, Aflição ou Chakra) por ${durText}.`;
          } else {
            desc = `🚫 DEBUFF (Atordoado Parcial): Unidade atordoada! Não pode usar habilidades das categorias: ${stTypes} por ${durText}.`;
          }
          break;
        }
        case 'damage_buff':
          desc = val > 0 ? `Aumenta o ataque de todas as suas habilidades em ${val}` : `Aumenta o ataque das habilidades por ${durText}`;
          break;
        case 'damage_reduction':
          desc = val > 0 ? `Redução de ${val} de dano por ${durText}` : `Redução de dano por ${durText}`;
          break;
        case 'shield':
          desc = val > 0 ? `Escudo protetor absorvendo ${val} de dano por ${durText}` : `Escudo protetor por ${durText}`;
          break;
        case 'dot':
        case 'bleeding':
        case 'damage':
        case 'direct_damage':
        case 'affliction':
          desc = val > 0 ? `Recebe ${val} de dano contínuo por turno por ${durText}` : `Efeito de dano contínuo por ${durText}`;
          break;
        case 'heal':
          desc = val > 0 ? `Regenera ${val} de vida por turno por ${durText}` : `Efeito de cura por ${durText}`;
          break;
        case 'invulnerable':
          desc = `Inviolável - Imune a todos os danos por ${durText}`;
          break;
        case 'counter':
        case 'counter_attack':
          desc = `Pronto para contra-atacar por ${durText}`;
          break;
        case 'reflect':
          desc = `Reflete habilidades do oponente por ${durText}`;
          break;
        case 'paralyze_cooldown':
          desc = `Recargas de habilidades paralisadas por ${durText}`;
          break;
        case 'invisible':
          desc = `Invisível / Imune a ser alvejado por ${durText}`;
          break;
        default:
          desc = val > 0 ? `${effect.name}: valor ${val} por ${durText}` : `${effect.name}: ativo por ${durText}`;
          break;
      }
    }

    return {
      effect,
      stacks,
      description: desc
    };
  });
}

export default function BattleBoard({
  playerTeam,
  enemyTeam,
  isMuted,
  onToggleMute,
  onQuit,
  playClickSound,
  playScrollSound,
  playWinSound,
  playLoseSound,
  user,
  onlineParams,
  isSandbox,
  restoredState,
  onBattleEnd,
}: BattleBoardProps) {
  // Stats tracking for Quests
  const matchStatsRef = useRef({
    damageDealt: 0,
    damageReceived: 0,
    healingDone: 0,
    shieldGenerated: 0,
    stunsApplied: 0,
    skillsUsed: {} as { [skillName: string]: number },
    killsWithSkill: {} as { [skillName: string]: number },
    playerCharactersUsed: playerTeam.map(c => c.name),
  });

  const handleQuit = () => {
    if (gameOver && onBattleEnd) {
      onBattleEnd(gameOver === 'victory', matchStatsRef.current);
    }
    onQuit();
  };

  // Turn count
  const [turn, setTurn] = useState(1);

  // Profile Card Modal Viewer State
  const [viewingProfile, setViewingProfile] = useState<{ profile: ProfileCardData; isSelf: boolean } | null>(null);

  // Combatants
  const [playerCombatants, setPlayerCombatants] = useState<CombatCharacter[]>([]);
  const [enemyCombatants, setEnemyCombatants] = useState<CombatCharacter[]>([]);

  // Chakra Pools (start at 0, first turn rolls 1 random element)
  const [playerChakra, setPlayerChakra] = useState<ChakraPool>({ Tai: 0, Nin: 0, Gen: 0, Blood: 0 });
  const [enemyChakra, setEnemyChakra] = useState<ChakraPool>({ Tai: 0, Nin: 0, Gen: 0, Blood: 0 });

  // Chakra Trade (4 -> 1)
const [showChakraTrade, setShowChakraTrade] = useState(false);
const [tradeSelection, setTradeSelection] = useState<ChakraPool>({ Tai: 0, Nin: 0, Gen: 0, Blood: 0 });
const [tradeTarget, setTradeTarget] = useState<keyof ChakraPool | null>(null);

  // Floating text animations
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);

  // Battle logs
  const [logs, setLogs] = useState<CombatLog[]>([]);

  // Selection/Targeting State
  const [selectedSkill, setSelectedSkill] = useState<{ charId: string; skillIndex: number } | null>(null);
  const [cuedActions, setCuedActions] = useState<CuedAction[]>([]);

  // Last rolled chakra display
  const [lastChakraRoll, setLastChakraRoll] = useState<string[]>([]);
  const [showRollBanner, setShowRollBanner] = useState(false);

  // Victory/Defeat Game Over State
  const [gameOver, setGameOver] = useState<'victory' | 'defeat' | null>(null);

  // Active selected skill inspector
  const [inspectedSkill, setInspectedSkill] = useState<{
    skill: Skill;
    ownerName: string;
    isEnemy: boolean;
  } | null>(null);

  // Center console active tab
  const [centerTab, setCenterTab] = useState<'inspector' | 'logs'>('inspector');

  // Skill pagination state per combatant id
  const [combatantSkillPages, setCombatantSkillPages] = useState<Record<string, number>>({});

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Interactive Emojis State
  const PRESET_EMOJIS = ['🔥', '⚡', '🤣', '😎', '🦊'];
  const COOLDOWN_MS = 3000;
  const GLOBAL_COOLDOWN_MS = 1000;

  // Transient Battle Chat State
  const [chatMessages, setChatMessages] = useState<BattleChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const lastChatTimestampRef = useRef<number>(0);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isChatOpen]);

  // Online Chat Polling Effect
  useEffect(() => {
    if (!onlineParams?.isOnline || !onlineParams.roomId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/match/chat/messages?roomId=${onlineParams.roomId}&since=${lastChatTimestampRef.current}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.messages) && data.messages.length > 0) {
          const newMsgs: BattleChatMessage[] = data.messages.map((m: any) => {
            if (m.timestamp > lastChatTimestampRef.current) {
              lastChatTimestampRef.current = m.timestamp;
            }
            return {
              id: m.id,
              senderName: m.senderName,
              senderTitle: m.senderTitle,
              text: m.text,
              timestamp: m.timestamp,
              isSelf: m.username === user.username.trim().toLowerCase()
            };
          });

          setChatMessages(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const filtered = newMsgs.filter(m => !existingIds.has(m.id));
            if (filtered.length === 0) return prev;
            if (!isChatOpen) {
              setUnreadCount(c => c + filtered.length);
            }
            return [...prev, ...filtered];
          });
        }
      } catch (e) {
        // silent catch
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [onlineParams, user.username, isChatOpen]);

  // Handle Sending Chat Message
  const handleSendChatMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setChatError(null);

    const cleanText = sanitizeBattleChatMessage(chatInput);
    if (!cleanText) {
      setChatError("Emojis, links ou mídias não são permitidos.");
      setTimeout(() => setChatError(null), 3500);
      return;
    }

    setChatInput('');

    if (onlineParams?.isOnline && onlineParams.roomId) {
      try {
        await fetch('/api/match/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: onlineParams.roomId,
            username: user.username,
            text: cleanText,
            title: user.title
          })
        });
      } catch (err) {
        console.error("Erro ao enviar mensagem no chat:", err);
      }
    } else {
      // Offline / Sandbox / Vs Bot match
      const newMsg: BattleChatMessage = {
        id: "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        senderName: user.name || user.username,
        senderTitle: user.title,
        text: cleanText,
        timestamp: Date.now(),
        isSelf: true
      };
      setChatMessages(prev => [...prev, newMsg]);
    }
  };

  const [activeEmojis, setActiveEmojis] = useState<{ id: string; emoji: string; xOffset: number; rotation: number; senderName?: string }[]>([]);
  const [lastEmojiClicked, setLastEmojiClicked] = useState<Record<string, number>>({});
  const [globalEmojiCooldownUntil, setGlobalEmojiCooldownUntil] = useState<number>(0);

  // Multiplayer state
  const [isWaitingForOpponent, setIsWaitingForOpponent] = useState(false);
  const lastPolledEmojiTimestamp = useRef<number>(Date.now());

  // Force re-render state to update visual countdown timer every 100ms
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleSendEmoji = (emoji: string) => {
    const now = Date.now();
    
    // Check global cooldown
    if (now < globalEmojiCooldownUntil) {
      playCustomSound('Error');
      return;
    }
    
    // Check individual cooldown
    const lastClicked = lastEmojiClicked[emoji] || 0;
    if (now - lastClicked < COOLDOWN_MS) {
      playCustomSound('Error');
      return;
    }
    
    // Play sound feedback
    playCustomSound('Click');
    
    // Set individual cooldown
    setLastEmojiClicked(prev => ({ ...prev, [emoji]: now }));
    // Set global cooldown
    setGlobalEmojiCooldownUntil(now + GLOBAL_COOLDOWN_MS);
    
    // Add to active emojis list
    const id = Math.random().toString();
    const xOffset = Math.random() * 200 - 100; // random drift width
    const rotation = Math.random() * 60 - 30; // random rotation angle
    const ourName = user.name || user.username;
    setActiveEmojis(prev => [...prev, { id, emoji, xOffset, rotation, senderName: ourName }]);

    if (onlineParams?.isOnline) {
      fetch('/api/match/emoji', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: onlineParams.roomId,
          username: user.username,
          emoji
        })
      }).catch(err => console.error('Error sending emoji to server:', err));
    }
  };

  // Initial setup on mount
  useEffect(() => {
    if (restoredState) {
      setTurn(restoredState.turn);
      setPlayerCombatants(restoredState.playerCombatants);
      setEnemyCombatants(restoredState.enemyCombatants);
      setPlayerChakra(restoredState.playerChakra);
      setEnemyChakra(restoredState.enemyChakra);
      setCuedActions([]);
      setSelectedSkill(null);
      setGameOver(null);

      const pCombat = restoredState.playerCombatants;
      if (pCombat.length > 0 && pCombat[0].character.skills.length > 0) {
        setInspectedSkill({
          skill: pCombat[0].character.skills[0],
          ownerName: pCombat[0].character.name,
          isEnemy: false,
        });
      }

      setLogs([
        { id: Math.random().toString(), turn: restoredState.turn, message: '⚔️ BATALHA RECUPERADA! Retornando ao confronto.', type: 'system' }
      ]);
      return;
    }

    // Reset all battle-related states to fresh start
    setPlayerChakra({ Tai: 0, Nin: 0, Gen: 0, Blood: 0 });
    setEnemyChakra({ Tai: 0, Nin: 0, Gen: 0, Blood: 0 });
    setTurn(1);
    setCuedActions([]);
    setSelectedSkill(null);
    setGameOver(null);

    const startingPlanner: 'player' | 'enemy' = Math.random() < 0.5 ? 'player' : 'enemy';
    setActivePlanner(startingPlanner);
    setPassedPlayersThisTurn([]);

    const sanitizeCharacter = (c: any): Character => {
      if (!c) {
        return {
          id: 'unknown_' + Math.random(),
          name: 'Ninja',
          portrait: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg',
          description: '',
          skills: [],
          skins: [],
          tags: [],
          folder: 'naruto-uzumaki'
        };
      }
      const charCopy = JSON.parse(JSON.stringify(c));
      charCopy.skills = Array.isArray(charCopy.skills) ? charCopy.skills : [];
      charCopy.skins = Array.isArray(charCopy.skins) ? charCopy.skins : [];
      charCopy.tags = Array.isArray(charCopy.tags) ? charCopy.tags : [];
      charCopy.name = charCopy.name || 'Shinobi';
      charCopy.portrait = charCopy.portrait || 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg';
      charCopy.selectedSkinUrl = charCopy.selectedSkinUrl || charCopy.skins?.[0]?.image || charCopy.portrait;
      return charCopy;
    };

    const pCombat: CombatCharacter[] = (playerTeam || []).map((c, idx) => ({
      id: `player-${idx}`,
      character: sanitizeCharacter(c),
      health: 100,
      maxHealth: 100,
      shield: 0,
      activeEffects: [],
      isDead: false,
    }));

    const eCombat: CombatCharacter[] = (enemyTeam || []).map((c, idx) => ({
      id: `enemy-${idx}`,
      character: sanitizeCharacter(c),
      health: 100,
      maxHealth: 100,
      shield: 0,
      activeEffects: [],
      isDead: false,
    }));

    setPlayerCombatants(pCombat);
    setEnemyCombatants(eCombat);

    if (pCombat.length > 0 && pCombat[0].character.skills.length > 0) {
      setInspectedSkill({
        skill: pCombat[0].character.skills[0],
        ownerName: pCombat[0].character.name,
        isEnemy: false,
      });
    }

    // Initial logs with random initiative
    const initialLogs: CombatLog[] = [
      { id: '1', turn: 1, message: '⚔️ BATALHA INICIADA! Esquadrão confirmado.', type: 'system' },
      { id: '2', turn: 1, message: startingPlanner === 'player'
          ? '🎲 [INICIATIVA] Você ganhou o sorteio e joga PRIMEIRO no Turno 1!'
          : '🎲 [INICIATIVA] O Oponente ganhou o sorteio e joga PRIMEIRO no Turno 1!', type: 'system' },
      { id: '3', turn: 1, message: 'Gere seus chakras e escolha suas táticas!', type: 'system' },
    ];
    setLogs(initialLogs);

    // Play start audio depending on initiative
    if (startingPlanner === 'player') {
      playCustomSound('StartFirst');
    } else {
      playCustomSound('StartSecond');
    }

    // Trigger initial chakra roll banner (Turn 1 gets 1 random chakra each)
    rollChakraForTurn(true, 1);
    rollChakraForTurn(false, 1);
  }, [playerTeam, enemyTeam, restoredState]);

  // Poll for opponent emojis in an online match
  useEffect(() => {
    if (!onlineParams?.isOnline) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/match/emojis?roomId=${onlineParams.roomId}&since=${lastPolledEmojiTimestamp.current}`);
        const data = await res.json();
        if (data.success && data.emojis.length > 0) {
          data.emojis.forEach((e: any) => {
            // Only render emojis sent by the opponent
            if (e.username !== user.username.toLowerCase()) {
              const id = Math.random().toString();
              const xOffset = Math.random() * 200 - 100;
              const rotation = Math.random() * 60 - 30;
              setActiveEmojis(prev => [...prev, {
                id,
                emoji: e.emoji,
                xOffset,
                rotation,
                senderName: e.senderName || e.username
              }]);
            }
            if (e.timestamp > lastPolledEmojiTimestamp.current) {
              lastPolledEmojiTimestamp.current = e.timestamp;
            }
          });
        }
      } catch (err) {
        console.error('Error polling emojis:', err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [onlineParams, user]);

  // Multiplayer cleanup on unmount
  useEffect(() => {
    return () => {
      if (onlineParams?.isOnline) {
        fetch('/api/matchmaking/quit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user.username, roomId: onlineParams.roomId })
        }).catch(() => {});
      }
    };
  }, [onlineParams, user]);

  // Autoscroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Audio utility helper
  const playCustomSound = (soundName: string) => {
    if (isMuted) return;
    try {
      const audio = new Audio(`/static/audio/${soundName}.ogg`);
      audio.volume = 0.4;
      audio.play().catch(e => console.log('Audio playback prevented:', e));
    } catch (err) {
      console.error(err);
    }
  };

  // Play Victory / Defeat sound when game finishes
  useEffect(() => {
    if (gameOver === 'victory') {
      playWinSound();
    } else if (gameOver === 'defeat') {
      playLoseSound();
    }
  }, [gameOver, playWinSound, playLoseSound]);

  // Add floating combat numbers helper
  const addFloatingText = (targetId: string, text: string, type: FloatingText['type']) => {
    const id = Math.random().toString();
    setFloatingTexts(prev => [...prev, { id, targetId, text, type }]);
    // Remove after 1.5 seconds
    setTimeout(() => {
      setFloatingTexts(prev => prev.filter(t => t.id !== id));
    }, 1500);
  };

  // Calculate simulated remaining chakra pool after deducting cued actions
  const getSimulatedRemainingChakra = (pool: ChakraPool, actions: CuedAction[], isForEnemy: boolean = false): ChakraPool => {
    const tempPool = { ...pool };
    actions.forEach(action => {
      const isActionEnemy = action.sourceId.startsWith('enemy');
      if (isActionEnemy !== isForEnemy) return;

      const src = isActionEnemy
        ? enemyCombatants.find(e => e.id === action.sourceId)
        : playerCombatants.find(p => p.id === action.sourceId);

      if (!src) return;
      const skill = src.character.skills[action.skillIndex];
      let randCost = 0;

      // Element specific costs first
      skill.cost.forEach(cost => {
        if (cost === 'Rand') {
          randCost++;
        } else {
          const element = cost as keyof ChakraPool;
          if (tempPool[element] > 0) {
            tempPool[element]--;
          }
        }
      });

      // Greedy random cost deduction (highest elements first)
      for (let i = 0; i < randCost; i++) {
        const sorted = (Object.keys(tempPool) as (keyof ChakraPool)[]).sort((a, b) => tempPool[b] - tempPool[a]);
        const highestElement = sorted[0];
        if (tempPool[highestElement] > 0) {
          tempPool[highestElement]--;
        }
      }
    });
    return tempPool;
  };

  // Roll Chakra logic (accepts count of chakra elements to roll)
  const rollChakraForTurn = (isPlayer: boolean, count: number = 1) => {
    const types: (keyof ChakraPool)[] = ['Tai', 'Nin', 'Gen', 'Blood'];
    const rolled: (keyof ChakraPool)[] = [];

    // Simple LCG PRNG for online sync
    let seed = 0;
    if (onlineParams?.isOnline) {
      const myOnlineIndex = onlineParams.playerIndex === 2 ? 1 : 0;
      const targetIndex = isPlayer ? myOnlineIndex : (1 - myOnlineIndex);
      // We can use the current state of turn count or just the turn variable
      const seedStr = `${onlineParams.roomId}-${turn}-player-${targetIndex}`;
      let hash = 0;
      for (let j = 0; j < seedStr.length; j++) {
        hash = seedStr.charCodeAt(j) + ((hash << 5) - hash);
      }
      seed = Math.abs(hash);
    }

    const seededRandom = () => {
      if (!onlineParams?.isOnline) return Math.random();
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    // Roll specified number of chakra beads
    for (let i = 0; i < count; i++) {
      const randType = types[Math.floor(seededRandom() * types.length)];
      rolled.push(randType);
    }

    if (isPlayer) {
      setPlayerChakra(prev => {
        const updated = { ...prev };
        rolled.forEach(r => {
          updated[r] += 1;
        });
        return updated;
      });
      setLastChakraRoll(rolled);
      setShowRollBanner(true);
      playCustomSound('StartTurn');
      setTimeout(() => setShowRollBanner(false), 2500);

      // Log roll
      setLogs(prev => [
        ...prev,
        {
          id: Math.random().toString(),
          turn,
          message: `🌀 Jogador gerou chakra (${count} de aliados vivos): ${rolled.map(r => `[${r}]`).join(', ')}`,
          type: 'chakra',
        },
      ]);
    } else {
      setEnemyChakra(prev => {
        const updated = { ...prev };
        rolled.forEach(r => {
          updated[r] += 1;
        });
        return updated;
      });
    }
  };

  // Validate chakra pool meets cost
  const canAffordSkill = (skill: Skill, pool: ChakraPool): boolean => {
    const tempPool = { ...pool };
    let randomCostCount = 0;

    // Deduct specific element costs first
    for (const cost of skill.cost) {
      if (cost === 'Rand') {
        randomCostCount++;
      } else {
        const element = cost as keyof ChakraPool;
        if (tempPool[element] > 0) {
          tempPool[element]--;
        } else {
          return false; // Cannot afford specific element
        }
      }
    }

    // Check if remaining chakra meets random cost
    const totalRemaining = tempPool.Tai + tempPool.Nin + tempPool.Gen + tempPool.Blood;
    return totalRemaining >= randomCostCount;
  };

  // Deduct chakra pool permanently for cued action
  const deductChakraCost = (skill: Skill, isPlayer: boolean) => {
    const setChakra = isPlayer ? setPlayerChakra : setEnemyChakra;

    setChakra(prev => {
      const pool = { ...prev };
      let randCost = 0;

      // Element specific costs
      skill.cost.forEach(cost => {
        if (cost === 'Rand') {
          randCost++;
        } else {
          const element = cost as keyof ChakraPool;
          if (pool[element] > 0) {
            pool[element]--;
          }
        }
      });

      // Greedy random cost deduction (deducts from highest elements first)
      for (let i = 0; i < randCost; i++) {
        const sorted = (Object.keys(pool) as (keyof ChakraPool)[]).sort((a, b) => pool[b] - pool[a]);
        const highestElement = sorted[0];
        if (pool[highestElement] > 0) {
          pool[highestElement]--;
        }
      }

      return pool;
    });
  };

  // Skill click select
  const handleSelectSkill = (charId: string, skillIdx: number) => {
    playClickSound();

    const isEnemyChar = charId.startsWith('enemy');
    const combatant = isEnemyChar
      ? enemyCombatants.find(e => e.id === charId)
      : playerCombatants.find(p => p.id === charId);

    if (!combatant) return;

    const skill = combatant.character.skills[skillIdx];
    // Always inspect the skill first!
    setInspectedSkill({
      skill,
      ownerName: combatant.character.name,
      isEnemy: isEnemyChar,
    });
    setCenterTab('inspector');

    if (combatant.isDead) return;

    if (activePlanner === 'player' && isEnemyChar) {
      return;
    }
    if (activePlanner === 'enemy' && !isEnemyChar) {
      return;
    }

    // Stun check
    if (isSkillBlockedByStun(skill, combatant.activeEffects)) {
      addFloatingText(charId, 'ATORDOADO!', 'stun');
      return;
    }

    if (skill.currentCooldown > 0) return;

    // Condition check (e.g. Rasengan requires Shadow Clones)
    if (skill.requireEffect) {
      const hasReq = combatant.activeEffects.some(e => e.name === skill.requireEffect);
      if (!hasReq) {
        addFloatingText(charId, `Requer ${skill.requireEffect}!`, 'effect');
        return;
      }
    }

    // Check if already cued
    const alreadyCuedIdx = cuedActions.findIndex(a => a.sourceId === charId);
    let currentActionsAfterCancel = [...cuedActions];
    if (alreadyCuedIdx > -1) {
      const prevAction = cuedActions[alreadyCuedIdx];
      currentActionsAfterCancel = cuedActions.filter((_, i) => i !== alreadyCuedIdx);
      setCuedActions(currentActionsAfterCancel);

      if (prevAction.skillIndex === skillIdx) {
        setSelectedSkill(null);
        playCustomSound('Cancel');
        return;
      }
    }

    // Calculate simulated chakra AFTER canceling previous skill for this character
    const baseChakra = isEnemyChar ? enemyChakra : playerChakra;
    const simulatedChakraAfterCancel = getSimulatedRemainingChakra(baseChakra, currentActionsAfterCancel, isEnemyChar);

    // Affordability check using simulatedChakraAfterCancel
    if (!canAffordSkill(skill, simulatedChakraAfterCancel)) {
      addFloatingText(charId, 'Sem Chakra!', 'effect');
      return;
    }

    // Self target auto-cue
    if (skill.targetType === 'Self') {
      setCuedActions(prev => {
        const filtered = prev.filter(a => a.sourceId !== charId);
        return [...filtered, { sourceId: charId, skillIndex: skillIdx, targetId: charId }];
      });
      setSelectedSkill(null);
      playCustomSound('Target');
      addFloatingText(charId, 'Preparado!', 'effect');
    } else {
      setSelectedSkill({ charId, skillIndex: skillIdx });
    }
  };

  // Grid/character click targets selection
  const handleSelectTarget = (targetId: string, isEnemyTarget: boolean) => {
    if (!selectedSkill) return;

    const isSourceEnemy = selectedSkill.charId.startsWith('enemy');
    const sourceChar = isSourceEnemy
      ? enemyCombatants.find(e => e.id === selectedSkill.charId)
      : playerCombatants.find(p => p.id === selectedSkill.charId);

    if (!sourceChar) return;

    const skill = sourceChar.character.skills[selectedSkill.skillIndex];

    // Target restriction checks depending on source team
    const expectedEnemyTarget = isSourceEnemy ? false : true;
    if (skill.targetType === 'Enemy' && isEnemyTarget !== expectedEnemyTarget) return;
    if (skill.targetType === 'Ally' && isEnemyTarget === expectedEnemyTarget) return;

    // Target dead check
    const targetChar = isEnemyTarget
      ? enemyCombatants.find(e => e.id === targetId)
      : playerCombatants.find(p => p.id === targetId);
    if (!targetChar || targetChar.isDead) return;

    // Invisible check (Opposite side target check)
    const isOppositeSide = isSourceEnemy ? !isEnemyTarget : isEnemyTarget;
    if (isOppositeSide) {
      const isTargetInvisible = targetChar.activeEffects.some(e => e.type === 'invisible');
      if (isTargetInvisible) {
        playCustomSound('Error');
        addFloatingText(targetId, 'ALVO INVISÍVEL!', 'stun');
        return;
      }
      const isTargetInvulnerable = targetChar.activeEffects.some(e => e.type === 'invulnerable');
      if (isTargetInvulnerable) {
        playCustomSound('Error');
        addFloatingText(targetId, 'ALVO INVULNERÁVEL!', 'invulnerable');
        return;
      }
    }

    playCustomSound('Target');

    setCuedActions(prev => {
      // Avoid multiple actions from same source
      const filtered = prev.filter(a => a.sourceId !== selectedSkill.charId);
      return [
        ...filtered,
        { sourceId: selectedSkill.charId, skillIndex: selectedSkill.skillIndex, targetId },
      ];
    });

    setSelectedSkill(null);
    addFloatingText(targetId, 'Alvo Selecionado!', 'effect');
  };

// Trade 4 chakras of choice for 1 chakra of choice
const handleTradeChakra = () => {
  const totalSelected = (Object.keys(tradeSelection) as (keyof ChakraPool)[])
    .reduce((sum, k) => sum + tradeSelection[k], 0);

  if (totalSelected !== 4 || !tradeTarget) return;

  setPlayerChakra(prev => {
    const updated = { ...prev };
    (Object.keys(tradeSelection) as (keyof ChakraPool)[]).forEach(k => {
      updated[k] -= tradeSelection[k];
    });
    updated[tradeTarget] += 1;
    return updated;
  });

  setLogs(prev => [
    ...prev,
    {
      id: Math.random().toString(),
      turn,
      message: `🔄 Troca de Chakra: 4 chakras convertidos em 1 [${tradeTarget}]!`,
      type: 'chakra',
    },
  ]);

  setTradeSelection({ Tai: 0, Nin: 0, Gen: 0, Blood: 0 });
  setTradeTarget(null);
  setShowChakraTrade(false);
};

  // Who is currently selecting their actions / whose planning turn it is
  const [activePlanner, setActivePlanner] = useState<'player' | 'enemy'>('player');
  const [passedPlayersThisTurn, setPassedPlayersThisTurn] = useState<('player' | 'enemy')[]>([]);

  const pushActiveEffect = (character: CombatCharacter, effect: ActiveEffect) => {
    character.activeEffects.push(effect);
  };

  // Helper to execute actions for a single side (Player or Enemy) immediately
  const executeSideActions = (sideActions: CuedAction[], isPlayerSide: boolean): boolean => {
    const newLogs: CombatLog[] = [];
    const updatedPlayer = playerCombatants.map(c => ({ ...c, lastTurnStatus: null }));
    const updatedEnemy = enemyCombatants.map(c => ({ ...c, lastTurnStatus: null }));

    // Deduct chakra cost permanently for sideActions
    const chakraSetter = isPlayerSide ? setPlayerChakra : setEnemyChakra;
    chakraSetter(prev => {
      let pool = { ...prev };
      sideActions.forEach(action => {
        const srcList = isPlayerSide ? updatedPlayer : updatedEnemy;
        const src = srcList.find(p => p.id === action.sourceId);
        if (!src) return;
        const skill = src.character.skills[action.skillIndex];
        let randCost = 0;
        skill.cost.forEach(cost => {
          if (cost === 'Rand') randCost++;
          else {
            const element = cost as keyof ChakraPool;
            if (pool[element] > 0) pool[element]--;
          }
        });
        for (let i = 0; i < randCost; i++) {
          const sorted = (Object.keys(pool) as (keyof ChakraPool)[]).sort((a, b) => pool[b] - pool[a]);
          const highestElement = sorted[0];
          if (pool[highestElement] > 0) pool[highestElement]--;
        }
      });
      return pool;
    });

    const resolveEffectTargets = (
      targetOverride: string | undefined,
      defaultTarget: CombatCharacter,
      source: CombatCharacter,
      sourceList: CombatCharacter[],
      targetList: CombatCharacter[],
      isBeneficial: boolean = false
    ): CombatCharacter[] => {
      if (!targetOverride || targetOverride === 'Target') {
        if (isBeneficial) {
          const sourceIsPlayer = updatedPlayer.some(p => p.id === source.id);
          const targetIsPlayer = updatedPlayer.some(p => p.id === defaultTarget.id);
          if (sourceIsPlayer !== targetIsPlayer) {
            return [source];
          }
        }
        return [defaultTarget];
      }
      if (targetOverride === 'Self') return [source];
      if (targetOverride === 'Both') return [source, defaultTarget];
      if (targetOverride === 'Ally') {
        if (sourceList.some(c => c.id === defaultTarget.id)) return [defaultTarget];
        const allies = sourceList.filter(c => c.id !== source.id && !c.isDead);
        return allies.length > 0 ? [allies[0]] : [source];
      }
      if (targetOverride === 'AllAllies') return sourceList.filter(c => !c.isDead);
      if (targetOverride === 'AllEnemies') return targetList.filter(c => !c.isDead);
      if (targetOverride === 'AllLiving') return [...sourceList, ...targetList].filter(c => !c.isDead);
      if (targetOverride === 'AllNonInvulnerable') return [...sourceList, ...targetList].filter(c => !c.isDead && !c.activeEffects.some(e => e.type === 'invulnerable'));
      if (targetOverride === 'AllInvulnerable') return [...sourceList, ...targetList].filter(c => !c.isDead && c.activeEffects.some(e => e.type === 'invulnerable'));
      if (targetOverride === 'OneInvulnerable') {
        const invuls = [...sourceList, ...targetList].filter(c => !c.isDead && c.activeEffects.some(e => e.type === 'invulnerable'));
        return invuls.length > 0 ? [invuls[0]] : [];
      }
      if (targetOverride === 'OneInvulnerableAlly') {
        const allies = sourceList.filter(c => !c.isDead && c.activeEffects.some(e => e.type === 'invulnerable'));
        return allies.length > 0 ? [allies[0]] : [];
      }
      if (targetOverride === 'SelfAndAllEnemies') {
        return [source, ...targetList.filter(c => !c.isDead)];
      }
      return [defaultTarget];
    };

    const formattedActions = sideActions.map(a => ({ ...a, isPlayer: isPlayerSide }));

    if (formattedActions.length > 0) {
      playCustomSound('ApplySkill');
    }

    formattedActions.forEach(action => {
      const sourceList = action.isPlayer ? updatedPlayer : updatedEnemy;
      const targetList = action.isPlayer ? updatedEnemy : updatedPlayer;

      const source = sourceList.find(c => c.id === action.sourceId);
      if (!source || source.isDead) return;

      const skill = source.character.skills[action.skillIndex];

      // Set skill on cooldown
      skill.currentCooldown = skill.cooldown || 1;

      // Stun check
      if (isSkillBlockedByStun(skill, source.activeEffects)) {
        newLogs.push({
          id: Math.random().toString(),
          turn,
          message: `🚫 ${source.character.name} tentou usar [${skill.name}], mas está ATORDOADO!`,
          type: 'system',
        });
        addFloatingText(source.id, 'ATORDOADO!', 'stun');
        return;
      }

      // Find target combatant
      const defaultTarget = targetList.find(c => c.id === action.targetId) || sourceList.find(c => c.id === action.targetId) || source;

      // Invulnerability check on target
      const isTargetInvulnerable = defaultTarget.activeEffects.some(e => e.type === 'invulnerable');
      if (isTargetInvulnerable && !skill.ignoreInvulnerable) {
        newLogs.push({
          id: Math.random().toString(),
          turn,
          message: `🛡️ ${source.character.name} usou [${skill.name}] em ${defaultTarget.character.name}, mas o alvo está INVULNERÁVEL!`,
          type: 'buff',
        });
        addFloatingText(defaultTarget.id, 'INVULNERÁVEL!', 'invulnerable');
        return;
      }

      // Check Reflect on target
      const reflectEffect = defaultTarget.activeEffects.find(e => e.type === 'reflect');
      let target = defaultTarget;
      let isReflected = false;

      if (reflectEffect && skill.damage && skill.damage > 0 && !skill.cannotBeReflected) {
        isReflected = true;
        target = source; // Reflect back to source!
        if (reflectEffect.reflectCharges !== undefined) {
          reflectEffect.reflectCharges--;
          if (reflectEffect.reflectCharges <= 0) {
            defaultTarget.activeEffects = defaultTarget.activeEffects.filter(e => e !== reflectEffect);
          }
        }
        newLogs.push({
          id: Math.random().toString(),
          turn,
          message: `🔄 [REFLECT] ${defaultTarget.character.name} REFLETIL a habilidade [${skill.name}] de volta para ${source.character.name}!`,
          type: 'buff',
        });
        addFloatingText(defaultTarget.id, 'REFLETIDO!', 'effect');
        addFloatingText(source.id, 'ALVO DE REFLECT!', 'damage');
      }

      // Skill parameters
      const baseDamage = skill.damage || 0;
      const directDamage = skill.directDamage || 0;
      const healAmt = skill.heal || 0;
      let stunApplied = (skill.stunTurns && skill.stunTurns > 0) ? true : false;
      let stunDuration = skill.stunTurns || 1;
      let finalStunType: ('mental' | 'physical' | 'affliction' | 'chakra')[] | undefined = skill.stunType;
      if (skill.name === 'Rasengan') {
        stunApplied = true;
        stunDuration = 1;
        finalStunType = ['physical', 'mental', 'affliction', 'chakra'];
      } else if (stunApplied && (!finalStunType || finalStunType.length === 0)) {
        finalStunType = ['physical', 'mental', 'affliction', 'chakra'];
      }

      // Helper function to cleanse effects
      const cleanseTargetEffects = (t: CombatCharacter, removeType?: string) => {
        if (!removeType) return;
        if (removeType === 'all') {
          t.activeEffects = t.activeEffects.filter(e => e.irremovable);
          addFloatingText(t.id, 'PURIFICADO (TODOS)', 'heal');
        } else if (removeType === 'debuff') {
          t.activeEffects = t.activeEffects.filter(e => e.irremovable || ['shield', 'damage_buff', 'damage_reduction', 'invulnerable', 'counter', 'counter_attack', 'reflect'].includes(e.type));
          addFloatingText(t.id, 'DEBUFFS REMOVIDOS', 'heal');
        } else if (removeType === 'buff') {
          t.activeEffects = t.activeEffects.filter(e => e.irremovable || ['stun', 'dot', 'bleeding', 'affliction', 'damage', 'direct_damage', 'paralyze_cooldown'].includes(e.type));
          addFloatingText(t.id, 'BUFFS REMOVIDOS', 'damage');
        }
      };

      // 0. CHAKRA GAIN / DRAIN
      if (skill.gainChakra && skill.gainChakra > 0) {
        const amt = skill.gainChakra;
        const dur = skill.gainChakraDuration || 1;
        const gainChakraTargets = resolveEffectTargets(skill.gainChakraTarget || 'Self', target, source, sourceList, targetList, true);

        gainChakraTargets.forEach(t => {
          if (t.isDead) return;
          if (dur > 1) {
            pushActiveEffect(t, {
              name: `Fluxo de Chakra (${skill.name})`,
              type: 'custom',
              value: amt,
              duration: dur,
              icon: skill.icon,
              irremovable: !!skill.gainChakraIrremovable,
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `✨ [${skill.name}] de ${source.character.name} ativou ganho contínuo de +${amt} chakra elemental em ${t.character.name} por ${dur} turnos!`,
              type: 'chakra',
            });
            addFloatingText(t.id, '+CHAKRA CONTÍNUO', 'effect');
          } else {
            const isPlayerCombatant = updatedPlayer.some(p => p.id === t.id);
            const targetSetter = isPlayerCombatant ? setPlayerChakra : setEnemyChakra;
            targetSetter(prev => {
              const u = { ...prev };
              const types: (keyof ChakraPool)[] = ['Tai', 'Nin', 'Gen', 'Blood'];
              for (let i = 0; i < amt; i++) {
                const randType = types[Math.floor(Math.random() * types.length)];
                u[randType]++;
              }
              return u;
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `✨ [${skill.name}] de ${source.character.name} gerou +${amt} de chakra elemental para ${t.character.name}!`,
              type: 'chakra',
            });
            addFloatingText(t.id, `+${amt} CHAKRA`, 'effect');
          }
          cleanseTargetEffects(t, skill.gainChakraRemoveType);
        });
      }

      // 1. DAMAGE & SHIELDS
      if (baseDamage > 0) {
        const damageTargets = resolveEffectTargets(skill.damageTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        damageTargets.forEach(t => {
          if (t.isDead) return;
          const startingShield = t.shield;
          const startingHealth = t.health;

          const sourceBuffs = source.activeEffects.filter(e => e.type === 'damage_buff');
          const damageBuffSum = sourceBuffs.reduce((acc, curr) => acc + (curr.value || 0), 0);
          let finalDamage = baseDamage + damageBuffSum;

          const targetReductions = t.activeEffects.filter(e => e.type === 'damage_reduction');
          const reductionSum = targetReductions.reduce((acc, curr) => acc + (curr.value || 0), 0);
          finalDamage = Math.max(0, finalDamage - reductionSum);

          if (t.shield > 0) {
            if (t.shield >= finalDamage) {
              t.shield -= finalDamage;
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `🛡️ ${source.character.name} atingiu o escudo de ${t.character.name} com [${skill.name}] causando ${finalDamage} de dano ao escudo.`,
                type: 'buff',
              });
              addFloatingText(t.id, `-${finalDamage} ESCUDO`, 'shield');
              finalDamage = 0;
            } else {
              finalDamage -= t.shield;
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `💥 ${source.character.name} quebrou o escudo de ${t.character.name}!`,
                type: 'damage',
              });
              addFloatingText(t.id, 'ESCUDO QUEBRADO', 'shield');
              t.shield = 0;
            }
          }

          if (finalDamage > 0) {
            t.health = Math.max(0, t.health - finalDamage);
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `💥 ${source.character.name} usou [${skill.name}] causando ${finalDamage} de dano em ${t.character.name}.`,
              type: 'damage',
            });
            addFloatingText(t.id, `-${finalDamage} HP`, 'damage');
          }

          const hasCounter = t.activeEffects.some(e => e.type === 'counter');
          if (hasCounter && finalDamage > 0) {
            source.health = Math.max(0, source.health - 15);
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `⚡ ${t.character.name} contra-atacou! Causou 15 de dano de volta em ${source.character.name}.`,
              type: 'damage',
            });
            addFloatingText(source.id, '-15 HP (CONTRA-ATAQUE)', 'damage');
          }
          cleanseTargetEffects(t, skill.damageRemoveType);

          const shieldReduced = startingShield - t.shield;
          const healthReduced = startingHealth - t.health;
          const damageTaken = shieldReduced + healthReduced;
          if (damageTaken > 0) {
            if (action.isPlayer) {
              matchStatsRef.current.damageDealt += damageTaken;
            } else {
              matchStatsRef.current.damageReceived += damageTaken;
            }
          }
          if (t.health === 0 && startingHealth > 0 && action.isPlayer) {
            matchStatsRef.current.killsWithSkill[skill.name] = (matchStatsRef.current.killsWithSkill[skill.name] || 0) + 1;
          }
        });
      }

      // 2. HEALING
      if (healAmt > 0) {
        const healTargets = resolveEffectTargets(skill.healTarget, target, source, sourceList, targetList, true);
        healTargets.forEach(t => {
          if (t.isDead) return;
          const startingHealth = t.health;
          t.health = Math.min(100, t.health + healAmt);
          const actualHealed = t.health - startingHealth;
          if (actualHealed > 0 && action.isPlayer) {
            matchStatsRef.current.healingDone += actualHealed;
          }
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `💚 ${source.character.name} usou [${skill.name}] e restaurou ${healAmt} de vida de ${t.character.name}.`,
            type: 'heal',
          });
          addFloatingText(t.id, `+${healAmt} HP`, 'heal');
          cleanseTargetEffects(t, skill.healRemoveType);
        });
      }

      // 3. STUNS
      if (stunApplied) {
        const stunTypeLabels: Record<string, string> = { physical: 'Físico', mental: 'Mental', affliction: 'Aflição', chakra: 'Chakra' };
        const resolvedStunTypes: ('mental' | 'physical' | 'affliction' | 'chakra')[] =
          (!finalStunType || finalStunType.length === 0 || finalStunType.length >= 4)
            ? ['physical', 'mental', 'affliction', 'chakra']
            : finalStunType;

        const stunTypeName = resolvedStunTypes.length >= 4
          ? 'Stun Completo'
          : `Stun (${resolvedStunTypes.map(t => stunTypeLabels[t] || t).join(' + ')})`;

        const stunTargets = resolveEffectTargets(skill.stunTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        stunTargets.forEach(t => {
          if (t.isDead) return;
          if (action.isPlayer) matchStatsRef.current.stunsApplied += 1;
          pushActiveEffect(t, {
            name: `${skill.name} (${stunTypeName})`,
            type: 'stun',
            duration: stunDuration,
            icon: skill.icon || source.character.portrait,
            stunType: resolvedStunTypes,
            irremovable: !!skill.stunIrremovable,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🌀 ${t.character.name} recebeu [${stunTypeName}] por [${skill.name}] de ${source.character.name} por ${stunDuration} turnos!`,
            type: 'stun',
          });
          addFloatingText(t.id, `STUN (${stunDuration}T)`, 'stun');
          cleanseTargetEffects(t, skill.stunRemoveType);
        });
      }

      // 4. SHIELDS & BUFFS
      if (skill.shieldVal && skill.shieldVal > 0) {
        const shieldTargets = resolveEffectTargets(skill.shieldTarget, target, source, sourceList, targetList, true);
        shieldTargets.forEach(t => {
          if (t.isDead) return;
          t.shield = (t.shield || 0) + skill.shieldVal!;
          if (action.isPlayer) matchStatsRef.current.shieldGenerated += skill.shieldVal!;
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🛡️ ${t.character.name} ganhou +${skill.shieldVal} de escudo com [${skill.name}]!`,
            type: 'buff',
          });
          addFloatingText(t.id, `+${skill.shieldVal} ESCUDO`, 'shield');
          cleanseTargetEffects(t, skill.shieldRemoveType);
        });
      }

      // 5. BUFFS & DEBUFFS (damage_reduction, damage_buff, invulnerable, dot, bleeding, affliction, counter, reflect)
      // Helper to push a buff effect
      const applyBuffEffect = (name: string, type: ActiveEffect['type'], duration: number, value: number = 0, isSelfTarget: boolean = true, isDebuffOnTarget: boolean = false) => {
        if (type === 'shield') {
          const t = isSelfTarget ? source : target;
          t.shield = (t.shield || 0) + value;
          newLogs.push({
            id: Math.random().toString(), turn,
            message: `🛡️ ${t.character.name} ganhou +${value} de escudo com [${skill.name}]!`,
            type: 'buff',
          });
          addFloatingText(t.id, `+${value} ESCUDO`, 'shield');
          return;
        }
        const t = isDebuffOnTarget ? target : (isSelfTarget ? source : target);
        pushActiveEffect(t, {
          name, type, value, duration, icon: skill.icon,
          cannotBeCountered: !!skill.cannotBeCountered, cannotBeReflected: !!skill.cannotBeReflected,
          casterId: source.id, casterSide: action.isPlayer ? 'player' : 'enemy',
        });
        newLogs.push({
          id: Math.random().toString(), turn,
          message: `✨ ${t.character.name} recebeu [${name}] por ${duration} turnos.`,
          type: 'buff',
        });
        addFloatingText(t.id, name.toUpperCase(), 'effect');
      };

      // Process ALL buff/debuff effects independently (supports multi-effect skills)

      // 1. Shields (from generic skill data)
      if (skill.shieldVal && skill.shieldVal > 0) {
        applyBuffEffect(`${skill.name} Shield`, 'shield', skill.shieldDuration || 99, skill.shieldVal, true);
      }

      // 2. Legacy hardcoded effects (by skill name)
      if (!skill.shieldVal) {
        switch (skill.name) {
          case 'Shadow Clones':
            applyBuffEffect('Shadow Clones', 'damage_reduction', 4, 15);
            break;
          case 'Sharingan':
            applyBuffEffect('Sharingan', 'damage_buff', 4, 10);
            break;
          case 'Sexy Technique': case 'Orochimaru Block': case 'Substitution':
          case 'Underground Hide': case 'Lee Guard': case 'Crow Clone Escape':
          case 'Eight Trigrams Rotation': case 'Choji Block':
            applyBuffEffect(skill.name, 'invulnerable', 1);
            break;
          case 'Inner Sakura':
            applyBuffEffect('Inner Sakura', 'damage_reduction', 4, 15);
            break;
          case 'Copied Sharingan':
            applyBuffEffect('Copied Sharingan', 'damage_reduction', 3, 10);
            break;
          case 'Sand Coffin':
            applyBuffEffect('Sand Coffin', 'custom', 2, 0, false, true);
            break;
          case 'Sand Shield':
            applyBuffEffect('Sand Shield', 'invulnerable', 1);
            break;
          case 'Fifth Gate Opening':
            applyBuffEffect('Fifth Gate Opening', 'damage_buff', 3, 15);
            break;
          case 'Amaterasu Burn':
            applyBuffEffect('Amaterasu Burn', 'dot', 3, 15, false, true);
            break;
          case 'Mangekyo Sharingan':
            applyBuffEffect('Mangekyo Sharingan', 'counter', 2);
            break;
          case 'Byakugan Sight':
            applyBuffEffect('Byakugan Sight', 'damage_reduction', 3, 15);
            break;
          case 'Three Colored Pills':
            applyBuffEffect('Three Colored Pills', 'damage_buff', 3, 15);
            break;
          case 'Sand Armor':
            applyBuffEffect('Sand Armor', 'shield', 99, 30);
            break;
        }
      }

      // 3. Generic skill properties (for admin-created multi-effect skills)
      // Each effect is checked independently so multiple can apply

      // Damage Reduction buff
      if (skill.damageReductionVal && skill.damageReductionVal > 0 && skill.name !== 'Shadow Clones' && skill.name !== 'Inner Sakura' && skill.name !== 'Copied Sharingan' && skill.name !== 'Byakugan Sight') {
        applyBuffEffect(`${skill.name} Guard`, 'damage_reduction', skill.damageReductionDuration || 3, skill.damageReductionVal);
      }

      // Damage Buff
      if (skill.damageBuffVal && skill.damageBuffVal > 0 && skill.name !== 'Sharingan' && skill.name !== 'Fifth Gate Opening' && skill.name !== 'Three Colored Pills') {
        applyBuffEffect(`${skill.name} Power`, 'damage_buff', skill.damageBuffDuration || 3, skill.damageBuffVal);
      }

      // Invulnerable
      if (skill.invulnerableDuration && skill.invulnerableDuration > 0) {
        applyBuffEffect(`${skill.name} Escape`, 'invulnerable', skill.invulnerableDuration);
      }

      // DoT (damage over time) - debuff on target
      if (skill.dotVal && skill.dotVal > 0 && skill.name !== 'Amaterasu Burn') {
        applyBuffEffect(`${skill.name} Burn`, 'dot', skill.dotDuration || 3, skill.dotVal, false, true);
      }

      // Bleeding - debuff on target
      if (skill.bleedingVal && skill.bleedingVal > 0) {
        applyBuffEffect(`${skill.name} Bleed`, 'bleeding', skill.bleedingDuration || 3, skill.bleedingVal, false, true);
      }

      // Affliction - debuff on target
      if (skill.afflictionVal && skill.afflictionVal > 0) {
        applyBuffEffect(`${skill.name} Affliction`, 'affliction', skill.afflictionDuration || 3, skill.afflictionVal, false, true);
      }

      // Counter Attack (applied as debuff on the selected target)
      if (skill.counterAttack) {
        applyBuffEffect(`${skill.name} Counter`, 'counter', skill.counterAttackDuration || 2, 0, false, true);
      }

      // Reflect (applied as debuff on the selected target)
      if (skill.reflect) {
        applyBuffEffect(`${skill.name} Reflect`, 'reflect', skill.reflectDuration || 2, 0, false, true);
      }

      // Check deaths immediately after actions
      sourceList.forEach(c => {
        if (c.health <= 0 && !c.isDead) {
          c.isDead = true;
          newLogs.push({ id: Math.random().toString(), turn, message: `💀 ${c.character.name} CAIU EM BATALHA!`, type: 'death' });
          playCustomSound('Death');
          addFloatingText(c.id, 'DERROTADO', 'damage');
        }
      });
      targetList.forEach(c => {
        if (c.health <= 0 && !c.isDead) {
          c.isDead = true;
          newLogs.push({ id: Math.random().toString(), turn, message: `💀 ${c.character.name} CAIU EM BATALHA!`, type: 'death' });
          playCustomSound('Death');
          addFloatingText(c.id, 'DERROTADO', 'damage');
        }
      });
    });

    // Save updated state
    setPlayerCombatants(updatedPlayer);
    setEnemyCombatants(updatedEnemy);
    setLogs(prev => [...prev, ...newLogs]);

    // Check game over
    const allPlayerDead = updatedPlayer.every(p => p.isDead);
    const allEnemyDead = updatedEnemy.every(e => e.isDead);

    if (allPlayerDead || allEnemyDead) {
      if (allPlayerDead && allEnemyDead) setGameOver('defeat');
      else if (allPlayerDead) setGameOver('defeat');
      else setGameOver('victory');
      return true; // Match ended
    }
    return false;
  };

  // Helper to execute end-of-turn effects after BOTH players have completed their action phase
  const executeTurnEndResolution = () => {
    const newLogs: CombatLog[] = [];
    const updatedPlayer = playerCombatants.map(c => ({ ...c }));
    const updatedEnemy = enemyCombatants.map(c => ({ ...c }));

    const applyTurnEndUpdates = (combatantList: CombatCharacter[], name: string) => {
      combatantList.forEach(c => {
        if (c.isDead) return;

        // Apply active DoTs
        const dotEffects = c.activeEffects.filter(e => e.type === 'dot');
        dotEffects.forEach(dot => {
          c.health = Math.max(0, c.health - (dot.value || 0));
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🔥 ${c.character.name} sofreu ${(dot.value || 0)} de dano de queima por ${dot.name}.`,
            type: 'damage',
          });
          addFloatingText(c.id, `-${(dot.value || 0)} HP (QUEIMA)`, 'damage');
        });

        // Apply dynamic Healing over time
        const activeHealEffects = c.activeEffects.filter(e => e.type === 'heal');
        activeHealEffects.forEach(hl => {
          c.health = Math.min(100, c.health + (hl.value || 0));
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `💚 ${c.character.name} recuperou ${(hl.value || 0)} de vida por ${hl.name}.`,
            type: 'heal',
          });
          addFloatingText(c.id, `+${(hl.value || 0)} HP (REGEN)`, 'heal');
        });

        // Check if dead now
        if (c.health <= 0) {
          c.isDead = true;
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `💀 ${c.character.name} CAIU EM BATALHA!`,
            type: 'death',
          });
          playCustomSound('Death');
          addFloatingText(c.id, 'DERROTADO', 'damage');
        }

        // Decrement effect durations
        c.activeEffects = c.activeEffects
          .map(eff => ({ ...eff, duration: eff.duration - 1 }))
          .filter(eff => eff.duration > 0);

        // Decrement skill cooldowns
        c.character.skills.forEach(s => {
          if (s.currentCooldown > 0) s.currentCooldown--;
        });
      });
    };

    applyTurnEndUpdates(updatedPlayer, 'Player');
    applyTurnEndUpdates(updatedEnemy, 'Enemy');

    setPlayerCombatants(updatedPlayer);
    setEnemyCombatants(updatedEnemy);

    // Check game over
    const allPlayerDead = updatedPlayer.every(p => p.isDead);
    const allEnemyDead = updatedEnemy.every(e => e.isDead);

    if (allPlayerDead || allEnemyDead) {
      if (allPlayerDead && allEnemyDead) setGameOver('defeat');
      else if (allPlayerDead) setGameOver('defeat');
      else setGameOver('victory');
      return;
    }

    // Advance turn
    const alivePlayerCount = updatedPlayer.filter(c => !c.isDead).length;
    const aliveEnemyCount = updatedEnemy.filter(c => !c.isDead).length;

    const nextTurn = turn + 1;
    setTurn(nextTurn);
    rollChakraForTurn(true, alivePlayerCount);
    rollChakraForTurn(false, aliveEnemyCount);

    // Roll initiative for new turn (50/50 chance)
    const newFirstPlayer: 'player' | 'enemy' = Math.random() < 0.5 ? 'player' : 'enemy';
    setActivePlanner(newFirstPlayer);
    setPassedPlayersThisTurn([]);

    newLogs.push({
      id: Math.random().toString(),
      turn: nextTurn,
      message: newFirstPlayer === 'player'
        ? `🎲 [INICIATIVA] Você ganhou o sorteio e joga PRIMEIRO no Turno ${nextTurn}!`
        : `🎲 [INICIATIVA] O Oponente ganhou o sorteio e joga PRIMEIRO no Turno ${nextTurn}!`,
      type: 'system',
    });

    setLogs(prev => [...prev, ...newLogs]);
  };

  // Main End Turn / Pass Turn handler
  const handleEndTurn = () => {
    playCustomSound('NextTurn');

    const currentActions = [...cuedActions];
    setCuedActions([]);
    setSelectedSkill(null);

    const isCurrentPlayer = activePlanner === 'player';
    const isGameOver = executeSideActions(currentActions, isCurrentPlayer);
    if (isGameOver) return;

    if (onlineParams?.isOnline) {
      fetch('/api/match/submit-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: onlineParams.roomId,
          username: user.username,
          turn: turn,
          actions: currentActions
        })
      }).catch(err => console.error("Error submitting turn online:", err));
    }

    const newPassed = [...passedPlayersThisTurn, activePlanner];
    setPassedPlayersThisTurn(newPassed);

    if (newPassed.length < 2) {
      const nextPlanner = activePlanner === 'player' ? 'enemy' : 'player';
      setActivePlanner(nextPlanner);
      if (onlineParams?.isOnline) {
        setIsWaitingForOpponent(true);
      }
      setLogs(prev => [
        ...prev,
        {
          id: Math.random().toString(),
          turn,
          message: `⚔️ HABILIDADES EXECUTADAS! Vez de ${nextPlanner === 'player' ? 'VOCÊ' : 'OPONENTE'} jogar.`,
          type: 'system',
        }
      ]);
    } else {
      setIsWaitingForOpponent(false);
      executeTurnEndResolution();
    }
  };

  // AI Turn Trigger Effect for Offline Mode (ADVANCED TACTICAL HARD AI)
  useEffect(() => {
    if (gameOver || isSandbox || onlineParams?.isOnline) return;

    if (activePlanner === 'enemy' && !passedPlayersThisTurn.includes('enemy')) {
      const timer = setTimeout(() => {
        const aiActions: CuedAction[] = [];
        let tempAiChakra = { ...enemyChakra };

        // 1. SMART CHAKRA TRADING (4 -> 1):
        // If AI has 4+ of an element and lacks 1 element for a key skill, trade 4->1
        const elements: (keyof ChakraPool)[] = ['Tai', 'Nin', 'Gen', 'Blood'];
        elements.forEach(sourceElem => {
          if (tempAiChakra[sourceElem] >= 4) {
            for (const aiChar of enemyCombatants) {
              if (aiChar.isDead) continue;
              for (const skill of aiChar.character.skills) {
                if (skill.currentCooldown > 0 || isSkillBlockedByStun(skill, aiChar.activeEffects)) continue;
                for (const targetElem of elements) {
                  if (targetElem === sourceElem) continue;
                  const testPool = { ...tempAiChakra };
                  testPool[sourceElem] -= 4;
                  testPool[targetElem] += 1;
                  if (canAffordSkill(skill, testPool)) {
                    tempAiChakra = testPool;
                    break;
                  }
                }
              }
            }
          }
        });

        // 2. TACTICAL MULTI-SKILL ACTION SELECTION ENGINE:
        let actionAdded = true;
        let loopSafety = 0;

        while (actionAdded && loopSafety < 10) {
          actionAdded = false;
          loopSafety++;

          let bestAction: CuedAction | null = null;
          let bestScore = -9999;
          let bestSkillCost: ChakraType[] = [];

          const alivePlayers = playerCombatants.filter(p => !p.isDead);
          const aliveAllies = enemyCombatants.filter(e => !e.isDead);

          if (alivePlayers.length === 0 || aliveAllies.length === 0) break;

          // Find primary target (lowest HP player ninja) for focus firing
          const sortedPlayersByHp = [...alivePlayers].sort((a, b) => a.health - b.health);
          const primaryTarget = sortedPlayersByHp[0];

          for (const aiChar of aliveAllies) {
            const alreadyCuedCount = aiActions.filter(a => a.sourceId === aiChar.id).length;
            if (alreadyCuedCount >= 2) continue; // max 2 skills per ninja per turn

            const usableSkills = aiChar.character.skills
              .map((skill, idx) => ({ skill, idx }))
              .filter(({ skill, idx }) => {
                if (skill.currentCooldown > 0) return false;
                if (isSkillBlockedByStun(skill, aiChar.activeEffects)) return false;
                if (!canAffordSkill(skill, tempAiChakra)) return false;
                if (skill.requireEffect && !aiChar.activeEffects.some(e => e.name === skill.requireEffect)) return false;
                if (aiActions.some(a => a.sourceId === aiChar.id && a.skillIndex === idx)) return false;
                return true;
              });

            for (const { skill, idx } of usableSkills) {
              let candidateTargets: CombatCharacter[] = [];

              if (skill.targetType === 'Self') {
                candidateTargets = [aiChar];
              } else if (skill.targetType === 'Ally') {
                candidateTargets = aliveAllies;
              } else if (skill.targetType === 'AllAllies') {
                candidateTargets = [aiChar];
              } else if (skill.targetType === 'Enemy' || skill.targetType === 'AllEnemies') {
                candidateTargets = alivePlayers;
              }

              for (const target of candidateTargets) {
                let score = 0;

                const targetIsEnemy = target.id.startsWith('player');
                const hasInvulnerable = target.activeEffects.some(e => e.type === 'invulnerable');
                const hasInvisible = target.activeEffects.some(e => e.type === 'invisible');
                const hasReflect = target.activeEffects.some(e => e.type === 'reflect');
                const hasCounter = target.activeEffects.some(e => e.type === 'counter_attack' || e.type === 'counter');
                const hasShield = target.shield > 0;

                // --- OFFENSIVE SKILL SCORING ---
                if (targetIsEnemy) {
                  if (hasInvulnerable && !skill.ignoreInvulnerable) {
                    score -= 2000;
                  }
                  if (hasInvisible && !skill.ignoreInvulnerable) {
                    score -= 2000;
                  }
                  if (hasReflect && !skill.cannotBeReflected) {
                    score -= 1500;
                  }
                  if (hasCounter && !skill.cannotBeCountered) {
                    score -= 800;
                  }

                  const rawDmg = (skill.damage || 0) + (skill.directDamage || 0);
                  const dotDmg = ((skill.dotVal || 0) * (skill.dotDuration || 1)) +
                                 ((skill.bleedingVal || 0) * (skill.bleedingDuration || 1)) +
                                 ((skill.afflictionVal || 0) * (skill.afflictionDuration || 1));
                  const totalDmg = rawDmg + dotDmg;

                  score += totalDmg * 2;

                  // LETHAL FINISHER BONUS (+2500): Focus and kill low HP ninjas!
                  if (rawDmg > 0 && target.health <= rawDmg) {
                    score += 2500;
                  } else if (totalDmg > 0 && (target.health + target.shield) <= totalDmg) {
                    score += 1500;
                  }

                  // FOCUS FIRE BONUS (+600)
                  if (primaryTarget && target.id === primaryTarget.id) {
                    score += 600;
                  }

                  // STUN BONUS (+900)
                  if (skill.stunTurns && skill.stunTurns > 0) {
                    const targetIsAlreadyStunned = target.activeEffects.some(e => e.type === 'stun');
                    if (!targetIsAlreadyStunned) {
                      score += 900;
                    } else {
                      score -= 300;
                    }
                  }

                  // CHAKRA DRAIN (+450)
                  if (skill.drainChakra && skill.drainChakra > 0) {
                    score += 450;
                  }

                  // REMOVE SHIELD (+600)
                  if (skill.removeShield && hasShield) {
                    score += 600;
                  }
                } else {
                  // --- DEFENSIVE / SUPPORT SKILL SCORING ---
                  if (skill.heal && skill.heal > 0) {
                    const missingHp = target.maxHealth - target.health;
                    if (missingHp > 20) {
                      const healAmount = Math.min(skill.heal, missingHp);
                      score += healAmount * 3;
                      if (target.health / target.maxHealth < 0.4) {
                        score += 1000;
                      }
                    } else {
                      score -= 500;
                    }
                  }

                  if (skill.shieldVal && skill.shieldVal > 0) {
                    if (target.health / target.maxHealth < 0.7 && target.shield === 0) {
                      score += (skill.shieldVal * 2) + 400;
                    } else {
                      score += 100;
                    }
                  }

                  if (skill.invulnerableDuration || skill.reflect || skill.counterAttack) {
                    if (target.health / target.maxHealth < 0.5) {
                      score += 1200;
                    } else {
                      score += 400;
                    }
                  }

                  if (skill.gainChakra || skill.damageBuffVal) {
                    score += 350;
                  }

                  if (skill.damageReductionVal && skill.damageReductionVal > 0) {
                    score += skill.damageReductionVal * 2 + 300;
                  }

                  if (skill.damageBuffVal && skill.damageBuffVal > 0) {
                    const alreadyHasBuff = target.activeEffects.some(e => e.type === 'damage_buff');
                    if (!alreadyHasBuff) score += skill.damageBuffVal * 3 + 400;
                    else score += 100;
                  }

                  // Cleanse allies (remove debuffs)
                  if (skill.stunRemoveType || skill.damageRemoveType) {
                    const hasDebuff = target.activeEffects.some(e =>
                      e.type === 'stun' || e.type === 'dot' || e.type === 'bleeding' || e.type === 'affliction'
                    );
                    if (hasDebuff) score += 800;
                  }
                }

                if (score > bestScore) {
                  bestScore = score;
                  bestAction = { sourceId: aiChar.id, skillIndex: idx, targetId: target.id };
                  bestSkillCost = skill.cost;
                }
              }
            }
          }

          if (bestAction && bestScore > -5000) {
            aiActions.push(bestAction);
            actionAdded = true;

            let randCost = 0;
            bestSkillCost.forEach(cost => {
              if (cost === 'Rand') randCost++;
              else {
                const element = cost as keyof ChakraPool;
                if (tempAiChakra[element] > 0) tempAiChakra[element]--;
              }
            });
            for (let i = 0; i < randCost; i++) {
              const sorted = (Object.keys(tempAiChakra) as (keyof ChakraPool)[]).sort((a, b) => tempAiChakra[b] - tempAiChakra[a]);
              const highestElement = sorted[0];
              if (tempAiChakra[highestElement] > 0) tempAiChakra[highestElement]--;
            }
          }
        }

        const isGameOver = executeSideActions(aiActions, false);
        if (isGameOver) return;

        const newPassed: ('player' | 'enemy')[] = [...passedPlayersThisTurn, 'enemy'];
        setPassedPlayersThisTurn(newPassed);

        if (newPassed.length < 2) {
          setActivePlanner('player');
          setLogs(prev => [
            ...prev,
            {
              id: Math.random().toString(),
              turn,
              message: `⚔️ OPONENTE EXECUTOU AS HABILIDADES! Sua vez de jogar em resposta.`,
              type: 'system',
            }
          ]);
        } else {
          executeTurnEndResolution();
        }
      }, 700);

      return () => clearTimeout(timer);
    }
  }, [activePlanner, passedPlayersThisTurn, gameOver, isSandbox, onlineParams, enemyCombatants, playerCombatants, enemyChakra, turn]);

  const [showSurrenderModal, setShowSurrenderModal] = useState(false);

  const handleSurrender = () => {
    playClickSound();
    setShowSurrenderModal(true);
  };

  const confirmSurrender = async () => {
    playClickSound();
    setShowSurrenderModal(false);
    try {
      localStorage.removeItem('active_match_save');
    } catch {}
    setGameOver('defeat');

    if (onlineParams?.isOnline) {
      try {
        await fetch('/api/match/surrender', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: onlineParams.roomId,
            username: user.username
          })
        });
      } catch (err) {
        console.error('Error sending surrender signal:', err);
      }
    }
  };

  // 30-Second Turn Timer State & Effect
  const [timeLeft, setTimeLeft] = useState(30);
  const handleEndTurnRef = useRef(handleEndTurn);

  useEffect(() => {
    handleEndTurnRef.current = handleEndTurn;
  }, [handleEndTurn]);

  // Online Match Turn Initiative Setup Effect
  useEffect(() => {
    if (!onlineParams?.isOnline || gameOver) return;

    const myOnlineIndex = onlineParams.playerIndex === 2 ? 1 : 0;
    const whoGoesFirst = (turn % 2 === 1) ? 0 : 1;
    const isOurTurnToPlan = myOnlineIndex === whoGoesFirst;

    if (isOurTurnToPlan) {
      setActivePlanner('player');
      setIsWaitingForOpponent(false);
    } else {
      setActivePlanner('enemy');
      setIsWaitingForOpponent(true);
    }
  }, [turn, onlineParams, gameOver]);

  // Online Match Opponent Turn Polling Effect (runs whenever we are waiting for opponent)
  useEffect(() => {
    if (!onlineParams?.isOnline || gameOver || !isWaitingForOpponent) return;

    const myOnlineIndex = onlineParams.playerIndex === 2 ? 1 : 0;
    const oppOnlineIndex = 1 - myOnlineIndex;

    const pollInterval = setInterval(async () => {
      try {
        const statusRes = await fetch(`/api/match/room-state?roomId=${onlineParams.roomId}&turn=${turn}&username=${encodeURIComponent(user.username)}`);
        const statusData = await statusRes.json();

        if (statusData.success && statusData.room) {
          // Handle disconnection / surrender
          if (statusData.room.surrenderedBy) {
            const surrenderedUser = statusData.room.surrenderedBy.toLowerCase();
            clearInterval(pollInterval);
            setIsWaitingForOpponent(false);
            try {
              localStorage.removeItem('active_match_save');
            } catch {}
            if (surrenderedUser === user.username.toLowerCase()) {
              setGameOver('defeat');
            } else {
              setGameOver('victory');
            }
            return;
          }

          const turnActions = statusData.room.turnActions;
          const currentTurnData = turnActions?.[turn];
          const oppActions = oppOnlineIndex === 0 ? currentTurnData?.player0 : currentTurnData?.player1;

          // Check if opponent has submitted actions for this turn (accepts [] if they passed with 0 skills)
          if (oppActions !== null && oppActions !== undefined && Array.isArray(oppActions)) {
            clearInterval(pollInterval);

            // Swap player- and enemy- prefixes for opponent's actions to align with our local combatants
            const mappedOppActions: CuedAction[] = oppActions.map((a: CuedAction) => ({
              ...a,
              sourceId: a.sourceId ? a.sourceId.replace('player-', 'TEMP').replace('enemy-', 'player-').replace('TEMP', 'enemy-') : a.sourceId,
              targetId: a.targetId ? a.targetId.replace('player-', 'TEMP').replace('enemy-', 'player-').replace('TEMP', 'enemy-') : a.targetId
            }));

            // Execute opponent's actions on our local board
            executeSideActions(mappedOppActions, false);

            const newPassed: ('player' | 'enemy')[] = [...passedPlayersThisTurn, 'enemy'];
            setPassedPlayersThisTurn(newPassed);

            if (newPassed.length < 2) {
              // Opponent played first; now it's our turn to plan
              playCustomSound('NextTurn');
              setActivePlanner('player');
              setIsWaitingForOpponent(false);
            } else {
              // Both players have completed their turns for this turn cycle
              setIsWaitingForOpponent(false);
              executeTurnEndResolution();
            }
          }
        }
      } catch (err) {
        console.error('Error polling opponent planning state:', err);
      }
    }, 1200);

    return () => clearInterval(pollInterval);
  }, [turn, isWaitingForOpponent, onlineParams, gameOver, passedPlayersThisTurn, user.username]);

  // Periodic background heartbeat ping
  useEffect(() => {
    if (!onlineParams?.isOnline || gameOver) return;

    const pingInterval = setInterval(() => {
      fetch(`/api/match/room-state?roomId=${onlineParams.roomId}&username=${encodeURIComponent(user.username)}`)
        .then(r => r.json())
        .then(data => {
          if (data.success && data.room && data.room.surrenderedBy) {
            const surrenderedUser = data.room.surrenderedBy.toLowerCase();
            try {
              localStorage.removeItem('active_match_save');
            } catch {}
            if (surrenderedUser === user.username.toLowerCase()) {
              setGameOver('defeat');
            } else {
              setGameOver('victory');
            }
          }
        })
        .catch(err => console.error('Heartbeat ping failed:', err));
    }, 10000);

    return () => clearInterval(pingInterval);
  }, [onlineParams, gameOver, user]);

  // Auto-save game state to local storage on key changes, or remove it when game over
  useEffect(() => {
    if (gameOver) {
      try {
        localStorage.removeItem('active_match_save');
      } catch {}
      return;
    }

    if (playerCombatants.length === 0 || enemyCombatants.length === 0) return;

    try {
      const compressCombatant = (c: CombatCharacter) => ({
        id: c.id,
        health: c.health,
        maxHealth: c.maxHealth,
        shield: c.shield,
        isDead: c.isDead,
        activeEffects: c.activeEffects || [],
        character: {
          id: c.character.id,
          name: c.character.name,
          portrait: c.character.portrait,
          selectedSkinId: c.character.selectedSkinId,
          selectedSkinUrl: c.character.selectedSkinUrl,
          folder: c.character.folder,
          skills: (c.character.skills || []).map(s => ({
            name: s.name,
            cost: s.cost,
            cooldown: s.cooldown,
            currentCooldown: s.currentCooldown,
            targetType: s.targetType,
            icon: s.icon,
            damage: s.damage,
            classes: s.classes
          }))
        }
      });

      const stateToSave = {
        turn,
        playerCombatants: playerCombatants.map(compressCombatant),
        enemyCombatants: enemyCombatants.map(compressCombatant),
        playerChakra,
        enemyChakra,
        onlineParams,
        isSandbox
      };
      localStorage.setItem('active_match_save', JSON.stringify(stateToSave));
    } catch (err) {
      console.warn("Could not save active match state to localStorage:", err);
    }
  }, [turn, playerCombatants, enemyCombatants, playerChakra, enemyChakra, onlineParams, isSandbox, gameOver]);

  useEffect(() => {
    if (gameOver) {
      return;
    }
    if (isWaitingForOpponent) {
      return;
    }

    // Reset countdown to 30 seconds for the new active turn/planning phase
    setTimeLeft(30);

    const timerInterval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerInterval);
          // Auto-submit / auto-end turn when time runs out
          handleEndTurnRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [turn, gameOver, isWaitingForOpponent, activePlanner]);

  const executeTurnSimulation = (playerActions: CuedAction[] = [], enemyActions: CuedAction[] = []) => {
    const newLogs: CombatLog[] = [];
    const updatedPlayer = playerCombatants.map(c => ({ ...c, lastTurnStatus: null }));
    const updatedEnemy = enemyCombatants.map(c => ({ ...c, lastTurnStatus: null }));

    const resolveEffectTargets = (
      targetOverride: string | undefined,
      defaultTarget: CombatCharacter,
      source: CombatCharacter,
      sourceList: CombatCharacter[],
      targetList: CombatCharacter[],
      isBeneficial: boolean = false
    ): CombatCharacter[] => {
      if (!targetOverride || targetOverride === 'Target') {
        if (isBeneficial) {
          const sourceIsPlayer = updatedPlayer.some(p => p.id === source.id);
          const targetIsPlayer = updatedPlayer.some(p => p.id === defaultTarget.id);
          if (sourceIsPlayer !== targetIsPlayer) {
            return [source];
          }
        }
        return [defaultTarget];
      }
      if (targetOverride === 'Self') return [source];
      if (targetOverride === 'Both') return [source, defaultTarget];
      if (targetOverride === 'Ally') {
        if (sourceList.some(c => c.id === defaultTarget.id)) return [defaultTarget];
        const allies = sourceList.filter(c => c.id !== source.id && !c.isDead);
        return allies.length > 0 ? [allies[0]] : [source];
      }
      if (targetOverride === 'AllAllies') {
        return sourceList.filter(c => !c.isDead);
      }
      if (targetOverride === 'AllEnemies') {
        return targetList.filter(c => !c.isDead);
      }
      if (targetOverride === 'AllLiving') {
        return [...sourceList, ...targetList].filter(c => !c.isDead);
      }
      if (targetOverride === 'AllNonInvulnerable') {
        return [...sourceList, ...targetList].filter(c => !c.isDead && !c.activeEffects.some(e => e.type === 'invulnerable'));
      }
      if (targetOverride === 'AllInvulnerable') {
        return [...sourceList, ...targetList].filter(c => !c.isDead && c.activeEffects.some(e => e.type === 'invulnerable'));
      }
      if (targetOverride === 'OneInvulnerable') {
        const invuls = [...sourceList, ...targetList].filter(c => !c.isDead && c.activeEffects.some(e => e.type === 'invulnerable'));
        return invuls.length > 0 ? [invuls[0]] : [];
      }
      if (targetOverride === 'OneInvulnerableAlly') {
        const allies = sourceList.filter(c => !c.isDead && c.activeEffects.some(e => e.type === 'invulnerable'));
        return allies.length > 0 ? [allies[0]] : [];
      }
      if (targetOverride === 'SelfAndAllEnemies') {
        return [source, ...targetList.filter(c => !c.isDead)];
      }
      return [defaultTarget];
    };

    // Combine player and enemy actions for this turn
    const allActions = [
      ...playerActions.map(a => ({ ...a, isPlayer: true })),
      ...enemyActions.map(a => ({ ...a, isPlayer: false })),
    ];

    // Log the turn header
    newLogs.push({
      id: Math.random().toString(),
      turn,
      message: `⚡ RESOLUÇÃO DO TURNO ${turn}:`,
      type: 'system',
    });

    // Execute actions
    allActions.forEach(action => {
      const sourceList = action.isPlayer ? updatedPlayer : updatedEnemy;
      const targetList = action.isPlayer ? updatedEnemy : updatedPlayer;

      const source = sourceList.find(c => c.id === action.sourceId);
      if (!source || source.isDead) return;

      const skill = source.character.skills[action.skillIndex];

      // Stun check
      if (isSkillBlockedByStun(skill, source.activeEffects)) {
        newLogs.push({
          id: Math.random().toString(),
          turn,
          message: `🌀 [${skill.name}] de ${source.character.name} foi IMPEDIDO porque ele está ATORDOADO!`,
          type: 'system',
        });
        addFloatingText(source.id, 'ATORDOADO!', 'stun');
        source.lastTurnStatus = 'ATORDOADO';
        return;
      }
      // Lock cooldown
      skill.currentCooldown = skill.cooldown;

      // 1. CHECK OUTGOING NEGATE (counter_attack debuff on source/attacker)
      const isOffensive = (skill.damage && skill.damage > 0) ||
                          (skill.directDamage && skill.directDamage > 0) ||
                          (skill.dotVal && skill.dotVal > 0) ||
                          (skill.bleedingVal && skill.bleedingVal > 0) ||
                          (skill.afflictionVal && skill.afflictionVal > 0) ||
                          (skill.stunTurns && skill.stunTurns > 0) ||
                          skill.targetType === 'Enemy' ||
                          skill.targetType === 'AllEnemies';

      if (isOffensive) {
        const negateAttackerEffect = source.activeEffects.find(e => e.type === 'counter_attack' && e.counterAttackType === 'attacker');
        if (negateAttackerEffect) {
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🚫 [${skill.name}] de ${source.character.name} foi ANULADO devido ao Contra-Ataque ativo nele!`,
            type: 'system',
          });
          addFloatingText(source.id, 'ANULADO', 'effect');
          source.lastTurnStatus = 'ANULADO';
          negateAttackerEffect.duration -= 1;
          if (negateAttackerEffect.duration <= 0) {
            source.activeEffects = source.activeEffects.filter(e => e !== negateAttackerEffect);
          }
          return; // cancel skill execution completely
        }
      }

      let target = targetList.find(c => c.id === action.targetId) || sourceList.find(c => c.id === action.targetId);
      if (!target || target.isDead) return;

      // CHECK INVULNERABILITY
      const isInvulnerable = target.activeEffects.some(e => e.type === 'invulnerable');
      if (isInvulnerable && !skill.ignoreInvulnerable) {
        newLogs.push({
          id: Math.random().toString(),
          turn,
          message: `🛡️ ${source.character.name} usou [${skill.name}] em ${target.character.name}, mas o alvo está INVULNERÁVEL!`,
          type: 'buff',
        });
        addFloatingText(target.id, 'INVULNERÁVEL', 'invulnerable');
        return;
      }

      let isReflected = false;

      // CHECK REFLECT / COUNTER ATTACK
      if (isOffensive) {
        // Look for any active reflect effect on any living member of the target team (defending team)
        let foundReflect: { def: CombatCharacter; effect: any } | null = null;
        for (const def of targetList) {
          if (def.isDead) continue;
          const eff = def.activeEffects.find(e => e.type === 'reflect');
          if (eff) {
            // A reflect is self-cast (protects team) if casterId matches targetId or if they are undefined
            const isSelfCast = !eff.casterId || !eff.targetId || (eff.casterId === eff.targetId);
            if (isSelfCast) {
              foundReflect = { def, effect: eff };
              break;
            } else {
              // Cast on specific ally - only triggers if that ally is the attacked target
              if (def.id === target.id) {
                foundReflect = { def, effect: eff };
                break;
              }
            }
          }
        }

        if (foundReflect && !skill.cannotBeReflected) {
          isReflected = true;
          let newTarget = source;
          if (foundReflect.effect.reflectMode === 'RandomAlly') {
            const allies = sourceList.filter(c => !c.isDead && c.id !== source.id);
            newTarget = allies.length > 0 ? allies[Math.floor(Math.random() * allies.length)] : source;
          }
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🔄 ${foundReflect.def.character.name} REFLETIU [${skill.name}] de volta para ${newTarget.character.name}!`,
            type: 'system',
          });
          addFloatingText(foundReflect.def.id, 'REFLETIDO', 'effect');
          
          foundReflect.def.lastTurnStatus = 'REFLETIDO';

          // Decrement charges if passive reflect
          if (foundReflect.effect.reflectType === 'passive') {
            const currentCharges = foundReflect.effect.reflectCharges !== undefined ? foundReflect.effect.reflectCharges : 1;
            const newCharges = currentCharges - 1;
            foundReflect.effect.reflectCharges = newCharges;
            if (newCharges <= 0) {
              foundReflect.def.activeEffects = foundReflect.def.activeEffects.filter(e => e !== foundReflect.effect);
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `🛡️ O efeito passivo de Reflexão de ${foundReflect.def.character.name} foi totalmente consumido!`,
                type: 'system',
              });
            } else {
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `🛡️ O efeito passivo de Reflexão de ${foundReflect.def.character.name} agora possui ${newCharges} carga(s) restante(s).`,
                type: 'system',
              });
            }
          }

          // Duration of reflect is NOT decremented on trigger anymore to allow full duration as requested.
          target = newTarget;
        } else {
          const counterEffect = target.activeEffects.find(e => e.type === 'counter_attack' && (e.counterAttackType === 'defender' || !e.counterAttackType));
          if (counterEffect && !skill.cannotBeCountered) {
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🚫 ${target.character.name} CONTRA-ATACOU e anulou [${skill.name}] de ${source.character.name}!`,
              type: 'system',
            });
            addFloatingText(target.id, 'ANULADO', 'effect');
            
            target.lastTurnStatus = 'CONTRA-ATAQUE';
            source.lastTurnStatus = 'ANULADO';

            counterEffect.duration -= 1;
            if (counterEffect.duration <= 0) {
              target.activeEffects = target.activeEffects.filter(e => e !== counterEffect);
            }
            return; // pula toda a skill
          }
        }
      }

      // Track successful skill usage (if action.isPlayer is true and it wasn't reflected)
      if (action.isPlayer && !isReflected) {
        matchStatsRef.current.skillsUsed[skill.name] = (matchStatsRef.current.skillsUsed[skill.name] || 0) + 1;
      }

      // EXECUTE SKILL LOGIC
      let baseDamage = skill.damage || 0;
      let directDamage = skill.directDamage || 0;
      let healAmt = skill.heal || 0;
      let stunApplied = (skill.stunTurns && skill.stunTurns > 0) ? true : false;
      let stunDuration = skill.stunTurns || 1;
      let finalStunType: ('mental' | 'physical' | 'affliction' | 'chakra')[] | undefined = skill.stunType;
      if (skill.name === 'Rasengan') {
        stunApplied = true;
        stunDuration = 1;
        finalStunType = ['physical', 'mental', 'affliction', 'chakra'];
      } else if (stunApplied && (!finalStunType || finalStunType.length === 0)) {
        finalStunType = ['physical', 'mental', 'affliction', 'chakra'];
      }
      let removeShields = skill.removeShield || false;

      let effectName = '';
      let effectDuration = 0;
      let effectType: ActiveEffect['type'] = 'custom';
      let effectVal = 0;

      // Automatically map custom dynamic effect fields if defined
      if (skill.shieldVal) {
        effectName = `${skill.name} Shield`;
        effectType = 'shield';
        effectDuration = skill.shieldDuration || 99; // 99 for indefinite
        effectVal = skill.shieldVal;
      } else if (skill.damageReductionVal) {
        effectName = `${skill.name} Guard`;
        effectType = 'damage_reduction';
        effectDuration = skill.damageReductionDuration || 3;
        effectVal = skill.damageReductionVal;
      } else if (skill.damageBuffVal) {
        effectName = `${skill.name} Power`;
        effectType = 'damage_buff';
        effectDuration = skill.damageBuffDuration || 3;
        effectVal = skill.damageBuffVal;
      } else if (skill.invulnerableDuration) {
        effectName = `${skill.name} Escape`;
        effectType = 'invulnerable';
        effectDuration = skill.invulnerableDuration;
      } else if (skill.dotVal) {
        effectName = `${skill.name} Burn`;
        effectType = 'dot';
        effectDuration = skill.dotDuration || 3;
        effectVal = skill.dotVal;
      }

      // Custom skill script matching based on name (legacy matching for original cast):
      switch (skill.name) {
        // --- NARUTO ---
        case 'Uzumaki Barrage':
          const clonesActive = source.activeEffects.some(e => e.name === 'Shadow Clones');
          baseDamage = clonesActive ? 30 : 20;
          break;
        case 'Rasengan':
          baseDamage = 45;
          stunApplied = true;
          finalStunType = ['physical'];
          break;
        case 'Shadow Clones':
          effectName = 'Shadow Clones';
          effectType = 'damage_reduction';
          effectDuration = 4;
          effectVal = 15;
          break;
        case 'Sexy Technique':
          effectName = 'Sexy Technique';
          effectType = 'invulnerable';
          effectDuration = 1;
          break;

        // --- SASUKE ---
        case 'Lions Barrage':
          const targetAnalyzed = target.activeEffects.some(e => e.name === 'Sharingan');
          baseDamage = targetAnalyzed ? 45 : 30;
          break;
        case 'Chidori':
          baseDamage = 40;
          break;
        case 'Sharingan':
          effectName = 'Sharingan';
          effectType = 'damage_buff';
          effectDuration = 4;
          effectVal = 10;
          break;
        case 'Orochimaru Block':
          effectName = 'Orochimaru Block';
          effectType = 'invulnerable';
          effectDuration = 1;
          break;

        // --- SAKURA ---
        case 'KO Punch':
          const innerActive = source.activeEffects.some(e => e.name === 'Inner Sakura');
          baseDamage = innerActive ? 35 : 20;
          stunApplied = true;
          finalStunType = ['physical'];
          break;
        case 'Healing Technique':
          healAmt = 25;
          break;
        case 'Inner Sakura':
          effectName = 'Inner Sakura';
          effectType = 'damage_reduction';
          effectDuration = 4;
          effectVal = 15;
          break;
        case 'Substitution':
          effectName = 'Substitution';
          effectType = 'invulnerable';
          effectDuration = 1;
          break;

        // --- KAKASHI ---
        case 'Lightning Blade':
          baseDamage = 40;
          break;
        case 'Copied Sharingan':
          effectName = 'Copied Sharingan';
          effectType = 'damage_reduction';
          effectDuration = 3;
          effectVal = 10;
          break;
        case 'Ninja Hounds':
          baseDamage = 15;
          stunApplied = true;
          finalStunType = ['affliction'];
          break;
        case 'Underground Hide':
          effectName = 'Underground Hide';
          effectType = 'invulnerable';
          effectDuration = 1;
          break;

        // --- GAARA ---
        case 'Sand Coffin':
          baseDamage = 15;
          effectName = 'Sand Coffin';
          effectType = 'custom';
          effectDuration = 2;
          break;
        case 'Sand Burial':
          const isSandCoffined = target.activeEffects.some(e => e.name === 'Sand Coffin');
          baseDamage = isSandCoffined ? 55 : 35;
          // Consume Sand Coffin
          target.activeEffects = target.activeEffects.filter(e => e.name !== 'Sand Coffin');
          break;
        case 'Sand Armor':
          effectName = 'Sand Armor';
          effectType = 'shield';
          effectDuration = 99; // indefinitely
          effectVal = 30;
          break;
        case 'Sand Shield':
          effectName = 'Sand Shield';
          effectType = 'invulnerable';
          effectDuration = 1;
          break;

        // --- ROCK LEE ---
        case 'Ferocious Fist':
          baseDamage = 25;
          break;
        case 'Primary Lotus':
          const gatesOpen = source.activeEffects.some(e => e.name === 'Fifth Gate Opening');
          baseDamage = gatesOpen ? 50 : 35;
          break;
        case 'Fifth Gate Opening':
          effectName = 'Fifth Gate Opening';
          effectType = 'damage_buff';
          effectDuration = 3;
          effectVal = 15;
          break;
        case 'Lee Guard':
          effectName = 'Lee Guard';
          effectType = 'invulnerable';
          effectDuration = 1;
          break;

        // --- ITACHI ---
        case 'Amaterasu':
          // Apply DoT
          effectName = 'Amaterasu Burn';
          effectType = 'dot';
          effectDuration = 3;
          effectVal = 15;
          break;
        case 'Tsukuyomi':
          baseDamage = 30;
          stunApplied = true;
          finalStunType = ['mental'];
          break;
        case 'Mangekyo Sharingan':
          effectName = 'Mangekyo Sharingan';
          effectType = 'counter';
          effectDuration = 2;
          break;
        case 'Crow Clone Escape':
          effectName = 'Crow Clone Escape';
          effectType = 'invulnerable';
          effectDuration = 1;
          break;

        // --- NEJI ---
        case 'Gentle Fist':
          baseDamage = 20;
          // Drain 1 chakra
          if (action.isPlayer) {
            setEnemyChakra(prev => {
              const u = { ...prev };
              const nonZero = (Object.keys(u) as (keyof ChakraPool)[]).filter(k => u[k] > 0);
              if (nonZero.length > 0) u[nonZero[0]]--;
              return u;
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🌀 O Gentle Fist de Neji drenou 1 ponto de chakra do Inimigo!`,
              type: 'chakra',
            });
          } else {
            setPlayerChakra(prev => {
              const u = { ...prev };
              const nonZero = (Object.keys(u) as (keyof ChakraPool)[]).filter(k => u[k] > 0);
              if (nonZero.length > 0) u[nonZero[0]]--;
              return u;
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🌀 O Gentle Fist de Neji drenou 1 ponto de chakra do Jogador!`,
              type: 'chakra',
            });
          }
          break;
        case 'Sixty-Four Palms':
          baseDamage = 40;
          stunApplied = true;
          finalStunType = ['chakra'];
          break;
        case 'Byakugan Sight':
          effectName = 'Byakugan Sight';
          effectType = 'damage_reduction';
          effectDuration = 3;
          effectVal = 15;
          break;
        case 'Eight Trigrams Rotation':
          effectName = 'Eight Trigrams Rotation';
          effectType = 'invulnerable';
          effectDuration = 1;
          break;

        // --- CHOJI ---
        case 'Human Boulder':
          baseDamage = 25;
          break;
        case 'Partial Expansion':
          const pillsActive = source.activeEffects.some(e => e.name === 'Three Colored Pills');
          baseDamage = pillsActive ? 45 : 30;
          break;
        case 'Three Colored Pills':
          healAmt = 25;
          effectName = 'Three Colored Pills';
          effectType = 'damage_buff';
          effectDuration = 3;
          effectVal = 15;
          break;
        case 'Choji Block':
          effectName = 'Choji Block';
          effectType = 'invulnerable';
          effectDuration = 1;
          break;

        default:
          break;
      }

      const cleanseTargetEffects = (t: CombatCharacter, removeType: string | undefined) => {
        if (!removeType || removeType === 'none' || removeType === '') return;

        const beforeCount = t.activeEffects.length;
        t.activeEffects = t.activeEffects.filter(eff => {
          if (eff.irremovable) return true; // never remove if irremovable

          if (removeType === 'all') return false;
          if (removeType === 'buff') {
            return !['shield', 'damage_reduction', 'damage_buff', 'invulnerable', 'invisible', 'heal'].includes(eff.type);
          }
          if (removeType === 'debuff') {
            return !['stun', 'dot', 'bleeding', 'affliction', 'paralyze_cooldown', 'damage', 'direct_damage'].includes(eff.type);
          }
          if (removeType === 'stun' && eff.type === 'stun') return false;
          if (removeType === 'dot' && eff.type === 'dot') return false;
          if (removeType === 'bleeding' && eff.type === 'bleeding') return false;
          if (removeType === 'affliction' && eff.type === 'affliction') return false;
          if (removeType === 'shield' && eff.type === 'shield') return false;
          return true;
        });

        const removedCount = beforeCount - t.activeEffects.length;
        if (removedCount > 0) {
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `✨ Purificação: Removidos ${removedCount} efeitos de ${t.character.name} (${removeType}).`,
            type: 'system',
          });
        }
      };

      const isSkillInvisible = !!skill.invisible || (skill.invisibleDuration !== undefined && skill.invisibleDuration > 0);
      const casterSide: 'player' | 'enemy' = action.isPlayer ? 'player' : 'enemy';

      const pushActiveEffect = (targetChar: CombatCharacter, eff: ActiveEffect) => {
        targetChar.activeEffects.push({
          ...eff,
          isInvisible: eff.isInvisible !== undefined ? eff.isInvisible : (isSkillInvisible || eff.type === 'invisible'),
          casterSide: eff.casterSide || casterSide,
        });
      };

      // 0.1 DESTRUIR ESCUDO (REMOVE SHIELDS)
      if (removeShields) {
        if (target.shield > 0) {
          target.shield = 0;
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🛡️❌ [${skill.name}] de ${source.character.name} DESTRUIU o escudo de ${target.character.name}!`,
            type: 'buff',
          });
          addFloatingText(target.id, 'ESCUDO QUEBRADO', 'shield');
        }
        if (skill.removeShieldDuration && skill.removeShieldDuration > 0) {
          pushActiveEffect(target, {
            name: `Selamento de Escudo (${skill.name})`,
            type: 'custom',
            duration: skill.removeShieldDuration,
            icon: skill.icon,
            irremovable: !!skill.removeShieldIrremovable,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🚫 [${skill.name}] de ${source.character.name} impede que ${target.character.name} ganhe escudos por ${skill.removeShieldDuration} turnos!`,
            type: 'buff',
          });
          addFloatingText(target.id, 'ESCUDO SELADO', 'shield');
        }
        cleanseTargetEffects(target, skill.removeShieldRemoveType);
      }

      // 0.2 DANO DIRETO (DIRECT DAMAGE)
      if (directDamage > 0) {
        const directTargets = resolveEffectTargets(skill.directDamageTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        directTargets.forEach(t => {
          if (t.isDead) return;
          if (skill.directDamageDuration && skill.directDamageDuration > 1) {
            const duration = skill.directDamageDuration;
            pushActiveEffect(t, {
              name: `${skill.name} (Dano Direto Contínuo)`,
              type: 'direct_damage',
              value: skill.directDamage,
              duration,
              icon: skill.icon,
              irremovable: !!skill.directDamageIrremovable,
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🎯 ${t.character.name} está sofrendo [${skill.name}] de DANO DIRETO de ${skill.directDamage} por turno por ${duration} turnos!`,
              type: 'damage',
            });
            addFloatingText(t.id, `DANO DIRETO CONTÍNUO`, 'damage');
          } else {
            const startingHealth = t.health;
            t.health = Math.max(0, t.health - directDamage);
            const healthReduced = startingHealth - t.health;
            if (healthReduced > 0) {
              if (action.isPlayer) {
                matchStatsRef.current.damageDealt += healthReduced;
              } else {
                matchStatsRef.current.damageReceived += healthReduced;
              }
            }
            if (t.health === 0 && startingHealth > 0 && action.isPlayer) {
              matchStatsRef.current.killsWithSkill[skill.name] = (matchStatsRef.current.killsWithSkill[skill.name] || 0) + 1;
            }

            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🎯 [${skill.name}] de ${source.character.name} causou ${directDamage} de DANO DIRETO em ${t.character.name} (perfurando defesas).`,
              type: 'damage',
            });
            addFloatingText(t.id, `-${directDamage} HP (DIRETO)`, 'damage');
          }
          cleanseTargetEffects(t, skill.directDamageRemoveType);
        });
      }

      // 0.3 DRENO / GANHO DE CHAKRA
      if (skill.gainChakra && skill.gainChakra > 0) {
        const amt = skill.gainChakra;
        const dur = skill.gainChakraDuration || 1;
        const gainChakraTargets = resolveEffectTargets(skill.gainChakraTarget || 'Self', target, source, sourceList, targetList, true);

        gainChakraTargets.forEach(t => {
          if (t.isDead) return;
          if (dur > 1) {
            pushActiveEffect(t, {
              name: `Fluxo de Chakra (${skill.name})`,
              type: 'custom',
              value: amt,
              duration: dur,
              icon: skill.icon,
              irremovable: !!skill.gainChakraIrremovable,
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `✨ [${skill.name}] de ${source.character.name} ativou ganho contínuo de +${amt} chakra elemental em ${t.character.name} por ${dur} turnos!`,
              type: 'chakra',
            });
            addFloatingText(t.id, '+CHAKRA CONTÍNUO', 'effect');
          } else {
            const isPlayerCombatant = updatedPlayer.some(p => p.id === t.id);
            const targetSetter = isPlayerCombatant ? setPlayerChakra : setEnemyChakra;
            targetSetter(prev => {
              const u = { ...prev };
              const types: (keyof ChakraPool)[] = ['Tai', 'Nin', 'Gen', 'Blood'];
              for (let i = 0; i < amt; i++) {
                const randType = types[Math.floor(Math.random() * types.length)];
                u[randType]++;
              }
              return u;
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `✨ [${skill.name}] de ${source.character.name} gerou +${amt} de chakra elemental para ${t.character.name}!`,
              type: 'chakra',
            });
            addFloatingText(t.id, `+${amt} CHAKRA`, 'effect');
          }
          cleanseTargetEffects(t, skill.gainChakraRemoveType);
        });
      }

      if (skill.drainChakra && skill.drainChakra > 0) {
        const amt = skill.drainChakra;
        const dur = skill.drainChakraDuration || 1;
        const drainChakraTargets = resolveEffectTargets(skill.drainChakraTarget || 'Target', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);

        drainChakraTargets.forEach(t => {
          if (t.isDead) return;
          if (dur > 1) {
            pushActiveEffect(t, {
              name: `Dreno de Chakra (${skill.name})`,
              type: 'custom',
              value: amt,
              duration: dur,
              icon: skill.icon,
              irremovable: !!skill.drainChakraIrremovable,
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🌀 [${skill.name}] de ${source.character.name} ativou dreno contínuo de ${amt} chakra de ${t.character.name} por ${dur} turnos!`,
              type: 'chakra',
            });
            addFloatingText(t.id, 'DRENO DE CHAKRA CONTÍNUO', 'effect');
          } else {
            const tIsPlayer = updatedPlayer.some(p => p.id === t.id);
            const enemySetter = tIsPlayer ? setPlayerChakra : setEnemyChakra;
            const targetSetter = tIsPlayer ? setEnemyChakra : setPlayerChakra;
            let actualDrained = 0;
            enemySetter(prev => {
              const u = { ...prev };
              const types: (keyof ChakraPool)[] = ['Tai', 'Nin', 'Gen', 'Blood'];
              for (let i = 0; i < amt; i++) {
                const nonZero = types.filter(k => u[k] > 0);
                if (nonZero.length > 0) {
                  const randType = nonZero[Math.floor(Math.random() * nonZero.length)];
                  u[randType]--;
                  actualDrained++;
                }
              }
              return u;
            });

            if (actualDrained > 0) {
              targetSetter(prev => {
                const u = { ...prev };
                const types: (keyof ChakraPool)[] = ['Tai', 'Nin', 'Gen', 'Blood'];
                for (let i = 0; i < actualDrained; i++) {
                  const randType = types[Math.floor(Math.random() * types.length)];
                  u[randType]++;
                }
                return u;
              });
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `🌀 [${skill.name}] de ${source.character.name} drenou ${actualDrained} de chakra de ${t.character.name}!`,
                type: 'chakra',
              });
              addFloatingText(source.id, `+${actualDrained} CHAKRA ROUBADO`, 'effect');
              addFloatingText(t.id, `-${actualDrained} CHAKRA DRENADO`, 'effect');
            }
          }
          cleanseTargetEffects(t, skill.drainChakraRemoveType);
        });
      }

      // 0.4 INVISIBILIDADE AO OPONENTE
      if (skill.invisible && skill.invisibleDuration && skill.invisibleDuration > 0) {
        const invDuration = skill.invisibleDuration;
        pushActiveEffect(source, {
          name: `Invisibilidade (${skill.name})`,
          type: 'invisible',
          duration: invDuration,
          icon: skill.icon,
          irremovable: !!skill.invisibleIrremovable,
        });
        newLogs.push({
          id: Math.random().toString(),
          turn,
          message: `👥 ${source.character.name} ativou [${skill.name}] ficando INVISÍVEL ao oponente por ${invDuration} turnos!`,
          type: 'buff',
        });
        addFloatingText(source.id, 'INVISÍVEL', 'effect');
        cleanseTargetEffects(source, skill.invisibleRemoveType);
      }

      // 1. APPLY DAMAGE REDUCTION & SHIELDS FOR OFFENSE
      if (skill.damageDuration && skill.damageDuration > 1) {
        const duration = skill.damageDuration;
        const damageTargets = resolveEffectTargets(skill.damageTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        damageTargets.forEach(t => {
          if (t.isDead) return;
          pushActiveEffect(t, {
            name: `${skill.name} (Dano Contínuo)`,
            type: 'damage',
            value: skill.damage,
            duration,
            icon: skill.icon,
            irremovable: !!skill.damageIrremovable,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `💥 ${t.character.name} está sob efeito de [${skill.name}] sofrendo ${skill.damage} de dano por turno por ${duration} turnos!`,
            type: 'damage',
          });
          addFloatingText(t.id, `DANO CONTÍNUO (-${skill.damage} HP)`, 'damage');
          cleanseTargetEffects(t, skill.damageRemoveType);
        });
      } else if (baseDamage > 0) {
        const damageTargets = resolveEffectTargets(skill.damageTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        damageTargets.forEach(t => {
          if (t.isDead) return;
          const startingShield = t.shield;
          const startingHealth = t.health;
          // Apply damage buff from source effects
          const sourceBuffs = source.activeEffects.filter(e => e.type === 'damage_buff');
          const damageBuffSum = sourceBuffs.reduce((acc, curr) => acc + (curr.value || 0), 0);
          let finalDamage = baseDamage + damageBuffSum;

          // Apply flat damage reduction on target
          const targetReductions = t.activeEffects.filter(e => e.type === 'damage_reduction');
          const reductionSum = targetReductions.reduce((acc, curr) => acc + (curr.value || 0), 0);
          finalDamage = Math.max(0, finalDamage - reductionSum);

          // Apply to shields first
          if (t.shield > 0) {
            if (t.shield >= finalDamage) {
              t.shield -= finalDamage;
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `🛡️ ${source.character.name} atingiu o escudo de ${t.character.name} com [${skill.name}] causando ${finalDamage} de dano ao escudo.`,
                type: 'buff',
              });
              addFloatingText(t.id, `-${finalDamage} ESCUDO`, 'shield');
              finalDamage = 0;
            } else {
              finalDamage -= t.shield;
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `💥 ${source.character.name} quebrou o escudo de ${t.character.name}!`,
                type: 'damage',
              });
              addFloatingText(t.id, 'ESCUDO QUEBRADO', 'shield');
              t.shield = 0;
            }
          }

          // Apply remaining damage to health
          if (finalDamage > 0) {
            t.health = Math.max(0, t.health - finalDamage);
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `💥 ${source.character.name} usou [${skill.name}] causando ${finalDamage} de dano em ${t.character.name}.`,
              type: 'damage',
            });
            addFloatingText(t.id, `-${finalDamage} HP`, 'damage');
          }

          // Handle counter effects (like Itachi Mangekyo / Neji Rotation)
          const hasCounter = t.activeEffects.some(e => e.type === 'counter');
          if (hasCounter && finalDamage > 0) {
            source.health = Math.max(0, source.health - 15);
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `⚡ ${t.character.name} contra-atacou! Causou 15 de dano de volta em ${source.character.name}.`,
              type: 'damage',
            });
            addFloatingText(source.id, '-15 HP (CONTRA-ATAQUE)', 'damage');
          }
          cleanseTargetEffects(t, skill.damageRemoveType);

          const shieldReduced = startingShield - t.shield;
          const healthReduced = startingHealth - t.health;
          const damageTaken = shieldReduced + healthReduced;
          if (damageTaken > 0) {
            if (action.isPlayer) {
              matchStatsRef.current.damageDealt += damageTaken;
            } else {
              matchStatsRef.current.damageReceived += damageTaken;
            }
          }
          if (t.health === 0 && startingHealth > 0 && action.isPlayer) {
            matchStatsRef.current.killsWithSkill[skill.name] = (matchStatsRef.current.killsWithSkill[skill.name] || 0) + 1;
          }
        });
      }

      // 2. APPLY HEALING
      if (skill.healDuration && skill.healDuration > 1) {
        const duration = skill.healDuration;
        const healTargets = resolveEffectTargets(skill.healTarget, target, source, sourceList, targetList, true);
        healTargets.forEach(t => {
          if (t.isDead) return;
          pushActiveEffect(t, {
            name: `Cura Contínua (${skill.name})`,
            type: 'heal',
            value: skill.heal,
            duration,
            icon: skill.icon,
            irremovable: !!skill.healIrremovable,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `💚 ${t.character.name} recebeu regeneração de [${skill.name}] restaurando ${skill.heal} de vida por turno por ${duration} turnos.`,
            type: 'heal',
          });
          addFloatingText(t.id, `REGEN CONTÍNUA (+${skill.heal} HP)`, 'heal');
          cleanseTargetEffects(t, skill.healRemoveType);
        });
      } else if (healAmt > 0) {
        const healTargets = resolveEffectTargets(skill.healTarget, target, source, sourceList, targetList, true);
        healTargets.forEach(t => {
          if (t.isDead) return;
          const startingHealth = t.health;
          t.health = Math.min(100, t.health + healAmt);
          const actualHealed = t.health - startingHealth;
          if (actualHealed > 0 && action.isPlayer) {
            matchStatsRef.current.healingDone += actualHealed;
          }
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `💚 ${source.character.name} usou [${skill.name}] e restaurou ${healAmt} de vida de ${t.character.name}.`,
            type: 'heal',
          });
          addFloatingText(t.id, `+${healAmt} HP`, 'heal');
          cleanseTargetEffects(t, skill.healRemoveType);
        });
      }

      // 3. APPLY STUNS
      if (stunApplied) {
        const stunTypeLabels: Record<string, string> = {
          physical: 'Físico', mental: 'Mental', affliction: 'Aflição', chakra: 'Chakra',
        };
        const resolvedStunTypes: ('mental' | 'physical' | 'affliction' | 'chakra')[] =
          (!finalStunType || finalStunType.length === 0 || finalStunType.length >= 4)
            ? ['physical', 'mental', 'affliction', 'chakra']
            : finalStunType;
        const isAllTypes = resolvedStunTypes.length >= 4;

        const stunTypeName = isAllTypes
          ? 'Stun Completo (Físico + Mental + Aflição + Chakra)'
          : `Stun (${resolvedStunTypes.map(t => stunTypeLabels[t] || t).join(' + ')})`;

        const stunTargets = resolveEffectTargets(skill.stunTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        stunTargets.forEach(t => {
          if (t.isDead) return;
          if (action.isPlayer) {
            matchStatsRef.current.stunsApplied += 1;
          }
          const debuffIcon = skill.icon || (skill as any).image || (skill as any).portrait || source.character.portrait || 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
          
          pushActiveEffect(t, {
            name: `${skill.name} (${stunTypeName})`,
            type: 'stun',
            duration: stunDuration,
            icon: debuffIcon,
            stunType: resolvedStunTypes,
            irremovable: !!skill.stunIrremovable,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🌀 ${t.character.name} recebeu [${stunTypeName}] por [${skill.name}] de ${source.character.name} por ${stunDuration} ${stunDuration === 1 ? 'turno' : 'turnos'}!`,
            type: 'stun',
          });
          const floatingTextStr = isAllTypes
            ? `STUN COMPLETO (${stunDuration}T)`
            : `STUN (${resolvedStunTypes.map(t => (stunTypeLabels[t] || t).toUpperCase()).join('+')}) (${stunDuration}T)`;
          addFloatingText(t.id, floatingTextStr, 'stun');
          cleanseTargetEffects(t, skill.stunRemoveType);
        });
      }

      // 4. APPLY BUFFER SHIELDS & OTHER CUSTOM EFFECT BUFFS
      if (skill.shieldVal && skill.shieldVal > 0) {
        const shieldTargets = resolveEffectTargets(skill.shieldTarget, target, source, sourceList, targetList, true);
        shieldTargets.forEach(t => {
          if (t.isDead) return;
          const isShieldSealed = t.activeEffects.some(e => e.name.startsWith('Selamento de Escudo'));
          if (isShieldSealed) {
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🛡️❌ ${t.character.name} tentou ganhar escudo, mas está sob efeito de Selamento de Escudo!`,
              type: 'buff',
            });
            addFloatingText(t.id, 'ESCUDO BLOQUEADO', 'shield');
          } else {
            t.shield = (t.shield || 0) + skill.shieldVal!;
            if (action.isPlayer) {
              matchStatsRef.current.shieldGenerated += skill.shieldVal!;
            }
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🛡️ ${t.character.name} ganhou +${skill.shieldVal} de escudo com [${skill.name}] por ${skill.shieldDuration || 99} turnos!`,
              type: 'buff',
            });
            addFloatingText(t.id, `+${skill.shieldVal} ESCUDO`, 'shield');
            
            if (skill.shieldDuration && skill.shieldDuration < 99) {
              pushActiveEffect(t, {
                name: `${skill.name} Shield Decay`,
                type: 'shield',
                value: skill.shieldVal,
                duration: skill.shieldDuration,
                icon: skill.icon,
                irremovable: !!skill.shieldIrremovable,
              });
            }
          }
          cleanseTargetEffects(t, skill.shieldRemoveType);
        });
      }

      // 4.2b APPLY COUNTER ATTACK
      if (skill.counterAttack) {
        const cTargets = resolveEffectTargets(skill.counterAttackTarget, target, source, sourceList, targetList, true);
        cTargets.forEach(t => {
          if (t.isDead) return;
          pushActiveEffect(t, {
            name: `${skill.name} Contra-Ataque`,
            type: 'counter_attack',
            duration: skill.counterAttackDuration || 1,
            counterAttackType: skill.counterAttackType || 'defender',
            icon: skill.icon,
            irremovable: !!skill.counterAttackIrremovable,
            cannotBeCountered: !!skill.counterAttackCannotBeCountered,
            cannotBeReflected: !!skill.counterAttackCannotBeReflected,
          });
          newLogs.push({
            id: Math.random().toString(), turn,
            message: `⚔️ ${t.character.name} ativou CONTRA-ATAQUE com [${skill.name}]!`,
            type: 'buff',
          });
          addFloatingText(t.id, 'CONTRA-ATAQUE', 'effect');
          cleanseTargetEffects(t, skill.counterAttackRemoveType);
        });
      }

// 4.2c APPLY REFLECT
if (skill.reflect) {
  const rTargets = resolveEffectTargets(skill.reflectTarget, target, source, sourceList, targetList, true);
  rTargets.forEach(t => {
    if (t.isDead) return;
    const isPassive = skill.reflectType === 'passive';
    const charges = skill.reflectCharges !== undefined ? skill.reflectCharges : 1;
    pushActiveEffect(t, {
      name: `${skill.name} Reflect`,
      type: 'reflect',
      duration: skill.reflectDuration || 1,
      icon: skill.icon,
      irremovable: !!skill.reflectIrremovable,
      cannotBeCountered: !!skill.reflectCannotBeCountered,
      cannotBeReflected: !!skill.reflectCannotBeReflected,
      reflectMode: skill.reflectMode || 'Caster',
      reflectType: skill.reflectType || 'active',
      reflectCharges: charges,
    });
    newLogs.push({
      id: Math.random().toString(), turn,
      message: isPassive 
        ? `🔄 ${t.character.name} ativou REFLECT (PASSIVO - ${charges} cargas) com [${skill.name}]!`
        : `🔄 ${t.character.name} ativou REFLECT (ATIVO) com [${skill.name}]!`,
      type: 'buff',
    });
    addFloatingText(t.id, isPassive ? 'REFLECT PASSIVO' : 'REFLECT ATIVO', 'effect');
    cleanseTargetEffects(t, skill.reflectRemoveType);
  });
}

      // 4.2 APPLY DAMAGE REDUCTION
      if (skill.damageReductionVal && skill.damageReductionVal > 0) {
        const shieldTargets = resolveEffectTargets(skill.shieldTarget, target, source, sourceList, targetList, true);
        shieldTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.damageReductionDuration || 3;
          pushActiveEffect(t, {
            name: `${skill.name} Guard`,
            type: 'damage_reduction',
            value: skill.damageReductionVal,
            duration,
            icon: skill.icon,
            irremovable: !!skill.damageReductionIrremovable,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🛡️ ${t.character.name} ativou redução de dano de [${skill.name}] reduzindo ${skill.damageReductionVal} de dano sofrido por ${duration} turnos!`,
            type: 'buff',
          });
          addFloatingText(t.id, `DEFESA (+${skill.damageReductionVal})`, 'effect');
          cleanseTargetEffects(t, skill.damageReductionRemoveType);
        });
      }

      // 4.3 APPLY DAMAGE BUFF
      if (skill.damageBuffVal && skill.damageBuffVal > 0) {
        const buffTargets = resolveEffectTargets(skill.shieldTarget, target, source, sourceList, targetList, true);
        buffTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.damageBuffDuration || 3;
          pushActiveEffect(t, {
            name: `${skill.name} Power`,
            type: 'damage_buff',
            value: skill.damageBuffVal,
            duration,
            icon: skill.icon,
            irremovable: !!skill.damageBuffIrremovable,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `⚡ ${t.character.name} ativou bônus de dano de [${skill.name}] aumentando dano causado em +${skill.damageBuffVal} por ${duration} turnos!`,
            type: 'buff',
          });
          addFloatingText(t.id, `PODER (+${skill.damageBuffVal})`, 'effect');
          cleanseTargetEffects(t, skill.damageBuffRemoveType);
        });
      }

      // 4.4 APPLY INVULNERABILITY
      if (skill.invulnerableDuration && skill.invulnerableDuration > 0) {
        const invulTargets = resolveEffectTargets(skill.shieldTarget, target, source, sourceList, targetList, true);
        invulTargets.forEach(t => {
          if (t.isDead) return;
          pushActiveEffect(t, {
            name: `${skill.name} Escape`,
            type: 'invulnerable',
            duration: skill.invulnerableDuration!,
            icon: skill.icon,
            irremovable: !!skill.invulnerableIrremovable,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🌌 ${t.character.name} ficou INVULNERÁVEL com [${skill.name}] por ${skill.invulnerableDuration} turnos!`,
            type: 'buff',
          });
          addFloatingText(t.id, 'INVULNERÁVEL', 'invulnerable');
          cleanseTargetEffects(t, skill.invulnerableRemoveType);
        });
      }

      // 4.5 APPLY DoT
      if (skill.dotVal && skill.dotVal > 0) {
        const dotTargets = resolveEffectTargets(skill.dotTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        dotTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.dotDuration || 3;
          pushActiveEffect(t, {
            name: `${skill.name} Burn`,
            type: 'dot',
            value: skill.dotVal,
            duration,
            icon: skill.icon,
            irremovable: !!skill.dotIrremovable,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🔥 ${t.character.name} foi afligido por queima contínua de [${skill.name}] sofrendo ${skill.dotVal} DoT por ${duration} turnos!`,
            type: 'damage',
          });
          addFloatingText(t.id, `QUEIMA (+${skill.dotVal} DoT)`, 'damage');
          cleanseTargetEffects(t, skill.dotRemoveType);
        });
      }

      // 4.6 APPLY BLEEDING (SANGRAMENTO)
      if (skill.bleedingVal && skill.bleedingVal > 0) {
        const bleedTargets = resolveEffectTargets(skill.bleedingTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        bleedTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.bleedingDuration || 3;
          pushActiveEffect(t, {
            name: `${skill.name} Sangramento`,
            type: 'bleeding',
            value: skill.bleedingVal,
            duration,
            icon: skill.icon,
            irremovable: !!skill.bleedingIrremovable,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🩸 ${t.character.name} está sangrando com [${skill.name}] sofrendo ${skill.bleedingVal} de dano por turno por ${duration} turnos!`,
            type: 'damage',
          });
          addFloatingText(t.id, `SANGRAMENTO (-${skill.bleedingVal} HP)`, 'damage');
          cleanseTargetEffects(t, skill.bleedingRemoveType);
        });
      }

      // 4.7 APPLY AFFLICTION (AFLIÇÃO)
      if (skill.afflictionVal && skill.afflictionVal > 0) {
        const afflictionTargets = resolveEffectTargets(skill.afflictionTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        afflictionTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.afflictionDuration || 3;
          pushActiveEffect(t, {
            name: `${skill.name} Aflição`,
            type: 'affliction',
            value: skill.afflictionVal,
            duration,
            icon: skill.icon,
            irremovable: !!skill.afflictionIrremovable,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `💜 ${t.character.name} foi afligido por Aflição com [${skill.name}] sofrendo ${skill.afflictionVal} de dano por turno por ${duration} turnos!`,
            type: 'damage',
          });
          addFloatingText(t.id, `AFLIÇÃO (-${skill.afflictionVal} HP)`, 'damage');
          cleanseTargetEffects(t, skill.afflictionRemoveType);
        });
      }

      // 4.8 APPLY PARALYZE COOLDOWN (PARALISAR COOLDOWN)
      if (skill.paralyzeCooldownDuration && skill.paralyzeCooldownDuration > 0) {
        const paralyzeTargets = resolveEffectTargets(skill.paralyzeCooldownTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        paralyzeTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.paralyzeCooldownDuration || 1;
          pushActiveEffect(t, {
            name: `${skill.name} Paralisia de Cooldown`,
            type: 'paralyze_cooldown',
            duration,
            icon: skill.icon,
            irremovable: !!skill.paralyzeCooldownIrremovable,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `⏳ Cooldowns de ${t.character.name} foram PARALISADOS por [${skill.name}] por ${duration} turnos!`,
            type: 'system',
          });
          addFloatingText(t.id, 'COOLDOWNS PARALISADOS', 'stun');
          cleanseTargetEffects(t, skill.paralyzeCooldownRemoveType);
        });
      }

      // Legacy effect fallback
      if (effectName && !skill.shieldVal && !skill.damageReductionVal && !skill.damageBuffVal && !skill.invulnerableDuration && !skill.dotVal) {
        if (effectType === 'shield') {
          const isShieldSealed = target.activeEffects.some(e => e.name.startsWith('Selamento de Escudo'));
          if (isShieldSealed) {
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🛡️❌ ${target.character.name} tentou ganhar escudo, mas está sob efeito de Selamento de Escudo!`,
              type: 'buff',
            });
            addFloatingText(target.id, 'ESCUDO BLOQUEADO', 'shield');
          } else {
            target.shield = (target.shield || 0) + effectVal;
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🛡️ ${target.character.name} ativou [${skill.name}] ganhando um escudo de ${effectVal}.`,
              type: 'buff',
            });
            addFloatingText(target.id, `+${effectVal} ESCUDO`, 'shield');
          }
        } else {
          pushActiveEffect(target, {
            name: effectName,
            type: effectType,
            value: effectVal,
            duration: effectDuration,
            icon: skill.icon,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `✨ ${target.character.name} ativou [${skill.name}] por ${effectDuration} turnos.`,
            type: 'buff',
          });
          addFloatingText(target.id, effectName.toUpperCase(), 'effect');
        }
      }
    });

    // --- 3. DO T TURN END EFFECTS (DoT, Self damage, and duration decays) ---
    // Decaying effects & checking deaths
    const applyTurnEndUpdates = (combatantList: CombatCharacter[], name: string) => {
      combatantList.forEach(c => {
        if (c.isDead) return;
        const initialHealth = c.health;

        // Apply active DoTs (e.g. Amaterasu)
        const dotEffects = c.activeEffects.filter(e => e.type === 'dot');
        dotEffects.forEach(dot => {
          c.health = Math.max(0, c.health - (dot.value || 0));
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🔥 ${c.character.name} sofreu ${(dot.value || 0)} de dano de queima por ${dot.name}.`,
            type: 'damage',
          });
          addFloatingText(c.id, `-${(dot.value || 0)} HP (QUEIMA)`, 'damage');
        });

        // Apply dynamic Normal Damage over time (damage)
        const activeDamageEffects = c.activeEffects.filter(e => e.type === 'damage');
        activeDamageEffects.forEach(dmg => {
          c.health = Math.max(0, c.health - (dmg.value || 0));
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `💥 ${c.character.name} sofreu ${(dmg.value || 0)} de dano contínuo de ${dmg.name}.`,
            type: 'damage',
          });
          addFloatingText(c.id, `-${(dmg.value || 0)} HP (DANO)`, 'damage');
        });

        // Apply dynamic Direct Damage over time (direct_damage)
        const activeDirectDamageEffects = c.activeEffects.filter(e => e.type === 'direct_damage');
        activeDirectDamageEffects.forEach(dd => {
          c.health = Math.max(0, c.health - (dd.value || 0));
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🎯 ${c.character.name} sofreu ${(dd.value || 0)} de dano direto contínuo de ${dd.name}.`,
            type: 'damage',
          });
          addFloatingText(c.id, `-${(dd.value || 0)} HP (DIRETO)`, 'damage');
        });

        // Apply dynamic Healing over time (heal)
        const activeHealEffects = c.activeEffects.filter(e => e.type === 'heal');
        activeHealEffects.forEach(hl => {
          c.health = Math.min(100, c.health + (hl.value || 0));
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `💚 ${c.character.name} recuperou ${(hl.value || 0)} de vida por ${hl.name}.`,
            type: 'heal',
          });
          addFloatingText(c.id, `+${(hl.value || 0)} HP (REGEN)`, 'heal');
        });

        // Apply Bleeding (Sangramento)
        const bleedingEffects = c.activeEffects.filter(e => e.type === 'bleeding');
        bleedingEffects.forEach(bleed => {
          c.health = Math.max(0, c.health - (bleed.value || 0));
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🩸 ${c.character.name} sofreu ${(bleed.value || 0)} de dano por Sangramento (${bleed.name}).`,
            type: 'damage',
          });
          addFloatingText(c.id, `-${(bleed.value || 0)} HP (SANGRAMENTO)`, 'damage');
        });

        // Apply Affliction (Aflição)
        const afflictionEffects = c.activeEffects.filter(e => e.type === 'affliction');
        afflictionEffects.forEach(aff => {
          c.health = Math.max(0, c.health - (aff.value || 0));
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `💜 ${c.character.name} sofreu ${(aff.value || 0)} de dano por Aflição (${aff.name}).`,
            type: 'damage',
          });
          addFloatingText(c.id, `-${(aff.value || 0)} HP (AFLIÇÃO)`, 'damage');
        });

        // Rock Lee Fifth gate self burn
        const hasFifthGate = c.activeEffects.some(e => e.name === 'Fifth Gate Opening');
        if (hasFifthGate) {
          c.health = Math.max(0, c.health - 5);
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `⚠️ Rock Lee sofreu 5 de dano auto-infligido por abrir o Fifth Gate.`,
            type: 'damage',
          });
          addFloatingText(c.id, '-5 HP (PORTÕES INTERNOS)', 'damage');
        }

        // Apply continuous Chakra Gain effects
        const gainChakraEffects = c.activeEffects.filter(e => e.name.startsWith('Fluxo de Chakra'));
        gainChakraEffects.forEach(effect => {
          const amt = effect.value || 0;
          const targetSetter = name === 'Player' ? setPlayerChakra : setEnemyChakra;
          targetSetter(prev => {
            const u = { ...prev };
            const types: (keyof ChakraPool)[] = ['Tai', 'Nin', 'Gen', 'Blood'];
            for (let i = 0; i < amt; i++) {
              const randType = types[Math.floor(Math.random() * types.length)];
              u[randType]++;
            }
            return u;
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `✨ ${c.character.name} regenerou +${amt} chakra elemental pelo efeito [${effect.name}]!`,
            type: 'chakra',
          });
          addFloatingText(c.id, `+${amt} CHAKRA (FLUXO)`, 'effect');
        });

        // Apply continuous Chakra Drain effects
        const drainChakraEffects = c.activeEffects.filter(e => e.name.startsWith('Dreno de Chakra'));
        drainChakraEffects.forEach(effect => {
          const amt = effect.value || 0;
          // The carrier of the drain effect is the TARGET (victim). So we drain from c (carrier) and give to opponent!
          const targetSetterOfVictim = name === 'Player' ? setPlayerChakra : setEnemyChakra;
          const targetSetterOfThief = name === 'Player' ? setEnemyChakra : setPlayerChakra;
          
          let actualDrained = 0;
          targetSetterOfVictim(victimChakra => {
            const u = { ...victimChakra };
            const types: (keyof ChakraPool)[] = ['Tai', 'Nin', 'Gen', 'Blood'];
            for (let i = 0; i < amt; i++) {
              const nonZero = types.filter(k => u[k] > 0);
              if (nonZero.length > 0) {
                const randType = nonZero[Math.floor(Math.random() * nonZero.length)];
                u[randType]--;
                actualDrained++;
              }
            }
            if (actualDrained > 0) {
              targetSetterOfThief(thiefChakra => {
                const tu = { ...thiefChakra };
                for (let j = 0; j < actualDrained; j++) {
                  const randType = types[Math.floor(Math.random() * types.length)];
                  tu[randType]++;
                }
                return tu;
              });
            }
            return u;
          });

          if (actualDrained > 0) {
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🌀 ${c.character.name} teve ${actualDrained} chakra drenado pelo efeito [${effect.name}]!`,
              type: 'chakra',
            });
            addFloatingText(c.id, `-${actualDrained} CHAKRA (DRENADO)`, 'effect');
          }
        });

        // Track health changes from continuous effects (DoT, regeneration, self damage)
        const healthDiff = initialHealth - c.health;
        if (healthDiff > 0) {
          if (name === 'Player') {
            matchStatsRef.current.damageReceived += healthDiff;
          } else {
            matchStatsRef.current.damageDealt += healthDiff;
          }
        } else if (healthDiff < 0) {
          if (name === 'Player') {
            matchStatsRef.current.healingDone += Math.abs(healthDiff);
          }
        }

        // Check if dead now
        if (c.health <= 0) {
          c.isDead = true;
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `💀 ${c.character.name} CAIU EM BATALHA!`,
            type: 'death',
          });
          playCustomSound('Death');
          addFloatingText(c.id, 'DERROTADO', 'damage');
        }

        // Decrement effect durations
        c.activeEffects = c.activeEffects
          .map(eff => ({ ...eff, duration: eff.duration - 1 }))
          .filter(eff => eff.duration > 0);

        // Decrement cooldowns (unless paralisia de cooldown is active)
        const isCooldownParalyzed = c.activeEffects.some(e => e.type === 'paralyze_cooldown');
        if (isCooldownParalyzed) {
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `⏳ Cooldowns de ${c.character.name} continuam PARALISADOS por um efeito de paralisia!`,
            type: 'system',
          });
          addFloatingText(c.id, 'COOLDOWNS PARALISADOS', 'stun');
        } else {
          c.character.skills.forEach(s => {
            if (s.currentCooldown > 0) s.currentCooldown--;
          });
        }
      });
    };

    applyTurnEndUpdates(updatedPlayer, 'Player');
    applyTurnEndUpdates(updatedEnemy, 'Enemy');

    // Save state
    setPlayerCombatants(updatedPlayer);
    setEnemyCombatants(updatedEnemy);
    setCuedActions([]);
    setSelectedSkill(null);

    // Check game over
    const allPlayerDead = updatedPlayer.every(p => p.isDead);
    const allEnemyDead = updatedEnemy.every(e => e.isDead);

    if (allPlayerDead && allEnemyDead) {
      setGameOver('defeat');
    } else if (allPlayerDead) {
      setGameOver('defeat');
    } else if (allEnemyDead) {
      setGameOver('victory');
    } else {
      // Continue next turn: each gains 1 chakra per living allied character
      const alivePlayerCount = updatedPlayer.filter(c => !c.isDead).length;
      const aliveEnemyCount = updatedEnemy.filter(c => !c.isDead).length;

      const nextTurn = turn + 1;
      setTurn(nextTurn);
      rollChakraForTurn(true, alivePlayerCount);
      rollChakraForTurn(false, aliveEnemyCount);

      if (onlineParams?.isOnline) {
        const whoGoesFirst = (nextTurn % 2 === 1) ? 0 : 1;
        if (onlineParams.playerIndex === whoGoesFirst) {
          setActivePlanner('player');
        } else {
          setActivePlanner('enemy');
        }
      } else {
        setActivePlanner('player');
      }
    }

    setLogs(prev => [...prev, ...newLogs]);
  };

  const getHealthColor = (hp: number) => {
    if (hp > 50) return 'bg-emerald-500';
    if (hp > 20) return 'bg-amber-500';
    return 'bg-red-500 animate-pulse';
  };

  // Helper to render element icons
  const renderChakraIcon = (type: string) => {
    let color = '';
    let name = '';
    if (type === 'Tai') {
      color = 'bg-red-600 border-red-400';
      name = 'Taijutsu';
    } else if (type === 'Nin') {
      color = 'bg-blue-600 border-blue-400';
      name = 'Ninjutsu';
    } else if (type === 'Gen') {
      color = 'bg-emerald-600 border-emerald-400';
      name = 'Genjutsu';
    } else if (type === 'Blood') {
      color = 'bg-purple-600 border-purple-400';
      name = 'Bloodline';
    } else {
      color = 'bg-slate-500 border-slate-400';
      name = 'Qualquer Chakra (Rand)';
    }
    return (
      <div className={`w-3.5 h-3.5 rounded-full ${color} border flex items-center justify-center`} title={name}>
        <span className="text-[8px] text-white leading-none font-bold font-mono">
          {type === 'Rand' ? 'R' : type[0]}
        </span>
      </div>
    );
  };

  const TARGET_LABELS: Record<string, string> = {
    Target: 'Alvo Principal',
    Self: 'Conjurador (Mim)',
    Both: 'Ambos (Mim e Alvo)',
    Ally: 'Aliado (Outra Pessoa)',
    AllAllies: 'Toda Minha Equipe',
    AllEnemies: 'Todos os Inimigos',
    AllLiving: 'Todos os Personagens Vivos',
    AllNonInvulnerable: 'Todos os Não Invulneráveis',
    AllInvulnerable: 'Todos os Invulneráveis',
    OneInvulnerable: 'Um Personagem Invulnerável',
    OneInvulnerableAlly: 'Um Aliado Invulnerável',
    SelfAndAllEnemies: 'Mim e Todos os Inimigos',
  };

  const renderSkillCustomEffects = (skill: Skill) => {
    const effects: { label: string; value: string; color: string; targetLabel?: string }[] = [];

    const getTargetLabel = (override?: string, defaultT: string = 'Alvo Principal') => {
      if (!override) return defaultT;
      return TARGET_LABELS[override] || override;
    };

    if (skill.damage && skill.damage > 0) {
      effects.push({
        label: 'Dano Normal',
        value: `${skill.damage} de Dano`,
        color: 'text-red-400',
        targetLabel: getTargetLabel(skill.damageTarget, 'Alvo Principal')
      });
    }
    if (skill.directDamage && skill.directDamage > 0) {
      effects.push({
        label: 'Dano Direto',
        value: `${skill.directDamage} de Dano (Direto)`,
        color: 'text-rose-500',
        targetLabel: getTargetLabel(skill.directDamageTarget, 'Alvo Principal')
      });
    }
    if (skill.heal && skill.heal > 0) {
      effects.push({
        label: 'Cura',
        value: `${skill.heal} de Cura`,
        color: 'text-emerald-400',
        targetLabel: getTargetLabel(skill.healTarget, 'Alvo Principal')
      });
    }
    if (skill.stunTurns && skill.stunTurns > 0) {
      const typesMap: Record<string, string> = {
        physical: 'Físico',
        mental: 'Mental',
        affliction: 'Aflição',
        chakra: 'Chakra'
      };
      const stunText = (skill.stunType && skill.stunType.length > 0)
        ? (skill.stunType.length >= 4 ? 'Físico + Mental + Aflição + Chakra' : skill.stunType.map(t => typesMap[t] || t).join(' + '))
        : 'Todos os Tipos';

      effects.push({
        label: 'Atordoar (Stun)',
        value: `${skill.stunTurns} ${skill.stunTurns === 1 ? 'Turno' : 'Turnos'} (${stunText})`,
        color: 'text-amber-500',
        targetLabel: getTargetLabel(skill.stunTarget, 'Alvo Principal')
      });
    }
    if (skill.shieldVal && skill.shieldVal > 0) {
      effects.push({
        label: 'Escudo (Shield)',
        value: `+${skill.shieldVal} Escudo por ${skill.shieldDuration || 1} ${skill.shieldDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-blue-400',
        targetLabel: getTargetLabel(skill.shieldTarget, 'Conjurador (Mim)')
      });
    }
    if (skill.damageReductionVal && skill.damageReductionVal > 0) {
      effects.push({
        label: 'Redução de Dano',
        value: `-${skill.damageReductionVal}% de Dano Recebido por ${skill.damageReductionDuration || 1} ${skill.damageReductionDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-cyan-400',
        targetLabel: getTargetLabel(skill.shieldTarget, 'Conjurador (Mim)')
      });
    }
    if (skill.damageBuffVal && skill.damageBuffVal > 0) {
      effects.push({
        label: 'Aumento de Dano',
        value: `+${skill.damageBuffVal} de Dano causado por ${skill.damageBuffDuration || 1} ${skill.damageBuffDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-orange-400',
        targetLabel: getTargetLabel(skill.shieldTarget, 'Conjurador (Mim)')
      });
    }
    if (skill.dotVal && skill.dotVal > 0) {
      effects.push({
        label: 'Dano Contínuo (DoT)',
        value: `${skill.dotVal} de dano por turno por ${skill.dotDuration || 1} ${skill.dotDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-orange-500',
        targetLabel: getTargetLabel(skill.dotTarget, 'Alvo Principal')
      });
    }
    if (skill.bleedingVal && skill.bleedingVal > 0) {
      effects.push({
        label: 'Sangramento (Bleeding)',
        value: `${skill.bleedingVal} de dano por turno por ${skill.bleedingDuration || 1} ${skill.bleedingDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-red-500',
        targetLabel: getTargetLabel(skill.bleedingTarget, 'Alvo Principal')
      });
    }
    if (skill.afflictionVal && skill.afflictionVal > 0) {
      effects.push({
        label: 'Aflição (Aflicção)',
        value: `${skill.afflictionVal} de dano por turno por ${skill.afflictionDuration || 1} ${skill.afflictionDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-purple-400',
        targetLabel: getTargetLabel(skill.afflictionTarget, 'Alvo Principal')
      });
    }
    if (skill.paralyzeCooldownDuration && skill.paralyzeCooldownDuration > 0) {
      effects.push({
        label: 'Paralisar Cooldown',
        value: `Paralisa cooldowns por ${skill.paralyzeCooldownDuration} ${skill.paralyzeCooldownDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-amber-400',
        targetLabel: getTargetLabel(skill.paralyzeCooldownTarget, 'Alvo Principal')
      });
    }
    if (skill.gainChakra && skill.gainChakra > 0) {
      effects.push({
        label: 'Gerar Chakra',
        value: `Gera ${skill.gainChakra} chakra por turno por ${skill.gainChakraDuration || 1} ${skill.gainChakraDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-blue-400',
        targetLabel: getTargetLabel(skill.gainChakraTarget, 'Conjurador (Mim)')
      });
    }
    if (skill.drainChakra && skill.drainChakra > 0) {
      effects.push({
        label: 'Drenar Chakra',
        value: `Drena ${skill.drainChakra} chakra por turno por ${skill.drainChakraDuration || 1} ${skill.drainChakraDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-indigo-400',
        targetLabel: getTargetLabel(skill.drainChakraTarget, 'Alvo Principal')
      });
    }
    if (skill.removeShield) {
      effects.push({
        label: 'Destruir Escudos',
        value: `Remove escudos ativos por ${skill.removeShieldDuration || 1} ${skill.removeShieldDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-yellow-500',
        targetLabel: getTargetLabel(skill.shieldTarget, 'Alvo Principal')
      });
    }
    if (skill.invulnerableDuration && skill.invulnerableDuration > 0) {
      effects.push({
        label: 'Invulnerabilidade',
        value: `Fica invulnerável por ${skill.invulnerableDuration} ${skill.invulnerableDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-cyan-400',
        targetLabel: getTargetLabel(skill.shieldTarget, 'Conjurador (Mim)')
      });
    }
    if (skill.invisible && skill.invisibleDuration && skill.invisibleDuration > 0) {
      effects.push({
        label: 'Invisibilidade',
        value: `Fica invisível por ${skill.invisibleDuration} ${skill.invisibleDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-pink-400',
        targetLabel: getTargetLabel(skill.shieldTarget, 'Conjurador (Mim)')
      });
    }

    if (skill.counterAttack) {
  effects.push({
    label: 'Contra-Ataque',
    value: `Anula a próxima habilidade recebida por ${skill.counterAttackDuration || 1} ${skill.counterAttackDuration === 1 ? 'Turno' : 'Turnos'}`,
    color: 'text-red-400',
    targetLabel: getTargetLabel(skill.counterAttackTarget, 'Conjurador (Mim)')
  });
}
if (skill.reflect) {
  effects.push({
    label: 'Reflect',
    value: `Reflete a próxima habilidade recebida (${skill.reflectMode === 'RandomAlly' ? 'para um aliado aleatório' : 'de volta pro atacante'}) por ${skill.reflectDuration || 1} ${skill.reflectDuration === 1 ? 'Turno' : 'Turnos'}`,
    color: 'text-cyan-400',
    targetLabel: getTargetLabel(skill.reflectTarget, 'Conjurador (Mim)')
  });
}

if (skill.cannotBeCountered) {
  effects.push({
    label: 'Incontra-atacável',
    value: 'Esta habilidade NÃO pode ser contra-atacada ou anulada.',
    color: 'text-rose-400 font-bold',
  });
}
if (skill.cannotBeReflected) {
  effects.push({
    label: 'Irrefletível',
    value: 'Esta habilidade NÃO pode ser refletida.',
    color: 'text-cyan-400 font-bold',
  });
}

    if (effects.length === 0) return null;

    return (
      <div className="mt-2.5 pt-2 border-t border-slate-800/60 space-y-1.5 text-[10px] font-mono pointer-events-none text-left">
        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Efeitos da Habilidade:</p>
        <div className="grid grid-cols-1 gap-1.5">
          {effects.map((eff, idx) => (
            <div key={idx} className="flex flex-col gap-0.5 bg-slate-950/40 p-1.5 rounded border border-slate-900/60">
              <span className={`${eff.color} font-bold`}>{eff.label}:</span>
              <span className="text-slate-300 font-sans">{eff.value}</span>
              {eff.targetLabel && (
                <span className="text-[8px] text-slate-500">🎯 Aplicar em: <span className="text-slate-400 font-bold">{eff.targetLabel}</span></span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

 return (
  <div
    className="min-h-screen text-slate-100 flex flex-col font-sans relative select-none"
    style={{ zoom: 0.85 }}
  >
     <div
  className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
  style={{
    backgroundImage: "url('/static/img/bg/background-battle.webp')",
  }}
/>

      {/* Dynamic Chakra Roll Banner notification */}
      <AnimatePresence>
        {showRollBanner && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 bg-slate-900/95 border border-orange-500/50 rounded-2xl px-8 py-4 flex items-center gap-4 shadow-2xl shadow-orange-600/20 backdrop-blur"
          >
            <div className="bg-orange-600/10 p-2 rounded-lg border border-orange-500/30">
              <Sparkles className="w-5 h-5 text-orange-400 animate-spin" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-orange-400 font-bold uppercase tracking-wider">Giro de Chakra - Turno {turn}</p>
              <div className="flex items-center gap-2 mt-1">
                {lastChakraRoll.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-1 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
                    {renderChakraIcon(r as keyof ChakraPool)}
                    <span className="text-xs font-mono font-bold text-slate-300">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <img
  src="/static/img/ui/madeira.png"
  alt=""
  className="battle-wood-beam"
/>

      {/* Battle Header (Fixed Bottom) */}
      <header className="fixed bottom-0 left-0 right-0 z-20 h-16 sm:h-20 shadow-2xl flex items-center select-none header-footer">
        {/* Background Pergaminho Image */}
        
        <div className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-10 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {gameOver && (
              <button
                onClick={handleQuit}
                className="p-2 hover:bg-[#c49a5d] bg-[#d3ad75]/90 rounded-xl border border-[#7a4e25] text-stone-950 transition-all cursor-pointer shadow"
                title="Sair do Combate"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            {/* Left side quit button when game over */}
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Render-se button */}
            {!gameOver && (
              <button
                onClick={handleSurrender}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-red-800 to-rose-900 hover:from-red-700 hover:to-rose-800 text-amber-100 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-red-950/40 border border-red-600/50 transition-all cursor-pointer active:scale-95"
                title="Render-se da Partida"
              >
                <Flag className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Render-se</span>
              </button>
            )}

            {/* Music/Sound Toggle */}
            <button
              onClick={() => {
                playClickSound();
                onToggleMute();
              }}
              className="p-2 sm:p-2.5 rounded-xl bg-[#d3ad75]/90 hover:bg-[#c49a5d] border-2 border-[#7a4e25] text-stone-950 transition-all cursor-pointer shadow-md active:scale-95"
              title={isMuted ? 'Ativar som' : 'Desativar som'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-stone-900" /> : <Volume2 className="w-4 h-4 text-amber-950" />}
            </button>

            {/* End Turn Button */}
            <button
              onClick={handleEndTurn}
              disabled={!isSandbox && activePlanner !== 'player'}
              className={`px-4 sm:px-6 py-2 sm:py-2.5 ${
                isSandbox
                  ? activePlanner === 'player'
                    ? 'bg-gradient-to-r from-orange-800 to-amber-800 hover:from-orange-700 hover:to-amber-700 text-amber-100 border-orange-600/50 shadow-orange-950/40'
                    : 'bg-gradient-to-r from-red-800 to-rose-900 hover:from-red-700 hover:to-rose-800 text-amber-100 border-red-600/50 shadow-red-950/40'
                  : activePlanner === 'player'
                    ? 'bg-gradient-to-r from-orange-800 to-amber-800 hover:from-orange-700 hover:to-amber-700 text-amber-100 border-orange-600/50 shadow-orange-950/40'
                    : 'bg-stone-800/80 text-stone-400 border-stone-600 opacity-60 cursor-not-allowed'
              } font-black rounded-xl active:scale-95 transition-all shadow-lg text-xs uppercase tracking-widest cursor-pointer flex items-center gap-2 border`}
            >
              <Swords className="w-4 h-4" />
              {isSandbox
                ? activePlanner === 'player'
                  ? 'Terminar Turno Jogador'
                  : 'Terminar Turno Oponente'
                : activePlanner === 'player'
                  ? 'Finalizar Turno'
                  : 'Aguardando...'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Battle Grid Area */}

      <div className="leaves gpu-accelerated">
        <img src="/static/img/ui/folha.webp" className="leaf leaf1" alt="" loading="lazy" decoding="async" />
        <img src="/static/img/ui/folha.webp" className="leaf leaf2" alt="" loading="lazy" decoding="async" />
        <img src="/static/img/ui/folha.webp" className="leaf leaf3" alt="" loading="lazy" decoding="async" />
        <img src="/static/img/ui/folha.webp" className="leaf leaf4" alt="" loading="lazy" decoding="async" />
        <img src="/static/img/ui/folha.webp" className="leaf leaf5" alt="" loading="lazy" decoding="async" />
        <img src="/static/img/ui/folha.webp" className="leaf leaf6" alt="" loading="lazy" decoding="async" />
      </div>


      <main className="main-area max-w-8xl w-full mx-auto px-2 sm:px-6 pt-4 pb-36 flex-1 grid grid-cols-12 gap-3 sm:gap-8 items-start">
        {/* Left Side: PLAYER SQUAD (4 Columns) */}
        <section className="col-span-4 space-y-6">
          {/* BEAUTIFUL COMPETITIVE GAME USER PROFILE CARD */}
          <div
            onClick={() => {
              playClickSound();
              setViewingProfile({
                profile: {
                  name: user.name,
                  username: user.username,
                  photoUrl: user.photoUrl,
                  title: user.title,
                  equippedFrame: user.equippedFrame,
                  equippedFrameUrl: user.equippedFrameUrl,
                  level: 15,
                  wins: 28,
                  losses: 4,
                  village: 'Vila da Folha (Konoha)',
                },
                isSelf: true,
              });
            }}
            className="relative overflow-hidden bg-gradient-to-r from-slate-900/95 via-slate-900/70 to-slate-950/80 border border-slate-800 rounded-2xl p-4 flex items-center gap-4 shadow-2xl group transition-all duration-300 hover:border-orange-500/80 cursor-pointer"
            title="Clique para ver o Card do Perfil & Curtidas"
          >
            {/* Background absolute flare */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/5 rounded-full blur-2xl group-hover:bg-orange-600/10 transition-all pointer-events-none" />
            
            {/* Avatar container with high fidelity glow and frame overlay */}
            <div className="relative w-14 h-14 flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-tr from-orange-600 to-amber-500 rounded-full blur-sm opacity-50 animate-pulse group-hover:opacity-80 transition-all" />
              <div className="relative w-full h-full rounded-full border-2 border-orange-500/80 overflow-hidden shadow-lg p-0.5 bg-slate-950">
                <img
                  src={user.photoUrl}
                  alt={user.name}
                  className="w-full h-full rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              {user.equippedFrameUrl && (
                <img
                  src={user.equippedFrameUrl}
                  alt="Moldura"
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[135%] h-[135%] max-w-none pointer-events-none object-contain z-10"
                />
              )}
            </div>

            {/* Profile Info details */}
            <div className="flex-1 text-left">
              <p className="text-xs font-mono text-orange-400 font-black uppercase tracking-wider mb-0.5">
                {user.title || 'Shinobi'}
              </p>
              <h4 className="text-base font-black tracking-tight text-white uppercase truncate flex items-center gap-1.5 font-display group-hover:text-orange-400 transition-colors">
                {user.name}
              </h4>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-mono text-slate-400">@{user.username}</span>
                <span className="w-1 h-1 bg-slate-600 rounded-full" />
               
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {playerCombatants.map((combatant, idx) => {
              const isSelectedSource = selectedSkill?.charId === combatant.id;
              const hasCued = cuedActions.some(a => a.sourceId === combatant.id);
              const cuedAct = cuedActions.find(a => a.sourceId === combatant.id);
              const isStunned = combatant.activeEffects.some(e => e.type === 'stun' && isEffectVisibleToViewer(e, 'player'));
              const incomingCues = cuedActions.filter(a => a.targetId === combatant.id);

              return (
                <div key={combatant.id} className="flex items-center gap-2 sm:gap-3 items-stretch">
                  {/* Standing Skin PNG Artwork (OUTSIDE card on left side) */}
                  {(() => {
                    const skinImg = combatant.character.selectedSkinUrl || combatant.character.skins?.[0]?.image;
                    return (
                      <div className="w-24 sm:w-32 flex-shrink-0 flex items-center justify-center relative select-none pointer-events-none self-stretch">
                        {skinImg ? (
                          <img
                            src={skinImg}
                            alt={combatant.character.name}
                            referrerPolicy="no-referrer"
                            className="h-full w-auto max-w-full object-contain filter drop-shadow-[0_6px_12px_rgba(0,0,0,0.95)]"
                            onError={(e) => {
                              const img = e.currentTarget;
                              img.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full" />
                        )}
                      </div>
                    );
                  })()}

                  {/* Main Combatant Card Container */}
                  <div
                    onClick={() => handleSelectTarget(combatant.id, false)}
                    className={`flex-1 relative p-4 rounded-xl border bg-slate-900/60 transition-all ${
                      combatant.isDead
                        ? 'border-slate-950 bg-slate-950/40 opacity-40 pointer-events-none'
                        : selectedSkill && selectedSkill.charId !== combatant.id
                        ? 'border-blue-500/40 hover:border-blue-500 bg-blue-950/5 cursor-pointer shadow-lg shadow-blue-500/5'
                        : 'border-slate-800'
                    }`}
                  >
                  {/* Floating combat numbers portal */}
                  <div className="absolute -top-3 left-4 z-10 flex flex-col gap-1 pointer-events-none">
                    {floatingTexts
                      .filter(f => f.targetId === combatant.id)
                      .map((f, fIdx) => {
                        let textClass = 'text-red-500 shadow-red-500/5';
                        if (f.type === 'heal') textClass = 'text-emerald-400 shadow-emerald-500/5';
                        if (f.type === 'shield') textClass = 'text-blue-400 shadow-blue-500/5';
                        if (f.type === 'stun') textClass = 'text-amber-500';
                        if (f.type === 'effect') textClass = 'text-orange-400';

                        return (
                          <motion.span
                            key={`${f.id}-${fIdx}`}
                            initial={{ opacity: 0, y: 10, scale: 0.8 }}
                            animate={{ opacity: 1, y: -20, scale: 1.1 }}
                            exit={{ opacity: 0 }}
                            className={`font-mono text-xs font-black bg-slate-950 px-2.5 py-1 rounded border border-slate-800 shadow-lg ${textClass}`}
                          >
                            {f.text}
                          </motion.span>
                        );
                      })}
                  </div>

                  {/* Incoming skills icons (Targeted skills prediction) */}
                  {incomingCues.length > 0 && (
                    <div className="absolute top-2 right-2 flex gap-1 items-center bg-slate-950/90 border border-orange-500/40 px-1.5 py-0.5 rounded-lg shadow-lg z-10" onClick={(e) => e.stopPropagation()}>
                      
                      {incomingCues.map((cue, cIdx) => {
                        const src = playerCombatants.find(p => p.id === cue.sourceId);
                        const skill = src?.character.skills[cue.skillIndex];
                        return (
                          <div key={`${cue.sourceId}-${cue.skillIndex}-${cIdx}`} className="group relative">
                            <img
                              src={skill?.icon}
                              alt={skill?.name}
                              className="w-5 h-5 rounded border border-orange-500/50 hover:border-orange-400 transition-all object-cover cursor-pointer"
                              onError={(e) => {
                                const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                              }}
                            />
                            {/* Skill Tooltip */}
                            <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover:block bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[9px] text-slate-200 z-50 whitespace-nowrap shadow-2xl pointer-events-none">
                              <span className="text-orange-400 font-bold">{src?.character.name}</span>: [{skill?.name}]
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Character Info */}
                  <div className="flex gap-3">
                    <div className="w-14 h-14 rounded-lg overflow-hidden border border-slate-800 bg-slate-950 flex-shrink-0 relative">
                      <img 
                        src={combatant.character.portrait} 
                        alt={combatant.character.name} 
                        className="w-full h-full object-cover" 
                        onError={(e) => {
                           const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg';
                        }}
                      />
                      {isStunned && (
                        <div className="absolute inset-0 bg-red-950/85 border border-red-500/80 flex flex-col items-center justify-center p-0.5 font-mono text-[8px] font-black text-red-300 tracking-tighter text-center leading-none uppercase animate-pulse">
                          <span>⚡ STUN</span>
                          <span className="text-[7px] text-red-400">DEBUFF</span>
                        </div>
                      )}
                      {(() => {
                        const invulnEff = combatant.activeEffects.find(e => e.type === 'invulnerable');
                        if (!invulnEff || isStunned) return null;
                        return (
                          <div className="absolute inset-0 rounded-lg overflow-hidden z-10 border-2 border-cyan-400/80">
                            {invulnEff.icon && (
                              <img src={invulnEff.icon} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                            )}
                            <div className="absolute inset-0 bg-cyan-950/60 flex items-center justify-center">
                              <span className="bg-cyan-950/90 px-1 py-0.5 rounded border border-cyan-400/60 font-mono text-[7px] font-black text-cyan-300 uppercase tracking-wider text-center drop-shadow-lg">
                                INVULNERÁVEL
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="flex-1 space-y-1.5">
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-sm tracking-tight">{combatant.character.name}</h4>
                        {combatant.shield > 0 && (
                          <span className="text-[9px] bg-blue-500/10 border border-blue-500/30 text-blue-400 px-1.5 py-0.5 rounded font-mono font-bold">
                            Escudo {combatant.shield}
                          </span>
                        )}
                      </div>

                      {/* Health bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-mono text-slate-400 leading-none">
                          <span>Vida</span>
                          <span className="font-bold text-slate-100">{combatant.health} / {combatant.maxHealth}</span>
                        </div>
                        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                          <div
                            className={`h-full transition-all duration-300 ${getHealthColor(combatant.health)}`}
                            style={{ width: `${combatant.health}%` }}
                          />
                        </div>
                      </div>

                      {/* Explicit Stun Debuff Banner */}
                      {isStunned && (() => {
                        const stunEffs = combatant.activeEffects.filter(e => e.type === 'stun' && isEffectVisibleToViewer(e, 'player'));
                        const stunTypeLabels: Record<any, string> = {
                          physical: 'Físico', mental: 'Mental', affliction: 'Aflição', chakra: 'Chakra',
                        };
                        const allStunTypes = Array.from(new Set(
                          stunEffs.flatMap(e => (!e.stunType || e.stunType.length === 0 || e.stunType.length >= 4) ? ['physical', 'mental', 'affliction', 'chakra'] : e.stunType)
                        ));
                        const isCompleteStun = allStunTypes.length >= 4;
                        const stunTypesStr = isCompleteStun
                          ? 'Físico + Mental + Aflição + Chakra (Total)'
                          : allStunTypes.map((t: any) => stunTypeLabels[t] || t).join(' + ');
                        const maxDur = Math.max(...stunEffs.map(e => e.duration), 1);

                        return (
                          <div className="mt-1.5 p-1.5 rounded-lg bg-red-950/90 border border-red-600/80 text-red-200 font-mono text-[10px] space-y-0.5 shadow-md shadow-red-950/50 animate-pulse">
                            <div className="flex items-center justify-between font-bold text-red-400 text-[10px]">
                              <span className="flex items-center gap-1">⚡ <span>DEBUFF: ATORDOADO</span></span>
                              <span className="text-[9px] bg-red-900/90 text-red-100 px-1.5 py-0.2 rounded border border-red-700 font-black">
                                {maxDur}T
                              </span>
                            </div>
                            <p className="text-[9px] text-red-300/90 font-sans leading-tight">
                              🚫 <strong>Impedido:</strong> {stunTypesStr}
                            </p>
                          </div>
                        );
                      })()}

                      {combatant.lastTurnStatus && (
                        <div className={`mt-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded border flex items-center justify-center gap-1 animate-pulse uppercase tracking-wider ${
                          combatant.lastTurnStatus === 'ANULADO'
                            ? 'bg-red-500/15 border-red-500/30 text-red-400'
                            : combatant.lastTurnStatus === 'REFLETIDO'
                            ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                            : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                        }`}>
                          {combatant.lastTurnStatus === 'ANULADO' && '🚫 Anulado'}
                          {combatant.lastTurnStatus === 'REFLETIDO' && '🔄 Refletido'}
                          {combatant.lastTurnStatus === 'CONTRA-ATAQUE' && '🛡️ Contra-Atacou'}
                        </div>
                      )}

                      {/* Active Status Badges */}
                      {combatant.activeEffects.length > 0 && (() => {
                        const groupedEffects = getGroupedActiveEffects(combatant.activeEffects, 'player');

                        return (
                          <div className="flex items-center gap-1.5 pt-1.5 w-full">
                            <div className="flex flex-wrap gap-1.5 items-center">
                              {groupedEffects.map((item, effIdx) => {
                                const eff = item.effect;
                                const isDebuff = eff.type === 'stun' || eff.type === 'dot' || eff.type === 'bleeding' || eff.type === 'affliction' || eff.type === 'paralyze_cooldown' || eff.type === 'damage' || eff.type === 'direct_damage' || eff.name.toLowerCase().includes('burn') || eff.name.toLowerCase().includes('stun') || eff.name.toLowerCase().includes('sangramento') || eff.name.toLowerCase().includes('aflição') || eff.name.toLowerCase().includes('queimadura') || eff.name.toLowerCase().includes('atordoado') || eff.name.toLowerCase().includes('atordoamento');

                                return (
                                  <div
                                    key={effIdx}
                                    className={`relative group flex items-center justify-center p-0.5 rounded-xl select-none bg-slate-950 border-2 transition-all hover:scale-110 hover:z-30 cursor-help shrink-0 ${
                                      isDebuff
                                        ? 'border-red-500/80 shadow-md shadow-red-950/60'
                                        : 'border-emerald-500/80 shadow-md shadow-emerald-950/60'
                                    }`}
                                  >
                                    <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-lg overflow-hidden flex items-center justify-center bg-slate-900">
                                      {eff.icon ? (
                                        <img
                                          src={eff.icon}
                                          alt={eff.name}
                                          referrerPolicy="no-referrer"
                                          className="w-full h-full object-cover rounded-lg"
                                          onError={(e) => {
                                            const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                                          }}
                                        />
                                      ) : (
                                        <span className={`w-3.5 h-3.5 rounded-full ${isDebuff ? 'bg-red-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
                                      )}
                                      {eff.irremovable && (
                                        <span className="absolute top-0 right-0 bg-slate-950/80 rounded text-[8px] p-0.5">🔒</span>
                                      )}
                                    </div>

                                    {/* Overlay stack badge ONLY if stacks > 1 */}
                                    {item.stacks > 1 && (
                                      <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-amber-400 border-2 border-slate-950 text-[10px] font-mono font-black text-slate-950 shadow-md z-20">
                                        {item.stacks}
                                      </span>
                                    )}

                                    {/* Rich Tooltip on hover */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-50 pointer-events-none">
                                      <div className="bg-slate-950/95 border border-slate-700 rounded-xl p-2.5 text-center shadow-2xl backdrop-blur-md w-48 text-white">
                                        <div className="flex items-center justify-center gap-1.5 mb-1">
                                          <span className={`text-[8px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded-full border ${
                                            isDebuff ? 'bg-red-950/80 border-red-800/80 text-red-400' : 'bg-emerald-950/80 border-emerald-800/80 text-emerald-400'
                                          }`}>
                                            {isDebuff ? 'DEBUFF' : 'BUFF'}
                                          </span>
                                          <span className="font-extrabold text-xs text-orange-300 truncate">{eff.name}</span>
                                        </div>

                                        <p className="text-xs text-slate-200 font-sans leading-snug my-1">
                                          {item.description}
                                        </p>

                                        <div className="flex items-center justify-center gap-2 pt-1 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
                                          <span>Duração: <strong className="text-amber-400">{eff.duration}T</strong></span>
                                          {item.stacks > 1 && (
                                            <span>• Acúmulos: <strong className="text-amber-400">{item.stacks}x</strong></span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="w-2 h-2 bg-slate-950 border-r border-b border-slate-700 rotate-45 -mt-1" />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Character Skills list */}
                  {!combatant.isDead && (() => {
                    const skillsPerPage = 4;
                    const skillsPage = combatantSkillPages[combatant.id] || 0;
                    const totalSkillPages = Math.ceil(combatant.character.skills.length / skillsPerPage);
                    const paginatedSkills = combatant.character.skills.slice(skillsPage * skillsPerPage, (skillsPage + 1) * skillsPerPage);

                    return (
                      <div className="relative pt-3 mt-3 border-t border-slate-800/80">
                        {/* Left side pagination arrow */}
                        {totalSkillPages > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playCustomSound('Scroll');
                              setCombatantSkillPages(prev => ({
                                ...prev,
                                [combatant.id]: Math.max(0, skillsPage - 1)
                              }));
                            }}
                            disabled={skillsPage === 0}
                            className={`absolute -left-2 top-1/2 -translate-y-1/2 z-20 p-1 rounded-full bg-slate-950/90 border border-slate-700/80 text-slate-300 hover:text-orange-400 hover:border-orange-500 shadow-md transition-all ${
                              skillsPage === 0 ? 'opacity-20 cursor-not-allowed border-slate-900' : 'cursor-pointer hover:scale-110 active:scale-95'
                            }`}
                            title="Anterior"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <div className="grid grid-cols-4 gap-2">
                          {paginatedSkills.map((skill, pIdx) => {
                            const sIdx = skillsPage * skillsPerPage + pIdx;
                            const isCooldown = skill.currentCooldown > 0;
                            const isCued = cuedAct && cuedAct.skillIndex === sIdx;
                            const simulatedChakraForThisChar = getSimulatedRemainingChakra(
                              playerChakra,
                              cuedActions.filter(a => a.sourceId !== combatant.id)
                            );
                            const canAfford = canAffordSkill(skill, simulatedChakraForThisChar);
                            const isRequiredEffectLocked = skill.requireEffect && !combatant.activeEffects.some(e => e.name === skill.requireEffect);
                            const isStunBlocked = isSkillBlockedByStun(skill, combatant.activeEffects);

                            return (
                              <div
                                key={sIdx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isStunBlocked) {
                                    addFloatingText(combatant.id, `⚡ ATORDOADO! (${skill.name})`, 'stun');
                                    return;
                                  }
                                  if (isRequiredEffectLocked) {
                                    addFloatingText(combatant.id, `Requer ${skill.requireEffect}!`, 'effect');
                                    return;
                                  }
                                  handleSelectSkill(combatant.id, sIdx);
                                }}
                                className={`group relative aspect-square rounded-lg border overflow-hidden bg-slate-950 flex flex-col items-center justify-center cursor-pointer transition-all ${
                                  isCued
                                    ? 'border-orange-500 shadow shadow-orange-600/35 ring-1 ring-orange-500'
                                    : isStunBlocked
                                    ? 'border-red-600 bg-red-950/80 opacity-40 grayscale shadow-md shadow-red-950/60'
                                    : isCooldown
                                    ? 'border-slate-950 opacity-30 cursor-not-allowed'
                                    : isRequiredEffectLocked
                                    ? 'border-red-950/60 opacity-20 grayscale cursor-not-allowed hover:opacity-30'
                                    : !canAfford
                                    ? 'border-slate-950 opacity-20 grayscale-[60%] hover:opacity-40'
                                    : 'border-slate-800 hover:border-slate-600'
                                }`}
                              >
                                <img 
                                  src={skill.icon} 
                                  alt={skill.name} 
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                                  }}
                                />

                                {/* Cooldown Overlay */}
                                {isCooldown && (
                                  <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center">
                                    <span className="font-mono text-xs font-black text-orange-400">
                                      {skill.currentCooldown}
                                    </span>
                                  </div>
                                )}

                                {/* Stun Blocked Overlay */}
                                {isStunBlocked && !isCooldown && (
                                  <div className="absolute inset-0 bg-red-950/90 border-2 border-red-500 flex flex-col items-center justify-center p-0.5 text-center z-10">
                                    <span className="text-red-300 text-sm font-black animate-pulse drop-shadow-lg">⚡</span>
                                    <span className="text-[8px] font-mono font-black text-red-200 uppercase tracking-wider drop-shadow-md">STUN</span>
                                  </div>
                                )}

                                {/* Required Effect Locked Overlay (🔒) */}
                                {isRequiredEffectLocked && !isCooldown && !isStunBlocked && (
                                  <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center">
                                    <span className="text-red-500 font-bold drop-shadow-md text-xs">🔒</span>
                                  </div>
                                )}

                                {/* Cued Indicator Overlay */}
                                {isCued && (
                                  <div className="absolute inset-0 bg-orange-600/10 border-2 border-orange-500 flex items-center justify-center">
                                    <div className="bg-orange-500 text-slate-950 font-mono text-[8px] font-black uppercase px-1 rounded shadow-md">
                                      PREPARADO
                                    </div>
                                  </div>
                                )}

                                {/* Hover Details tooltip card */}
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-48 bg-slate-900 border border-slate-700/80 p-2.5 rounded-lg shadow-xl z-30 pointer-events-none text-left">
                                  <p className="font-bold text-xs text-white pb-1 border-b border-slate-800">{skill.name}</p>
                                  <p className="text-[10px] text-slate-400 leading-normal pt-1">{skill.desc}</p>
                                  
                                  {(skill.cannotBeCountered || skill.cannotBeReflected) && (
                                    <div className="flex flex-col gap-0.5 mt-1 text-[8px] font-mono">
                                      {skill.cannotBeCountered && (
                                        <span className="text-red-400 font-bold">🚫 Incontra-atacável</span>
                                      )}
                                      {skill.cannotBeReflected && (
                                        <span className="text-cyan-400 font-bold">🚫 Irrefletível</span>
                                      )}
                                    </div>
                                  )}
                                  
                                  {isStunBlocked && (
                                    <p className="text-[9px] font-bold mt-1.5 font-mono text-red-400 bg-red-950/90 p-1 rounded border border-red-800">
                                      ⚡ BLOQUEADA POR ATORDOAMENTO (STUN)!
                                    </p>
                                  )}

                                  {skill.requireEffect && (
                                    <p className={`text-[9px] font-bold mt-1.5 font-mono ${isRequiredEffectLocked ? 'text-red-500' : 'text-emerald-500'}`}>
                                      {isRequiredEffectLocked ? '🔒 Requer: ' : '🔓 Ativo: '} {skill.requireEffect}
                                    </p>
                                  )}

                                  <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 pt-1.5 border-t border-slate-800/60 mt-2">
                                    <span>Cooldown: {skill.cooldown}</span>
                                    <div className="flex gap-0.5">
                                      {skill.cost.map((c, costIdx) => (
                                        <div key={costIdx} className="scale-75">{renderChakraIcon(c as keyof ChakraPool)}</div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Right side pagination arrow */}
                        {totalSkillPages > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playCustomSound('Scroll');
                              setCombatantSkillPages(prev => ({
                                ...prev,
                                [combatant.id]: Math.min(totalSkillPages - 1, skillsPage + 1)
                              }));
                            }}
                            disabled={skillsPage === totalSkillPages - 1}
                            className={`absolute -right-2 top-1/2 -translate-y-1/2 z-20 p-1 rounded-full bg-slate-950/90 border border-slate-700/80 text-slate-300 hover:text-orange-400 hover:border-orange-500 shadow-md transition-all ${
                              skillsPage === totalSkillPages - 1 ? 'opacity-20 cursor-not-allowed border-slate-900' : 'cursor-pointer hover:scale-110 active:scale-95'
                            }`}
                            title="Próximo"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Center: ARENA CONTROL BOARD & CHAKRA (4 Columns) */}
        <section className="col-span-4 space-y-6 bg-slate-900/40 p-3 sm:p-5 rounded-2xl border border-slate-900">
          {/* TURN, TIMER, TURN STATUS & CHAKRA PANEL */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 sm:p-4 shadow-lg space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-orange-400" />
                <h2 className="text-base sm:text-lg font-black tracking-tight text-amber-400 font-sans">
                  TURNO {turn}
                </h2>
              </div>

              {!isWaitingForOpponent && !gameOver && (
                <div className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-black uppercase tracking-wider transition-all duration-300 shadow ${
                    timeLeft <= 10
                      ? 'bg-red-800/90 border-red-500 text-amber-100 animate-pulse'
                      : 'bg-amber-950/90 border-amber-500/50 text-amber-100'
                  }`}>
                    <Clock className={`w-3.5 h-3.5 ${timeLeft <= 10 ? 'animate-bounce text-red-300' : 'text-amber-300 animate-pulse'}`} />
                    <span>{timeLeft}s</span>
                  </div>

                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-black uppercase tracking-wider transition-all duration-300 shadow ${
                    activePlanner === 'player'
                      ? 'bg-emerald-900/90 border-emerald-500/60 text-emerald-100'
                      : 'bg-red-900/90 border-red-500/60 text-red-100 animate-pulse'
                  }`}>
                    {activePlanner === 'player' ? 'Seu Turno' : 'Vez do Oponente'}
                  </div>
                </div>
              )}
            </div>

            {/* Active Player Chakra Pool */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                  Estoque de Chakra:
                </span>
                <button
                  onClick={() => setShowChakraTrade(true)}
                  className="text-[10px] font-mono uppercase tracking-wider text-orange-400 border border-orange-500/40 rounded px-2 py-0.5 hover:bg-orange-500/10 cursor-pointer transition-colors"
                >
                  Trocar 4→1
                </button>
              </div>

              <div className="flex justify-around items-center bg-slate-950/60 border border-slate-900 rounded-xl py-2 px-3">
                {(() => {
                  const simulatedChakra = getSimulatedRemainingChakra(playerChakra, cuedActions);
                  return (Object.keys(playerChakra) as (keyof ChakraPool)[]).map(key => {
                    let dotColorClass = '';
                    let labelColorClass = '';
                    let desc = '';
                    if (key === 'Tai') {
                      dotColorClass = 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.75)]';
                      labelColorClass = 'text-red-400';
                      desc = 'Taijutsu';
                    } else if (key === 'Nin') {
                      dotColorClass = 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.75)]';
                      labelColorClass = 'text-blue-400';
                      desc = 'Ninjutsu';
                    } else if (key === 'Gen') {
                      dotColorClass = 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.75)]';
                      labelColorClass = 'text-emerald-400';
                      desc = 'Genjutsu';
                    } else if (key === 'Blood') {
                      dotColorClass = 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.75)]';
                      labelColorClass = 'text-purple-400';
                      desc = 'Bloodline';
                    }

                    const simulatedVal = simulatedChakra[key];
                    const hasChange = simulatedVal !== playerChakra[key];

                    return (
                      <div key={key} className="flex flex-col items-center gap-0.5 group relative">
                        <div className={`w-3 h-3 rounded-full ${dotColorClass} transition-transform group-hover:scale-110`} />
                        <span className="font-mono text-sm font-black text-slate-200 mt-0.5 flex items-center">
                          {playerChakra[key]}
                          {hasChange && (
                            <span className="text-orange-400 text-xs ml-1 font-bold animate-pulse">
                              ({simulatedVal})
                            </span>
                          )}
                        </span>
                        <span className={`text-[8px] font-mono font-bold uppercase tracking-wider ${labelColorClass}`}>{key}</span>

                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-950 border border-slate-850 rounded px-2 py-1 text-[9px] text-white z-50 whitespace-nowrap pointer-events-none shadow-lg">
                          {desc} {hasChange ? `(Previsão: ${simulatedVal})` : ''}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          {/* Central Console Area: Skill Inspector & Battle Logs Tabs */}
          <div className="space-y-4">
            <div className="flex border-b border-slate-800">
              <button
                onClick={() => {
                  playClickSound();
                  setCenterTab('inspector');
                }}
                className={`flex-1 py-2 text-center text-xs font-mono uppercase font-bold tracking-wider transition-all border-b-2 cursor-pointer ${
                  centerTab === 'inspector'
                    ? 'border-orange-500 text-orange-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-950/20'
                }`}
              >
                📖 Skill Inspector
              </button>
              <button
                onClick={() => {
                  playClickSound();
                  setCenterTab('logs');
                }}
                className={`flex-1 py-2 text-center text-xs font-mono uppercase font-bold tracking-wider transition-all border-b-2 cursor-pointer ${
                  centerTab === 'logs'
                    ? 'border-orange-500 text-orange-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-950/20'
                }`}
              >
                📜 Battle Logs
              </button>
            </div>

            {centerTab === 'inspector' ? (
              <div className="bg-slate-950/80 border border-slate-950 rounded-xl p-4 min-h-[16rem] max-h-[65vh] flex flex-col">
                {inspectedSkill ? (
                  <div className="space-y-3.5 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 pr-1">
                    {/* Top Row: Skill Icon, Name & Owner */}
                    <div className="flex gap-3 pb-3 border-b border-slate-900">
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-800 flex-shrink-0 bg-slate-900">
                        <img 
                          src={inspectedSkill.skill.icon} 
                          alt={inspectedSkill.skill.name} 
                          className={`w-full h-full object-cover ${inspectedSkill.isEnemy ? 'scale-x-[-1]' : ''}`}
                          onError={(e) => {
                            const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-sm tracking-tight text-white truncate">{inspectedSkill.skill.name}</h4>
                          <span className={`text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                            inspectedSkill.isEnemy 
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}>
                            {inspectedSkill.isEnemy ? 'Oponente' : 'Aliado'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Shinobi: <strong className="text-orange-400">{inspectedSkill.ownerName}</strong>
                        </p>
                      </div>
                    </div>

                    {/* Cost, Cooldown & Target Grid */}
                    <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                      {/* Chakra Cost */}
                      <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-900 flex flex-col justify-between">
                        <span className="text-slate-500 uppercase tracking-wide">Custo</span>
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {inspectedSkill.skill.cost.length === 0 ? (
                            <span className="text-emerald-400 text-[9px] font-bold">Sem Custo</span>
                          ) : (
                            inspectedSkill.skill.cost.map((c, idx) => (
                              <div key={idx} className="scale-95">{renderChakraIcon(c)}</div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Cooldown */}
                      <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-900 flex flex-col justify-between">
                        <span className="text-slate-500 uppercase tracking-wide">Recarga</span>
                        <p className="font-bold text-slate-200 mt-1 flex items-center gap-1">
                          {inspectedSkill.skill.cooldown === 0 ? 'Sem Recarga' : `${inspectedSkill.skill.cooldown} turnos`}
                        </p>
                      </div>

                      {/* Target type */}
                      <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-900 flex flex-col justify-between">
                        <span className="text-slate-500 uppercase tracking-wide">Alvo</span>
                        <p className="font-bold text-slate-200 mt-1 truncate">
                          {inspectedSkill.skill.targetType === 'Enemy' && 'Inimigo Único'}
                          {inspectedSkill.skill.targetType === 'Self' && 'Próprio'}
                          {inspectedSkill.skill.targetType === 'Ally' && 'Aliado Único'}
                          {inspectedSkill.skill.targetType === 'AllEnemies' && 'Todos os Inimigos'}
                          {inspectedSkill.skill.targetType === 'AllAllies' && 'Todos os Aliados'}
                        </p>
                      </div>
                    </div>

                    {/* Classes & Tags */}
                    {inspectedSkill.skill.classes && inspectedSkill.skill.classes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {inspectedSkill.skill.classes.map((cls, idx) => (
                          <span key={idx} className="text-[9px] font-mono bg-slate-900 text-slate-400 px-2 py-0.5 rounded-md border border-slate-800">
                            {cls}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Protection & Immunity Tags */}
                    {(inspectedSkill.skill.cannotBeCountered || inspectedSkill.skill.cannotBeReflected) && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {inspectedSkill.skill.cannotBeCountered && (
                          <span className="text-[9px] font-mono bg-red-950/40 text-red-400 px-2.5 py-0.5 rounded-md border border-red-900/60 font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                            🚫 Incontra-atacável
                          </span>
                        )}
                        {inspectedSkill.skill.cannotBeReflected && (
                          <span className="text-[9px] font-mono bg-cyan-950/40 text-cyan-400 px-2.5 py-0.5 rounded-md border border-cyan-900/60 font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                            🚫 Irrefletível
                          </span>
                        )}
                      </div>
                    )}

                    {/* Requirement Warning */}
                    {inspectedSkill.skill.requireEffect && (
                      <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg text-[9px] font-mono text-amber-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Requer efeito ativo: <strong className="underline">{inspectedSkill.skill.requireEffect}</strong>
                      </div>
                    )}

                    {/* Skill Detailed Description */}
                    <div className="bg-slate-900/30 rounded-lg p-3 border border-slate-900/60">
                      <p className="text-xs text-slate-300 leading-relaxed font-sans">{inspectedSkill.skill.desc}</p>
                      {renderSkillCustomEffects(inspectedSkill.skill)}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-6 my-auto space-y-2">
                    <Info className="w-8 h-8 text-slate-600 animate-pulse" />
                    <p className="text-xs font-mono text-slate-400 font-bold">Inspecione uma Habilidade</p>
                    <p className="text-[10px] text-slate-500 max-w-xs">
                      Clique em qualquer ícone de habilidade dos seus aliados ou dos oponentes para ver as estatísticas, custos e descrições aqui.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-64 rounded-xl border border-slate-950 bg-slate-950/80 p-4 overflow-y-auto font-mono text-xs space-y-2 leading-relaxed scrollbar-thin scrollbar-thumb-slate-900">
                {logs.map((log, lIdx) => {
                  let colorClass = 'text-slate-400';
                  if (log.type === 'damage') colorClass = 'text-red-400';
                  if (log.type === 'heal') colorClass = 'text-emerald-400';
                  if (log.type === 'buff') colorClass = 'text-blue-400';
                  if (log.type === 'stun') colorClass = 'text-amber-500';
                  if (log.type === 'death') colorClass = 'text-red-500 font-bold';
                  if (log.type === 'chakra') colorClass = 'text-indigo-400';

                  return (
                    <p key={`${log.id}-${lIdx}`} className={colorClass}>
                      <span className="text-slate-600 font-semibold">[Turno {log.turn}]</span> {log.message}
                    </p>
                  );
                })}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>

          {/* Current Turn Action cues */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold pb-2 border-b border-slate-900">
              Suas Ações Preparadas ({cuedActions.length})
            </h3>

            {cuedActions.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-4 italic font-mono">Nenhuma ação preparada. Selecione habilidades e alvos.</p>
            ) : (
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {cuedActions.map((action, idx) => {
                  const isSrcEnemy = action.sourceId.startsWith('enemy');
                  const src = isSrcEnemy
                    ? enemyCombatants.find(e => e.id === action.sourceId)
                    : playerCombatants.find(p => p.id === action.sourceId);
                  const skill = src?.character.skills[action.skillIndex];
                  const tgt =
                    playerCombatants.find(p => p.id === action.targetId) ||
                    enemyCombatants.find(e => e.id === action.targetId);

                  return (
                    <div
                      key={idx}
                      className="flex justify-between items-center bg-slate-950 border border-slate-800 p-2 rounded-lg text-[10px] font-mono"
                    >
                      <div className="flex items-center gap-2">
                        <img 
                          src={skill?.icon} 
                          alt={skill?.name} 
                          className={`w-5 h-5 rounded object-cover ${isSrcEnemy ? 'scale-x-[-1]' : ''}`}
                          onError={(e) => {
                            const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                          }}
                        />
                        <span>
                          <strong className={isSrcEnemy ? 'text-emerald-400' : 'text-orange-400'}>{src?.character.name}</strong> vai usar [
                          {skill?.name}] em <strong className={action.targetId.startsWith('enemy') ? 'text-emerald-400' : 'text-blue-400'}>{tgt?.character.name}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right Side: ENEMY SQUAD (4 Columns) */}
        <section className="col-span-4 space-y-6">
          {/* BEAUTIFUL COMPETITIVE GAME USER PROFILE CARD (ENEMY) */}
          <div
            onClick={() => {
              playClickSound();
              const isOnline = onlineParams?.isOnline;
              const opp = isOnline ? onlineParams.opponentProfile : null;
              setViewingProfile({
                profile: {
                  name: opp?.name || 'I.A. Kakashi',
                  username: opp?.username || 'ia_kakashi',
                  photoUrl: opp?.photoUrl || 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg',
                  title: opp?.title || 'Renegado S-Rank',
                  equippedFrame: opp?.equippedFrame,
                  equippedFrameUrl: opp?.equippedFrameUrl,
                  isBot: !isOnline,
                  level: 20,
                  wins: 35,
                  losses: 12,
                  village: isOnline ? 'Vila Oponente' : 'Vila do Som',
                },
                isSelf: false,
              });
            }}
            className="relative overflow-hidden bg-gradient-to-r from-slate-950/80 via-slate-900/70 to-slate-900/95 border border-slate-800 rounded-2xl p-4 flex items-center gap-4 shadow-2xl group transition-all duration-300 hover:border-red-500/80 cursor-pointer"
            title="Clique para ver o Card do Perfil do Oponente & Curtir"
          >
            {/* Background absolute flare */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full blur-2xl group-hover:bg-red-600/10 transition-all pointer-events-none" />
            
            {/* Avatar container with high fidelity glow and frame overlay */}
            <div className="relative w-14 h-14 flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-tr from-red-600 to-rose-500 rounded-full blur-sm opacity-50 animate-pulse group-hover:opacity-80 transition-all" />
              <div className="relative w-full h-full rounded-full border-2 border-red-500/80 overflow-hidden shadow-lg p-0.5 bg-slate-950">
                <img
                  src={onlineParams?.isOnline ? onlineParams.opponentProfile.photoUrl : 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg'}
                  alt={onlineParams?.isOnline ? onlineParams.opponentProfile.name : 'I.A. Oponente'}
                  className="w-full h-full rounded-full object-cover scale-x-[-1]"
                  referrerPolicy="no-referrer"
                />
              </div>
              {onlineParams?.isOnline && onlineParams.opponentProfile.equippedFrameUrl && (
                <img
                  src={onlineParams.opponentProfile.equippedFrameUrl}
                  alt="Moldura Oponente"
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[135%] h-[135%] max-w-none pointer-events-none object-contain z-10"
                />
              )}
              <div className="absolute -bottom-1.5 -right-1.5 bg-gradient-to-r from-red-600 to-rose-500 text-white text-[8px] font-black font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border border-slate-950 shadow z-20">
                {onlineParams?.isOnline ? 'LIVE' : 'BOT'}
              </div>
            </div>

            {/* Profile Info details */}
            <div className="flex-1 text-left">
              <p className="text-xs font-mono text-red-400 font-black uppercase tracking-wider mb-0.5">
                {onlineParams?.isOnline ? (onlineParams.opponentProfile.title || 'Oponente') : 'Renegado S-Rank'}
              </p>
              <h4 className="text-base font-black tracking-tight text-white uppercase truncate flex items-center gap-1.5 font-display group-hover:text-red-400 transition-colors">
                {onlineParams?.isOnline ? onlineParams.opponentProfile.name : 'I.A. Kakashi'}
              </h4>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-mono text-slate-400">@{onlineParams?.isOnline ? onlineParams.opponentProfile.username : 'treinamento'}</span>
                <span className="w-1 h-1 bg-slate-600 rounded-full" />
                
              </div>
            </div>
          </div>
       
          <div className="space-y-4">
            {enemyCombatants.map((combatant, idx) => {
              const isStunned = combatant.activeEffects.some(e => e.type === 'stun' && isEffectVisibleToViewer(e, 'player'));
              const incomingCues = cuedActions.filter(a => a.targetId === combatant.id);

              return (
                <div key={combatant.id} className="flex items-center gap-2 sm:gap-3 items-stretch">
                  {/* Standing Skin PNG Artwork (OUTSIDE card on left side) */}
                  {(() => {
                    const skinImg = combatant.character.selectedSkinUrl || combatant.character.skins?.[0]?.image;
                    return (
                      <div className="w-24 sm:w-32 flex-shrink-0 flex items-center justify-center relative select-none pointer-events-none self-stretch">
                        {skinImg ? (
                          <img
                            src={skinImg}
                            alt={combatant.character.name}
                            referrerPolicy="no-referrer"
                            className="h-full w-auto max-w-full object-contain scale-x-[-1] filter drop-shadow-[0_6px_12px_rgba(0,0,0,0.95)]"
                            onError={(e) => {
                              const img = e.currentTarget;
                              img.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full" />
                        )}
                      </div>
                    );
                  })()}

                  {/* Main Combatant Card Container */}
                  <div
                    onClick={() => handleSelectTarget(combatant.id, true)}
                    className={`flex-1 relative p-4 rounded-xl border bg-slate-900/60 transition-all ${
                      combatant.isDead
                        ? 'border-slate-950 bg-slate-950/40 opacity-40 pointer-events-none'
                        : selectedSkill && selectedSkill.charId !== combatant.id
                        ? 'border-red-500/40 hover:border-red-500 bg-red-950/5 cursor-pointer shadow-lg shadow-red-500/5'
                        : 'border-slate-800'
                    }`}
                  >
                  {/* Floating combat numbers portal */}
                  <div className="absolute -top-3 left-4 z-10 flex flex-col gap-1 pointer-events-none">
                    {floatingTexts
                      .filter(f => f.targetId === combatant.id)
                      .map((f, fIdx) => {
                        let textClass = 'text-red-500 shadow-red-500/5';
                        if (f.type === 'heal') textClass = 'text-emerald-400 shadow-emerald-500/5';
                        if (f.type === 'shield') textClass = 'text-blue-400 shadow-blue-500/5';
                        if (f.type === 'stun') textClass = 'text-amber-500';
                        if (f.type === 'effect') textClass = 'text-orange-400';

                        return (
                          <motion.span
                            key={`${f.id}-${fIdx}`}
                            initial={{ opacity: 0, y: 10, scale: 0.8 }}
                            animate={{ opacity: 1, y: -20, scale: 1.1 }}
                            exit={{ opacity: 0 }}
                            className={`font-mono text-xs font-black bg-slate-950 px-2.5 py-1 rounded border border-slate-800 shadow-lg ${textClass}`}
                          >
                            {f.text}
                          </motion.span>
                        );
                      })}
                  </div>

                  {/* Incoming skills icons (Targeted skills prediction) */}
                  {incomingCues.length > 0 && (
                    <div className="absolute top-2 right-2 flex gap-1 items-center bg-slate-950/90 border border-orange-500/40 px-1.5 py-0.5 rounded-lg shadow-lg z-10" onClick={(e) => e.stopPropagation()}>
                     
                      {incomingCues.map((cue, cIdx) => {
                        const src = playerCombatants.find(p => p.id === cue.sourceId);
                        const skill = src?.character.skills[cue.skillIndex];
                        return (
                          <div key={`${cue.sourceId}-${cue.skillIndex}-${cIdx}`} className="group relative">
                            <img
                              src={skill?.icon}
                              alt={skill?.name}
                              className="w-5 h-5 rounded border border-orange-500/50 hover:border-orange-400 transition-all object-cover cursor-pointer"
                              onError={(e) => {
                                const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                              }}
                            />
                            {/* Skill Tooltip */}
                            <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover:block bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[9px] text-slate-200 z-50 whitespace-nowrap shadow-2xl pointer-events-none">
                              <span className="text-orange-400 font-bold">{src?.character.name}</span>: [{skill?.name}]
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Character Info */}
                  <div className="flex gap-3">
                    <div className="w-14 h-14 rounded-lg overflow-hidden border border-slate-800 bg-slate-950 flex-shrink-0 relative">
                      <img 
                        src={combatant.character.portrait} 
                        alt={combatant.character.name} 
                        className="w-full h-full object-cover scale-x-[-1]" 
                        onError={(e) => {
                          const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg';
                        }}
                      />
                      {isStunned && (
                        <div className="absolute inset-0 bg-red-950/85 border border-red-500/80 flex flex-col items-center justify-center p-0.5 font-mono text-[8px] font-black text-red-300 tracking-tighter text-center leading-none uppercase animate-pulse">
                          <span>⚡ STUN</span>
                          <span className="text-[7px] text-red-400">DEBUFF</span>
                        </div>
                      )}
                      {(() => {
                        const invulnEff = combatant.activeEffects.find(e => e.type === 'invulnerable');
                        if (!invulnEff || isStunned) return null;
                        return (
                          <div className="absolute inset-0 rounded-lg overflow-hidden z-10 border-2 border-cyan-400/80">
                            {invulnEff.icon && (
                              <img src={invulnEff.icon} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                            )}
                            <div className="absolute inset-0 bg-cyan-950/60 flex items-center justify-center">
                              <span className="bg-cyan-950/90 px-1 py-0.5 rounded border border-cyan-400/60 font-mono text-[7px] font-black text-cyan-300 uppercase tracking-wider text-center drop-shadow-lg">
                                INVULNERÁVEL
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="flex-1 space-y-1.5">
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-sm tracking-tight">{combatant.character.name}</h4>
                        {combatant.shield > 0 && (
                          <span className="text-[9px] bg-blue-500/10 border border-blue-500/30 text-blue-400 px-1.5 py-0.5 rounded font-mono font-bold">
                            Escudo {combatant.shield}
                          </span>
                        )}
                      </div>

                      {/* Health bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-mono text-slate-400 leading-none">
                          <span>Vida</span>
                          <span className="font-bold text-slate-100">{combatant.health} / {combatant.maxHealth}</span>
                        </div>
                        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                          <div
                            className={`h-full transition-all duration-300 ${getHealthColor(combatant.health)}`}
                            style={{ width: `${combatant.health}%` }}
                          />
                        </div>
                      </div>

                      {/* Explicit Stun Debuff Banner */}
                      {isStunned && (() => {
                        const stunEffs = combatant.activeEffects.filter(e => e.type === 'stun' && isEffectVisibleToViewer(e, 'player'));
                        const stunTypeLabels: Record<any, string> = {
                          physical: 'Físico', mental: 'Mental', affliction: 'Aflição', chakra: 'Chakra',
                        };
                        const allStunTypes = Array.from(new Set(
                          stunEffs.flatMap(e => (!e.stunType || e.stunType.length === 0 || e.stunType.length >= 4) ? ['physical', 'mental', 'affliction', 'chakra'] : e.stunType)
                        ));
                        const isCompleteStun = allStunTypes.length >= 4;
                        const stunTypesStr = isCompleteStun
                          ? 'Físico + Mental + Aflição + Chakra (Total)'
                          : allStunTypes.map((t: any) => stunTypeLabels[t] || t).join(' + ');
                        const maxDur = Math.max(...stunEffs.map(e => e.duration), 1);

                        return (
                          <div className="mt-1.5 p-1.5 rounded-lg bg-red-950/90 border border-red-600/80 text-red-200 font-mono text-[10px] space-y-0.5 shadow-md shadow-red-950/50 animate-pulse">
                            <div className="flex items-center justify-between font-bold text-red-400 text-[10px]">
                              <span className="flex items-center gap-1">⚡ <span>DEBUFF: ATORDOADO</span></span>
                              <span className="text-[9px] bg-red-900/90 text-red-100 px-1.5 py-0.2 rounded border border-red-700 font-black">
                                {maxDur}T
                              </span>
                            </div>
                            <p className="text-[9px] text-red-300/90 font-sans leading-tight">
                              🚫 <strong>Impedido:</strong> {stunTypesStr}
                            </p>
                          </div>
                        );
                      })()}

                      {combatant.lastTurnStatus && (
                        <div className={`mt-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded border flex items-center justify-center gap-1 animate-pulse uppercase tracking-wider ${
                          combatant.lastTurnStatus === 'ANULADO'
                            ? 'bg-red-500/15 border-red-500/30 text-red-400'
                            : combatant.lastTurnStatus === 'REFLETIDO'
                            ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                            : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                        }`}>
                          {combatant.lastTurnStatus === 'ANULADO' && '🚫 Anulado'}
                          {combatant.lastTurnStatus === 'REFLETIDO' && '🔄 Refletido'}
                          {combatant.lastTurnStatus === 'CONTRA-ATAQUE' && '🛡️ Contra-Atacou'}
                        </div>
                      )}

                      {/* Active Status Badges */}
                      {combatant.activeEffects.length > 0 && (() => {
                        const groupedEffects = getGroupedActiveEffects(combatant.activeEffects, 'player');

                        return (
                          <div className="flex items-center gap-1.5 pt-1.5 w-full">
                            <div className="flex flex-wrap gap-1.5 items-center">
                              {groupedEffects.map((item, effIdx) => {
                                const eff = item.effect;
                                const isDebuff = eff.type === 'stun' || eff.type === 'dot' || eff.type === 'bleeding' || eff.type === 'affliction' || eff.type === 'paralyze_cooldown' || eff.type === 'damage' || eff.type === 'direct_damage' || eff.name.toLowerCase().includes('burn') || eff.name.toLowerCase().includes('stun') || eff.name.toLowerCase().includes('sangramento') || eff.name.toLowerCase().includes('aflição') || eff.name.toLowerCase().includes('queimadura') || eff.name.toLowerCase().includes('atordoado') || eff.name.toLowerCase().includes('atordoamento');

                                return (
                                  <div
                                    key={effIdx}
                                    className={`relative group flex items-center justify-center p-0.5 rounded-xl select-none bg-slate-950 border-2 transition-all hover:scale-110 hover:z-30 cursor-help shrink-0 ${
                                      isDebuff
                                        ? 'border-red-500/80 shadow-md shadow-red-950/60'
                                        : 'border-emerald-500/80 shadow-md shadow-emerald-950/60'
                                    }`}
                                  >
                                    <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-lg overflow-hidden flex items-center justify-center bg-slate-900">
                                      {eff.icon ? (
                                        <img
                                          src={eff.icon}
                                          alt={eff.name}
                                          referrerPolicy="no-referrer"
                                          className="w-full h-full object-cover rounded-lg"
                                          onError={(e) => {
                                            const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                                          }}
                                        />
                                      ) : (
                                        <span className={`w-3.5 h-3.5 rounded-full ${isDebuff ? 'bg-red-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
                                      )}
                                      {eff.irremovable && (
                                        <span className="absolute top-0 right-0 bg-slate-950/80 rounded text-[8px] p-0.5">🔒</span>
                                      )}
                                      {(eff.isInvisible || eff.type === 'invisible') && (
                                        <span className="absolute top-0 left-0 bg-pink-950/90 text-pink-300 rounded text-[8px] p-0.5 border border-pink-700/80" title="Invisível para o oponente">👁️</span>
                                      )}
                                    </div>

                                    {/* Overlay stack badge ONLY if stacks > 1 */}
                                    {item.stacks > 1 && (
                                      <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-amber-400 border-2 border-slate-950 text-[10px] font-mono font-black text-slate-950 shadow-md z-20">
                                        {item.stacks}
                                      </span>
                                    )}

                                    {/* Rich Tooltip on hover */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-50 pointer-events-none">
                                      <div className="bg-slate-950/95 border border-slate-700 rounded-xl p-2.5 text-center shadow-2xl backdrop-blur-md w-48 text-white">
                                        <div className="flex items-center justify-center gap-1.5 mb-1">
                                          <span className={`text-[8px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded-full border ${
                                            isDebuff ? 'bg-red-950/80 border-red-800/80 text-red-400' : 'bg-emerald-950/80 border-emerald-800/80 text-emerald-400'
                                          }`}>
                                            {isDebuff ? 'DEBUFF' : 'BUFF'}
                                          </span>
                                          <span className="font-extrabold text-xs text-orange-300 truncate">{eff.name}</span>
                                        </div>

                                        {(eff.isInvisible || eff.type === 'invisible') && (
                                          <p className="text-[9px] font-mono font-bold text-pink-400 bg-pink-950/80 px-1.5 py-0.5 rounded border border-pink-800/80 my-1">
                                            👁️‍🗨️ INVISÍVEL PARA O OPONENTE
                                          </p>
                                        )}

                                        <p className="text-xs text-slate-200 font-sans leading-snug my-1">
                                          {item.description}
                                        </p>

                                        <div className="flex items-center justify-center gap-2 pt-1 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
                                          <span>Duração: <strong className="text-amber-400">{eff.duration}T</strong></span>
                                          {item.stacks > 1 && (
                                            <span>• Acúmulos: <strong className="text-amber-400">{item.stacks}x</strong></span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="w-2 h-2 bg-slate-950 border-r border-b border-slate-700 rotate-45 -mt-1" />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Character Skills list (as previews for tactical depth) */}
                  {!combatant.isDead && (() => {
                    const skillsPerPage = 4;
                    const skillsPage = combatantSkillPages[combatant.id] || 0;
                    const totalSkillPages = Math.ceil(combatant.character.skills.length / skillsPerPage);
                    const paginatedSkills = combatant.character.skills.slice(skillsPage * skillsPerPage, (skillsPage + 1) * skillsPerPage);

                    return (
                      <div className="relative pt-3 mt-3 border-t border-slate-800/80">
                        {/* Left side pagination arrow */}
                        {totalSkillPages > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playCustomSound('Scroll');
                              setCombatantSkillPages(prev => ({
                                ...prev,
                                [combatant.id]: Math.max(0, skillsPage - 1)
                              }));
                            }}
                            disabled={skillsPage === 0}
                            className={`absolute -left-2 top-1/2 -translate-y-1/2 z-20 p-1 rounded-full bg-slate-950/90 border border-slate-700/80 text-slate-300 hover:text-orange-400 hover:border-orange-500 shadow-md transition-all ${
                              skillsPage === 0 ? 'opacity-20 cursor-not-allowed border-slate-900' : 'cursor-pointer hover:scale-110 active:scale-95'
                            }`}
                            title="Anterior"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <div className="grid grid-cols-4 gap-2">
                          {paginatedSkills.map((skill, pIdx) => {
                            const sIdx = skillsPage * skillsPerPage + pIdx;
                            const isCooldown = skill.currentCooldown > 0;
                            const isSkillInvisibleToOpponent = skill.invisible || (skill.invisibleDuration !== undefined && skill.invisibleDuration > 0);

                            if (isSkillInvisibleToOpponent && !isSandbox) {
                              return (
                                <div
                                  key={sIdx}
                                  className="group relative aspect-square rounded-lg border border-slate-900 overflow-hidden bg-slate-950/60 flex flex-col items-center justify-center cursor-not-allowed opacity-40 hover:opacity-60 transition-all"
                                >
                                  <span className="font-mono text-xs font-black text-slate-600">?</span>

                                  {/* Hover Details tooltip card */}
                                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-48 bg-slate-900 border border-slate-850 p-2.5 rounded-lg shadow-xl z-30 pointer-events-none text-left">
                                    <p className="font-bold text-xs text-pink-400 pb-1 border-b border-slate-800">Habilidade Oculta</p>
                                    <p className="text-[10px] text-slate-400 leading-normal pt-1">Esta é uma habilidade secreta configurada para ser invisível ao oponente.</p>
                                  </div>
                                </div>
                              );
                            }

                            const isCued = cuedActions.some(a => a.sourceId === combatant.id && a.skillIndex === sIdx);
                            const simulatedChakraForThisChar = getSimulatedRemainingChakra(enemyChakra, cuedActions.filter(a => a.sourceId !== combatant.id), true);
                            const canAfford = canAffordSkill(skill, simulatedChakraForThisChar);
                            const isRequiredEffectLocked = skill.requireEffect && !combatant.activeEffects.some(e => e.name === skill.requireEffect);
                            const isStunBlocked = isSkillBlockedByStun(skill, combatant.activeEffects);

                            if (isSandbox) {
                              return (
                                <div
                                  key={sIdx}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isStunBlocked) {
                                      addFloatingText(combatant.id, 'ATORDOADO!', 'stun');
                                      return;
                                    }
                                    if (isRequiredEffectLocked) {
                                      addFloatingText(combatant.id, `Requer ${skill.requireEffect}!`, 'effect');
                                      return;
                                    }
                                    handleSelectSkill(combatant.id, sIdx);
                                  }}
                                  className={`group relative aspect-square rounded-lg border overflow-hidden bg-slate-950 flex flex-col items-center justify-center cursor-pointer transition-all ${
                                    isCued
                                      ? 'border-emerald-500 shadow shadow-emerald-600/35 ring-1 ring-emerald-500'
                                      : isStunBlocked
                                      ? 'border-red-600 bg-red-950/80 opacity-40 grayscale shadow-md shadow-red-950/60'
                                      : isCooldown
                                      ? 'border-slate-950 opacity-30 cursor-not-allowed'
                                      : isRequiredEffectLocked
                                      ? 'border-red-950/60 opacity-20 grayscale cursor-not-allowed hover:opacity-30'
                                      : !canAfford
                                      ? 'border-slate-950 opacity-20 grayscale-[60%] hover:opacity-40'
                                      : 'border-slate-800 hover:border-slate-600'
                                  }`}
                                >
                                  <img 
                                    src={skill.icon} 
                                    alt={skill.name} 
                                    className="w-full h-full object-cover scale-x-[-1]" 
                                    onError={(e) => {
                                      const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                                    }}
                                  />

                                  {/* Cooldown Overlay */}
                                  {isCooldown && (
                                    <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center">
                                      <span className="font-mono text-xs font-black text-orange-400">
                                        {skill.currentCooldown}
                                      </span>
                                    </div>
                                  )}

                                  {/* Stun Blocked Overlay */}
                                  {isStunBlocked && !isCooldown && (
                                    <div className="absolute inset-0 bg-red-950/90 border-2 border-red-500 flex flex-col items-center justify-center p-0.5 text-center z-10">
                                      <span className="text-red-300 text-sm font-black animate-pulse drop-shadow-lg">⚡</span>
                                      <span className="text-[8px] font-mono font-black text-red-200 uppercase tracking-wider drop-shadow-md">STUN</span>
                                    </div>
                                  )}

                                  {/* Required Effect Locked Overlay (🔒) */}
                                  {isRequiredEffectLocked && !isCooldown && !isStunBlocked && (
                                    <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center">
                                      <span className="text-red-500 font-bold drop-shadow-md text-xs">🔒</span>
                                    </div>
                                  )}

                                  {/* Cued Indicator Overlay */}
                                  {isCued && (
                                    <div className="absolute inset-0 bg-emerald-600/10 border-2 border-emerald-500 flex items-center justify-center">
                                      <div className="bg-emerald-500 text-slate-950 font-mono text-[8px] font-black uppercase px-1 rounded shadow-md">
                                        PREPARADO
                                      </div>
                                    </div>
                                  )}

                                  {/* Hover Details tooltip card */}
                                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-48 bg-slate-900 border border-slate-700/80 p-2.5 rounded-lg shadow-xl z-30 pointer-events-none text-left">
                                    <p className="font-bold text-xs text-white pb-1 border-b border-slate-800">{skill.name}</p>
                                    <p className="text-[10px] text-slate-400 leading-normal pt-1">{skill.desc}</p>
                                    
                                    {(skill.cannotBeCountered || skill.cannotBeReflected) && (
                                      <div className="flex flex-col gap-0.5 mt-1 text-[8px] font-mono">
                                        {skill.cannotBeCountered && (
                                          <span className="text-red-400 font-bold">🚫 Incontra-atacável</span>
                                        )}
                                        {skill.cannotBeReflected && (
                                          <span className="text-cyan-400 font-bold">🚫 Irrefletível</span>
                                        )}
                                      </div>
                                    )}
                                    
                                    {isStunBlocked && (
                                      <p className="text-[9px] font-bold mt-1.5 font-mono text-red-400 bg-red-950/90 p-1 rounded border border-red-800">
                                        ⚡ BLOQUEADA POR ATORDOAMENTO (STUN)!
                                      </p>
                                    )}

                                    {skill.requireEffect && (
                                      <p className={`text-[9px] font-bold mt-1.5 font-mono ${isRequiredEffectLocked ? 'text-red-500' : 'text-emerald-500'}`}>
                                        {isRequiredEffectLocked ? '🔒 Requer: ' : '🔓 Ativo: '} {skill.requireEffect}
                                      </p>
                                    )}

                                    <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 pt-1.5 border-t border-slate-800/60 mt-2">
                                      <span>Recarga: {skill.cooldown}</span>
                                      <div className="flex gap-0.5">
                                        {skill.cost.map((c, costIdx) => (
                                          <div key={costIdx} className="scale-75">{renderChakraIcon(c as keyof ChakraPool)}</div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={sIdx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playClickSound();
                                  setInspectedSkill({
                                    skill,
                                    ownerName: combatant.character.name,
                                    isEnemy: true,
                                  });
                                  setCenterTab('inspector');
                                }}
                                className={`group relative aspect-square rounded-lg border overflow-hidden bg-slate-950 flex flex-col items-center justify-center cursor-pointer opacity-70 hover:opacity-100 transition-all ${
                                  isCooldown ? 'border-slate-950 opacity-30' : 'border-slate-800'
                                }`}
                              >
                                <img src={skill.icon} alt={skill.name} className="w-full h-full object-cover scale-x-[-1]" />

                                {/* Cooldown Overlay */}
                                {isCooldown && (
                                  <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center">
                                    <span className="font-mono text-xs font-black text-orange-400">
                                      {skill.currentCooldown}
                                    </span>
                                  </div>
                                )}

                                {/* Hover Details tooltip card */}
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-48 bg-slate-900 border border-slate-700/80 p-2.5 rounded-lg shadow-xl z-30 pointer-events-none text-left">
                                  <p className="font-bold text-xs text-white pb-1 border-b border-slate-800">{skill.name}</p>
                                  <p className="text-[10px] text-slate-400 leading-normal pt-1">{skill.desc}</p>
                                  
                                  {(skill.cannotBeCountered || skill.cannotBeReflected) && (
                                    <div className="flex flex-col gap-0.5 mt-1 text-[8px] font-mono">
                                      {skill.cannotBeCountered && (
                                        <span className="text-red-400 font-bold">🚫 Incontra-atacável</span>
                                      )}
                                      {skill.cannotBeReflected && (
                                        <span className="text-cyan-400 font-bold">🚫 Irrefletível</span>
                                      )}
                                    </div>
                                  )}
                                  <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 pt-1.5 border-t border-slate-800/60 mt-1">
                                    <span>Recarga: {skill.cooldown}</span>
                                    <div className="flex gap-0.5">
                                      {skill.cost.map((c, costIdx) => (
                                        <div key={costIdx} className="scale-75">{renderChakraIcon(c as keyof ChakraPool)}</div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Right side pagination arrow */}
                        {totalSkillPages > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playCustomSound('Scroll');
                              setCombatantSkillPages(prev => ({
                                ...prev,
                                [combatant.id]: Math.min(totalSkillPages - 1, skillsPage + 1)
                              }));
                            }}
                            disabled={skillsPage === totalSkillPages - 1}
                            className={`absolute -right-2 top-1/2 -translate-y-1/2 z-20 p-1 rounded-full bg-slate-950/90 border border-slate-700/80 text-slate-300 hover:text-orange-400 hover:border-orange-500 shadow-md transition-all ${
                              skillsPage === totalSkillPages - 1 ? 'opacity-20 cursor-not-allowed border-slate-900' : 'cursor-pointer hover:scale-110 active:scale-95'
                            }`}
                            title="Próximo"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
          </div>
        </section>
      </main>

      {/* FIXED INTERACTIVE EMOJI COCKPIT */}
      <div className="fixed bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 backdrop-blur-md border border-slate-800/80 px-4 py-2.5 rounded-full flex items-center gap-3.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)] select-none">
        <div className="flex items-center gap-1.5 border-r border-slate-800/80 pr-3.5 text-[9px] font-mono font-black text-slate-400 tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-orange-400 animate-pulse" />
          <span>REAGIR</span>
        </div>
        
        <div className="flex items-center gap-2">
          {PRESET_EMOJIS.map((emoji) => {
            const now = Date.now();
            const globalDiff = globalEmojiCooldownUntil - now;
            const individualDiff = (lastEmojiClicked[emoji] || 0) + COOLDOWN_MS - now;
            const remainingMs = Math.max(0, globalDiff, individualDiff);
            const isOnCooldown = remainingMs > 0;
            
            return (
              <button
                key={emoji}
                disabled={isOnCooldown}
                onClick={() => handleSendEmoji(emoji)}
                className={`relative w-10 h-10 flex items-center justify-center text-xl rounded-full border transition-all focus:outline-none ${
                  isOnCooldown
                    ? 'border-slate-800/40 bg-slate-950/40 cursor-not-allowed scale-95'
                    : 'border-slate-800 bg-slate-950 hover:border-orange-500/50 hover:bg-slate-900 active:scale-90 cursor-pointer shadow-md hover:shadow-orange-500/10'
                }`}
                title={isOnCooldown ? `Aguarde ${(remainingMs / 1000).toFixed(1)}s` : `Reagir com ${emoji}`}
              >
                <span className={isOnCooldown ? 'filter grayscale opacity-30 scale-90' : 'transform hover:scale-115 transition-transform duration-200'}>
                  {emoji}
                </span>
                {isOnCooldown && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/80">
                    <span className="text-[9px] font-mono font-bold text-orange-400">
                      {(remainingMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* FLOATING EMOJIS WORLD CANVAS */}
      <div className="fixed inset-0 pointer-events-none z-50">
        <AnimatePresence>
          {activeEmojis.map((emojiObj) => (
            <motion.div
              key={emojiObj.id}
              initial={{ opacity: 0, y: '85vh', x: `calc(50vw + ${emojiObj.xOffset}px)`, scale: 0.5, rotate: emojiObj.rotation }}
              animate={{
                opacity: [0, 1, 1, 0],
                y: '20vh',
                x: `calc(50vw + ${emojiObj.xOffset + (emojiObj.xOffset > 0 ? 60 : -60)}px)`,
                scale: [0.5, 1.4, 1.4, 0.9],
                rotate: emojiObj.rotation * 2.5
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.2, ease: 'easeOut' }}
              onAnimationComplete={() => {
                setActiveEmojis(prev => prev.filter(e => e.id !== emojiObj.id));
              }}
              className="absolute flex flex-col items-center select-none"
            >
              {emojiObj.senderName && (
                <span className="bg-slate-950/85 border border-orange-500/40 text-orange-400 text-[9px] font-black font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-md shadow mb-1 whitespace-nowrap">
                  {emojiObj.senderName}
                </span>
              )}
              <span className="text-5xl filter drop-shadow-[0_8px_24px_rgba(249,115,22,0.45)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                {emojiObj.emoji}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* GAME OVER BANNER MODAL */}
      <AnimatePresence>
        {gameOver && (
          <div className="fixed inset-0 bg-slate-950/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm select-none">
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
                    {gameOver === 'victory' ? (
                      <Trophy className="w-8 h-8 text-amber-700 animate-bounce" />
                    ) : (
                      <Swords className="w-8 h-8 text-red-800 animate-pulse" />
                    )}
                    <h3 className="text-2xl font-black uppercase tracking-tight font-sans">
                      {gameOver === 'victory' ? (
                        <span className="text-emerald-900 drop-shadow">VITÓRIA!</span>
                      ) : (
                        <span className="text-red-900 drop-shadow">DERROTA!</span>
                      )}
                    </h3>
                  </div>
                  <p className="text-xs sm:text-sm text-stone-800 font-bold leading-relaxed max-w-xs mx-auto">
                    {gameOver === 'victory'
                      ? 'Parabéns! Você derrotou o esquadrão inimigo e conquistou a supremacia shinobi!'
                      : 'Seu esquadrão foi derrotado em combate. Reagrupe sua tática e tente novamente!'}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-1">
                  <button
                    onClick={handleQuit}
                    className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs uppercase tracking-wider shadow-lg border transition cursor-pointer active:scale-95 flex items-center justify-center gap-2 ${
                      gameOver === 'victory'
                        ? 'bg-gradient-to-r from-amber-700 to-yellow-800 hover:from-amber-600 hover:to-yellow-700 text-amber-100 shadow-amber-950/40 border-amber-500/50'
                        : 'bg-gradient-to-r from-red-800 to-rose-900 hover:from-red-700 hover:to-rose-800 text-amber-100 shadow-red-950/40 border-red-600/50'
                    }`}
                  >
                    <span>Voltar ao Menu</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* CHAKRA TRADE MODAL */}
      <AnimatePresence>
        {showChakraTrade && (
          <div className="fixed inset-0 bg-slate-950/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm select-none">
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative rounded-3xl overflow-hidden shadow-2xl max-w-sm w-full min-h-[320px] flex flex-col justify-between p-6 sm:p-8"
            >
              {/* Background Pergaminho Image */}
              <img
                src="/static/img/ui/pergaminho.webp"
                alt="Pergaminho Shinobi"
                className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none filter drop-shadow-xl"
              />

              <div className="relative z-10 flex flex-col items-center justify-between text-center space-y-4 h-full">
                <h3 className="text-lg font-black uppercase tracking-tight text-center text-stone-950 font-sans">
                  Trocar Chakra (4 → 1)
                </h3>

                <div className="w-full">
                  <p className="text-xs font-bold text-stone-800 mb-2">Escolha 4 chakras para gastar:</p>
                  <div className="flex justify-around items-center bg-[#d3ad75]/30 p-2 rounded-xl border border-[#7a4e25]/30">
                    {(Object.keys(playerChakra) as (keyof ChakraPool)[]).map(key => {
                      const totalSelected = (Object.keys(tradeSelection) as (keyof ChakraPool)[])
                        .reduce((sum, k) => sum + tradeSelection[k], 0);
                      const canAdd = tradeSelection[key] < playerChakra[key] && totalSelected < 4;
                      return (
                        <div key={key} className="flex flex-col items-center gap-1">
                          {renderChakraIcon(key)}
                          <span className="text-[10px] font-bold text-stone-900 font-mono">{tradeSelection[key]} / {playerChakra[key]}</span>
                          <div className="flex gap-1">
                            <button
                              onClick={() => setTradeSelection(prev => ({ ...prev, [key]: Math.max(0, prev[key] - 1) }))}
                              className="w-5 h-5 text-xs bg-[#7a4e25] text-amber-100 rounded hover:bg-[#5c3a1b] font-bold cursor-pointer"
                            >-</button>
                            <button
                              disabled={!canAdd}
                              onClick={() => setTradeSelection(prev => ({ ...prev, [key]: prev[key] + 1 }))}
                              className="w-5 h-5 text-xs bg-[#7a4e25] text-amber-100 rounded hover:bg-[#5c3a1b] font-bold disabled:opacity-30 cursor-pointer"
                            >+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="w-full">
                  <p className="text-xs font-bold text-stone-800 mb-2">Escolha o chakra que vai receber:</p>
                  <div className="flex justify-around items-center bg-[#d3ad75]/30 p-2 rounded-xl border border-[#7a4e25]/30">
                    {(['Tai', 'Nin', 'Gen', 'Blood'] as (keyof ChakraPool)[]).map(key => (
                      <button
                        key={key}
                        onClick={() => setTradeTarget(key)}
                        className={`p-1.5 rounded-lg border-2 transition cursor-pointer ${tradeTarget === key ? 'border-amber-800 bg-amber-800/20 scale-110' : 'border-transparent opacity-70 hover:opacity-100'}`}
                      >
                        {renderChakraIcon(key)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2 w-full">
                  <button
                    onClick={() => { setShowChakraTrade(false); setTradeSelection({ Tai: 0, Nin: 0, Gen: 0, Blood: 0 }); setTradeTarget(null); }}
                    className="flex-1 py-2 px-3 bg-[#d3ad75]/90 hover:bg-[#c49a5d] text-stone-950 font-black text-xs uppercase tracking-wider border-2 border-[#7a4e25] rounded-xl shadow-md transition cursor-pointer active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleTradeChakra}
                    className="flex-1 py-2 px-3 bg-gradient-to-r from-orange-800 to-amber-800 hover:from-orange-700 hover:to-amber-700 text-amber-100 font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-orange-950/40 border border-orange-600/50 transition cursor-pointer active:scale-95"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* WAITING FOR OPPONENT OVERLAY */}
      <AnimatePresence>
        {isWaitingForOpponent && (
          <div className="fixed inset-0 bg-slate-950/80 z-45 flex items-center justify-center p-6 backdrop-blur-sm select-none">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 p-8 max-w-sm w-full rounded-2xl text-center space-y-6 shadow-2xl relative"
            >
              {/* Spinning Sharingan/chakra element */}
              <div className="relative w-20 h-20 mx-auto">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                  className="absolute inset-0 rounded-full border-4 border-t-red-500 border-r-transparent border-b-orange-500 border-l-transparent"
                />
                <div className="absolute inset-2 bg-slate-950 rounded-full flex items-center justify-center border border-slate-800">
                  <Flame className="w-8 h-8 text-red-500 animate-pulse" />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-black uppercase tracking-tight text-white">
                  Aguardando Oponente
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  O oponente está escolhendo suas habilidades e táticas para este turno... Prepare-se para o impacto!
                </p>
              </div>

              {/* Status micro banner */}
              <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800/60 inline-flex items-center gap-2 mx-auto">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">Sua equipe está pronta</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SURRENDER CONFIRMATION PARCHMENT MODAL */}
      <AnimatePresence>
        {showSurrenderModal && (
          <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm select-none">
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative rounded-3xl overflow-hidden shadow-2xl max-w-md w-full min-h-[250px] flex flex-col justify-between p-8 sm:p-10"
            >
              {/* Background Pergaminho Image */}
              <img
                src="/static/img/ui/pergaminho.webp"
                alt="Pergaminho Shinobi"
                className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none filter drop-shadow-xl"
              />

              {/* Parchment Content */}
              <div className="relative z-10 flex flex-col items-center justify-between text-center space-y-6 h-full">
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-center gap-2">
                    <Flag className="w-6 h-6 text-red-700 fill-red-600 animate-bounce" />
                    <h3 className="text-xl font-black uppercase tracking-tight text-stone-950 font-sans">
                      Render-se da Batalha?
                    </h3>
                  </div>
                  <p className="text-xs sm:text-sm text-stone-800 font-bold leading-relaxed max-w-xs mx-auto">
                    Você realmente deseja se render e declarar derrota nesta partida?
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-1">
                  <button
                    onClick={confirmSurrender}
                    className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-800 to-rose-900 hover:from-red-700 hover:to-rose-800 text-amber-100 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-red-950/40 border border-red-600/50 transition cursor-pointer active:scale-95"
                  >
                    Sim, Render-me
                  </button>
                  <button
                    onClick={() => {
                      playClickSound();
                      setShowSurrenderModal(false);
                    }}
                    className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-[#d3ad75]/90 hover:bg-[#c49a5d] text-stone-950 font-black text-xs uppercase tracking-wider border-2 border-[#7a4e25] shadow-md transition cursor-pointer active:scale-95"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TRANSIENT EPHEMERAL BATTLE CHAT WIDGET */}
      <div className="fixed bottom-4 right-4 z-40 select-none flex flex-col items-end">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="mb-3 w-80 sm:w-96 bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md flex flex-col h-96 border-orange-500/30"
            >
              {/* Chat Header */}
              <div className="bg-slate-950 p-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
                    <img
                      src="/static/img/ui/bubble-chat.webp"
                      alt="Chat"
                      className="w-5 h-5 object-contain"
                    />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-100 flex items-center gap-1.5 font-display">
                      Chat da Partida
                    </h4>
                    <p className="text-[10px] text-slate-400 font-mono"></p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    playClickSound();
                    setIsChatOpen(false);
                  }}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Chat Messages Feed */}
              <div ref={chatScrollRef} className="flex-1 p-3 overflow-y-auto space-y-2.5">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500 space-y-2">
                    <img
                      src="/static/img/ui/bubble-chat.webp"
                      alt="Chat Vazio"
                      className="w-10 h-10 opacity-40 object-contain"
                    />
                    <p className="text-xs font-medium">Nenhuma mensagem nesta partida ainda.</p>
                    <p className="text-[10px] text-slate-600">Envie um cumprimento ninja ao seu oponente!</p>
                  </div>
                ) : (
                  chatMessages.map(msg => (
                    <div
                      key={msg.id}
                      className={`p-2.5 rounded-xl text-xs space-y-1 ${
                        msg.isSelf
                          ? 'bg-gradient-to-r from-orange-950/40 to-slate-900 border border-orange-500/30 ml-4'
                          : 'bg-slate-800/50 border border-slate-700/40 mr-4'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {msg.senderTitle && (
                          <span className="text-[9px] font-mono font-black tracking-wider uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            [{msg.senderTitle}]
                          </span>
                        )}
                        <span className={`font-bold text-xs ${msg.isSelf ? 'text-orange-400' : 'text-slate-200'}`}>
                          {msg.senderName}
                        </span>
                        <span className="text-[9px] font-mono text-slate-500 ml-auto">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-slate-300 break-words font-sans text-xs leading-relaxed">
                        {msg.text}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Chat Form Input */}
              <form onSubmit={handleSendChatMessage} className="p-2.5 bg-slate-950 border-t border-slate-800 space-y-1">
                {chatError && (
                  <p className="text-[10px] font-mono text-rose-400 px-1 animate-pulse">
                    {chatError}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    maxLength={100}
                    placeholder="Sua mensagem..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500 transition"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="p-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 font-bold hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:hover:brightness-100 transition cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Toggle Floating Button */}
        <div className="relative">
          <AnimatePresence>
            {unreadCount > 0 && !isChatOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, x: 10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: 10 }}
                className="absolute right-16 top-1/2 -translate-y-1/2 bg-gradient-to-r from-red-600 to-rose-600 text-white px-3.5 py-1.5 rounded-xl shadow-xl shadow-red-600/40 flex items-center gap-2 whitespace-nowrap border border-red-400/50 pointer-events-none z-50 animate-pulse"
              >
                <div className="w-2 h-2 rounded-full bg-white animate-ping shrink-0" />
                <span className="text-xs font-black uppercase tracking-wide font-mono">
                  {unreadCount === 1 ? '1 Nova Mensagem!' : `${unreadCount} Novas Mensagens!`}
                </span>
                <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 border-y-4 border-y-transparent border-l-[6px] border-l-rose-600" />
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={() => {
              playClickSound();
              setIsChatOpen(!isChatOpen);
              setUnreadCount(0);
            }}
            className={` ${
              unreadCount > 0 && !isChatOpen
                ? 'border-red-500 text-red-400 shadow-red-600/40 animate-bounce'
                : 'border-orange-500 text-orange-400 hover:scale-105 active:scale-95'
            }`}
            title="Abrir Chat da Partida"
          >
            {unreadCount > 0 && !isChatOpen && (
              <span className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-75 pointer-events-none" />
            )}
            <img
              src="/static/img/ui/bubble-chat.webp"
              alt="Chat"
              className="bubble-chat object-contain group-hover:scale-110 transition-transform filter drop-shadow"
            />
            {unreadCount > 0 && !isChatOpen && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white font-mono font-black text-[11px] min-w-[22px] h-[22px] px-1 rounded-full flex items-center justify-center border-2 border-slate-950 shadow-lg shadow-red-600/60 z-10">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* PROFILE CARD MODAL (VIEWING SELF OR OPPONENT) */}
      {viewingProfile && (
        <ProfileCardModal
          profile={viewingProfile.profile}
          isSelf={viewingProfile.isSelf}
          onClose={() => setViewingProfile(null)}
          playClickSound={playClickSound}
        />
      )}
    </div>
  );
}
