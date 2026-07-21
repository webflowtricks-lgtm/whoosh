/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Shield, Swords, RefreshCw, Volume2, VolumeX, ArrowLeft, Send, Sparkles, Flame, User, Info, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Character, ChakraPool, CombatCharacter, ActiveEffect, CombatLog, FloatingText, Skill, ChakraType, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';

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
}

interface CuedAction {
  sourceId: string; // 'player-0', etc.
  skillIndex: number;
  targetId: string; // 'player-1', 'enemy-0', etc.
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
}: BattleBoardProps) {
  // Turn count
  const [turn, setTurn] = useState(1);

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

  // Active effects pagination state per combatant id
  const [activeEffectsPages, setActiveEffectsPages] = useState<Record<string, number>>({});

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Interactive Emojis State
  const PRESET_EMOJIS = ['🔥', '⚡', '🤣', '😎', '🦊'];
  const COOLDOWN_MS = 3000;
  const GLOBAL_COOLDOWN_MS = 1000;

  const [activeEmojis, setActiveEmojis] = useState<{ id: string; emoji: string; xOffset: number; rotation: number }[]>([]);
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
    setActiveEmojis(prev => [...prev, { id, emoji, xOffset, rotation }]);

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
    // Reset all battle-related states to fresh start
    setPlayerChakra({ Tai: 0, Nin: 0, Gen: 0, Blood: 0 });
    setEnemyChakra({ Tai: 0, Nin: 0, Gen: 0, Blood: 0 });
    setTurn(1);
    setCuedActions([]);
    setSelectedSkill(null);
    setGameOver(null);

    const pCombat: CombatCharacter[] = playerTeam.map((c, idx) => ({
      id: `player-${idx}`,
      character: JSON.parse(JSON.stringify(c)), // deep copy to track cooldowns
      health: 100,
      maxHealth: 100,
      shield: 0,
      activeEffects: [],
      isDead: false,
    }));

    const eCombat: CombatCharacter[] = enemyTeam.map((c, idx) => ({
      id: `enemy-${idx}`,
      character: JSON.parse(JSON.stringify(c)),
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

    // Initial logs
    const initialLogs: CombatLog[] = [
      { id: '1', turn: 1, message: '⚔️ BATALHA INICIADA! Esquadrão confirmado.', type: 'system' },
      { id: '2', turn: 1, message: 'Gere seus chakras e escolha suas táticas!', type: 'system' },
    ];
    setLogs(initialLogs);

    // Play start audio
    playCustomSound('StartFirst');

    // Trigger initial chakra roll banner (Turn 1 gets 1 random chakra each)
    rollChakraForTurn(true, 1);
    rollChakraForTurn(false, 1);
  }, [playerTeam, enemyTeam]);

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
              setActiveEmojis(prev => [...prev, { id, emoji: e.emoji, xOffset, rotation }]);
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
      const targetIndex = isPlayer ? onlineParams.playerIndex : (1 - onlineParams.playerIndex);
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

    // Stun check
    const isStunned = combatant.activeEffects.some(e => e.type === 'stun');
    if (isStunned) {
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
  

  // AI Decision & Turn Execution
  const handleEndTurn = () => {
    playCustomSound('NextTurn');

    if (isSandbox) {
      // Deduct player actions from playerChakra
      setPlayerChakra(prev => {
        let pool = { ...prev };
        const playerActions = cuedActions.filter(a => a.sourceId.startsWith('player'));
        playerActions.forEach(action => {
          const src = playerCombatants.find(p => p.id === action.sourceId);
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

      // Deduct enemy actions from enemyChakra
      setEnemyChakra(prev => {
        let pool = { ...prev };
        const enemyActions = cuedActions.filter(a => a.sourceId.startsWith('enemy'));
        enemyActions.forEach(action => {
          const src = enemyCombatants.find(e => e.id === action.sourceId);
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

      const playerActions = cuedActions.filter(a => a.sourceId.startsWith('player'));
      const enemyActions = cuedActions.filter(a => a.sourceId.startsWith('enemy'));
      setCuedActions([]);
      executeTurnSimulation(playerActions, enemyActions);
      return;
    }

    // Deduct the cued actions' costs permanently from playerChakra now!
    setPlayerChakra(prev => {
      let pool = { ...prev };
      cuedActions.forEach(action => {
        const src = playerCombatants.find(p => p.id === action.sourceId);
        if (!src) return;
        const skill = src.character.skills[action.skillIndex];
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
      });
      return pool;
    });

    if (onlineParams?.isOnline) {
      // ONLINE MULTIPLAYER ROUTINE
      setIsWaitingForOpponent(true);
      
      // Submit our turn to the matchmaking backend
      fetch('/api/match/submit-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: onlineParams.roomId,
          username: user.username,
          turn,
          actions: cuedActions
        })
      })
      .then(r => r.json())
      .then(data => {
        if (!data.success) {
          console.error('Failed to submit turn:', data.message);
        }
      })
      .catch(err => console.error('Error submitting turn:', err));

      // Poll until both players have submitted actions for this turn
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/match/room-state?roomId=${onlineParams.roomId}`);
          const statusData = await statusRes.json();

          if (statusData.success && statusData.room) {
            const turnActions = statusData.room.turnActions;
            const currentTurnData = turnActions[turn];

            if (currentTurnData && currentTurnData.player0 && currentTurnData.player1) {
              clearInterval(pollInterval);
              setIsWaitingForOpponent(false);

              // Extract actions depending on our seat index
              const ourActions = onlineParams.playerIndex === 0 ? currentTurnData.player0 : currentTurnData.player1;
              const oppActions = onlineParams.playerIndex === 0 ? currentTurnData.player1 : currentTurnData.player0;

              // Convert opponent's coordinates (invert player <-> enemy)
              const mappedOpponentActions = oppActions.map((a: CuedAction) => ({
                sourceId: a.sourceId.startsWith('player') ? a.sourceId.replace('player', 'enemy') : a.sourceId.replace('enemy', 'player'),
                skillIndex: a.skillIndex,
                targetId: a.targetId.startsWith('player') ? a.targetId.replace('player', 'enemy') : a.targetId.replace('enemy', 'player')
              }));

              // Clear local cued actions for next turn
              setCuedActions([]);

              // Execute simulation deterministically
              executeTurnSimulation(ourActions, mappedOpponentActions);
            }
          }
        } catch (err) {
          console.error('Error polling turn resolution state:', err);
        }
      }, 1500);

    } else {
      // OFFLINE AI ROUTINE
      // --- 1. AI SELECTS ACTIONS ---
      const aiActions: CuedAction[] = [];
      let tempAiChakra = { ...enemyChakra };

      enemyCombatants.forEach(aiChar => {
        if (aiChar.isDead) return;

        // Stun check
        const isStunned = aiChar.activeEffects.some(e => e.type === 'stun');
        if (isStunned) return;

        // Find affordable, off-cooldown skills
        const usableSkills = aiChar.character.skills
          .map((skill, idx) => ({ skill, idx }))
          .filter(({ skill }) => skill.currentCooldown === 0 && canAffordSkill(skill, tempAiChakra));

        // Condition check
        const filteredSkills = usableSkills.filter(({ skill }) => {
          if (skill.requireEffect) {
            return aiChar.activeEffects.some(e => e.name === skill.requireEffect);
          }
          return true;
        });

        if (filteredSkills.length > 0) {
          const chosen = filteredSkills[Math.floor(Math.random() * filteredSkills.length)];
          const skill = chosen.skill;

          let targetId = '';
          if (skill.targetType === 'Self') {
            targetId = aiChar.id;
          } else if (skill.targetType === 'Ally') {
            const aliveAllies = enemyCombatants.filter(e => !e.isDead);
            if (aliveAllies.length > 0) {
              targetId = aliveAllies[Math.floor(Math.random() * aliveAllies.length)].id;
            }
          } else if (skill.targetType === 'Enemy') {
            const alivePlayers = playerCombatants.filter(p => !p.isDead);
            const visiblePlayers = alivePlayers.filter(p => !p.activeEffects.some(e => e.type === 'invisible'));
            const finalCandidates = visiblePlayers.length > 0 ? visiblePlayers : alivePlayers;
            if (finalCandidates.length > 0) {
              targetId = finalCandidates[Math.floor(Math.random() * finalCandidates.length)].id;
            }
          }

          if (targetId) {
            aiActions.push({ sourceId: aiChar.id, skillIndex: chosen.idx, targetId });
            deductChakraCost(skill, false);
          }
        }
      });

      // Clear local cued actions for next turn
      setCuedActions([]);

      // Run simulation directly using cuedActions and local AI actions
      executeTurnSimulation(cuedActions, aiActions);
    }
  };

  // 30-Second Turn Timer State & Effect
  const [timeLeft, setTimeLeft] = useState(30);
  const handleEndTurnRef = useRef(handleEndTurn);

  useEffect(() => {
    handleEndTurnRef.current = handleEndTurn;
  }, [handleEndTurn]);

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
  }, [turn, gameOver, isWaitingForOpponent]);

  const executeTurnSimulation = (playerActions: CuedAction[], enemyActions: CuedAction[]) => {
    // --- 2. BATTLE RESOLUTION SIMULATION ---
    const newLogs: CombatLog[] = [];
    const updatedPlayer = [...playerCombatants];
    const updatedEnemy = [...enemyCombatants];

    const resolveEffectTargets = (
      targetOverride: string | undefined,
      defaultTarget: CombatCharacter,
      source: CombatCharacter,
      sourceList: CombatCharacter[],
      targetList: CombatCharacter[]
    ): CombatCharacter[] => {
      if (!targetOverride || targetOverride === 'Target') {
        return [defaultTarget];
      }
      if (targetOverride === 'Self') {
        return [source];
      }
      if (targetOverride === 'Both') {
        return [source, defaultTarget];
      }
      if (targetOverride === 'Ally') {
        if (sourceList.some(c => c.id === defaultTarget.id)) {
          return [defaultTarget];
        }
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

      // Stun check
      const isStunned = source.activeEffects.some(e => e.type === 'stun');
      if (isStunned) return;

      const skill = source.character.skills[action.skillIndex];
      // Lock cooldown
      skill.currentCooldown = skill.cooldown;

      let target = targetList.find(c => c.id === action.targetId) || sourceList.find(c => c.id === action.targetId);
      if (!target || target.isDead) return;

      // CHECK INVULNERABILITY
      const isInvulnerable = target.activeEffects.some(e => e.type === 'invulnerable');
      if (isInvulnerable && skill.targetType === 'Enemy') {
        newLogs.push({
          id: Math.random().toString(),
          turn,
          message: `🛡️ ${source.character.name} usou [${skill.name}] em ${target.character.name} mas ele está INVULNERÁVEL!`,
          type: 'system',
        });
        addFloatingText(target.id, 'INVULNERÁVEL', 'invulnerable');
        return;
      }

      // CHECK REFLECT / COUNTER ATTACK
if (skill.targetType === 'Enemy') {
  const reflectEffect = target.activeEffects.find(e => e.type === 'reflect');
  if (reflectEffect && !skill.cannotBeReflected) {
    let newTarget = source;
    if (reflectEffect.reflectMode === 'RandomAlly') {
      const allies = targetList.filter(c => !c.isDead && c.id !== target.id);
      newTarget = allies.length > 0 ? allies[Math.floor(Math.random() * allies.length)] : target;
    }
    newLogs.push({
      id: Math.random().toString(), turn,
      message: `🔄 ${target.character.name} REFLETIU [${skill.name}] de volta para ${newTarget.character.name}!`,
      type: 'system',
    });
    addFloatingText(target.id, 'REFLETIDO', 'effect');
    reflectEffect.duration -= 1;
    if (reflectEffect.duration <= 0) {
      target.activeEffects = target.activeEffects.filter(e => e !== reflectEffect);
    }
    target = newTarget;
  } else {
    const counterEffect = target.activeEffects.find(e => e.type === 'counter_attack');
    if (counterEffect && !skill.cannotBeCountered) {
      newLogs.push({
        id: Math.random().toString(), turn,
        message: `🚫 ${target.character.name} CONTRA-ATACOU e anulou [${skill.name}] de ${source.character.name}!`,
        type: 'system',
      });
      addFloatingText(target.id, 'ANULADO', 'effect');
      counterEffect.duration -= 1;
      if (counterEffect.duration <= 0) {
        target.activeEffects = target.activeEffects.filter(e => e !== counterEffect);
      }
      return; // pula toda a skill
    }
  }
}

      // EXECUTE SKILL LOGIC
      let baseDamage = skill.damage || 0;
      let directDamage = skill.directDamage || 0;
      let healAmt = skill.heal || 0;
      let stunApplied = (skill.stunTurns && skill.stunTurns > 0) ? true : false;
      let stunDuration = skill.stunTurns || 1;
      let finalStunType: ('mental' | 'physical' | 'affliction' | 'chakra')[] | undefined = skill.stunType;
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
          // If this skill didn't define any dynamic values, give it a small default damage ONLY if it targets an enemy
           if (
    baseDamage === 0 && 
    directDamage === 0 && 
    healAmt === 0 && 
    !stunApplied && 
    !effectName && 
    !skill.removeShield && 
    !skill.gainChakra && 
    !skill.drainChakra &&
    !skill.counterAttack &&
    !skill.reflect &&
    (skill.targetType === 'Enemy' || skill.targetType === 'AllEnemies')
  ) {
    baseDamage = 15;
  }
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
          target.activeEffects.push({
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
        const directTargets = resolveEffectTargets(skill.directDamageTarget, target, source, sourceList, targetList);
        directTargets.forEach(t => {
          if (t.isDead) return;
          if (skill.directDamageDuration && skill.directDamageDuration > 1) {
            const duration = skill.directDamageDuration;
            t.activeEffects.push({
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
            t.health = Math.max(0, t.health - directDamage);
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
        const gainChakraTargets = resolveEffectTargets(skill.gainChakraTarget || 'Self', target, source, sourceList, targetList);

        gainChakraTargets.forEach(t => {
          if (t.isDead) return;
          if (dur > 1) {
            t.activeEffects.push({
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
        const drainChakraTargets = resolveEffectTargets(skill.drainChakraTarget || 'Target', target, source, sourceList, targetList);

        drainChakraTargets.forEach(t => {
          if (t.isDead) return;
          if (dur > 1) {
            t.activeEffects.push({
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
        source.activeEffects.push({
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
        const damageTargets = resolveEffectTargets(skill.damageTarget, target, source, sourceList, targetList);
        damageTargets.forEach(t => {
          if (t.isDead) return;
          t.activeEffects.push({
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
        const damageTargets = resolveEffectTargets(skill.damageTarget, target, source, sourceList, targetList);
        damageTargets.forEach(t => {
          if (t.isDead) return;
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
        });
      }

      // 2. APPLY HEALING
      if (skill.healDuration && skill.healDuration > 1) {
        const duration = skill.healDuration;
        const healTargets = resolveEffectTargets(skill.healTarget, target, source, sourceList, targetList);
        healTargets.forEach(t => {
          if (t.isDead) return;
          t.activeEffects.push({
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
        const healTargets = resolveEffectTargets(skill.healTarget, target, source, sourceList, targetList);
        healTargets.forEach(t => {
          if (t.isDead) return;
          t.health = Math.min(100, t.health + healAmt);
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
          physical: 'Stun Físico', mental: 'Stun Mental', affliction: 'Stun Aflição', chakra: 'Stun Chakra',
        };
        const stunTypeName = (finalStunType && finalStunType.length > 0)
          ? finalStunType.map(t => stunTypeLabels[t]).join(' + ')
          : 'Stun';

        const stunTargets = resolveEffectTargets(skill.stunTarget, target, source, sourceList, targetList);
        stunTargets.forEach(t => {
          if (t.isDead) return;
          t.activeEffects.push({
            name: `${skill.name} (${stunTypeName})`,
            type: 'stun',
            duration: stunDuration,
            icon: skill.icon,
            stunType: finalStunType,
            irremovable: !!skill.stunIrremovable,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🌀 ${t.character.name} recebeu [${stunTypeName}] por [${skill.name}] de ${source.character.name} por ${stunDuration} ${stunDuration === 1 ? 'turno' : 'turnos'}!`,
            type: 'stun',
          });
          addFloatingText(t.id, `${stunTypeName.toUpperCase()} (${stunDuration}T)`, 'stun');
          cleanseTargetEffects(t, skill.stunRemoveType);
        });
      }

      // 4. APPLY BUFFER SHIELDS & OTHER CUSTOM EFFECT BUFFS
      if (skill.shieldVal && skill.shieldVal > 0) {
        const shieldTargets = resolveEffectTargets(skill.shieldTarget, target, source, sourceList, targetList);
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
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🛡️ ${t.character.name} ganhou +${skill.shieldVal} de escudo com [${skill.name}] por ${skill.shieldDuration || 99} turnos!`,
              type: 'buff',
            });
            addFloatingText(t.id, `+${skill.shieldVal} ESCUDO`, 'shield');
            
            if (skill.shieldDuration && skill.shieldDuration < 99) {
              t.activeEffects.push({
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
  const cTargets = resolveEffectTargets(skill.counterAttackTarget, target, source, sourceList, targetList);
  cTargets.forEach(t => {
    if (t.isDead) return;
    t.activeEffects.push({
      name: `${skill.name} Contra-Ataque`,
      type: 'counter_attack',
      duration: skill.counterAttackDuration || 1,
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
  const rTargets = resolveEffectTargets(skill.reflectTarget, target, source, sourceList, targetList);
  rTargets.forEach(t => {
    if (t.isDead) return;
    t.activeEffects.push({
      name: `${skill.name} Reflect`,
      type: 'reflect',
      duration: skill.reflectDuration || 1,
      icon: skill.icon,
      irremovable: !!skill.reflectIrremovable,
      cannotBeCountered: !!skill.reflectCannotBeCountered,
      cannotBeReflected: !!skill.reflectCannotBeReflected,
      reflectMode: skill.reflectMode || 'Caster',
    });
    newLogs.push({
      id: Math.random().toString(), turn,
      message: `🔄 ${t.character.name} ativou REFLECT com [${skill.name}]!`,
      type: 'buff',
    });
    addFloatingText(t.id, 'REFLECT', 'effect');
    cleanseTargetEffects(t, skill.reflectRemoveType);
  });
}

      // 4.2 APPLY DAMAGE REDUCTION
      if (skill.damageReductionVal && skill.damageReductionVal > 0) {
        const shieldTargets = resolveEffectTargets(skill.shieldTarget, target, source, sourceList, targetList);
        shieldTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.damageReductionDuration || 3;
          t.activeEffects.push({
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
        const buffTargets = resolveEffectTargets(skill.shieldTarget, target, source, sourceList, targetList);
        buffTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.damageBuffDuration || 3;
          t.activeEffects.push({
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
        const invulTargets = resolveEffectTargets(skill.shieldTarget, target, source, sourceList, targetList);
        invulTargets.forEach(t => {
          if (t.isDead) return;
          t.activeEffects.push({
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
        const dotTargets = resolveEffectTargets(skill.dotTarget, target, source, sourceList, targetList);
        dotTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.dotDuration || 3;
          t.activeEffects.push({
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
        const bleedTargets = resolveEffectTargets(skill.bleedingTarget, target, source, sourceList, targetList);
        bleedTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.bleedingDuration || 3;
          t.activeEffects.push({
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
        const afflictionTargets = resolveEffectTargets(skill.afflictionTarget, target, source, sourceList, targetList);
        afflictionTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.afflictionDuration || 3;
          t.activeEffects.push({
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
        const paralyzeTargets = resolveEffectTargets(skill.paralyzeCooldownTarget, target, source, sourceList, targetList);
        paralyzeTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.paralyzeCooldownDuration || 1;
          t.activeEffects.push({
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
          target.activeEffects.push({
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
      playLoseSound();
    } else if (allPlayerDead) {
      setGameOver('defeat');
      playLoseSound();
    } else if (allEnemyDead) {
      setGameOver('victory');
      playWinSound();
    } else {
      // Continue next turn: each gains 1 chakra per living allied character
      const alivePlayerCount = updatedPlayer.filter(c => !c.isDead).length;
      const aliveEnemyCount = updatedEnemy.filter(c => !c.isDead).length;

      setTurn(prev => prev + 1);
      rollChakraForTurn(true, alivePlayerCount);
      rollChakraForTurn(false, aliveEnemyCount);
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
      effects.push({
        label: 'Atordoar (Stun)',
        value: `${skill.stunTurns} ${skill.stunTurns === 1 ? 'Turno' : 'Turnos'} (${(skill.stunType && skill.stunType.length > 0) ? skill.stunType.map(t => t === 'physical' ? 'Físico' : t === 'mental' ? 'Mental' : t === 'affliction' ? 'Aflição' : 'Chakra').join(' + ') : 'Stun'})`,
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

    if (effects.length === 0) return null;

    return (
      <div className="mt-2.5 pt-2 border-t border-slate-800/60 space-y-1.5 text-[10px] font-mono pointer-events-none text-left">
        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Efeitos da Habilidade:</p>
        <div className="grid grid-cols-1 gap-1.5 max-h-[120px] overflow-y-auto scrollbar-thin">
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
    style={{ zoom: 0.75 }}
  >
      {/* VIDEO BACKGROUND (arquivo local) — renderizado via portal fora do container com zoom */}
      {createPortal(
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-slate-950">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute top-1/2 left-1/2 w-[177.78vh] min-w-full h-[56.25vw] min-h-full -translate-x-1/2 -translate-y-1/2 object-cover"
          >
            <source src={encodeURI('/static/img/bg/Hailuo_Video_não altere nenhum detalhe da c_535795206726541317.mp4')} type="video/mp4" />
          </video>
          {/* Overlay para manter o texto legível sobre o vídeo */}
          <div className="absolute inset-0" />
        </div>,
        document.body
      )}

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
      <header className="border-t border-slate-900 bg-slate-950/90 backdrop-blur-md fixed bottom-0 left-0 right-0 z-20 px-6 py-3 shadow-2xl">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button
              onClick={onQuit}
              className="p-2 hover:bg-slate-900 rounded-lg border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
              title="Sair do Combate"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <span className="text-xs font-mono text-orange-400 font-bold uppercase tracking-wider">Arena de Combate Unison</span>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold tracking-tight">TURNO {turn}</h2>
                {!isWaitingForOpponent && !gameOver && (
                  <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-mono font-black uppercase tracking-wider transition-all duration-300 ${
                    timeLeft <= 10
                      ? 'bg-red-950/80 border-red-500/60 text-red-400 animate-pulse ring-1 ring-red-500/30'
                      : 'bg-slate-900/80 border-slate-800 text-orange-400'
                  }`}>
                    <Clock className={`w-3.5 h-3.5 ${timeLeft <= 10 ? 'animate-bounce text-red-500' : 'text-orange-400 animate-pulse'}`} />
                    <span>{timeLeft}s</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Music/Sound Toggle */}
            <button
              onClick={() => {
                playClickSound();
                onToggleMute();
              }}
              className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 transition-all cursor-pointer text-slate-300"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-orange-400" />}
            </button>

            {/* End Turn Button */}
            <button
              onClick={handleEndTurn}
              className="px-6 py-2.5 bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 font-black rounded-lg hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-orange-600/10 border border-orange-400 text-xs uppercase tracking-widest cursor-pointer flex items-center gap-2"
            >
              <Swords className="w-4 h-4" />
              Finalizar Turno
            </button>
          </div>
        </div>
      </header>

      {/* Main Battle Grid Area */}
      <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-36 flex-1 grid lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: PLAYER SQUAD (4 Columns) */}
        <section className="lg:col-span-4 space-y-6">
          {/* BEAUTIFUL COMPETITIVE GAME USER PROFILE CARD */}
          <div className="relative overflow-hidden bg-gradient-to-r from-slate-900/95 via-slate-900/70 to-slate-950/80 border border-slate-800 rounded-2xl p-4 flex items-center gap-4 shadow-2xl group transition-all duration-300 hover:border-orange-500/40">
            {/* Background absolute flare */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/5 rounded-full blur-2xl group-hover:bg-orange-600/10 transition-all pointer-events-none" />
            
            {/* Avatar container with high fidelity glow */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-orange-600 to-amber-500 rounded-full blur-sm opacity-50 animate-pulse group-hover:opacity-80 transition-all" />
              <div className="relative w-14 h-14 rounded-full border-2 border-orange-500/80 overflow-hidden shadow-lg p-0.5 bg-slate-950">
                <img
                  src={user.photoUrl}
                  alt={user.name}
                  className="w-full h-full rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="absolute -bottom-1.5 -right-1.5 bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 text-[8px] font-black font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border border-slate-950 shadow">
                PRO
              </div>
            </div>

            {/* Profile Info details */}
            <div className="flex-1 text-left">
              <p className="text-xs font-mono text-orange-400 font-black uppercase tracking-wider mb-0.5">Seu Perfil</p>
              <h4 className="text-base font-black tracking-tight text-white uppercase truncate flex items-center gap-1.5 font-display">
                {user.name}
              </h4>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-mono text-slate-400">@{user.username}</span>
                <span className="w-1 h-1 bg-slate-600 rounded-full" />
                <span className="text-[9px] font-mono font-bold text-orange-500 uppercase tracking-widest">Nível 99 • Jounin</span>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {playerCombatants.map((combatant, idx) => {
              const isSelectedSource = selectedSkill?.charId === combatant.id;
              const hasCued = cuedActions.some(a => a.sourceId === combatant.id);
              const cuedAct = cuedActions.find(a => a.sourceId === combatant.id);
              const isStunned = combatant.activeEffects.some(e => e.type === 'stun');
              const incomingCues = cuedActions.filter(a => a.targetId === combatant.id);

              return (
                <div
                  key={combatant.id}
                  onClick={() => handleSelectTarget(combatant.id, false)}
                  className={`relative p-4 rounded-xl border bg-slate-900/60 transition-all ${
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
                      .map(f => {
                        let textClass = 'text-red-500 shadow-red-500/5';
                        if (f.type === 'heal') textClass = 'text-emerald-400 shadow-emerald-500/5';
                        if (f.type === 'shield') textClass = 'text-blue-400 shadow-blue-500/5';
                        if (f.type === 'stun') textClass = 'text-amber-500';
                        if (f.type === 'effect') textClass = 'text-orange-400';

                        return (
                          <motion.span
                            key={f.id}
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
                      <span className="text-[7px] font-mono font-bold uppercase tracking-wider text-orange-400 mr-0.5">ALVO DE:</span>
                      {incomingCues.map((cue, cIdx) => {
                        const src = playerCombatants.find(p => p.id === cue.sourceId);
                        const skill = src?.character.skills[cue.skillIndex];
                        return (
                          <div key={cue.sourceId + '-' + cue.skillIndex} className="group relative">
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
                        <div className="absolute inset-0 bg-amber-500/40 flex items-center justify-center font-mono text-[9px] font-black text-slate-950 tracking-wider">
                          ATORDOADO
                        </div>
                      )}
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

                      {/* Active Status Badges */}
                      {combatant.activeEffects.length > 0 && (() => {
                        const effectsPerPage = 3;
                        const effPage = activeEffectsPages[combatant.id] || 0;
                        const totalEffPages = Math.ceil(combatant.activeEffects.length / effectsPerPage);
                        const paginatedEffects = combatant.activeEffects.slice(effPage * effectsPerPage, (effPage + 1) * effectsPerPage);

                        return (
                          <div className="flex items-center gap-1.5 pt-1.5 w-full">
                            <div className="flex flex-wrap gap-1 items-center">
                              {paginatedEffects.map((eff, effIdx) => {
                                const isDebuff = eff.type === 'stun' || eff.type === 'dot' || eff.type === 'bleeding' || eff.type === 'affliction' || eff.type === 'paralyze_cooldown' || eff.type === 'damage' || eff.type === 'direct_damage' || eff.type === 'counter_attack' || eff.type === 'reflect' || eff.name.toLowerCase().includes('burn') || eff.name.toLowerCase().includes('stun') || eff.name.toLowerCase().includes('sangramento') || eff.name.toLowerCase().includes('aflição');
                                
                               const lockIcon = eff.irremovable ? '🔒' : '';

                                return (
                                  <div
                                    key={effIdx}
                                    className={`relative group flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-mono select-none bg-slate-950 border transition-all hover:bg-slate-900 ${
                                      isDebuff ? 'border-red-500/50 text-red-400 shadow-md shadow-red-950/40' : 'border-slate-700/80 text-emerald-400'
                                    }`}
                                    title={`${eff.name} - Duração: ${eff.duration} turnos`}
                                  >
                                    {eff.icon ? (
                                      <img
                                        src={eff.icon}
                                        alt={eff.name}
                                        referrerPolicy="no-referrer"
                                        className="w-4 h-4 rounded object-cover border border-slate-700/80"
                                        onError={(e) => {
                                          const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                                        }}
                                      />
                                    ) : (
                                      <span className={`w-1.5 h-1.5 rounded-full ${isDebuff ? 'bg-red-500 animate-pulse' : 'bg-orange-500 animate-pulse'}`} />
                                    )}
                                   <span className="font-bold tabular-nums tracking-tight">
  {lockIcon}{typeof eff.value === 'number' && eff.value !== 0 ? `${eff.value}·` : ''}{eff.duration}T
</span>
                                    
                                    {/* Tooltip on hover */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-50 bg-slate-950 border border-slate-800 rounded-lg p-2 text-[10px] w-36 text-white shadow-xl pointer-events-none text-center">
                                      <span className="font-bold block text-orange-400 truncate">{eff.name}</span>
                                      <span className="text-slate-400 font-mono text-[9px] block">
                                        Tipo: <span className="text-purple-400 font-bold uppercase">{eff.type}</span>
                                      </span>
                                      {eff.stunType && (
                                        <span className="text-slate-300 font-mono text-[9px] block mt-0.5">
                                          Stun: <span className="text-pink-400 font-bold uppercase">{eff.stunType?.join(' + ')}</span>
                                        </span>
                                      )}
                                      <span className="text-slate-400 font-mono text-[9px] block mt-0.5">Restam {eff.duration} {eff.duration === 1 ? 'turno' : 'turnos'}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            
                            {totalEffPages > 1 && (
                              <div className="flex items-center gap-1 ml-auto shrink-0 bg-slate-950/40 p-0.5 rounded border border-slate-900">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveEffectsPages(prev => ({
                                      ...prev,
                                      [combatant.id]: (effPage - 1 + totalEffPages) % totalEffPages
                                    }));
                                  }}
                                  className="p-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                                >
                                  <ChevronLeft className="w-2.5 h-2.5" />
                                </button>
                                <span className="text-[8px] font-mono text-slate-500 px-0.5">
                                  {effPage + 1}/{totalEffPages}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveEffectsPages(prev => ({
                                      ...prev,
                                      [combatant.id]: (effPage + 1) % totalEffPages
                                    }));
                                  }}
                                  className="p-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                                >
                                  <ChevronRight className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            )}
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
                      <div className="space-y-2 mt-3">
                        <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-800/80">
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
 
                             return (
                               <div
                                 key={sIdx}
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   if (isRequiredEffectLocked) {
                                     addFloatingText(combatant.id, `Requer ${skill.requireEffect}!`, 'effect');
                                     return;
                                   }
                                   handleSelectSkill(combatant.id, sIdx);
                                 }}
                                 className={`group relative aspect-square rounded-lg border overflow-hidden bg-slate-950 flex flex-col items-center justify-center cursor-pointer transition-all ${
                                   isCued
                                     ? 'border-orange-500 shadow shadow-orange-600/35 ring-1 ring-orange-500'
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

                                {/* Required Effect Locked Overlay (🔒) */}
                                {isRequiredEffectLocked && !isCooldown && (
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

                        {/* Pagination controls for combatant skills if more than 4 skills */}
                        {totalSkillPages > 1 && (
                          <div className="flex items-center justify-between bg-slate-950/40 px-2 py-1.5 rounded-lg border border-slate-900/60 mt-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                playCustomSound('Click');
                                setCombatantSkillPages(prev => ({
                                  ...prev,
                                  [combatant.id]: Math.max(0, skillsPage - 1)
                                }));
                              }}
                              disabled={skillsPage === 0}
                              className={`p-1 rounded bg-slate-900 border text-slate-400 hover:text-slate-200 transition-all cursor-pointer ${
                                skillsPage === 0 ? 'opacity-30 cursor-not-allowed border-slate-950' : 'border-slate-800'
                              }`}
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            
                            <div className="flex gap-1.5 items-center justify-center">
                              {Array.from({ length: totalSkillPages }).map((_, pageIdx) => (
                                <button
                                  key={pageIdx}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playCustomSound('Click');
                                    setCombatantSkillPages(prev => ({
                                      ...prev,
                                      [combatant.id]: pageIdx
                                    }));
                                  }}
                                  className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${
                                    pageIdx === skillsPage ? 'bg-orange-500 scale-125' : 'bg-slate-700 hover:bg-slate-500'
                                  }`}
                                />
                              ))}
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                playCustomSound('Click');
                                setCombatantSkillPages(prev => ({
                                  ...prev,
                                  [combatant.id]: Math.min(totalSkillPages - 1, skillsPage + 1)
                                }));
                              }}
                              disabled={skillsPage === totalSkillPages - 1}
                              className={`p-1 rounded bg-slate-900 border text-slate-400 hover:text-slate-200 transition-all cursor-pointer ${
                                skillsPage === totalSkillPages - 1 ? 'opacity-30 cursor-not-allowed border-slate-950' : 'border-slate-800'
                              }`}
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </section>

        {/* Center: ARENA CONTROL BOARD & CHAKRA (4 Columns) */}
        <section className="lg:col-span-4 space-y-6 bg-slate-900/40 p-5 rounded-2xl border border-slate-900">
          {/* Active Player Chakra Pool */}
          <div>
           <div className="flex items-center justify-between pb-2 border-b border-slate-900">
  <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
    <Sparkles className="w-3.5 h-3.5 text-orange-500" /> Seu Estoque de Chakra
  </h3>
  <button
    onClick={() => setShowChakraTrade(true)}
    className="text-[10px] font-mono uppercase tracking-wider text-orange-400 border border-orange-500/40 rounded px-2 py-1 hover:bg-orange-500/10"
  >
    Trocar 4→1
  </button>
</div>

            <div className="flex justify-around items-center bg-slate-950/40 border border-slate-900/60 rounded-xl py-3 px-4 mt-3">
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
                    <div key={key} className="flex flex-col items-center gap-1 group relative">
                      {/* Small Colored Ball */}
                      <div className={`w-3 h-3 rounded-full ${dotColorClass} transition-transform group-hover:scale-110`} />
                      
                      {/* Quantity Below */}
                      <span className="font-mono text-sm font-black text-slate-200 mt-0.5 flex items-center">
                        {playerChakra[key]}
                        {hasChange && (
                          <span className="text-orange-400 text-xs ml-1 font-bold animate-pulse">
                            ({simulatedVal})
                          </span>
                        )}
                      </span>
                      
                      {/* Discret Label */}
                      <span className={`text-[8px] font-mono font-bold uppercase tracking-wider ${labelColorClass}`}>{key}</span>

                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-950 border border-slate-850 rounded px-2 py-1 text-[9px] text-white z-50 whitespace-nowrap pointer-events-none shadow-lg">
                        {desc} {hasChange ? `(Previsão: ${simulatedVal})` : ''}
                      </div>
                    </div>
                  );
                });
              })()}
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
              <div className="bg-slate-950/80 border border-slate-950 rounded-xl p-4 min-h-[16rem] flex flex-col justify-between">
                {inspectedSkill ? (
                  <div className="space-y-3.5">
                    {/* Top Row: Skill Icon, Name & Owner */}
                    <div className="flex gap-3 pb-3 border-b border-slate-900">
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-800 flex-shrink-0 bg-slate-900">
                        <img 
                          src={inspectedSkill.skill.icon} 
                          alt={inspectedSkill.skill.name} 
                          className="w-full h-full object-cover"
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

                    {/* Requirement Warning */}
                    {inspectedSkill.skill.requireEffect && (
                      <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg text-[9px] font-mono text-amber-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Requer efeito ativo: <strong className="underline">{inspectedSkill.skill.requireEffect}</strong>
                      </div>
                    )}

                    {/* Skill Detailed Description */}
                    <div className="bg-slate-900/30 rounded-lg p-3 border border-slate-900/60 flex-1 overflow-y-auto max-h-[220px] scrollbar-thin">
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
                {logs.map((log) => {
                  let colorClass = 'text-slate-400';
                  if (log.type === 'damage') colorClass = 'text-red-400';
                  if (log.type === 'heal') colorClass = 'text-emerald-400';
                  if (log.type === 'buff') colorClass = 'text-blue-400';
                  if (log.type === 'stun') colorClass = 'text-amber-500';
                  if (log.type === 'death') colorClass = 'text-red-500 font-bold';
                  if (log.type === 'chakra') colorClass = 'text-indigo-400';

                  return (
                    <p key={log.id} className={colorClass}>
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
                          className="w-5 h-5 rounded object-cover"
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
        <section className="lg:col-span-4 space-y-6">
          {/* BEAUTIFUL COMPETITIVE GAME USER PROFILE CARD (ENEMY) */}
          <div className="relative overflow-hidden bg-gradient-to-r from-slate-950/80 via-slate-900/70 to-slate-900/95 border border-slate-800 rounded-2xl p-4 flex items-center gap-4 shadow-2xl group transition-all duration-300 hover:border-red-500/40">
            {/* Background absolute flare */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full blur-2xl group-hover:bg-red-600/10 transition-all pointer-events-none" />
            
            {/* Avatar container with high fidelity glow */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-red-600 to-rose-500 rounded-full blur-sm opacity-50 animate-pulse group-hover:opacity-80 transition-all" />
              <div className="relative w-14 h-14 rounded-full border-2 border-red-500/80 overflow-hidden shadow-lg p-0.5 bg-slate-950">
                <img
                  src={onlineParams?.isOnline ? onlineParams.opponentProfile.photoUrl : 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg'}
                  alt={onlineParams?.isOnline ? onlineParams.opponentProfile.name : 'I.A. Oponente'}
                  className="w-full h-full rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="absolute -bottom-1.5 -right-1.5 bg-gradient-to-r from-red-600 to-rose-500 text-white text-[8px] font-black font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border border-slate-950 shadow">
                {onlineParams?.isOnline ? 'LIVE' : 'BOT'}
              </div>
            </div>

            {/* Profile Info details */}
            <div className="flex-1 text-left">
              <p className="text-xs font-mono text-red-400 font-black uppercase tracking-wider mb-0.5">Oponente</p>
              <h4 className="text-base font-black tracking-tight text-white uppercase truncate flex items-center gap-1.5 font-display">
                {onlineParams?.isOnline ? onlineParams.opponentProfile.name : 'I.A. Kakashi'}
              </h4>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-mono text-slate-400">@{onlineParams?.isOnline ? onlineParams.opponentProfile.username : 'treinamento'}</span>
                <span className="w-1 h-1 bg-slate-600 rounded-full" />
                <span className="text-[9px] font-mono font-bold text-red-500 uppercase tracking-widest font-sans">Nível 80 • Rival</span>
              </div>
            </div>
          </div>
       
          <div className="space-y-4">
            {enemyCombatants.map((combatant, idx) => {
              const isStunned = combatant.activeEffects.some(e => e.type === 'stun');
              const incomingCues = cuedActions.filter(a => a.targetId === combatant.id);

              return (
                <div
                  key={combatant.id}
                  onClick={() => handleSelectTarget(combatant.id, true)}
                  className={`relative p-4 rounded-xl border bg-slate-900/60 transition-all ${
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
                      .map(f => {
                        let textClass = 'text-red-500 shadow-red-500/5';
                        if (f.type === 'heal') textClass = 'text-emerald-400 shadow-emerald-500/5';
                        if (f.type === 'shield') textClass = 'text-blue-400 shadow-blue-500/5';
                        if (f.type === 'stun') textClass = 'text-amber-500';
                        if (f.type === 'effect') textClass = 'text-orange-400';

                        return (
                          <motion.span
                            key={f.id}
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
                      <span className="text-[7px] font-mono font-bold uppercase tracking-wider text-orange-400 mr-0.5">ALVO DE:</span>
                      {incomingCues.map((cue, cIdx) => {
                        const src = playerCombatants.find(p => p.id === cue.sourceId);
                        const skill = src?.character.skills[cue.skillIndex];
                        return (
                          <div key={cue.sourceId + '-' + cue.skillIndex} className="group relative">
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
                        <div className="absolute inset-0 bg-amber-500/40 flex items-center justify-center font-mono text-[9px] font-black text-slate-950 tracking-wider">
                          ATORDOADO
                        </div>
                      )}
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

                      {/* Active Status Badges */}
                      {combatant.activeEffects.length > 0 && (() => {
                        const effectsPerPage = 3;
                        const effPage = activeEffectsPages[combatant.id] || 0;
                        const totalEffPages = Math.ceil(combatant.activeEffects.length / effectsPerPage);
                        const paginatedEffects = combatant.activeEffects.slice(effPage * effectsPerPage, (effPage + 1) * effectsPerPage);

                        return (
                          <div className="flex items-center gap-1.5 pt-1.5 w-full">
                            <div className="flex flex-wrap gap-1 items-center">
                              {paginatedEffects.map((eff, effIdx) => {
                                const isDebuff = eff.type === 'stun' || eff.type === 'dot' || eff.type === 'bleeding' || eff.type === 'affliction' || eff.type === 'paralyze_cooldown' || eff.type === 'damage' || eff.type === 'direct_damage' || eff.name.toLowerCase().includes('burn') || eff.name.toLowerCase().includes('stun') || eff.name.toLowerCase().includes('sangramento') || eff.name.toLowerCase().includes('aflição');
                                
                               const lockIcon = eff.irremovable ? '🔒' : '';

                                return (
                                  <div
                                    key={effIdx}
                                    className={`relative group flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-mono select-none bg-slate-950 border transition-all hover:bg-slate-900 ${
                                      isDebuff ? 'border-red-500/50 text-red-400 shadow-md shadow-red-950/40' : 'border-slate-700/80 text-emerald-400'
                                    }`}
                                    title={`${eff.name} - Duração: ${eff.duration} turnos`}
                                  >
                                    {eff.icon ? (
                                      <img
                                        src={eff.icon}
                                        alt={eff.name}
                                        referrerPolicy="no-referrer"
                                        className="w-4 h-4 rounded object-cover border border-slate-700/80"
                                        onError={(e) => {
                                          const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                                        }}
                                      />
                                    ) : (
                                      <span className={`w-1.5 h-1.5 rounded-full ${isDebuff ? 'bg-red-500 animate-pulse' : 'bg-orange-500 animate-pulse'}`} />
                                    )}
                                    <span className="font-bold tabular-nums tracking-tight">
  {lockIcon}{typeof eff.value === 'number' && eff.value !== 0 ? `${eff.value}·` : ''}{eff.duration}T
</span>
                                    
                                    {/* Tooltip on hover */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-50 bg-slate-950 border border-slate-800 rounded-lg p-2 text-[10px] w-36 text-white shadow-xl pointer-events-none text-center">
                                      <span className="font-bold block text-orange-400 truncate">{eff.name}</span>
                                      <span className="text-slate-400 font-mono text-[9px] block">
                                        Tipo: <span className="text-purple-400 font-bold uppercase">{eff.type}</span>
                                      </span>
                                      {eff.stunType && (
                                        <span className="text-slate-300 font-mono text-[9px] block mt-0.5">
                                          Stun: <span className="text-pink-400 font-bold uppercase">{eff.stunType}</span>
                                        </span>
                                      )}
                                      <span className="text-slate-400 font-mono text-[9px] block mt-0.5">Restam {eff.duration} {eff.duration === 1 ? 'turno' : 'turnos'}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            
                            {totalEffPages > 1 && (
                              <div className="flex items-center gap-1 ml-auto shrink-0 bg-slate-950/40 p-0.5 rounded border border-slate-900">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveEffectsPages(prev => ({
                                      ...prev,
                                      [combatant.id]: (effPage - 1 + totalEffPages) % totalEffPages
                                    }));
                                  }}
                                  className="p-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                                >
                                  <ChevronLeft className="w-2.5 h-2.5" />
                                </button>
                                <span className="text-[8px] font-mono text-slate-500 px-0.5">
                                  {effPage + 1}/{totalEffPages}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveEffectsPages(prev => ({
                                      ...prev,
                                      [combatant.id]: (effPage + 1) % totalEffPages
                                    }));
                                  }}
                                  className="p-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                                >
                                  <ChevronRight className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Character Skills list (as previews for tactical depth) */}
                  {!combatant.isDead && (
                    <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-800/80 mt-3">
                      {combatant.character.skills.map((skill, sIdx) => {
                        const isCooldown = skill.currentCooldown > 0;
                        const isSkillInvisibleToOpponent = skill.invisible || (skill.invisibleDuration !== undefined && skill.invisibleDuration > 0);

                        if (isSkillInvisibleToOpponent) {
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

                        if (isSandbox) {
                          return (
                            <div
                              key={sIdx}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isRequiredEffectLocked) {
                                  addFloatingText(combatant.id, `Requer ${skill.requireEffect}!`, 'effect');
                                  return;
                                }
                                handleSelectSkill(combatant.id, sIdx);
                              }}
                              className={`group relative aspect-square rounded-lg border overflow-hidden bg-slate-950 flex flex-col items-center justify-center cursor-pointer transition-all ${
                                isCued
                                  ? 'border-emerald-500 shadow shadow-emerald-600/35 ring-1 ring-emerald-500'
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

                              {/* Required Effect Locked Overlay (🔒) */}
                              {isRequiredEffectLocked && !isCooldown && (
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
                            <img src={skill.icon} alt={skill.name} className="w-full h-full object-cover" />

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
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* FIXED INTERACTIVE EMOJI COCKPIT */}
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 backdrop-blur-md border border-slate-800/80 px-4 py-2.5 rounded-full flex items-center gap-3.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)] select-none">
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
              className="absolute text-5xl filter drop-shadow-[0_8px_24px_rgba(249,115,22,0.45)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] select-none"
            >
              {emojiObj.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* GAME OVER BANNER MODAL */}
      <AnimatePresence>
        {gameOver && (
          <div className="fixed inset-0 bg-slate-950/90 z-50 flex items-center justify-center p-6 backdrop-blur">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-slate-900 border border-slate-800/85 p-8 max-w-md w-full rounded-2xl text-center space-y-6 shadow-2xl"
            >
              <div className="inline-block p-4 bg-orange-600/10 rounded-full border border-orange-500/30">
                <Swords className="w-8 h-8 text-orange-400" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-3xl font-black uppercase tracking-tight">
                  {gameOver === 'victory' ? (
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-500">VICTORY</span>
                  ) : (
                    <span className="text-red-500">DEFEATED</span>
                  )}
                </h3>
                <p className="text-sm text-slate-400">
                  {gameOver === 'victory'
                    ? 'Congratulations! You crushed the opponent squad and secured your shinobi supremacy!'
                    : 'Your squad has fallen in combat. Recoup your strategy and try again!'}
                </p>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={onQuit}
                  className="w-full py-3 bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 font-bold rounded-lg hover:brightness-110 active:scale-95 transition-all text-sm uppercase tracking-wider cursor-pointer"
                >
                  Return to Menu
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* CHAKRA TRADE MODAL */}
<AnimatePresence>
  {showChakraTrade && (
    <div className="fixed inset-0 bg-slate-950/90 z-50 flex items-center justify-center p-6 backdrop-blur">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-slate-900 border border-slate-800/85 p-6 max-w-sm w-full rounded-2xl space-y-5 shadow-2xl"
      >
        <h3 className="text-lg font-black uppercase tracking-tight text-center text-orange-400">
          Trocar Chakra (4 → 1)
        </h3>

        <div>
          <p className="text-xs font-mono text-slate-400 mb-2">Escolha 4 chakras para gastar:</p>
          <div className="flex justify-around">
            {(Object.keys(playerChakra) as (keyof ChakraPool)[]).map(key => {
              const totalSelected = (Object.keys(tradeSelection) as (keyof ChakraPool)[])
                .reduce((sum, k) => sum + tradeSelection[k], 0);
              const canAdd = tradeSelection[key] < playerChakra[key] && totalSelected < 4;
              return (
                <div key={key} className="flex flex-col items-center gap-1">
                  {renderChakraIcon(key)}
                  <span className="text-[10px] font-mono text-slate-300">{tradeSelection[key]} / {playerChakra[key]}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setTradeSelection(prev => ({ ...prev, [key]: Math.max(0, prev[key] - 1) }))}
                      className="w-5 h-5 text-xs bg-slate-800 rounded hover:bg-slate-700"
                    >-</button>
                    <button
                      disabled={!canAdd}
                      onClick={() => setTradeSelection(prev => ({ ...prev, [key]: prev[key] + 1 }))}
                      className="w-5 h-5 text-xs bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-30"
                    >+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-mono text-slate-400 mb-2">Escolha o chakra que vai receber:</p>
          <div className="flex justify-around">
            {(['Tai', 'Nin', 'Gen', 'Blood'] as (keyof ChakraPool)[]).map(key => (
              <button
                key={key}
                onClick={() => setTradeTarget(key)}
                className={`p-1 rounded-lg border ${tradeTarget === key ? 'border-orange-500 bg-orange-500/10' : 'border-transparent'}`}
              >
                {renderChakraIcon(key)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => { setShowChakraTrade(false); setTradeSelection({ Tai: 0, Nin: 0, Gen: 0, Blood: 0 }); setTradeTarget(null); }}
            className="flex-1 py-2 bg-slate-800 text-slate-300 font-bold rounded-lg text-xs uppercase tracking-wider hover:bg-slate-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleTradeChakra}
            className="flex-1 py-2 bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 font-bold rounded-lg text-xs uppercase tracking-wider hover:brightness-110 active:scale-95"
          >
            Confirmar Troca
          </button>
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
    </div>
  );
}
