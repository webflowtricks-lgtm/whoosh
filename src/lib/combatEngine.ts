import {
  getEffectiveCooldown,
  getEffectiveSkillCost,
  getEffectiveTargetType,
  getSkillCombatTypes,
  type ChakraPool,
  type CombatCharacter,
  type Skill,
} from '../types';
import {
  checkCombatantInvulnerable,
  hasEffectWithName,
  hasImmortalEffect,
  hasNegateFriendlyEffects,
  hasTotalInvulnerability,
  isInvulnerableToFriendlyEffects,
  isSkillBlockedByDelayedUnlock,
  isSkillBlockedByStun,
} from './combatRules';

export interface CombatEngineState {
  turn: number;
  activeSide: 'player' | 'enemy';
  player: CombatCharacter[];
  enemy: CombatCharacter[];
  playerChakra: ChakraPool;
  enemyChakra: ChakraPool;
  winnerSide?: 'player' | 'enemy';
  damageDealt?: { player: number; enemy: number };
}

export interface CombatActionIntent {
  side: 'player' | 'enemy';
  sourceId: string;
  skillIndex: number;
  targetId: string;
}

export type CombatEngineEvent =
  | { type: 'chakra-spent'; side: 'player' | 'enemy'; chakra: ChakraPool }
  | { type: 'damage'; targetId: string; health: number; shield: number; damageType: 'damage' | 'direct_damage' }
  | { type: 'heal'; targetId: string; health: number; healed: number }
  | { type: 'shield'; targetId: string; shield: number; added: number; expiresTurn?: number }
  | { type: 'friendly-effect-blocked'; targetId: string; effect: 'heal' }
  | { type: 'revive'; targetId: string; health: number }
  | { type: 'match-ended'; winnerSide: 'player' | 'enemy' };

export type CombatEngineResult =
  | { status: 'applied'; state: CombatEngineState; events: CombatEngineEvent[] }
  | { status: 'rejected' | 'unsupported'; code: string; state: CombatEngineState; events: [] };

const SUPPORTED_SKILL_FIELDS = new Set([
  'name',
  'desc',
  'icon',
  'cost',
  'cooldown',
  'currentCooldown',
  'targetType',
  'classes',
  'damage',
  'directDamage',
  'heal',
  'shieldVal',
  'shieldMaxVal',
  'shieldDuration',
  'shieldIrremovable',
  'noChakraCost',
  'permanent',
  'doNotApplyIfActive',
  'costRules',
  'costRuleActiveSkill',
  'costRuleReduceRand',
  'costRuleReduceSpecificType',
  'costRuleReduceSpecificAmount',
  'damageRules',
  'stunTurns',
  'stunType',
  'requireEffect',
  'requireTargetEffect',
  'damageReductionVal',
  'damageReductionDuration',
  'damageBuffVal',
  'damageBuffDuration',
  'damageBuffTypes',
  'damageBuffTarget',
  'damageDebuffVal',
  'damageDebuffDuration',
  'damageDebuffTypes',
  'damageDebuffTarget',
  'damageVulnerabilityVal',
  'damageVulnerabilityDuration',
  'damageVulnerabilityTypes',
  'damageVulnerabilityTarget',
  'damageImmunityDuration',
  'damageImmunityTypes',
  'damageImmunityFirstHitOnly',
  'cannotReduceDamageDuration',
  'cannotReduceDamageTarget',
  'cannotBeInvulnerableDuration',
  'cannotBeInvulnerableTarget',
  'cannotReceiveFriendlyDuration',
  'cannotReceiveFriendlyTarget',
  'negateFriendlyDuration',
  'negateFriendlyTarget',
  'ignoreStunDuration',
  'ignoreStunTarget',
  'stunTarget',
  'removeShield',
  'damageTarget',
  'directDamageTarget',
  'invulnerableTarget',
  'ignoreInvulnerable',
  'stackable',
  'stackType',
  'stackTarget',
  'stackDuration',
  'stackGainMode',
  'stackGainAmount',
  'stackCapReset',
  'stackNonCumulative',
  'stackDamageRules',
  'selfStackDamageRules',
  'splashDamage',
  'splashTarget',
  'damageTarget',
  'invulnerableDuration',
  'invulnerableTypes',
  'invulnerableClasses',
  'immortalHpThreshold',
  'immortalDuration',
  'immortalImmediate',
  'afflictionInstant',
  'requirePreviousSkill',
  'requireHpBelow',
  'requireRevived',
  'blockIfRevived',
  'maxUses',
  'damageDuration',
  'damageStacksAsDuration',
  'damageStacksAsDurationType',
  'directDamageDuration',
  'afflictionVal',
  'afflictionDuration',
  'afflictionDelay',
  'afflictionTarget',
  'afflictionSelfVal',
  'afflictionNoStack',
  'afflictionConditionalRules',
  'dotVal',
  'dotDuration',
  'dotInstant',
  'dotTarget',
  'bleedingVal',
  'bleedingDuration',
  'bleedingDelay',
  'bleedingTarget',
  'invisible',
  'invisibleDuration',
  'invisibleTarget',
  'gainChakra',
  'gainChakraDuration',
  'gainChakraTypes',
  'gainChakraTarget',
  'gainChakraIrremovable',
  'drainChakra',
  'drainChakraDuration',
  'drainChakraTarget',
  'removeChakra',
  'removeChakraDuration',
  'removeChakraTarget',
  'stealChakra',
  'stealChakraDuration',
  'stealChakraTarget',
  'stealLifeVal',
  'stealLifeDuration',
  'stealLifeTarget',
  'counterAttack',
  'counterAttackDuration',
  'counterAttackType',
  'counterAttackMode',
  'counterAttackClasses',
  'counterAttackUntilTriggered',
  'counterAttackTarget',
  'counterAttackIrremovable',
  'counterAttackCannotBeCountered',
  'counterAttackCannotBeReflected',
  'reflect',
  'reflectDuration',
  'reflectMode',
  'reflectTarget',
  'reflectType',
  'reflectCharges',
  'blocksOffensiveSkills',
  'cannotBeCountered',
  'cannotBeReflected',
  'removedOnCasterDeath',
  'removedOnTargetSkillUse',
  'blocksHealsWhileActive',
  'cancelSelfOnReuse',
  'cleanseDebuffs',
  'cleanseDebuffTypes',
  'cleanseDebuffTarget',
  'cleanseBuffs',
  'cleanseBuffTypes',
  'cleanseBuffTarget',
  'damageReductionPierceVal',
  'damageReductionPierceDuration',
  'damageReductionPierceTarget',
  'shieldRegenTurns',
  'shieldTarget',
  'healTarget',
]);

const SUPPORTED_ACTIVE_EFFECT_TYPES = new Set([
  'stun',
  'ignore_stun',
  'invulnerable',
  'damage_immunity',
  'damage_reduction',
  'damage_reduction_pierce',
  'damage_to_shield',
  'cannot_reduce_damage',
  'cannot_be_invulnerable',
  'cannot_receive_friendly',
  'negate_friendly_effects',
  'immortal',
  'revive_on_death',
  'damage',
  'direct_damage',
  'dot',
  'bleeding',
  'affliction',
  'damage_buff',
  'damage_debuff',
  'damage_vulnerability',
  'blocks_offensive_skills',
  'damage',
  'direct_damage',
  'dot',
  'bleeding',
  'affliction',
  'gain_chakra',
  'drain_chakra',
  'remove_chakra',
  'steal_chakra',
  'life_steal',
  'counter',
  'counter_attack',
  'reflect',
  'invisible',
  'chakra_cost_increase',
  'chakra_cost_reduce',
  'paralyze_cooldown',
  'heal_over_time',
  'retaliate_damage',
  'redirect_offensive',
]);

const SUPPORTED_TARGET_FIELDS = new Set([
  'stackTarget',
  'directDamageTarget',
  'healTarget',
  'shieldTarget',
  'damageBuffTarget',
  'damageDebuffTarget',
  'damageVulnerabilityTarget',
  'damageImmunityTarget',
  'cannotReduceDamageTarget',
  'cannotBeInvulnerableTarget',
  'cannotReceiveFriendlyTarget',
  'negateFriendlyTarget',
  'ignoreStunTarget',
  'invulnerableTarget',
  'stunTarget',
]);

const SUPPORTED_TARGET_OVERRIDES = new Set([
  'Target', 'Self', 'Both', 'Ally', 'AllAllies', 'AllEnemies', 'AllLiving',
  'AllEnemiesExceptTarget', 'AllAlliesExceptTarget', 'SelfAndAllEnemies',
  'SelfAndAlly', 'AnyLiving', 'AllNonInvulnerable', 'AllInvulnerable',
  'OneInvulnerable', 'OneInvulnerableAlly', 'RandomEnemy', 'RandomAlly',
]);

function cloneCombatant(combatant: CombatCharacter): CombatCharacter {
  return {
    ...combatant,
    character: {
      ...combatant.character,
      skills: combatant.character.skills.map(skill => ({ ...skill })),
    },
    activeEffects: combatant.activeEffects.map(effect => ({ ...effect })),
    skillUseCounts: combatant.skillUseCounts ? { ...combatant.skillUseCounts } : undefined,
  };
}

function cloneState(state: CombatEngineState): CombatEngineState {
  return {
    ...state,
    player: state.player.map(cloneCombatant),
    enemy: state.enemy.map(cloneCombatant),
    playerChakra: { ...state.playerChakra },
    enemyChakra: { ...state.enemyChakra },
  };
}

function result(
  status: 'rejected' | 'unsupported',
  code: string,
  state: CombatEngineState,
): CombatEngineResult {
  return { status, code, state, events: [] };
}

function hasUnsupportedSkillMechanics(skill: Skill): boolean {
  return Object.entries(skill).some(([field, value]) => {
    if (field === 'damageRules') {
      return Array.isArray(value) && value.some(rule =>
        !['damage', 'direct_damage', 'piercing', undefined].includes(rule.damageType),
      );
    }
    if (value == null || value === false || value === 0 || value === '') {
      return false;
    }
    if (field.endsWith('Target') && typeof value === 'string') {
      if (field === 'stackTarget') return !['Self', 'Target', 'Both'].includes(value);
      if (field === 'damageTarget') return !['Target', 'AllEnemies'].includes(value);
      return !SUPPORTED_TARGET_FIELDS.has(field) || !SUPPORTED_TARGET_OVERRIDES.has(value);
    }
    if (SUPPORTED_SKILL_FIELDS.has(field)) return false;
    if (field === 'stackTarget' && ['Self', 'Target', 'Both'].includes(String(value))) {
      return false;
    }
    if (field === 'damageTarget' && ['Target', 'Self', 'AllEnemies', 'AllAllies'].includes(String(value))) {
      return false;
    }
    if (field === 'stackDamageRules' || field === 'selfStackDamageRules') {
      if (!Array.isArray(value)) return true;
      return value.some(rule =>
        !['damage', 'direct_damage', undefined].includes(rule.damageType),
      );
    }
    if (field === 'afflictionInstant' && !(skill.afflictionVal && skill.afflictionVal > 0)) {
      return false;
    }
    return !Array.isArray(value) || value.length > 0;
  });
}

function hasUnsupportedActiveEffects(combatants: CombatCharacter[]): boolean {
  return combatants.some(combatant =>
    combatant.activeEffects.some(effect =>
      !SUPPORTED_ACTIVE_EFFECT_TYPES.has(effect.type) &&
      !(effect.type === 'custom' && effect.stackable === true && !!effect.stackType) &&
      !(effect.type === 'custom' &&
        effect.sourceSkillName &&
        combatant.character.skills.some(skill =>
          skill.name === effect.sourceSkillName && skill.permanent === true,
        )),
    ),
  );
}

function isImmuneToDamage(target: CombatCharacter, incomingTypes: string[]): boolean {
  if (hasNegateFriendlyEffects(target)) return false;
  return target.activeEffects.some(effect => {
    if (effect.type !== 'damage_immunity') return false;
    return !effect.immunityTypes?.length || incomingTypes.some(type => effect.immunityTypes?.includes(type));
  });
}

function consumeFirstHitImmunity(target: CombatCharacter, incomingTypes: string[]): void {
  const index = target.activeEffects.findIndex(effect => {
    if (effect.type !== 'damage_immunity' || !effect.firstHitOnly) return false;
    return !effect.immunityTypes?.length || incomingTypes.some(type => effect.immunityTypes?.includes(type));
  });
  if (index !== -1) target.activeEffects.splice(index, 1);
}

function activateThresholdImmortality(target: CombatCharacter, turn: number): void {
  if (target.isDead || hasImmortalEffect(target)) return;
  const skill = target.character.skills.find(candidate =>
    (candidate.immortalHpThreshold || 0) > 0 &&
    target.health <= candidate.immortalHpThreshold! &&
    target.activeEffects.some(effect =>
      effect.name === candidate.name || effect.sourceSkillName === candidate.name,
    ),
  );
  if (!skill) return;
  target.activeEffects.push({
    name: `${skill.name} (Imortal)`,
    type: 'immortal',
    duration: skill.immortalDuration || 3,
    icon: skill.icon,
    casterId: target.id,
    casterSide: target.id.startsWith('player-') ? 'player' : 'enemy',
    castTurn: turn,
  });
}

function isFriendlyEffectBlocked(target: CombatCharacter, skill: Skill): boolean {
  if (
    target.activeEffects.some(activeEffect => activeEffect.type === 'cannot_receive_friendly') ||
    hasNegateFriendlyEffects(target) ||
    isInvulnerableToFriendlyEffects(target, skill)
  ) {
    return true;
  }
  return target.activeEffects.some(activeEffect => activeEffect.blocksHeals);
}

function applyFriendlyEffects(
  source: CombatCharacter,
  target: CombatCharacter,
  skill: Skill,
  turn: number,
  applyHeal = true,
  applyShield = true,
): CombatEngineEvent[] {
  const events: CombatEngineEvent[] = [];
  if (applyHeal && (skill.heal || 0) > 0) {
    if (isFriendlyEffectBlocked(target, skill)) {
      events.push({ type: 'friendly-effect-blocked', targetId: target.id, effect: 'heal' });
    } else {
      const previousHealth = target.health;
      target.health = Math.min(100, target.health + (skill.heal || 0));
      events.push({
        type: 'heal',
        targetId: target.id,
        health: target.health,
        healed: target.health - previousHealth,
      });
    }
  }

  if (applyShield && (skill.shieldVal || 0) > 0) {
    const previousShield = target.shield;
    const shieldCap = skill.shieldMaxVal && skill.shieldMaxVal > 0
      ? skill.shieldMaxVal
      : Number.POSITIVE_INFINITY;
    target.shield = Math.min(previousShield + (skill.shieldVal || 0), shieldCap);
    if (skill.shieldDuration && skill.shieldDuration > 0 && skill.shieldDuration < 99999) {
      target.shieldExpiresTurn = Math.max(target.shieldExpiresTurn || 0, turn + skill.shieldDuration);
    }
    events.push({
      type: 'shield',
      targetId: target.id,
      shield: target.shield,
      added: target.shield - previousShield,
      expiresTurn: target.shieldExpiresTurn,
    });
  }
  return events;
}

function effectTargets(
  selector: string | undefined,
  source: CombatCharacter,
  selected: CombatCharacter,
  allies: CombatCharacter[],
  enemies: CombatCharacter[],
  everyone: CombatCharacter[],
  skill: Skill,
): CombatCharacter[] {
  switch (selector || 'Target') {
    case 'Self': return [source];
    case 'Both': return source.id === selected.id ? [source] : [source, selected];
    case 'SelfAndAlly': return source.id === selected.id
      ? [source, ...allies.filter(combatant => combatant.id !== source.id).slice(0, 1)]
      : [source, selected];
    case 'Ally': return allies.some(combatant => combatant.id === selected.id)
      ? [selected]
      : [allies.find(combatant => combatant.id !== source.id) || source];
    case 'AllAllies': return allies;
    case 'AllEnemies': return enemies;
    case 'AllLiving': return everyone;
    case 'AllNonInvulnerable': return everyone.filter(combatant =>
      !checkCombatantInvulnerable(combatant, skill, source),
    );
    case 'AllInvulnerable': return everyone.filter(combatant =>
      checkCombatantInvulnerable(combatant, skill, source),
    );
    case 'OneInvulnerable': {
      const target = everyone.find(combatant => checkCombatantInvulnerable(combatant, skill, source));
      return target ? [target] : [];
    }
    case 'OneInvulnerableAlly': {
      const target = allies.find(combatant => checkCombatantInvulnerable(combatant, skill, source));
      return target ? [target] : [];
    }
    case 'RandomEnemy':
      return enemies.includes(selected) && !selected.isDead &&
        !checkCombatantInvulnerable(selected, skill, source) ? [selected] : [];
    case 'RandomAlly':
      return allies.includes(selected) && !selected.isDead ? [selected] : [];
    case 'AllEnemiesExceptTarget': return enemies.filter(combatant => combatant.id !== selected.id);
    case 'AllAlliesExceptTarget': return allies.filter(combatant => combatant.id !== selected.id);
    case 'SelfAndAllEnemies': return [...new Map([source, ...enemies].map(item => [item.id, item])).values()];
    case 'AnyLiving': return selected.isDead ? [] : [selected];
    case 'Target': return [selected];
    default: return [];
  }
}

function applyConfiguredEffects(
  source: CombatCharacter,
  selected: CombatCharacter,
  skill: Skill,
  turn: number,
  side: 'player' | 'enemy',
  allies: CombatCharacter[],
  enemies: CombatCharacter[],
  everyone: CombatCharacter[],
): void {
  const addEffect = (
    targetSelector: Skill['damageTarget'],
    type: CombatCharacter['activeEffects'][number]['type'],
    duration: number,
    value?: number,
    extra: Partial<CombatCharacter['activeEffects'][number]> = {},
  ) => {
    if (duration <= 0) return;
    for (const target of effectTargets(targetSelector, source, selected, allies, enemies, everyone, skill)) {
      if (target.isDead) continue;
      if (type === 'stun' && checkCombatantInvulnerable(target, 'stun', source)) continue;
      const current = target.activeEffects.find(effect =>
        effect.type === type && effect.sourceSkillName === skill.name,
      );
      if (current) {
        current.duration = Math.max(current.duration, duration);
        current.value = value ?? current.value;
        Object.assign(current, extra);
      } else {
        target.activeEffects.push({
          name: skill.name,
          type,
          duration,
          value,
          icon: skill.icon,
          casterId: source.id,
          casterSide: side,
          sourceSkillName: skill.name,
          castTurn: turn,
          ...extra,
        });
      }
    }
  };

  addEffect(skill.damageBuffTarget || 'Self', 'damage_buff',
    skill.damageBuffDuration || 0, skill.damageBuffVal,
    { buffTypes: skill.damageBuffTypes });
  addEffect(skill.damageDebuffTarget || 'Target', 'damage_debuff',
    skill.damageDebuffDuration || 0, skill.damageDebuffVal,
    { debuffTypes: skill.damageDebuffTypes });
  addEffect(skill.damageVulnerabilityTarget || 'Target', 'damage_vulnerability',
    skill.damageVulnerabilityDuration || 0, skill.damageVulnerabilityVal,
    { vulnerabilityTypes: skill.damageVulnerabilityTypes, irremovable: skill.damageVulnerabilityIrremovable });
  addEffect(skill.damageImmunityTarget || 'Self', 'damage_immunity',
    skill.damageImmunityDuration || 0, undefined,
    { immunityTypes: skill.damageImmunityTypes, firstHitOnly: skill.damageImmunityFirstHitOnly });
  addEffect(skill.cannotReduceDamageTarget || 'Target', 'cannot_reduce_damage',
    skill.cannotReduceDamageDuration || 0);
  addEffect(skill.cannotBeInvulnerableTarget || 'Target', 'cannot_be_invulnerable',
    skill.cannotBeInvulnerableDuration || 0);
  addEffect(skill.cannotReceiveFriendlyTarget || 'Target', 'cannot_receive_friendly',
    skill.cannotReceiveFriendlyDuration || 0);
  addEffect(skill.negateFriendlyTarget || 'Target', 'negate_friendly_effects',
    skill.negateFriendlyDuration || 0, undefined,
    { irremovable: skill.negateFriendlyIrremovable });
  addEffect(skill.ignoreStunTarget || 'Self', 'ignore_stun',
    skill.ignoreStunDuration || 0);
  addEffect(skill.invulnerableTarget || 'Target', 'invulnerable',
    skill.invulnerableDuration || 0, undefined,
    { invulnerableTypes: skill.invulnerableTypes, invulnerableClasses: skill.invulnerableClasses });
  addEffect(skill.damageReductionPierceTarget || 'Target', 'damage_reduction_pierce',
    skill.damageReductionPierceDuration || 0, skill.damageReductionPierceVal);
  addEffect(skill.stunTarget || 'Target', 'stun', skill.stunTurns || 0, undefined,
    { stunType: skill.stunType || [] });
  addEffect(skill.invisibleTarget || 'Self', 'invisible',
    skill.invisibleDuration || 0, undefined);
  if (skill.invisible && !(skill.invisibleDuration || 0)) {
    addEffect(skill.invisibleTarget || 'Self', 'invisible', 1);
  }
  addEffect(skill.damageTarget || 'Target', 'damage', Math.max(0, (skill.damageDuration || 1) - 1),
    skill.damage, { damageType: 'damage' });
  addEffect(skill.directDamageTarget || skill.damageTarget || 'Target', 'direct_damage',
    Math.max(0, (skill.directDamageDuration || 1) - 1), skill.directDamage,
    { damageType: 'direct_damage' });
  addEffect(skill.dotTarget || 'Target', 'dot', skill.dotDuration || 0, skill.dotVal,
    { damageType: 'dot', irremovable: skill.dotIrremovable });
  addEffect(skill.bleedingTarget || 'Target', 'bleeding', skill.bleedingDuration || 0,
    skill.bleedingVal, { damageType: 'bleeding', delayTurns: skill.bleedingDelay });
  addEffect(skill.afflictionTarget || 'Target', 'affliction', skill.afflictionDuration || 0,
    skill.afflictionVal, { damageType: 'affliction', delayTurns: skill.afflictionDelay });
  addEffect(skill.damageToShieldTarget || 'Self', 'damage_to_shield',
    skill.damageToShieldDuration || 0, undefined, {
      shieldDurationTurns: skill.damageToShieldShieldTurns,
      shieldDamageTypes: skill.damageToShieldTypes,
      shieldFirstHitOnly: skill.damageToShieldFirstHitOnly,
      irremovable: skill.damageToShieldIrremovable,
    });
  addEffect(skill.totalInvulnerableTarget || 'Target', 'invulnerable',
    skill.totalInvulnerableDuration || 0, undefined, {
      invulnerableTotal: true,
      invulnerableTypes: skill.totalInvulnerableTypes,
      invulnerableClasses: skill.totalInvulnerableClasses,
      irremovable: skill.totalInvulnerableIrremovable,
    });
  addEffect(skill.counterAttackTarget || 'Self', 'counter_attack',
    skill.counterAttackUntilTriggered ? 99999 : skill.counterAttackDuration || 0, undefined, {
      counterAttackType: skill.counterAttackType || 'defender',
      counterAttackMode: skill.counterAttackMode || 'first',
      counterAttackClasses: skill.counterAttackClasses,
      counterAttackUntilTriggered: skill.counterAttackUntilTriggered,
      irremovable: skill.counterAttackIrremovable || skill.counterAttackUntilTriggered,
      cannotBeCountered: skill.counterAttackCannotBeCountered,
      cannotBeReflected: skill.counterAttackCannotBeReflected,
    });
  if (skill.counterAttack && !(skill.counterAttackDuration || 0) && !skill.counterAttackUntilTriggered) {
    addEffect(skill.counterAttackTarget || 'Self', 'counter_attack', 1, undefined, {
      counterAttackType: skill.counterAttackType || 'defender',
      counterAttackMode: skill.counterAttackMode || 'first',
      counterAttackClasses: skill.counterAttackClasses,
    });
  }
  addEffect(skill.reflectTarget || 'Self', 'reflect', skill.reflectDuration || 0, undefined, {
    reflectMode: skill.reflectMode,
    reflectType: skill.reflectType,
    reflectCharges: skill.reflectCharges,
    irremovable: skill.reflectIrremovable,
    cannotBeCountered: skill.reflectCannotBeCountered,
    cannotBeReflected: skill.reflectCannotBeReflected,
  });
  if (skill.reflect && !(skill.reflectDuration || 0)) {
    addEffect(skill.reflectTarget || 'Self', 'reflect', 1, undefined, {
      reflectMode: skill.reflectMode,
      reflectType: skill.reflectType,
      reflectCharges: skill.reflectCharges,
    });
  }
  addEffect(skill.redirectOffensiveTarget || 'Self', 'redirect_offensive',
    skill.redirectOffensiveDuration || 0, undefined, {
      redirectOffensiveToCaster: skill.redirectOffensiveToCaster,
      redirectCasterId: source.id,
      redirectOffensiveScope: skill.redirectOffensiveScope,
      irremovable: skill.redirectOffensiveIrremovable,
    });
  addEffect(skill.targetType === 'Enemy' ? 'Target' : 'Self',
    'blocks_offensive_skills', skill.blocksOffensiveSkills ? 1 : 0);
  if (skill.removeShield) {
    selected.shield = 0;
    selected.shieldExpiresTurn = undefined;
  }
}

function addChakra(
  pool: ChakraPool,
  amount: number,
  types?: string[],
  seedText = '',
): void {
  const allowed = (types || []).filter((type): type is keyof ChakraPool =>
    type === 'Tai' || type === 'Nin' || type === 'Gen' || type === 'Blood',
  );
  const candidates: (keyof ChakraPool)[] = allowed.length
    ? allowed
    : ['Tai', 'Nin', 'Gen', 'Blood'];
  let seed = [...seedText].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0);
  for (let index = 0; index < amount; index += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const chakraType = candidates[seed % candidates.length];
    pool[chakraType] += 1;
  }
}

function changeChakra(
  state: CombatEngineState,
  source: CombatCharacter,
  target: CombatCharacter,
  amount: number,
  mode: 'remove' | 'drain' | 'steal',
): number {
  const sourcePool = source.id.startsWith('player-') ? state.playerChakra : state.enemyChakra;
  const targetPool = target.id.startsWith('player-') ? state.playerChakra : state.enemyChakra;
  let remaining = Math.max(0, amount);
  let changed = 0;
  const types: (keyof ChakraPool)[] = ['Tai', 'Nin', 'Gen', 'Blood'];
  while (remaining > 0) {
    const available = types.filter(type => targetPool[type] > 0);
    if (!available.length) break;
    const type = available[0];
    targetPool[type] -= 1;
    if (mode === 'steal' || mode === 'drain') sourcePool[type] += 1;
    changed += 1;
    remaining -= 1;
  }
  return changed;
}

function applyDamage(
  target: CombatCharacter,
  skill: Skill,
  turn: number,
  source?: CombatCharacter,
): CombatEngineEvent[] {
  const direct = (skill.directDamage || 0) > 0;
  const damageType = direct ? 'direct_damage' : 'damage';
  const incomingTypes = direct
    ? ['direct_damage', 'piercing']
    : ['damage', ...getSkillCombatTypes(skill)];
  let damage = direct ? skill.directDamage || 0 : skill.damage || 0;
  const incomingClasses = getSkillCombatTypes(skill);
  if (source) {
    damage += source.activeEffects
      .filter(effect => effect.type === 'damage_buff' &&
        (!effect.buffTypes?.length || incomingClasses.some(type => effect.buffTypes?.includes(type))))
      .reduce((sum, effect) => sum + (effect.value || 0), 0);
  }
  const incomingDamageTypes = direct
    ? ['direct_damage', 'piercing']
    : ['skill', 'damage', ...incomingClasses];
  damage -= target.activeEffects
    .filter(effect => effect.type === 'damage_debuff' &&
      (!effect.debuffTypes?.length || incomingDamageTypes.some(type => effect.debuffTypes?.includes(type))))
    .reduce((sum, effect) => sum + (effect.value || 0), 0);
  damage += target.activeEffects
    .filter(effect => effect.type === 'damage_vulnerability' &&
      (!effect.vulnerabilityTypes?.length || incomingClasses.some(type => effect.vulnerabilityTypes?.includes(type))))
    .reduce((sum, effect) => sum + (effect.value || 0), 0);
  damage = Math.max(0, damage);

  if (isImmuneToDamage(target, incomingTypes)) {
    consumeFirstHitImmunity(target, incomingTypes);
    damage = 0;
  } else {
    const cannotReduce = target.activeEffects.some(effect =>
      effect.type === 'cannot_reduce_damage',
    ) || hasNegateFriendlyEffects(target);
    if (!cannotReduce) {
      const reductionTypes = direct
        ? ['damage_reduction_pierce']
        : ['damage_reduction', 'damage_reduction_pierce'];
      const afflictionSkill = getSkillCombatTypes(skill).includes('affliction');
      const reductions = target.activeEffects
        .filter(effect =>
          reductionTypes.includes(effect.type) &&
          !(afflictionSkill && effect.excludeAffliction),
        )
        .reduce((sum, effect) => sum + (effect.value || 0), 0);
      damage = Math.max(0, damage - reductions);
    }

    const conversion = target.activeEffects.find(effect => effect.type === 'damage_to_shield');
    const conversionTypes = conversion?.shieldDamageTypes;
    const conversionMatches = conversion && (
      !conversionTypes?.length || incomingTypes.some(type => conversionTypes.includes(type))
    );
    const firstHitBlocked = !!conversion &&
      !!conversion.shieldFirstHitOnly &&
      !!conversion.conversionConsumed;

    if (damage > 0 && conversionMatches && !firstHitBlocked && !hasNegateFriendlyEffects(target)) {
      target.shield += damage;
      const shieldDuration = conversion?.shieldDurationTurns;
      target.shieldExpiresTurn = shieldDuration && shieldDuration !== 99999
        ? Math.max(target.shieldExpiresTurn || 0, turn + shieldDuration)
        : 99999;
      if (conversion?.shieldFirstHitOnly) {
        conversion.conversionConsumed = true;
      }
      damage = 0;
    } else if (target.shield > 0 && damage > 0 && !hasNegateFriendlyEffects(target)) {
      const absorbed = Math.min(target.shield, damage);
      target.shield -= absorbed;
      damage -= absorbed;
    }
  }

  if (damage > 0) {
    target.health = hasImmortalEffect(target)
      ? Math.max(1, target.health - damage)
      : Math.max(0, target.health - damage);
    activateThresholdImmortality(target, turn);
    if (hasImmortalEffect(target)) target.health = Math.max(1, target.health);
    if (target.health === 0) target.isDead = true;
  }

  if (target.isDead && !hasNegateFriendlyEffects(target)) {
    const revive = target.activeEffects.find(effect => effect.type === 'revive_on_death');
    if (revive) {
      const reviveHealth = Math.min(Math.max(1, revive.value || 0), target.maxHealth);
      const stacks = Math.max(0, (revive.stacks || 1) - 1);
      target.health = reviveHealth;
      target.isDead = false;
      target.hasRevived = true;
      if (stacks > 0) revive.stacks = stacks;
      else target.activeEffects = target.activeEffects.filter(effect => effect !== revive);
      return [
        { type: 'damage', targetId: target.id, health: 0, shield: target.shield, damageType },
        { type: 'revive', targetId: target.id, health: reviveHealth },
      ];
    }
    target.activeEffects = [];
  }

  return [{
    type: 'damage',
    targetId: target.id,
    health: target.health,
    shield: target.shield,
    damageType,
  }];
}

function applyConditionalDamageRules(
  skill: Skill,
  allCombatants: CombatCharacter[],
): Pick<Skill, 'damage' | 'directDamage'> {
  let damage = skill.damage || 0;
  let directDamage = skill.directDamage || 0;
  let replaceDamage = false;
  let replaceDirectDamage = false;
  for (const rule of skill.damageRules || []) {
    if (!rule.activeSkillName || rule.damageBoost <= 0 ||
      !allCombatants.some(combatant => hasEffectWithName(combatant, rule.activeSkillName))) {
      continue;
    }
    const direct = rule.damageType === 'direct_damage' || rule.damageType === 'piercing';
    if (direct) {
      directDamage += rule.damageBoost;
      replaceDirectDamage ||= rule.ignoreBaseDamage !== false;
    } else {
      damage += rule.damageBoost;
      replaceDamage ||= rule.ignoreBaseDamage !== false;
    }
  }
  if (replaceDamage) damage = (skill.damageRules || []).some(rule =>
    rule.activeSkillName && rule.damageBoost > 0 &&
    rule.damageType !== 'direct_damage' && rule.damageType !== 'piercing' &&
    allCombatants.some(combatant => hasEffectWithName(combatant, rule.activeSkillName)),
  ) ? damage - (skill.damage || 0) : damage;
  if (replaceDirectDamage) directDamage = directDamage - (skill.directDamage || 0);
  return { damage, directDamage };
}

function stackEffectName(skill: Skill): string {
  return skill.stackType || skill.name;
}

function findStack(combatant: CombatCharacter, stackType: string): CombatCharacter['activeEffects'][number] | undefined {
  return combatant.activeEffects.find(effect =>
    effect.type === 'custom' && effect.stackable === true && effect.stackType === stackType,
  );
}

function stackCount(combatant: CombatCharacter, stackType: string): number {
  return findStack(combatant, stackType)?.stacks || 0;
}

function applyStack(
  target: CombatCharacter,
  source: CombatCharacter,
  skill: Skill,
  side: 'player' | 'enemy',
  turn: number,
): void {
  const stackType = stackEffectName(skill);
  const duration = skill.stackDuration ?? 999;
  const existing = findStack(target, stackType);
  if (existing) {
    existing.stacks = skill.stackNonCumulative ? 1 : Math.max(1, existing.stacks || 1) + 1;
    existing.duration = Math.max(existing.duration, duration);
    existing.casterId = source.id;
    existing.casterSide = side;
    existing.castTurn = turn;
    existing.sourceSkillName = skill.name;
    return;
  }
  target.activeEffects.push({
    name: `${stackType} (Stack)`,
    type: 'custom',
    value: 0,
    stacks: 1,
    duration,
    icon: skill.icon,
    stackable: true,
    stackType,
    stackNonCumulative: skill.stackNonCumulative,
    casterId: source.id,
    casterSide: side,
    castTurn: turn,
    sourceSkillName: skill.name,
  });
}

function calculateStackDamage(
  skill: Skill,
  source: CombatCharacter,
  target: CombatCharacter,
): { damage: number; directDamage: number; consume: Array<{ owner: CombatCharacter; effect: CombatCharacter['activeEffects'][number]; stacks: number }> } {
  let damage = 0;
  let directDamage = 0;
  const consume: Array<{ owner: CombatCharacter; effect: CombatCharacter['activeEffects'][number]; stacks: number }> = [];
  for (const rule of skill.selfStackDamageRules || []) {
    const stacks = stackCount(source, rule.stackType);
    if (stacks <= 0) continue;
    const amount = stacks * rule.damagePerStack;
    if (rule.damageType === 'direct_damage') directDamage += amount;
    else damage += amount;
  }
  for (const rule of skill.stackDamageRules || []) {
    const sourceScope = rule.stackSource || 'target';
    const combatants = sourceScope === 'self' ? [source]
      : sourceScope === 'all' ? [source, target]
        : sourceScope === 'enemies' ? [target]
          : sourceScope === 'allies' ? [source]
            : [target];
    const matching = combatants.flatMap(owner => {
      const effect = findStack(owner, rule.stackType);
      return effect ? [{ owner, effect }] : [];
    });
    const stacks = matching.reduce((sum, item) => sum + (item.effect.stacks || 0), 0);
    if (stacks <= 0) continue;
    const amount = stacks * rule.damagePerStack;
    if (rule.damageType === 'direct_damage') directDamage += amount;
    else damage += amount;
    if (rule.removeStacks && sourceScope === 'target') {
      const stackEffect = findStack(target, rule.stackType);
      if (stackEffect) consume.push({ owner: target, effect: stackEffect, stacks: rule.removeStacks });
    }
  }
  return { damage, directDamage, consume };
}

function spendSkillCost(pool: ChakraPool, costs: ReturnType<typeof getEffectiveSkillCost>): ChakraPool | null {
  const next = { ...pool };
  let randomCost = 0;
  for (const cost of costs) {
    if (cost === 'Rand') {
      randomCost += 1;
      continue;
    }
    if (next[cost] <= 0) return null;
    next[cost] -= 1;
  }
  const remaining = next.Tai + next.Nin + next.Gen + next.Blood;
  if (remaining < randomCost) return null;
  for (let index = 0; index < randomCost; index += 1) {
    const highest = (Object.keys(next) as (keyof ChakraPool)[])
      .sort((left, right) => next[right] - next[left])[0];
    if (next[highest] <= 0) return null;
    next[highest] -= 1;
  }
  return next;
}

export function resolveCombatIntent(
  state: CombatEngineState,
  intent: CombatActionIntent,
): CombatEngineResult {
  if (state.winnerSide) return result('rejected', 'match-finished', state);
  if (intent.side !== state.activeSide) return result('rejected', 'wrong-turn', state);

  const sourceTeam = intent.side === 'player' ? state.player : state.enemy;
  const opposingTeam = intent.side === 'player' ? state.enemy : state.player;
  const source = sourceTeam.find(combatant => combatant.id === intent.sourceId);
  if (!source || source.isDead || !Number.isSafeInteger(intent.skillIndex) || intent.skillIndex < 0) {
    return result('rejected', 'invalid-source-or-skill', state);
  }
  const skill = source.character.skills[intent.skillIndex];
  if (!skill || skill.isPassive) return result('rejected', 'invalid-skill', state);
  if (hasUnsupportedSkillMechanics(skill)) return result('unsupported', 'skill-mechanics-not-ported', state);
  if (skill.requireEffect && !hasEffectWithName(source, skill.requireEffect)) {
    return result('rejected', 'required-effect-missing', state);
  }
  if (skill.doNotApplyIfActive && source.activeEffects.some(effect =>
    effect.name === skill.name || effect.sourceSkillName === skill.name,
  )) {
    return result('rejected', 'effect-already-active', state);
  }
  if ((skill.damage || 0) > 0 && (skill.directDamage || 0) > 0) {
    return result('unsupported', 'multiple-damage-channels-not-ported', state);
  }

  const allCombatants = [...state.player, ...state.enemy];
  if (hasUnsupportedActiveEffects(allCombatants)) {
    return result('unsupported', 'active-effects-not-ported', state);
  }
  if (hasTotalInvulnerability(source) ||
    isSkillBlockedByStun(skill, source.activeEffects) ||
    isSkillBlockedByDelayedUnlock(skill, source.activeEffects)) {
    return result('rejected', 'source-cannot-act', state);
  }

  const targetType = getEffectiveTargetType(skill, source, allCombatants, state.turn);
  const effectiveDamage = applyConditionalDamageRules(skill, allCombatants);
  const hasStackDamage = !!skill.stackDamageRules?.length || !!skill.selfStackDamageRules?.length;
  const hasDamage = effectiveDamage.damage > 0 || effectiveDamage.directDamage > 0 || hasStackDamage;
  const isAttack = hasDamage;
  const isFriendlyAction = (skill.heal || 0) > 0 || (skill.shieldVal || 0) > 0;
  const hasConfiguredEffects = (skill.damageBuffVal || 0) > 0 ||
    (skill.damageDebuffVal || 0) > 0 ||
    (skill.damageVulnerabilityVal || 0) > 0 ||
    (skill.damageImmunityDuration || 0) > 0 ||
    (skill.damageReductionVal || 0) > 0 ||
    (skill.invulnerableDuration || 0) > 0 ||
    (skill.stunTurns || 0) > 0 ||
    (skill.cannotReduceDamageDuration || 0) > 0 ||
    (skill.cannotBeInvulnerableDuration || 0) > 0 ||
    (skill.cannotReceiveFriendlyDuration || 0) > 0 ||
    (skill.negateFriendlyDuration || 0) > 0 ||
    (skill.ignoreStunDuration || 0) > 0 ||
    skill.removeShield === true;
  const isControlAction = (targetType === 'Enemy' || targetType === 'AllEnemies') &&
    ((skill.stunTurns || 0) > 0 || hasConfiguredEffects);
  const appliesStack = skill.stackable === true;
  const hasSelfEffect = targetType === 'Self' && (
    skill.permanent === true ||
    appliesStack ||
    (skill.damageReductionVal || 0) > 0 ||
    (skill.invulnerableDuration || 0) > 0 ||
    (skill.immortalDuration || 0) > 0 ||
    (skill.immortalHpThreshold || 0) > 0 ||
    ((skill.afflictionInstant || 0) > 0 && !(skill.afflictionVal && skill.afflictionVal > 0))
  );
  if (isAttack && isFriendlyAction) return result('unsupported', 'combined-offense-and-support-not-ported', state);

  if (targetType !== 'Enemy' && targetType !== 'AllEnemies' &&
    targetType !== 'Self' && targetType !== 'Ally' && targetType !== 'AllAllies' &&
    targetType !== 'SelfAndAlly' && targetType !== 'AnyLiving') {
    return result('unsupported', 'target-type-not-ported', state);
  }
  const isOffensiveTarget = targetType === 'Enemy' || targetType === 'AllEnemies' ||
    skill.damageTarget === 'AllEnemies' ||
    skill.directDamageTarget === 'AllEnemies';
  if ((isOffensiveTarget && !isAttack && !isControlAction && !appliesStack) ||
    (!isOffensiveTarget && !isFriendlyAction && !hasSelfEffect && !hasConfiguredEffects) ||
    (targetType === 'AllEnemies' && !isAttack && !isControlAction && !appliesStack)) {
    return result('unsupported', 'target-type-effect-combination-not-ported', state);
  }

  const selectableTeam = targetType === 'AnyLiving'
    ? allCombatants
    : isOffensiveTarget ? opposingTeam : sourceTeam;
  const target = selectableTeam.find(combatant => combatant.id === intent.targetId);
  if (!target || target.isDead) return result('rejected', 'invalid-target', state);
  if (targetType === 'Self' && target.id !== source.id) {
    return result('rejected', 'invalid-target', state);
  }
  if (targetType === 'SelfAndAlly' &&
    target.id !== source.id && !sourceTeam.some(combatant => combatant.id === target.id)) {
    return result('rejected', 'invalid-target', state);
  }
  if (skill.requireTargetEffect && !hasEffectWithName(target, skill.requireTargetEffect)) {
    return result('rejected', 'required-target-effect-missing', state);
  }
  if (isAttack && (targetType === 'Enemy' || targetType === 'AnyLiving') &&
    checkCombatantInvulnerable(target, skill, source)) {
    return result('rejected', 'target-invulnerable', state);
  }
  if (effectiveDamage.damage > 0 && effectiveDamage.directDamage > 0 && !hasStackDamage) {
    return result('unsupported', 'combined-damage-types-not-ported', state);
  }
  if (!isAttack && !isFriendlyAction && !hasSelfEffect && !isControlAction &&
    !hasConfiguredEffects && !appliesStack) {
    return result('unsupported', 'skill-effect-not-ported', state);
  }

  const effectiveCooldown = getEffectiveCooldown(skill, source, allCombatants);
  if (skill.currentCooldown > 0 && effectiveCooldown > 0) {
    return result('rejected', 'skill-on-cooldown', state);
  }
  const chakraPool = intent.side === 'player' ? state.playerChakra : state.enemyChakra;
  const newChakraPool = spendSkillCost(
    chakraPool,
    getEffectiveSkillCost(skill, source, allCombatants),
  );
  if (!newChakraPool) return result('rejected', 'insufficient-chakra', state);

  const nextState = cloneState(state);
  const nextSource = [...nextState.player, ...nextState.enemy]
    .find(combatant => combatant.id === source.id)!;
  const nextTarget = [...nextState.player, ...nextState.enemy]
    .find(combatant => combatant.id === target.id)!;
  const nextSourceTeam = intent.side === 'player' ? nextState.player : nextState.enemy;
  const offensiveTargets = targetType === 'AllEnemies' ||
    skill.damageTarget === 'AllEnemies' || skill.directDamageTarget === 'AllEnemies'
    ? (intent.side === 'player' ? nextState.enemy : nextState.player).filter(combatant => !combatant.isDead)
    : targetType === 'AnyLiving' && isAttack
    ? [nextTarget]
    : [nextTarget];
  const stackTargetType = skill.stackTarget || 'Target';
  const stackTargets = stackTargetType === 'Self'
    ? [nextSource]
    : stackTargetType === 'Both'
      ? [nextSource, nextTarget]
      : [nextTarget];
  const nextSkill = nextSource.character.skills[intent.skillIndex];
  nextSkill.currentCooldown = effectiveCooldown;
  if (intent.side === 'player') nextState.playerChakra = newChakraPool;
  else nextState.enemyChakra = newChakraPool;

  const events: CombatEngineEvent[] = [
    { type: 'chakra-spent', side: intent.side, chakra: { ...newChakraPool } },
  ];
  if (isAttack) {
    const splashTargets = skill.splashDamage && skill.splashDamage > 0
      ? (skill.splashTarget === 'AllAllies'
        ? nextSourceTeam.filter(combatant => !combatant.isDead && combatant.id !== nextTarget.id)
        : skill.splashTarget === 'AllLiving'
          ? [...nextState.player, ...nextState.enemy].filter(combatant => !combatant.isDead && combatant.id !== nextTarget.id)
          : (intent.side === 'player' ? nextState.enemy : nextState.player)
            .filter(combatant => !combatant.isDead && combatant.id !== nextTarget.id))
      : [];
    const primaryTargets = skill.splashDamage && skill.splashDamage > 0
      ? [nextTarget]
      : offensiveTargets;
    for (const offensiveTarget of [...primaryTargets, ...splashTargets]) {
      if (checkCombatantInvulnerable(offensiveTarget, skill, nextSource)) continue;
      const isSplashTarget = splashTargets.includes(offensiveTarget);
      const stackDamage = isSplashTarget
        ? { damage: 0, directDamage: 0, consume: [] }
        : calculateStackDamage(nextSkill, nextSource, offensiveTarget);
      const damage = (isSplashTarget ? skill.splashDamage || 0 : effectiveDamage.damage) + stackDamage.damage;
      const directDamage = (isSplashTarget ? 0 : effectiveDamage.directDamage) + stackDamage.directDamage;
      if (damage > 0 && directDamage > 0) {
        return result('unsupported', 'combined-damage-types-not-ported', state);
      }
      if (damage > 0 || directDamage > 0) {
        events.push(...applyDamage(offensiveTarget, {
          ...nextSkill,
          damage,
          directDamage,
        }, nextState.turn, nextSource));
      }
      for (const consumed of stackDamage.consume) {
        consumed.effect.stacks = Math.max(0, (consumed.effect.stacks || 0) - consumed.stacks);
        if (consumed.effect.stacks <= 0) {
          consumed.owner.activeEffects = consumed.owner.activeEffects.filter(effect => effect !== consumed.effect);
        }
      }
    }
  }
  if (isFriendlyAction || (!isAttack && !isControlAction)) {
    const living = [...nextState.player, ...nextState.enemy].filter(combatant => !combatant.isDead);
    const healTargets = effectTargets(
      nextSkill.healTarget || (targetType === 'AllAllies' ? 'AllAllies' : 'Target'),
      nextSource,
      nextTarget,
      nextSourceTeam.filter(combatant => !combatant.isDead),
      (intent.side === 'player' ? nextState.enemy : nextState.player).filter(combatant => !combatant.isDead),
      living,
      nextSkill,
    );
    const shieldTargets = effectTargets(
      nextSkill.shieldTarget || (targetType === 'AllAllies' ? 'AllAllies' : 'Target'),
      nextSource,
      nextTarget,
      nextSourceTeam.filter(combatant => !combatant.isDead),
      (intent.side === 'player' ? nextState.enemy : nextState.player).filter(combatant => !combatant.isDead),
      living,
      nextSkill,
    );
    const effectTargetIds = new Set([...healTargets, ...shieldTargets].map(combatant => combatant.id));
    events.push(...[...effectTargetIds].flatMap(targetId => {
      const effectTarget = living.find(combatant => combatant.id === targetId)!;
      return applyFriendlyEffects(
        nextSource,
        effectTarget,
        nextSkill,
        nextState.turn,
        healTargets.some(combatant => combatant.id === targetId),
        shieldTargets.some(combatant => combatant.id === targetId),
      );
    }));
  }
  if (appliesStack) {
    for (const stackTarget of new Set(stackTargets)) {
      applyStack(stackTarget, nextSource, nextSkill, intent.side, nextState.turn);
    }
  }

  if (skill.permanent && !nextTarget.activeEffects.some(effect =>
    effect.type === 'custom' && effect.sourceSkillName === skill.name,
  )) {
    nextTarget.activeEffects.push({
      name: skill.name,
      type: 'custom',
      value: 0,
      duration: 99999,
      icon: skill.icon,
      sourceSkillName: skill.name,
      casterId: nextSource.id,
      casterSide: intent.side,
    });
  }

  if ((skill.damageReductionVal || 0) > 0) {
    nextTarget.activeEffects.push({
      name: `${skill.name} (Redução de Dano)`,
      type: 'damage_reduction',
      value: skill.damageReductionVal,
      duration: skill.damageReductionDuration || 1,
      icon: skill.icon,
      casterId: nextSource.id,
      casterSide: intent.side,
      castTurn: nextState.turn,
      sourceSkillName: skill.name,
    });
  }

  applyConfiguredEffects(
    nextSource,
    nextTarget,
    nextSkill,
    nextState.turn,
    intent.side,
    nextSourceTeam.filter(combatant => !combatant.isDead),
    (intent.side === 'player' ? nextState.enemy : nextState.player).filter(combatant => !combatant.isDead),
    [...nextState.player, ...nextState.enemy].filter(combatant => !combatant.isDead),
  );

  activateThresholdImmortality(nextSource, nextState.turn);
  if ((skill.immortalDuration || 0) > 0 &&
    (skill.immortalImmediate ||
      (!(skill.immortalHpThreshold || 0) && skill.immortalImmediate !== false)) &&
    !nextSource.activeEffects.some(effect => effect.type === 'immortal')) {
    nextSource.activeEffects.push({
      name: `${skill.name} (Imortal)`,
      type: 'immortal',
      duration: skill.immortalDuration || 3,
      icon: skill.icon,
      casterId: nextSource.id,
      casterSide: intent.side,
      castTurn: nextState.turn,
    });
  }

  if (opposingTeam.length > 0 && opposingTeam.every(combatant => {
    const updated = [...nextState.player, ...nextState.enemy]
      .find(candidate => candidate.id === combatant.id);
    return !updated || updated.isDead;
  })) {
    nextState.winnerSide = intent.side;
    events.push({ type: 'match-ended', winnerSide: intent.side });
  }
  return { status: 'applied', state: nextState, events };
}
