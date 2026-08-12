/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Shield, Swords, RefreshCw, Volume2, VolumeX, ArrowLeft, Send, Sparkles, Flame, User, Info, ChevronLeft, ChevronRight, Clock, Flag, MessageSquare, X, Lock, Trophy, ShieldAlert, Scroll, Target, CheckCircle2, Award, ListTodo } from 'lucide-react';
import { Character, ChakraPool, CombatCharacter, ActiveEffect, CombatLog, FloatingText, Skill, ChakraType, UserProfile, getEffectiveSkillCost, Quest, QuestGoal } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import ProfileCardModal, { ProfileCardData } from './ProfileCardModal';
import { calculateBattleXp, getRankProgress, checkRankChange } from '../lib/xpSystem';
import { getRanks } from '../lib/rankStorage';
import { getCharacters } from '../lib/characterStorage';
import { useLanguage, translateGameText, translateSkillName, translateTargetType, getLanguage } from '../lib/i18n';
import { getGoalDescription } from '../lib/questUtils';
import { safeFetchJson } from '../lib/api';

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
    turn?: number;
    alivePlayerCount?: number;
  }, gainedXp?: number) => void;
  activeQuest?: Quest | null;
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

export interface EffectSubItem {
  effect: ActiveEffect;
  description: string;
  stacks: number;
}

export interface EffectDisplayItem {
  effect: ActiveEffect;
  stacks: number;
  description: string;
  skillName: string;
  isDebuff: boolean;
  subEffects: EffectSubItem[];
}

export function isSkillBlockedByStun(skill: Skill | null, activeEffects: ActiveEffect[]): boolean {
  // Stun immunity: if character has ignore_stun effect, they cannot be stunned
  if (activeEffects.some(e => e.type === 'ignore_stun')) return false;
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

export function checkCombatantInvulnerable(c: CombatCharacter, skillOrType?: Skill | string | string[]): boolean {
  if (!c || !c.activeEffects) return false;
  if (c.activeEffects.some(e => e.type === 'cannot_be_invulnerable')) return false;
  const invulEffects = c.activeEffects.filter(e => e.type === 'invulnerable');
  if (invulEffects.length === 0) return false;

  return invulEffects.some(eff => {
    const types = eff.invulnerableTypes;
    // No types specified = protects against all by default
    if (!types) return true;
    // Explicitly empty array = protects against nothing
    if (types.length === 0) return false;

    // 1. If skillOrType is a single string
    if (typeof skillOrType === 'string') {
      return isSingleTypeProtected(skillOrType, types);
    }

    // 2. If skillOrType is an array of strings
    if (Array.isArray(skillOrType)) {
      return skillOrType.some(st => isSingleTypeProtected(st, types));
    }

    // 3. If skillOrType is a Skill object
    if (skillOrType) {
      const skill = skillOrType as Skill;
      const classes = (skill.classes || []).map(cls => cls.toLowerCase());

      const isPhysical = classes.some(cls => ['physical', 'físico', 'fisico', 'taijutsu', 'melee', 'corpo a corpo'].includes(cls));
      const isMental = classes.some(cls => ['mental', 'genjutsu'].includes(cls));
      const isChakra = classes.some(cls => ['chakra', 'ninjutsu'].includes(cls));
      const isRanged = classes.some(cls => ['ranged', 'à distância', 'distância', 'distancia'].includes(cls));
      const isAffliction = classes.some(cls => ['affliction', 'aflição', 'aflicao'].includes(cls));
      const isFriendly = classes.some(cls => ['friendly', 'suporte', 'cura'].includes(cls));

      // If skill has Physical class, target MUST be protected against Physical
      if (isPhysical && !types.includes('physical')) return false;

      // If skill has Mental class, target MUST be protected against Mental
      if (isMental && !types.includes('mental')) return false;

      // If skill has Chakra class, target MUST be protected against Chakra
      if (isChakra && !types.includes('chakra')) return false;

      // If skill has Ranged class, target MUST be protected against Ranged
      if (isRanged && !types.includes('ranged')) return false;

      // If skill has Affliction class, target MUST be protected against Affliction
      if (isAffliction && !types.includes('affliction')) return false;

      // If skill has Friendly class, target MUST be protected against Friendly
      if (isFriendly && !types.includes('friendly')) return false;

      // Check specific damage/effect fields if skill has no primary class tags or passed all class checks
      if (skill.directDamage && skill.directDamage > 0) {
        if (!types.includes('direct_damage') && !types.includes('damage') && !types.includes('all')) return false;
      }
      if (skill.dotVal && skill.dotVal > 0) {
        if (!types.includes('dot') && !types.includes('damage') && !types.includes('all')) return false;
      }
      if (skill.bleedingVal && skill.bleedingVal > 0) {
        if (!types.includes('bleeding') && !types.includes('damage') && !types.includes('all')) return false;
      }

      return true;
    }

    // If no skill or damage type context provided at call-site (UI aura), check if 'all' or has any types
    if (types.includes('all')) return true;

    return true;
  });
}

function isSingleTypeProtected(typeStr: string, types: string[]): boolean {
  if (types.includes('all')) return true;
  const st = typeStr.toLowerCase();
  if (types.includes(st)) return true;
  if (['físico', 'fisico', 'taijutsu', 'melee', 'corpo a corpo'].includes(st) && types.includes('physical')) return true;
  if (['genjutsu'].includes(st) && types.includes('mental')) return true;
  if (['ninjutsu'].includes(st) && types.includes('chakra')) return true;
  if (['aflição', 'aflicao'].includes(st) && types.includes('affliction')) return true;
  if (['à distância', 'distância', 'distancia', 'ranged'].includes(st) && types.includes('ranged')) return true;
  return false;
}

export function isEffectVisibleToViewer(
  eff: ActiveEffect,
  viewerSide: 'player' | 'enemy' = 'player',
  viewerCombatants?: CombatCharacter[],
  targetCombatant?: CombatCharacter,
  allCombatants?: CombatCharacter[]
): boolean {
  if (eff.isInvisible || eff.type === 'invisible') {
    const effectCasterSide = eff.casterSide || (eff.casterId ? (eff.casterId.startsWith('player') ? 'player' : 'enemy') : undefined);
    if (effectCasterSide && effectCasterSide === viewerSide) {
      return true;
    }

    const combatantsToCheck = (allCombatants && allCombatants.length > 0)
      ? allCombatants
      : [
          ...(viewerCombatants || []),
          ...(targetCombatant ? [targetCombatant] : [])
        ];

    const hasActiveReveal = combatantsToCheck.some(c =>
      c.activeEffects?.some(e => e.type === 'reveal_invisible' && (e.casterSide === viewerSide || !e.casterSide || e.casterSide === 'player'))
    );

    if (hasActiveReveal) {
      return true;
    }

    return false;
  }
  return true;
}

export function isDebuffEffect(eff: ActiveEffect): boolean {
  if (!eff) return false;
  const debuffTypes = [
    'stun', 'dot', 'bleeding', 'affliction', 'paralyze_cooldown',
    'damage', 'direct_damage', 'damage_debuff', 'cannot_reduce_damage', 'cannot_be_invulnerable', 'cannot_receive_friendly', 'on_skill_use_damage', 'capture_arrest_trap', 'capture_arrest_debuff'
  ];
  if (debuffTypes.includes(eff.type)) return true;
  const lowerName = (eff.name || '').toLowerCase();
  return (
    lowerName.includes('burn') ||
    lowerName.includes('stun') ||
    lowerName.includes('sangramento') ||
    lowerName.includes('aflição') ||
    lowerName.includes('queimadura') ||
    lowerName.includes('atordoado') ||
    lowerName.includes('atordoamento') ||
    lowerName.includes('paralisia') ||
    lowerName.includes('dreno')
  );
}

export function getSkillBaseName(eff: ActiveEffect): string {
  if (eff.stackType) return eff.stackType;
  if (eff.sourceSkillName) return eff.sourceSkillName;

  let name = eff.name || '';
  const prefixMatch = name.match(/^(?:Dreno de Chakra|Cura Contínua|Invisibilidade|Fluxo de Chakra)\s*\((.+)\)$/i);
  if (prefixMatch) {
    return prefixMatch[1].trim();
  }

  name = name.replace(/\s*\([^)]*\)$/, '');

  const trailingKeywords = [
    'Burn', 'Sangramento', 'Aflição', 'Paralisia de Cooldown',
    'Guard', 'Power', 'Escape', 'Shield Decay', 'Contra-Ataque',
    'Reflect', 'Counter', 'Shield', 'Weakness', 'Fraqueza',
    'Retaliação', 'Stack', 'Retaliation'
  ];
  const regex = new RegExp(`\\s+(?:${trailingKeywords.join('|')})$`, 'i');
  name = name.replace(regex, '');

  return name.trim();
}

export function formatInvulnerableSummary(types?: string[]): string {
  const ALL_KNOWN_TYPES = ['damage', 'direct_damage', 'affliction', 'bleeding', 'dot', 'mental', 'physical', 'chakra', 'ranged', 'friendly', 'stun'];
  const TYPE_LABELS: Record<string, string> = {
    damage: 'dano normal',
    direct_damage: 'dano direto',
    affliction: 'aflição',
    bleeding: 'sangramento',
    dot: 'dano contínuo',
    mental: 'mental',
    physical: 'físico',
    chakra: 'chakra',
    ranged: 'distância',
    friendly: 'amigável',
    stun: 'atordoamento',
  };

  if (!types || types.length === 0 || types.includes('all')) {
    return 'a todos os danos e efeitos';
  }

  const cleanTypes = Array.from(new Set(types.filter(t => t !== 'all')));

  if (cleanTypes.length >= ALL_KNOWN_TYPES.length) {
    return 'a todos os danos e efeitos';
  }

  const formatList = (items: string[]) => {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} e ${items[1]}`;
    return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
  };

  if (cleanTypes.length <= Math.floor(ALL_KNOWN_TYPES.length / 2)) {
    const includedNames = cleanTypes.map(t => TYPE_LABELS[t] || t);
    return `a ${formatList(includedNames)}`;
  } else {
    const missingTypes = ALL_KNOWN_TYPES.filter(t => !cleanTypes.includes(t));
    const excludedNames = missingTypes.map(t => TYPE_LABELS[t] || t);
    return `a todos (exceto ${formatList(excludedNames)})`;
  }
}

export function getCaptureArrestBonusDamage(t: CombatCharacter, skill: Skill): number {
  if (!t || !t.activeEffects || t.activeEffects.length === 0 || !skill) return 0;
  const hasDebuff = t.activeEffects.some(e => e.type === 'capture_arrest_debuff' || (e.name && e.name.includes('Captureand Arrest')));
  if (!hasDebuff) return 0;
  const isPhysicalOrChakra = skill.classes?.some((c: string) => {
    const lower = c.toLowerCase();
    return lower.includes('físico') || lower.includes('fisico') || lower.includes('physical') ||
           lower.includes('tai') || lower.includes('corpo a corpo') || lower.includes('melee') ||
           lower.includes('chakra') || lower.includes('nin') || lower.includes('blood');
  });
  return isPhysicalOrChakra ? 15 : 0;
}

export function getSingleEffectDescription(effect: ActiveEffect): string {
  const lang = getLanguage();
  let desc = (effect as any).description || '';
  if (desc && desc !== 'Efeito invisível ativo') return translateGameText(desc, lang);

  const durText = effect.duration === 1 ? (lang === 'en' ? '1 turn' : '1 turno') : `${effect.duration} ${lang === 'en' ? 'turns' : 'turnos'}`;
  const val = effect.value || 0;

  let rawPt = '';

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
        rawPt = `🚫 Atordoado Completo: Não pode usar QUALQUER habilidade por ${durText}.`;
      } else {
        rawPt = `🚫 Atordoado Parcial: Não pode usar habilidades das categorias (${stTypes}) por ${durText}.`;
      }
      break;
    }
    case 'damage_debuff':
      rawPt = val > 0 ? `Fragilidade: Reduz o dano do alvo em ${val} por ${durText}` : `Fraqueza por ${durText}`;
      break;
    case 'damage_buff':
      rawPt = val > 0 ? `Aumenta o ataque de todas as suas habilidades em ${val}` : `Aumenta o ataque das habilidades por ${durText}`;
      break;
    case 'damage_reduction':
      rawPt = val > 0 ? `Redução de ${val} de dano por ${durText}` : `Redução de dano por ${durText}`;
      break;
    case 'shield':
      rawPt = val > 0 ? `Escudo protetor absorvendo ${val} de dano por ${durText}` : `Escudo protetor por ${durText}`;
      break;
    case 'dot':
    case 'damage':
      rawPt = val > 0 ? `Queimadura: Recebe ${val} de dano contínuo por turno por ${durText}` : `Dano contínuo por ${durText}`;
      break;
    case 'bleeding':
      rawPt = val > 0 ? `Sangramento: Recebe ${val} de dano por turno por ${durText}` : `Sangramento por ${durText}`;
      break;
    case 'affliction':
      rawPt = val > 0 ? `Aflição: Recebe ${val} de dano por turno por ${durText}` : `Aflição por ${durText}`;
      break;
    case 'direct_damage':
      rawPt = val > 0 ? `Dano Direto: Sofre ${val} de dano por turno por ${durText}` : `Dano direto por ${durText}`;
      break;
    case 'heal':
      rawPt = val > 0 ? `Regenera ${val} de vida por turno por ${durText}` : `Efeito de cura por ${durText}`;
      break;
    case 'invulnerable': {
      const summary = formatInvulnerableSummary(effect.invulnerableTypes);
      rawPt = `Inviolável: Imune ${summary} por ${durText}`;
      break;
    }
    case 'counter':
    case 'counter_attack':
      rawPt = `Pronto para contra-atacar por ${durText}`;
      break;
    case 'reflect':
      rawPt = `Reflete habilidades do oponente por ${durText}`;
      break;
    case 'paralyze_cooldown':
      rawPt = `Recargas de habilidades paralisadas por ${durText}`;
      break;
    case 'invisible':
      rawPt = `Efeito Invisível [${effect.sourceSkillName || effect.name}] (Invisível para o oponente) por ${durText}`;
      break;
    case 'reveal_invisible':
      rawPt = `Revelar Habilidades Invisíveis: Habilidades e efeitos invisíveis deste personagem revelados por ${durText}`;
      break;
    case 'cannot_reduce_damage':
      rawPt = `Incapaz de Reduzir Dano: Bônus de redução ignorados por ${durText}`;
      break;
    case 'cannot_be_invulnerable':
      rawPt = `Incapaz de Ficar Invulnerável: Invulnerabilidade bloqueada por ${durText}`;
      break;
    case 'ignore_stun':
      rawPt = `Imune a Stun: Stuns ignorados por ${durText}`;
      break;
    case 'damage_immunity':
      rawPt = `Imune a Dano: Todo dano anulado por ${durText}`;
      break;
    case 'immortal':
      rawPt = `Imortal: Não pode morrer enquanto este efeito estiver ativo por ${durText}`;
      break;
    case 'cannot_receive_friendly':
      rawPt = `Bloqueio Amigável: Não pode receber habilidades de aliados por ${durText}`;
      break;
    case 'on_skill_use_damage':
      rawPt = val > 0 ? `Punição por Habilidade: Sofre ${val} de dano a cada habilidade que usar por ${durText}` : `Punição por usar habilidade por ${durText}`;
      break;
    case 'capture_arrest_trap':
      rawPt = `Armadilha Capture and Arrest (Invisível): Se usar habilidade ofensiva, sofrerá 40 de dano e +15 de dano de físicas/chakra por 1 turno.`;
      break;
    case 'capture_arrest_debuff':
      rawPt = `Vulnerabilidade (Capture and Arrest): Sofre +15 de dano adicional de habilidades Físicas e de Chakra por ${durText}`;
      break;
    case 'retaliate_damage': {
      const baseVal = effect.retaliateDamageVal || effect.value || 0;
      const stacks = (effect as any).stacks || 1;
      const rVal = baseVal * stacks;
      const rScope = effect.retaliateTargetScope || 'self';
      const rScopeText = rScope === 'self' ? 'nele' : rScope === 'ally' ? 'em um aliado' : rScope === 'self_or_ally' ? 'nele ou em um aliado' : 'no time';
      const rModeText = effect.retaliateTriggerMode === 'first_only' ? ' (apenas 1º inimigo)' : '';
      const stackText = stacks > 1 ? ` (${stacks}x stacks = ${rVal} de dano)` : '';
      rawPt = `Retaliação: Se oponente usar skill ${rScopeText}, sofre ${rVal} de dano${rModeText}${stackText} por ${durText}`;
      break;
    }
    default:
      rawPt = val > 0 ? `${effect.name}: valor ${val} por ${durText}` : `${effect.name}: ativo por ${durText}`;
      break;
  }

  return translateGameText(rawPt, lang);
}

function getGroupedActiveEffects(
  effects: ActiveEffect[],
  viewerSide: 'player' | 'enemy' = 'player',
  viewerCombatants?: CombatCharacter[],
  targetCombatant?: CombatCharacter,
  allCombatants?: CombatCharacter[]
): EffectDisplayItem[] {
  if (!effects || effects.length === 0) return [];

  const visibleEffects = effects.filter(eff => isEffectVisibleToViewer(eff, viewerSide, viewerCombatants, targetCombatant, allCombatants));
  if (visibleEffects.length === 0) return [];

  const groupsMap = new Map<string, {
    key: string;
    skillName: string;
    isDebuff: boolean;
    representativeEffect: ActiveEffect;
    subEffectsMap: Map<string, { effect: ActiveEffect; description: string; stacks: number }>;
  }>();

  for (const eff of visibleEffects) {
    const isDebuff = isDebuffEffect(eff);
    const skillBaseName = getSkillBaseName(eff);
    const singleDesc = getSingleEffectDescription(eff);

    let groupKey: string;
    if (isDebuff) {
      // Group ALL debuffs from the same skill under ONE group key
      groupKey = `DEBUFF_${skillBaseName}_${eff.icon || ''}`;
    } else {
      // Group ALL buffs from the same skill under ONE group key
      groupKey = `BUFF_${skillBaseName}_${eff.icon || ''}`;
    }

    let group = groupsMap.get(groupKey);
    if (!group) {
      group = {
        key: groupKey,
        skillName: skillBaseName || eff.name,
        isDebuff,
        representativeEffect: eff,
        subEffectsMap: new Map(),
      };
      groupsMap.set(groupKey, group);
    }

    if (eff.duration > group.representativeEffect.duration) {
      group.representativeEffect = eff;
    }

    const subKey = `${eff.type}_${eff.name}`;
    const existingSub = group.subEffectsMap.get(subKey);
    const effStacks = (eff as any).stacks || (eff.reflectCharges && eff.reflectCharges > 1 ? eff.reflectCharges : 1);

    if (existingSub) {
      existingSub.stacks += effStacks;
      if (eff.duration > existingSub.effect.duration) {
        existingSub.effect = eff;
        existingSub.description = singleDesc;
      }
    } else {
      group.subEffectsMap.set(subKey, {
        effect: eff,
        description: singleDesc,
        stacks: effStacks,
      });
    }
  }

  return Array.from(groupsMap.values()).map(group => {
    const subEffects = Array.from(group.subEffectsMap.values());
    const maxSubStacks = Math.max(...subEffects.map(s => s.stacks));

    let combinedDescription = '';
    if (subEffects.length === 1) {
      combinedDescription = subEffects[0].description;
    } else {
      combinedDescription = subEffects.map(s => `• ${s.description}`).join('\n');
    }

    return {
      effect: group.representativeEffect,
      stacks: maxSubStacks,
      description: combinedDescription,
      skillName: group.skillName,
      isDebuff: group.isDebuff,
      subEffects,
    };
  });
}

interface GameOverOverlayProps {
  gameOver: 'victory' | 'defeat';
  playerCombatants: CombatCharacter[];
  enemyCombatants: CombatCharacter[];
  handleQuit: () => void;
  user: UserProfile;
  turn: number;
  matchStats?: { damageDealt: number };
}

function GameOverOverlay({
  gameOver,
  playerCombatants,
  enemyCombatants,
  handleQuit,
  user,
  turn,
  matchStats,
}: GameOverOverlayProps) {
  const { t } = useLanguage();
  const isVictory = gameOver === 'victory';
  const showcaseTeam = isVictory ? playerCombatants : enemyCombatants;

  const alivePlayerCount = playerCombatants.filter((p) => !p.isDead).length;
  const damageDealt = matchStats?.damageDealt || 0;

  const gainedXp = calculateBattleXp(isVictory, turn, alivePlayerCount, damageDealt);
  const ranks = getRanks();
  const oldXp = Math.max(0, user?.xp || 0);
  const newXp = Math.max(0, oldXp + gainedXp);
  const actualXpChange = newXp - oldXp;

  const oldRankProgress = getRankProgress(oldXp, ranks);
  const newRankProgress = getRankProgress(newXp, ranks);
  const rankChangeInfo = checkRankChange(oldXp, newXp, ranks);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 select-none ${
        isVictory
          ? 'bg-slate-950/95 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-950/40 via-slate-950 to-slate-950'
          : 'bg-slate-950/95 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-950/40 via-slate-950 to-slate-950'
      }`}
    >
      {/* Lightweight Main Modal Content */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="relative z-20 w-full max-w-3xl flex flex-col items-center justify-between text-center gap-4 sm:gap-6"
      >
        {/* Top Victory/Defeat Banner Badge */}
        <div className="flex flex-col items-center justify-center relative">
          <div className="relative flex items-center justify-center gap-3 px-6 sm:px-10 py-2.5 sm:py-3 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
            {isVictory ? (
              <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-amber-400" />
            ) : (
              <Swords className="w-8 h-8 sm:w-10 sm:h-10 text-red-500" />
            )}

            <h1
              className={`text-2xl sm:text-4xl font-black uppercase tracking-tight font-display ${
                isVictory
                  ? 'bg-gradient-to-r from-amber-300 via-yellow-200 to-emerald-400 bg-clip-text text-transparent'
                  : 'bg-gradient-to-r from-red-500 via-rose-400 to-red-600 bg-clip-text text-transparent'
              }`}
            >
              {isVictory ? 'VITÓRIA!' : 'DERROTA!'}
            </h1>
          </div>

          <p className="mt-2 text-xs sm:text-sm font-mono uppercase tracking-widest text-slate-300 font-bold bg-slate-900/90 px-4 py-1 rounded-full border border-slate-800">
            {isVictory ? 'Esquadrão Conquistou a Supremacia' : 'Esquadrão Foi Superado'} • Turno {turn}
          </p>
        </div>

        {/* XP REWARD & RANK PROGRESS CARD */}
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 sm:p-4 text-center shadow-xl backdrop-blur-sm space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-black uppercase text-amber-400">
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
              <span>Experiência da Batalha</span>
            </div>
            {actualXpChange >= 0 ? (
              <span className="text-xs font-black font-mono text-emerald-400 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-500/40 shadow">
                +{actualXpChange} XP
              </span>
            ) : (
              <span className="text-xs font-black font-mono text-rose-400 bg-rose-950/80 px-2.5 py-0.5 rounded-full border border-rose-500/40 shadow">
                {actualXpChange} XP
              </span>
            )}
          </div>

          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span>Seu Posto:</span>
            <span
              className={`px-2.5 py-0.5 rounded-lg bg-gradient-to-r font-extrabold text-[11px] uppercase tracking-wider shadow ${newRankProgress.currentRank.color}`}
              style={{ color: '#ffffff' }}
            >
              {newRankProgress.currentRank.name}
            </span>
          </div>

          <div className="space-y-1">
            <div className="relative w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <motion.div
                initial={{ width: `${oldRankProgress.progressPercent}%` }}
                animate={{ width: `${newRankProgress.progressPercent}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-400 shadow-[0_0_12px_rgba(251,191,36,0.5)]"
              />
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              {newRankProgress.isMaxRank ? (
                <span className="text-amber-300 font-bold w-full text-center">
                  🏆 Posto Máximo Alcançado! ({newXp.toLocaleString()} XP)
                </span>
              ) : (
                <>
                  <span>{newRankProgress.currentXp.toLocaleString()} XP</span>
                  <span>
                    Próximo: {newRankProgress.nextRank?.requiredXp.toLocaleString()} XP ({newRankProgress.nextRank?.name})
                  </span>
                </>
              )}
            </div>
          </div>

          {rankChangeInfo.rankedUp && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [0.9, 1.05, 1], opacity: 1 }}
              transition={{ duration: 0.5, type: 'spring' }}
              className="bg-gradient-to-r from-amber-500/20 via-yellow-500/30 to-amber-500/20 border border-amber-400/60 p-2 rounded-xl text-center space-y-0.5 shadow-[0_0_20px_rgba(245,158,11,0.3)]"
            >
              <div className="text-xs font-black text-amber-300 uppercase tracking-wide flex items-center justify-center gap-1">
                <Trophy className="w-4 h-4 text-yellow-300 animate-bounce" />
                <span>SUBIU DE RANK!</span>
              </div>
              <p className="text-[11px] font-bold text-white">
                Parabéns! Você alcançou o posto de{' '}
                <span className="text-amber-300 underline font-extrabold">{newRankProgress.currentRank.name}</span>!
              </p>
            </motion.div>
          )}

          {rankChangeInfo.rankedDown && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [0.9, 1.05, 1], opacity: 1 }}
              transition={{ duration: 0.5, type: 'spring' }}
              className="bg-gradient-to-r from-red-500/20 via-rose-500/30 to-red-500/20 border border-red-400/60 p-2 rounded-xl text-center space-y-0.5 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
            >
              <div className="text-xs font-black text-rose-300 uppercase tracking-wide flex items-center justify-center gap-1">
                <ShieldAlert className="w-4 h-4 text-rose-400 animate-bounce" />
                <span>DESCEU DE RANK!</span>
              </div>
              <p className="text-[11px] font-bold text-white">
                A perda de XP rebaixou seu posto para{' '}
                <span className="text-rose-300 underline font-extrabold">{newRankProgress.currentRank.name}</span>.
              </p>
            </motion.div>
          )}
        </div>

        {/* Center Stage: Character Lineup */}
        <div className="w-full my-1 sm:my-2 flex items-center justify-center gap-3 sm:gap-5 flex-wrap min-h-[140px] sm:min-h-[180px]">
          {showcaseTeam.map((combatant) => {
            const rawSkin = combatant.character.selectedSkinUrl || combatant.character.skins?.[0]?.image;
            const portrait = combatant.character.portrait;
            const isPortrait = !!(
              rawSkin &&
              portrait &&
              (rawSkin.trim().toLowerCase() === portrait.trim().toLowerCase() ||
                rawSkin.toLowerCase().endsWith('/icon.jpg') ||
                rawSkin.toLowerCase().endsWith('/icon.png'))
            );
            const skinImg = rawSkin && !isPortrait ? rawSkin : null;

            return (
              <div
                key={combatant.id}
                className="relative group flex flex-col items-center"
              >
                {/* Character Box */}
                <div
                  className={`relative w-28 sm:w-34 h-38 sm:h-48 rounded-2xl overflow-hidden border flex flex-col items-center justify-between p-2 shadow-xl ${
                    isVictory
                      ? combatant.isDead
                        ? 'bg-slate-950 border-slate-800 opacity-60 grayscale'
                        : 'bg-slate-900 border-amber-500/50 shadow-amber-950/30'
                      : 'bg-slate-900 border-red-500/50 shadow-red-950/30'
                  }`}
                >
                  {/* Character Standing PNG or Portrait */}
                  <div className="w-full h-26 sm:h-34 relative flex items-center justify-center overflow-hidden">
                    {skinImg ? (
                      <img
                        src={skinImg || null}
                        alt={combatant.character.name}
                        referrerPolicy="no-referrer"
                        className={`h-full w-auto max-w-full object-contain ${
                          combatant.isDead ? 'grayscale opacity-50' : ''
                        }`}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full overflow-hidden border-2 border-amber-400/50 relative bg-slate-950">
                        <img
                          src={portrait || null}
                          alt={combatant.character.name}
                          className={`w-full h-full object-cover ${combatant.isDead ? 'grayscale opacity-50' : ''}`}
                        />
                      </div>
                    )}
                  </div>

                  {/* Character Name & Status Badge */}
                  <div className="w-full text-center z-10 bg-slate-950/90 px-1.5 py-1 rounded-xl border border-slate-800">
                    <p className="text-[10px] sm:text-xs font-extrabold text-white truncate font-display">
                      {combatant.character.name}
                    </p>
                    <div className="flex items-center justify-center gap-1 mt-0.5">
                      {combatant.isDead ? (
                        <span className="text-[9px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.2 rounded border border-slate-700">
                          CAÍDO
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono font-bold text-amber-300 bg-amber-950/80 px-1.5 py-0.2 rounded border border-amber-500/40">
                          SOBREVIVENTE
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Scroll Banner Text & Action Button Card */}
        <div className="relative max-w-md sm:max-w-lg w-full min-h-[160px] p-5 sm:p-6 flex flex-col items-center justify-between text-center gap-3">
          {/* Background Pergaminho Image */}
          <img
            src="/static/img/ui/pergaminho.webp"
            alt="Pergaminho Shinobi"
            className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none"
          />

          <div className="relative z-10 px-4 pt-1 space-y-1">
            <p className="text-xs sm:text-sm text-stone-900 font-extrabold leading-relaxed">
              {isVictory
                ? 'Parabéns! Você executou sua tática com maestria, subjugou as forças inimigas e conquistou a vitória no campo de batalha!'
                : 'Seu esquadrão combateu bravamente, mas foi superado pelas táticas adversárias. Reorganize seus jutsus para a desforra!'}
            </p>
          </div>

          <div className="relative z-10 w-full px-4 pb-1">
            <button
              onClick={handleQuit}
              className={`w-full py-3 px-6 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2 shadow-lg border ${
                isVictory
                  ? 'bg-gradient-to-r from-amber-700 via-amber-800 to-yellow-900 hover:from-amber-600 hover:to-yellow-800 text-amber-100 border-amber-600/70'
                  : 'bg-gradient-to-r from-red-800 via-rose-900 to-red-950 hover:from-red-700 hover:to-rose-800 text-amber-100 border-red-600/70'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>{t("Voltar ao Menu", "Back to Selection")}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
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
  activeQuest,
}: BattleBoardProps) {
  const { t, language } = useLanguage();

  const ranksList = useMemo(() => getRanks(), []);
  const playerXp = user?.xp || 0;
  const playerRankProgress = useMemo(() => getRankProgress(playerXp, ranksList), [playerXp, ranksList]);
  const playerCurrentRank = playerRankProgress.currentRank;

  const opponentXp = onlineParams?.isOnline ? (onlineParams.opponentProfile?.xp || 0) : 0;
  const opponentRankProgress = useMemo(() => getRankProgress(opponentXp, ranksList), [opponentXp, ranksList]);
  const opponentCurrentRank = opponentRankProgress.currentRank;

  // In-Game Quest Modal States
  const [isQuestModalOpen, setIsQuestModalOpen] = useState(false);
  const [allQuests, setAllQuests] = useState<Quest[]>([]);
  const [loadingQuests, setLoadingQuests] = useState(false);
  const [expandedGoals, setExpandedGoals] = useState<Record<string, boolean>>({});

  const skillOwnerMap = useMemo(() => {
    const map = new Map<string, string>();
    const allChars = getCharacters();
    allChars.forEach(c => {
      c.skills.forEach(sk => {
        if (!map.has(sk.name)) {
          map.set(sk.name, c.name);
        }
      });
    });
    return map;
  }, []);

  useEffect(() => {
    if (isQuestModalOpen) {
      const fetchQuests = async () => {
        try {
          setLoadingQuests(true);
          const data = await safeFetchJson<{ success?: boolean; quests?: Quest[] }>('/api/quests');
          if (data && data.success && Array.isArray(data.quests)) {
            const userCompletedIds = user?.completedQuestIds || [];
            const synced = data.quests.map((q: Quest) => ({
              ...q,
              completed: userCompletedIds.includes(q.id) || q.completed
            }));
            setAllQuests(synced);
          }
        } catch (err) {
          console.error('Error fetching quests in battle:', err);
        } finally {
          setLoadingQuests(false);
        }
      };
      fetchQuests();
    }
  }, [isQuestModalOpen, user?.completedQuestIds]);
  // Stats tracking for Quests
  const matchStatsRef = useRef({
    damageDealt: 0,
    damageReceived: 0,
    healingDone: 0,
    shieldGenerated: 0,
    stunsApplied: 0,
    countersReflects: 0,
    chakraGenerated: 0,
    chakraStolen: 0,
    skillsUsed: {} as { [skillName: string]: number },
    killsWithSkill: {} as { [skillName: string]: number },
    playerCharactersUsed: playerTeam.map(c => c.name),
    playerTeamCharacters: playerTeam,
    damageDealtRecords: [] as Array<{ charName: string; tags: string[]; skillName: string; amount: number }>,
    damageReceivedRecords: [] as Array<{ charName: string; tags: string[]; amount: number }>,
    healingDoneRecords: [] as Array<{ charName: string; tags: string[]; skillName: string; amount: number }>,
    shieldGeneratedRecords: [] as Array<{ charName: string; tags: string[]; skillName: string; amount: number }>,
    killRecords: [] as Array<{ charName: string; tags: string[]; skillName: string }>,
    counterRecords: [] as Array<{ charName: string; tags: string[]; skillName: string }>,
    skillUseRecords: [] as Array<{ charName: string; tags: string[]; skillName: string }>,
  });

  const handleQuit = async () => {
    console.log('handleQuit gameOver:', gameOver, 'has onBattleEnd:', !!onBattleEnd, 'playerChars:', matchStatsRef.current.playerCharactersUsed);
    if (gameOver && onBattleEnd) {
      const isVictory = gameOver === 'victory';
      const alivePlayerCount = playerCombatants.filter((p) => !p.isDead).length;
      const damageDealt = matchStatsRef.current.damageDealt || 0;
      const gainedXp = calculateBattleXp(isVictory, turn, alivePlayerCount, damageDealt);

      await onBattleEnd(isVictory, { ...matchStatsRef.current, turn, alivePlayerCount }, gainedXp);
    }
    onQuit();
  };

  // Turn count
  const [turn, setTurn] = useState(1);

  // Profile Card Modal Viewer State
  const [viewingProfile, setViewingProfile] = useState<{ profile: ProfileCardData; isSelf: boolean } | null>(null);

  // Combatants (with refs para acesso mutavel sem depender de re-render)
  const [playerCombatants, setPlayerCombatants] = useState<CombatCharacter[]>([]);
  const [enemyCombatants, setEnemyCombatants] = useState<CombatCharacter[]>([]);
  const playerRef = useRef<CombatCharacter[]>([]);
  const enemyRef = useRef<CombatCharacter[]>([]);

  useEffect(() => {
    if (playerCombatants.length > 0) playerRef.current = playerCombatants;
    if (enemyCombatants.length > 0) enemyRef.current = enemyCombatants;
  }, [playerCombatants, enemyCombatants]);
  // Track skills used per character per turn (for requirePreviousSkill)
  const currentTurnUsedSkills = useRef<Record<string, Set<string>>>({});
  const lastTurnUsedSkills = useRef<Record<string, Set<string>>>({});
  const currentSkillRef = useRef<Skill | null>(null);
  // Map<targetId, airBulletsIcon>
  const airBulletsHitTargets = useRef<Map<string, string>>(new Map());

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

  // Guard against rapid multi-click exploits on turn confirmation
  const [isEndingTurn, setIsEndingTurn] = useState(false);
  const isEndingTurnRef = useRef(false);
  const turnActionLockedRef = useRef(false);
  const processedOpponentTurnsRef = useRef<Set<number>>(new Set());

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
    combatant?: CombatCharacter;
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

function hydrateCombatants(combatants: CombatCharacter[]): CombatCharacter[] {
  if (!combatants || !Array.isArray(combatants)) return [];
  const allKnownChars = getCharacters();
  return combatants.map(c => {
    if (!c || !c.character) return c;
    const baseChar = allKnownChars.find(
      bc => (bc.id && bc.id === c.character.id) || (bc.name && bc.name.toLowerCase() === c.character.name?.toLowerCase())
    );

    if (!baseChar) return c;

    const fullSkills = (c.character.skills || []).map((s, idx) => {
      const baseSkill = baseChar.skills?.find(bs => bs.name === s.name) || baseChar.skills?.[idx];
      if (baseSkill) {
        return {
          ...baseSkill,
          ...s,
          desc: s.desc || baseSkill.desc,
          customEffects: (s.customEffects && s.customEffects.length > 0) ? s.customEffects : baseSkill.customEffects,
          classes: (s.classes && s.classes.length > 0) ? s.classes : baseSkill.classes,
          requireEffect: s.requireEffect || baseSkill.requireEffect,
          requirePreviousSkill: s.requirePreviousSkill || baseSkill.requirePreviousSkill,
          cannotBeCountered: s.cannotBeCountered !== undefined ? s.cannotBeCountered : baseSkill.cannotBeCountered,
          cannotBeReflected: s.cannotBeReflected !== undefined ? s.cannotBeReflected : baseSkill.cannotBeReflected,
          doNotApplyIfActive: s.doNotApplyIfActive !== undefined ? s.doNotApplyIfActive : baseSkill.doNotApplyIfActive,
        };
      }
      return s;
    });

    return {
      ...c,
      character: {
        ...baseChar,
        ...c.character,
        skills: fullSkills
      }
    };
  });
}

  // Initial setup on mount
  useEffect(() => {
    if (restoredState) {
      setTurn(restoredState.turn);
      const hydratedPlayer = hydrateCombatants(restoredState.playerCombatants);
      const hydratedEnemy = hydrateCombatants(restoredState.enemyCombatants);
      setPlayerCombatants(hydratedPlayer);
      setEnemyCombatants(hydratedEnemy);
      setPlayerChakra(restoredState.playerChakra);
      setEnemyChakra(restoredState.enemyChakra);
      setCuedActions([]);
      setSelectedSkill(null);
      setGameOver(null);

      if (hydratedPlayer.length > 0 && hydratedPlayer[0].character.skills.length > 0) {
        setInspectedSkill({
          skill: hydratedPlayer[0].character.skills[0],
          ownerName: hydratedPlayer[0].character.name,
          isEnemy: false,
          combatant: hydratedPlayer[0]
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

    let startingPlanner: 'player' | 'enemy' = Math.random() < 0.5 ? 'player' : 'enemy';
    if (onlineParams?.isOnline) {
      const myOnlineIndex = onlineParams.playerIndex === 2 ? 1 : 0;
      startingPlanner = myOnlineIndex === 0 ? 'player' : 'enemy';
    }
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
        combatant: pCombat[0]
      });
    }

    // Initial logs with random initiative
    const initialLogs: CombatLog[] = [
      { id: '1', turn: 1, message: '⚔️ BATALHA INICIADA! Esquadrão confirmado.', type: 'system' },
      { id: '2', turn: 1, message: startingPlanner === 'player'
          ? '🎲 [INICIATIVA] Você ganhou o sorteio e joga PRIMEIRO no Turno 1! (Inicia com 1 Chakra)'
          : '🎲 [INICIATIVA] O Oponente ganhou o sorteio e joga PRIMEIRO no Turno 1! (Você inicia com 3 Chakras)', type: 'system' },
      { id: '3', turn: 1, message: 'Gere seus chakras e escolha suas táticas!', type: 'system' },
    ];
    setLogs(initialLogs);

    // Play start audio depending on initiative
    if (startingPlanner === 'player') {
      playCustomSound('StartFirst');
    } else {
      playCustomSound('StartSecond');
    }

    // Trigger initial chakra generation for Turn 1:
    // The player who starts first receives 1 chakra; the second player receives 3 chakra.
    if (startingPlanner === 'player') {
      rollChakraForTurn(true, 1);
      rollChakraForTurn(false, 3);
    } else {
      rollChakraForTurn(true, 3);
      rollChakraForTurn(false, 1);
    }
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

  // Audio utility helper (tenta OGG, fallback MP3 com throttling contra sons duplos)
  const lastSoundTimeRef = useRef<{ [key: string]: number }>({});
  const playCustomSound = (soundName: string) => {
    if (isMuted) return;
    const now = Date.now();
    if (lastSoundTimeRef.current[soundName] && now - lastSoundTimeRef.current[soundName] < 150) {
      return;
    }
    lastSoundTimeRef.current[soundName] = now;

    const tryExt = (ext: string) => {
      try {
        const a = new Audio(`/static/audio/${soundName}.${ext}`);
        a.volume = 0.4;
        return a.play();
      } catch { return Promise.reject(); }
    };
    tryExt('ogg').catch(() => tryExt('mp3')).catch(() => {});
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
      const effectiveCost = getEffectiveSkillCost(skill, src, [...playerCombatants, ...enemyCombatants]);
      let randCost = 0;

      // Element specific costs first
      effectiveCost.forEach(cost => {
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
          message: `🌀 Jogador gerou (${count > 1 ? `${count} chakras` : '1 chakra'}): ${rolled.map(r => `[${r}]`).join(', ')}`,
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

  // Helper to check if a skill effect is already active on a character
  const isSkillActiveOnTarget = (targetChar: CombatCharacter, skillName: string): boolean => {
    if (!targetChar || !targetChar.activeEffects) return false;
    return targetChar.activeEffects.some(e =>
      e.sourceSkillName === skillName ||
      e.name === skillName ||
      e.name.startsWith(skillName) ||
      e.name.includes(`(${skillName})`) ||
      e.name.includes(`[${skillName}]`)
    );
  };

  // Validate chakra pool meets cost
  const canAffordSkill = (skill: Skill, pool: ChakraPool, sourceChar?: CombatCharacter, allCombatants?: CombatCharacter[]): boolean => {
    const effectiveCost = getEffectiveSkillCost(skill, sourceChar, allCombatants);
    if (skill.noChakraCost || effectiveCost.length === 0) return true;
    const tempPool = { ...pool };
    let randomCostCount = 0;

    // Deduct specific element costs first
    for (const cost of effectiveCost) {
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
  const deductChakraCost = (skill: Skill, isPlayer: boolean, sourceChar?: CombatCharacter, allCombatants?: CombatCharacter[]) => {
    const setChakra = isPlayer ? setPlayerChakra : setEnemyChakra;
    const effectiveCost = getEffectiveSkillCost(skill, sourceChar, allCombatants);

    setChakra(prev => {
      const pool = { ...prev };
      let randCost = 0;

      // Element specific costs
      effectiveCost.forEach(cost => {
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
    if (isEndingTurnRef.current || isEndingTurn || gameOver) return;
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
      combatant,
    });
    setCenterTab('inspector');

    if (combatant.isDead) return;
    if (isEndingTurnRef.current || isEndingTurn || turnActionLockedRef.current || isWaitingForOpponent) return;

    if (!isSandbox) {
      if (activePlanner === 'player' && isEnemyChar) return;
      if (activePlanner === 'enemy' && !isEnemyChar) return;
    }

    // Stun check
    if (isSkillBlockedByStun(skill, combatant.activeEffects)) {
      addFloatingText(charId, 'ATORDOADO!', 'stun');
      return;
    }

    if (skill.currentCooldown > 0) return;

    // Condition check (e.g. Rasengan requires Shadow Clones)
    if (skill.requireEffect) {
      const reqLower = skill.requireEffect.toLowerCase();
      const hasReq = combatant.activeEffects.some(e => e.name && (e.name.toLowerCase() === reqLower || e.name.toLowerCase().startsWith(reqLower) || e.name.toLowerCase().includes(reqLower)));
      if (!hasReq) {
        addFloatingText(charId, `Requer ${skill.requireEffect}!`, 'effect');
        return;
      }
    }

    // Previous skill check (requirePreviousSkill)
    if (skill.requirePreviousSkill) {
      const prevSkills = lastTurnUsedSkills.current[charId];
      const hasPrev = prevSkills && prevSkills.has(skill.requirePreviousSkill);
      if (!hasPrev) {
        addFloatingText(charId, `Requer ${skill.requirePreviousSkill} no turno anterior!`, 'effect');
        return;
      }
    }

    // HP threshold check (requireHpBelow)
    if (skill.requireHpBelow && skill.requireHpBelow > 0) {
      const hpThreshold = skill.requireHpBelow;
      if (combatant.health > hpThreshold) {
        addFloatingText(charId, `Requer HP ≤ ${hpThreshold}!`, 'effect');
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
    const allCombatantsList = [...playerCombatants, ...enemyCombatants];
    if (!canAffordSkill(skill, simulatedChakraAfterCancel, combatant, allCombatantsList)) {
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

  // Helper to resolve incoming cued actions targeting a combatant
  const getIncomingCuesForCombatant = (combatant: CombatCharacter) => {
    return cuedActions.filter(a => {
      const isSourceEnemy = a.sourceId.startsWith('enemy');
      const sourceList = isSourceEnemy ? enemyCombatants : playerCombatants;
      const targetList = isSourceEnemy ? playerCombatants : enemyCombatants;
      const sourceChar = sourceList.find(c => c.id === a.sourceId);
      if (!sourceChar) return false;

      const skill = sourceChar.character.skills[a.skillIndex];
      if (!skill) return false;

      const isTargetTeam = targetList.some(c => c.id === combatant.id);
      const isSourceTeam = sourceList.some(c => c.id === combatant.id);

      // Skill targeting ALL ENEMIES
      if (skill.targetType === 'AllEnemies') {
        if (isTargetTeam && !combatant.isDead) {
          const isInvulnerable = checkCombatantInvulnerable(combatant, skill);
          return !isInvulnerable || !!skill.ignoreInvulnerable;
        }
        return false;
      }

      // Skill targeting ALL ALLIES
      if (skill.targetType === 'AllAllies') {
        if (isSourceTeam && !combatant.isDead) {
          return true;
        }
        return false;
      }

      // Single target check
      if (a.targetId === combatant.id) {
        if (isTargetTeam && checkCombatantInvulnerable(combatant, skill) && !skill.ignoreInvulnerable) {
          return false;
        }
        return true;
      }

      return false;
    });
  };

  // Grid/character click targets selection
  const handleSelectTarget = (targetId: string, isEnemyTarget: boolean) => {
    if (isEndingTurnRef.current || isEndingTurn || turnActionLockedRef.current || isWaitingForOpponent || gameOver) return;
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
    if (skill.targetType === 'SelfAndAlly' && isEnemyTarget === expectedEnemyTarget) return;
    if (skill.targetType === 'AllEnemies' && isEnemyTarget !== expectedEnemyTarget) return;
    if (skill.targetType === 'AllAllies' && isEnemyTarget === expectedEnemyTarget) return;

    const targetList = isEnemyTarget ? enemyCombatants : playerCombatants;
    const targetChar = targetList.find(c => c.id === targetId);
    if (!targetChar || targetChar.isDead) return;

    // Check if skill is already active on target and skill prevents re-application
    if (skill.doNotApplyIfActive && isSkillActiveOnTarget(targetChar, skill.name)) {
      playCustomSound('Error');
      addFloatingText(targetId, 'EFEITO JÁ ATIVO NO ALVO!', 'stun');
      return;
    }

    // requireTargetEffect: skill can only be used on targets that have this effect active
    if (skill.requireTargetEffect) {
      const reqLower = skill.requireTargetEffect.toLowerCase();
      const targetHasEffect = targetChar.activeEffects.some(e => e.name && (e.name.toLowerCase() === reqLower || e.name.toLowerCase().startsWith(reqLower) || e.name.toLowerCase().includes(reqLower)));
      if (!targetHasEffect) {
        playCustomSound('Error');
        addFloatingText(targetId, `Requer ${skill.requireTargetEffect} ativo no alvo!`, 'effect');
        return;
      }
    }

    // Invisible & Invulnerable checks
    const isOppositeSide = isSourceEnemy ? !isEnemyTarget : isEnemyTarget;
    if (!isOppositeSide) {
      const isBlockedFromFriendly = targetChar.activeEffects.some(e => e.type === 'cannot_receive_friendly');
      if (isBlockedFromFriendly) {
        playCustomSound('Error');
        addFloatingText(targetId, 'IMPOSSIBILITADO DE RECEBER SKILLS AMIGÁVEIS!', 'stun');
        return;
      }
    } else {
      if (skill.targetType === 'AllEnemies') {
        // For AllEnemies, check if ALL living targets on that side are invulnerable
        const livingTargets = targetList.filter(c => !c.isDead);
        const allInvulnerable = livingTargets.length > 0 && livingTargets.every(c => checkCombatantInvulnerable(c, skill));
        if (allInvulnerable && !skill.ignoreInvulnerable) {
          playCustomSound('Error');
          addFloatingText(targetId, 'TODOS INIMIGOS INVULNERÁVEIS!', 'invulnerable');
          return;
        }
      } else {
        const isTargetInvisible = targetChar.activeEffects.some(e => e.type === 'invisible');
        if (isTargetInvisible) {
          playCustomSound('Error');
          addFloatingText(targetId, 'ALVO INVISÍVEL!', 'stun');
          return;
        }
        const isTargetInvulnerable = checkCombatantInvulnerable(targetChar, skill);
        if (isTargetInvulnerable && !skill.ignoreInvulnerable) {
          playCustomSound('Error');
          addFloatingText(targetId, 'ALVO INVULNERÁVEL!', 'invulnerable');
          return;
        }
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

    if (skill.targetType === 'AllEnemies') {
      const nonInvulTargets = targetList.filter(c => !c.isDead && (!checkCombatantInvulnerable(c, skill) || skill.ignoreInvulnerable));
      nonInvulTargets.forEach(t => {
        addFloatingText(t.id, 'Alvo Marcado!', 'effect');
      });
    } else {
      addFloatingText(targetId, 'Alvo Selecionado!', 'effect');
    }
  };

// Trade 4 chakras of choice for 1 chakra of choice
const handleTradeChakra = () => {
  const totalSelected = (Object.keys(tradeSelection) as (keyof ChakraPool)[])
    .reduce((sum, k) => sum + tradeSelection[k], 0);

  if (totalSelected !== 4 || !tradeTarget) return;

  const canAffordTrade = (Object.keys(tradeSelection) as (keyof ChakraPool)[]).every(
    k => playerChakra[k] >= tradeSelection[k]
  );
  if (!canAffordTrade) return;

  const currentSelection = { ...tradeSelection };
  const currentTarget = tradeTarget;

  setTradeSelection({ Tai: 0, Nin: 0, Gen: 0, Blood: 0 });
  setTradeTarget(null);
  setShowChakraTrade(false);

  setPlayerChakra(prev => {
    const updated = { ...prev };
    (Object.keys(currentSelection) as (keyof ChakraPool)[]).forEach(k => {
      updated[k] -= currentSelection[k];
    });
    updated[currentTarget] += 1;
    return updated;
  });

  setLogs(prev => [
    ...prev,
    {
      id: Math.random().toString(),
      turn,
      message: `🔄 Troca de Chakra: 4 chakras convertidos em 1 [${currentTarget}]!`,
      type: 'chakra',
    },
  ]);
};

  // Who is currently selecting their actions / whose planning turn it is
  const [activePlanner, setActivePlanner] = useState<'player' | 'enemy'>('player');
  const [isPreparing, setIsPreparing] = useState(false);
  const [passedPlayersThisTurn, setPassedPlayersThisTurn] = useState<('player' | 'enemy')[]>([]);

  const hasDamageImmunity = (character: CombatCharacter) =>
    character?.activeEffects?.some((e: ActiveEffect) => e.type === 'damage_immunity' || e.type === 'invulnerable') ?? false;

  const pushActiveEffect = (character: CombatCharacter, effect: ActiveEffect) => {
    // Check stackDurationRules for duration override (skip for stack damage DOT effects)
    if (!effect.stackable && currentSkillRef.current?.stackDurationRules && !effect.name?.includes('DOT)') && !effect.name?.includes('Imunidade a Dano')) {
      for (const rule of currentSkillRef.current.stackDurationRules) {
        const hasStack = character.activeEffects.some(
          e => e.stackType === rule.stackType && (e.stacks ?? 0) > 0
        );
        if (hasStack) {
          effect = { ...effect, duration: rule.durationOverride };
          break;
        }
      }
    }

    // Check if character is blocked from receiving friendly skills
    if (character.activeEffects.some(e => e.type === 'cannot_receive_friendly') && !isDebuffEffect(effect)) {
      addFloatingText(character.id, 'BLOQUEADO (SKILL AMIGÁVEL)', 'stun');
      return;
    }

    // Check if this effect is stackable
    const execSkill = currentSkillRef.current;
    const skill = character.character.skills.find(s => s.name === effect.name || effect.name.startsWith(s.name));
    const isStackable = effect.stackable ?? execSkill?.stackable ?? skill?.stackable ?? false;
    const stackType = effect.stackType ?? execSkill?.stackType ?? skill?.stackType;
    const skillInvisible = execSkill?.invisible || (execSkill?.invisibleDuration !== undefined && execSkill?.invisibleDuration > 0);
    const sourceName = effect.sourceSkillName || execSkill?.name || skill?.name || effect.name;
    const effectiveStackType = stackType || (isStackable ? sourceName : undefined);

    if (isStackable || effectiveStackType || effect.type === 'retaliate_damage') {
      const existing = character.activeEffects.find(
        e => (effectiveStackType && e.stackType === effectiveStackType) ||
             (effectiveStackType && e.sourceSkillName === sourceName) ||
             (e.type === effect.type && (e.sourceSkillName === sourceName || e.name === effect.name))
      );
      if (existing) {
        existing.stacks = (existing.stacks || 1) + 1;
        existing.duration = Math.max(existing.duration, effect.duration);
        if (effectiveStackType && !existing.stackType) existing.stackType = effectiveStackType;
        return;
      }
    }

    character.activeEffects.push({
      ...effect,
      stacks: effect.stacks ?? 1,
      stackable: isStackable,
      stackType: effectiveStackType,
      icon: effect.icon || execSkill?.icon || skill?.icon,
      sourceSkillName: sourceName,
      isInvisible: effect.isInvisible !== undefined ? effect.isInvisible : (skillInvisible || effect.type === 'invisible'),
      casterSide: effect.casterSide || (effect.casterId ? (effect.casterId.startsWith('player') ? 'player' : 'enemy') : (character.id.startsWith('player') ? 'player' : 'enemy')),
      castTurn: effect.castTurn ?? turn,
    });
  };

  // Helper for drain, steal, or remove chakra actions safely
  const performChakraAction = (
    victimIsPlayer: boolean,
    amount: number,
    sourceName: string,
    targetName: string,
    skillName: string,
    isPlayerAction: boolean,
    actionType: 'drain' | 'steal' | 'remove',
    sourceId: string,
    targetId: string,
    logsList: CombatLog[],
    playerPool?: ChakraPool,
    enemyPool?: ChakraPool
  ) => {
    const currentVictimPool = victimIsPlayer ? (playerPool || playerChakra) : (enemyPool || enemyChakra);
    const currentThiefPool = victimIsPlayer ? (enemyPool || enemyChakra) : (playerPool || playerChakra);

    const affectedTypes: (keyof ChakraPool)[] = [];

    for (let i = 0; i < amount; i++) {
      const nonZero = (Object.keys(currentVictimPool) as (keyof ChakraPool)[]).filter(k => currentVictimPool[k] > 0);
      if (nonZero.length > 0) {
        const randType = nonZero[Math.floor(Math.random() * nonZero.length)];
        currentVictimPool[randType]--;
        affectedTypes.push(randType);
      }
    }

    // For steal/drain, if victim didn't have enough chakra to lose, thief still gains stolen random chakra
    const stolenGainedTypes: (keyof ChakraPool)[] = [...affectedTypes];
    if (actionType !== 'remove' && stolenGainedTypes.length < amount) {
      const missing = amount - stolenGainedTypes.length;
      const allTypes: (keyof ChakraPool)[] = ['Tai', 'Nin', 'Gen', 'Blood'];
      for (let i = 0; i < missing; i++) {
        const randType = allTypes[Math.floor(Math.random() * allTypes.length)];
        stolenGainedTypes.push(randType);
      }
    }

    if (affectedTypes.length > 0 || (actionType !== 'remove' && stolenGainedTypes.length > 0)) {
      if (actionType !== 'remove') {
        stolenGainedTypes.forEach(k => {
          currentThiefPool[k] = (currentThiefPool[k] || 0) + 1;
        });
      }

      if (!playerPool && !enemyPool) {
        const victimSetter = victimIsPlayer ? setPlayerChakra : setEnemyChakra;
        const thiefSetter = victimIsPlayer ? setEnemyChakra : setPlayerChakra;
        victimSetter({ ...currentVictimPool });
        if (actionType !== 'remove') {
          thiefSetter({ ...currentThiefPool });
        }
      }

      const affectedStr = affectedTypes.map(k => getChakraName(k)).join(', ');
      const gainedStr = stolenGainedTypes.map(k => getChakraName(k)).join(', ');

      if (actionType === 'remove') {
        logsList.push({
          id: Math.random().toString(),
          turn,
          message: `🔥 [${skillName}] de ${sourceName} REMOVEU ${affectedTypes.length} chakra (${affectedStr}) do estoque de chakra de ${victimIsPlayer ? 'seu time' : 'oponente'}!`,
          type: 'chakra',
        });
        addFloatingText(targetId, `-${affectedTypes.length} CHAKRA REMOVIDO`, 'effect');
        if (victimIsPlayer) {
          triggerChakraToast(`🔥 ${sourceName} removeu ${affectedTypes.length} chakra (${affectedStr}) do estoque do seu time!`, 'lost');
        } else {
          triggerChakraToast(`🔥 CHAKRA REMOVIDO: ${sourceName} removeu ${affectedTypes.length} chakra (${affectedStr}) do estoque do oponente!`, 'removed');
        }
      } else {
        if (isPlayerAction && !victimIsPlayer) {
          matchStatsRef.current.chakraStolen += stolenGainedTypes.length;
          matchStatsRef.current.chakraGenerated += stolenGainedTypes.length;
        }
        const victimNote = affectedTypes.length > 0 ? `(${affectedStr})` : `(oponente sem chakra no estoque)`;
        logsList.push({
          id: Math.random().toString(),
          turn,
          message: `🌀 [${skillName}] de ${sourceName} ${actionType === 'drain' ? 'drenou' : 'roubou'} ${stolenGainedTypes.length} chakra (${gainedStr}) para a sua equipe! ${victimNote}`,
          type: 'chakra',
        });
        addFloatingText(sourceId, `+${stolenGainedTypes.length} CHAKRA ROUBADO`, 'effect');
        if (affectedTypes.length > 0) {
          addFloatingText(targetId, `-${affectedTypes.length} CHAKRA ${actionType === 'drain' ? 'DRENADO' : 'ROUBADO'}`, 'effect');
        }
        if (victimIsPlayer) {
          triggerChakraToast(`⚠️ ${sourceName} roubou ${stolenGainedTypes.length} chakra (${gainedStr}) do estoque!`, 'lost');
        } else {
          triggerChakraToast(`⚡ ROUBO CONFIRMADO: ${sourceName} roubou ${stolenGainedTypes.length} chakra (${gainedStr}) para seu time!`, 'stolen');
        }
      }
    } else {
      logsList.push({
        id: Math.random().toString(),
        turn,
        message: `🌀 [${skillName}] de ${sourceName} tentou remover chakra, mas o ${victimIsPlayer ? 'seu time' : 'oponente'} não tinha chakra no estoque!`,
        type: 'chakra',
      });
      if (!victimIsPlayer) {
        triggerChakraToast(`ℹ️ [${skillName}] tentou remover chakra, mas o oponente estava sem chakra no estoque!`, 'info');
      } else {
        triggerChakraToast(`ℹ️ [${skillName}] tentou remover chakra, mas seu time estava sem chakra no estoque!`, 'info');
      }
    }
  };

  // Returns the combatants whose stacks should be counted for a stack-damage rule
  const getStackPoolForRule = (
    rule: { stackType?: string; stackSource?: string },
    target: CombatCharacter,
    source: CombatCharacter,
    sourceList: CombatCharacter[],
    targetList: CombatCharacter[]
  ): CombatCharacter[] => {
    const stackSrc = rule.stackSource || 'target';
    if (stackSrc === 'self') return [source];
    if (stackSrc === 'enemies') return targetList.filter(c => !c.isDead);
    if (stackSrc === 'allies') return sourceList.filter(c => !c.isDead);
    if (stackSrc === 'all') return [...sourceList, ...targetList].filter(c => !c.isDead);
    return [target];
  };

  // Sums stacks of a given type across a pool of combatants
  const countStacksInPool = (pool: CombatCharacter[], stackType: string): number => {
    return pool.reduce((acc, c) => {
      const eff = c.activeEffects.find(e => e.stackType === stackType);
      return acc + (eff?.stacks || 0);
    }, 0);
  };

  // Origami Lotus rule (Young Konan only): quando um aliado/personagem com Origami Lotus é curado,
  // a conjuradora (Young Konan) ganha +1 stack de "Paper Gathering".
  const checkAndGrantOrigamiLotusGathering = (
    target: CombatCharacter,
    healedAmount: number,
    logArr: CombatLog[],
    allCombatantsList: CombatCharacter[]
  ) => {
    if (healedAmount <= 0 || target.isDead) return;
    const lotusEffect = target.activeEffects.find(e =>
      e.sourceSkillName === 'Origami Lotus' ||
      (e.name && e.name.toLowerCase().includes('origami lotus'))
    );
    if (!lotusEffect) return;

    const caster = (lotusEffect.casterId ? allCombatantsList.find(c => c.id === lotusEffect.casterId) : null) ||
      allCombatantsList.find(c => (c.character.name === 'Young Konan' || c.character.id === 'young-konan') && !c.isDead);

    if (caster && !caster.isDead && (caster.character.name === 'Young Konan' || caster.character.id === 'young-konan')) {
      const existingPg = caster.activeEffects.find(e =>
        e.stackType === 'Paper Gathering' ||
        e.sourceSkillName === 'Paper Gathering' ||
        (e.name && e.name.toLowerCase().includes('paper gathering'))
      );
      if (existingPg) {
        existingPg.stacks = (existingPg.stacks || 1) + 1;
      } else {
        const pgSkill = caster.character.skills.find(s => s.name === 'Paper Gathering');
        pushActiveEffect(caster, {
          name: 'Paper Gathering Retaliação',
          type: 'retaliate_damage',
          value: 5,
          retaliateDamageVal: 5,
          retaliateDamageType: 'direct_damage',
          duration: 999,
          stackable: true,
          stackType: 'Paper Gathering',
          sourceSkillName: 'Paper Gathering',
          casterId: caster.id,
          casterSide: caster.id.startsWith('player') ? 'player' : 'enemy',
          icon: pgSkill?.icon,
        });
      }
      logArr.push({
        id: Math.random().toString(),
        turn,
        message: `🌺 [Origami Lotus] ${target.character.name} foi curado e concedeu +1 stack de [Paper Gathering] a ${caster.character.name}!`,
        type: 'buff',
      });
      addFloatingText(caster.id, '+1 PAPER GATHERING', 'effect');
    }
  };

  // Helper to execute actions for a single side (Player or Enemy) immediately
  const executeSideActions = (sideActions: CuedAction[], isPlayerSide: boolean, customRandAllocation?: ChakraPool): boolean => {
    const newLogs: CombatLog[] = [];
    const srcPlayer = playerRef.current.length ? playerRef.current : playerCombatants;
    const srcEnemy = enemyRef.current.length ? enemyRef.current : enemyCombatants;
    const updatedPlayer = srcPlayer.map(c => ({ ...c, lastTurnStatus: null }));
    const updatedEnemy = srcEnemy.map(c => ({ ...c, lastTurnStatus: null }));

    const localPlayerChakra = { ...playerChakra };
    const localEnemyChakra = { ...enemyChakra };

    // Deduct chakra cost permanently for sideActions
    const currentSideChakra = isPlayerSide ? localPlayerChakra : localEnemyChakra;
    sideActions.forEach(action => {
      const srcList = isPlayerSide ? updatedPlayer : updatedEnemy;
      const src = srcList.find(p => p.id === action.sourceId);
      if (!src) return;
      const skill = src.character.skills[action.skillIndex];
      const effectiveCost = getEffectiveSkillCost(skill, src, [...updatedPlayer, ...updatedEnemy]);
      effectiveCost.forEach(cost => {
        if (cost !== 'Rand') {
          const element = cost as keyof ChakraPool;
          if (currentSideChakra[element] > 0) currentSideChakra[element]--;
        }
      });
    });

    if (isPlayerSide && customRandAllocation) {
      (Object.keys(customRandAllocation) as (keyof ChakraPool)[]).forEach(k => {
        const deduct = customRandAllocation[k] || 0;
        currentSideChakra[k] = Math.max(0, currentSideChakra[k] - deduct);
      });
    } else {
      sideActions.forEach(action => {
        const srcList = isPlayerSide ? updatedPlayer : updatedEnemy;
        const src = srcList.find(p => p.id === action.sourceId);
        if (!src) return;
        const skill = src.character.skills[action.skillIndex];
        const effectiveCost = getEffectiveSkillCost(skill, src, [...updatedPlayer, ...updatedEnemy]);
        let randCost = effectiveCost.filter(c => c === 'Rand').length;
        for (let i = 0; i < randCost; i++) {
          const sorted = (Object.keys(currentSideChakra) as (keyof ChakraPool)[]).sort((a, b) => currentSideChakra[b] - currentSideChakra[a]);
          const highestElement = sorted[0];
          if (currentSideChakra[highestElement] > 0) currentSideChakra[highestElement]--;
        }
      });
    }

    const resolveEffectTargets = (
      targetOverride: string | undefined,
      defaultTarget: CombatCharacter,
      source: CombatCharacter,
      sourceList: CombatCharacter[],
      targetList: CombatCharacter[],
      isBeneficial: boolean = false
    ): CombatCharacter[] => {
      const skill = (source as any)?._executingSkill || source.character.skills[0];
      const isAllEnemies = targetOverride === 'AllEnemies' ||
                           ((!targetOverride || targetOverride === 'Target') && skill?.targetType === 'AllEnemies');

      if (isAllEnemies) {
        return targetList.filter(c => !c.isDead && (!checkCombatantInvulnerable(c, skill) || skill?.ignoreInvulnerable));
      }

      const isAllAllies = targetOverride === 'AllAllies' ||
                          ((!targetOverride || targetOverride === 'Target') && skill?.targetType === 'AllAllies');

      if (isAllAllies) {
        return sourceList.filter(c => !c.isDead);
      }

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
      if (targetOverride === 'SelfAndAlly') {
        if (sourceList.some(c => c.id === defaultTarget.id && c.id !== source.id)) {
          return Array.from(new Set([source, defaultTarget]));
        }
        const allies = sourceList.filter(c => c.id !== source.id && !c.isDead);
        return allies.length > 0 ? Array.from(new Set([source, allies[0]])) : [source];
      }
      if (targetOverride === 'Ally') {
        if (sourceList.some(c => c.id === defaultTarget.id)) return [defaultTarget];
        const allies = sourceList.filter(c => c.id !== source.id && !c.isDead);
        return allies.length > 0 ? [allies[0]] : [source];
      }
      if (targetOverride === 'AllAllies') return sourceList.filter(c => !c.isDead);
      if (targetOverride === 'AllEnemies') return targetList.filter(c => !c.isDead && (!checkCombatantInvulnerable(c, skill) || skill?.ignoreInvulnerable));
      if (targetOverride === 'AllLiving') return [...sourceList, ...targetList].filter(c => !c.isDead);
      if (targetOverride === 'AllNonInvulnerable') return [...sourceList, ...targetList].filter(c => !c.isDead && !checkCombatantInvulnerable(c, skill));
      if (targetOverride === 'AllInvulnerable') return [...sourceList, ...targetList].filter(c => !c.isDead && checkCombatantInvulnerable(c, skill));
      if (targetOverride === 'OneInvulnerable') {
        const invuls = [...sourceList, ...targetList].filter(c => !c.isDead && checkCombatantInvulnerable(c, skill));
        return invuls.length > 0 ? [invuls[0]] : [];
      }
      if (targetOverride === 'OneInvulnerableAlly') {
        const allies = sourceList.filter(c => !c.isDead && checkCombatantInvulnerable(c, skill));
        return allies.length > 0 ? [allies[0]] : [];
      }
      if (targetOverride === 'SelfAndAllEnemies') {
        return [source, ...targetList.filter(c => !c.isDead && (!checkCombatantInvulnerable(c, skill) || skill?.ignoreInvulnerable))];
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
      const allCombatants = [...updatedPlayer, ...updatedEnemy];

      const source = sourceList.find(c => c.id === action.sourceId);
      if (!source || source.isDead) return;

      const skill = source.character.skills[action.skillIndex];
      (source as any)._executingSkill = skill;
      currentSkillRef.current = skill;

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

      // Track skill usage for requirePreviousSkill
      if (!currentTurnUsedSkills.current[source.id]) currentTurnUsedSkills.current[source.id] = new Set();
      currentTurnUsedSkills.current[source.id].add(skill.name);

      // Find target combatant
      const defaultTarget = targetList.find(c => c.id === action.targetId) || sourceList.find(c => c.id === action.targetId) || source;

      // Young Nagato: Air Bullets track target
      if ((skill.name === 'Air Bullets' || skill.name.toLowerCase().includes('air bullets')) && defaultTarget && !defaultTarget.isDead) {
        airBulletsHitTargets.current.set(defaultTarget.id, skill.icon);
      }

      // Young Kakashi: Implanted Sharingan mark target
      if ((skill.name === 'Implanted Sharingan' || skill.name === 'Sharingan' || skill.name.toLowerCase().includes('sharingan')) && (source.character.folder === 'young-kakashi' || source.character.name.toLowerCase().includes('kakashi'))) {
        if (defaultTarget && !defaultTarget.isDead) {
          pushActiveEffect(defaultTarget, {
            name: 'Implanted Sharingan Target',
            type: 'custom',
            duration: 2,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
            castTurn: turn,
            icon: skill.icon,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `👁️ [Implanted Sharingan] de ${source.character.name}: ${defaultTarget.character.name} foi marcado pelo Sharingan por 2 turnos!`,
            type: 'buff',
          });
          addFloatingText(defaultTarget.id, 'MARCADO (SHARINGAN)', 'effect');
        }
      }

      // Young Kakashi: Implanted Sharingan reaction check when marked target uses a skill
      const sharinganTargetEffect = source.activeEffects.find(e => e.name === 'Implanted Sharingan Target' || e.name.includes('Sharingan Target') || e.name === 'Implanted Sharingan');
      if (sharinganTargetEffect) {
        const kakashiCaster = allCombatants.find(c => c.id === sharinganTargetEffect.casterId && !c.isDead);
        if (kakashiCaster) {
          const kakashiIsPlayerSide = updatedPlayer.some(p => p.id === kakashiCaster.id);

          // Rule 1: Stun skill -> Kakashi skills cause Stun Completo for 1 turn
          const isStunSkill = !!(
            (skill.stunTurns && skill.stunTurns > 0) ||
            (skill.stunType && skill.stunType.length > 0) ||
            skill.classes?.some((c: string) => c.toLowerCase().includes('stun')) ||
            skill.desc?.toLowerCase().includes('atordoa') ||
            skill.desc?.toLowerCase().includes('stun')
          );
          if (isStunSkill) {
            if (!kakashiCaster.activeEffects.some(e => e.name === 'Sharingan Stun Buff' && e.castTurn === turn)) {
              pushActiveEffect(kakashiCaster, {
                name: 'Sharingan Stun Buff',
                type: 'custom',
                duration: 1,
                castTurn: turn,
                icon: sharinganTargetEffect.icon || skill.icon,
                casterId: kakashiCaster.id,
                casterSide: kakashiIsPlayerSide ? 'player' : 'enemy',
              });
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `👁️ [Implanted Sharingan] de ${kakashiCaster.character.name}: Copiou o Stun de ${source.character.name}! Suas habilidades causarão Stun Completo por 1 turno!`,
                type: 'buff',
              });
              addFloatingText(kakashiCaster.id, 'BUFF: STUN COMPLETO', 'effect');
            }
          }

          // Rule 3: Damage skill -> Kakashi skills deal +10 damage for 1 turn
          const isDamageSkill = !!(
            (skill.damage && skill.damage > 0) ||
            (skill.directDamage && skill.directDamage > 0) ||
            (skill.dotVal && skill.dotVal > 0) ||
            (skill.bleedingVal && skill.bleedingVal > 0) ||
            (skill.afflictionVal && skill.afflictionVal > 0) ||
            skill.desc?.toLowerCase().includes('dano')
          );
          if (isDamageSkill) {
            if (!kakashiCaster.activeEffects.some(e => e.name === 'Sharingan Damage Buff' && e.castTurn === turn)) {
              pushActiveEffect(kakashiCaster, {
                name: 'Sharingan Damage Buff',
                type: 'damage_buff',
                value: 10,
                duration: 1,
                castTurn: turn,
                icon: sharinganTargetEffect.icon || skill.icon,
                casterId: kakashiCaster.id,
                casterSide: kakashiIsPlayerSide ? 'player' : 'enemy',
              });
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `👁️ [Implanted Sharingan] de ${kakashiCaster.character.name}: Analisou o dano de ${source.character.name}! Kakashi causará +10 de dano adicional por 1 turno!`,
                type: 'buff',
              });
              addFloatingText(kakashiCaster.id, '+10 DANO (SHARINGAN)', 'effect');
            }
          }
        }
      }

      // Do Not Apply If Active check
      if (skill.doNotApplyIfActive && isSkillActiveOnTarget(defaultTarget, skill.name)) {
        newLogs.push({
          id: Math.random().toString(),
          turn,
          message: `⚠️ [${skill.name}] de ${source.character.name} não foi aplicada em ${defaultTarget.character.name} pois a habilidade já está ativa no alvo.`,
          type: 'buff',
        });
        addFloatingText(defaultTarget.id, 'JÁ ATIVA NO ALVO!', 'effect');
        return;
      }

      const isOffensiveSkill = !!(
        (skill.damage && skill.damage > 0) ||
        (skill.directDamage && skill.directDamage > 0) ||
        (skill.drainChakra && skill.drainChakra > 0) ||
        (skill.stealChakra && skill.stealChakra > 0) ||
        (skill.removeChakra && skill.removeChakra > 0) ||
        (skill.stunTurns && skill.stunTurns > 0) ||
        (skill.dotVal && skill.dotVal > 0) ||
        (skill.bleedingVal && skill.bleedingVal > 0) ||
        (skill.afflictionVal && skill.afflictionVal > 0)
      );

      // Invulnerability check on target (logs notification, but does not abort non-damage effects like chakra steal)
      if (skill.targetType === 'AllEnemies') {
        const livingTargets = targetList.filter(c => !c.isDead);
        const allInvulnerable = livingTargets.length > 0 && livingTargets.every(c => checkCombatantInvulnerable(c, skill));
        if (allInvulnerable && !skill.ignoreInvulnerable) {
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🛡️ ${source.character.name} usou [${skill.name}], mas TODOS os inimigos estão INVULNERÁVEIS!`,
            type: 'buff',
          });
          addFloatingText(defaultTarget.id, 'TODOS INVULNERÁVEIS!', 'invulnerable');
        }
      } else {
        const isTargetInvulnerable = checkCombatantInvulnerable(defaultTarget, skill);
        if (isTargetInvulnerable && !skill.ignoreInvulnerable) {
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🛡️ ${source.character.name} usou [${skill.name}] em ${defaultTarget.character.name}, mas o alvo está INVULNERÁVEL!`,
            type: 'buff',
          });
          addFloatingText(defaultTarget.id, 'INVULNERÁVEL!', 'invulnerable');
        }
      }

      // Check Counter-Attack on target (only counter-attack cancels the skill)
      const counterEffect = defaultTarget.activeEffects.find(e => e.type === 'counter_attack' || (e.type === 'counter' && e.counterAttackType === 'defender'));
      if (counterEffect && isOffensiveSkill && !skill.cannotBeCountered) {
        newLogs.push({
          id: Math.random().toString(),
          turn,
          message: `🚫 ${defaultTarget.character.name} CONTRA-ATACOU e anulou [${skill.name}] de ${source.character.name}!`,
          type: 'system',
        });
        addFloatingText(defaultTarget.id, 'CONTRA-ATAQUE!', 'effect');
        addFloatingText(source.id, 'HABILIDADE ANULADA!', 'damage');
        defaultTarget.lastTurnStatus = 'CONTRA-ATAQUE';
        source.lastTurnStatus = 'ANULADO';
        counterEffect.duration = (counterEffect.duration || 1) - 1;
        if (counterEffect.duration <= 0) {
          defaultTarget.activeEffects = defaultTarget.activeEffects.filter(e => e !== counterEffect);
        }
        return; // Skill is cancelled due to counter-attack
      }

      // Check Reflect on target (reflects any offensive skill, including chakra steal/drain/removal)
      const reflectEffect = defaultTarget.activeEffects.find(e => e.type === 'reflect');
      let target = defaultTarget;
      let isReflected = false;

      if (reflectEffect && isOffensiveSkill && !skill.cannotBeReflected) {
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
          message: `🔄 [REFLECT] ${defaultTarget.character.name} REFLETIU a habilidade [${skill.name}] de volta para ${source.character.name}!`,
          type: 'buff',
        });
        addFloatingText(defaultTarget.id, 'REFLETIDO!', 'effect');
        addFloatingText(source.id, 'ALVO DE REFLECT!', 'damage');
      }

      // Skill parameters

      let baseDamage = skill.damage || 0;
      if (!skill.damage && !skill.directDamage) {
        const legacyDmg: Record<string, number> = {
          'Uzumaki Barrage': 20, 'Lions Barrage': 30, 'Chidori': 40, 'KO Punch': 20,
          'Lightning Blade': 40, 'Sand Coffin': 15, 'Sand Burial': 35, 'Shadow Strangle': 40,
          'Mind Destruction': 35, 'Amaterasu': 35, 'Blazing Arrow': 25, 'Curse Mark': 35,
          'Dark Void': 30, 'Dark Genjutsu': 25, 'Rasengan': 45, 'Ninja Hounds': 15,
          'Golpe Básico': 20, 'Golpe Rápido': 15, 'Golpe Sombrio': 25,
          'Golpe Sombrio (S)': 30, 'Ataque Sombrio': 25, 'Ataque Sombrio (S)': 30,
          'Golpe Feroz': 25, 'Golpe Preciso': 20, 'Rajada de Golpes': 30,
          'Golpe Sombrio Lendário': 40, 'Ataque Sombrio Lendário': 40,
          'Investida': 20, 'Corte Rápido': 25, 'Lâmina Sombria': 35,
          'Explosão de Chakra': 30, 'Esfera de Chakra': 35, 'Raio de Chakra': 40,
        };
        if (!baseDamage && skill.name) {
          if (legacyDmg[skill.name]) {
            baseDamage = legacyDmg[skill.name];
          } else {
            const match = Object.keys(legacyDmg).find(k => skill.name.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(skill.name.toLowerCase()));
            if (match) baseDamage = legacyDmg[match];
          }
        }
      }
      let directDamage = skill.directDamage || 0;

      // Process Damage Rules (Regras de Dano)
      let costRuleDamageBoost = 0;
      let ruleDirectDamage = 0;
      let ruleAfflictionDamage = 0;
      let ruleBleedingDamage = 0;
      let ruleDotDamage = 0;
      let hasActiveDamageRuleIgnoreBase = false;

      if (skill.damageRules && skill.damageRules.length > 0) {
        const allActiveEffects = allCombatants.flatMap(c => c.activeEffects);
        for (const rule of skill.damageRules) {
          if (rule.damageBoost > 0 && rule.activeSkillName) {
            const targetNameLower = rule.activeSkillName.trim().toLowerCase();
            const hasActive = allActiveEffects.some(e => {
              if (!e.name) return false;
              const eNameLower = e.name.toLowerCase();
              return eNameLower === targetNameLower || eNameLower.includes(targetNameLower) || targetNameLower.includes(eNameLower);
            });
            if (hasActive) {
              if (rule.ignoreBaseDamage !== false) {
                hasActiveDamageRuleIgnoreBase = true;
              }
              const dtype = rule.damageType || 'damage';
              if (dtype === 'direct_damage' || dtype === 'piercing') {
                ruleDirectDamage += rule.damageBoost;
              } else if (dtype === 'affliction') {
                ruleAfflictionDamage += rule.damageBoost;
              } else if (dtype === 'bleeding') {
                ruleBleedingDamage += rule.damageBoost;
              } else if (dtype === 'dot') {
                ruleDotDamage += rule.damageBoost;
              } else {
                costRuleDamageBoost += rule.damageBoost;
              }
            }
          }
        }
      }

      if (hasActiveDamageRuleIgnoreBase) {
        baseDamage = 0;
        directDamage = 0;
      }
      const dotInstant = skill.dotInstant || 0;
      const bleedingInstant = skill.bleedingInstant || 0;
      const afflictionInstant = skill.afflictionInstant || 0;
      // Apply missing HP damage for non-normal types
      let missingHpDirect = 0, missingHpDot = 0, missingHpBleed = 0, missingHpAffliction = 0;
      if (skill.missingHpDamageType) {
        const hpLoss = Math.max(0, source.maxHealth - source.health);
        if (skill.missingHpDamageType === 'normal') baseDamage += hpLoss;
        else if (skill.missingHpDamageType === 'direct') missingHpDirect = hpLoss;
        else if (skill.missingHpDamageType === 'dot') missingHpDot = hpLoss;
        else if (skill.missingHpDamageType === 'bleeding') missingHpBleed = hpLoss;
        else if (skill.missingHpDamageType === 'affliction') missingHpAffliction = hpLoss;
      }

      // Apply bonus damage per missing HP step rule (Regra de Dano por HP Perdido)
      if (skill.bonusDamagePerMissingHp && skill.bonusDamagePerMissingHp > 0) {
        const hpSubject = (skill.missingHpSource === 'target' && target) ? target : source;
        const missingHp = Math.max(0, hpSubject.maxHealth - hpSubject.health);
        const step = (skill.missingHpStep && skill.missingHpStep > 0) ? skill.missingHpStep : 20;
        const stepCount = Math.floor(missingHp / step);
        const bonusDmg = stepCount * skill.bonusDamagePerMissingHp;
        if (bonusDmg > 0) {
          const bType = skill.missingHpBonusType || 'damage';
          if (bType === 'direct') missingHpDirect += bonusDmg;
          else if (bType === 'dot') missingHpDot += bonusDmg;
          else if (bType === 'bleeding') missingHpBleed += bonusDmg;
          else if (bType === 'affliction') missingHpAffliction += bonusDmg;
          else baseDamage += bonusDmg;
        }
      }
      const healAmt = skill.heal || 0;
      let stunApplied = (skill.stunTurns && skill.stunTurns > 0) ? true : false;
      let stunDuration = skill.stunTurns || 1;
      let finalStunType: string[] | undefined = skill.stunType;
      if (stunApplied && (!finalStunType || finalStunType.length === 0)) {
        finalStunType = ['physical', 'mental', 'affliction', 'chakra'];
      }
      if (skill.name === 'Air Bullets' || skill.name.toLowerCase().includes('air bullets')) {
        stunApplied = true;
        stunDuration = 1;
        finalStunType = ['physical', 'mental', 'affliction', 'chakra'];
      }
      if (source.activeEffects.some(e => e.name === 'Sharingan Stun Buff')) {
        stunApplied = true;
        stunDuration = 1;
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

      const cleanseSpecificDebuffs = (t: CombatCharacter, debuffTypes: string[]) => {
        if (!debuffTypes || debuffTypes.length === 0) return;
        const beforeCount = t.activeEffects.length;
        const isAllDebuffs = debuffTypes.includes('all_debuffs') || debuffTypes.includes('debuff');

        t.activeEffects = t.activeEffects.filter(eff => {
          if (eff.irremovable) return true;

          if (isAllDebuffs) {
            const isDebuff = ['stun', 'dot', 'bleeding', 'affliction', 'paralyze_cooldown', 'damage', 'direct_damage', 'damage_debuff', 'cannot_reduce_damage', 'cannot_be_invulnerable', 'cannot_receive_friendly', 'on_skill_use_damage'].includes(eff.type);
            return !isDebuff;
          }

          if (debuffTypes.includes('affliction') && eff.type === 'affliction') return false;
          if (debuffTypes.includes('dot') && eff.type === 'dot') return false;
          if (debuffTypes.includes('bleeding') && eff.type === 'bleeding') return false;
          if (debuffTypes.includes('stun') && eff.type === 'stun') return false;
          if (debuffTypes.includes('paralyze_cooldown') && eff.type === 'paralyze_cooldown') return false;
          if (debuffTypes.includes('damage_debuff') && eff.type === 'damage_debuff') return false;
          if (debuffTypes.includes('cannot_reduce_damage') && eff.type === 'cannot_reduce_damage') return false;
          if (debuffTypes.includes('cannot_be_invulnerable') && eff.type === 'cannot_be_invulnerable') return false;
          if (debuffTypes.includes('cannot_receive_friendly') && eff.type === 'cannot_receive_friendly') return false;
          if (debuffTypes.includes('on_skill_use_damage') && eff.type === 'on_skill_use_damage') return false;

          return true;
        });

        const removedCount = beforeCount - t.activeEffects.length;
        if (removedCount > 0) {
          const typesName = isAllDebuffs ? 'Todos os Debuffs' : debuffTypes.map(d => {
            if (d === 'affliction') return 'Aflição';
            if (d === 'dot') return 'Dano por Turno';
            if (d === 'bleeding') return 'Sangramento';
            if (d === 'stun') return 'Atordoamento';
            if (d === 'paralyze_cooldown') return 'Paralisar Cooldown';
            if (d === 'damage_debuff') return 'Redução de Dano';
            if (d === 'cannot_reduce_damage') return 'Incapaz de Reduzir Dano';
            if (d === 'cannot_be_invulnerable') return 'Incapaz de Invulnerabilidade';
            if (d === 'cannot_receive_friendly') return 'Incapaz de Receber Efeitos Amigáveis';
            if (d === 'on_skill_use_damage') return 'Punição por Skill';
            return d;
          }).join(', ');

          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `✨ [PURIFICAÇÃO] ${t.character.name} teve ${removedCount} debuff(s) removido(s) (${typesName}) por [${skill.name}]!`,
            type: 'system',
          });
          addFloatingText(t.id, 'DEBUFFS REMOVIDOS', 'heal');
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
            const targetPool = isPlayerCombatant ? localPlayerChakra : localEnemyChakra;
            const types: (keyof ChakraPool)[] = ['Tai', 'Nin', 'Gen', 'Blood'];
            for (let i = 0; i < amt; i++) {
              const randType = types[Math.floor(Math.random() * types.length)];
              targetPool[randType] = (targetPool[randType] || 0) + 1;
            }
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

      // 0.2 DIRECT DAMAGE (with missing HP & rule direct damage)
      let stackDamageBonusForDd = 0;
      if (skill.selfStackDamageRules && skill.selfStackDamageRules.length > 0) {
        for (const selfRule of skill.selfStackDamageRules) {
          if (selfRule.stackType && selfRule.damagePerStack > 0) {
            const selfStackEffect = source.activeEffects.find(e => e.stackType === selfRule.stackType);
            const selfStackCount = selfStackEffect?.stacks || 0;
            if (selfStackCount > 0) {
              stackDamageBonusForDd += selfStackCount * selfRule.damagePerStack;
            }
          }
        }
      }
      if (skill.stackDamageRules && skill.stackDamageRules.length > 0) {
        for (const stackRule of skill.stackDamageRules) {
          if (stackRule.stackType && stackRule.damagePerStack > 0) {
            const stackPool = getStackPoolForRule(stackRule, target, source, sourceList, targetList);
            const stackCount = countStacksInPool(stackPool, stackRule.stackType);
            if (stackCount > 0 && !stackRule.duration) {
              stackDamageBonusForDd += stackCount * stackRule.damagePerStack;
            }
          }
        }
      }
      const sourceBuffsDd = source.activeEffects.filter(e => e.type === 'damage_buff');
      const damageBuffSumDd = sourceBuffsDd.reduce((acc, curr) => acc + (curr.value || 0), 0);
      let dd = directDamage + missingHpDirect + ruleDirectDamage + stackDamageBonusForDd + damageBuffSumDd;
      // Reduce by source's damage debuffs (qualquer tipo)
      const srcDdReduction = source.activeEffects
        .filter((e: ActiveEffect) => {
          if (e.type !== 'damage_debuff') return false;
          if ((e as any).excludeAffliction) {
            const isAffliction = skill.classes?.some((c: string) => {
              const lower = c.toLowerCase();
              return lower.includes('aflição') || lower.includes('affliction');
            });
            if (isAffliction) return false;
          }
          return true;
        })
        .reduce((a: number, e: ActiveEffect) => a + (e.value || 0), 0);
      dd = Math.max(0, dd - srcDdReduction);
      if (dd > 0) {
        const directTargets = resolveEffectTargets(skill.directDamageTarget || skill.damageTarget || 'Target', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        directTargets.forEach(t => {
          if (t.isDead) return;
          const startingHealth = t.health;
          const duration = skill.directDamageDuration || 1;
          if (duration > 1) {
            pushActiveEffect(t, {
              name: `${skill.name} (Dano Direto)`,
              type: 'direct_damage',
              value: dd,
              duration,
              icon: skill.icon,
              irremovable: !!skill.directDamageIrremovable,
              casterId: source.id,
              casterSide: action.isPlayer ? 'player' : 'enemy',
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🎯 ${t.character.name} recebeu [${skill.name}] de DANO DIRETO de ${dd} por turno por ${duration} turnos!`,
              type: 'damage',
            });
            addFloatingText(t.id, `DANO DIRETO (${duration}T)`, 'damage');
          } else {
            const targetCannotReduce = t.activeEffects.some((e: ActiveEffect) => e.type === 'cannot_reduce_damage');
            const targetReductions = targetCannotReduce ? [] : t.activeEffects.filter((e: ActiveEffect) => e.type === 'damage_reduction');
            const reductionSum = targetReductions.reduce((acc: number, curr: ActiveEffect) => acc + (curr.value || 0), 0);
            const netDd = hasDamageImmunity(t) ? 0 : Math.max(0, (dd + getCaptureArrestBonusDamage(t, skill)) - reductionSum);
            t.health = Math.max(0, t.health - netDd);
            const healthReduced = startingHealth - t.health;
            if (healthReduced > 0) {
              if (action.isPlayer) {
                matchStatsRef.current.damageDealt += healthReduced;
                matchStatsRef.current.damageDealtRecords.push({
                  charName: source.character.name,
                  tags: source.character.tags || [],
                  skillName: skill.name,
                  amount: healthReduced
                });
              } else {
                matchStatsRef.current.damageReceived += healthReduced;
                matchStatsRef.current.damageReceivedRecords.push({
                  charName: t.character.name,
                  tags: t.character.tags || [],
                  amount: healthReduced
                });
              }
            }
            if (t.health === 0 && startingHealth > 0 && action.isPlayer) {
              matchStatsRef.current.killsWithSkill[skill.name] = (matchStatsRef.current.killsWithSkill[skill.name] || 0) + 1;
              matchStatsRef.current.killRecords.push({
                charName: source.character.name,
                tags: source.character.tags || [],
                skillName: skill.name
              });
            }

            if (netDd > 0) {
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `🎯 [${skill.name}] de ${source.character.name} causou ${netDd} de DANO DIRETO em ${t.character.name} (perfurando defesas).${missingHpDirect > 0 ? ` (HP Perdido: ${missingHpDirect})` : ''}`,
                type: 'damage',
              });
              addFloatingText(t.id, `-${netDd} HP (DIRETO)`, 'damage');
            } else if (hasDamageImmunity(t) || checkCombatantInvulnerable(t, skill)) {
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `🛡️ ${t.character.name} é IMUNE A DANO e não sofreu Dano Direto de [${skill.name}].`,
                type: 'buff',
              });
              addFloatingText(t.id, 'IMUNE!', 'invulnerable');
            }
          }
          cleanseTargetEffects(t, skill.directDamageRemoveType);

          // Amateur Raikiri & White Light Blade custom target debuff, self buff & elimination buff
          if ((skill.name === 'Amateur Raikiri' || skill.name === 'Lightning Blade' || skill.name === 'White Light Blade' || skill.name.toLowerCase().includes('white light') || skill.name.toLowerCase().includes('raikiri')) && (source.character.folder === 'young-kakashi' || source.character.name.toLowerCase().includes('kakashi'))) {
            if (!source.activeEffects.some(e => (e.name === 'Amateur Raikiri (Buff +5 Dano)' || e.name === 'White Light Blade (Buff +5 Dano)' || e.name.includes('Buff +5 Dano')) && e.castTurn === turn)) {
              pushActiveEffect(source, {
                name: 'Amateur Raikiri (Buff +5 Dano)',
                type: 'damage_buff',
                value: 5,
                duration: 1,
                castTurn: turn,
                icon: skill.icon,
                casterId: source.id,
                casterSide: action.isPlayer ? 'player' : 'enemy',
                sourceSkillName: skill.name,
              });
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `⚡ [${skill.name}] de ${source.character.name}: Kakashi ganhou +5 de dano adicional para o seu próximo turno!`,
                type: 'buff',
              });
              addFloatingText(source.id, '+5 DANO (PRÓX TURNO)', 'effect');
            }

            pushActiveEffect(t, {
              name: 'Amateur Raikiri (Debuff -5 Dano)',
              type: 'damage_debuff',
              value: 5,
              duration: 1,
              castTurn: turn,
              excludeAffliction: true,
              icon: skill.icon,
              casterId: source.id,
              casterSide: action.isPlayer ? 'player' : 'enemy',
              sourceSkillName: skill.name,
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `⚡ [${skill.name}] de ${source.character.name}: Habilidades não-aflição de ${t.character.name} causarão -5 de dano por 1 turno!`,
              type: 'buff',
            });
            addFloatingText(t.id, '-5 DANO (NÃO-AFLIÇÃO)', 'damage');

            if (t.health === 0 && startingHealth > 0) {
              pushActiveEffect(source, {
                name: 'Amateur Raikiri (Mestria Permanente)',
                type: 'damage_buff',
                value: 5,
                duration: 99999,
                permanent: true,
                icon: skill.icon,
                casterId: source.id,
                casterSide: action.isPlayer ? 'player' : 'enemy',
                sourceSkillName: skill.name,
              });
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `⚡ [${skill.name}] de ${source.character.name} ELIMINOU ${t.character.name}! Kakashi ganhou +5 de dano PERMANENTEMENTE!`,
                type: 'buff',
              });
              addFloatingText(source.id, '+5 DANO PERM!', 'effect');
            }
          }

          // Air Bullets stun check for direct damage
          if ((skill.name === 'Air Bullets' || skill.name.toLowerCase().includes('air bullets') || airBulletsHitTargets.current.has(t.id))
            && !t.activeEffects.some((e: ActiveEffect) => e.name === 'Air Bullets Stun')) {
            pushActiveEffect(t, {
              name: 'Air Bullets Stun',
              type: 'stun',
              duration: 1,
              stunType: ['physical', 'mental', 'affliction', 'chakra'],
              icon: airBulletsHitTargets.current.get(t.id) || skill.icon,
              casterId: source.id,
              casterSide: action.isPlayer ? 'player' : 'enemy',
              castTurn: turn,
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `⚡ ${t.character.name} foi ATORDOADO por [Air Bullets]!`,
              type: 'stun',
            });
            addFloatingText(t.id, 'ATORDOADO (Air Bullets)', 'stun');
          }
        });
      }

      // INSTANT DOT / BLEEDING / AFFLICTION (with missing HP)
      const isTargetInvul1 = (checkCombatantInvulnerable(target, skill) && !skill.ignoreInvulnerable) || hasDamageImmunity(target);
      const totalDotInstant = isTargetInvul1 ? 0 : dotInstant + missingHpDot;
      const totalBleedInstant = isTargetInvul1 ? 0 : bleedingInstant + missingHpBleed;
      const totalAfflictionInstant = isTargetInvul1 ? 0 : afflictionInstant + missingHpAffliction;
      if (totalDotInstant > 0 && target && !target.isDead) {
        target.health = Math.max(0, target.health - totalDotInstant);
        if (action.isPlayer) matchStatsRef.current.damageDealt += totalDotInstant;
        newLogs.push({ id: Math.random().toString(), turn, message: `🔥 [${skill.name}] → ${target.character.name}: -${totalDotInstant} HP (DoT)${missingHpDot > 0 ? ` [HP Perdido: ${missingHpDot}]` : ''}`, type: 'damage' });
        addFloatingText(target.id, `-${totalDotInstant} HP (DoT)`, 'damage');
      }
      if (totalBleedInstant > 0 && target && !target.isDead) {
        target.health = Math.max(0, target.health - totalBleedInstant);
        if (action.isPlayer) matchStatsRef.current.damageDealt += totalBleedInstant;
        newLogs.push({ id: Math.random().toString(), turn, message: `🩸 [${skill.name}] → ${target.character.name}: -${totalBleedInstant} HP (SANGRAMENTO)${missingHpBleed > 0 ? ` [HP Perdido: ${missingHpBleed}]` : ''}`, type: 'damage' });
        addFloatingText(target.id, `-${totalBleedInstant} HP (SANGRAMENTO)`, 'damage');
      }
      if (totalAfflictionInstant > 0 && target && !target.isDead) {
        target.health = Math.max(0, target.health - totalAfflictionInstant);
        if (action.isPlayer) matchStatsRef.current.damageDealt += totalAfflictionInstant;
        newLogs.push({ id: Math.random().toString(), turn, message: `💀 [${skill.name}] → ${target.character.name}: -${totalAfflictionInstant} HP (AFLICAO)${missingHpAffliction > 0 ? ` [HP Perdido: ${missingHpAffliction}]` : ''}`, type: 'damage' });
        addFloatingText(target.id, `-${totalAfflictionInstant} HP (AFLICAO)`, 'damage');
      }

      // GAIN CHAKRA
      if (skill.gainChakra && skill.gainChakra > 0) {
        const amt = skill.gainChakra;
        const gainChakraTargets = resolveEffectTargets(skill.gainChakraTarget || 'Self', target, source, sourceList, targetList, true);
        gainChakraTargets.forEach(t => {
          if (t.isDead) return;
          const tIsPlayer = updatedPlayer.some(p => p.id === t.id);
          const pool = tIsPlayer ? localPlayerChakra : localEnemyChakra;
          const types: (keyof ChakraPool)[] = ['Tai', 'Nin', 'Gen', 'Blood'];
          const randType = types[Math.floor(Math.random() * types.length)];
          pool[randType] = (pool[randType] || 0) + amt;
          newLogs.push({ id: Math.random().toString(), turn, message: `✨ [${skill.name}] → ${t.character.name}: +${amt} chakra (${randType})`, type: 'chakra' });
          addFloatingText(t.id, `+${amt} CHAKRA (${randType.toUpperCase()})`, 'effect');
        });
      }

      // DRAIN CHAKRA
      if (skill.drainChakra && skill.drainChakra > 0) {
        const amt = skill.drainChakra;
        const dur = skill.drainChakraDuration || 1;
        const drainChakraTargets = resolveEffectTargets(skill.drainChakraTarget || 'Target', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        drainChakraTargets.forEach(t => {
          if (t.isDead) return;
          if (dur > 1) {
            pushActiveEffect(t, {
              name: `Dreno de Chakra (${skill.name})`,
              type: 'custom', value: amt, duration: dur, icon: skill.icon,
              irremovable: !!skill.drainChakraIrremovable,
            });
            newLogs.push({ id: Math.random().toString(), turn, message: `🌀 [${skill.name}] → ${t.character.name}: -${amt} chakra/turno por ${dur}T`, type: 'chakra' });
            addFloatingText(t.id, 'DRENO CHAKRA CONTINUO', 'effect');
          } else {
            const tIsPlayer = updatedPlayer.some(p => p.id === t.id);
            performChakraAction(tIsPlayer, amt, source.character.name, t.character.name, skill.name, action.isPlayer, 'drain', source.id, t.id, newLogs, localPlayerChakra, localEnemyChakra);
          }
          cleanseTargetEffects(t, skill.drainChakraRemoveType);
        });
      }

      // REMOVE CHAKRA
      if (skill.removeChakra && skill.removeChakra > 0) {
        const amt = skill.removeChakra;
        const dur = skill.removeChakraDuration || 1;
        const removeChakraTargets = resolveEffectTargets(skill.removeChakraTarget || 'Target', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        removeChakraTargets.forEach(t => {
          if (t.isDead) return;
          if (dur > 1) {
            pushActiveEffect(t, {
              name: `Remoção de Chakra (${skill.name})`,
              type: 'custom', value: amt, duration: dur, icon: skill.icon,
              irremovable: !!skill.removeChakraIrremovable,
            });
            newLogs.push({ id: Math.random().toString(), turn, message: `🔥 [${skill.name}] → ${t.character.name}: -${amt} chakra/turno por ${dur}T`, type: 'chakra' });
            addFloatingText(t.id, 'REMOCAO CHAKRA CONTINUA', 'effect');
          } else {
            const tIsPlayer = updatedPlayer.some(p => p.id === t.id);
            performChakraAction(tIsPlayer, amt, source.character.name, t.character.name, skill.name, action.isPlayer, 'remove', source.id, t.id, newLogs, localPlayerChakra, localEnemyChakra);
          }
          cleanseTargetEffects(t, skill.removeChakraRemoveType);
        });
      }

      // STEAL CHAKRA
      if (skill.stealChakra && skill.stealChakra > 0) {
        const amt = skill.stealChakra;
        const dur = skill.stealChakraDuration || 1;
        const stealChakraTargets = resolveEffectTargets(skill.stealChakraTarget || 'Target', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        stealChakraTargets.forEach(t => {
          if (t.isDead) return;
          if (dur > 1) {
            pushActiveEffect(t, {
              name: `Roubo de Chakra (${skill.name})`,
              type: 'custom', value: amt, duration: dur, icon: skill.icon,
              irremovable: !!skill.stealChakraIrremovable,
            });
            newLogs.push({ id: Math.random().toString(), turn, message: `💰 [${skill.name}] → ${t.character.name}: -${amt} chakra/turno por ${dur}T`, type: 'chakra' });
            addFloatingText(t.id, 'ROUBO CHAKRA CONTINUO', 'effect');
          } else {
            const tIsPlayer = updatedPlayer.some(p => p.id === t.id);
            performChakraAction(tIsPlayer, amt, source.character.name, t.character.name, skill.name, action.isPlayer, 'steal', source.id, t.id, newLogs, localPlayerChakra, localEnemyChakra);
          }
          cleanseTargetEffects(t, skill.stealChakraRemoveType);
        });
      }

      // CHAKRA REMOVE RULES (conditional remove chakra when an ability is active)
      if (skill.chakraRemoveRules && skill.chakraRemoveRules.length > 0) {
        for (const rule of skill.chakraRemoveRules) {
          if (!rule.activeSkillName || rule.removeAmount <= 0) continue;
          const targetNameLower = rule.activeSkillName.trim().toLowerCase();
          const allActiveEffects = allCombatants.flatMap(c => c.activeEffects);
          const isReqActive = allActiveEffects.some(e => {
            if (!e.name) return false;
            const eNameLower = e.name.toLowerCase();
            return (
              eNameLower === targetNameLower ||
              eNameLower.startsWith(targetNameLower) ||
              eNameLower.includes(targetNameLower)
            );
          });
          if (isReqActive) {
            const targetSide = action.isPlayer ? updatedEnemy : updatedPlayer;
            const livingTargets = targetSide.filter(c => !c.isDead && !checkCombatantInvulnerable(c, skill));
            if (livingTargets.length > 0) {
              const t = livingTargets[0];
              const tIsPlayer = updatedPlayer.some(p => p.id === t.id);
              performChakraAction(tIsPlayer, rule.removeAmount, source.character.name, t.character.name, skill.name, action.isPlayer, 'remove', source.id, t.id, newLogs, localPlayerChakra, localEnemyChakra);
              newLogs.push({
                id: Math.random().toString(), turn,
                message: `🔥 [REGRA] ${source.character.name} usou [${skill.name}] com [${rule.activeSkillName}] ativo e removeu ${rule.removeAmount} chakra aleatório do estoque inimigo!`,
                type: 'chakra',
              });
            }
          }
        }
      }

      // INVISIBILITY TO OPPONENT (effect hiding, no targeting block)
      // The `invisible` property now only marks effects as hidden (isInvisible), no longer creates an untargetable buff.
      // If you want actual invisibility (untargetable), use a separate stun or invulnerable effect instead.

      // PARALYZE COOLDOWN
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

      // REMOVE SHIELD
      if (skill.removeShield) {
        const removeShieldTargets = resolveEffectTargets(skill.shieldTarget || 'Target', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        removeShieldTargets.forEach(t => {
          if (t.isDead) return;
          t.shield = 0;
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🛡️❌ [${skill.name}] de ${source.character.name} DESTRUIU todo o escudo de ${t.character.name}!`,
            type: 'damage',
          });
          addFloatingText(t.id, 'ESCUDO DESTRUÍDO', 'shield');
          if (skill.removeShieldDuration && skill.removeShieldDuration > 0) {
            pushActiveEffect(t, {
              name: `Selamento de Escudo (${skill.name})`,
              type: 'custom',
              duration: skill.removeShieldDuration,
              icon: skill.icon,
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🛡️⛔ ${t.character.name} está IMPEDIDO de ganhar escudo por ${skill.removeShieldDuration} turnos!`,
              type: 'buff',
            });
            addFloatingText(t.id, 'ESCUDO SELADO', 'shield');
          }
        });
      }

      // REMOVE COUNTER & REFLECT
      if (skill.removeCounterReflect) {
        const crTargets = resolveEffectTargets(skill.removeCounterReflectTarget || 'Target', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        crTargets.forEach(t => {
          if (t.isDead) return;
          const count = t.activeEffects.filter(e => !e.irremovable && ['counter_attack', 'counter', 'reflect'].includes(e.type)).length;
          t.activeEffects = t.activeEffects.filter(e => e.irremovable || !['counter_attack', 'counter', 'reflect'].includes(e.type));
          if (count > 0) {
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `⚔️⛔ [${skill.name}] de ${source.character.name} REMOVEU os Contra-Ataques / Refletir de ${t.character.name}!`,
              type: 'damage',
            });
            addFloatingText(t.id, 'CONTRA/REFLETIR REMOVIDO', 'stun');
          }
        });
      }

      // 1. DAMAGE & SHIELDS
      if (skill.damageDuration && skill.damageDuration > 1) {
        const duration = skill.damageDuration;
        const damageTargets = resolveEffectTargets(skill.damageTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        damageTargets.forEach(t => {
          if (t.isDead) return;
          // Deal immediate first tick
          const startingShield = t.shield;
          const startingHealth = t.health;
          const sourceBuffs = source.activeEffects.filter(e => e.type === 'damage_buff');
          const damageBuffSum = sourceBuffs.reduce((acc, curr) => acc + (curr.value || 0), 0);
          const sourceDebuffs = source.activeEffects.filter((e: ActiveEffect) => {
            if (e.type !== 'damage_debuff') return false;
            if ((e as any).excludeAffliction) {
              const isAffliction = skill.classes?.some((c: string) => {
                const lower = c.toLowerCase();
                return lower.includes('aflição') || lower.includes('affliction');
              });
              if (isAffliction) return false;
            }
            const types = (e as any).debuffTypes as string[] | undefined;
            if (!types || types.length === 0) return true;
            return types.includes('skill');
          });
          const damageDebuffSum = sourceDebuffs.reduce((acc, curr) => acc + (curr.value || 0), 0);
          // costRuleDamageBoost already calculated above in outer scope
          // Dano por stack no alvo
          let stackDamageBonus = 0;
          // Aumento de dano por stack em mim mesmo
          if (skill.selfStackDamageRules && skill.selfStackDamageRules.length > 0) {
            for (const selfRule of skill.selfStackDamageRules) {
              if (selfRule.stackType && selfRule.damagePerStack > 0) {
                const selfStackEffect = source.activeEffects.find(e => e.stackType === selfRule.stackType);
                const selfStackCount = selfStackEffect?.stacks || 0;
                if (selfStackCount > 0) {
                  stackDamageBonus += selfStackCount * selfRule.damagePerStack;
                }
              }
            }
          }
          if (skill.stackDamageRules && skill.stackDamageRules.length > 0) {
            for (const stackRule of skill.stackDamageRules) {
              if (stackRule.stackType && stackRule.damagePerStack > 0) {
                const stackPool = getStackPoolForRule(stackRule, t, source, sourceList, targetList);
                const stackCount = countStacksInPool(stackPool, stackRule.stackType);
                if (stackCount > 0) {
                  if (stackRule.duration && stackRule.duration > 0) {
                    const dmgType = (stackRule.damageType || 'dot') as ActiveEffect['type'];
                    const totalDmg = stackCount * stackRule.damagePerStack;
                    // Dano instantâneo no golpe
                    t.health = Math.max(0, t.health - totalDmg);
                    newLogs.push({
                      id: Math.random().toString(),
                      turn,
                      message: `💥 ${t.character.name} levou ${totalDmg} de ${stackRule.stackType} instantâneo!`,
                      type: 'damage',
                    });
                    addFloatingText(t.id, `-${totalDmg} ${stackRule.stackType}`, 'damage');
                    // DOT por mais X turnos (duração 1 = só instantâneo)
                    if (stackRule.duration > 1) {
                      pushActiveEffect(t, {
                        name: `${skill.name} (${stackRule.stackType} DOT)`,
                        type: dmgType,
                        value: totalDmg,
                        duration: stackRule.duration - 1,
                        icon: skill.icon,
                        casterId: source.id,
                        casterSide: action.isPlayer ? 'player' : 'enemy',
                        sourceSkillName: skill.name,
                      });
                      newLogs.push({
                        id: Math.random().toString(),
                        turn,
                        message: `🔥 ${t.character.name} sofrerá +${totalDmg} de ${dmgType} por turno por mais ${stackRule.duration - 1} turnos (${stackCount}x ${stackRule.stackType})!`,
                        type: 'damage',
                      });
                      addFloatingText(t.id, `${dmgType.toUpperCase()} +${totalDmg}`, 'damage');
                    }
                    if (stackRule.ignoreBaseDamage) {
                      baseDamage = 0;
                    }
                  } else {
                    stackDamageBonus += stackCount * stackRule.damagePerStack;
                  }
                }
                // Remove stacks after calculating damage
                if (stackRule.removeStacks && stackRule.removeStacks > 0) {
                  for (const poolChar of stackPool) {
                    const poolEffect = poolChar.activeEffects.find(e => e.stackType === stackRule.stackType);
                    if (poolEffect && poolEffect.stacks) {
                      poolEffect.stacks = Math.max(0, (poolEffect.stacks || 0) - stackRule.removeStacks);
                    }
                  }
                }
              }
            }
          }
          let finalDamage = baseDamage + damageBuffSum + costRuleDamageBoost + stackDamageBonus + getCaptureArrestBonusDamage(t, skill) - damageDebuffSum;
          const targetCannotReduce = t.activeEffects.some(e => e.type === 'cannot_reduce_damage');
          let reductionSum = 0;
          if (!targetCannotReduce) {
            const targetReductions = t.activeEffects.filter(e => e.type === 'damage_reduction');
            reductionSum = targetReductions.reduce((acc, curr) => acc + (curr.value || 0), 0);
            if (skill.ignoreDamageReduction) reductionSum = 0;
            else if (typeof (skill as any).ignoreDamageReductionVal === 'number' && (skill as any).ignoreDamageReductionVal > 0)
              reductionSum = Math.max(0, reductionSum - (skill as any).ignoreDamageReductionVal);
          }
          finalDamage = Math.max(0, finalDamage - reductionSum);
          if (hasDamageImmunity(t)) finalDamage = 0;
          if (t.shield > 0) {
            if (t.shield >= finalDamage) {
              t.shield -= finalDamage;
              newLogs.push({ id: Math.random().toString(), turn, message: `🛡️ ${source.character.name} atingiu o escudo de ${t.character.name} com [${skill.name}] causando ${finalDamage} de dano ao escudo.`, type: 'buff' });
              addFloatingText(t.id, `-${finalDamage} ESCUDO`, 'shield');
              finalDamage = 0;
            } else {
              finalDamage -= t.shield;
              newLogs.push({ id: Math.random().toString(), turn, message: `💥 ${source.character.name} quebrou o escudo de ${t.character.name}!`, type: 'damage' });
              addFloatingText(t.id, 'ESCUDO QUEBRADO', 'shield');
              t.shield = 0;
            }
          }
          if (checkCombatantInvulnerable(t, skill) && !skill.ignoreInvulnerable) {
            finalDamage = 0;
            newLogs.push({ id: Math.random().toString(), turn, message: `🛡️ ${t.character.name} está INVULNERÁVEL e não sofreu dano de HP de [${skill.name}].`, type: 'buff' });
            addFloatingText(t.id, 'INVULNERÁVEL!', 'invulnerable');
          } else if (hasDamageImmunity(t)) {
            finalDamage = 0;
            newLogs.push({ id: Math.random().toString(), turn, message: `🛡️ ${t.character.name} é IMUNE A DANO e não sofreu dano de HP de [${skill.name}].`, type: 'buff' });
            addFloatingText(t.id, 'IMUNE!', 'invulnerable');
          }
          if (finalDamage > 0) {
            const before = t.health;
            t.health = t.activeEffects?.some(e => e.type === 'immortal') ? Math.max(1, t.health - finalDamage) : Math.max(0, t.health - finalDamage);
            newLogs.push({ id: Math.random().toString(), turn, message: `💥 ${source.character.name} usou [${skill.name}] causando ${finalDamage} de dano em ${t.character.name} (primeiro tick).`, type: 'damage' });
            addFloatingText(t.id, `-${finalDamage} HP`, 'damage');
            // Air Bullets stun check for normal damage
            if ((airBulletsHitTargets.current.has(t.id) || skill.name === 'Air Bullets' || skill.name.toLowerCase().includes('air bullets'))
              && !t.activeEffects.some((e: ActiveEffect) => e.name === 'Air Bullets Stun')) {
              t.activeEffects.push({
                name: 'Air Bullets Stun',
                type: 'stun',
                duration: 1,
                stunType: ['physical', 'mental', 'affliction', 'chakra'],
                icon: airBulletsHitTargets.current.get(t.id) || skill.icon,
                casterId: source.id,
                casterSide: action.isPlayer ? 'player' : 'enemy',
                castTurn: turn,
              });
              newLogs.push({ id: Math.random().toString(), turn, message: `⚡ ${t.character.name} foi ATORDOADO por [Air Bullets]!`, type: 'stun' });
              addFloatingText(t.id, 'ATORDOADO (Air Bullets)', 'stun');
            }
            if (action.isPlayer) {
              matchStatsRef.current.damageDealt += finalDamage;
              matchStatsRef.current.damageDealtRecords.push({ charName: source.character.name, tags: source.character.tags || [], skillName: skill.name, amount: finalDamage });
            } else {
              matchStatsRef.current.damageReceived += finalDamage;
              matchStatsRef.current.damageReceivedRecords.push({ charName: t.character.name, tags: t.character.tags || [], amount: finalDamage });
            }
            if (t.health === 0 && startingHealth > 0 && action.isPlayer) {
              matchStatsRef.current.killsWithSkill[skill.name] = (matchStatsRef.current.killsWithSkill[skill.name] || 0) + 1;
              matchStatsRef.current.killRecords.push({ charName: source.character.name, tags: source.character.tags || [], skillName: skill.name });
            }
          }
            // Apply remaining continuous damage (duration - 1)
          if (duration > 1 && !t.isDead) {
            pushActiveEffect(t, {
              name: `${skill.name} (Dano Contínuo)`,
              type: 'damage',
              value: baseDamage,
              duration: duration - 1,
              icon: skill.icon,
              irremovable: !!skill.damageIrremovable,
              casterId: source.id,
              casterSide: action.isPlayer ? 'player' : 'enemy',
              sourceSkillName: skill.name,
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `💥 ${t.character.name} foi afetado por [${skill.name}] sofrendo ${baseDamage} de dano por turno por mais ${duration - 1} turnos!`,
              type: 'damage',
            });
            addFloatingText(t.id, `DANO CONTÍNUO (${skill?.permanent ? '♾️ Permanente' : (duration - 1) + 'T'})`, 'damage');
          }
          cleanseTargetEffects(t, skill.damageRemoveType);
        });
      } else if (baseDamage > 0 || (skill.damage || 0) > 0 || (skill.damageRules && skill.damageRules.length > 0) || (skill.stackDamageRules && skill.stackDamageRules.length > 0) || (skill.bonusDamagePerMissingHp && skill.bonusDamagePerMissingHp > 0)) {
        const damageTargets = resolveEffectTargets(skill.damageTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        const splashVal = skill.splashDamage || 0;
        const splashTgt = skill.splashTarget || 'Target';

        // === Determine primary targets (take full damage) vs splash-only targets ===
        let primaryTargets: CombatCharacter[] = [];
        let splashOnlyTargets: CombatCharacter[] = [];

        if (splashVal > 0) {
          // When splashDamage is set, only the original selected target gets full damage
          // All other enemies in the splash pool take splash damage only
          primaryTargets = [target]; // only the single selected primary target
          const splashPool = splashTgt === 'AllAllies' || splashTgt === 'AllEnemies'
            ? (splashTgt === 'AllAllies' ? sourceList : targetList)
            : (splashTgt === 'AllLiving' ? [...sourceList, ...targetList] : targetList);
          splashOnlyTargets = splashPool.filter(c =>
            c.id !== target.id && !c.isDead && !checkCombatantInvulnerable(c)
          );
        } else {
          // No splash: all damageTargets get full damage as normal
          primaryTargets = damageTargets;
          splashOnlyTargets = [];
        }

        // Apply full damage to primary targets
        primaryTargets.forEach(t => {
          if (t.isDead) return;
          const startingShield = t.shield;
          const startingHealth = t.health;

          const sourceBuffs = source.activeEffects.filter(e => e.type === 'damage_buff');
          const damageBuffSum = sourceBuffs.reduce((acc, curr) => acc + (curr.value || 0), 0);
          const sourceDebuffs = source.activeEffects.filter((e: ActiveEffect) => {
            if (e.type !== 'damage_debuff') return false;
            if ((e as any).excludeAffliction) {
              const isAffliction = skill.classes?.some((c: string) => {
                const lower = c.toLowerCase();
                return lower.includes('aflição') || lower.includes('affliction');
              });
              if (isAffliction) return false;
            }
            const types = (e as any).debuffTypes as string[] | undefined;
            if (!types || types.length === 0) return true;
            return types.includes('skill');
          });
          const damageDebuffSum = sourceDebuffs.reduce((acc, curr) => acc + (curr.value || 0), 0);
          // costRuleDamageBoost already calculated above in outer scope
          // Dano por stack no alvo
          let stackDamageBonus = 0;
          // Aumento de dano por stack em mim mesmo
          if (skill.selfStackDamageRules && skill.selfStackDamageRules.length > 0) {
            for (const selfRule of skill.selfStackDamageRules) {
              if (selfRule.stackType && selfRule.damagePerStack > 0) {
                const selfStackEffect = source.activeEffects.find(e => e.stackType === selfRule.stackType);
                const selfStackCount = selfStackEffect?.stacks || 0;
                if (selfStackCount > 0) {
                  stackDamageBonus += selfStackCount * selfRule.damagePerStack;
                }
              }
            }
          }
          if (skill.stackDamageRules && skill.stackDamageRules.length > 0) {
            for (const stackRule of skill.stackDamageRules) {
              if (stackRule.stackType && stackRule.damagePerStack > 0) {
                const stackPool = getStackPoolForRule(stackRule, t, source, sourceList, targetList);
                const stackCount = countStacksInPool(stackPool, stackRule.stackType);
                if (stackCount > 0) {
                  if (stackRule.duration && stackRule.duration > 0) {
                    const dmgType = (stackRule.damageType || 'dot') as ActiveEffect['type'];
                    const totalDmg = stackCount * stackRule.damagePerStack;
                    // Dano instantâneo no golpe
                    t.health = Math.max(0, t.health - totalDmg);
                    newLogs.push({
                      id: Math.random().toString(),
                      turn,
                      message: `💥 ${t.character.name} levou ${totalDmg} de ${stackRule.stackType} instantâneo!`,
                      type: 'damage',
                    });
                    addFloatingText(t.id, `-${totalDmg} ${stackRule.stackType}`, 'damage');
                    // DOT por mais X turnos (duração 1 = só instantâneo)
                    if (stackRule.duration > 1) {
                      pushActiveEffect(t, {
                        name: `${skill.name} (${stackRule.stackType} DOT)`,
                        type: dmgType,
                        value: totalDmg,
                        duration: stackRule.duration - 1,
                        icon: skill.icon,
                        casterId: source.id,
                        casterSide: action.isPlayer ? 'player' : 'enemy',
                        sourceSkillName: skill.name,
                      });
                      newLogs.push({
                        id: Math.random().toString(),
                        turn,
                        message: `🔥 ${t.character.name} sofrerá +${totalDmg} de ${dmgType} por turno por mais ${stackRule.duration - 1} turnos (${stackCount}x ${stackRule.stackType})!`,
                        type: 'damage',
                      });
                      addFloatingText(t.id, `${dmgType.toUpperCase()} +${totalDmg}`, 'damage');
                    }
                    if (stackRule.ignoreBaseDamage) {
                      baseDamage = 0;
                    }
                  } else {
                    stackDamageBonus += stackCount * stackRule.damagePerStack;
                  }
                }
                // Remove stacks after calculating damage
                if (stackRule.removeStacks && stackRule.removeStacks > 0) {
                  for (const poolChar of stackPool) {
                    const poolEffect = poolChar.activeEffects.find(e => e.stackType === stackRule.stackType);
                    if (poolEffect && poolEffect.stacks) {
                      poolEffect.stacks = Math.max(0, (poolEffect.stacks || 0) - stackRule.removeStacks);
                    }
                  }
                }
              }
            }
          }
          let finalDamage = baseDamage + damageBuffSum + costRuleDamageBoost + stackDamageBonus + getCaptureArrestBonusDamage(t, skill) - damageDebuffSum;

          const targetCannotReduce = t.activeEffects.some(e => e.type === 'cannot_reduce_damage');
          let reductionSum = 0;
          if (!targetCannotReduce) {
            const targetReductions = t.activeEffects.filter(e => e.type === 'damage_reduction');
            reductionSum = targetReductions.reduce((acc, curr) => acc + (curr.value || 0), 0);
            if (skill.ignoreDamageReduction) {
              reductionSum = 0;
            } else if (typeof (skill as any).ignoreDamageReductionVal === 'number' && (skill as any).ignoreDamageReductionVal > 0) {
              reductionSum = Math.max(0, reductionSum - (skill as any).ignoreDamageReductionVal);
            }
          }
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

          if (checkCombatantInvulnerable(t, skill) && !skill.ignoreInvulnerable) {
            finalDamage = 0;
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🛡️ ${t.character.name} está INVULNERÁVEL e não sofreu dano de HP de [${skill.name}].`,
              type: 'buff',
            });
            addFloatingText(t.id, 'INVULNERÁVEL!', 'invulnerable');
          }

          if (finalDamage > 0) {
            const before = t.health;
            t.health = t.activeEffects?.some(e => e.type === 'immortal') ? Math.max(1, t.health - finalDamage) : Math.max(0, t.health - finalDamage);
            console.log(`[DMG] ${source.character.name} -> ${t.character.name}: -${finalDamage} HP (${before} -> ${t.health}) shield:${t.shield} dead:${t.isDead}`);
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `💥 ${source.character.name} usou [${skill.name}] causando ${finalDamage} de dano em ${t.character.name}.`,
              type: 'damage',
            });
            addFloatingText(t.id, `-${finalDamage} HP`, 'damage');
            // Air Bullets stun check for normal damage
            if ((airBulletsHitTargets.current.has(t.id) || skill.name === 'Air Bullets' || skill.name.toLowerCase().includes('air bullets'))
              && !t.activeEffects.some((e: ActiveEffect) => e.name === 'Air Bullets Stun')) {
              t.activeEffects.push({
                name: 'Air Bullets Stun',
                type: 'stun',
                duration: 1,
                stunType: ['physical', 'mental', 'affliction', 'chakra'],
                icon: airBulletsHitTargets.current.get(t.id) || skill.icon,
                casterId: source.id,
                casterSide: action.isPlayer ? 'player' : 'enemy',
                castTurn: turn,
              });
              newLogs.push({ id: Math.random().toString(), turn, message: `⚡ ${t.character.name} foi ATORDOADO por [Air Bullets]!`, type: 'stun' });
              addFloatingText(t.id, 'ATORDOADO (Air Bullets)', 'stun');
            }
            if (action.isPlayer) {
              matchStatsRef.current.damageDealt += finalDamage;
              matchStatsRef.current.damageDealtRecords.push({ charName: source.character.name, tags: source.character.tags || [], skillName: skill.name, amount: finalDamage });
            } else {
              matchStatsRef.current.damageReceived += finalDamage;
              matchStatsRef.current.damageReceivedRecords.push({ charName: t.character.name, tags: t.character.tags || [], amount: finalDamage });
            }
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
              matchStatsRef.current.damageDealtRecords.push({ charName: source.character.name, tags: source.character.tags || [], skillName: skill.name, amount: damageTaken });
            } else {
              matchStatsRef.current.damageReceived += damageTaken;
              matchStatsRef.current.damageReceivedRecords.push({ charName: t.character.name, tags: t.character.tags || [], amount: damageTaken });
            }
          }
          if (t.health === 0 && startingHealth > 0 && action.isPlayer) {
            matchStatsRef.current.killsWithSkill[skill.name] = (matchStatsRef.current.killsWithSkill[skill.name] || 0) + 1;
            matchStatsRef.current.killRecords.push({ charName: source.character.name, tags: source.character.tags || [], skillName: skill.name });
          }
});

        // Apply stack AFTER damage calculation so first hit uses existing stacks (not the new one)
        // Stack goes to stackTarget (e.g., Self), not damageTarget
        if (skill.stackable && skill.stackType) {
          const stackTargets = resolveEffectTargets(skill.stackTarget, target, source, sourceList, targetList, true);
          stackTargets.forEach(st => {
            if (st.isDead) return;
            pushActiveEffect(st, {
              name: `${skill.stackType || skill.name} (Stack)`,
              type: 'custom',
              value: 0,
              duration: skill.stackDuration ?? 999,
              icon: skill.icon,
              stackable: true,
              stackType: skill.stackType || skill.name,
              casterId: source.id,
              casterSide: action.isPlayer ? 'player' : 'enemy',
              sourceSkillName: skill.name,
            });
          });
        }

        // === Apply splash damage to splash-only targets (once, outside the primary loop) ===
        if (splashVal > 0) {
          splashOnlyTargets.forEach(splashT => {
            splashT.health = Math.max(0, splashT.health - splashVal);
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `💥 [SPLASH] ${skill.name} causou ${splashVal} de dano em ${splashT.character.name}!`,
              type: 'damage',
            });
            addFloatingText(splashT.id, `-${splashVal} HP (SPLASH)`, 'damage');
            if (action.isPlayer) {
              matchStatsRef.current.damageDealt += splashVal;
              matchStatsRef.current.damageDealtRecords.push({ charName: source.character.name, tags: source.character.tags || [], skillName: `${skill.name} (Splash)`, amount: splashVal });
            } else {
              matchStatsRef.current.damageReceived += splashVal;
              matchStatsRef.current.damageReceivedRecords.push({ charName: splashT.character.name, tags: splashT.character.tags || [], amount: splashVal });
            }
          });
        }
      }

      // 2. HEALING (with heal rule boost)
      if (healAmt > 0) {
        let healRuleBoost = 0;
        if (skill.healRules && skill.healRules.length > 0) {
          for (const rule of skill.healRules) {
            if (rule.healBoost > 0 && rule.activeSkillName) {
              const targetNameLower = rule.activeSkillName.trim().toLowerCase();
              const allActiveEffects = allCombatants.flatMap(c => c.activeEffects);
              const hasActive = allActiveEffects.some(e => {
                if (!e.name) return false;
                const eNameLower = e.name.toLowerCase();
                return eNameLower === targetNameLower || eNameLower.includes(targetNameLower) || targetNameLower.includes(eNameLower);
              });
              if (hasActive) healRuleBoost += rule.healBoost;
            }
          }
        }
        const totalHeal = healAmt + healRuleBoost;
        const healTargets = resolveEffectTargets(skill.healTarget, target, source, sourceList, targetList, true);
        healTargets.forEach(t => {
          if (t.isDead) return;
          if (t.activeEffects.some(e => e.type === 'cannot_receive_friendly')) {
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🚫 ${t.character.name} não pôde ser curado por [${skill.name}] por estar impossibilitado de receber habilidades amigáveis!`,
              type: 'stun',
            });
            addFloatingText(t.id, 'CURA BLOQUEADA', 'stun');
            return;
          }
          const startingHealth = t.health;
          t.health = Math.min(100, t.health + totalHeal);
          const actualHealed = t.health - startingHealth;
          if (actualHealed > 0 && action.isPlayer) {
            matchStatsRef.current.healingDone += actualHealed;
            matchStatsRef.current.healingDoneRecords.push({
              charName: source.character.name,
              tags: source.character.tags || [],
              skillName: skill.name,
              amount: actualHealed
            });
          }
          if (totalHeal > 0 || actualHealed > 0) {
            checkAndGrantOrigamiLotusGathering(t, totalHeal || actualHealed, newLogs, [...updatedPlayer, ...updatedEnemy]);
          }
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `💚 ${source.character.name} usou [${skill.name}] e restaurou ${totalHeal} de vida de ${t.character.name}.${healRuleBoost > 0 ? ` (+${healRuleBoost} bônus)` : ''}`,
            type: 'heal',
          });
          addFloatingText(t.id, `+${totalHeal} HP`, 'heal');
          cleanseTargetEffects(t, skill.healRemoveType);
        });
      }

      // 3. STUNS
      if (stunApplied) {
        const stunTypeLabels: Record<string, string> = { physical: 'Físico', mental: 'Mental', affliction: 'Aflição', chakra: 'Chakra', ranged: 'A distancia', friendly: 'Amigável' };
        const resolvedStunTypes: string[] =
          (!finalStunType || finalStunType.length === 0 || finalStunType.length >= 6)
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
          if (action.isPlayer) {
            matchStatsRef.current.shieldGenerated += skill.shieldVal!;
            matchStatsRef.current.shieldGeneratedRecords.push({
              charName: source.character.name,
              tags: source.character.tags || [],
              skillName: skill.name,
              amount: skill.shieldVal!
            });
          }
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
          if (action.isPlayer) {
            matchStatsRef.current.shieldGenerated += value;
            matchStatsRef.current.shieldGeneratedRecords.push({
              charName: source.character.name,
              tags: source.character.tags || [],
              skillName: skill.name,
              amount: value
            });
          }
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

      // 3. Generic skill properties (for admin-created multi-effect skills)
      // Each effect is checked independently so multiple can apply

      // Damage Reduction buff
      if (skill.damageReductionVal && skill.damageReductionVal > 0) {
        const targets = resolveEffectTargets(skill.shieldTarget || 'Self', target, source, sourceList, targetList, true);
        targets.forEach(t => {
          if (t.isDead) return;
          const reducDuration = skill.permanent ? 99999 : (skill.damageReductionDuration || 3);
          pushActiveEffect(t, {
            name: `${skill.name} Guard`,
            type: 'damage_reduction',
            value: skill.damageReductionVal!,
            duration: reducDuration,
            icon: skill.icon,
            sourceSkillName: skill.name,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(), turn,
            message: `✨ ${t.character.name} recebeu [${skill.name} Guard] por ${skill.damageReductionDuration || 3} turnos.`,
            type: 'buff',
          });
          addFloatingText(t.id, `${skill.name} Guard`.toUpperCase(), 'effect');
        });
      }

      // Damage Debuff (reduces damage dealt by target)
      if (skill.damageDebuffVal && skill.damageDebuffVal > 0) {
        const targets = resolveEffectTargets(skill.damageDebuffTarget || skill.shieldTarget || 'Target', target, source, sourceList, targetList, false);
        targets.forEach(t => {
          if (t.isDead) return;
          pushActiveEffect(t, {
            name: `${skill.name} Weakness`,
            sourceSkillName: skill.name,
            type: 'damage_debuff',
            value: skill.damageDebuffVal!,
            duration: skill.damageDebuffDuration || 3,
            icon: skill.icon,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
            debuffTypes: skill.damageDebuffTypes,
          });
          newLogs.push({
            id: Math.random().toString(), turn,
            message: `🌫️ ${t.character.name} recebeu [${skill.name} Weakness] por ${skill.damageDebuffDuration || 3} turnos reduzindo dano de suas skills.`,
            type: 'buff',
          });
          addFloatingText(t.id, `${skill.name} Weakness`.toUpperCase(), 'effect');
        });
      }

      // Damage Buff
      if (skill.damageBuffVal && skill.damageBuffVal > 0) {
        const targets = resolveEffectTargets(skill.damageBuffTarget || skill.shieldTarget || 'Self', target, source, sourceList, targetList, true);
        targets.forEach(t => {
          if (t.isDead) return;
          const buffDuration = skill.permanent ? 99999 : (skill.damageBuffDuration || 3);
          pushActiveEffect(t, {
            name: `${skill.name} Power`,
            type: 'damage_buff',
            value: skill.damageBuffVal!,
            duration: buffDuration,
            icon: skill.icon,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(), turn,
            message: `✨ ${t.character.name} recebeu [${skill.name} Power] por ${skill.damageBuffDuration || 3} turnos.`,
            type: 'buff',
          });
          addFloatingText(t.id, `${skill.name} Power`.toUpperCase(), 'effect');
        });
      }

      // Damage Rule Boost Buff (visual indicator & log)
      if (skill.damageRules && skill.damageRules.length > 0) {
        skill.damageRules.forEach(rule => {
          if (!rule.activeSkillName || rule.damageBoost <= 0) return;
          const targetNameLower = rule.activeSkillName.trim().toLowerCase();
          const allActiveEffects = allCombatants.flatMap(c => c.activeEffects);
          const hasActiveEffect = allActiveEffects.some(e => {
            if (!e.name) return false;
            const eNameLower = e.name.toLowerCase();
            return eNameLower === targetNameLower || eNameLower.includes(targetNameLower);
          });
          if (hasActiveEffect) {
            newLogs.push({
              id: Math.random().toString(), turn,
              message: `⚡ [${skill.name}] de ${source.character.name} recebeu +${rule.damageBoost} de Dano Extra por [${rule.activeSkillName}] estar ativo!`,
              type: 'buff',
            });
            addFloatingText(source.id, `DANO EXTRA +${rule.damageBoost}`, 'effect');
          }
        });
      }

      // Invulnerable
      if (skill.invulnerableDuration && skill.invulnerableDuration > 0) {
        const invulTargets = resolveEffectTargets(skill.invulnerableTarget || skill.shieldTarget || 'Self', target, source, sourceList, targetList, true);
        invulTargets.forEach(t => {
          if (t.isDead) return;
          pushActiveEffect(t, {
            name: `${skill.name} Escape`,
            type: 'invulnerable',
            duration: skill.invulnerableDuration!,
            icon: skill.icon,
            invulnerableTypes: skill.invulnerableTypes,
            irremovable: !!skill.invulnerableIrremovable,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(), turn,
            message: `🌌 ${t.character.name} ficou INVULNERÁVEL com [${skill.name}] por ${skill.invulnerableDuration} turnos!`,
            type: 'buff',
          });
          addFloatingText(t.id, 'INVULNERÁVEL', 'invulnerable');
          cleanseTargetEffects(t, skill.invulnerableRemoveType);
        });
      }

      // DoT (damage over time) - debuff on target
      const totalDotVal = (hasActiveDamageRuleIgnoreBase && ruleDotDamage > 0) ? ruleDotDamage : ((skill.dotVal || 0) + ruleDotDamage);
      if (totalDotVal > 0 && skill.name !== 'Amaterasu Burn') {
        const dotTargets = resolveEffectTargets(skill.dotTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        dotTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.dotDuration || 3;
          pushActiveEffect(t, {
            name: `${skill.name} Burn`,
            type: 'dot',
            value: totalDotVal,
            duration,
            icon: skill.icon,
            irremovable: !!skill.dotIrremovable,
            cannotBeCountered: !!skill.cannotBeCountered,
            cannotBeReflected: !!skill.cannotBeReflected,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🔥 ${t.character.name} foi afligido por dano contínuo de [${skill.name}] sofrendo ${totalDotVal} DoT por ${duration} turnos!`,
            type: 'damage',
          });
          addFloatingText(t.id, `DANO CONTÍNUO (+${totalDotVal} DoT)`, 'damage');
          cleanseTargetEffects(t, skill.dotRemoveType);
        });
      }

      // Bleeding - debuff on target
      const totalBleedingVal = (hasActiveDamageRuleIgnoreBase && ruleBleedingDamage > 0) ? ruleBleedingDamage : ((skill.bleedingVal || 0) + ruleBleedingDamage);
      if (totalBleedingVal > 0) {
        const bleedTargets = resolveEffectTargets(skill.bleedingTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        bleedTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.bleedingDuration || 3;
          pushActiveEffect(t, {
            name: `${skill.name} Bleed`,
            type: 'bleeding',
            value: totalBleedingVal,
            duration,
            icon: skill.icon,
            irremovable: !!skill.bleedingIrremovable,
            cannotBeCountered: !!skill.cannotBeCountered,
            cannotBeReflected: !!skill.cannotBeReflected,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🩸 ${t.character.name} está sangrando com [${skill.name}] sofrendo ${totalBleedingVal} de dano por turno por ${duration} turnos!`,
            type: 'damage',
          });
          addFloatingText(t.id, `SANGRAMENTO (-${totalBleedingVal} HP)`, 'damage');
          cleanseTargetEffects(t, skill.bleedingRemoveType);
        });
      }

      // Affliction - debuff & immediate damage on target
      const totalAfflictionVal = (hasActiveDamageRuleIgnoreBase && ruleAfflictionDamage > 0) ? ruleAfflictionDamage : ((skill.afflictionVal || 0) + ruleAfflictionDamage);
      if (totalAfflictionVal > 0) {
        const afflictionTargets = resolveEffectTargets(skill.afflictionTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        afflictionTargets.forEach(t => {
          if (t.isDead) return;
          const rawDuration = skill.afflictionDuration !== undefined && skill.afflictionDuration > 0 ? skill.afflictionDuration : 1;

          // Deduct health immediately upon applying affliction
          if (checkCombatantInvulnerable(t) || hasDamageImmunity(t)) {
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🛡️ ${t.character.name} é IMUNE A DANO e ignorou a aflição de [${skill.name}].`,
              type: 'buff',
            });
            addFloatingText(t.id, 'IMUNE!', 'invulnerable');
          } else {
            const startingHealth = t.health;
            t.health = Math.max(0, t.health - totalAfflictionVal);
            const healthReduced = startingHealth - t.health;
            if (healthReduced > 0) {
              if (action.isPlayer) {
                matchStatsRef.current.damageDealt += healthReduced;
                matchStatsRef.current.damageDealtRecords.push({
                  charName: source.character.name,
                  tags: source.character.tags || [],
                  skillName: skill.name,
                  amount: healthReduced
                });
              } else {
                matchStatsRef.current.damageReceived += healthReduced;
                matchStatsRef.current.damageReceivedRecords.push({
                  charName: t.character.name,
                  tags: t.character.tags || [],
                  amount: healthReduced
                });
              }
            }

            if (t.health <= 0 && !t.activeEffects.some(e => e.type === 'immortal')) {
              t.isDead = true;
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `💀 ${t.character.name} CAIU EM BATALHA POR AFLIÇÃO!`,
                type: 'death',
              });
              addFloatingText(t.id, 'DERROTADO', 'damage');
            }

            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `💀 ${t.character.name} sofreu ${totalAfflictionVal} de dano por aflição de [${skill.name}]!`,
              type: 'damage',
            });
            addFloatingText(t.id, `AFLIÇÃO (-${totalAfflictionVal} HP)`, 'damage');
          }

          // If duration > 1, push active effect for remaining turns
          const remainingDuration = rawDuration - 1;
          if (remainingDuration > 0) {
            pushActiveEffect(t, {
              name: `${skill.name} Affliction`,
              type: 'affliction',
              value: totalAfflictionVal,
              duration: remainingDuration,
              icon: skill.icon,
              irremovable: !!skill.afflictionIrremovable,
              cannotBeCountered: !!skill.cannotBeCountered,
              cannotBeReflected: !!skill.cannotBeReflected,
              casterId: source.id,
              casterSide: action.isPlayer ? 'player' : 'enemy',
            });
          }

          cleanseTargetEffects(t, skill.afflictionRemoveType);
        });
      }

      // On Skill Use Damage Rules (Punição por usar Habilidade)
      if (skill.onSkillUseDamageRules && skill.onSkillUseDamageRules.length > 0) {
        skill.onSkillUseDamageRules.forEach(rule => {
          if (!rule.damage || rule.damage <= 0) return;
          const ruleTargets = resolveEffectTargets(rule.target || 'target', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
          const duration = rule.duration || 1;
          const damageType = rule.damageType || 'direct_damage';
          ruleTargets.forEach(t => {
            if (t.isDead) return;
            pushActiveEffect(t, {
              name: `${skill.name} (Punição por Skill)`,
              type: 'on_skill_use_damage',
              value: rule.damage,
              duration,
              damageType,
              icon: skill.icon,
              irremovable: !!rule.irremovable,
              cannotBeCountered: !!skill.cannotBeCountered,
              cannotBeReflected: !!skill.cannotBeReflected,
              casterId: source.id,
              casterSide: action.isPlayer ? 'player' : 'enemy',
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `⚔️ ${t.character.name} sofrerá ${rule.damage} de dano a cada habilidade usada por [${skill.name}] por ${duration} turnos!`,
              type: 'buff',
            });
            addFloatingText(t.id, 'PUNIÇÃO POR SKILL', 'effect');
          });
        });
      }

      // Cannot Reduce Damage - debuff on target
      if (skill.cannotReduceDamageDuration && skill.cannotReduceDamageDuration > 0) {
        const cannotReduceTargets = resolveEffectTargets(skill.cannotReduceDamageTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        cannotReduceTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.cannotReduceDamageDuration!;
          pushActiveEffect(t, {
            name: `${skill.name} (Incapaz de Reduzir Dano)`,
            type: 'cannot_reduce_damage',
            duration,
            icon: skill.icon,
            irremovable: !!skill.cannotReduceDamageIrremovable,
            cannotBeCountered: !!skill.cannotBeCountered,
            cannotBeReflected: !!skill.cannotBeReflected,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🚫 ${t.character.name} ficou incapaz de reduzir dano por [${skill.name}] por ${duration} turnos!`,
            type: 'buff',
          });
          addFloatingText(t.id, 'SEM REDUÇÃO DE DANO', 'effect');
          cleanseTargetEffects(t, skill.cannotReduceDamageRemoveType);
        });
      }

      // Cannot Be Invulnerable - debuff on target
      if (skill.cannotBeInvulnerableDuration && skill.cannotBeInvulnerableDuration > 0) {
        const cannotInvulTargets = resolveEffectTargets(skill.cannotBeInvulnerableTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        cannotInvulTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.cannotBeInvulnerableDuration!;
          pushActiveEffect(t, {
            name: `${skill.name} (Incapaz de Ficar Invulnerável)`,
            type: 'cannot_be_invulnerable',
            duration,
            icon: skill.icon,
            irremovable: !!skill.cannotBeInvulnerableIrremovable,
            cannotBeCountered: !!skill.cannotBeCountered,
            cannotBeReflected: !!skill.cannotBeReflected,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🚫 ${t.character.name} ficou incapaz de se tornar invulnerável por [${skill.name}] por ${duration} turnos!`,
            type: 'buff',
          });
          addFloatingText(t.id, 'SEM INVULNERABILIDADE', 'effect');
          cleanseTargetEffects(t, skill.cannotBeInvulnerableRemoveType);
        });
      }

      // Cannot Receive Friendly Skills - debuff on target
      if (skill.cannotReceiveFriendlyDuration && skill.cannotReceiveFriendlyDuration > 0) {
        const cannotFriendlyTargets = resolveEffectTargets(skill.cannotReceiveFriendlyTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        cannotFriendlyTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.cannotReceiveFriendlyDuration!;
          pushActiveEffect(t, {
            name: `${skill.name} (Bloqueio Amigável)`,
            type: 'cannot_receive_friendly',
            duration,
            icon: skill.icon,
            irremovable: !!skill.cannotReceiveFriendlyIrremovable,
            cannotBeCountered: !!skill.cannotBeCountered,
            cannotBeReflected: !!skill.cannotBeReflected,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🚫 ${t.character.name} ficou impossibilitado de receber habilidades amigáveis por [${skill.name}] por ${duration} turnos!`,
            type: 'buff',
          });
          addFloatingText(t.id, 'BLOQUEIO AMIGÁVEL', 'effect');
          cleanseTargetEffects(t, skill.cannotReceiveFriendlyRemoveType);
        });
      }

      // Reveal Invisible
      if (skill.revealInvisibleDuration && skill.revealInvisibleDuration > 0) {
        const revealTargets = resolveEffectTargets(skill.revealInvisibleTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        revealTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.revealInvisibleDuration!;
          pushActiveEffect(t, {
            name: `${skill.name} (Revelar Skills Invisíveis)`,
            type: 'reveal_invisible',
            duration,
            icon: skill.icon,
            irremovable: !!skill.revealInvisibleIrremovable,
            cannotBeCountered: !!skill.cannotBeCountered,
            cannotBeReflected: !!skill.cannotBeReflected,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `👁️ ${t.character.name} teve suas habilidades e efeitos invisíveis revelados por [${skill.name}] por ${duration} turnos!`,
            type: 'buff',
          });
          addFloatingText(t.id, '👁️ SKILLS REVELADAS', 'effect');
          cleanseTargetEffects(t, skill.revealInvisibleRemoveType);
        });
      }

      // 4.11 APPLY IGNORE STUN (IGNORAR STUN)
      if (skill.ignoreStunDuration && skill.ignoreStunDuration > 0) {
        const ignoreStunTargets = resolveEffectTargets(skill.ignoreStunTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        ignoreStunTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.ignoreStunDuration!;
          pushActiveEffect(t, {
            name: `${skill.name} (Ignorar Stun)`,
            type: 'ignore_stun',
            duration,
            icon: skill.icon,
            irremovable: !!skill.ignoreStunIrremovable,
            cannotBeCountered: !!skill.cannotBeCountered,
            cannotBeReflected: !!skill.cannotBeReflected,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `⚡ ${t.character.name} está imune a stuns por [${skill.name}] por ${duration} turnos!`,
            type: 'buff',
          });
          addFloatingText(t.id, 'IMUNE A STUN', 'effect');
          cleanseTargetEffects(t, skill.ignoreStunRemoveType);
        });
      }

      // 4.12 APPLY DAMAGE IMMUNITY (IMUNIDADE A DANO)
      if (skill.damageImmunityDuration && skill.damageImmunityDuration > 0) {
        const immunityTargets = resolveEffectTargets(skill.damageImmunityTarget || skill.shieldTarget || 'Self', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        immunityTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.damageImmunityDuration!;
          pushActiveEffect(t, {
            name: `${skill.name} (Imunidade a Dano)`,
            type: 'damage_immunity',
            duration,
            icon: skill.icon,
            irremovable: !!skill.damageImmunityIrremovable,
            cannotBeCountered: !!skill.cannotBeCountered,
            cannotBeReflected: !!skill.cannotBeReflected,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🛡️ ${t.character.name} está imune a dano por [${skill.name}] por ${duration} turnos!`,
            type: 'buff',
          });
          addFloatingText(t.id, 'IMUNE A DANO', 'effect');
          cleanseTargetEffects(t, skill.damageImmunityRemoveType);
        });
      }

      // Immortal effect: Immediate activation upon skill use OR when HP ≤ threshold
      const isImmortalByImmediate = (skill.immortalDuration && skill.immortalDuration > 0) && (skill.immortalImmediate || (!skill.immortalHpThreshold && skill.immortalImmediate !== false));
      const isImmortalByThreshold = skill.immortalHpThreshold && skill.immortalHpThreshold > 0 && source.health <= skill.immortalHpThreshold && source.activeEffects.some(e => e.name.startsWith(skill.name));
      if (isImmortalByImmediate || isImmortalByThreshold) {
        const immDuration = skill.immortalDuration || 3;
        const alreadyImmortal = source.activeEffects.some(e => e.type === 'immortal');
        if (!alreadyImmortal) {
          pushActiveEffect(source, {
            name: `${skill.name} (Imortal)`,
            type: 'immortal',
            duration: immDuration,
            icon: skill.icon,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(), turn,
            message: `💪 ${source.character.name} ativou IMORTALIDADE por ${immDuration} turnos!`,
            type: 'buff',
          });
          addFloatingText(source.id, '💪 IMORTAL', 'effect');
        }
      }

      // Counter Attack (applied as debuff on the selected target)
      if (skill.counterAttack) {
        applyBuffEffect(`${skill.name} Counter`, 'counter', skill.counterAttackDuration || 2, 0, false, true);
      }

      // Reflect (applied as debuff on the selected target)
      if (skill.reflect) {
        applyBuffEffect(`${skill.name} Reflect`, 'reflect', skill.reflectDuration || 2, 0, false, true);
      }

      // Retaliation Damage Buff
      if (skill.retaliateDamage) {
        const retTargets = resolveEffectTargets(skill.retaliateDamageTarget || 'Self', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList, true);
        const retDur = (skill.retaliateDamagePermanent || (skill.retaliateDamageDuration && skill.retaliateDamageDuration >= 999)) ? 99999 : (skill.retaliateDamageDuration || 1);
        retTargets.forEach(t => {
          if (t.isDead) return;
          pushActiveEffect(t, {
            name: `${skill.name} Retaliação`,
            type: 'retaliate_damage',
            duration: retDur,
            value: skill.retaliateDamageVal || 0,
            retaliateDamageVal: skill.retaliateDamageVal || 0,
            retaliateDamageType: skill.retaliateDamageType || 'damage',
            retaliateTargetScope: skill.retaliateTargetScope || 'self',
            retaliateTriggerMode: skill.retaliateTriggerMode || 'always',
            icon: skill.icon,
            irremovable: !!skill.retaliateDamageIrremovable,
            sourceSkillName: skill.name,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
            targetId: t.id,
          });
          newLogs.push({
            id: Math.random().toString(), turn,
            message: `⚡ ${t.character.name} ativou RETALIAÇÃO com [${skill.name}]!`,
            type: 'buff',
          });
          addFloatingText(t.id, 'RETALIAÇÃO', 'effect');
          cleanseTargetEffects(t, skill.retaliateDamageRemoveType);
        });
      }

      // Cleanse / Purify Debuffs (Multi-selection)
      if (skill.cleanseDebuffs || (skill.cleanseDebuffTypes && skill.cleanseDebuffTypes.length > 0)) {
        const cleanseTargets = resolveEffectTargets(skill.cleanseDebuffTarget || 'Self', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList, true);
        cleanseTargets.forEach(t => {
          if (t.isDead) return;
          cleanseSpecificDebuffs(t, skill.cleanseDebuffTypes || ['all_debuffs']);
        });
      }

      // Permanent skill auto-effect: if skill is permanent and no other effect was applied, add a custom buff
      if (skill.permanent && defaultTarget && !defaultTarget.isDead) {
        const hasAppliedEffect = !!(skill.damage || skill.directDamage || skill.heal || skill.shieldVal ||
          skill.damageReductionVal || skill.damageBuffVal || skill.damageDebuffVal || skill.dotVal ||
          skill.bleedingVal || skill.afflictionVal || skill.stunTurns || skill.invulnerableDuration ||
          skill.gainChakra || skill.drainChakra || skill.removeChakra || skill.stealChakra ||
          skill.invisible || skill.paralyzeCooldownDuration || skill.cannotReduceDamageDuration ||
          skill.cannotBeInvulnerableDuration || skill.cannotReceiveFriendlyDuration || skill.counterAttack || skill.reflect || skill.retaliateDamage ||
          (skill.damageDuration && skill.damageDuration > 1) || skill.damageRules?.length ||
          skill.costRules?.length || skill.chakraRemoveRules?.length || skill.healRules?.length);
        if (!hasAppliedEffect) {
          pushActiveEffect(defaultTarget, {
            name: skill.name,
            type: 'custom',
            duration: 99999,
            icon: skill.icon,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(), turn,
            message: `♾️ [${skill.name}] de ${source.character.name} foi aplicado permanentemente em ${defaultTarget.character.name}!`,
            type: 'buff',
          });
          addFloatingText(defaultTarget.id, '♾️ PERMANENTE', 'effect');
        }
      }

      // Stack-only skill: apply stack even if skill has no damage/effects
      if (skill.stackable && skill.stackType && !skill.damage && !skill.directDamage && !skill.shieldVal && !skill.damageReductionVal && !skill.damageBuffVal && !skill.damageDebuffVal && !skill.dotVal && !skill.bleedingVal && !skill.afflictionVal && !skill.stunTurns && !skill.invulnerableDuration && !skill.counterAttack && !skill.reflect && !skill.heal && !skill.paralyzeCooldownDuration && !skill.cannotReduceDamageDuration && !skill.cannotBeInvulnerableDuration && !skill.cannotReceiveFriendlyDuration && !skill.immortalHpThreshold && !skill.invisibleDuration && !skill.removeShieldDuration && !skill.damageDuration && !skill.directDamageDuration && !skill.healDuration && !skill.permanent) {
         const targets = resolveEffectTargets(skill.stackTarget, target, source, sourceList, targetList, true);
        targets.forEach(t => {
          if (t.isDead) return;
          const existing = t.activeEffects.find(e => e.stackType === skill.stackType && e.type === 'custom' && e.sourceSkillName === skill.name);
          if (existing) {
            existing.stacks = (existing.stacks || 1) + 1;
            existing.duration = Math.max(existing.duration, skill.stackDuration ?? 999);
          } else {
            t.activeEffects.push({
              name: `${skill.stackType || skill.name} (Stack)`,
              type: 'custom',
              value: 0,
              duration: skill.stackDuration ?? 999,
              icon: skill.icon,
              stackable: true,
              stackType: skill.stackType || skill.name,
              casterId: source.id,
              casterSide: action.isPlayer ? 'player' : 'enemy',
              sourceSkillName: skill.name,
              stacks: 1,
              castTurn: turn,
            });
          }
          if (!newLogs.some(l => l.message.includes(`stack [${skill.stackType}]`))) {
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `📚 ${t.character.name} recebeu stack [${skill.stackType}] de ${source.character.name} via [${skill.name}]!`,
              type: 'buff',
            });
          }
          addFloatingText(t.id, `+1 ${skill.stackType.toUpperCase()}`, 'effect');
        });
      }

      // CAPTURE AND ARREST TRAP APPLICATION (Iruka Umino)
      if (skill.captureAndArrest || (skill.name && skill.name.toLowerCase().includes('capture') && skill.name.toLowerCase().includes('arrest'))) {
        const captureTargets = resolveEffectTargets(skill.targetType || 'Enemy', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        captureTargets.forEach(t => {
          if (t.isDead) return;
          pushActiveEffect(t, {
            name: 'Captureand Arrest (Armadilha)',
            type: 'capture_arrest_trap',
            duration: 1,
            icon: skill.icon,
            isInvisible: true,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
            sourceSkillName: skill.name,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🥷 ${source.character.name} usou [${skill.name}] em ${t.character.name}! (Armadilha Invisível instalada)`,
            type: 'buff',
          });
        });
      }

      // CAPTURE AND ARREST TRAP TRIGGER (Iruka Umino)
      if (source.activeEffects && source.activeEffects.length > 0) {
        const trapEff = source.activeEffects.find(e => e.type === 'capture_arrest_trap' || (e.name && e.name.includes('Captureand Arrest')));
        if (trapEff) {
          const isOffensive = isOffensiveSkill || skill.targetType === 'Enemy' || skill.targetType === 'AllEnemies' || (skill.damage || 0) > 0 || (skill.directDamage || 0) > 0;
          if (isOffensive) {
            source.activeEffects = source.activeEffects.filter(e => e !== trapEff);

            if (checkCombatantInvulnerable(source) || hasDamageImmunity(source)) {
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `🪤 [CAPTURE AND ARREST] ${source.character.name} usou [${skill.name}] e ativou a armadilha de Iruka, mas é IMUNE A DANO!`,
                type: 'buff',
              });
              addFloatingText(source.id, 'IMUNE!', 'invulnerable');
            } else {
              let actualDmg = 40;
              if (source.shield > 0) {
                if (source.shield >= actualDmg) {
                  source.shield -= actualDmg;
                  actualDmg = 0;
                } else {
                  actualDmg -= source.shield;
                  source.shield = 0;
                }
              }

              if (actualDmg > 0) {
                source.health = source.activeEffects?.some(e => e.type === 'immortal')
                  ? Math.max(1, source.health - actualDmg)
                  : Math.max(0, source.health - actualDmg);
              }

              if (source.health <= 0 && !source.activeEffects?.some(e => e.type === 'immortal')) {
                source.isDead = true;
              }

              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `🪤 [CAPTURE AND ARREST] ${source.character.name} usou a habilidade ofensiva [${skill.name}] e ATIVOU a armadilha de Iruka! Sofreu 40 de dano!`,
                type: 'damage',
              });
              addFloatingText(source.id, '-40 ARMADILHA!', 'damage');
            }

            pushActiveEffect(source, {
              name: 'Captureand Arrest (Vulnerabilidade)',
              type: 'capture_arrest_debuff',
              value: 15,
              duration: 1,
              icon: trapEff.icon || skill.icon,
              casterId: trapEff.casterId,
              casterSide: trapEff.casterSide,
              sourceSkillName: 'Captureand Arrest',
            });

            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `⚠️ [CAPTURE AND ARREST] ${source.character.name} receberá +15 de dano adicional de habilidades Físicas e de Chakra por 1 turno!`,
              type: 'buff',
            });
            addFloatingText(source.id, '+15 DANO RECEBIDO (FÍSICO/CHAKRA)', 'effect');
          }
        }
      }

      // ON SKILL USE DAMAGE PUNISHMENT TRIGGER
      if (source.activeEffects && source.activeEffects.length > 0) {
        source.activeEffects.forEach(eff => {
          if (eff.type !== 'on_skill_use_damage') return;
          const dmgVal = eff.value || 0;
          if (dmgVal <= 0 || source.isDead) return;

          if (checkCombatantInvulnerable(source) || hasDamageImmunity(source)) {
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `⚔️ [PUNIÇÃO POR SKILL] ${source.character.name} usou uma habilidade, mas é IMUNE A DANO!`,
              type: 'buff',
            });
            addFloatingText(source.id, 'IMUNE!', 'invulnerable');
          } else {
            let actualDmg = dmgVal;
            const dmgType = eff.damageType || 'direct_damage';
            if (dmgType === 'damage') {
              if (source.shield > 0) {
                if (source.shield >= actualDmg) {
                  source.shield -= actualDmg;
                  actualDmg = 0;
                } else {
                  actualDmg -= source.shield;
                  source.shield = 0;
                }
              }
            }

            if (actualDmg > 0) {
              source.health = source.activeEffects?.some(e => e.type === 'immortal')
                ? Math.max(1, source.health - actualDmg)
                : Math.max(0, source.health - actualDmg);
            }

            if (source.health <= 0 && !source.activeEffects?.some(e => e.type === 'immortal')) {
              source.isDead = true;
            }

            const typeText = dmgType === 'direct_damage' || dmgType === 'piercing' ? 'Direto' :
                             dmgType === 'affliction' ? 'Aflição' :
                             dmgType === 'dot' ? 'Queimadura' :
                             dmgType === 'bleeding' ? 'Sangramento' : 'Normal';

            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `⚔️ [PUNIÇÃO POR SKILL] ${source.character.name} usou [${skill.name}] e sofreu ${dmgVal} de dano ${typeText}!`,
              type: 'damage',
            });
            addFloatingText(source.id, `-${dmgVal} PUNIÇÃO`, 'damage');
          }
        });
      }

      // RETALIATION / REACTIVE DAMAGE TRIGGER
      const defendingTeam = targetList.some(c => c.id === target.id) ? targetList : sourceList;
      const isEnemyAction = source.id.startsWith('player') !== target.id.startsWith('player') || targetList.some(c => c.id === target.id);

      if (isEnemyAction) {
        defendingTeam.forEach(defender => {
          if (defender.isDead) return;
          defender.activeEffects.forEach(eff => {
            if (eff.type !== 'retaliate_damage') return;

            const isSelfTargeted = defender.id === target.id;
            const isAllyTargeted = defender.id !== target.id && defendingTeam.some(c => c.id === target.id);
            const scope = eff.retaliateTargetScope || 'self';

            let scopeMatch = false;
            if (scope === 'self' && isSelfTargeted) scopeMatch = true;
            else if (scope === 'ally' && isAllyTargeted) scopeMatch = true;
            else if (scope === 'self_or_ally' && (isSelfTargeted || isAllyTargeted)) scopeMatch = true;
            else if (scope === 'team') scopeMatch = true;

            if (!scopeMatch) return;

            // Check trigger mode (first_only vs always)
            if (eff.retaliateTriggerMode === 'first_only') {
              if ((eff.retaliateTriggeredCount || 0) > 0) return;
              eff.retaliateTriggeredCount = 1;
            }

            // Apply Retaliation Damage to source (attacker)
            const baseRVal = eff.retaliateDamageVal || eff.value || 0;
            const stacks = (eff as any).stacks || 1;
            const rVal = baseRVal * stacks;
            const rType = eff.retaliateDamageType || 'damage';

            if (rVal > 0 && !source.isDead) {
              if (checkCombatantInvulnerable(source) || hasDamageImmunity(source)) {
                newLogs.push({
                  id: Math.random().toString(),
                  turn,
                  message: `⚡ [RETALIAÇÃO] ${defender.character.name} contra-atacou, mas ${source.character.name} é IMUNE A DANO!`,
                  type: 'buff',
                });
                addFloatingText(source.id, 'IMUNE!', 'invulnerable');
              } else {
                let actualDmg = rVal;
                if (rType === 'damage') {
                  if (source.shield > 0) {
                    if (source.shield >= actualDmg) {
                      source.shield -= actualDmg;
                      actualDmg = 0;
                    } else {
                      actualDmg -= source.shield;
                      source.shield = 0;
                    }
                  }
                }

                if (actualDmg > 0) {
                  source.health = source.activeEffects?.some(e => e.type === 'immortal')
                    ? Math.max(1, source.health - actualDmg)
                    : Math.max(0, source.health - actualDmg);
                }

                if (source.health <= 0 && !source.activeEffects?.some(e => e.type === 'immortal')) {
                  source.isDead = true;
                }

                const typeText = rType === 'direct_damage' || rType === 'true' || rType === 'piercing' ? 'Direto' :
                                 rType === 'affliction' ? 'Aflição' :
                                 rType === 'dot' ? 'Queimadura' :
                                 rType === 'bleeding' ? 'Sangramento' : 'Normal';

                const stackText = stacks > 1 ? ` (${stacks}x stacks)` : '';

                newLogs.push({
                  id: Math.random().toString(),
                  turn,
                  message: `⚡ [RETALIAÇÃO] ${defender.character.name} causou ${rVal} de dano ${typeText}${stackText} em ${source.character.name}!`,
                  type: 'damage',
                });
                addFloatingText(source.id, `-${rVal} RETALIAÇÃO`, 'damage');
              }
            }
          });
        });
      }

      // Check deaths immediately after actions
      sourceList.forEach(c => {
        if (c.health <= 0 && !c.isDead && !c.activeEffects.some(e => e.type === 'immortal')) {
          c.isDead = true;
          newLogs.push({ id: Math.random().toString(), turn, message: `💀 ${c.character.name} CAIU EM BATALHA!`, type: 'death' });
          playCustomSound('Death');
          addFloatingText(c.id, 'DERROTADO', 'damage');
        }
        // Activate immortality if HP drops below threshold
        const immSkill = c.character.skills.find(s => s.immortalHpThreshold && s.immortalHpThreshold > 0 && c.health <= s.immortalHpThreshold);
        const skillEffectActive = immSkill ? c.activeEffects.some(e => e.name.startsWith(immSkill.name)) : false;
        if (immSkill && !c.activeEffects.some(e => e.type === 'immortal') && skillEffectActive) {
          const immDur = immSkill.immortalDuration || 3;
          pushActiveEffect(c, {
            name: `${immSkill.name} (Imortal)`,
            type: 'immortal',
            duration: immDur,
            icon: immSkill.icon,
            casterId: c.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({ id: Math.random().toString(), turn, message: `💪 ${c.character.name} ativou IMORTALIDADE por ${immSkill.immortalDuration || 3} turnos (HP ≤ ${immSkill.immortalHpThreshold})!`, type: 'buff' });
          addFloatingText(c.id, '💪 IMORTAL', 'effect');
        }
      });
      targetList.forEach(c => {
        if (c.health <= 0 && !c.isDead && !c.activeEffects.some(e => e.type === 'immortal')) {
          c.isDead = true;
          newLogs.push({ id: Math.random().toString(), turn, message: `💀 ${c.character.name} CAIU EM BATALHA!`, type: 'death' });
          playCustomSound('Death');
          addFloatingText(c.id, 'DERROTADO', 'damage');
        }
      });
    });

    // Save updated state
    setPlayerChakra({ ...localPlayerChakra });
    setEnemyChakra({ ...localEnemyChakra });
    playerRef.current = updatedPlayer;
    enemyRef.current = updatedEnemy;
    setPlayerCombatants(updatedPlayer);
    setEnemyCombatants(updatedEnemy);
    setLogs(prev => [...prev, ...newLogs]);

    // Check game over
    const allPlayerDead = updatedPlayer.length > 0 && updatedPlayer.every(p => p.isDead);
    const allEnemyDead = updatedEnemy.length > 0 && updatedEnemy.every(e => e.isDead);

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
    const srcPlayer = playerRef.current.length ? playerRef.current : playerCombatants;
    const srcEnemy = enemyRef.current.length ? enemyRef.current : enemyCombatants;
    const updatedPlayer = srcPlayer.map(c => ({ ...c }));
    const updatedEnemy = srcEnemy.map(c => ({ ...c }));

    const applyTurnEndUpdates = (combatantList: CombatCharacter[], name: string) => {
      combatantList.forEach(c => {
        if (c.isDead) return;

        // Apply active DoTs (e.g. Amaterasu)
        const dotEffects = c.activeEffects.filter(e => e.type === 'dot');
        dotEffects.forEach(dot => {
          if (checkCombatantInvulnerable(c, 'dot') || hasDamageImmunity(c)) {
            newLogs.push({ id: Math.random().toString(), turn, message: `🛡️ ${c.character.name} é IMUNE A DANO e ignorou o dano de queima por ${dot.name}.`, type: 'buff' });
            addFloatingText(c.id, 'IMUNE!', 'invulnerable');
          } else {
            c.health = Math.max(0, c.health - (dot.value || 0));
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🔥 ${c.character.name} sofreu ${(dot.value || 0)} de dano de queima por ${dot.name}.`,
              type: 'damage',
            });
            addFloatingText(c.id, `-${(dot.value || 0)} HP (QUEIMA)`, 'damage');
          }
        });

        // Apply dynamic Normal Damage over time (damage) - blocked if invulnerable
        const activeDamageEffects = c.activeEffects.filter(e => e.type === 'damage' && e.castTurn !== turn);
        const isInvulnerable = checkCombatantInvulnerable(c, 'damage') || hasDamageImmunity(c);
        activeDamageEffects.forEach(dmg => {
          if (isInvulnerable) {
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🛡️ ${c.character.name} é IMUNE A DANO e não sofreu dano contínuo de ${dmg.name}.`,
              type: 'buff',
            });
            addFloatingText(c.id, 'IMUNE!', 'invulnerable');
          } else {
            const targetCannotReduce = c.activeEffects.some(e => e.type === 'cannot_reduce_damage');
            const targetReductions = targetCannotReduce ? [] : c.activeEffects.filter(e => e.type === 'damage_reduction');
            const reductionSum = targetReductions.reduce((acc, curr) => acc + (curr.value || 0), 0);
            const netDmg = Math.max(0, (dmg.value || 0) - reductionSum);
            c.health = Math.max(0, c.health - netDmg);
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `💥 ${c.character.name} sofreu ${netDmg} de dano contínuo por ${dmg.name}.`,
              type: 'damage',
            });
            addFloatingText(c.id, `-${netDmg} HP (DANO)`, 'damage');
          }
        });

        // Apply dynamic Direct Damage over time (direct_damage)
        const activeDirectDamageEffects = c.activeEffects.filter(e => e.type === 'direct_damage');
        activeDirectDamageEffects.forEach(dd => {
          if (checkCombatantInvulnerable(c, 'direct_damage') || hasDamageImmunity(c)) {
            newLogs.push({ id: Math.random().toString(), turn, message: `🛡️ ${c.character.name} é IMUNE A DANO e ignorou o dano direto contínuo por ${dd.name}.`, type: 'buff' });
            addFloatingText(c.id, 'IMUNE!', 'invulnerable');
          } else {
            const dr = c.activeEffects.some((e: ActiveEffect) => e.type === 'cannot_reduce_damage') ? 0
              : c.activeEffects.filter((e: ActiveEffect) => e.type === 'damage_reduction').reduce((a: number, e: ActiveEffect) => a + (e.value || 0), 0);
            const netDd = Math.max(0, (dd.value || 0) - dr);
            c.health = Math.max(0, c.health - netDd);
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🎯 ${c.character.name} sofreu ${netDd} de dano direto contínuo por ${dd.name}.`,
              type: 'damage',
            });
            addFloatingText(c.id, `-${netDd} HP (DIRETO)`, 'damage');
          }
        });

        // Apply Bleeding (Sangramento)
        const bleedingEffects = c.activeEffects.filter(e => e.type === 'bleeding');
        bleedingEffects.forEach(bleed => {
          if (checkCombatantInvulnerable(c, 'bleeding') || hasDamageImmunity(c)) {
            newLogs.push({ id: Math.random().toString(), turn, message: `🛡️ ${c.character.name} é IMUNE A DANO e ignorou o sangramento (${bleed.name}).`, type: 'buff' });
            addFloatingText(c.id, 'IMUNE!', 'invulnerable');
          } else {
            c.health = Math.max(0, c.health - (bleed.value || 0));
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🩸 ${c.character.name} sofreu ${(bleed.value || 0)} de dano por sangramento (${bleed.name}).`,
              type: 'damage',
            });
            addFloatingText(c.id, `-${(bleed.value || 0)} HP (SANGRAMENTO)`, 'damage');
          }
        });

        // Apply Affliction (Aflição)
        const afflictionEffects = c.activeEffects.filter(e => e.type === 'affliction');
        afflictionEffects.forEach(aff => {
          if (checkCombatantInvulnerable(c, 'affliction') || hasDamageImmunity(c)) {
            newLogs.push({ id: Math.random().toString(), turn, message: `🛡️ ${c.character.name} é IMUNE A DANO e ignorou a aflição (${aff.name}).`, type: 'buff' });
            addFloatingText(c.id, 'IMUNE!', 'invulnerable');
          } else {
            c.health = Math.max(0, c.health - (aff.value || 0));
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `💀 ${c.character.name} sofreu ${(aff.value || 0)} de dano por aflição (${aff.name}).`,
              type: 'damage',
            });
            addFloatingText(c.id, `-${(aff.value || 0)} HP (AFLIÇÃO)`, 'damage');
          }
        });

        // Apply dynamic Healing over time
        const activeHealEffects = c.activeEffects.filter(e => e.type === 'heal');
        activeHealEffects.forEach(hl => {
          const startingHealth = c.health;
          c.health = Math.min(100, c.health + (hl.value || 0));
          const actualHealed = c.health - startingHealth;
          if (actualHealed > 0) {
            checkAndGrantOrigamiLotusGathering(c, actualHealed, newLogs, [...updatedPlayer, ...updatedEnemy]);
          }
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `💚 ${c.character.name} recuperou ${(hl.value || 0)} de vida por ${hl.name}.`,
            type: 'heal',
          });
          addFloatingText(c.id, `+${(hl.value || 0)} HP (REGEN)`, 'heal');
        });

        // Check if dead now
        if (c.health <= 0 && !c.activeEffects.some(e => e.type === 'immortal')) {
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

        // Decrement effect durations (skip effects cast in the current turn, skip permanent effects)
        c.activeEffects = c.activeEffects
          .map(eff => {
            if (eff.castTurn === turn || eff.duration >= 99999) {
              return eff;
            }
            return { ...eff, duration: eff.duration - 1 };
          })
          .filter(eff => eff.duration > 0);

        // Decrement skill cooldowns (unless paralyze cooldown is active)
        const isCooldownParalyzed = c.activeEffects.some(e => e.type === 'paralyze_cooldown');
        if (isCooldownParalyzed) {
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `⏳ Cooldowns de ${c.character.name} continuam PARALISADOS!`,
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

    // Check immortal threshold for all combatants (HP ≤ threshold triggers immortality)
    const checkImmortalThreshold = (combatantList: CombatCharacter[], sideChar: CombatCharacter[]) => {
      combatantList.forEach(c => {
        if (c.isDead) return;
        const immortalSkill = c.character.skills.find(s => s.immortalHpThreshold && s.immortalHpThreshold > 0 && c.health <= s.immortalHpThreshold);
        const skillEffectActive = immortalSkill ? c.activeEffects.some(e => e.name.startsWith(immortalSkill.name)) : false;
        if (immortalSkill && !c.activeEffects.some(e => e.type === 'immortal') && skillEffectActive) {
          const immDuration = immortalSkill.immortalDuration || 3;
          pushActiveEffect(c, {
            name: `${immortalSkill.name} (Imortal)`,
            type: 'immortal',
            duration: immDuration,
            icon: immortalSkill.icon,
            casterId: c.id,
            casterSide: sideChar === updatedPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(), turn,
            message: `💪 ${c.character.name} ativou IMORTALIDADE por ${immortalSkill.immortalDuration || 3} turnos (HP ≤ ${immortalSkill.immortalHpThreshold})!`,
            type: 'buff',
          });
          addFloatingText(c.id, '💪 IMORTAL', 'effect');
        }
      });
    };
    checkImmortalThreshold(updatedPlayer, updatedPlayer);
    checkImmortalThreshold(updatedEnemy, updatedEnemy);

    // Check continuous chakra remove rules for active damage effects
    {
      const allCombatants = [...updatedPlayer, ...updatedEnemy];
      const continuousTypes = new Set(['damage', 'direct_damage', 'dot', 'bleeding', 'affliction']);
      const processedSkills = new Set<string>();

      allCombatants.forEach(target => {
        if (target.isDead) return;
        const continuousEffects = target.activeEffects.filter(e => continuousTypes.has(e.type) && e.casterId);
        continuousEffects.forEach(eff => {
          const effSkillName = eff.sourceSkillName || eff.name.replace(/\s*\(Dano Contínuo\)$/, '').replace(/\s*\(.*?\)$/, '').trim();
          const skillKey = `${eff.casterId}_${effSkillName}`;
          if (processedSkills.has(skillKey)) return;
          processedSkills.add(skillKey);

          const caster = allCombatants.find(c => c.id === eff.casterId);
          if (!caster || caster.isDead) return;
          const skill = caster.character.skills.find(s => s.name === effSkillName);
          if (!skill || !skill.chakraRemoveRules || skill.chakraRemoveRules.length === 0) return;

          const targetIsPlayer = updatedPlayer.some(p => p.id === target.id);
          for (const rule of skill.chakraRemoveRules) {
            if (!rule.activeSkillName || rule.removeAmount <= 0) continue;
            const targetNameLower = rule.activeSkillName.trim().toLowerCase();
            const isCondActive = allCombatants.some(c =>
              c.activeEffects.some(e => {
                if (!e.name) return false;
                const eNameLower = e.name.toLowerCase();
                return eNameLower === targetNameLower || eNameLower.includes(targetNameLower);
              })
            );
            if (isCondActive) {
              const victimSetter = targetIsPlayer ? setPlayerChakra : setEnemyChakra;
              victimSetter(prev => {
                const pool = { ...prev };
                const types = (Object.keys(pool) as (keyof ChakraPool)[]).filter(k => pool[k] > 0);
                let removed = 0;
                for (let i = 0; i < rule.removeAmount; i++) {
                  if (types.length === 0) break;
                  const randIdx = Math.floor(Math.random() * types.length);
                  const randType = types[randIdx];
                  pool[randType]--;
                  if (pool[randType] <= 0) types.splice(randIdx, 1);
                  removed++;
                }
                if (removed > 0) {
                  const affectedStr = (Object.keys(pool) as (keyof ChakraPool)[])
                    .filter(k => pool[k] < prev[k])
                    .map(k => k).join(', ');
                  newLogs.push({
                    id: Math.random().toString(), turn,
                    message: `🔥 [CONTÍNUO] ${caster.character.name} usou [${skill.name}] com [${rule.activeSkillName}] ativo e removeu ${removed} chakra aleatório do estoque inimigo (${affectedStr})!`,
                    type: 'chakra',
                  });
                  addFloatingText(target.id, `-${removed} CHAKRA REMOVIDO`, 'effect');
                }
                return pool;
              });
            }
          }
        });
      });
    }

    playerRef.current = updatedPlayer;
    enemyRef.current = updatedEnemy;
    setPlayerCombatants(updatedPlayer);
    setEnemyCombatants(updatedEnemy);

    // Check game over
    const allPlayerDead = updatedPlayer.length > 0 && updatedPlayer.every(p => p.isDead);
    const allEnemyDead = updatedEnemy.length > 0 && updatedEnemy.every(e => e.isDead);

    if (allPlayerDead || allEnemyDead) {
      if (allPlayerDead && allEnemyDead) setGameOver('defeat');
      else if (allPlayerDead) setGameOver('defeat');
      else setGameOver('victory');
      return;
    }

    // Save current turn skill usage for requirePreviousSkill
    lastTurnUsedSkills.current = currentTurnUsedSkills.current;
    currentTurnUsedSkills.current = {};

    // Advance turn
    const nextTurn = turn + 1;
    setTurn(nextTurn);

    // Roll initiative for new turn (50/50 chance)
    const newFirstPlayer: 'player' | 'enemy' = Math.random() < 0.5 ? 'player' : 'enemy';
    setActivePlanner(newFirstPlayer);
    setPassedPlayersThisTurn([]);

    // Roll chakra for the new turn (1 per alive character on each team)
    const alivePlayerCount = updatedPlayer.filter(c => !c.isDead).length;
    const aliveEnemyCount = updatedEnemy.filter(c => !c.isDead).length;
    rollChakraForTurn(true, alivePlayerCount);
    rollChakraForTurn(false, aliveEnemyCount);

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

  // Reset turn lock when turn or active planner updates
  useEffect(() => {
    isEndingTurnRef.current = false;
    turnActionLockedRef.current = false;
    setIsEndingTurn(false);
  }, [turn, activePlanner]);

  // Main End Turn / Pass Turn handler
  const handleEndTurn = (customRandAllocation?: ChakraPool, skipActions?: boolean) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      playCustomSound('Error');
      setShowNoInternetModal(true);
      isEndingTurnRef.current = false;
      turnActionLockedRef.current = false;
      setIsEndingTurn(false);
      return;
    }

    isEndingTurnRef.current = true;
    turnActionLockedRef.current = true;
    setIsEndingTurn(true);

    playCustomSound('NextTurn');

    const currentActions = skipActions ? [] : [...cuedActions];
    setCuedActions([]);
    setSelectedSkill(null);

    const isCurrentPlayer = activePlanner === 'player';

    const isGameOver = executeSideActions(currentActions, isCurrentPlayer, customRandAllocation);
    if (isGameOver) {
      isEndingTurnRef.current = false;
      turnActionLockedRef.current = false;
      setIsEndingTurn(false);
      return;
    }

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
      const passedName = activePlanner === 'player' ? 'VOCÊ' : 'OPONENTE';
      setLogs(prev => [
        ...prev,
        {
          id: Math.random().toString(),
          turn,
          message: `⚔️ ${passedName} finalizou a fase de planejamento. Vez de ${nextPlanner === 'player' ? 'VOCÊ' : 'OPONENTE'} planejar.`,
          type: 'system',
        }
      ]);
    } else {
      setIsWaitingForOpponent(false);
      executeTurnEndResolution();
    }

    isEndingTurnRef.current = false;
    turnActionLockedRef.current = false;
    setIsEndingTurn(false);
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
                  if (canAffordSkill(skill, testPool, aiChar, [...playerCombatants, ...enemyCombatants])) {
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
                if (!canAffordSkill(skill, tempAiChakra, aiChar, [...playerCombatants, ...enemyCombatants])) return false;
                if (skill.requireEffect) {
                  const reqLower = skill.requireEffect.toLowerCase();
                  const hasReq = aiChar.activeEffects.some(e => e.name && (e.name.toLowerCase() === reqLower || e.name.toLowerCase().startsWith(reqLower) || e.name.toLowerCase().includes(reqLower)));
                  if (!hasReq) return false;
                }
                if (skill.requirePreviousSkill) {
                  const prevSkills = lastTurnUsedSkills.current[aiChar.id];
                  const hasPrev = prevSkills && prevSkills.has(skill.requirePreviousSkill);
                  if (!hasPrev) return false;
                }
                if (skill.requireHpBelow && skill.requireHpBelow > 0 && aiChar.health > skill.requireHpBelow) return false;
                
                // requireTargetEffect: check if there's at least one valid target with the effect
                if (skill.requireTargetEffect) {
                  const reqLower = skill.requireTargetEffect.toLowerCase();
                  let hasValidTarget = false;
                  
                  if (skill.targetType === 'Enemy' || skill.targetType === 'AllEnemies') {
                    hasValidTarget = alivePlayers.some(t => 
                      t.activeEffects.some(e => e.name && (e.name.toLowerCase() === reqLower || e.name.toLowerCase().startsWith(reqLower) || e.name.toLowerCase().includes(reqLower)))
                    );
                  } else if (skill.targetType === 'Ally' || skill.targetType === 'AllAllies' || skill.targetType === 'SelfAndAlly') {
                    hasValidTarget = aliveAllies.some(t => 
                      t.activeEffects.some(e => e.name && (e.name.toLowerCase() === reqLower || e.name.toLowerCase().startsWith(reqLower) || e.name.toLowerCase().includes(reqLower)))
                    );
                  }
                  
                  if (!hasValidTarget) return false;
                }
                
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
                // requireTargetEffect: AI must only target enemies with this effect active
                if (skill.requireTargetEffect) {
                  const reqLower = skill.requireTargetEffect.toLowerCase();
                  const targetHasEffect = target.activeEffects.some(e => e.name && (e.name.toLowerCase() === reqLower || e.name.toLowerCase().startsWith(reqLower) || e.name.toLowerCase().includes(reqLower)));
                  if (!targetHasEffect) {
                    continue; // Skip this target
                  }
                }
                
                let score = 0;

                const targetIsEnemy = target.id.startsWith('player');
                const hasInvulnerable = checkCombatantInvulnerable(target);
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

                  if (skill.damageRules && skill.damageRules.length > 0) {
                    score += 200;
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
  }, [activePlanner, passedPlayersThisTurn.includes('enemy'), gameOver, isSandbox, onlineParams?.isOnline, turn]);

  const [showSurrenderModal, setShowSurrenderModal] = useState(false);
  const [showNoInternetModal, setShowNoInternetModal] = useState(false);
  const [showSandboxConfirmModal, setShowSandboxConfirmModal] = useState(false);
  const [dontShowSandboxConfirmAgain, setDontShowSandboxConfirmAgain] = useState(false);

  // Random Chakra Selection Modal State
  const [showRandChakraModal, setShowRandChakraModal] = useState(false);
  const [randModalData, setRandModalData] = useState<{
    actions: CuedAction[];
    isPlayerSide: boolean;
    queuedSkillsWithRand: { charName: string; skillName: string; randCount: number; icon?: string }[];
    totalRandRequired: number;
    fixedCosts: ChakraPool;
    availablePoolForRand: ChakraPool;
  } | null>(null);
  const [randAllocation, setRandAllocation] = useState<ChakraPool>({ Tai: 0, Nin: 0, Gen: 0, Blood: 0 });

  // Chakra Notification Toast State
  const [chakraToast, setChakraToast] = useState<{
    id: string;
    message: string;
    type: 'stolen' | 'removed' | 'lost' | 'info';
  } | null>(null);

  const triggerChakraToast = (message: string, type: 'stolen' | 'removed' | 'lost' | 'info') => {
    setChakraToast({
      id: Math.random().toString(),
      message,
      type,
    });
    try {
      playCustomSound('StartTurn');
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (chakraToast) {
      const timer = setTimeout(() => setChakraToast(null), 3800);
      return () => clearTimeout(timer);
    }
  }, [chakraToast]);

  const getChakraName = (k: keyof ChakraPool | string): string => {
    switch (k) {
      case 'Tai': return 'Taijutsu';
      case 'Nin': return 'Ninjutsu';
      case 'Gen': return 'Genjutsu';
      case 'Blood': return 'Kekkei Genkai';
      default: return k;
    }
  };

  const checkAndProceedWithEndTurn = (customRandAllocation?: ChakraPool) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      playCustomSound('Error');
      setShowNoInternetModal(true);
      turnActionLockedRef.current = false;
      isEndingTurnRef.current = false;
      setIsEndingTurn(false);
      return;
    }

    turnActionLockedRef.current = true;
    isEndingTurnRef.current = true;
    setIsEndingTurn(true);

    if (customRandAllocation) {
      handleEndTurn(customRandAllocation);
      return;
    }

    const isCurrentPlayer = activePlanner === 'player';
    const sideCombatants = isCurrentPlayer ? playerCombatants : enemyCombatants;
    const sideChakra = isCurrentPlayer ? playerChakra : enemyChakra;

    const sideActions = cuedActions.filter(a => sideCombatants.some(p => p.id === a.sourceId));

    const queuedSkillsWithRand: { charName: string; skillName: string; randCount: number; icon?: string }[] = [];
    let totalRandRequired = 0;
    const fixedCosts: ChakraPool = { Tai: 0, Nin: 0, Gen: 0, Blood: 0 };

    sideActions.forEach(action => {
      const src = sideCombatants.find(p => p.id === action.sourceId);
      if (!src) return;
      const skill = src.character.skills[action.skillIndex];
      const effectiveCost = getEffectiveSkillCost(skill, src, [...playerCombatants, ...enemyCombatants]);

      let randCount = 0;
      effectiveCost.forEach(cost => {
        if (cost === 'Rand') {
          randCount++;
        } else {
          const elem = cost as keyof ChakraPool;
          fixedCosts[elem] = (fixedCosts[elem] || 0) + 1;
        }
      });

      if (randCount > 0) {
        queuedSkillsWithRand.push({
          charName: src.character.name,
          skillName: skill.name,
          randCount,
          icon: skill.icon,
        });
        totalRandRequired += randCount;
      }
    });

    // Check if player has enough chakra to cover the sum of fixed + rand costs of all queued skills
    const hasEnoughFixedChakra = 
      fixedCosts.Tai <= sideChakra.Tai &&
      fixedCosts.Nin <= sideChakra.Nin &&
      fixedCosts.Gen <= sideChakra.Gen &&
      fixedCosts.Blood <= sideChakra.Blood;

    const totalRemainingForRand = 
      Math.max(0, sideChakra.Tai - fixedCosts.Tai) +
      Math.max(0, sideChakra.Nin - fixedCosts.Nin) +
      Math.max(0, sideChakra.Gen - fixedCosts.Gen) +
      Math.max(0, sideChakra.Blood - fixedCosts.Blood);

    if (isCurrentPlayer && (!hasEnoughFixedChakra || totalRemainingForRand < totalRandRequired)) {
      playCustomSound('Error');
      turnActionLockedRef.current = false;
      isEndingTurnRef.current = false;
      setIsEndingTurn(false);
      addFloatingText(sideCombatants[0]?.id || 'p1', 'CHAKRA INSUFICIENTE!', 'damage');
      setChakraToast({
        id: Math.random().toString(),
        message: 'Chakra insuficiente para a soma de todas as habilidades selecionadas!',
        type: 'lost',
      });
      return;
    }

    if (totalRandRequired > 0 && isCurrentPlayer) {
      const availablePoolForRand: ChakraPool = {
        Tai: Math.max(0, sideChakra.Tai - fixedCosts.Tai),
        Nin: Math.max(0, sideChakra.Nin - fixedCosts.Nin),
        Gen: Math.max(0, sideChakra.Gen - fixedCosts.Gen),
        Blood: Math.max(0, sideChakra.Blood - fixedCosts.Blood),
      };

      const initialAllocation: ChakraPool = { Tai: 0, Nin: 0, Gen: 0, Blood: 0 };
      const tempAvail = { ...availablePoolForRand };
      for (let i = 0; i < totalRandRequired; i++) {
        const sorted = (Object.keys(tempAvail) as (keyof ChakraPool)[]).sort((a, b) => tempAvail[b] - tempAvail[a]);
        const highest = sorted[0];
        if (tempAvail[highest] > 0) {
          tempAvail[highest]--;
          initialAllocation[highest]++;
        }
      }

      setRandModalData({
        actions: sideActions,
        isPlayerSide: isCurrentPlayer,
        queuedSkillsWithRand,
        totalRandRequired,
        fixedCosts,
        availablePoolForRand,
      });
      setRandAllocation(initialAllocation);
      setShowRandChakraModal(true);
      turnActionLockedRef.current = false;
      isEndingTurnRef.current = false;
      setIsEndingTurn(false);
      playClickSound();
      return;
    }

    handleEndTurn();
  };

  const handleEndTurnClick = () => {
    if (isEndingTurnRef.current || isEndingTurn || turnActionLockedRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      playCustomSound('Error');
      setShowNoInternetModal(true);
      return;
    }

    if (isSandbox && !dontShowSandboxConfirmAgain) {
      playClickSound();
      setShowSandboxConfirmModal(true);
    } else {
      checkAndProceedWithEndTurn();
    }
  };

  const handleSurrender = () => {
    playClickSound();
    playScrollSound();
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

  // 60-Second Turn Timer State & Effect
  const [timeLeft, setTimeLeft] = useState(60);
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

  // Periodic background online room-state polling & turn sync (1 second)
  useEffect(() => {
    if (!onlineParams?.isOnline || gameOver) return;

    const syncInterval = setInterval(() => {
      fetch(`/api/match/room-state?roomId=${onlineParams.roomId}&username=${encodeURIComponent(user.username)}`)
        .then(r => r.json())
        .then(data => {
          if (!data.success || !data.room) return;

          if (data.room.surrenderedBy) {
            const surrenderedUser = data.room.surrenderedBy.toLowerCase();
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

          // Check online turn state sync
          const myOnlineIndex = onlineParams.playerIndex === 2 ? 1 : 0;
          const oppOnlineIndex = myOnlineIndex === 0 ? 1 : 0;
          const currentTurnActions = data.room.turnActions?.[turn];

          if (currentTurnActions) {
            const oppKey = `player${oppOnlineIndex}` as 'player0' | 'player1';
            const oppActions = currentTurnActions[oppKey];

            if (oppActions !== null && !processedOpponentTurnsRef.current.has(turn)) {
              processedOpponentTurnsRef.current.add(turn);

              // Execute opponent's actions on our screen as enemy actions
              const mappedOppActions: CuedAction[] = (oppActions || []).map(act => ({
                ...act,
                sourceId: act.sourceId.startsWith('player')
                  ? act.sourceId.replace('player', 'enemy')
                  : act.sourceId.replace('enemy', 'player'),
                targetId: act.targetId.startsWith('player')
                  ? act.targetId.replace('player', 'enemy')
                  : act.targetId.replace('enemy', 'player'),
              }));

              executeSideActions(mappedOppActions, false);

              setPassedPlayersThisTurn(prev => {
                const newPassed: ('player' | 'enemy')[] = [...prev, 'enemy'];
                if (newPassed.length >= 2) {
                  setIsWaitingForOpponent(false);
                  setTimeout(() => {
                    executeTurnEndResolution();
                  }, 300);
                } else {
                  setActivePlanner('player');
                  setIsWaitingForOpponent(false);
                  setTimeLeft(60);
                  setLogs(l => [
                    ...l,
                    {
                      id: Math.random().toString(),
                      turn,
                      message: `⚔️ OPONENTE finalizou a fase de planejamento. Vez de VOCÊ planejar.`,
                      type: 'system',
                    }
                  ]);
                }
                return newPassed;
              });
            }
          }
        })
        .catch(err => console.error('Online match sync error:', err));
    }, 1000);

    return () => clearInterval(syncInterval);
  }, [onlineParams, gameOver, user, turn]);

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
          ...c.character,
          skills: (c.character.skills || []).map(s => ({
            ...s
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

    // Reset countdown to 60 seconds (1 minute) for the new active turn/planning phase
    setTimeLeft(60);

    const timerInterval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerInterval);
          // Auto-pass turn when time runs out (does NOT execute cued skills)
          handleEndTurnRef.current(undefined, true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [turn, gameOver, isWaitingForOpponent, activePlanner]);

  const executeTurnSimulation = (playerActions: CuedAction[] = [], enemyActions: CuedAction[] = []) => {
    const newLogs: CombatLog[] = [];
    const localPlayerChakra = { ...playerChakra };
    const localEnemyChakra = { ...enemyChakra };
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
      const currentSkill = (source as any)?._executingSkill;
      let resultTargets: CombatCharacter[] = [];
      const isAllEnemies = targetOverride === 'AllEnemies' ||
                           ((!targetOverride || targetOverride === 'Target') && currentSkill?.targetType === 'AllEnemies');

      if (isAllEnemies) {
        resultTargets = targetList.filter(c => !c.isDead && (!checkCombatantInvulnerable(c, currentSkill) || currentSkill?.ignoreInvulnerable));
      } else {
        const isAllAllies = targetOverride === 'AllAllies' ||
                            ((!targetOverride || targetOverride === 'Target') && currentSkill?.targetType === 'AllAllies');

        if (isAllAllies) {
          resultTargets = sourceList.filter(c => !c.isDead);
        } else if (!targetOverride || targetOverride === 'Target') {
          if (isBeneficial) {
            const sourceIsPlayer = updatedPlayer.some(p => p.id === source.id);
            const targetIsPlayer = updatedPlayer.some(p => p.id === defaultTarget.id);
            if (sourceIsPlayer !== targetIsPlayer) {
              resultTargets = [source];
            } else {
              resultTargets = [defaultTarget];
            }
          } else {
            resultTargets = [defaultTarget];
          }
        } else if (targetOverride === 'Self') resultTargets = [source];
        else if (targetOverride === 'Both') resultTargets = [source, defaultTarget];
        else if (targetOverride === 'SelfAndAlly') {
          if (sourceList.some(c => c.id === defaultTarget.id && c.id !== source.id)) {
            resultTargets = Array.from(new Set([source, defaultTarget]));
          } else {
            const allies = sourceList.filter(c => c.id !== source.id && !c.isDead);
            resultTargets = allies.length > 0 ? Array.from(new Set([source, allies[0]])) : [source];
          }
        }
        else if (targetOverride === 'Ally') {
          if (sourceList.some(c => c.id === defaultTarget.id)) resultTargets = [defaultTarget];
          else {
            const allies = sourceList.filter(c => c.id !== source.id && !c.isDead);
            resultTargets = allies.length > 0 ? [allies[0]] : [source];
          }
        } else if (targetOverride === 'AllAllies') {
          resultTargets = sourceList.filter(c => !c.isDead);
        } else if (targetOverride === 'AllEnemies') {
          resultTargets = targetList.filter(c => !c.isDead && (!checkCombatantInvulnerable(c, currentSkill) || currentSkill?.ignoreInvulnerable));
        } else if (targetOverride === 'AllLiving') {
          resultTargets = [...sourceList, ...targetList].filter(c => !c.isDead);
        } else if (targetOverride === 'AllNonInvulnerable') {
          resultTargets = [...sourceList, ...targetList].filter(c => !c.isDead && !checkCombatantInvulnerable(c, currentSkill));
        } else if (targetOverride === 'AllInvulnerable') {
          resultTargets = [...sourceList, ...targetList].filter(c => !c.isDead && checkCombatantInvulnerable(c, currentSkill));
        } else if (targetOverride === 'OneInvulnerable') {
          const invuls = [...sourceList, ...targetList].filter(c => !c.isDead && checkCombatantInvulnerable(c, currentSkill));
          resultTargets = invuls.length > 0 ? [invuls[0]] : [];
        } else if (targetOverride === 'OneInvulnerableAlly') {
          const allies = sourceList.filter(c => !c.isDead && checkCombatantInvulnerable(c, currentSkill));
          resultTargets = allies.length > 0 ? [allies[0]] : [];
        } else if (targetOverride === 'SelfAndAllEnemies') {
          resultTargets = [source, ...targetList.filter(c => !c.isDead && (!checkCombatantInvulnerable(c, currentSkill) || currentSkill?.ignoreInvulnerable))];
        } else {
          resultTargets = [defaultTarget];
        }
      }

      return resultTargets;
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
      const allCombatants = [...updatedPlayer, ...updatedEnemy];

      const source = sourceList.find(c => c.id === action.sourceId);
      if (!source || source.isDead) return;

      const skill = source.character.skills[action.skillIndex];
      (source as any)._executingSkill = skill;
      currentSkillRef.current = skill;

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

      // CHECK DO NOT APPLY IF ACTIVE
      if (skill.doNotApplyIfActive && isSkillActiveOnTarget(target, skill.name)) {
        newLogs.push({
          id: Math.random().toString(),
          turn,
          message: `⚠️ [${skill.name}] de ${source.character.name} não foi aplicada em ${target.character.name} pois a habilidade já está ativa no alvo.`,
          type: 'buff',
        });
        addFloatingText(target.id, 'JÁ ATIVA NO ALVO!', 'effect');
        return;
      }

      // CHECK INVULNERABILITY
      if (skill.targetType === 'AllEnemies') {
        const livingTargets = targetList.filter(c => !c.isDead);
        const allInvulnerable = livingTargets.length > 0 && livingTargets.every(c => checkCombatantInvulnerable(c, skill));
        if (allInvulnerable && !skill.ignoreInvulnerable) {
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🛡️ ${source.character.name} usou [${skill.name}], mas TODOS os inimigos estão INVULNERÁVEIS!`,
            type: 'buff',
          });
          addFloatingText(target.id, 'TODOS INVULNERÁVEIS', 'invulnerable');
        }
      } else {
        const isInvulnerable = checkCombatantInvulnerable(target, skill);
        if (isInvulnerable && !skill.ignoreInvulnerable) {
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🛡️ ${source.character.name} usou [${skill.name}] em ${target.character.name}, mas o alvo está INVULNERÁVEL!`,
            type: 'buff',
          });
          addFloatingText(target.id, 'INVULNERÁVEL', 'invulnerable');
        }
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
          if (!action.isPlayer) {
            matchStatsRef.current.countersReflects += 1;
            matchStatsRef.current.counterRecords.push({
              charName: foundReflect.def.character.name,
              tags: foundReflect.def.character.tags || [],
              skillName: skill.name
            });
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
            if (!action.isPlayer) {
              matchStatsRef.current.countersReflects += 1;
              matchStatsRef.current.counterRecords.push({
                charName: target.character.name,
                tags: target.character.tags || [],
                skillName: skill.name
              });
            }
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
        matchStatsRef.current.skillUseRecords.push({
          charName: source.character.name,
          tags: source.character.tags || [],
          skillName: skill.name
        });
      }

      // RETALIATION / REACTIVE DAMAGE TRIGGER
      const defendingTeam = targetList.some(c => c.id === target.id) ? targetList : sourceList;
      const isEnemyAction = source.id.startsWith('player') !== target.id.startsWith('player') || targetList.some(c => c.id === target.id);

      if (isEnemyAction) {
        defendingTeam.forEach(defender => {
          if (defender.isDead) return;
          defender.activeEffects.forEach(eff => {
            if (eff.type !== 'retaliate_damage') return;

            const isSelfTargeted = defender.id === target.id;
            const isAllyTargeted = defender.id !== target.id && defendingTeam.some(c => c.id === target.id);
            const scope = eff.retaliateTargetScope || 'self';

            let scopeMatch = false;
            if (scope === 'self' && isSelfTargeted) scopeMatch = true;
            else if (scope === 'ally' && isAllyTargeted) scopeMatch = true;
            else if (scope === 'self_or_ally' && (isSelfTargeted || isAllyTargeted)) scopeMatch = true;
            else if (scope === 'team') scopeMatch = true;

            if (!scopeMatch) return;

            // Check trigger mode (first_only vs always)
            if (eff.retaliateTriggerMode === 'first_only') {
              if ((eff.retaliateTriggeredCount || 0) > 0) return;
              eff.retaliateTriggeredCount = 1;
            }

            // Apply Retaliation Damage to source (attacker)
            const baseRVal = eff.retaliateDamageVal || eff.value || 0;
            const stacks = (eff as any).stacks || 1;
            const rVal = baseRVal * stacks;
            const rType = eff.retaliateDamageType || 'damage';

            if (rVal > 0 && !source.isDead) {
              if (checkCombatantInvulnerable(source) || hasDamageImmunity(source)) {
                newLogs.push({
                  id: Math.random().toString(),
                  turn,
                  message: `⚡ [RETALIAÇÃO] ${defender.character.name} contra-atacou, mas ${source.character.name} é IMUNE A DANO!`,
                  type: 'buff',
                });
                addFloatingText(source.id, 'IMUNE!', 'invulnerable');
              } else {
                let actualDmg = rVal;
                if (rType === 'damage') {
                  if (source.shield > 0) {
                    if (source.shield >= actualDmg) {
                      source.shield -= actualDmg;
                      actualDmg = 0;
                    } else {
                      actualDmg -= source.shield;
                      source.shield = 0;
                    }
                  }
                }

                if (actualDmg > 0) {
                  source.health = source.activeEffects?.some(e => e.type === 'immortal')
                    ? Math.max(1, source.health - actualDmg)
                    : Math.max(0, source.health - actualDmg);
                }

                if (source.health <= 0 && !source.activeEffects?.some(e => e.type === 'immortal')) {
                  source.isDead = true;
                }

                const typeText = rType === 'direct_damage' || rType === 'true' ? 'Direto' :
                                 rType === 'affliction' ? 'Aflição' :
                                 rType === 'dot' ? 'Queimadura' :
                                 rType === 'bleeding' ? 'Sangramento' : 'Normal';

                const stackText = stacks > 1 ? ` (${stacks}x stacks)` : '';

                newLogs.push({
                  id: Math.random().toString(),
                  turn,
                  message: `⚡ [RETALIAÇÃO] ${defender.character.name} contra-atacou! ${source.character.name} recebeu ${rVal} de dano ${typeText}${stackText} por usar [${skill.name}] em ${target.character.name}!`,
                  type: 'damage',
                });
                addFloatingText(source.id, `-${rVal} RETALIAÇÃO`, 'damage');
              }
            }
          });
        });
      }

      // EXECUTE SKILL LOGIC
      let baseDamage = skill.damage || 0;
      let directDamage = skill.directDamage || 0;

      // Process Damage Rules (Regras de Dano) Block 2
      let costRuleDamageBoost2 = 0;
      let ruleDirectDamage2 = 0;
      let ruleAfflictionDamage2 = 0;
      let ruleBleedingDamage2 = 0;
      let ruleDotDamage2 = 0;
      let hasActiveDamageRuleIgnoreBase2 = false;

      if (skill.damageRules && skill.damageRules.length > 0) {
        const allActiveEffects = allCombatants.flatMap(c => c.activeEffects);
        for (const rule of skill.damageRules) {
          if (rule.damageBoost > 0 && rule.activeSkillName) {
            const targetNameLower = rule.activeSkillName.trim().toLowerCase();
            const hasActive = allActiveEffects.some(e => {
              if (!e.name) return false;
              const eNameLower = e.name.toLowerCase();
              return eNameLower === targetNameLower || eNameLower.includes(targetNameLower) || targetNameLower.includes(eNameLower);
            });
            if (hasActive) {
              if (rule.ignoreBaseDamage !== false) {
                hasActiveDamageRuleIgnoreBase2 = true;
              }
              const dtype = rule.damageType || 'damage';
              if (dtype === 'direct_damage' || dtype === 'piercing') {
                ruleDirectDamage2 += rule.damageBoost;
              } else if (dtype === 'affliction') {
                ruleAfflictionDamage2 += rule.damageBoost;
              } else if (dtype === 'bleeding') {
                ruleBleedingDamage2 += rule.damageBoost;
              } else if (dtype === 'dot') {
                ruleDotDamage2 += rule.damageBoost;
              } else {
                costRuleDamageBoost2 += rule.damageBoost;
              }
            }
          }
        }
      }

      if (hasActiveDamageRuleIgnoreBase2) {
        baseDamage = 0;
        directDamage = 0;
      }

      if (skill.missingHpDamageType === 'normal') {
        baseDamage += Math.max(0, source.maxHealth - source.health);
      }

      // Apply bonus damage per missing HP step rule in Block 2 (Regra de Dano por HP Perdido)
      if (skill.bonusDamagePerMissingHp && skill.bonusDamagePerMissingHp > 0) {
        const hpSubject = (skill.missingHpSource === 'target' && target) ? target : source;
        const missingHp = Math.max(0, hpSubject.maxHealth - hpSubject.health);
        const step = (skill.missingHpStep && skill.missingHpStep > 0) ? skill.missingHpStep : 20;
        const stepCount = Math.floor(missingHp / step);
        const bonusDmg = stepCount * skill.bonusDamagePerMissingHp;
        if (bonusDmg > 0) {
          const bType = skill.missingHpBonusType || 'damage';
          if (bType === 'direct') ruleDirectDamage2 += bonusDmg;
          else if (bType === 'dot') ruleDotDamage2 += bonusDmg;
          else if (bType === 'bleeding') ruleBleedingDamage2 += bonusDmg;
          else if (bType === 'affliction') ruleAfflictionDamage2 += bonusDmg;
          else baseDamage += bonusDmg;
        }
      }
      const dotInstant = skill.dotInstant || 0;
      const bleedingInstant = skill.bleedingInstant || 0;
      const afflictionInstant = skill.afflictionInstant || 0;
      let healAmt = skill.heal || 0;
      let stunApplied = (skill.stunTurns && skill.stunTurns > 0) ? true : false;
      let stunDuration = skill.stunTurns || 1;
      let finalStunType: string[] | undefined = skill.stunType;
      if (stunApplied && (!finalStunType || finalStunType.length === 0)) {
        finalStunType = ['physical', 'mental', 'affliction', 'chakra'];
      }
      if (source.activeEffects.some(e => e.name === 'Sharingan Stun Buff')) {
        stunApplied = true;
        stunDuration = 1;
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

      // Custom skill script matching based on name (legacy matching removed except for Young Nagato):
      if ((skill.name === 'Air Bullets' || skill.name.toLowerCase().includes('air bullets')) && target && !target.isDead) {
        airBulletsHitTargets.current.set(target.id, skill.icon);
      }

      // If skill is permanent, make all its effects last forever
      if (skill.permanent && effectDuration > 0) {
        effectDuration = 99999;
      }

      // Permanent auto-effect: ensure a custom buff shows even if no effect fields are configured
      if (skill.permanent && !effectName && target && !target.isDead) {
        const checkFields = skill.damage || skill.directDamage || skill.heal || skill.shieldVal ||
          skill.damageReductionVal || skill.damageBuffVal || skill.damageDebuffVal || skill.dotVal ||
          skill.bleedingVal || skill.afflictionVal || skill.stunTurns || skill.invulnerableDuration ||
          skill.gainChakra || skill.drainChakra || skill.removeChakra || skill.stealChakra ||
          skill.invisible || skill.paralyzeCooldownDuration || skill.cannotReduceDamageDuration ||
          skill.cannotBeInvulnerableDuration || skill.counterAttack || skill.reflect;
        if (!checkFields) {
          effectName = skill.name;
          effectType = 'custom';
          effectDuration = 99999;
          effectVal = 0;
          newLogs.push({
            id: Math.random().toString(), turn,
            message: `♾️ [${skill.name}] de ${source.character.name} foi aplicado permanentemente em ${target.character.name}!`,
            type: 'buff',
          });
          addFloatingText(target.id, '♾️ PERMANENTE', 'effect');
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
            return !['stun', 'dot', 'bleeding', 'affliction', 'paralyze_cooldown', 'damage', 'direct_damage', 'cannot_reduce_damage', 'cannot_be_invulnerable'].includes(eff.type);
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

      const cleanseSpecificDebuffs = (t: CombatCharacter, debuffTypes: string[]) => {
        if (!debuffTypes || debuffTypes.length === 0) return;
        const beforeCount = t.activeEffects.length;
        const isAllDebuffs = debuffTypes.includes('all_debuffs') || debuffTypes.includes('debuff');

        t.activeEffects = t.activeEffects.filter(eff => {
          if (eff.irremovable) return true;

          if (isAllDebuffs) {
            const isDebuff = ['stun', 'dot', 'bleeding', 'affliction', 'paralyze_cooldown', 'damage', 'direct_damage', 'damage_debuff', 'cannot_reduce_damage', 'cannot_be_invulnerable', 'cannot_receive_friendly', 'on_skill_use_damage'].includes(eff.type);
            return !isDebuff;
          }

          if (debuffTypes.includes('affliction') && eff.type === 'affliction') return false;
          if (debuffTypes.includes('dot') && eff.type === 'dot') return false;
          if (debuffTypes.includes('bleeding') && eff.type === 'bleeding') return false;
          if (debuffTypes.includes('stun') && eff.type === 'stun') return false;
          if (debuffTypes.includes('paralyze_cooldown') && eff.type === 'paralyze_cooldown') return false;
          if (debuffTypes.includes('damage_debuff') && eff.type === 'damage_debuff') return false;
          if (debuffTypes.includes('cannot_reduce_damage') && eff.type === 'cannot_reduce_damage') return false;
          if (debuffTypes.includes('cannot_be_invulnerable') && eff.type === 'cannot_be_invulnerable') return false;
          if (debuffTypes.includes('cannot_receive_friendly') && eff.type === 'cannot_receive_friendly') return false;
          if (debuffTypes.includes('on_skill_use_damage') && eff.type === 'on_skill_use_damage') return false;

          return true;
        });

        const removedCount = beforeCount - t.activeEffects.length;
        if (removedCount > 0) {
          const typesName = isAllDebuffs ? 'Todos os Debuffs' : debuffTypes.map(d => {
            if (d === 'affliction') return 'Aflição';
            if (d === 'dot') return 'Dano por Turno';
            if (d === 'bleeding') return 'Sangramento';
            if (d === 'stun') return 'Atordoamento';
            if (d === 'paralyze_cooldown') return 'Paralisar Cooldown';
            if (d === 'damage_debuff') return 'Redução de Dano';
            if (d === 'cannot_reduce_damage') return 'Incapaz de Reduzir Dano';
            if (d === 'cannot_be_invulnerable') return 'Incapaz de Invulnerabilidade';
            if (d === 'cannot_receive_friendly') return 'Incapaz de Receber Efeitos Amigáveis';
            if (d === 'on_skill_use_damage') return 'Punição por Skill';
            return d;
          }).join(', ');

          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `✨ [PURIFICAÇÃO] ${t.character.name} teve ${removedCount} debuff(s) removido(s) (${typesName}) por [${skill.name}]!`,
            type: 'system',
          });
          addFloatingText(t.id, 'DEBUFFS REMOVIDOS', 'heal');
        }
      };

      const isSkillInvisible = !!skill.invisible || (skill.invisibleDuration !== undefined && skill.invisibleDuration > 0);
      const casterSide: 'player' | 'enemy' = action.isPlayer ? 'player' : 'enemy';

const pushActiveEffect = (targetChar: CombatCharacter, eff: ActiveEffect) => {
  if (targetChar.activeEffects.some(e => e.type === 'cannot_receive_friendly') && !isDebuffEffect(eff)) {
    addFloatingText(targetChar.id, 'BLOQUEADO (SKILL AMIGÁVEL)', 'stun');
    return;
  }

  if (eff.type === 'retaliate_damage') {
    const sourceName = eff.sourceSkillName || skill.name;
    const existing = targetChar.activeEffects.find(
      e => e.type === 'retaliate_damage' && (e.sourceSkillName === sourceName || e.name === eff.name)
    );
    if (existing) {
      existing.stacks = (existing.stacks || 1) + 1;
      existing.duration = Math.max(existing.duration, eff.duration);
      return;
    }
  }

  // Check if this effect is stackable
  const execSkill = currentSkillRef.current;
  const sourceSkill = eff.sourceSkillName ? source.character.skills.find(s => s.name === eff.sourceSkillName) : undefined;
  const skillFromEffectName = eff.name ? source.character.skills.find(s => s.name === eff.name || eff.name.startsWith(s.name)) : undefined;
  const isStackable = eff.stackable ?? execSkill?.stackable ?? sourceSkill?.stackable ?? skillFromEffectName?.stackable ?? false;
  const stackType = eff.stackType ?? execSkill?.stackType ?? sourceSkill?.stackType ?? skillFromEffectName?.stackType;
  const skillInvisible = execSkill?.invisible || (execSkill?.invisibleDuration !== undefined && execSkill?.invisibleDuration > 0);
  const sourceName = eff.sourceSkillName || execSkill?.name || sourceSkill?.name || skillFromEffectName?.name || eff.name;

  // Check stackDurationRules for duration override (skip for stack damage DOT effects)
  if (!eff.stackable && currentSkillRef.current?.stackDurationRules && !eff.name?.includes('DOT)') && !eff.name?.includes('Imunidade a Dano')) {
    for (const rule of currentSkillRef.current.stackDurationRules) {
      const hasStack = targetChar.activeEffects.some(
        e => e.stackType === rule.stackType && (e.stacks ?? 0) > 0
      );
      if (hasStack) {
        eff = { ...eff, duration: rule.durationOverride };
        break;
      }
    }
  }

  // Check if this effect is stackable and if we should stack with existing effects
  const effectiveStackType = stackType || (isStackable ? sourceName : undefined);
  if (isStackable || effectiveStackType || eff.type === 'retaliate_damage') {
    const existing = targetChar.activeEffects.find(
      e => (effectiveStackType && e.stackType === effectiveStackType) ||
           (effectiveStackType && e.sourceSkillName === sourceName) ||
           (e.type === eff.type && (e.sourceSkillName === sourceName || e.name === eff.name))
    );
    if (existing) {
      existing.stacks = (existing.stacks || 1) + 1;
      existing.duration = Math.max(existing.duration, eff.duration);
      if (effectiveStackType && !existing.stackType) existing.stackType = effectiveStackType;
      return;
    }
  }

  targetChar.activeEffects.push({
    ...eff,
    stacks: eff.stacks ?? 1,
    stackable: isStackable,
    stackType: effectiveStackType,
    icon: eff.icon || execSkill?.icon || sourceSkill?.icon || skillFromEffectName?.icon || skill.icon,
    sourceSkillName: sourceName,
    isInvisible: eff.isInvisible !== undefined ? eff.isInvisible : (skillInvisible || eff.type === 'invisible'),
    casterId: eff.casterId || source.id,
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

      // REMOVE COUNTER & REFLECT
      if (skill.removeCounterReflect) {
        const crTargets = resolveEffectTargets(skill.removeCounterReflectTarget || 'Target', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        crTargets.forEach(t => {
          if (t.isDead) return;
          const count = t.activeEffects.filter(e => !e.irremovable && ['counter_attack', 'counter', 'reflect'].includes(e.type)).length;
          t.activeEffects = t.activeEffects.filter(e => e.irremovable || !['counter_attack', 'counter', 'reflect'].includes(e.type));
          if (count > 0) {
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `⚔️⛔ [${skill.name}] de ${source.character.name} REMOVEU os Contra-Ataques / Refletir de ${t.character.name}!`,
              type: 'damage',
            });
            addFloatingText(t.id, 'CONTRA/REFLETIR REMOVIDO', 'stun');
          }
        });
      }

      // 0.2 DANO DIRETO (DIRECT DAMAGE) with missing HP
      let stackDamageBonusForDd2 = 0;
      if (skill.selfStackDamageRules && skill.selfStackDamageRules.length > 0) {
        for (const selfRule of skill.selfStackDamageRules) {
          if (selfRule.stackType && selfRule.damagePerStack > 0) {
            const selfStackEffect = source.activeEffects.find(e => e.stackType === selfRule.stackType || e.sourceSkillName === selfRule.stackType);
            const selfStackCount = selfStackEffect?.stacks || 0;
            if (selfStackCount > 0) {
              stackDamageBonusForDd2 += selfStackCount * selfRule.damagePerStack;
            }
          }
        }
      }
      if (skill.stackDamageRules && skill.stackDamageRules.length > 0) {
        for (const stackRule of skill.stackDamageRules) {
          if (stackRule.stackType && stackRule.damagePerStack > 0) {
            const stackPool = getStackPoolForRule(stackRule, target, source, sourceList, targetList);
            const stackCount = countStacksInPool(stackPool, stackRule.stackType);
            if (stackCount > 0 && !stackRule.duration) {
              stackDamageBonusForDd2 += stackCount * stackRule.damagePerStack;
            }
          }
        }
      }
      const missingHpDirect2 = skill.missingHpDamageType === 'direct' || skill.missingHpDamageType === 'normal' ? source.maxHealth - source.health : 0;
      let ddTotal = directDamage + missingHpDirect2 + ruleDirectDamage2 + stackDamageBonusForDd2;
      // Reduce by source's damage debuffs (qualquer tipo)
      const srcDdReduction2 = source.activeEffects
        .filter((e: ActiveEffect) => e.type === 'damage_debuff')
        .reduce((a: number, e: ActiveEffect) => a + (e.value || 0), 0);
      ddTotal = Math.max(0, ddTotal - srcDdReduction2);
      if (ddTotal > 0) {
        const directTargets = resolveEffectTargets(skill.directDamageTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        directTargets.forEach(t => {
          if (t.isDead) return;
          if (skill.directDamageDuration && skill.directDamageDuration > 1) {
            const duration = skill.directDamageDuration;
            pushActiveEffect(t, {
              name: `${skill.name} (Dano Direto Contínuo)`,
              type: 'direct_damage',
              value: ddTotal,
              duration,
              icon: skill.icon,
              irremovable: !!skill.directDamageIrremovable,
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🎯 ${t.character.name} recebeu [${skill.name}] de DANO DIRETO de ${ddTotal} por turno por ${duration} turnos!`,
              type: 'damage',
            });
            addFloatingText(t.id, `DANO DIRETO (${duration}T)`, 'damage');
          } else {
            const cannotReduce = t.activeEffects.some((e: ActiveEffect) => e.type === 'cannot_reduce_damage');
            const reductionTotal = cannotReduce ? 0
              : t.activeEffects.filter((e: ActiveEffect) => e.type === 'damage_reduction').reduce((a: number, e: ActiveEffect) => a + (e.value || 0), 0);
            const netDdTotal = hasDamageImmunity(t) ? 0 : Math.max(0, (ddTotal + getCaptureArrestBonusDamage(t, skill)) - reductionTotal);
            const startingHealth = t.health;
            t.health = Math.max(0, t.health - netDdTotal);
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

            if (netDdTotal > 0) {
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `🎯 [${skill.name}] de ${source.character.name} causou ${netDdTotal} de DANO DIRETO em ${t.character.name} (perfurando defesas).`,
                type: 'damage',
              });
              addFloatingText(t.id, `-${netDdTotal} HP (DIRETO)`, 'damage');
            } else if (hasDamageImmunity(t) || checkCombatantInvulnerable(t, skill)) {
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `🛡️ ${t.character.name} é IMUNE A DANO e não sofreu Dano Direto de [${skill.name}].`,
                type: 'buff',
              });
              addFloatingText(t.id, 'IMUNE!', 'invulnerable');
            }
          }
          cleanseTargetEffects(t, skill.directDamageRemoveType);
          // Any skill damaging an Air Bullets target triggers stun (refactored)
          if ((airBulletsHitTargets.current.has(t.id) || skill.name === 'Air Bullets' || skill.name.toLowerCase().includes('air bullets'))
            && !t.activeEffects.some((e: ActiveEffect) => e.name === 'Air Bullets Stun')) {
            t.activeEffects.push({
              name: 'Air Bullets Stun',
              type: 'stun',
              duration: 1,
              stunType: ['physical', 'mental', 'affliction', 'chakra'],
              icon: airBulletsHitTargets.current.get(t.id) || skill.icon,
              casterId: source.id,
              casterSide: action.isPlayer ? 'player' : 'enemy',
              castTurn: turn,
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `⚡ ${t.character.name} foi ATORDOADO por [Air Bullets] após sofrer dano!`,
              type: 'stun',
            });
            addFloatingText(t.id, 'ATORDOADO (Air Bullets)', 'stun');
          }
        });
      }

      // INSTANT DOT / BLEEDING / AFFLICTION (with missing HP)
      const missDot2 = skill.missingHpDamageType === 'dot' ? source.maxHealth - source.health : 0;
      const missBleed2 = skill.missingHpDamageType === 'bleeding' ? source.maxHealth - source.health : 0;
      const missAffl2 = skill.missingHpDamageType === 'affliction' ? source.maxHealth - source.health : 0;
      const isTargetInvul2 = (checkCombatantInvulnerable(target, skill) && !skill.ignoreInvulnerable) || hasDamageImmunity(target);
      const totalDotInstant2 = isTargetInvul2 ? 0 : dotInstant + missDot2;
      const totalBleedInstant2 = isTargetInvul2 ? 0 : bleedingInstant + missBleed2;
      const totalAfflictionInstant2 = isTargetInvul2 ? 0 : afflictionInstant + missAffl2;
      if (totalDotInstant2 > 0 && target && !target.isDead) {
        target.health = Math.max(0, target.health - totalDotInstant2);
        if (action.isPlayer) matchStatsRef.current.damageDealt += totalDotInstant2;
        newLogs.push({ id: Math.random().toString(), turn, message: `🔥 [${skill.name}] → ${target.character.name}: -${totalDotInstant2} HP (QUEIMA)${missDot2 > 0 ? ` [HP Perdido: ${missDot2}]` : ''}`, type: 'damage' });
        addFloatingText(target.id, `-${totalDotInstant2} HP (QUEIMA)`, 'damage');
      }
      if (totalBleedInstant2 > 0 && target && !target.isDead) {
        target.health = Math.max(0, target.health - totalBleedInstant2);
        if (action.isPlayer) matchStatsRef.current.damageDealt += totalBleedInstant2;
        newLogs.push({ id: Math.random().toString(), turn, message: `🩸 [${skill.name}] → ${target.character.name}: -${totalBleedInstant2} HP (SANGRAMENTO)${missBleed2 > 0 ? ` [HP Perdido: ${missBleed2}]` : ''}`, type: 'damage' });
        addFloatingText(target.id, `-${totalBleedInstant2} HP (SANGRAMENTO)`, 'damage');
      }
      if (totalAfflictionInstant2 > 0 && target && !target.isDead) {
        target.health = Math.max(0, target.health - totalAfflictionInstant2);
        if (action.isPlayer) matchStatsRef.current.damageDealt += totalAfflictionInstant2;
        newLogs.push({ id: Math.random().toString(), turn, message: `💀 [${skill.name}] → ${target.character.name}: -${totalAfflictionInstant2} HP (AFLICAO)${missAffl2 > 0 ? ` [HP Perdido: ${missAffl2}]` : ''}`, type: 'damage' });
        addFloatingText(target.id, `-${totalAfflictionInstant2} HP (AFLICAO)`, 'damage');
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
            performChakraAction(tIsPlayer, amt, source.character.name, t.character.name, skill.name, action.isPlayer, 'drain', source.id, t.id, newLogs, localPlayerChakra, localEnemyChakra);
          }
          cleanseTargetEffects(t, skill.drainChakraRemoveType);
        });
      }

      // REMOVE CHAKRA
      if (skill.removeChakra && skill.removeChakra > 0) {
        const amt = skill.removeChakra;
        const dur = skill.removeChakraDuration || 1;
        const removeChakraTargets = resolveEffectTargets(skill.removeChakraTarget || 'Target', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        removeChakraTargets.forEach(t => {
          if (t.isDead) return;
          if (dur > 1) {
            pushActiveEffect(t, {
              name: `Remoção de Chakra (${skill.name})`,
              type: 'custom', value: amt, duration: dur, icon: skill.icon,
              irremovable: !!skill.removeChakraIrremovable,
            });
            newLogs.push({ id: Math.random().toString(), turn, message: `🔥 [${skill.name}] → ${t.character.name}: -${amt} chakra/turno por ${dur}T`, type: 'chakra' });
            addFloatingText(t.id, 'REMOCAO CHAKRA CONTINUA', 'effect');
          } else {
            const tIsPlayer = updatedPlayer.some(p => p.id === t.id);
            performChakraAction(tIsPlayer, amt, source.character.name, t.character.name, skill.name, action.isPlayer, 'remove', source.id, t.id, newLogs, localPlayerChakra, localEnemyChakra);
          }
          cleanseTargetEffects(t, skill.removeChakraRemoveType);
        });
      }

      // STEAL CHAKRA
      if (skill.stealChakra && skill.stealChakra > 0) {
        const amt = skill.stealChakra;
        const dur = skill.stealChakraDuration || 1;
        const stealChakraTargets = resolveEffectTargets(skill.stealChakraTarget || 'Target', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        stealChakraTargets.forEach(t => {
          if (t.isDead) return;
          if (dur > 1) {
            pushActiveEffect(t, {
              name: `Roubo de Chakra (${skill.name})`,
              type: 'custom', value: amt, duration: dur, icon: skill.icon,
              irremovable: !!skill.stealChakraIrremovable,
            });
            newLogs.push({ id: Math.random().toString(), turn, message: `💰 [${skill.name}] → ${t.character.name}: -${amt} chakra/turno por ${dur}T`, type: 'chakra' });
            addFloatingText(t.id, 'ROUBO CHAKRA CONTINUO', 'effect');
          } else {
            const tIsPlayer = updatedPlayer.some(p => p.id === t.id);
            performChakraAction(tIsPlayer, amt, source.character.name, t.character.name, skill.name, action.isPlayer, 'steal', source.id, t.id, newLogs, localPlayerChakra, localEnemyChakra);
          }
          cleanseTargetEffects(t, skill.stealChakraRemoveType);
        });
      }

      // CHAKRA REMOVE RULES (conditional remove chakra when an ability is active)
      if (skill.chakraRemoveRules && skill.chakraRemoveRules.length > 0) {
        for (const rule of skill.chakraRemoveRules) {
          if (!rule.activeSkillName || rule.removeAmount <= 0) continue;
          const targetNameLower = rule.activeSkillName.trim().toLowerCase();
          const allActiveEffects = allCombatants.flatMap(c => c.activeEffects);
          const isReqActive = allActiveEffects.some(e => {
            if (!e.name) return false;
            const eNameLower = e.name.toLowerCase();
            return (
              eNameLower === targetNameLower ||
              eNameLower.startsWith(targetNameLower) ||
              eNameLower.includes(targetNameLower)
            );
          });
          if (isReqActive) {
            const targetSide = action.isPlayer ? updatedEnemy : updatedPlayer;
            const livingTargets = targetSide.filter(c => !c.isDead && !checkCombatantInvulnerable(c, skill));
            if (livingTargets.length > 0) {
              const t = livingTargets[0];
              const tIsPlayer = updatedPlayer.some(p => p.id === t.id);
              performChakraAction(tIsPlayer, rule.removeAmount, source.character.name, t.character.name, skill.name, action.isPlayer, 'remove', source.id, t.id, newLogs, localPlayerChakra, localEnemyChakra);
              newLogs.push({
                id: Math.random().toString(), turn,
                message: `🔥 [REGRA] ${source.character.name} usou [${skill.name}] com [${rule.activeSkillName}] ativo e removeu ${rule.removeAmount} chakra aleatório do estoque inimigo!`,
                type: 'chakra',
              });
            }
          }
        }
      }

      // 1. APPLY DAMAGE REDUCTION & SHIELDS FOR OFFENSE
      if (skill.damageDuration && skill.damageDuration > 1) {
        const duration = skill.damageDuration;
        const dmgVal = skill.damage || baseDamage;
        const damageTargets = resolveEffectTargets(skill.damageTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);

        damageTargets.forEach(t => {
          if (t.isDead) return;
          // Deal immediate first tick
          const startingShield = t.shield;
          const startingHealth = t.health;
          const sourceBuffs = source.activeEffects.filter(e => e.type === 'damage_buff');
          const damageBuffSum = sourceBuffs.reduce((acc, curr) => acc + (curr.value || 0), 0);
          const sourceDebuffs = source.activeEffects.filter((e: ActiveEffect) => {
            if (e.type !== 'damage_debuff') return false;
            if ((e as any).excludeAffliction) {
              const isAffliction = skill.classes?.some((c: string) => {
                const lower = c.toLowerCase();
                return lower.includes('aflição') || lower.includes('affliction');
              });
              if (isAffliction) return false;
            }
            const types = (e as any).debuffTypes as string[] | undefined;
            if (!types || types.length === 0) return true;
            return types.includes('skill');
          });
          const damageDebuffSum = sourceDebuffs.reduce((acc, curr) => acc + (curr.value || 0), 0);
          let costRuleDamageBoost = costRuleDamageBoost2;
          let finalDamage = dmgVal + damageBuffSum + costRuleDamageBoost + getCaptureArrestBonusDamage(t, skill) - damageDebuffSum;
          const targetCannotReduce = t.activeEffects.some(e => e.type === 'cannot_reduce_damage');
          let reductionSum = 0;
          if (!targetCannotReduce) {
            const targetReductions = t.activeEffects.filter(e => e.type === 'damage_reduction');
            reductionSum = targetReductions.reduce((acc, curr) => acc + (curr.value || 0), 0);
            if (skill.ignoreDamageReduction) reductionSum = 0;
            else if (typeof (skill as any).ignoreDamageReductionVal === 'number' && (skill as any).ignoreDamageReductionVal > 0)
              reductionSum = Math.max(0, reductionSum - (skill as any).ignoreDamageReductionVal);
          }
          finalDamage = Math.max(0, finalDamage - reductionSum);
          if (hasDamageImmunity(t)) finalDamage = 0;
          if (t.shield > 0) {
            if (t.shield >= finalDamage) {
              t.shield -= finalDamage;
              newLogs.push({ id: Math.random().toString(), turn, message: `🛡️ ${source.character.name} atingiu o escudo de ${t.character.name} com [${skill.name}] causando ${finalDamage} de dano ao escudo.`, type: 'buff' });
              addFloatingText(t.id, `-${finalDamage} ESCUDO`, 'shield');
              finalDamage = 0;
            } else {
              finalDamage -= t.shield;
              newLogs.push({ id: Math.random().toString(), turn, message: `💥 ${source.character.name} quebrou o escudo de ${t.character.name}!`, type: 'damage' });
              addFloatingText(t.id, 'ESCUDO QUEBRADO', 'shield');
              t.shield = 0;
            }
          }
          if (checkCombatantInvulnerable(t, skill) && !skill.ignoreInvulnerable) {
            finalDamage = 0;
            newLogs.push({ id: Math.random().toString(), turn, message: `🛡️ ${t.character.name} está INVULNERÁVEL e não sofreu dano de HP de [${skill.name}].`, type: 'buff' });
            addFloatingText(t.id, 'INVULNERÁVEL!', 'invulnerable');
          } else if (hasDamageImmunity(t)) {
            finalDamage = 0;
            newLogs.push({ id: Math.random().toString(), turn, message: `🛡️ ${t.character.name} é IMUNE A DANO e não sofreu dano de HP de [${skill.name}].`, type: 'buff' });
            addFloatingText(t.id, 'IMUNE!', 'invulnerable');
          }
          if (finalDamage > 0) {
            const before = t.health;
            t.health = t.activeEffects?.some(e => e.type === 'immortal') ? Math.max(1, t.health - finalDamage) : Math.max(0, t.health - finalDamage);
            newLogs.push({ id: Math.random().toString(), turn, message: `💥 ${source.character.name} usou [${skill.name}] causando ${finalDamage} de dano em ${t.character.name} (primeiro tick).`, type: 'damage' });
            addFloatingText(t.id, `-${finalDamage} HP`, 'damage');
            // Air Bullets stun check for normal damage
            if ((airBulletsHitTargets.current.has(t.id) || skill.name === 'Air Bullets' || skill.name.toLowerCase().includes('air bullets'))
              && !t.activeEffects.some((e: ActiveEffect) => e.name === 'Air Bullets Stun')) {
              t.activeEffects.push({
                name: 'Air Bullets Stun',
                type: 'stun',
                duration: 1,
                stunType: ['physical', 'mental', 'affliction', 'chakra'],
                icon: airBulletsHitTargets.current.get(t.id) || skill.icon,
                casterId: source.id,
                casterSide: action.isPlayer ? 'player' : 'enemy',
                castTurn: turn,
              });
              newLogs.push({ id: Math.random().toString(), turn, message: `⚡ ${t.character.name} foi ATORDOADO por [Air Bullets]!`, type: 'stun' });
              addFloatingText(t.id, 'ATORDOADO (Air Bullets)', 'stun');
            }
            if (action.isPlayer) {
              matchStatsRef.current.damageDealt += finalDamage;
              matchStatsRef.current.damageDealtRecords.push({ charName: source.character.name, tags: source.character.tags || [], skillName: skill.name, amount: finalDamage });
            }
            if (t.health === 0 && startingHealth > 0 && action.isPlayer) {
              matchStatsRef.current.killsWithSkill[skill.name] = (matchStatsRef.current.killsWithSkill[skill.name] || 0) + 1;
              matchStatsRef.current.killRecords.push({ charName: source.character.name, tags: source.character.tags || [], skillName: skill.name });
            }
          }
          // Apply remaining continuous damage (duration - 1)
          if (duration > 1 && !t.isDead) {
            pushActiveEffect(t, {
              name: `${skill.name} (Dano Contínuo)`,
              type: 'damage',
              value: dmgVal,
              duration: duration - 1,
              icon: skill.icon,
              irremovable: !!skill.damageIrremovable,
              casterId: source.id,
              casterSide: action.isPlayer ? 'player' : 'enemy',
              sourceSkillName: skill.name,
            });
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `💥 ${t.character.name} está sob efeito de [${skill.name}] sofrendo ${dmgVal} de dano por turno por mais ${duration - 1} turnos!`,
              type: 'damage',
            });
            addFloatingText(t.id, `DANO CONTÍNUO (${skill?.permanent ? '♾️ Permanente' : (duration - 1) + 'T'})`, 'damage');
          }
          cleanseTargetEffects(t, skill.damageRemoveType);
        });

        // Apply stack AFTER damage calculation so first hit uses existing stacks (not the new one)
        // Stack goes to stackTarget (e.g., Self), not damageTarget
        if (skill.stackable && skill.stackType) {
          const stackTargets = resolveEffectTargets(skill.stackTarget, target, source, sourceList, targetList, true);
          stackTargets.forEach(st => {
            if (st.isDead) return;
            pushActiveEffect(st, {
              name: `${skill.stackType || skill.name} (Stack)`,
              type: 'custom',
              value: 0,
              duration: skill.stackDuration ?? 999,
              icon: skill.icon,
              stackable: true,
              stackType: skill.stackType || skill.name,
              casterId: source.id,
              casterSide: action.isPlayer ? 'player' : 'enemy',
              sourceSkillName: skill.name,
            });
          });
        }

      } else if (baseDamage > 0 || (skill.damage || 0) > 0 || (skill.damageRules && skill.damageRules.length > 0) || (skill.stackDamageRules && skill.stackDamageRules.length > 0) || (skill.bonusDamagePerMissingHp && skill.bonusDamagePerMissingHp > 0)) {
        const damageTargets = resolveEffectTargets(skill.damageTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);

        damageTargets.forEach(t => {
          if (t.isDead) return;
          const startingShield = t.shield;
          const startingHealth = t.health;
          // Apply damage buff from source effects
          const sourceBuffs = source.activeEffects.filter(e => e.type === 'damage_buff');
          const damageBuffSum = sourceBuffs.reduce((acc, curr) => acc + (curr.value || 0), 0);
          const sourceDebuffs = source.activeEffects.filter((e: ActiveEffect) => {
            if (e.type !== 'damage_debuff') return false;
            if ((e as any).excludeAffliction) {
              const isAffliction = skill.classes?.some((c: string) => {
                const lower = c.toLowerCase();
                return lower.includes('aflição') || lower.includes('affliction');
              });
              if (isAffliction) return false;
            }
            const types = (e as any).debuffTypes as string[] | undefined;
            if (!types || types.length === 0) return true;
            return types.includes('skill');
          });
          const damageDebuffSum = sourceDebuffs.reduce((acc, curr) => acc + (curr.value || 0), 0);
          let costRuleDamageBoost = costRuleDamageBoost2;
          // Dano por stack no alvo
          let stackDamageBonus = 0;
          // Aumento de dano por stack em mim mesmo
          if (skill.selfStackDamageRules && skill.selfStackDamageRules.length > 0) {
            for (const selfRule of skill.selfStackDamageRules) {
              if (selfRule.stackType && selfRule.damagePerStack > 0) {
                const selfStackEffect = source.activeEffects.find(e => e.stackType === selfRule.stackType);
                const selfStackCount = selfStackEffect?.stacks || 0;
                if (selfStackCount > 0) {
                  stackDamageBonus += selfStackCount * selfRule.damagePerStack;
                }
              }
            }
          }
          if (skill.stackDamageRules && skill.stackDamageRules.length > 0) {
            for (const stackRule of skill.stackDamageRules) {
              if (stackRule.stackType && stackRule.damagePerStack > 0) {
                const stackPool = getStackPoolForRule(stackRule, t, source, sourceList, targetList);
                const stackCount = countStacksInPool(stackPool, stackRule.stackType);
                if (stackCount > 0) {
                  if (stackRule.duration && stackRule.duration > 0) {
                    const dmgType = (stackRule.damageType || 'dot') as ActiveEffect['type'];
                    const totalDmg = stackCount * stackRule.damagePerStack;
                    // Dano instantâneo no golpe
                    if (!checkCombatantInvulnerable(t, skill) && !hasDamageImmunity(t)) {
                      t.health = Math.max(0, t.health - totalDmg);
                      newLogs.push({
                        id: Math.random().toString(),
                        turn,
                        message: `💥 ${t.character.name} levou ${totalDmg} de ${stackRule.stackType} instantâneo!`,
                        type: 'damage',
                      });
                      addFloatingText(t.id, `-${totalDmg} ${stackRule.stackType}`, 'damage');
                    }
                    // DOT por mais X turnos (duração 1 = só instantâneo)
                    if (stackRule.duration > 1) {
                      pushActiveEffect(t, {
                        name: `${skill.name} (${stackRule.stackType} DOT)`,
                        type: dmgType,
                        value: totalDmg,
                        duration: stackRule.duration - 1,
                        icon: skill.icon,
                        casterId: source.id,
                        casterSide: action.isPlayer ? 'player' : 'enemy',
                        sourceSkillName: skill.name,
                      });
                      newLogs.push({
                        id: Math.random().toString(),
                        turn,
                        message: `🔥 ${t.character.name} sofrerá +${totalDmg} de ${dmgType} por turno por mais ${stackRule.duration - 1} turnos (${stackCount}x ${stackRule.stackType})!`,
                        type: 'damage',
                      });
                      addFloatingText(t.id, `${dmgType.toUpperCase()} +${totalDmg}`, 'damage');
                    }
                    if (stackRule.ignoreBaseDamage) {
                      baseDamage = 0;
                    }
                  } else {
                    stackDamageBonus += stackCount * stackRule.damagePerStack;
                  }
                }
                // Remove stacks after calculating damage
                if (stackRule.removeStacks && stackRule.removeStacks > 0) {
                  for (const poolChar of stackPool) {
                    const poolEffect = poolChar.activeEffects.find(e => e.stackType === stackRule.stackType);
                    if (poolEffect && poolEffect.stacks) {
                      poolEffect.stacks = Math.max(0, (poolEffect.stacks || 0) - stackRule.removeStacks);
                    }
                  }
                }
              }
            }
          }
          let finalDamage = baseDamage + damageBuffSum + costRuleDamageBoost + stackDamageBonus + getCaptureArrestBonusDamage(t, skill) - damageDebuffSum;

          // Apply flat damage reduction on target
          const targetCannotReduce = t.activeEffects.some(e => e.type === 'cannot_reduce_damage');
          const targetReductions = targetCannotReduce ? [] : t.activeEffects.filter(e => e.type === 'damage_reduction');
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
            t.health = t.activeEffects?.some(e => e.type === 'immortal') ? Math.max(1, t.health - finalDamage) : Math.max(0, t.health - finalDamage);
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

        // Apply stack AFTER damage calculation so first hit uses existing stacks (not the new one)
        // Stack goes to stackTarget (e.g., Self), not damageTarget
        if (skill.stackable && skill.stackType) {
          const stackTargets = resolveEffectTargets(skill.stackTarget, target, source, sourceList, targetList, true);
          stackTargets.forEach(st => {
            if (st.isDead) return;
            pushActiveEffect(st, {
              name: `${skill.stackType || skill.name} (Stack)`,
              type: 'custom',
              value: 0,
              duration: skill.stackDuration ?? 999,
              icon: skill.icon,
              stackable: true,
              stackType: skill.stackType || skill.name,
              casterId: source.id,
              casterSide: action.isPlayer ? 'player' : 'enemy',
              sourceSkillName: skill.name,
            });
          });
        }

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
        let healRuleBoost = 0;
        if (skill.healRules && skill.healRules.length > 0) {
          for (const rule of skill.healRules) {
            if (rule.healBoost > 0 && rule.activeSkillName) {
              const targetNameLower = rule.activeSkillName.trim().toLowerCase();
              const allActiveEffects = allCombatants.flatMap(c => c.activeEffects);
              const hasActive = allActiveEffects.some(e => {
                if (!e.name) return false;
                const eNameLower = e.name.toLowerCase();
                return eNameLower === targetNameLower || eNameLower.includes(targetNameLower) || targetNameLower.includes(eNameLower);
              });
              if (hasActive) healRuleBoost += rule.healBoost;
            }
          }
        }
        const totalHeal = healAmt + healRuleBoost;
        const healTargets = resolveEffectTargets(skill.healTarget, target, source, sourceList, targetList, true);
        healTargets.forEach(t => {
          if (t.isDead) return;
          if (t.activeEffects.some(e => e.type === 'cannot_receive_friendly')) {
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🚫 ${t.character.name} não pôde ser curado por [${skill.name}] por estar impossibilitado de receber habilidades amigáveis!`,
              type: 'stun',
            });
            addFloatingText(t.id, 'CURA BLOQUEADA', 'stun');
            return;
          }
          const startingHealth = t.health;
          t.health = Math.min(100, t.health + totalHeal);
          const actualHealed = t.health - startingHealth;
          if (actualHealed > 0 && action.isPlayer) {
            matchStatsRef.current.healingDone += actualHealed;
          }
          if (totalHeal > 0 || actualHealed > 0) {
            checkAndGrantOrigamiLotusGathering(t, totalHeal || actualHealed, newLogs, [...updatedPlayer, ...updatedEnemy]);
          }
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `💚 ${source.character.name} usou [${skill.name}] e restaurou ${totalHeal} de vida de ${t.character.name}.${healRuleBoost > 0 ? ` (+${healRuleBoost} bônus)` : ''}`,
            type: 'heal',
          });
          addFloatingText(t.id, `+${totalHeal} HP`, 'heal');
          cleanseTargetEffects(t, skill.healRemoveType);
        });
      }

      // 3. APPLY STUNS
      if (stunApplied) {
        const stunTypeLabels: Record<string, string> = {
          physical: 'Físico', mental: 'Mental', affliction: 'Aflição', chakra: 'Chakra', ranged: 'A distancia', friendly: 'Amigável',
        };
        const resolvedStunTypes: string[] =
          (!finalStunType || finalStunType.length === 0 || finalStunType.length >= 6)
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

// 4.2d APPLY RETALIATION DAMAGE BUFF
if (skill.retaliateDamage) {
  const retTargets = resolveEffectTargets(skill.retaliateDamageTarget || 'Self', target, source, sourceList, targetList, true);
  const retDur = (skill.retaliateDamagePermanent || (skill.retaliateDamageDuration && skill.retaliateDamageDuration >= 999)) ? 99999 : (skill.retaliateDamageDuration || 1);
  retTargets.forEach(t => {
    if (t.isDead) return;
    pushActiveEffect(t, {
      name: `${skill.name} Retaliação`,
      type: 'retaliate_damage',
      duration: retDur,
      value: skill.retaliateDamageVal || 0,
      retaliateDamageVal: skill.retaliateDamageVal || 0,
      retaliateDamageType: skill.retaliateDamageType || 'damage',
      retaliateTargetScope: skill.retaliateTargetScope || 'self',
      retaliateTriggerMode: skill.retaliateTriggerMode || 'always',
      icon: skill.icon,
      irremovable: !!skill.retaliateDamageIrremovable,
      sourceSkillName: skill.name,
      casterId: source.id,
      targetId: t.id,
    });
    newLogs.push({
      id: Math.random().toString(), turn,
      message: `⚡ ${t.character.name} ativou RETALIAÇÃO com [${skill.name}]!`,
      type: 'buff',
    });
    addFloatingText(t.id, 'RETALIAÇÃO', 'effect');
    cleanseTargetEffects(t, skill.retaliateDamageRemoveType);
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
            sourceSkillName: skill.name,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
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

      // 4.3 APPLY DAMAGE DEBUFF
      if (skill.damageDebuffVal && skill.damageDebuffVal > 0) {
        const debuffTargets = resolveEffectTargets(skill.damageDebuffTarget || skill.shieldTarget || 'Target', target, source, sourceList, targetList, false);
        debuffTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.damageDebuffDuration || 3;
          pushActiveEffect(t, {
            name: `${skill.name} Weakness`,
            sourceSkillName: skill.name,
            type: 'damage_debuff',
            value: skill.damageDebuffVal,
            duration,
            icon: skill.icon,
            irremovable: !!skill.damageDebuffIrremovable,
          });
          newLogs.push({
            id: Math.random().toString(), turn,
            message: `🌫️ ${t.character.name} ativou fraqueza de [${skill.name}] reduzindo ${skill.damageDebuffVal} de dano causado por ${duration} turnos!`,
            type: 'buff',
          });
          addFloatingText(t.id, `FRAQUEZA (-${skill.damageDebuffVal})`, 'effect');
          cleanseTargetEffects(t, skill.damageDebuffRemoveType);
        });
      }

      // 4.4 APPLY DAMAGE BUFF
      if (skill.damageBuffVal && skill.damageBuffVal > 0) {
        const buffTargets = resolveEffectTargets(skill.damageBuffTarget || skill.shieldTarget || 'Self', target, source, sourceList, targetList, true);
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
        const invulTargets = resolveEffectTargets(skill.invulnerableTarget || skill.shieldTarget || 'Self', target, source, sourceList, targetList, true);
        invulTargets.forEach(t => {
          if (t.isDead) return;
          pushActiveEffect(t, {
            name: `${skill.name} Escape`,
            type: 'invulnerable',
            duration: skill.invulnerableDuration!,
            icon: skill.icon,
            invulnerableTypes: skill.invulnerableTypes,
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
      const totalDotVal2 = (hasActiveDamageRuleIgnoreBase2 && ruleDotDamage2 > 0) ? ruleDotDamage2 : ((skill.dotVal || 0) + ruleDotDamage2);
      if (totalDotVal2 > 0) {
        const dotTargets = resolveEffectTargets(skill.dotTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        dotTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.dotDuration || 3;
          pushActiveEffect(t, {
            name: `${skill.name} Burn`,
            type: 'dot',
            value: totalDotVal2,
            duration,
            icon: skill.icon,
            irremovable: !!skill.dotIrremovable,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🔥 ${t.character.name} foi afligido por queima contínua de [${skill.name}] sofrendo ${totalDotVal2} DoT por ${duration} turnos!`,
            type: 'damage',
          });
          addFloatingText(t.id, `QUEIMA (+${totalDotVal2} DoT)`, 'damage');
          cleanseTargetEffects(t, skill.dotRemoveType);
        });
      }

      // 4.6 APPLY BLEEDING (SANGRAMENTO)
      const totalBleedingVal2 = (hasActiveDamageRuleIgnoreBase2 && ruleBleedingDamage2 > 0) ? ruleBleedingDamage2 : ((skill.bleedingVal || 0) + ruleBleedingDamage2);
      if (totalBleedingVal2 > 0) {
        const bleedTargets = resolveEffectTargets(skill.bleedingTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        bleedTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.bleedingDuration || 3;
          pushActiveEffect(t, {
            name: `${skill.name} Sangramento`,
            type: 'bleeding',
            value: totalBleedingVal2,
            duration,
            icon: skill.icon,
            irremovable: !!skill.bleedingIrremovable,
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🩸 ${t.character.name} está sangrando com [${skill.name}] sofrendo ${totalBleedingVal2} de dano por turno por ${duration} turnos!`,
            type: 'damage',
          });
          addFloatingText(t.id, `SANGRAMENTO (-${totalBleedingVal2} HP)`, 'damage');
          cleanseTargetEffects(t, skill.bleedingRemoveType);
        });
      }

      // 4.7 APPLY AFFLICTION (AFLIÇÃO)
      const totalAfflictionVal2 = (hasActiveDamageRuleIgnoreBase2 && ruleAfflictionDamage2 > 0) ? ruleAfflictionDamage2 : ((skill.afflictionVal || 0) + ruleAfflictionDamage2);
      if (totalAfflictionVal2 > 0) {
        const afflictionTargets = resolveEffectTargets(skill.afflictionTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        afflictionTargets.forEach(t => {
          if (t.isDead) return;
          const rawDuration = skill.afflictionDuration !== undefined && skill.afflictionDuration > 0 ? skill.afflictionDuration : 1;

          // Deduct health immediately upon applying affliction
          if (checkCombatantInvulnerable(t) || hasDamageImmunity(t)) {
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🛡️ ${t.character.name} é IMUNE A DANO e ignorou a aflição de [${skill.name}].`,
              type: 'buff',
            });
            addFloatingText(t.id, 'IMUNE!', 'invulnerable');
          } else {
            const startingHealth = t.health;
            t.health = Math.max(0, t.health - totalAfflictionVal2);
            const healthReduced = startingHealth - t.health;
            if (healthReduced > 0) {
              if (action.isPlayer) {
                matchStatsRef.current.damageDealt += healthReduced;
                matchStatsRef.current.damageDealtRecords.push({
                  charName: source.character.name,
                  tags: source.character.tags || [],
                  skillName: skill.name,
                  amount: healthReduced
                });
              } else {
                matchStatsRef.current.damageReceived += healthReduced;
                matchStatsRef.current.damageReceivedRecords.push({
                  charName: t.character.name,
                  tags: t.character.tags || [],
                  amount: healthReduced
                });
              }
            }

            if (t.health <= 0 && !t.activeEffects.some(e => e.type === 'immortal')) {
              t.isDead = true;
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `💀 ${t.character.name} CAIU EM BATALHA POR AFLIÇÃO!`,
                type: 'death',
              });
              addFloatingText(t.id, 'DERROTADO', 'damage');
            }

            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `💜 ${t.character.name} sofreu ${totalAfflictionVal2} de dano por aflição de [${skill.name}]!`,
              type: 'damage',
            });
            addFloatingText(t.id, `AFLIÇÃO (-${totalAfflictionVal2} HP)`, 'damage');
          }

          // If duration > 1, push active effect for remaining turns
          const remainingDuration = rawDuration - 1;
          if (remainingDuration > 0) {
            pushActiveEffect(t, {
              name: `${skill.name} Aflição`,
              type: 'affliction',
              value: totalAfflictionVal2,
              duration: remainingDuration,
              icon: skill.icon,
              irremovable: !!skill.afflictionIrremovable,
            });
          }

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

      // 4.9 APPLY CANNOT REDUCE DAMAGE (INCAPAZ DE REDUZIR DANO)
      if (skill.cannotReduceDamageDuration && skill.cannotReduceDamageDuration > 0) {
        const cannotReduceTargets = resolveEffectTargets(skill.cannotReduceDamageTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        cannotReduceTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.cannotReduceDamageDuration!;
          pushActiveEffect(t, {
            name: `${skill.name} (Incapaz de Reduzir Dano)`,
            type: 'cannot_reduce_damage',
            duration,
            icon: skill.icon,
            irremovable: !!skill.cannotReduceDamageIrremovable,
            cannotBeCountered: !!skill.cannotBeCountered,
            cannotBeReflected: !!skill.cannotBeReflected,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🚫 ${t.character.name} ficou incapaz de reduzir dano por [${skill.name}] por ${duration} turnos!`,
            type: 'buff',
          });
          addFloatingText(t.id, 'SEM REDUÇÃO DE DANO', 'effect');
          cleanseTargetEffects(t, skill.cannotReduceDamageRemoveType);
        });
      }

      // 4.10 APPLY CANNOT BE INVULNERABLE (INCAPAZ DE FICAR INVULNERÁVEL)
      if (skill.cannotBeInvulnerableDuration && skill.cannotBeInvulnerableDuration > 0) {
        const cannotInvulTargets = resolveEffectTargets(skill.cannotBeInvulnerableTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        cannotInvulTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.cannotBeInvulnerableDuration!;
          pushActiveEffect(t, {
            name: `${skill.name} (Incapaz de Ficar Invulnerável)`,
            type: 'cannot_be_invulnerable',
            duration,
            icon: skill.icon,
            irremovable: !!skill.cannotBeInvulnerableIrremovable,
            cannotBeCountered: !!skill.cannotBeCountered,
            cannotBeReflected: !!skill.cannotBeReflected,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🚫 ${t.character.name} ficou incapaz de se tornar invulnerável por [${skill.name}] por ${duration} turnos!`,
            type: 'buff',
          });
          addFloatingText(t.id, 'SEM INVULNERABILIDADE', 'effect');
          cleanseTargetEffects(t, skill.cannotBeInvulnerableRemoveType);
        });
      }

      // 4.10.6 APPLY CANNOT RECEIVE FRIENDLY SKILLS
      if (skill.cannotReceiveFriendlyDuration && skill.cannotReceiveFriendlyDuration > 0) {
        const cannotFriendlyTargets = resolveEffectTargets(skill.cannotReceiveFriendlyTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        cannotFriendlyTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.cannotReceiveFriendlyDuration!;
          pushActiveEffect(t, {
            name: `${skill.name} (Bloqueio Amigável)`,
            type: 'cannot_receive_friendly',
            duration,
            icon: skill.icon,
            irremovable: !!skill.cannotReceiveFriendlyIrremovable,
            cannotBeCountered: !!skill.cannotBeCountered,
            cannotBeReflected: !!skill.cannotBeReflected,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🚫 ${t.character.name} ficou impossibilitado de receber habilidades amigáveis por [${skill.name}] por ${duration} turnos!`,
            type: 'buff',
          });
          addFloatingText(t.id, 'BLOQUEIO AMIGÁVEL', 'effect');
          cleanseTargetEffects(t, skill.cannotReceiveFriendlyRemoveType);
        });
      }

      // 4.10.5 APPLY REVEAL INVISIBLE (REVELAR SKILLS INVISÍVEIS)
      if (skill.revealInvisibleDuration && skill.revealInvisibleDuration > 0) {
        const revealTargets = resolveEffectTargets(skill.revealInvisibleTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        revealTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.revealInvisibleDuration!;
          pushActiveEffect(t, {
            name: `${skill.name} (Revelar Skills Invisíveis)`,
            type: 'reveal_invisible',
            duration,
            icon: skill.icon,
            irremovable: !!skill.revealInvisibleIrremovable,
            cannotBeCountered: !!skill.cannotBeCountered,
            cannotBeReflected: !!skill.cannotBeReflected,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `👁️ ${t.character.name} teve suas habilidades e efeitos invisíveis revelados por [${skill.name}] por ${duration} turnos!`,
            type: 'buff',
          });
          addFloatingText(t.id, '👁️ SKILLS REVELADAS', 'effect');
          cleanseTargetEffects(t, skill.revealInvisibleRemoveType);
        });
      }

      // 4.11 APPLY DAMAGE IMMUNITY (IMUNIDADE A DANO)
      if (skill.damageImmunityDuration && skill.damageImmunityDuration > 0) {
        const immunityTargets = resolveEffectTargets(skill.damageImmunityTarget || skill.shieldTarget || 'Self', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList);
        immunityTargets.forEach(t => {
          if (t.isDead) return;
          const duration = skill.damageImmunityDuration!;
          pushActiveEffect(t, {
            name: `${skill.name} (Imunidade a Dano)`,
            sourceSkillName: skill.name,
            type: 'damage_immunity',
            duration,
            icon: skill.icon,
            irremovable: !!skill.damageImmunityIrremovable,
            cannotBeCountered: !!skill.cannotBeCountered,
            cannotBeReflected: !!skill.cannotBeReflected,
            casterId: source.id,
            casterSide: action.isPlayer ? 'player' : 'enemy',
          });
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `🛡️ ${t.character.name} está imune a dano por [${skill.name}] por ${duration} turnos!`,
            type: 'buff',
          });
          addFloatingText(t.id, 'IMUNE A DANO', 'effect');
          cleanseTargetEffects(t, skill.damageImmunityRemoveType);
        });
      }

      // Cleanse / Purify Debuffs (Multi-selection)
      if (skill.cleanseDebuffs || (skill.cleanseDebuffTypes && skill.cleanseDebuffTypes.length > 0)) {
        const cleanseTargets = resolveEffectTargets(skill.cleanseDebuffTarget || 'Self', target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList, true);
        cleanseTargets.forEach(t => {
          if (t.isDead) return;
          cleanseSpecificDebuffs(t, skill.cleanseDebuffTypes || ['all_debuffs']);
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

      // Stack-only skill: apply stack even if skill has no damage/effects
      if (skill.stackable && skill.stackType && !skill.damage && !skill.directDamage && !skill.shieldVal && !skill.damageReductionVal && !skill.damageBuffVal && !skill.damageDebuffVal && !skill.dotVal && !skill.bleedingVal && !skill.afflictionVal && !skill.stunTurns && !skill.invulnerableDuration && !skill.counterAttack && !skill.reflect && !skill.heal && !skill.paralyzeCooldownDuration && !skill.cannotReduceDamageDuration && !skill.cannotBeInvulnerableDuration && !skill.cannotReceiveFriendlyDuration && !skill.immortalHpThreshold && !skill.invisibleDuration && !skill.removeShieldDuration && !skill.damageDuration && !skill.directDamageDuration && !skill.healDuration && !effectName) {
         const stackTgts = resolveEffectTargets(skill.stackTarget, target, source, isReflected ? targetList : sourceList, isReflected ? sourceList : targetList, true);
        stackTgts.forEach(t => {
          if (t.isDead) return;
          const existing = t.activeEffects.find(e => e.stackType === skill.stackType && e.type === 'custom' && e.sourceSkillName === skill.name);
          if (existing) {
            existing.stacks = (existing.stacks || 1) + 1;
            existing.duration = Math.max(existing.duration, skill.stackDuration ?? 999);
          } else {
            t.activeEffects.push({
              name: `${skill.stackType || skill.name} (Stack)`,
              type: 'custom',
              value: 0,
              duration: skill.stackDuration ?? 999,
              icon: skill.icon,
              stackable: true,
              stackType: skill.stackType || skill.name,
              casterId: source.id,
              casterSide: action.isPlayer ? 'player' : 'enemy',
              sourceSkillName: skill.name,
              isInvisible: isSkillInvisible,
              stacks: 1,
              castTurn: turn,
            });
          }
          newLogs.push({
            id: Math.random().toString(),
            turn,
            message: `📚 ${t.character.name} recebeu stack [${skill.stackType}] de ${source.character.name} via [${skill.name}]!`,
            type: 'buff',
          });
          addFloatingText(t.id, `+1 ${skill.stackType.toUpperCase()}`, 'effect');
        });
      }

      // Ensure invisible skills always create an invisible active effect if none was created yet
      if (isSkillInvisible && target) {
        const invisTargets = resolveEffectTargets(skill.invisibleTarget || skill.shieldTarget || skill.invulnerableTarget || 'Self', target, source, sourceList, targetList, true);
        invisTargets.forEach(t => {
          if (t.isDead) return;
          const hasInvisEffect = t.activeEffects.some(
            e => (e.isInvisible || e.type === 'invisible') && (e.sourceSkillName === skill.name || e.name === skill.name)
          );
          if (!hasInvisEffect) {
            pushActiveEffect(t, {
              name: skill.name,
              sourceSkillName: skill.name,
              type: 'invisible',
              value: 0,
              duration: skill.invisibleDuration || skill.invulnerableDuration || skill.damageImmunityDuration || 1,
              icon: skill.icon,
              isInvisible: true,
              irremovable: !!skill.invisibleIrremovable,
              description: 'Efeito invisível ativo',
              casterId: source.id,
              casterSide,
              castTurn: turn,
            });
            cleanseTargetEffects(t, skill.invisibleRemoveType);
          }
        });
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
          if (checkCombatantInvulnerable(c, 'dot') || hasDamageImmunity(c)) {
            newLogs.push({ id: Math.random().toString(), turn, message: `🛡️ ${c.character.name} é IMUNE A DANO e ignorou o dano de queima por ${dot.name}.`, type: 'buff' });
            addFloatingText(c.id, 'IMUNE!', 'invulnerable');
          } else {
            c.health = Math.max(0, c.health - (dot.value || 0));
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🔥 ${c.character.name} sofreu ${(dot.value || 0)} de dano de queima por ${dot.name}.`,
              type: 'damage',
            });
            addFloatingText(c.id, `-${(dot.value || 0)} HP (QUEIMA)`, 'damage');
          }
        });

        // Apply dynamic Normal Damage over time (damage) - blocked if invulnerable
        const activeDamageEffects = c.activeEffects.filter(e => e.type === 'damage' && e.castTurn !== turn);
        const isInvulnerable = checkCombatantInvulnerable(c, 'damage') || hasDamageImmunity(c);
        activeDamageEffects.forEach(dmg => {
          if (isInvulnerable) {
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🛡️ ${c.character.name} está INVULNERÁVEL e não sofreu dano contínuo de ${dmg.name}.`,
              type: 'buff',
            });
            addFloatingText(c.id, 'INVULNERÁVEL', 'invulnerable');
          } else {
            c.health = Math.max(0, c.health - (dmg.value || 0));
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `💥 ${c.character.name} sofreu ${(dmg.value || 0)} de dano contínuo de ${dmg.name}.`,
              type: 'damage',
            });
            addFloatingText(c.id, `-${(dmg.value || 0)} HP (DANO)`, 'damage');
          }
        });

        // Apply dynamic Direct Damage over time (direct_damage)
        const activeDirectDamageEffects = c.activeEffects.filter(e => e.type === 'direct_damage');
        activeDirectDamageEffects.forEach(dd => {
          if (checkCombatantInvulnerable(c, 'direct_damage') || hasDamageImmunity(c)) {
            newLogs.push({ id: Math.random().toString(), turn, message: `🛡️ ${c.character.name} é IMUNE A DANO e ignorou o dano direto contínuo de ${dd.name}.`, type: 'buff' });
            addFloatingText(c.id, 'IMUNE!', 'invulnerable');
          } else {
            const dr = c.activeEffects.some((e: ActiveEffect) => e.type === 'cannot_reduce_damage') ? 0
              : c.activeEffects.filter((e: ActiveEffect) => e.type === 'damage_reduction').reduce((a: number, e: ActiveEffect) => a + (e.value || 0), 0);
            const netDd = Math.max(0, (dd.value || 0) - dr);
            c.health = Math.max(0, c.health - netDd);
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🎯 ${c.character.name} sofreu ${netDd} de dano direto contínuo de ${dd.name}.`,
              type: 'damage',
            });
            addFloatingText(c.id, `-${netDd} HP (DIRETO)`, 'damage');
          }
        });

        // Apply dynamic Healing over time (heal)
        const activeHealEffects = c.activeEffects.filter(e => e.type === 'heal');
        activeHealEffects.forEach(hl => {
          const startingHealth = c.health;
          c.health = Math.min(100, c.health + (hl.value || 0));
          const actualHealed = c.health - startingHealth;
          if (actualHealed > 0) {
            checkAndGrantOrigamiLotusGathering(c, actualHealed, newLogs, [...updatedPlayer, ...updatedEnemy]);
          }
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
          if (checkCombatantInvulnerable(c, 'bleeding') || hasDamageImmunity(c)) {
            newLogs.push({ id: Math.random().toString(), turn, message: `🛡️ ${c.character.name} é IMUNE A DANO e ignorou o Sangramento (${bleed.name}).`, type: 'buff' });
            addFloatingText(c.id, 'IMUNE!', 'invulnerable');
          } else {
            c.health = Math.max(0, c.health - (bleed.value || 0));
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `🩸 ${c.character.name} sofreu ${(bleed.value || 0)} de dano por Sangramento (${bleed.name}).`,
              type: 'damage',
            });
            addFloatingText(c.id, `-${(bleed.value || 0)} HP (SANGRAMENTO)`, 'damage');
          }
        });

        // Apply Affliction (Aflição)
        const afflictionEffects = c.activeEffects.filter(e => e.type === 'affliction');
        afflictionEffects.forEach(aff => {
          if (checkCombatantInvulnerable(c, 'affliction') || hasDamageImmunity(c)) {
            newLogs.push({ id: Math.random().toString(), turn, message: `🛡️ ${c.character.name} é IMUNE A DANO e ignorou a Aflição (${aff.name}).`, type: 'buff' });
            addFloatingText(c.id, 'IMUNE!', 'invulnerable');
          } else {
            c.health = Math.max(0, c.health - (aff.value || 0));
            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `💜 ${c.character.name} sofreu ${(aff.value || 0)} de dano por Aflição (${aff.name}).`,
              type: 'damage',
            });
            addFloatingText(c.id, `-${(aff.value || 0)} HP (AFLIÇÃO)`, 'damage');
          }
        });

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

        // Apply continuous Chakra Drain effects (Dreno, Roubo, Remoção)
        const drainChakraEffects = c.activeEffects.filter(e =>
          e.name.startsWith('Dreno de Chakra') ||
          e.name.startsWith('Roubo de Chakra') ||
          e.name.startsWith('Remoção de Chakra')
        );

        drainChakraEffects.forEach(effect => {
          const amt = effect.value || 0;
          const isRemov = effect.name.startsWith('Remoção');
          const victimSetter = name === 'Player' ? setPlayerChakra : setEnemyChakra;
          const thiefSetter = name === 'Player' ? setEnemyChakra : setPlayerChakra;

          victimSetter(prevVictim => {
            const uVictim = { ...prevVictim };
            const affectedTypes: (keyof ChakraPool)[] = [];
            for (let i = 0; i < amt; i++) {
              const nonZero = (Object.keys(uVictim) as (keyof ChakraPool)[]).filter(k => uVictim[k] > 0);
              if (nonZero.length > 0) {
                const randType = nonZero[Math.floor(Math.random() * nonZero.length)];
                uVictim[randType]--;
                affectedTypes.push(randType);
              }
            }

            if (affectedTypes.length > 0) {
              if (!isRemov) {
                thiefSetter(prevThief => {
                  const uThief = { ...prevThief };
                  affectedTypes.forEach(k => { uThief[k] = (uThief[k] || 0) + 1; });
                  return uThief;
                });
              }

              const affectedStr = affectedTypes.map(k => getChakraName(k)).join(', ');
              const actionName = isRemov ? 'removido' : 'drenado';
              newLogs.push({
                id: Math.random().toString(),
                turn,
                message: `🌀 [${effect.name}] no estoque de ${name === 'Player' ? 'seu time' : 'oponente'}: ${affectedTypes.length} chakra (${affectedStr}) ${actionName}!`,
                type: 'chakra',
              });
              addFloatingText(c.id, `-${affectedTypes.length} CHAKRA (${isRemov ? 'REMOVIDO' : 'DRENADO'})`, 'effect');

              if (name === 'Player') {
                triggerChakraToast(`⚠️ [${effect.name}] drenou ${affectedTypes.length} chakra (${affectedStr}) do estoque do seu time!`, 'lost');
              } else {
                triggerChakraToast(`⚡ [${effect.name}] roubou ${affectedTypes.length} chakra (${affectedStr}) do estoque do oponente!`, 'stolen');
              }
            }
            return uVictim;
          });
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
        if (c.health <= 0 && !c.activeEffects.some(e => e.type === 'immortal')) {
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

        // Check paralyze cooldown BEFORE decrementing durations
        const isCooldownParalyzed = c.activeEffects.some(e => e.type === 'paralyze_cooldown');

        // Reveal invisible effects that are about to expire
        const expiringHidden = c.activeEffects.filter((e: ActiveEffect) => (e.isInvisible || e.type === 'invisible') && e.duration === 1);
        if (expiringHidden.length > 0) {
          const processedSkills = new Set<string>();
          const allCombatants = [...updatedPlayer, ...updatedEnemy];

          expiringHidden.forEach(expEff => {
            const skillName = expEff.sourceSkillName || getSkillBaseName(expEff) || expEff.name || 'Habilidade';
            if (processedSkills.has(skillName)) return;
            processedSkills.add(skillName);

            let icon = expEff.icon || '';
            if (!icon && c.character?.skills) {
              const foundSkill = c.character.skills.find(s => s.name === skillName || s.name === expEff.sourceSkillName);
              if (foundSkill?.icon) icon = foundSkill.icon;
            }
            if (!icon) {
              for (const cb of allCombatants) {
                const s = cb.character?.skills?.find(sk => sk.name === skillName || sk.name === expEff.sourceSkillName);
                if (s?.icon) { icon = s.icon; break; }
              }
            }

            const casterCombatant = allCombatants.find(cb => cb.id === expEff.casterId) || c;

            const alreadyHasBuff = c.activeEffects.some(
              e => (e.name === skillName || e.sourceSkillName === skillName) && !e.isInvisible && e.type !== 'invisible' && e.duration >= 1
            );

            if (!alreadyHasBuff) {
              c.activeEffects.push({
                name: skillName,
                sourceSkillName: skillName,
                type: 'custom',
                value: 0,
                duration: 2, // Decremented to 1 in line 6211 right below, so it remains visible for 1 full turn
                icon: icon,
                description: `Habilidade [${skillName}] foi usada e revelada`,
                casterId: casterCombatant.id,
                isInvisible: false,
              });
            }

            newLogs.push({
              id: Math.random().toString(),
              turn,
              message: `👁️ [${skillName}] de ${casterCombatant.character.name} expirou e foi revelada para todos: Habilidade [${skillName}] foi usada.`,
              type: 'buff',
            });
            addFloatingText(c.id, 'SKILL REVELADA', 'effect');
          });
        }

        // Decrement effect durations (skip permanent effects)
        c.activeEffects = c.activeEffects
          .map(eff => eff.duration >= 99999 ? eff : { ...eff, duration: eff.duration - 1 })
          .filter(eff => eff.duration > 0);

        // Decrement cooldowns (unless paralisia de cooldown is active)
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
    playerRef.current = updatedPlayer;
    enemyRef.current = updatedEnemy;
    setPlayerCombatants(updatedPlayer);
    setEnemyCombatants(updatedEnemy);
    setCuedActions([]);
    setSelectedSkill(null);

    // Save current turn skill usage for requirePreviousSkill
    lastTurnUsedSkills.current = currentTurnUsedSkills.current;
    currentTurnUsedSkills.current = {};

    // Check game over
    const allPlayerDead = updatedPlayer.length > 0 && updatedPlayer.every(p => p.isDead);
    const allEnemyDead = updatedEnemy.length > 0 && updatedEnemy.every(e => e.isDead);

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

    setPlayerChakra(localPlayerChakra);
    setEnemyChakra(localEnemyChakra);
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
      color = 'bg-green-600 border-green-400';
      name = 'Taijutsu';
    } else if (type === 'Nin') {
      color = 'bg-blue-600 border-blue-400';
      name = 'Ninjutsu';
    } else if (type === 'Gen') {
      color = 'bg-white border-white/60';
      name = 'Genjutsu';
    } else if (type === 'Blood') {
      color = 'bg-red-600 border-red-400';
      name = 'Bloodline';
    } else {
      color = 'bg-slate-600 border-slate-500';
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
    SelfAndAlly: 'Mim e um Aliado (à escolha)',
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
        color: 'text-red-900 font-extrabold',
        targetLabel: getTargetLabel(skill.damageTarget, 'Alvo Principal')
      });
    }
    if (skill.directDamage && skill.directDamage > 0) {
      effects.push({
        label: 'Dano Direto',
        value: `${skill.directDamage} de Dano (Direto)`,
        color: 'text-rose-950 font-extrabold',
        targetLabel: getTargetLabel(skill.directDamageTarget, 'Alvo Principal')
      });
    }
    if (skill.heal && skill.heal > 0) {
      effects.push({
        label: 'Cura',
        value: `${skill.heal} de Cura`,
        color: 'text-emerald-950 font-extrabold',
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
        color: 'text-amber-950 font-extrabold',
        targetLabel: getTargetLabel(skill.stunTarget, 'Alvo Principal')
      });
    }
    if (skill.shieldVal && skill.shieldVal > 0) {
      effects.push({
        label: 'Escudo (Shield)',
        value: `+${skill.shieldVal} Escudo por ${skill.shieldDuration || 1} ${skill.shieldDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-blue-950 font-extrabold',
        targetLabel: getTargetLabel(skill.shieldTarget, 'Conjurador (Mim)')
      });
    }
    if (skill.damageReductionVal && skill.damageReductionVal > 0) {
      effects.push({
        label: 'Redução de Dano',
        value: `-${skill.damageReductionVal} de Dano Recebido por ${skill.damageReductionDuration || 1} ${skill.damageReductionDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-teal-950 font-extrabold',
        targetLabel: getTargetLabel(skill.shieldTarget, 'Conjurador (Mim)')
      });
    }
    if (skill.damageBuffVal && skill.damageBuffVal > 0) {
      effects.push({
        label: 'Aumento de Dano',
        value: `+${skill.damageBuffVal} de Dano causado por ${skill.damageBuffDuration || 1} ${skill.damageBuffDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-amber-950 font-extrabold',
        targetLabel: getTargetLabel(skill.shieldTarget, 'Conjurador (Mim)')
      });
    }
    if (skill.damageRules && skill.damageRules.length > 0) {
      skill.damageRules.forEach(rule => {
        if (!rule.activeSkillName || rule.damageBoost <= 0) return;
        const typeLabel = rule.damageType === 'direct_damage' ? 'Dano Direto'
          : rule.damageType === 'piercing' ? 'Dano Perfurante'
          : rule.damageType === 'affliction' ? 'Dano de Aflição'
          : rule.damageType === 'bleeding' ? 'Dano de Sangramento'
          : rule.damageType === 'dot' ? 'DoT'
          : 'Dano';
        const ignoreStr = rule.ignoreBaseDamage !== false ? ' (substitui dano base)' : '';
        effects.push({
          label: `Regra de Dano (${rule.activeSkillName})`,
          value: `+${rule.damageBoost} de ${typeLabel} quando ${rule.activeSkillName} estiver ativo${ignoreStr}`,
          color: 'text-rose-950 font-extrabold',
          targetLabel: 'Condicional'
        });
      });
    }
    if (skill.bonusDamagePerMissingHp && skill.bonusDamagePerMissingHp > 0) {
      const step = (skill.missingHpStep && skill.missingHpStep > 0) ? skill.missingHpStep : 20;
      const srcLabel = skill.missingHpSource === 'target' ? 'Alvo' : 'Conjurador';
      const bType = skill.missingHpBonusType === 'direct' ? 'Dano Direto'
        : skill.missingHpBonusType === 'dot' ? 'DoT (Queima)'
        : skill.missingHpBonusType === 'bleeding' ? 'Sangramento'
        : skill.missingHpBonusType === 'affliction' ? 'Aflição'
        : 'Dano';
      effects.push({
        label: 'Dano Bônus p/ HP Perdido',
        value: `Dano Base (${skill.damage || 0}) + ${skill.bonusDamagePerMissingHp} de ${bType} a cada ${step} de HP perdido (${srcLabel})`,
        color: 'text-rose-950 font-extrabold',
        targetLabel: getTargetLabel(skill.damageTarget, 'Alvo Principal')
      });
    }
    if (skill.missingHpDamageType) {
      const typeLabel = skill.missingHpDamageType === 'direct' ? 'Dano Direto'
        : skill.missingHpDamageType === 'dot' ? 'DoT (Queima)'
        : skill.missingHpDamageType === 'bleeding' ? 'Sangramento'
        : skill.missingHpDamageType === 'affliction' ? 'Aflição'
        : 'Dano Normal';
      effects.push({
        label: 'Dano = HP Perdido',
        value: `Causa ${typeLabel} igual a todo o HP perdido do Conjurador`,
        color: 'text-red-950 font-extrabold',
        targetLabel: getTargetLabel(skill.damageTarget, 'Alvo Principal')
      });
    }
    if (skill.onSkillUseDamageRules && skill.onSkillUseDamageRules.length > 0) {
      skill.onSkillUseDamageRules.forEach(rule => {
        if (!rule.damage || rule.damage <= 0) return;
        const typeLabel = rule.damageType === 'direct_damage' ? 'Dano Direto'
          : rule.damageType === 'piercing' ? 'Dano Perfurante'
          : rule.damageType === 'affliction' ? 'Dano de Aflição'
          : rule.damageType === 'bleeding' ? 'Sangramento'
          : rule.damageType === 'dot' ? 'DoT'
          : 'Dano';
        effects.push({
          label: 'Punição por Habilidade',
          value: `Sofre ${rule.damage} de ${typeLabel} a cada skill usada por ${rule.duration || 1} ${(rule.duration || 1) === 1 ? 'Turno' : 'Turnos'}`,
          color: 'text-amber-950 font-extrabold',
          targetLabel: getTargetLabel(rule.target, 'Inimigo (Alvo)')
        });
      });
    }
    if (skill.dotVal && skill.dotVal > 0) {
      effects.push({
        label: 'Dano Contínuo (DoT)',
        value: `${skill.dotVal} de dano por turno por ${skill.dotDuration || 1} ${skill.dotDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-red-950 font-extrabold',
        targetLabel: getTargetLabel(skill.dotTarget, 'Alvo Principal')
      });
    }
    if (skill.bleedingVal && skill.bleedingVal > 0) {
      effects.push({
        label: 'Sangramento (Bleeding)',
        value: `${skill.bleedingVal} de dano por turno por ${skill.bleedingDuration || 1} ${skill.bleedingDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-red-950 font-extrabold',
        targetLabel: getTargetLabel(skill.bleedingTarget, 'Alvo Principal')
      });
    }
    if (skill.afflictionVal && skill.afflictionVal > 0) {
      effects.push({
        label: 'Aflição (Aflicção)',
        value: `${skill.afflictionVal} de dano por turno por ${skill.afflictionDuration || 1} ${skill.afflictionDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-purple-950 font-extrabold',
        targetLabel: getTargetLabel(skill.afflictionTarget, 'Alvo Principal')
      });
    }

    // Informação: Skill reduz dano do inimigo (damageDebuff) - Ex: Parasite do Shino
    if (skill.damageDebuffVal && skill.damageDebuffVal > 0) {
      effects.push({
        label: 'Reduz Dano do Inimigo',
        value: `Reduz o dano causado pelo inimigo em ${skill.damageDebuffVal} por ${skill.damageDebuffDuration || 1} ${skill.damageDebuffDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-rose-950 font-extrabold',
        targetLabel: getTargetLabel(skill.damageDebuffTarget, 'Alvo Principal')
      });
    }

    if (skill.paralyzeCooldownDuration && skill.paralyzeCooldownDuration > 0) {
      effects.push({
        label: 'Paralisar Cooldown',
        value: `Paralisa cooldowns por ${skill.paralyzeCooldownDuration} ${skill.paralyzeCooldownDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-amber-950 font-extrabold',
        targetLabel: getTargetLabel(skill.paralyzeCooldownTarget, 'Alvo Principal')
      });
    }
    if (skill.cannotReduceDamageDuration && skill.cannotReduceDamageDuration > 0) {
      effects.push({
        label: 'Incapaz de Reduzir Dano',
        value: `Incapaz de reduzir dano por ${skill.cannotReduceDamageDuration} ${skill.cannotReduceDamageDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-rose-950 font-extrabold',
        targetLabel: getTargetLabel(skill.cannotReduceDamageTarget, 'Alvo Principal')
      });
    }
    if (skill.cannotBeInvulnerableDuration && skill.cannotBeInvulnerableDuration > 0) {
      effects.push({
        label: 'Incapaz de Ficar Invulnerável',
        value: `Incapaz de ficar invulnerável por ${skill.cannotBeInvulnerableDuration} ${skill.cannotBeInvulnerableDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-amber-950 font-extrabold',
        targetLabel: getTargetLabel(skill.cannotBeInvulnerableTarget, 'Alvo Principal')
      });
    }
    if (skill.cannotReceiveFriendlyDuration && skill.cannotReceiveFriendlyDuration > 0) {
      effects.push({
        label: 'Incapaz de Receber Skills Amigáveis',
        value: `Incapaz de receber habilidades amigáveis por ${skill.cannotReceiveFriendlyDuration} ${skill.cannotReceiveFriendlyDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-purple-950 font-extrabold',
        targetLabel: getTargetLabel(skill.cannotReceiveFriendlyTarget, 'Alvo Principal')
      });
    }
    if (skill.revealInvisibleDuration && skill.revealInvisibleDuration > 0) {
      effects.push({
        label: 'Revelar Skills Invisíveis',
        value: `Revela habilidades e efeitos invisíveis por ${skill.revealInvisibleDuration} ${skill.revealInvisibleDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-teal-950 font-extrabold',
        targetLabel: getTargetLabel(skill.revealInvisibleTarget, 'Alvo Principal')
      });
    }
    if (skill.ignoreStunDuration && skill.ignoreStunDuration > 0) {
      effects.push({
        label: 'Ignorar Stun',
        value: `Imune a stuns por ${skill.ignoreStunDuration} ${skill.ignoreStunDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-indigo-950 font-extrabold',
        targetLabel: getTargetLabel(skill.ignoreStunTarget, 'Alvo Principal')
      });
    }
    if (skill.damageImmunityDuration && skill.damageImmunityDuration > 0) {
      effects.push({
        label: 'Imunidade a Dano',
        value: `Imune a todo dano por ${skill.damageImmunityDuration} ${skill.damageImmunityDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-amber-950 font-extrabold',
        targetLabel: getTargetLabel(skill.damageImmunityTarget, 'Alvo Principal')
      });
    }
    if (skill.gainChakra && skill.gainChakra > 0) {
      effects.push({
        label: 'Gerar Chakra',
        value: `Gera ${skill.gainChakra} chakra por turno por ${skill.gainChakraDuration || 1} ${skill.gainChakraDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-blue-950 font-extrabold',
        targetLabel: getTargetLabel(skill.gainChakraTarget, 'Conjurador (Mim)')
      });
    }
    if (skill.drainChakra && skill.drainChakra > 0) {
      effects.push({
        label: 'Drenar Chakra',
        value: `Drena ${skill.drainChakra} chakra por turno por ${skill.drainChakraDuration || 1} ${skill.drainChakraDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-indigo-950 font-extrabold',
        targetLabel: getTargetLabel(skill.drainChakraTarget, 'Alvo Principal')
      });
    }
    if (skill.removeChakra && skill.removeChakra > 0) {
      effects.push({
        label: 'Remover Chakra',
        value: `Remove ${skill.removeChakra} chakra${skill.removeChakraMode === 'choice' ? ' (Escolha)' : ' (Aleatório)'} por ${skill.removeChakraDuration || 1} ${skill.removeChakraDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-amber-950 font-extrabold',
        targetLabel: getTargetLabel(skill.removeChakraTarget, 'Alvo Principal')
      });
    }
    if (skill.stealChakra && skill.stealChakra > 0) {
      effects.push({
        label: 'Roubar Chakra',
        value: `Rouba ${skill.stealChakra} chakra aleatório por ${skill.stealChakraDuration || 1} ${skill.stealChakraDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-purple-950 font-extrabold',
        targetLabel: getTargetLabel(skill.stealChakraTarget, 'Alvo Principal')
      });
    }
    if (skill.removeShield) {
      effects.push({
        label: 'Destruir Escudos',
        value: `Remove escudos ativos por ${skill.removeShieldDuration || 1} ${skill.removeShieldDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-amber-950 font-extrabold',
        targetLabel: getTargetLabel(skill.shieldTarget, 'Alvo Principal')
      });
    }
    if (skill.removeCounterReflect) {
      effects.push({
        label: 'Remover Contra-Ataques e Refletir',
        value: 'Remove os efeitos de Contra-Ataque e Refletir do alvo',
        color: 'text-rose-950 font-extrabold',
        targetLabel: getTargetLabel(skill.removeCounterReflectTarget, 'Alvo Principal')
      });
    }
    if (skill.invulnerableDuration && skill.invulnerableDuration > 0) {
      const invulSummary = formatInvulnerableSummary(skill.invulnerableTypes);
      effects.push({
        label: 'Invulnerabilidade',
        value: `Fica invulnerável ${invulSummary} por ${skill.invulnerableDuration} ${skill.invulnerableDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-teal-950 font-extrabold',
        targetLabel: getTargetLabel(skill.shieldTarget, 'Conjurador (Mim)')
      });
    }

    if ((skill.immortalDuration && skill.immortalDuration > 0) || (skill.immortalHpThreshold && skill.immortalHpThreshold > 0)) {
      const conditionStr = skill.immortalHpThreshold && skill.immortalHpThreshold > 0
        ? (skill.immortalImmediate ? `Ao usar ou se HP ≤ ${skill.immortalHpThreshold}` : `Se HP ≤ ${skill.immortalHpThreshold}`)
        : 'Ao usar a habilidade';
      effects.push({
        label: 'Imortalidade',
        value: `Fica imortal por ${skill.permanent ? 'tempo indeterminado (Permanente)' : `${skill.immortalDuration || 3} ${skill.immortalDuration === 1 ? 'Turno' : 'Turnos'}`} (${conditionStr})`,
        color: 'text-green-950 font-extrabold',
        targetLabel: getTargetLabel(skill.shieldTarget, 'Conjurador (Mim)')
      });
    }

    if (skill.invisible && skill.invisibleDuration && skill.invisibleDuration > 0) {
      effects.push({
        label: 'Efeitos Invisíveis',
        value: `Efeitos ocultos do oponente por ${skill.invisibleDuration} ${skill.invisibleDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-purple-950 font-extrabold',
        targetLabel: getTargetLabel(skill.shieldTarget, 'Conjurador (Mim)')
      });
    }

    if (skill.counterAttack) {
      effects.push({
        label: 'Contra-Ataque',
        value: `Anula a próxima habilidade recebida por ${skill.counterAttackDuration || 1} ${skill.counterAttackDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-red-950 font-extrabold',
        targetLabel: getTargetLabel(skill.counterAttackTarget, 'Conjurador (Mim)')
      });
    }
    if (skill.reflect) {
      effects.push({
        label: 'Reflect',
        value: `Reflete a próxima habilidade recebida (${skill.reflectMode === 'RandomAlly' ? 'para um aliado aleatório' : 'de volta pro atacante'}) por ${skill.reflectDuration || 1} ${skill.reflectDuration === 1 ? 'Turno' : 'Turnos'}`,
        color: 'text-teal-950 font-extrabold',
        targetLabel: getTargetLabel(skill.reflectTarget, 'Conjurador (Mim)')
      });
    }

    // Informação de redução de custo quando Parasite estiver ativo (costRules)
    if (skill.costRules && skill.costRules.length > 0) {
      skill.costRules.forEach(rule => {
        if (!rule.activeSkillName) return;
        if (rule.overrideCost !== undefined) {
          const costStr = rule.overrideCost.length > 0 ? rule.overrideCost.join(', ') : 'GRÁTIS (0 Custo)';
          effects.push({
            label: `Novo Custo (${rule.activeSkillName})`,
            value: `Custo alterado para [${costStr}] quando ${rule.activeSkillName} estiver ativo`,
            color: 'text-amber-950 font-extrabold',
            targetLabel: 'Condicional'
          });
        } else if (rule.reduceAmount && rule.reduceAmount > 0) {
          const chakraType = rule.reduceType || rule.reduceSpecificType || 'Rand';
          effects.push({
            label: `Custo Reduzido (${rule.activeSkillName})`,
            value: `Custa ${rule.reduceAmount} ${chakraType === 'Rand' ? 'Chakra Aleatório' : chakraType} a menos enquanto ${rule.activeSkillName} estiver ativo`,
            color: 'text-emerald-950 font-extrabold',
            targetLabel: 'Condicional'
          });
        }
      });
    }

    // Informação de remoção de chakra do estoque inimigo (chakraRemoveRules)
    if (skill.chakraRemoveRules && skill.chakraRemoveRules.length > 0) {
      skill.chakraRemoveRules.forEach(rule => {
        if (!rule.activeSkillName) return;
        if (rule.removeAmount && rule.removeAmount > 0) {
          effects.push({
            label: `Remover Chakra (${rule.activeSkillName})`,
            value: `Remove ${rule.removeAmount} chakra aleatório do estoque inimigo quando ${rule.activeSkillName} estiver ativo`,
            color: 'text-purple-950 font-extrabold',
            targetLabel: 'Condicional'
          });
        }
      });
    }

    if (skill.healRules && skill.healRules.length > 0) {
      skill.healRules.forEach(rule => {
        if (!rule.activeSkillName || rule.healBoost <= 0) return;
        effects.push({
          label: `Cura Extra (${rule.activeSkillName})`,
          value: `+${rule.healBoost} de cura quando ${rule.activeSkillName} estiver ativo`,
          color: 'text-emerald-950 font-extrabold',
          targetLabel: 'Condicional'
        });
      });
    }

    if (skill.cannotBeCountered) {
      effects.push({
        label: 'Incontra-atacável',
        value: 'Esta habilidade NÃO pode ser contra-atacada ou anulada.',
        color: 'text-red-950 font-extrabold',
      });
    }
    if (skill.cannotBeReflected) {
      effects.push({
        label: 'Irrefletível',
        value: 'Esta habilidade NÃO pode ser refletida.',
        color: 'text-teal-950 font-extrabold',
      });
    }

    if (effects.length === 0) return null;

    return (
      <div className="mt-2.5 pt-2 border-t border-amber-900/30 space-y-1.5 text-[10px] font-mono text-left">
        <p className="text-[10px] text-amber-950 font-extrabold uppercase tracking-wider mb-1 flex items-center gap-1">
          <span>Efeitos da Habilidade</span>
          <span className="bg-amber-900/30 text-amber-950 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold">{effects.length}</span>
        </p>
        <div className="grid grid-cols-1 gap-1.5">
          {effects.map((eff, idx) => (
            <div
              key={idx}
              className="flex flex-col gap-1 bg-amber-100/70 border border-amber-900/30 p-2 rounded-lg text-[10px] font-mono shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className={`${eff.color} font-extrabold text-[10px]`}>{eff.label}</span>
              </div>
              <p className="text-slate-900 font-semibold text-[10px] leading-tight">
                {eff.value}
              </p>
              {eff.targetLabel && (
                <div className="pt-1 border-t border-amber-900/15 flex items-center justify-end">
                  <span className="text-[8px] text-amber-900/80 font-extrabold bg-amber-900/10 px-1.5 py-0.5 rounded border border-amber-900/20 whitespace-nowrap">
                    🎯 <span className="text-amber-950 font-black">{eff.targetLabel}</span>
                  </span>
                </div>
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
              <img src="/static/img/icon/star.webp" alt="Loading" className="w-5 h-5 animate-spin object-contain" />
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

            {/* Quests Modal Toggle Button */}
            <button
              onClick={() => {
                playClickSound();
                setIsQuestModalOpen(true);
              }}
              className="px-2.5 sm:px-3 py-2 rounded-xl bg-gradient-to-r from-amber-900 via-amber-800 to-yellow-900 hover:from-amber-800 hover:to-yellow-800 border-2 border-amber-500/80 text-amber-100 transition-all cursor-pointer shadow-lg shadow-amber-950/50 active:scale-95 flex items-center gap-1.5"
              title={t("Ver Missões em Andamento", "View Active Quests")}
            >
              <Scroll className="w-4 h-4 text-amber-300 animate-pulse" />
              <span className="hidden sm:inline text-xs font-black uppercase tracking-wider">{t("Missões", "Quests")}</span>
            </button>

            {gameOver && (
              <button
                onClick={handleQuit}
                className="p-2 hover:bg-[#c49a5d] bg-[#d3ad75]/90 rounded-xl border border-[#7a4e25] text-stone-950 transition-all cursor-pointer shadow"
                title="Sair do Combate"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
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
              onClick={handleEndTurnClick}
              disabled={isEndingTurn || isPreparing || (!isSandbox && activePlanner !== 'player')}
              className={`px-4 sm:px-6 py-2 sm:py-2.5 ${
                isEndingTurn
                  ? 'bg-stone-800/80 text-stone-400 border-stone-600 opacity-60 cursor-not-allowed'
                  : isSandbox
                    ? activePlanner === 'player'
                      ? 'bg-gradient-to-r from-orange-800 to-amber-800 hover:from-orange-700 hover:to-amber-700 text-amber-100 border-orange-600/50 shadow-orange-950/40 cursor-pointer'
                      : 'bg-gradient-to-r from-red-800 to-rose-900 hover:from-red-700 hover:to-rose-800 text-amber-100 border-red-600/50 shadow-red-950/40 cursor-pointer'
                    : activePlanner === 'player'
                      ? 'bg-gradient-to-r from-orange-800 to-amber-800 hover:from-orange-700 hover:to-amber-700 text-amber-100 border-orange-600/50 shadow-orange-950/40 cursor-pointer'
                      : 'bg-stone-800/80 text-stone-400 border-stone-600 opacity-60 cursor-not-allowed'
              } font-black rounded-xl active:scale-95 transition-all shadow-lg text-xs uppercase tracking-widest flex items-center gap-2 border disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isEndingTurn ? (
                <>
                  <img src="/static/img/icon/star.webp" alt="Calculando" className="w-4 h-4 animate-spin object-contain" />
                  <span className="normal-case font-bold">(calculando...)</span>
                </>
              ) : (
                <>
                  <Swords className="w-4 h-4" />
                  {isSandbox
                    ? activePlanner === 'player'
                      ? 'Terminar Turno Jogador'
                      : 'Terminar Turno Oponente'
                    : activePlanner === 'player'
                      ? 'Finalizar Turno'
                      : 'Aguardando...'}
                </>
              )}
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


      <main className="main-area battle-arena-layout max-w-[1700px] w-full mx-auto px-2 sm:px-4 pt-4 pb-36 flex-1 items-start">
        {/* Left Side: PLAYER SQUAD */}
        <section className="battle-left-squad space-y-6">
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
                  equippedBannerUrl: user.equippedBannerUrl,
                  equippedBannerPositionY: user.equippedBannerPositionY,
                  equippedBannerPositionX: user.equippedBannerPositionX,
                  equippedShowcaseSkinUrl: user.equippedShowcaseSkinUrl,
                  xp: Math.max(0, user.xp || 0),
                  rank: user.rank,
                  wins: user.wins || 0,
                  losses: user.losses || 0,
                  village: 'Vila da Folha (Konoha)',
                },
                isSelf: true,
              });
            }}
            className="relative overflow-hidden bg-gradient-to-r from-slate-900/95 via-slate-900/70 to-slate-950/80 border border-slate-800 rounded-2xl p-4 flex items-center gap-4 shadow-2xl group transition-all duration-300 hover:border-orange-500/80 cursor-pointer"
            title="Clique para ver o Card do Perfil & Curtidas"
          >
            {/* Profile Banner Background */}
            {user.equippedBannerUrl && (
              <img
                src={user.equippedBannerUrl || null}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-35 pointer-events-none rounded-2xl z-0"
                style={{ objectPosition: `${user.equippedBannerPositionX ?? 50}% ${user.equippedBannerPositionY ?? 50}%` }}
                referrerPolicy="no-referrer"
              />
            )}
            {user.equippedBannerUrl && <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/50 to-slate-900/20 pointer-events-none rounded-2xl z-0" />}
            {/* Background absolute flare */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/5 rounded-full blur-2xl group-hover:bg-orange-600/10 transition-all pointer-events-none z-0" />
            
            {/* Avatar container with high fidelity glow and frame overlay (Foreground z-10) */}
            <div className="relative z-10 w-14 h-14 flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-tr from-orange-600 to-amber-500 rounded-full blur-sm opacity-50 animate-pulse group-hover:opacity-80 transition-all" />
              <div className="relative w-full h-full rounded-full border-2 border-orange-500/80 overflow-hidden shadow-lg p-0.5 bg-slate-950">
                <img
                  src={user.photoUrl || null}
                  alt={user.name}
                  className="w-full h-full rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              {user.equippedFrameUrl && (
                <img
                  src={user.equippedFrameUrl || null}
                  alt="Moldura"
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[135%] h-[135%] max-w-none pointer-events-none object-contain z-10"
                />
              )}
            </div>

            {/* Profile Info details (Foreground z-10 above banner) */}
            <div className="relative z-10 flex-1 text-left">
              <p className="text-xs font-mono text-orange-400 font-black uppercase tracking-wider mb-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                {user.title || 'Shinobi'}
              </p>
              <h4 className="text-base font-black tracking-tight text-white uppercase truncate flex items-center gap-1.5 font-display group-hover:text-orange-400 transition-colors drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.9)]">
                {user.name}
              </h4>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {(() => {
                  const r = playerCurrentRank;
                  const isNone = !r.color || r.color === 'none';
                  const bgClass = isNone
                    ? ''
                    : (r.color.includes('bg-gradient') ? r.color : `bg-gradient-to-r ${r.color}`);
                  return (
                    <span
                      className={`px-2 py-0.5 rounded-lg border text-[10px] font-mono font-black uppercase tracking-wider shadow-md flex items-center gap-1.5 overflow-hidden relative ${bgClass}`}
                      style={{
                        ...(r.bgColor ? { backgroundColor: r.bgColor } : {}),
                        color: r.fontColor || '#ffffff'
                      }}
                    >
                      {r.imageUrl && (
                        <img src={r.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
                      )}
                      {r.iconUrl ? (
                        <img src={r.iconUrl} alt="" className="w-3 h-3 object-contain relative z-10" />
                      ) : (
                        <Award className="w-3 h-3 relative z-10 text-amber-300" />
                      )}
                      <span className="relative z-10">{r.name}</span>
                    </span>
                  );
                })()}
                <span className="w-1 h-1 bg-slate-500 rounded-full" />
                <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/90 border border-amber-500/60 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                  ⚡ Chakra: {Object.values(playerChakra).reduce((a, b) => a + b, 0)}
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {playerCombatants.map((combatant, idx) => {
              const isMyTurn = activePlanner === 'player' || isSandbox;
              const isSelectedSource = selectedSkill?.charId === combatant.id;
              const hasCued = cuedActions.some(a => a.sourceId === combatant.id);
              const cuedAct = cuedActions.find(a => a.sourceId === combatant.id);
              const isStunned = combatant.activeEffects.some(e => e.type === 'stun' && isEffectVisibleToViewer(e, 'player', playerCombatants, combatant, [...playerCombatants, ...enemyCombatants]));
              const incomingCues = getIncomingCuesForCombatant(combatant);

              return (
                <div key={combatant.id} className="flex items-center gap-2 sm:gap-3 items-stretch">
                  {/* Standing Skin PNG Artwork (OUTSIDE card on left side) */}
                  {(() => {
                    const rawSkin = combatant.character.selectedSkinUrl || combatant.character.skins?.[0]?.image;
                    const portrait = combatant.character.portrait;
                    const isPortrait = !!(rawSkin && portrait && (
                      rawSkin.trim().toLowerCase() === portrait.trim().toLowerCase() ||
                      rawSkin.toLowerCase().endsWith('/icon.jpg') ||
                      rawSkin.toLowerCase().endsWith('/icon.png')
                    ));
                    const skinImg = (rawSkin && !isPortrait) ? rawSkin : null;

                    return (
                      <div className="w-24 sm:w-32 flex-shrink-0 flex items-center justify-center relative select-none pointer-events-none self-stretch">
                        {skinImg ? (
                          <img
                            src={skinImg || null}
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
                        : !isMyTurn
                        ? 'border-slate-800/50 opacity-50'
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
                        const src = playerCombatants.find(p => p.id === cue.sourceId) || enemyCombatants.find(e => e.id === cue.sourceId);
                        const skill = src?.character.skills[cue.skillIndex];
                        const isEnemyCue = cue.sourceId.startsWith('enemy');
                        const isSkillInvisible = !!(skill?.invisible || (skill?.invisibleDuration !== undefined && skill.invisibleDuration > 0));
                        const hasReveal = [...playerCombatants, ...enemyCombatants].some(c => c.activeEffects?.some(e => e.type === 'reveal_invisible' && (e.casterSide === 'player' || !e.casterSide)));
                        const isHiddenCue = isEnemyCue && isSkillInvisible && !hasReveal && !isSandbox;

                        return (
                          <div key={`${cue.sourceId}-${cue.skillIndex}-${cIdx}`} className="group relative">
                            {isHiddenCue ? (
                              <div className="w-5 h-5 rounded border border-pink-600/80 bg-pink-950/90 text-pink-300 flex items-center justify-center text-[10px] font-bold cursor-help" title="Ação Oculta (Invisível)">
                                👁️
                              </div>
                            ) : (
                              <img
                                src={skill?.icon}
                                alt={skill?.name}
                                className="w-5 h-5 rounded border border-orange-500/50 hover:border-orange-400 transition-all object-cover cursor-pointer"
                                onError={(e) => {
                                  const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                                }}
                              />
                            )}
                            {/* Skill Tooltip */}
                            <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover:block bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[9px] text-slate-200 z-50 whitespace-nowrap shadow-2xl pointer-events-none">
                              <span className="text-orange-400 font-bold">{src?.character.name}</span>: [{isHiddenCue ? 'Ação Oculta' : skill?.name}]
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Character Info */}
                  <div className="flex gap-3">
                    {(() => {
                      const isInvul = checkCombatantInvulnerable(combatant);
                      const invulnEff = isInvul ? combatant.activeEffects.find(e => e.type === 'invulnerable') : undefined;
                      const invulnSkillIcon = invulnEff
                        ? (invulnEff.icon ||
                           combatant.character.skills.find(s => (s.invulnerableDuration && s.invulnerableDuration > 0) || (invulnEff.name && invulnEff.name.toLowerCase().includes(s.name.toLowerCase())))?.icon ||
                           [...playerCombatants, ...enemyCombatants].flatMap(c => c.character.skills).find(s => (s.invulnerableDuration && s.invulnerableDuration > 0) || (invulnEff.name && invulnEff.name.toLowerCase().includes(s.name.toLowerCase())))?.icon)
                        : null;

                      const displayPortrait = (isInvul && invulnSkillIcon) ? invulnSkillIcon : combatant.character.portrait;

                      return (
                        <div className={`w-14 h-14 rounded-lg overflow-hidden border flex-shrink-0 relative transition-all ${
                          isInvul ? 'border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)] ring-2 ring-cyan-400/80 bg-slate-950' : 'border-slate-800 bg-slate-950'
                        }`}>
                          <img 
                            src={displayPortrait || null} 
                            alt={combatant.character.name} 
                            decoding="async"
                            loading="eager"
                            title={isInvul ? `Invulnerável por ${invulnEff?.name || 'Skill'}` : combatant.character.name}
                            className="w-full h-full object-cover" 
                            onError={(e) => {
                               e.currentTarget.style.opacity = '0.3';
                            }}
                          />
                          {isStunned && (
                            <div className="absolute inset-0 bg-red-950/85 border border-red-500/80 flex flex-col items-center justify-center p-0.5 font-mono text-[8px] font-black text-red-300 tracking-tighter text-center leading-none uppercase animate-pulse">
                              <span>⚡ STUN</span>
                              <span className="text-[7px] text-red-400">DEBUFF</span>
                            </div>
                          )}
                          {isInvul && (
                            <div className="absolute inset-0 rounded-lg z-10 border-2 border-cyan-400 pointer-events-none shadow-[inset_0_0_8px_rgba(34,211,238,0.5)]" />
                          )}
                        </div>
                      );
                    })()}

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
                                {maxDur >= 99999 ? '♾️ Permanente' : maxDur + 'T'}
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
                        const groupedEffects = getGroupedActiveEffects(combatant.activeEffects, 'player', playerCombatants, combatant, [...playerCombatants, ...enemyCombatants]);

                        return (
                          <div className="flex items-center gap-1.5 pt-1.5 w-full">
                            <div className="flex flex-wrap gap-1.5 items-center">
                              {groupedEffects.map((item, effIdx) => {
                                const eff = item.effect;
                                const isDebuff = item.isDebuff;

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
                                          src={eff.icon || null}
                                          alt={item.skillName || eff.name}
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
                                      <div className="bg-slate-950/95 border border-slate-700 rounded-xl p-2.5 text-center shadow-2xl backdrop-blur-md min-w-[13rem] max-w-[16rem] text-white">
                                        <div className="flex items-center justify-center gap-1.5 mb-1.5 border-b border-slate-800/80 pb-1">
                                          <span className={`text-[8px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded-full border ${
                                            isDebuff ? 'bg-red-950/80 border-red-800/80 text-red-400' : 'bg-emerald-950/80 border-emerald-800/80 text-emerald-400'
                                          }`}>
                                            {isDebuff ? 'DEBUFF' : 'BUFF'}
                                          </span>
                                          <span className="font-extrabold text-xs text-orange-300 truncate">{item.skillName || eff.name}</span>
                                        </div>

                                        {item.subEffects && item.subEffects.length > 1 ? (
                                          <div className="flex flex-col gap-1.5 my-1 text-left">
                                            <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider text-center block">
                                              Efeitos Aplicados ({item.subEffects.length}):
                                            </span>
                                            {item.subEffects.map((sub, sIdx) => (
                                              <div key={sIdx} className="text-xs text-slate-200 font-sans leading-snug bg-slate-900/80 p-1.5 rounded border border-slate-800/80">
                                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                                  <span className="font-extrabold text-[11px] text-amber-300 truncate">
                                                    {sub.effect.name}
                                                  </span>
                                                  <span className="text-[9px] font-mono text-amber-400 font-bold bg-amber-950/80 px-1 rounded border border-amber-800/60 shrink-0">
                                                    {sub.effect.duration >= 99999 ? '♾️ Permanente' : sub.effect.duration + 'T'}
                                                  </span>
                                                </div>
                                                <p className="text-[11px] text-slate-300 leading-tight">
                                                  {sub.description}
                                                </p>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="text-xs text-slate-200 font-sans leading-snug my-1 text-left">
                                            {item.description}
                                          </p>
                                        )}

                                        <div className="flex items-center justify-center gap-2 pt-1 border-t border-slate-800/80 text-[10px] font-mono text-slate-400 mt-1">
                                          <span>Duração: <strong className="text-amber-400">{eff.duration >= 99999 ? '♾️ Permanente' : eff.duration + 'T'}</strong></span>
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
                            const isSelected = selectedSkill?.charId === combatant.id && selectedSkill?.skillIndex === sIdx;
                            const simulatedChakraForThisChar = getSimulatedRemainingChakra(
                              playerChakra,
                              cuedActions.filter(a => a.sourceId !== combatant.id)
                            );
                            const canAfford = canAffordSkill(skill, simulatedChakraForThisChar, combatant, [...playerCombatants, ...enemyCombatants]);
                            const effectiveCost = getEffectiveSkillCost(skill, combatant, [...playerCombatants, ...enemyCombatants]);
                            const isRequiredEffectLocked = skill.requireEffect && !combatant.activeEffects.some(e => e.name && (e.name.toLowerCase() === skill.requireEffect!.toLowerCase() || e.name.toLowerCase().startsWith(skill.requireEffect!.toLowerCase()) || e.name.toLowerCase().includes(skill.requireEffect!.toLowerCase())));
                            const prevSkillsUsed = lastTurnUsedSkills.current[combatant.id];
                            const isPrevSkillLocked = skill.requirePreviousSkill ? !(prevSkillsUsed && prevSkillsUsed.has(skill.requirePreviousSkill)) : false;
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
                                className={`group relative aspect-square rounded-lg border bg-slate-950 flex flex-col items-center justify-center cursor-pointer transition-all ${
                                  isSelected
                                    ? 'border-amber-400 shadow-lg shadow-amber-500/50 ring-2 ring-amber-400 z-20 scale-105'
                                    : isCued
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
                                <div className="absolute inset-0 rounded-lg overflow-hidden flex flex-col items-center justify-center">
                                  <img 
                                    src={skill.icon || null} 
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

                                  {/* Previous Skill Locked Overlay (🔒) */}
                                  {isPrevSkillLocked && !isCooldown && !isStunBlocked && !isRequiredEffectLocked && (
                                    <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center">
                                      <span className="text-cyan-500 font-bold drop-shadow-md text-xs">🔒</span>
                                    </div>
                                  )}

                                  {/* HP Threshold Locked Overlay */}
                                  {skill.requireHpBelow && skill.requireHpBelow > 0 && combatant.health > skill.requireHpBelow && !isCooldown && !isStunBlocked && !isRequiredEffectLocked && !isPrevSkillLocked && (
                                    <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center">
                                      <span className="text-red-500 font-bold drop-shadow-md text-xs">❤️‍acyl</span>
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

                                  {/* Selected Target Prompt Overlay */}
                                  {isSelected && !isCued && (
                                    <div className="absolute inset-0 bg-amber-950/90 border-2 border-amber-400 flex flex-col items-center justify-center p-0.5 text-center z-20 animate-pulse">
                                      <span className="text-amber-300 text-[8px] sm:text-[9px] font-mono font-black uppercase tracking-tight leading-none drop-shadow-md">
                                        SELECIONE O ALVO
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Hover Details tooltip card */}
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-48 bg-slate-900 border border-slate-700/80 p-2.5 rounded-lg shadow-2xl z-[100] pointer-events-none text-left">
                                  <p className="font-bold text-xs text-white pb-1 border-b border-slate-800">{translateSkillName(skill.name, language)}</p>
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
                                  {skill.requirePreviousSkill && (
                                    <p className={`text-[9px] font-bold mt-1 font-mono ${isPrevSkillLocked ? 'text-cyan-500' : 'text-emerald-500'}`}>
                                      {isPrevSkillLocked ? '🔒 Anterior: ' : '🔓 Anterior: '} {skill.requirePreviousSkill}
                                    </p>
                                  )}
                                  {skill.requireHpBelow && skill.requireHpBelow > 0 && (
                                    <p className={`text-[9px] font-bold mt-1 font-mono ${combatant.health > skill.requireHpBelow ? 'text-red-500' : 'text-emerald-500'}`}>
                                      {combatant.health > skill.requireHpBelow ? `🔒 HP ≤ ${skill.requireHpBelow}` : `🔓 HP ≤ ${skill.requireHpBelow}`}
                                    </p>
                                  )}

                                    <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 pt-1.5 border-t border-slate-800/60 mt-2">
                                      <span>Cooldown: {skill.permanent ? '♾️ Permanente' : skill.cooldown}</span>
                                      <div className="flex gap-0.5 items-center">
                                        {effectiveCost.map((c, costIdx) => (
                                          <div key={costIdx} className="scale-75">{renderChakraIcon(c as keyof ChakraPool)}</div>
                                        ))}
                                        {effectiveCost.length < skill.cost.length && (
                                          <span className="text-[8px] font-bold text-emerald-400 font-mono ml-0.5" title="Custo de Chakra Reduzido por Regra">⚡</span>
                                        )}
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

      {/* Center: ARENA CONTROL BOARD & CHAKRA */}
      <section className="battle-center-squad space-y-4 p-1 sm:p-2">
        {/* TURN, TIMER, TURN STATUS & CHAKRA PANEL (turnoss.webp) */}
          <div
            className="relative w-full rounded-2xl overflow-hidden p-3 sm:p-4 shadow-2xl flex flex-col justify-between border border-amber-900/30"
            style={{
              backgroundImage: "url('/static/img/turnoss.webp')",
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              minHeight: "230px"
            }}
          >
            {/* Top Area: Clean text directly on turnoss.webp without dark background or border */}
            <div className="space-y-1.5 px-1 pt-1 flex flex-col items-center justify-center text-center">
              <div className="flex flex-col items-center justify-center gap-1.5 pb-1">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
                  <h2 className="text-sm sm:text-base font-black tracking-wider text-amber-100 font-sans drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.9)] uppercase">
                    TURNO {turn}
                  </h2>
                </div>

                {!gameOver && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-black uppercase tracking-wider shadow ${
                      timeLeft <= 10
                        ? 'bg-red-900/90 text-red-100 border-red-500 animate-pulse'
                        : 'bg-amber-950/80 border-amber-500/50 text-amber-100'
                    }`}>
                      <Clock className={`w-3 h-3 ${timeLeft <= 10 ? 'animate-bounce text-red-300' : 'text-amber-300 animate-pulse'}`} />
                      <span>{timeLeft}s</span>
                    </div>

                    <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-black uppercase tracking-wider shadow ${
                      isWaitingForOpponent
                        ? 'bg-amber-950/80 border-amber-500/60 text-amber-200 animate-pulse'
                        : activePlanner === 'player'
                          ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-100'
                          : 'bg-red-950/80 border-red-500/60 text-red-100 animate-pulse'
                    }`}>
                      {isWaitingForOpponent
                        ? 'Aguardando Oponente...'
                        : activePlanner === 'player'
                          ? 'Seu Turno'
                          : 'Vez do Oponente'}
                    </div>
                  </div>
                )}
              </div>

              {/* Chakra Header Row */}
              <div className="flex flex-col items-center justify-center gap-1 pt-0.5 text-center">
                <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-amber-100 font-extrabold drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.9)]">
                  Estoque de Chakra
                </span>
                <div className="flex items-center justify-center gap-2.5">
                  <button
                    onClick={() => setShowChakraTrade(true)}
                    className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-amber-950 bg-amber-100/80 hover:bg-amber-200/90 border border-amber-800/50 rounded px-2.5 py-0.5 cursor-pointer shadow transition-all"
                  >
                    Trocar 4→1
                  </button>
                  <span className="text-[10px] text-amber-950 font-mono font-black bg-amber-100/80 border border-amber-800/50 px-2 py-0.5 rounded shadow">
                    Total: {Object.values(playerChakra).reduce((a, b) => a + b, 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Area: Cylinders Chakra Quantities aligned precisely on the 4 cylinders in turnoss.webp */}
            <div className="relative w-full h-12 mt-4">
              {(() => {
                const simulatedChakra = getSimulatedRemainingChakra(playerChakra, cuedActions);
                const chakraPositions: { key: keyof ChakraPool; className: string }[] = [
                  { key: 'Tai', className: 'chakra-number-tai' },
                  { key: 'Blood', className: 'chakra-number-blood' },
                  { key: 'Nin', className: 'chakra-number-nin' },
                  { key: 'Gen', className: 'chakra-number-gen' },
                ];

                return chakraPositions.map(({ key, className }) => {
                  const val = playerChakra[key] || 0;
                  const simulatedVal = simulatedChakra[key];
                  const hasChange = simulatedVal !== val;

                  return (
                    <div 
                      key={key} 
                      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-auto ${className}`}
                    >
                      <span className="font-mono text-xs sm:text-sm font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] flex items-center justify-center">
                        {val}
                        {hasChange && (
                          <span className="text-orange-300 text-[10px] sm:text-xs ml-1 font-bold animate-pulse">
                            ({simulatedVal})
                          </span>
                        )}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Skill Inspector Details (skills_detalhes.webp) */}
          <div
            className="relative w-full rounded-2xl overflow-hidden p-3.5 sm:p-5 shadow-2xl flex flex-col border border-amber-900/30"
            style={{
              backgroundImage: "url('/static/img/skills_detalhes.webp')",
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              minHeight: "360px"
            }}
          >
            {inspectedSkill ? (
              <div className="flex flex-col h-full space-y-3">
                {/* Top Green Header Area: No dark background box, clean alignment over green top banner */}
                <div className="flex items-center gap-3 px-1 pt-0.5 pb-2" style={{ marginTop: '-5px' }}>
                  <div className="w-12 h-12 rounded-lg overflow-hidden border border-amber-300/60 flex-shrink-0 bg-black/40 shadow-md">
                    <img 
                      src={inspectedSkill.skill.icon || null} 
                      alt={inspectedSkill.skill.name} 
                      className={`w-full h-full object-cover ${inspectedSkill.isEnemy ? 'scale-x-[-1]' : ''}`}
                      onError={(e) => {
                        const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="group relative inline-block max-w-full">
                        <h4 
                          className="font-extrabold text-sm sm:text-base text-white tracking-tight drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.9)] leading-tight"
                        >
                          {translateSkillName(inspectedSkill.skill.name, language)}
                        </h4>
                        {/* Custom Hover Tooltip for complete skill name */}
                        <div className="absolute top-full left-0 mt-1 hidden group-hover:flex flex-col bg-slate-950/98 border border-amber-500/60 p-2.5 rounded-xl shadow-2xl z-[100] pointer-events-none whitespace-normal min-w-[200px] max-w-[300px]">
                          <span className="text-xs font-black text-amber-300 font-sans tracking-tight drop-shadow">
                            {translateSkillName(inspectedSkill.skill.name, language)}
                          </span>
                          {translateSkillName(inspectedSkill.skill.name, language) !== inspectedSkill.skill.name && (
                            <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                              ({inspectedSkill.skill.name})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-amber-100 font-medium mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                     <span className="text-amber-300 font-extrabold">{inspectedSkill.ownerName}</span>
                    </p>
                  </div>
                </div>

                {/* 3 Papers Grid: Custo, Recarga, Alvo positioned cleanly over paper artwork */}
                <div className="grid grid-cols-3 gap-1 font-mono pb-0.5 px-1" style={{ paddingTop: '11px' }}>
                  {/* Paper 1: Custo */}
                  <div className="flex flex-col justify-center items-center text-center p-0.5 min-w-0">
                    <span className="text-amber-950 font-black uppercase tracking-wider text-[8.5px] leading-none drop-shadow-xs">Custo</span>
                    <div className="flex flex-wrap justify-center gap-0.5 mt-0.5 items-center max-w-full">
                      {(() => {
                        const effectiveCost = getEffectiveSkillCost(inspectedSkill.skill, inspectedSkill.combatant, [...playerCombatants, ...enemyCombatants]);
                        if (inspectedSkill.skill.noChakraCost || effectiveCost.length === 0) {
                          return <span className="text-emerald-950 text-[8.5px] font-black leading-tight whitespace-normal text-center">Sem Custo</span>;
                        }
                        return (
                          <>
                            {effectiveCost.map((c, idx) => (
                              <div key={idx} className="scale-90 -m-0.5">{renderChakraIcon(c)}</div>
                            ))}
                            {effectiveCost.length < inspectedSkill.skill.cost.length && (
                              <span className="text-[7.5px] font-black text-emerald-950 font-mono leading-none">⚡Reduzido</span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Paper 2: Recarga */}
                  <div className="flex flex-col justify-center items-center text-center p-0.5 min-w-0">
                    <span className="text-amber-950 font-black uppercase tracking-wider text-[8.5px] leading-none drop-shadow-xs">Recarga</span>
                    <p className="font-extrabold text-amber-950 text-[8.5px] leading-[1.1] mt-0.5 whitespace-normal break-words text-center">
                      {inspectedSkill.skill.cooldown === 0 ? 'Sem Recarga' : `${inspectedSkill.skill.cooldown} turnos`}
                    </p>
                  </div>

                  {/* Paper 3: Alvo */}
                  <div className="flex flex-col justify-center items-center text-center p-0.5 min-w-0">
                    <span className="text-amber-950 font-black uppercase tracking-wider text-[8.5px] leading-none drop-shadow-xs">Alvo</span>
                    <p className="font-extrabold text-amber-950 text-[8.5px] leading-[1.1] mt-0.5 whitespace-normal break-words text-center max-w-full px-0.5">
                      {inspectedSkill.skill.targetType === 'Enemy' && 'Inimigo Único'}
                      {inspectedSkill.skill.targetType === 'Self' && 'Próprio'}
                      {inspectedSkill.skill.targetType === 'Ally' && 'Aliado Único'}
                      {inspectedSkill.skill.targetType === 'AllEnemies' && 'Todos Inimigos'}
                      {inspectedSkill.skill.targetType === 'AllAllies' && 'Todos Aliados'}
                    </p>
                  </div>
                </div>

                {/* Below Papers: Classes, Tags, Requirements & Description */}
                <div className=" rounded-lg p-2.5 space-y-2 overflow-y-auto max-h-[190px] scrollbar-thin scrollbar-thumb-amber-800/40">
                  {/* Classes & Tags */}
                  {inspectedSkill.skill.classes && inspectedSkill.skill.classes.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {inspectedSkill.skill.classes.map((cls, idx) => (
                        <span key={idx} className="text-[9px] font-mono bg-amber-900/25 text-amber-950 font-extrabold px-2 py-0.5 rounded border border-amber-900/30">
                          {cls}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Protection & Immunity Tags */}
                  {(inspectedSkill.skill.cannotBeCountered || inspectedSkill.skill.cannotBeReflected || inspectedSkill.skill.doNotApplyIfActive) && (
                    <div className="flex flex-wrap gap-1">
                      {inspectedSkill.skill.cannotBeCountered && (
                        <span className="text-[9px] font-mono bg-red-900/20 text-red-950 px-2 py-0.5 rounded border border-red-900/30 font-bold uppercase">
                          🚫 Incontra-atacável
                        </span>
                      )}
                      {inspectedSkill.skill.cannotBeReflected && (
                        <span className="text-[9px] font-mono bg-cyan-900/20 text-cyan-950 px-2 py-0.5 rounded border border-cyan-900/30 font-bold uppercase">
                          🚫 Irrefletível
                        </span>
                      )}
                      {inspectedSkill.skill.doNotApplyIfActive && (
                        <span className="text-[9px] font-mono bg-amber-900/20 text-amber-950 px-2 py-0.5 rounded border border-amber-900/30 font-bold uppercase">
                          🚫 Não Re-aplicável
                        </span>
                      )}
                    </div>
                  )}

                  {/* Requirements Warnings */}
                  {inspectedSkill.skill.requireEffect && (
                    <div className="bg-amber-500/20 border border-amber-700/30 p-1.5 rounded text-[9px] font-mono text-amber-950 font-bold flex items-center gap-1">
                      <span>⚠️ Requer efeito ativo:</span>
                      <span className="underline">{inspectedSkill.skill.requireEffect}</span>
                    </div>
                  )}
                  {inspectedSkill.skill.requirePreviousSkill && (
                    <div className="bg-cyan-500/20 border border-cyan-700/30 p-1.5 rounded text-[9px] font-mono text-cyan-950 font-bold flex items-center gap-1">
                      <span>⚠️ Requer no turno anterior:</span>
                      <span className="underline">{inspectedSkill.skill.requirePreviousSkill}</span>
                    </div>
                  )}
                  {inspectedSkill.skill.requireTargetEffect && (
                    <div className="bg-amber-500/20 border border-amber-700/30 p-1.5 rounded text-[9px] font-mono text-amber-950 font-bold flex items-center gap-1">
                      <span>⚠️ Requer efeito no alvo:</span>
                      <span className="underline">{inspectedSkill.skill.requireTargetEffect}</span>
                    </div>
                  )}
                  {inspectedSkill.skill.requireHpBelow && inspectedSkill.skill.requireHpBelow > 0 && (
                    <div className="bg-red-500/20 border border-red-700/30 p-1.5 rounded text-[9px] font-mono text-red-950 font-bold flex items-center gap-1">
                      <span>⚠️ Requer HP ≤</span>
                      <span className="underline">{inspectedSkill.skill.requireHpBelow}</span>
                    </div>
                  )}

                  {/* Detailed Description */}
                  <p className="text-xs text-slate-900 font-medium leading-relaxed">
                    {inspectedSkill.skill.desc}
                  </p>
                  {renderSkillCustomEffects(inspectedSkill.skill)}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-6 my-auto space-y-2">
                <Info className="w-8 h-8 text-amber-950/70 animate-pulse" />
                <p className="text-xs font-mono text-amber-950 font-extrabold">Inspecione uma Habilidade</p>
                <p className="text-[10px] text-amber-900 font-semibold max-w-xs">
                  Clique em qualquer ícone de habilidade dos seus aliados ou dos oponentes para ver as estatísticas, custos e descrições aqui.
                </p>
              </div>
            )}
          </div>

          {/* Suas Ações Preparadas (ações.webp) */}
          <div
            className="relative w-full rounded-2xl overflow-hidden p-3.5 sm:p-4 shadow-2xl flex flex-col border border-amber-900/20"
            style={{
              backgroundImage: "url('/static/img/ações.webp')",
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              minHeight: "130px"
            }}
          >
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-900 font-extrabold pb-1.5 border-b border-black/20 flex items-center justify-between">
              <span>Suas Ações Preparadas</span>
              <span className="bg-amber-900/30 text-amber-950 px-2 py-0.5 rounded-full text-[10px] font-extrabold">{cuedActions.length}</span>
            </h3>

            {cuedActions.length === 0 ? (
              <p className="text-xs text-slate-800 text-center py-3 italic font-mono font-bold">
                Nenhuma ação preparada. Selecione habilidades e alvos.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-32 overflow-y-auto mt-2 pr-1 scrollbar-thin scrollbar-thumb-amber-800/40">
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
                      className="flex justify-between items-center bg-amber-100/70 border border-amber-900/30 p-2 rounded-lg text-[10px] font-mono shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <img 
                          src={skill?.icon} 
                          alt={skill?.name} 
                          className={`w-5 h-5 rounded object-cover border border-amber-900/40 ${isSrcEnemy ? 'scale-x-[-1]' : ''}`}
                          onError={(e) => {
                            const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                          }}
                        />
                        <span className="text-slate-900 font-semibold">
                          <strong className={isSrcEnemy ? 'text-red-900' : 'text-amber-900'}>{src?.character.name}</strong> vai usar [
                          <span className="font-extrabold text-amber-950">{skill?.name}</span>] em <strong className={action.targetId.startsWith('enemy') ? 'text-red-900' : 'text-blue-900'}>{tgt?.character.name}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right Side: ENEMY SQUAD */}
        <section className="battle-right-squad space-y-6">
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
                  photoUrl: opp?.photoUrl || 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/kakashi-hatake/icon.jpg',
                  title: opp?.title || 'Renegado S-Rank',
                  equippedFrame: opp?.equippedFrame,
                  equippedFrameUrl: opp?.equippedFrameUrl,
                  equippedBannerUrl: opp?.equippedBannerUrl,
                  equippedBannerPositionY: opp?.equippedBannerPositionY,
                  equippedBannerPositionX: opp?.equippedBannerPositionX,
                  equippedShowcaseSkinUrl: opp?.equippedShowcaseSkinUrl,
                  isBot: !isOnline,
                  xp: opp?.xp || 1500,
                  rank: opp?.rank || 'Anbu',
                  wins: opp?.wins || 35,
                  losses: opp?.losses || 12,
                  village: isOnline ? 'Vila Oponente' : 'Vila do Som',
                },
                isSelf: false,
              });
            }}
            className="relative overflow-hidden bg-gradient-to-r from-slate-950/80 via-slate-900/70 to-slate-900/95 border border-slate-800 rounded-2xl p-4 flex items-center gap-4 flex-row-reverse text-right shadow-2xl group transition-all duration-300 hover:border-red-500/80 cursor-pointer"
            title="Clique para ver o Card do Perfil do Oponente & Curtir"
          >
            {/* Profile Banner Background */}
            {onlineParams?.isOnline && onlineParams.opponentProfile?.equippedBannerUrl && (
              <img
                src={onlineParams.opponentProfile.equippedBannerUrl || null}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-35 pointer-events-none rounded-2xl z-0"
                style={{ objectPosition: `${onlineParams.opponentProfile.equippedBannerPositionX ?? 50}% ${onlineParams.opponentProfile.equippedBannerPositionY ?? 50}%` }}
                referrerPolicy="no-referrer"
              />
            )}
            {onlineParams?.isOnline && onlineParams.opponentProfile?.equippedBannerUrl && <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/50 to-slate-900/20 pointer-events-none rounded-2xl z-0" />}
            {/* Background absolute flare */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full blur-2xl group-hover:bg-red-600/10 transition-all pointer-events-none z-0" />
            
            {/* Avatar container with high fidelity glow and frame overlay (Foreground z-10) */}
            <div className="relative z-10 w-14 h-14 flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-tr from-red-600 to-rose-500 rounded-full blur-sm opacity-50 animate-pulse group-hover:opacity-80 transition-all" />
              <div className="relative w-full h-full rounded-full border-2 border-red-500/80 overflow-hidden shadow-lg p-0.5 bg-slate-950">
                <img
                  src={onlineParams?.isOnline ? onlineParams.opponentProfile.photoUrl : 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/kakashi-hatake/icon.jpg'}
                  alt={onlineParams?.isOnline ? onlineParams.opponentProfile.name : 'I.A. Oponente'}
                  className="w-full h-full rounded-full object-cover scale-x-[-1]"
                  referrerPolicy="no-referrer"
                  decoding="async"
                  loading="eager"
                />
              </div>
              {onlineParams?.isOnline && onlineParams.opponentProfile.equippedFrameUrl && (
                <img
                  src={onlineParams.opponentProfile.equippedFrameUrl || null}
                  alt="Moldura Oponente"
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[135%] h-[135%] max-w-none pointer-events-none object-contain z-10"
                />
              )}
              <div className="absolute -bottom-1.5 -right-1.5 bg-gradient-to-r from-red-600 to-rose-500 text-white text-[8px] font-black font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border border-slate-950 shadow z-20">
                {onlineParams?.isOnline ? 'LIVE' : 'BOT'}
              </div>
            </div>

            {/* Profile Info details (Foreground z-10 above banner) */}
            <div className="relative z-10 flex-1 text-right">
              <p className="text-xs font-mono text-red-400 font-black uppercase tracking-wider mb-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                {onlineParams?.isOnline ? (onlineParams.opponentProfile.title || 'Oponente') : 'Renegado S-Rank'}
              </p>
              <h4 className="text-base font-black tracking-tight text-white uppercase truncate flex items-center justify-end gap-1.5 font-display group-hover:text-red-400 transition-colors drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.9)]">
                {onlineParams?.isOnline ? onlineParams.opponentProfile.name : 'I.A. Kakashi'}
              </h4>
              <div className="flex items-center justify-end gap-2 mt-0.5 flex-wrap">
                {(() => {
                  const r = opponentCurrentRank;
                  const isNone = !r.color || r.color === 'none';
                  const bgClass = isNone
                    ? ''
                    : (r.color.includes('bg-gradient') ? r.color : `bg-gradient-to-r ${r.color}`);
                  return (
                    <span
                      className={`px-2 py-0.5 rounded-lg border text-[10px] font-mono font-black uppercase tracking-wider shadow-md flex items-center justify-end gap-1.5 overflow-hidden relative ${bgClass}`}
                      style={{
                        ...(r.bgColor ? { backgroundColor: r.bgColor } : {}),
                        color: r.fontColor || '#ffffff'
                      }}
                    >
                      {r.imageUrl && (
                        <img src={r.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
                      )}
                      {r.iconUrl ? (
                        <img src={r.iconUrl} alt="" className="w-3 h-3 object-contain relative z-10" />
                      ) : (
                        <Award className="w-3 h-3 relative z-10 text-red-300" />
                      )}
                      <span className="relative z-10">{r.name}</span>
                    </span>
                  );
                })()}
                <span className="w-1 h-1 bg-slate-500 rounded-full" />
                <span className="text-[10px] font-mono font-bold text-red-300 bg-red-950/90 border border-red-500/60 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                  ⚡ Chakra: {Object.values(enemyChakra).reduce((a, b) => a + b, 0)}
                </span>
              </div>
            </div>
          </div>
       
          <div className="space-y-4">
            {enemyCombatants.map((combatant, idx) => {
              const isStunned = combatant.activeEffects.some(e => e.type === 'stun' && isEffectVisibleToViewer(e, 'player', playerCombatants, combatant, [...playerCombatants, ...enemyCombatants]));
              const incomingCues = getIncomingCuesForCombatant(combatant);

              return (
                <div key={combatant.id} className="flex items-center gap-2 sm:gap-3 items-stretch">
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
                        const src = playerCombatants.find(p => p.id === cue.sourceId) || enemyCombatants.find(e => e.id === cue.sourceId);
                        const skill = src?.character.skills[cue.skillIndex];
                        const isEnemyCue = cue.sourceId.startsWith('enemy');
                        const isSkillInvisible = !!(skill?.invisible || (skill?.invisibleDuration !== undefined && skill.invisibleDuration > 0));
                        const hasReveal = [...playerCombatants, ...enemyCombatants].some(c => c.activeEffects?.some(e => e.type === 'reveal_invisible' && (e.casterSide === 'player' || !e.casterSide)));
                        const isHiddenCue = isEnemyCue && isSkillInvisible && !hasReveal && !isSandbox;

                        return (
                          <div key={`${cue.sourceId}-${cue.skillIndex}-${cIdx}`} className="group relative">
                            {isHiddenCue ? (
                              <div className="w-5 h-5 rounded border border-pink-600/80 bg-pink-950/90 text-pink-300 flex items-center justify-center text-[10px] font-bold cursor-help" title="Ação Oculta (Invisível)">
                                👁️
                              </div>
                            ) : (
                              <img
                                src={skill?.icon}
                                alt={skill?.name}
                                className="w-5 h-5 rounded border border-orange-500/50 hover:border-orange-400 transition-all object-cover cursor-pointer"
                                onError={(e) => {
                                  const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                                }}
                              />
                            )}
                            {/* Skill Tooltip */}
                            <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover:block bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[9px] text-slate-200 z-50 whitespace-nowrap shadow-2xl pointer-events-none">
                              <span className="text-orange-400 font-bold">{src?.character.name}</span>: [{isHiddenCue ? 'Ação Oculta' : skill?.name}]
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Character Info */}
                  <div className="flex gap-3 flex-row-reverse">
                    {(() => {
                      const isInvul = checkCombatantInvulnerable(combatant);
                      const invulnEff = isInvul ? combatant.activeEffects.find(e => e.type === 'invulnerable') : undefined;
                      const invulnSkillIcon = invulnEff
                        ? (invulnEff.icon ||
                           combatant.character.skills.find(s => (s.invulnerableDuration && s.invulnerableDuration > 0) || (invulnEff.name && invulnEff.name.toLowerCase().includes(s.name.toLowerCase())))?.icon ||
                           [...playerCombatants, ...enemyCombatants].flatMap(c => c.character.skills).find(s => (s.invulnerableDuration && s.invulnerableDuration > 0) || (invulnEff.name && invulnEff.name.toLowerCase().includes(s.name.toLowerCase())))?.icon)
                        : null;

                      const displayPortrait = (isInvul && invulnSkillIcon) ? invulnSkillIcon : combatant.character.portrait;

                      return (
                        <div className={`w-14 h-14 rounded-lg overflow-hidden border flex-shrink-0 relative transition-all ${
                          isInvul ? 'border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)] ring-2 ring-cyan-400/80 bg-slate-950' : 'border-slate-800 bg-slate-950'
                        }`}>
                          <img 
                            src={displayPortrait || null} 
                            alt={combatant.character.name} 
                            decoding="async"
                            loading="eager"
                            title={isInvul ? `Invulnerável por ${invulnEff?.name || 'Skill'}` : combatant.character.name}
                            className={`w-full h-full object-cover ${isInvul ? '' : 'scale-x-[-1]'}`}
                            onError={(e) => {
                              e.currentTarget.style.opacity = '0.3';
                            }}
                          />
                          {isStunned && (
                            <div className="absolute inset-0 bg-red-950/85 border border-red-500/80 flex flex-col items-center justify-center p-0.5 font-mono text-[8px] font-black text-red-300 tracking-tighter text-center leading-none uppercase animate-pulse">
                              <span>⚡ STUN</span>
                              <span className="text-[7px] text-red-400">DEBUFF</span>
                            </div>
                          )}
                          {isInvul && (
                            <div className="absolute inset-0 rounded-lg z-10 border-2 border-cyan-400 pointer-events-none shadow-[inset_0_0_8px_rgba(34,211,238,0.5)]" />
                          )}
                        </div>
                      );
                    })()}

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
                                {maxDur >= 99999 ? '♾️ Permanente' : maxDur + 'T'}
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
                        const groupedEffects = getGroupedActiveEffects(combatant.activeEffects, 'player', playerCombatants, combatant, [...playerCombatants, ...enemyCombatants]);

                        return (
                          <div className="flex items-center gap-1.5 pt-1.5 w-full">
                            <div className="flex flex-wrap gap-1.5 items-center">
                              {groupedEffects.map((item, effIdx) => {
                                const eff = item.effect;
                                const isDebuff = item.isDebuff;

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
                                          src={eff.icon || null}
                                          alt={item.skillName || eff.name}
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
                                      <div className="bg-slate-950/95 border border-slate-700 rounded-xl p-2.5 text-center shadow-2xl backdrop-blur-md min-w-[13rem] max-w-[16rem] text-white">
                                        <div className="flex items-center justify-center gap-1.5 mb-1.5 border-b border-slate-800/80 pb-1">
                                          <span className={`text-[8px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded-full border ${
                                            isDebuff ? 'bg-red-950/80 border-red-800/80 text-red-400' : 'bg-emerald-950/80 border-emerald-800/80 text-emerald-400'
                                          }`}>
                                            {isDebuff ? 'DEBUFF' : 'BUFF'}
                                          </span>
                                          <span className="font-extrabold text-xs text-orange-300 truncate">{item.skillName || eff.name}</span>
                                        </div>

                                        {(eff.isInvisible || eff.type === 'invisible') && (
                                          <p className="text-[9px] font-mono font-bold text-pink-400 bg-pink-950/80 px-1.5 py-0.5 rounded border border-pink-800/80 my-1">
                                            👁️‍🗨️ INVISÍVEL PARA O OPONENTE
                                          </p>
                                        )}

                                        {item.subEffects && item.subEffects.length > 1 ? (
                                          <div className="flex flex-col gap-1.5 my-1 text-left">
                                            <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider text-center block">
                                              Efeitos Aplicados ({item.subEffects.length}):
                                            </span>
                                            {item.subEffects.map((sub, sIdx) => (
                                              <div key={sIdx} className="text-xs text-slate-200 font-sans leading-snug bg-slate-900/80 p-1.5 rounded border border-slate-800/80">
                                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                                  <span className="font-extrabold text-[11px] text-amber-300 truncate">
                                                    {sub.effect.name}
                                                  </span>
                                                  <span className="text-[9px] font-mono text-amber-400 font-bold bg-amber-950/80 px-1 rounded border border-amber-800/60 shrink-0">
                                                    {sub.effect.duration >= 99999 ? '♾️ Permanente' : sub.effect.duration + 'T'}
                                                  </span>
                                                </div>
                                                <p className="text-[11px] text-slate-300 leading-tight">
                                                  {sub.description}
                                                </p>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="text-xs text-slate-200 font-sans leading-snug my-1 text-left">
                                            {item.description}
                                          </p>
                                        )}

                                        <div className="flex items-center justify-center gap-2 pt-1 border-t border-slate-800/80 text-[10px] font-mono text-slate-400 mt-1">
                                          <span>Duração: <strong className="text-amber-400">{eff.duration >= 99999 ? '♾️ Permanente' : eff.duration + 'T'}</strong></span>
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
                            const hasRevealInvisible = [...playerCombatants, ...enemyCombatants].some(
                              c => c.activeEffects?.some(e => e.type === 'reveal_invisible' && (e.casterSide === 'player' || !e.casterSide))
                            );
                            const isSkillInvisibleToOpponent = (skill.invisible || (skill.invisibleDuration !== undefined && skill.invisibleDuration > 0)) && !hasRevealInvisible;

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
                            const isSelected = selectedSkill?.charId === combatant.id && selectedSkill?.skillIndex === sIdx;
                            const simulatedChakraForThisChar = getSimulatedRemainingChakra(enemyChakra, cuedActions.filter(a => a.sourceId !== combatant.id), true);
                            const canAfford = canAffordSkill(skill, simulatedChakraForThisChar, combatant, [...playerCombatants, ...enemyCombatants]);
                            const effectiveCost = getEffectiveSkillCost(skill, combatant, [...playerCombatants, ...enemyCombatants]);
                            const isRequiredEffectLocked = skill.requireEffect && !combatant.activeEffects.some(e => e.name && (e.name.toLowerCase() === skill.requireEffect!.toLowerCase() || e.name.toLowerCase().startsWith(skill.requireEffect!.toLowerCase()) || e.name.toLowerCase().includes(skill.requireEffect!.toLowerCase())));
                            const prevSkillsUsed = lastTurnUsedSkills.current[combatant.id];
                            const isPrevSkillLocked = skill.requirePreviousSkill ? !(prevSkillsUsed && prevSkillsUsed.has(skill.requirePreviousSkill)) : false;
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
                                  className={`group relative aspect-square rounded-lg border bg-slate-950 flex flex-col items-center justify-center cursor-pointer transition-all ${
                                    isSelected
                                      ? 'border-amber-400 shadow-lg shadow-amber-500/50 ring-2 ring-amber-400 z-20 scale-105'
                                      : isCued
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
                                  <div className="absolute inset-0 rounded-lg overflow-hidden flex flex-col items-center justify-center">
                                    <img 
                                      src={skill.icon || null} 
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

                                    {/* Previous Skill Locked Overlay (🔒) */}
                                    {isPrevSkillLocked && !isCooldown && !isStunBlocked && !isRequiredEffectLocked && (
                                      <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center">
                                        <span className="text-cyan-500 font-bold drop-shadow-md text-xs">🔒</span>
                                      </div>
                                    )}

                                    {/* HP Threshold Locked Overlay */}
                                    {skill.requireHpBelow && skill.requireHpBelow > 0 && combatant.health > skill.requireHpBelow && !isCooldown && !isStunBlocked && !isRequiredEffectLocked && !isPrevSkillLocked && (
                                      <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center">
                                        <span className="text-red-500 font-bold drop-shadow-md text-xs">❤️‍acyl</span>
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

                                    {/* Selected Target Prompt Overlay */}
                                    {isSelected && !isCued && (
                                      <div className="absolute inset-0 bg-amber-950/90 border-2 border-amber-400 flex flex-col items-center justify-center p-0.5 text-center z-20 animate-pulse">
                                        <span className="text-amber-300 text-[8px] sm:text-[9px] font-mono font-black uppercase tracking-tight leading-none drop-shadow-md">
                                          SELECIONE O ALVO
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Hover Details tooltip card */}
                                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-48 bg-slate-900 border border-slate-700/80 p-2.5 rounded-lg shadow-2xl z-[100] pointer-events-none text-left">
                                    <p className="font-bold text-xs text-white pb-1 border-b border-slate-800">{translateSkillName(skill.name, language)}</p>
                                    <p className="text-[10px] text-slate-400 leading-normal pt-1">{translateGameText(skill.desc, language)}</p>
                                    
                                    {(skill.cannotBeCountered || skill.cannotBeReflected) && (
                                      <div className="flex flex-col gap-0.5 mt-1 text-[8px] font-mono">
                                        {skill.cannotBeCountered && (
                                          <span className="text-red-400 font-bold">{t("🚫 Incontra-atacável", "🚫 Uncounterable")}</span>
                                        )}
                                        {skill.cannotBeReflected && (
                                          <span className="text-cyan-400 font-bold">{t("🚫 Irrefletível", "🚫 Unreflectable")}</span>
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
                                    {skill.requirePreviousSkill && (
                                      <p className={`text-[9px] font-bold mt-1 font-mono ${isPrevSkillLocked ? 'text-cyan-500' : 'text-emerald-500'}`}>
                                        {isPrevSkillLocked ? '🔒 Anterior: ' : '🔓 Anterior: '} {skill.requirePreviousSkill}
                                      </p>
                                    )}
                                    {skill.requireHpBelow && skill.requireHpBelow > 0 && (
                                      <p className={`text-[9px] font-bold mt-1 font-mono ${combatant.health > skill.requireHpBelow ? 'text-red-500' : 'text-emerald-500'}`}>
                                        {combatant.health > skill.requireHpBelow ? `🔒 HP ≤ ${skill.requireHpBelow}` : `🔓 HP ≤ ${skill.requireHpBelow}`}
                                      </p>
                                    )}

                                    <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 pt-1.5 border-t border-slate-800/60 mt-2">
                                      <span>Recarga: {skill.permanent ? '♾️ Permanente' : skill.cooldown}</span>
                                      <div className="flex gap-0.5 items-center">
                                        {effectiveCost.map((c, costIdx) => (
                                          <div key={costIdx} className="scale-75">{renderChakraIcon(c as keyof ChakraPool)}</div>
                                        ))}
                                        {effectiveCost.length < skill.cost.length && (
                                          <span className="text-[8px] font-bold text-emerald-400 font-mono ml-0.5" title="Custo de Chakra Reduzido por Regra">⚡</span>
                                        )}
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
                                    combatant,
                                  });
                                  setCenterTab('inspector');
                                }}
                                className={`group relative aspect-square rounded-lg border bg-slate-950 flex flex-col items-center justify-center cursor-pointer opacity-70 hover:opacity-100 transition-all ${
                                  isCooldown ? 'border-slate-950 opacity-30' : 'border-slate-800'
                                }`}
                              >
                                <div className="absolute inset-0 rounded-lg overflow-hidden flex flex-col items-center justify-center">
                                  <img src={skill.icon || null} alt={skill.name} className="w-full h-full object-cover scale-x-[-1]" />

                                  {/* Cooldown Overlay */}
                                  {isCooldown && (
                                    <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center">
                                      <span className="font-mono text-xs font-black text-orange-400">
                                        {skill.currentCooldown}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Hover Details tooltip card */}
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-48 bg-slate-900 border border-slate-700/80 p-2.5 rounded-lg shadow-2xl z-[100] pointer-events-none text-left">
                                  <p className="font-bold text-xs text-white pb-1 border-b border-slate-800">{translateSkillName(skill.name, language)}</p>
                                  <p className="text-[10px] text-slate-400 leading-normal pt-1">{translateGameText(skill.desc, language)}</p>
                                  
                                  {(skill.cannotBeCountered || skill.cannotBeReflected) && (
                                    <div className="flex flex-col gap-0.5 mt-1 text-[8px] font-mono">
                                      {skill.cannotBeCountered && (
                                        <span className="text-red-400 font-bold">{t("🚫 Incontra-atacável", "🚫 Uncounterable")}</span>
                                      )}
                                      {skill.cannotBeReflected && (
                                        <span className="text-cyan-400 font-bold">{t("🚫 Irrefletível", "🚫 Unreflectable")}</span>
                                      )}
                                    </div>
                                  )}
                                  <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 pt-1.5 border-t border-slate-800/60 mt-1">
                                      <span>{t("Recarga", "Cooldown")}: {skill.permanent ? t("♾️ Permanente", "♾️ Permanent") : skill.cooldown}</span>
                                      <div className="flex gap-0.5 items-center">
                                        {effectiveCost.map((c, costIdx) => (
                                        <div key={costIdx} className="scale-75">{renderChakraIcon(c as keyof ChakraPool)}</div>
                                      ))}
                                      {effectiveCost.length < skill.cost.length && (
                                        <span className="text-[8px] font-bold text-emerald-400 font-mono ml-0.5" title="Custo de Chakra Reduzido por Regra">⚡</span>
                                      )}
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

                {/* Standing Skin PNG Artwork (OUTSIDE card on right side) */}
                {(() => {
                  const rawSkin = combatant.character.selectedSkinUrl || combatant.character.skins?.[0]?.image;
                  const portrait = combatant.character.portrait;
                  const isPortrait = !!(rawSkin && portrait && (
                    rawSkin.trim().toLowerCase() === portrait.trim().toLowerCase() ||
                    rawSkin.toLowerCase().endsWith('/icon.jpg') ||
                    rawSkin.toLowerCase().endsWith('/icon.png')
                  ));
                  const skinImg = (rawSkin && !isPortrait) ? rawSkin : null;

                  return (
                    <div className="w-24 sm:w-32 flex-shrink-0 flex items-center justify-center relative select-none pointer-events-none self-stretch">
                      {skinImg ? (
                        <img
                          src={skinImg || null}
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

      {/* GAME OVER BANNER MODAL OVERLAY */}
      <AnimatePresence>
        {gameOver && (
          <GameOverOverlay
            gameOver={gameOver}
            playerCombatants={playerCombatants}
            enemyCombatants={enemyCombatants}
            handleQuit={handleQuit}
            user={user}
            turn={turn}
            matchStats={matchStatsRef.current}
          />
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
        {isPreparing && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900/80 border border-slate-800 rounded-full px-4 py-2 shadow-lg backdrop-blur-sm select-none">
            <img src="/static/img/icon/star.webp" alt="Loading" className="w-4 h-4 animate-spin object-contain" />
            <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">Preparando...</span>
          </div>
        )}

        {isWaitingForOpponent && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-slate-900/95 border border-amber-500/60 rounded-full px-5 py-2.5 shadow-2xl backdrop-blur-md select-none pointer-events-none"
          >
            <span className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
            <span className="text-xs font-mono font-black tracking-wider text-amber-300 uppercase">
              Aguardando Oponente Escolher Habilidades...
            </span>
          </motion.div>
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

      {/* DISCRETE SANDBOX TURN PASS CONFIRMATION MODAL */}
      <AnimatePresence>
        {showSandboxConfirmModal && (
          <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm select-none">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="relative bg-slate-900 border-2 border-amber-600/50 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-slate-100 space-y-4"
            >
              <div className="flex items-start justify-between border-b border-amber-900/40 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl ${
                    activePlanner === 'player'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    <Swords className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-amber-100 uppercase tracking-wide">
                      Confirmar Pulo de Turno
                    </h3>
                    <p className="text-[11px] font-semibold text-slate-400">
                      Modo Sandbox
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    playClickSound();
                    setShowSandboxConfirmModal(false);
                  }}
                  className="text-slate-400 hover:text-amber-200 transition p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed font-medium">
                  Você está prestes a finalizar o turno do{' '}
                  <span className={`font-bold uppercase ${
                    activePlanner === 'player' ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {activePlanner === 'player' ? 'Jogador' : 'Oponente'}
                  </span>.
                </p>

                <div className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2.5 ${
                  cuedActions.length > 0
                    ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300'
                }`}>
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <span>
                    {cuedActions.length > 0
                      ? `${cuedActions.length} habilidade(s) enfileirada(s) será(ão) executada(s).`
                      : 'Nenhuma habilidade selecionada. O turno será passado sem ações.'}
                  </span>
                </div>

                <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer pt-1 hover:text-slate-200 transition">
                  <input
                    type="checkbox"
                    checked={dontShowSandboxConfirmAgain}
                    onChange={(e) => setDontShowSandboxConfirmAgain(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500/50 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>Não perguntar novamente nesta sessão</span>
                </label>
              </div>

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  onClick={() => {
                    playClickSound();
                    turnActionLockedRef.current = false;
                    setShowSandboxConfirmModal(false);
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition active:scale-95 border border-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  disabled={isEndingTurn}
                  onClick={() => {
                    if (isEndingTurnRef.current || isEndingTurn) return;
                    turnActionLockedRef.current = false;
                    setShowSandboxConfirmModal(false);
                    checkAndProceedWithEndTurn();
                  }}
                  className={`flex-1 py-2 px-3 rounded-xl font-extrabold text-xs uppercase tracking-wider text-amber-100 shadow-md transition active:scale-95 cursor-pointer border disabled:opacity-50 disabled:cursor-not-allowed ${
                    activePlanner === 'player'
                      ? 'bg-gradient-to-r from-orange-800 to-amber-800 hover:from-orange-700 hover:to-amber-700 border-orange-600/50'
                      : 'bg-gradient-to-r from-red-800 to-rose-900 hover:from-red-700 hover:to-rose-800 border-red-600/50'
                  }`}
                >
                  Passar Turno
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* NO INTERNET WARNING MODAL */}
      <AnimatePresence>
        {showNoInternetModal && (
          <div className="fixed inset-0 bg-slate-950/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm select-none">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              className="bg-slate-900 border-2 border-red-500/60 rounded-2xl p-6 max-w-md w-full shadow-2xl relative text-center"
            >
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400 text-2xl font-black">
                📡
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-wider mb-2">
                Conexão com a Internet Necessária
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed mb-5">
                Para passar o turno e garantir o cálculo correto da partida sem erros ou manipulação de jogadas, é necessário estar conectado à internet. Por favor, conecte-se à internet e tente novamente.
              </p>
              <button
                onClick={() => {
                  playClickSound();
                  setShowNoInternetModal(false);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-700 to-rose-700 hover:from-red-600 hover:to-rose-600 text-white font-extrabold text-xs uppercase tracking-wider border border-red-500/50 shadow-md transition active:scale-95 cursor-pointer"
              >
                Conectar-se à Internet
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RANDOM CHAKRA SELECTION MODAL */}
      <AnimatePresence>
        {showRandChakraModal && randModalData && (
          <div className="fixed inset-0 bg-slate-950/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm select-none">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="relative bg-slate-900 border-2 border-amber-600/50 rounded-2xl p-5 max-w-md w-full shadow-2xl text-slate-100 space-y-4"
            >
              <div className="flex items-start justify-between border-b border-amber-900/40 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-amber-100 uppercase tracking-wide">
                      Substituir Chakra Aleatório
                    </h3>
                    <p className="text-[11px] font-semibold text-slate-400">
                      Escolha quais chakras usar para o custo genérico (Rand)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setShowRandChakraModal(false);
                  }}
                  className="text-slate-400 hover:text-amber-200 transition p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Queued Skills requiring Rand */}
              <div className="space-y-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                <p className="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Swords className="w-3.5 h-3.5" /> Habilidades com Custo Aleatório:
                </p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {randModalData.queuedSkillsWithRand.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
                      <div className="flex items-center gap-2">
                        {item.icon && (
                          <img src={item.icon || null} alt="" className="w-5 h-5 rounded border border-amber-600/40 object-cover" />
                        )}
                        <span className="font-semibold text-slate-200">
                          <span className="text-amber-400">{item.charName}</span> - {item.skillName}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 flex items-center gap-1">
                        {item.randCount}x {renderChakraIcon('Rand')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Selection Progress Counter */}
              {(() => {
                const currentSelected = (Object.keys(randAllocation) as (keyof ChakraPool)[])
                  .reduce((sum, key) => sum + (randAllocation[key] || 0), 0);
                const isComplete = currentSelected === randModalData.totalRandRequired;

                return (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center bg-amber-950/30 border border-amber-600/30 p-2.5 rounded-xl">
                      <span className="text-xs font-bold text-amber-200">Total de Chakras Aleatórios Necessários:</span>
                      <span className={`text-xs font-black font-mono px-2 py-0.5 rounded ${
                        isComplete ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                      }`}>
                        {currentSelected} / {randModalData.totalRandRequired}
                      </span>
                    </div>

                    {/* Chakra allocation picker */}
                    <div className="grid grid-cols-2 gap-2">
                      {(['Tai', 'Nin', 'Gen', 'Blood'] as (keyof ChakraPool)[]).map(key => {
                        const available = randModalData.availablePoolForRand[key] || 0;
                        const allocated = randAllocation[key] || 0;
                        const canIncrease = allocated < available && currentSelected < randModalData.totalRandRequired;
                        const canDecrease = allocated > 0;

                        let elemLabel = 'Taijutsu';
                        if (key === 'Nin') elemLabel = 'Ninjutsu';
                        if (key === 'Gen') elemLabel = 'Genjutsu';
                        if (key === 'Blood') elemLabel = 'Bloodline';

                        return (
                          <div key={key} className={`p-2.5 rounded-xl border flex flex-col justify-between transition-all ${
                            allocated > 0
                              ? 'bg-amber-950/40 border-amber-500/50 shadow-md shadow-amber-950/20'
                              : 'bg-slate-950/50 border-slate-800'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                {renderChakraIcon(key)}
                                <span className="text-xs font-bold text-slate-200">{elemLabel}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono" title="Disponível após custos fixos">
                                Disp: {available}
                              </span>
                            </div>

                            <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-800/80">
                              <span className="text-xs font-mono font-black text-amber-300">
                                Usar: {allocated}
                              </span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  disabled={!canDecrease}
                                  onClick={() => {
                                    playClickSound();
                                    setRandAllocation(prev => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) - 1) }));
                                  }}
                                  className="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-bold text-xs cursor-pointer border border-slate-700 active:scale-95 transition"
                                >
                                  -
                                </button>
                                <button
                                  type="button"
                                  disabled={!canIncrease}
                                  onClick={() => {
                                    playClickSound();
                                    setRandAllocation(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
                                  }}
                                  className="w-6 h-6 flex items-center justify-center rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-amber-100 font-bold text-xs cursor-pointer border border-amber-600 active:scale-95 transition"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    turnActionLockedRef.current = false;
                    setShowRandChakraModal(false);
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition active:scale-95 border border-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={
                    isEndingTurn ||
                    turnActionLockedRef.current ||
                    (Object.keys(randAllocation) as (keyof ChakraPool)[]).reduce((sum, key) => sum + (randAllocation[key] || 0), 0) !== randModalData.totalRandRequired
                  }
                  onClick={() => {
                    if (isEndingTurnRef.current || isEndingTurn) return;
                    setShowRandChakraModal(false);
                    handleEndTurn(randAllocation);
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl font-extrabold text-xs uppercase tracking-wider text-amber-100 bg-gradient-to-r from-orange-800 to-amber-800 hover:from-orange-700 hover:to-amber-700 border border-orange-600/50 shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirmar e Finalizar
                </button>
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

      {/* CHAKRA DRAIN / STOLEN / REMOVED NOTIFICATION BANNER */}
      <AnimatePresence>
        {chakraToast && (
          <motion.div
            key={chakraToast.id}
            initial={{ opacity: 0, y: -25, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -25, scale: 0.9 }}
            transition={{ type: 'spring', damping: 22, stiffness: 350 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none select-none max-w-md w-11/12"
          >
            <div
              className={`px-4 py-3 rounded-2xl shadow-2xl border backdrop-blur-md flex items-center gap-3 ${
                chakraToast.type === 'stolen'
                  ? 'bg-emerald-950/90 border-emerald-500/80 text-emerald-100 shadow-emerald-950/60'
                  : chakraToast.type === 'removed'
                  ? 'bg-amber-950/90 border-amber-500/80 text-amber-100 shadow-amber-950/60'
                  : chakraToast.type === 'lost'
                  ? 'bg-rose-950/90 border-rose-500/80 text-rose-100 shadow-rose-950/60'
                  : 'bg-slate-900/90 border-slate-700 text-slate-100'
              }`}
            >
              <div className={`p-2 rounded-xl shrink-0 ${
                chakraToast.type === 'stolen' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                chakraToast.type === 'removed' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                chakraToast.type === 'lost' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-slate-800 text-slate-300'
              }`}>
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-extrabold tracking-wide drop-shadow">
                  {chakraToast.message}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PROFILE CARD MODAL (VIEWING SELF OR OPPONENT) */}
      {viewingProfile && (
        <ProfileCardModal
          profile={viewingProfile.profile}
          isSelf={viewingProfile.isSelf}
          onClose={() => setViewingProfile(null)}
          playClickSound={playClickSound}
        />
      )}

      {/* IN-GAME QUESTS MODAL */}
      <AnimatePresence>
        {isQuestModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-900 border-2 border-amber-600/60 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-slate-100"
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 p-4 border-b border-amber-600/40 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
                    <Scroll className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black tracking-wide text-amber-200 uppercase font-mono flex items-center gap-2">
                      {t("Missões da Partida", "Match Quests")}
                    </h3>
                    <p className="text-xs text-amber-400/80 font-sans">
                      {t("Acompanhe seu progresso e metas das missões ativas", "Track your progress and active quest goals")}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    playClickSound();
                    setIsQuestModalOpen(false);
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-5 custom-scrollbar flex-1">
                {/* Active Quest Highlight Banner */}
                {activeQuest && (
                  <div className="bg-gradient-to-r from-amber-900/40 via-yellow-950/30 to-amber-900/40 border-2 border-amber-500/60 rounded-xl p-4 space-y-3 relative overflow-hidden shadow-lg">
                    <div className="flex items-center justify-between border-b border-amber-500/30 pb-2">
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-amber-400 animate-pulse" />
                        <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
                          {t("Missão Ativa Selecionada", "Selected Active Quest")}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                        {activeQuest.category || 'Ativa'}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm sm:text-base font-extrabold text-amber-100">{activeQuest.title}</h4>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{activeQuest.desc}</p>
                    </div>

                    {/* Goals Progress */}
                    <div className="space-y-2.5 pt-1">
                      <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-bold flex items-center justify-between">
                        <span>{t("Metas em Andamento", "Ongoing Goals")}</span>
                      </div>
                      {activeQuest.goals && activeQuest.goals.map((goal: QuestGoal) => {
                        const met = goal.currentValue >= goal.targetValue;
                        const pct = Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100));
                        return (
                          <div key={goal.id} className="bg-slate-950/60 p-2.5 rounded-lg border border-amber-900/50 space-y-1.5">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-200 font-medium">{getGoalDescription(goal)}</span>
                              <span className={`font-mono font-bold text-xs ${met ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {goal.currentValue} / {goal.targetValue}
                              </span>
                            </div>
                            <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  met ? 'bg-emerald-500' : 'bg-gradient-to-r from-orange-500 to-amber-400'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* All Available / In-Progress Quests List */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                    <ListTodo className="w-4 h-4 text-slate-400" />
                    <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                      {t("Missões em Andamento", "Quests in Progress")}
                    </h4>
                  </div>

                  {loadingQuests ? (
                    <div className="py-8 text-center text-xs font-mono text-slate-400 animate-pulse flex flex-col items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-400 animate-spin" />
                      {t("Carregando missões do pergaminho...", "Loading scroll quests...")}
                    </div>
                  ) : allQuests.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 font-sans italic">
                      {t("Nenhuma missão em andamento encontrada.", "No active quests found.")}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {allQuests
                        .filter((quest) => !(user?.completedQuestIds?.includes(quest.id) || quest.completed))
                        .map((quest) => {
                        const allGoalsMet = quest.goals?.every((g) => g.currentValue >= g.targetValue);

                        return (
                          <div
                            key={quest.id}
                            className={`p-3.5 rounded-xl border transition-all ${
                              allGoalsMet
                                ? 'bg-amber-950/30 border-amber-500/60'
                                : 'bg-slate-950/60 border-slate-800'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div>
                                <h5 className="text-xs sm:text-sm font-bold text-slate-100 flex items-center gap-1.5">
                                  {quest.title}
                                </h5>
                                <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{quest.desc}</p>
                              </div>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0">
                                {quest.category || 'Ninja'}
                              </span>
                            </div>

                            {/* Goal Progress Bars */}
                            <div className="space-y-1.5 mt-2">
                              {quest.goals && quest.goals.slice(0, expandedGoals[quest.id] ? quest.goals.length : 3).map((goal: QuestGoal) => {
                                const met = goal.currentValue >= goal.targetValue;
                                const pct = Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100));
                                return (
                                  <div key={goal.id} className="text-[11px] space-y-1">
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-300 text-[11px] font-sans">{getGoalDescription(goal)}</span>
                                      <span className={`font-mono text-[10px] font-bold ${met ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        {goal.currentValue} / {goal.targetValue}
                                      </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800/80">
                                      <div
                                        className={`h-full rounded-full transition-all duration-300 ${
                                          met ? 'bg-emerald-500' : 'bg-amber-500'
                                        }`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                              {quest.goals && quest.goals.length > 3 && (
                                <button
                                  onClick={() => setExpandedGoals(prev => ({ ...prev, [quest.id]: !prev[quest.id] }))}
                                  className="text-[10px] font-mono uppercase tracking-wider text-orange-400 hover:text-orange-300 transition-colors cursor-pointer"
                                >
                                  {expandedGoals[quest.id] ? 'Ver menos' : `Ver todas (${quest.goals.length})`}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
} 
  