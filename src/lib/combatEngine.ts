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
  | {
    type: 'chakra-manipulation';
    mode: 'drain' | 'remove' | 'steal';
    sourceId: string;
    targetId: string;
    amount: number;
    chakraTypes: (keyof ChakraPool)[];
  }
  | { type: 'damage'; targetId: string; health: number; shield: number; amount: number; damageType: 'damage' | 'direct_damage' }
  | { type: 'heal'; targetId: string; health: number; healed: number }
  | { type: 'shield'; targetId: string; shield: number; added: number; expiresTurn?: number }
  | { type: 'friendly-effect-blocked'; targetId: string; effect: 'heal' }
  | { type: 'revive'; targetId: string; health: number }
  | { type: 'combat-text'; targetId: string; text: string; floatingType: 'effect' | 'stun' | 'invulnerable' }
  | { type: 'skill-copy'; sourceId: string; targetId: string; skillName: string }
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
  'cooldownReduceRules',
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
  'damageImmunityTarget',
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
  'redirectOffensiveToCaster',
  'redirectOffensiveDuration',
  'redirectOffensiveScope',
  'redirectOffensiveTarget',
  'redirectOffensiveIrremovable',
  'healRemoveType',
  'counterSuccessDamageRules',
  'counterSuccessBuffRules',
  'counterSuccessStunRules',
  'counterSuccessStackRules',
  'onCounteredDamageRules',
  'chakraStealRules',
  'opponentSkillUseRules',
  'ignoreDamageReductionVal',
  'chakraCostReduceRules',
  'reflectByStackRules',
  'selfStackReductionRules',
  'delayedUnlockSkills',
  'delayedUnlockDuration',
  'delayedUnlockWindowTurns',
  'shieldWhenActiveRules',
  'noCounterReflectWhenActiveRules',
  'delayedDirectDamage',
  'delayedDirectDamageTurns',
  'delayedInvulnerableDuration',
  'delayedInvulnerableTurns',
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
  'healDuration',
  'healRules',
  'chakraRemoveRules',
  'paralyzeCooldownDuration',
  'paralyzeCooldownIrremovable',
  'removeShieldDuration',
  'stackDurationRules',
  'targetRules',
  'cooldownRules',
  'retaliateDamage',
  'retaliateDamageVal',
  'retaliateDamageDuration',
  'retaliateDamagePermanent',
  'retaliateDamageType',
  'retaliateTargetScope',
  'retaliateTriggerMode',
  'retaliateDamageIrremovable',
  'retaliateClasses',
  'onSkillUseDamageRules',
  'killWhenActiveRules',
  'targetActiveSkillDamageRules',
  'stunWhenActiveRules',
  'ignoreInvulnWhenActiveRules',
  'revealInvisibleDuration',
  'revealInvisibleTarget',
  'removeCounterReflect',
  'removeCounterReflectTarget',
  'chakraCostIncreaseDuration',
  'chakraCostIncreaseTypes',
  'chakraCostIncreaseSkillTypes',
  'chakraCostIncreaseTarget',
  'chakraCostIncreaseIrremovable',
  'cooldownIncreaseAmount',
  'cooldownIncreaseDuration',
  'cooldownIncreaseTarget',
  'cooldownIncreaseIrremovable',
  'bonusDamagePerMissingHp',
  'missingHpStep',
  'missingHpDamageType',
  'missingHpBonusType',
  'reviveHp',
  'reviveDeadAllies',
  'reviveHealth',
  'deathLinkDuration',
  'friendlyDamageType',
  'friendlyDamageVal',
  'friendlyDamageDuration',
  'friendlyDamageCantKill',
  'shieldPerStackRules',
  'targetChangeOnStacksRules',
  'bonusDamageOnStacksRules',
  'countdownDamageRules',
  'stackUseEffectRules',
  'selfCastStackRules',
  'stackStartActive',
  'stackStartCount',
  'stackStartTags',
  'stackDelayTurns',
  'stackApplyOnAttack',
  'stackApplyOnAttackDuration',
  'redirectOffensiveRemoveOnSelfCast',
  'cancelSelfOnReuse',
  'afflictionInstant',
  'afflictionNoStack',
  'afflictionConditionalRules',
  'damageToShieldDuration',
  'damageToShieldShieldTurns',
  'damageToShieldTypes',
  'damageToShieldFirstHitOnly',
  'damageToShieldTarget',
  'damageToShieldIrremovable',
  'blocksHealsWhileActive',
  'cannotBeStunned',
  'skillCopyDuration',
  'skillCopyTarget',
  'skillCopyRandom',
  'captureAndArrest',
  'removedOnTargetSkillUse',
  'removedOnCasterDeath',
  'maxUses',
  'damageStacksAsDuration',
  'damageStacksAsDurationType',
  'damageReductionStacksAsDuration',
  'damageReductionStacksType',
  'missingHpStep',
  'missingHpDamageType',
  'missingHpBonusType',
  'damageImmunityFirstHitOnly',
  'cleanseDebuffTarget',
  'cleanseBuffTarget',
  'dotTarget',
  'bleedingTarget',
  'afflictionTarget',
  'invisibleTarget',
  'gainChakraTarget',
  'drainChakraTarget',
  'removeChakraTarget',
  'stealChakraTarget',
  'damageReductionPierceTarget',
  'totalInvulnerableTarget',
  'totalInvulnerableDuration',
  'totalInvulnerableTypes',
  'totalInvulnerableClasses',
  'retaliateDamageTarget',
  'paralyzeCooldownTarget',
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
  'shield_seal',
  'paralyze_cooldown',
  'retaliate_damage',
  'heal_over_time',
  'reveal_invisible',
  'cooldown_increase',
  'chakra_cost_increase',
  'chakra_cost_reduce',
  'death_link',
  'countdown_bomb',
  'skill_copy',
  'pending_invulnerable',
  'no_counter_reflect',
  'temporary_target_change',
  'temporary_damage_boost',
  'redirect_by_stack',
  'on_skill_use_damage',
  'capture_arrest_trap',
  'capture_arrest_debuff',
  'shield_stun_immunity',
  'heal',
]);

const SUPPORTED_TARGET_FIELDS = new Set([
  'stackTarget',
  'directDamageTarget',
  'healTarget',
  'paralyzeCooldownTarget',
  'retaliateDamageTarget',
  'shieldTarget',
  'dotTarget',
  'bleedingTarget',
  'afflictionTarget',
  'invisibleTarget',
  'gainChakraTarget',
  'drainChakraTarget',
  'removeChakraTarget',
  'stealChakraTarget',
  'damageReductionPierceTarget',
  'totalInvulnerableTarget',
  'revealInvisibleTarget',
  'removeCounterReflectTarget',
  'chakraCostIncreaseTarget',
  'cooldownIncreaseTarget',
  'damageToShieldTarget',
  'skillCopyTarget',
  'cleanseDebuffTarget',
  'cleanseBuffTarget',
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
  'counterAttackTarget',
  'redirectOffensiveTarget',
]);

const SUPPORTED_TARGET_OVERRIDES = new Set([
  'Target', 'Self', 'Both', 'Enemy', 'Ally', 'AllAllies', 'AllEnemies', 'AllLiving',
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
    previousTurnSkills: combatant.previousTurnSkills ? [...combatant.previousTurnSkills] : undefined,
    currentTurnSkills: combatant.currentTurnSkills ? [...combatant.currentTurnSkills] : undefined,
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
        !['damage', 'direct_damage', 'piercing', 'affliction', 'bleeding', 'dot', 'life_steal', undefined]
          .includes(rule.damageType),
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
        )) &&
      !(effect.type === 'custom' && effect.name === 'WoodSpirePunish'),
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
      target.health = Math.min(target.maxHealth, target.health + (skill.heal || 0));
      events.push({
        type: 'heal',
        targetId: target.id,
        health: target.health,
        healed: target.health - previousHealth,
      });
      if (skill.healRemoveType) {
        target.activeEffects = target.activeEffects.filter(effect =>
          effect.type !== skill.healRemoveType,
        );
      }
      if ((skill.healDuration || 0) > 1) {
        target.activeEffects.push({
          name: `${skill.name} (Cura Contínua)`,
          type: 'heal_over_time',
          value: skill.heal,
          duration: skill.healDuration - 1,
          casterId: source.id,
          casterSide: source.id.startsWith('player-') ? 'player' : 'enemy',
          sourceSkillName: skill.name,
          castTurn: turn,
        });
      }
    }
  }

  if (applyShield && ((skill.shieldVal || 0) > 0 || (skill.shieldPerStackRules?.length || 0) > 0)) {
    const previousShield = target.shield;
    const shieldCap = skill.shieldMaxVal && skill.shieldMaxVal > 0
      ? skill.shieldMaxVal
      : Number.POSITIVE_INFINITY;
    if (target.activeEffects.some(effect => effect.type === 'shield_seal')) return events;
    const stackShield = (skill.shieldPerStackRules || []).reduce((sum, rule) => {
      const stack = findStack(source, rule.stackType);
      return sum + Math.max(0, rule.shieldPerStack * (stack?.stacks || 0));
    }, 0);
    target.shield = Math.min(previousShield + (skill.shieldVal || 0) + stackShield, shieldCap);
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
    if ((skill.shieldRegenTurns || 0) > 0) {
      target.activeEffects.push({
        name: `${skill.name} (Regeneração de Escudo)`,
        type: 'shield',
        value: (skill.shieldVal || 0) + stackShield,
        duration: skill.shieldRegenTurns,
        regenPerTurn: true,
        regenMaxVal: skill.shieldMaxVal,
        casterId: source.id,
        casterSide: source.id.startsWith('player-') ? 'player' : 'enemy',
        sourceSkillName: skill.name,
        castTurn: turn,
      });
    }
    if (stackShield > 0 && target.id === source.id) {
      for (const rule of skill.shieldPerStackRules || []) {
        const stack = findStack(source, rule.stackType);
        if (!stack || !rule.resetStackOnUse) continue;
        const resetTo = rule.resetStacksTo ?? 1;
        if (resetTo > 0) stack.stacks = resetTo;
        else source.activeEffects = source.activeEffects.filter(effect => effect !== stack);
      }
    }
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
    case 'Enemy': return enemies.filter(combatant => !combatant.isDead);
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
): CombatEngineEvent[] {
  const events: CombatEngineEvent[] = [];
  const addEffect = (
    targetSelector: string | undefined,
    type: CombatCharacter['activeEffects'][number]['type'],
    duration: number,
    value?: number,
    extra: Partial<CombatCharacter['activeEffects'][number]> = {},
  ) => {
    if (duration <= 0) return;
    for (const target of effectTargets(targetSelector, source, selected, allies, enemies, everyone, skill)) {
      if (target.isDead) continue;
      if (type === 'stun' && checkCombatantInvulnerable(target, 'stun', source)) continue;
      const effectiveDuration = (skill.stackDurationRules || []).find(rule =>
        target.activeEffects.some(effect =>
          effect.stackType === rule.stackType && (effect.stacks || 0) > 0,
        ),
      )?.durationOverride || duration;
      if (!skill.invisible && !(skill.invisibleDuration || 0)) {
        const visual = type === 'stun'
          ? { text: `STUN (${effectiveDuration}T)`, floatingType: 'stun' as const }
          : type === 'invulnerable'
            ? { text: `INVULNERÁVEL (${effectiveDuration}T)`, floatingType: 'invulnerable' as const }
            : { text: `${type.replaceAll('_', ' ').toUpperCase()} (${effectiveDuration}T)`, floatingType: 'effect' as const };
        events.push({ type: 'combat-text', targetId: target.id, ...visual });
      }
      const current = target.activeEffects.find(effect =>
        effect.type === type && effect.sourceSkillName === skill.name,
      );
      if (current) {
        current.duration = Math.max(current.duration, effectiveDuration);
        current.value = value ?? current.value;
        Object.assign(current, extra);
      } else {
        target.activeEffects.push({
          name: skill.name,
          type,
          duration: effectiveDuration,
          value,
          icon: skill.icon,
          casterId: source.id,
          casterSide: side,
          sourceSkillName: skill.name,
          castTurn: turn,
          cannotBeCountered: skill.cannotBeCountered,
          cannotBeReflected: skill.cannotBeReflected,
          blocksHeals: skill.blocksHealsWhileActive,
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
  addEffect(skill.chakraCostIncreaseTarget || 'Target', 'chakra_cost_increase',
    skill.chakraCostIncreaseDuration || 0, 1, {
      costIncreaseChakraTypes: skill.chakraCostIncreaseTypes,
      costIncreaseSkillTypes: skill.chakraCostIncreaseSkillTypes,
      irremovable: skill.chakraCostIncreaseIrremovable,
    });
  addEffect(skill.cooldownIncreaseTarget || 'Target', 'cooldown_increase',
    skill.cooldownIncreaseDuration || 0, skill.cooldownIncreaseAmount, {
      irremovable: skill.cooldownIncreaseIrremovable,
    });
  for (const rule of skill.chakraCostReduceRules || []) {
    if (!rule.chakraTypes?.length || rule.amount <= 0 || rule.durationTurns <= 0) continue;
    addEffect('Target', 'chakra_cost_reduce', rule.durationTurns, rule.amount, {
      costReduceChakraTypes: rule.chakraTypes,
    });
  }
  for (const rule of skill.opponentSkillUseRules || []) {
    if (rule.duration <= 0) continue;
    addEffect('Target', 'on_skill_use_damage', rule.duration, undefined, {
      opponentSkillUseRule: rule,
    });
  }
  addEffect(skill.revealInvisibleTarget || 'Target', 'reveal_invisible',
    skill.revealInvisibleDuration || 0);
  addEffect(skill.stunTarget || 'Target', 'stun', skill.stunTurns || 0, undefined,
    { stunType: skill.stunType || [] });
  for (const rule of skill.stunWhenActiveRules || []) {
    const inspected = rule.activeOn === 'self' ? source : selected;
    if (rule.activeSkillName && hasEffectWithName(inspected, rule.activeSkillName)) {
      addEffect('Target', 'stun', rule.stunTurns || 1, undefined,
        { stunType: rule.stunClasses || [] });
    }
  }
  addEffect(skill.paralyzeCooldownTarget || 'Target', 'paralyze_cooldown',
    skill.paralyzeCooldownDuration || 0, undefined,
    { irremovable: skill.paralyzeCooldownIrremovable });
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
  const afflictionDuration = skill.afflictionDuration || 1;
  const afflictionTicksOnCast = !skill.afflictionDelay && !(skill.afflictionInstant && skill.afflictionInstant > 0);
  const remainingAfflictionDuration = (skill.afflictionVal || 0) <= 0
    ? 0
    : afflictionTicksOnCast
      ? (afflictionDuration === 99999 ? 99999 : afflictionDuration - 1)
      : afflictionDuration;
  addEffect(skill.afflictionTarget || 'Target', 'affliction', remainingAfflictionDuration,
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
  if (skill.cannotBeStunned) {
    addEffect('Self', 'ignore_stun', 1);
  }
  addEffect(skill.redirectOffensiveTarget || 'Self', 'redirect_offensive',
    skill.redirectOffensiveDuration || 0, undefined, {
      redirectOffensiveToCaster: skill.redirectOffensiveToCaster,
      redirectCasterId: source.id,
      redirectOffensiveScope: skill.redirectOffensiveScope,
      irremovable: skill.redirectOffensiveIrremovable,
    });
  addEffect(skill.targetType === 'Enemy' || skill.targetType === 'AllEnemies' ? 'Target' : 'Self',
    'shield_seal', skill.removeShieldDuration || 0);
  if (skill.retaliateDamage) {
    addEffect(skill.retaliateDamageTarget || 'Self', 'retaliate_damage',
      skill.retaliateDamagePermanent ? 99999 : skill.retaliateDamageDuration || 1,
      skill.retaliateDamageVal || 0, {
        retaliateDamageVal: skill.retaliateDamageVal || 0,
        retaliateDamageType: skill.retaliateDamageType || 'damage',
        retaliateTargetScope: skill.retaliateTargetScope || 'self',
        retaliateTriggerMode: skill.retaliateTriggerMode || 'always',
        retaliateClasses: skill.retaliateClasses,
        irremovable: skill.retaliateDamageIrremovable,
      });
  }
  const isWoodSpirePrison = skill.name === 'Wood Release: Wooden Spire Prison' &&
    (source.character.folder === 'anbu-kinoe' || source.character.id === 'anbu-kinoe');
  const prisonRule = skill.prisonRule?.enabled
    ? skill.prisonRule
    : isWoodSpirePrison
      ? {
        enabled: true,
        allyReduction: 15,
        enemyReduction: 15,
        punishmentDamage: 15,
        duration: 2,
        geyserBoost: 25,
        cleanseAlly: true,
        resetCooldownsAlly: true,
      }
      : undefined;
  if (prisonRule?.enabled) {
    const duration = prisonRule.duration || 2;
    const isAllyTarget = allies.some(ally => ally.id === selected.id);
    const hasGeyser = selected.activeEffects.some(effect =>
      effect.name.toLowerCase().includes('geyser spring'),
    );
    if (isAllyTarget) {
      if (prisonRule.cleanseAlly !== false) {
        selected.activeEffects = selected.activeEffects.filter(effect =>
          !['stun', 'damage_debuff', 'damage_vulnerability', 'dot', 'bleeding',
            'affliction', 'blocks_offensive_skills', 'cannot_be_invulnerable',
            'cannot_receive_friendly', 'negate_friendly_effects', 'paralyze_cooldown']
            .includes(effect.type) || effect.irremovable,
        );
      }
      if (prisonRule.resetCooldownsAlly !== false) {
        selected.character.skills.forEach(allySkill => { allySkill.currentCooldown = 0; });
      }
      addEffect('Target', 'damage_reduction', duration,
        hasGeyser ? prisonRule.geyserBoost || 25 : prisonRule.allyReduction || 15,
        { excludeAffliction: true });
    } else {
      addEffect('Target', 'damage_debuff', duration,
        hasGeyser ? prisonRule.geyserBoost || 25 : prisonRule.enemyReduction || 15,
        { debuffTypes: ['skill'], excludeClasses: ['mental'] });
      if ((prisonRule.punishmentDamage || 0) > 0) {
        selected.activeEffects.push({
          name: 'WoodSpirePunish',
          type: 'custom',
          value: prisonRule.punishmentDamage,
          duration,
          casterId: source.id,
          casterSide: selected.id.startsWith('player-') ? 'player' : 'enemy',
          sourceSkillName: skill.name,
          targetId: selected.id,
          castTurn: turn,
        });
      }
    }
  }
  for (const rule of skill.shieldWhenActiveRules || []) {
    const inspected = rule.activeOn === 'self' ? source : selected;
    if (!rule.activeSkillName || !hasEffectWithName(inspected, rule.activeSkillName) ||
      rule.shieldVal <= 0) continue;
    for (const target of rule.shieldTarget === 'team' ? allies : [source]) {
      if (target.isDead || isFriendlyEffectBlocked(target, skill)) continue;
      target.shield += rule.shieldVal;
      const duration = rule.shieldDuration || 99;
      if (duration < 99999) target.shieldExpiresTurn = Math.max(
        target.shieldExpiresTurn || 0,
        turn + duration,
      );
    }
  }
  for (const rule of skill.selfStackReductionRules || []) {
    const stack = rule.stackType ? findStack(source, rule.stackType) : undefined;
    const reduction = Math.max(0, rule.reductionValue * (stack?.stacks || 0));
    if (!reduction) continue;
    addEffect(
      'Self',
      rule.reductionType === 'damage_reduction_pierce'
        ? 'damage_reduction_pierce'
        : 'damage_reduction',
      rule.duration || 99999,
      reduction,
    );
  }
  for (const rule of skill.noCounterReflectWhenActiveRules || []) {
    const inspected = rule.activeOn === 'self' ? source : selected;
    if (!rule.activeSkillName || !hasEffectWithName(inspected, rule.activeSkillName) ||
      (!rule.noCounter && !rule.noReflect)) continue;
    addEffect('Self', 'no_counter_reflect', 1, undefined, {
      noCounterProtect: rule.noCounter !== false,
      noReflectProtect: rule.noReflect !== false,
    });
  }
  if (skill.delayedDirectDamage && skill.delayedDirectDamage > 0) {
    const delay = skill.delayedDirectDamageTurns || 1;
    addEffect('Target', 'direct_damage', 1,
      skill.delayedDirectDamage, {
        delayTurns: Math.max(0, delay - 1),
        damageType: 'direct_damage',
      });
  }
  if (skill.delayedInvulnerableDuration && skill.delayedInvulnerableDuration > 0) {
    const delay = skill.delayedInvulnerableTurns || 1;
    addEffect('Self', 'pending_invulnerable', 1,
      undefined, {
        delayTurns: Math.max(0, delay - 1),
        pendingInvulnDuration: skill.delayedInvulnerableDuration,
        invulnerableTypes: skill.invulnerableTypes,
        invulnerableClasses: skill.invulnerableClasses,
      });
  }
  addEffect(skill.targetType === 'Enemy' || skill.targetType === 'AllEnemies' ? 'Target' : 'Self',
    'blocks_offensive_skills', skill.blocksOffensiveSkills ? 1 : 0);
  if (skill.removeShield) {
    selected.shield = 0;
    selected.shieldExpiresTurn = undefined;
  }
  return events;
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
): (keyof ChakraPool)[] {
  const sourcePool = source.id.startsWith('player-') ? state.playerChakra : state.enemyChakra;
  const targetPool = target.id.startsWith('player-') ? state.playerChakra : state.enemyChakra;
  let remaining = Math.max(0, amount);
  const changed: (keyof ChakraPool)[] = [];
  const types: (keyof ChakraPool)[] = ['Tai', 'Nin', 'Gen', 'Blood'];
  while (remaining > 0) {
    const available = types.filter(type => targetPool[type] > 0);
    if (!available.length) break;
    const type = available[0];
    targetPool[type] -= 1;
    if (mode === 'steal' || mode === 'drain') sourcePool[type] += 1;
    changed.push(type);
    remaining -= 1;
  }
  return changed;
}

function ignoresTargetInvulnerability(
  skill: Skill,
  source: CombatCharacter,
  target: CombatCharacter,
): boolean {
  if (skill.ignoreInvulnerable) return true;
  return (skill.ignoreInvulnWhenActiveRules || []).some(rule => {
    const inspected = rule.activeOn === 'self' ? source : target;
    return !!rule.activeSkillName && hasEffectWithName(inspected, rule.activeSkillName);
  });
}

function applyDamage(
  target: CombatCharacter,
  skill: Skill,
  turn: number,
  source?: CombatCharacter,
): CombatEngineEvent[] {
  const beforeTotal = target.health + target.shield;
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
      (!effect.debuffTypes?.length || incomingDamageTypes.some(type => effect.debuffTypes?.includes(type))) &&
      !(effect.excludeClasses || []).some(type => incomingClasses.includes(type)))
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
      const configuredReduction = target.activeEffects
        .filter(effect =>
          reductionTypes.includes(effect.type) &&
          !(afflictionSkill && effect.excludeAffliction),
        )
        .reduce((sum, effect) => sum + (effect.value || 0), 0);
      const reductions = skill.ignoreDamageReduction
        ? 0
        : Math.max(0, configuredReduction - (skill.ignoreDamageReductionVal || 0));
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
  const appliedDamage = Math.max(0, beforeTotal - target.health - target.shield);

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
        { type: 'damage', targetId: target.id, health: 0, shield: target.shield, amount: appliedDamage, damageType },
        { type: 'revive', targetId: target.id, health: reviveHealth },
      ];
    }
    target.activeEffects = target.activeEffects.filter(effect => effect.type === 'death_link');
  }

  return [{
    type: 'damage',
    targetId: target.id,
    health: target.health,
    shield: target.shield,
    amount: appliedDamage,
    damageType,
  }];
}

function resolveDeathLinks(state: CombatEngineState): void {
  const combatants = [...state.player, ...state.enemy];
  for (const character of combatants) {
    if (!character.isDead) continue;
    const links = character.activeEffects.filter(effect =>
      effect.type === 'death_link' && effect.targetId,
    );
    for (const link of links) {
      const linked = combatants.find(candidate => candidate.id === link.targetId);
      if (linked && !linked.isDead) {
        linked.health = 0;
        linked.isDead = true;
        linked.activeEffects = [];
      }
    }
    character.activeEffects = character.activeEffects.filter(effect => effect.type !== 'death_link');
  }
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
    if (['affliction', 'bleeding', 'dot', 'life_steal'].includes(rule.damageType || '')) continue;
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
  if (skill.requirePreviousSkill && !source.previousTurnSkills?.includes(skill.requirePreviousSkill)) {
    return result('rejected', 'required-previous-skill-missing', state);
  }
  if (skill.requireHpBelow !== undefined && source.health > skill.requireHpBelow) {
    return result('rejected', 'health-threshold-not-met', state);
  }
  if (skill.requireRevived && !source.hasRevived) {
    return result('rejected', 'revive-required', state);
  }
  if (skill.blockIfRevived && source.hasRevived) {
    return result('rejected', 'skill-blocked-after-revive', state);
  }
  if (skill.maxUses !== undefined &&
    (source.skillUseCounts?.[skill.name] || 0) >= skill.maxUses) {
    return result('rejected', 'skill-use-limit-reached', state);
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
  const triggeredSkillUseEffects = source.activeEffects.filter(effect =>
    effect.opponentSkillUseTriggered === true,
  );
  const effectiveDamage = applyConditionalDamageRules(skill, allCombatants);
  const triggeredDamageBonus = triggeredSkillUseEffects.reduce((sum, effect) =>
    sum + (effect.opponentSkillUseRule?.damageBuffOnDamage || 0), 0);
  const hasNativeDamage = effectiveDamage.damage > 0 || effectiveDamage.directDamage > 0 ||
    (skill.afflictionVal || 0) > 0 || (skill.dotVal || 0) > 0 ||
    (skill.afflictionInstant || 0) > 0 || (skill.bleedingVal || 0) > 0 ||
    (skill.stealLifeVal || 0) > 0;
  if (triggeredDamageBonus > 0 && hasNativeDamage) {
    if (effectiveDamage.directDamage > 0) effectiveDamage.directDamage += triggeredDamageBonus;
    else effectiveDamage.damage += triggeredDamageBonus;
  }
  const hasStackDamage = !!skill.stackDamageRules?.length || !!skill.selfStackDamageRules?.length;
  const hasDamage = effectiveDamage.damage > 0 || effectiveDamage.directDamage > 0 ||
    hasStackDamage || (skill.afflictionVal || 0) > 0 || (skill.dotVal || 0) > 0 ||
    (skill.afflictionInstant || 0) > 0 || (skill.bleedingVal || 0) > 0 ||
    (skill.drainChakra || 0) > 0 ||
    (skill.removeChakra || 0) > 0 || (skill.stealChakra || 0) > 0 ||
    (skill.stealLifeVal || 0) > 0;
  const isAttack = hasDamage;
  const isFriendlyAction = (skill.heal || 0) > 0 || (skill.shieldVal || 0) > 0 ||
    (skill.shieldPerStackRules?.length || 0) > 0 ||
    (skill.gainChakra || 0) > 0 || (skill.healRules?.length || 0) > 0 ||
    skill.cleanseDebuffs === true || skill.cleanseBuffs === true;
  const hasConfiguredEffects = (skill.damageBuffVal || 0) > 0 ||
    (skill.damageDebuffVal || 0) > 0 ||
    (skill.damageVulnerabilityVal || 0) > 0 ||
    (skill.damageImmunityDuration || 0) > 0 ||
    (skill.damageReductionVal || 0) > 0 ||
    (skill.invulnerableDuration || 0) > 0 ||
    (skill.revealInvisibleDuration || 0) > 0 ||
    (skill.stunTurns || 0) > 0 ||
    (skill.cannotReduceDamageDuration || 0) > 0 ||
    (skill.cannotBeInvulnerableDuration || 0) > 0 ||
    (skill.cannotReceiveFriendlyDuration || 0) > 0 ||
    (skill.negateFriendlyDuration || 0) > 0 ||
    (skill.ignoreStunDuration || 0) > 0 ||
    skill.removeShield === true ||
    (skill.invisibleDuration || 0) > 0 ||
    skill.invisible === true ||
    (skill.damageReductionPierceVal || 0) > 0 ||
    (skill.damageReductionPierceDuration || 0) > 0 ||
    (skill.damageToShieldDuration || 0) > 0 ||
    (skill.totalInvulnerableDuration || 0) > 0 ||
    skill.counterAttack === true ||
    (skill.counterAttackDuration || 0) > 0 ||
    skill.counterAttackUntilTriggered === true ||
    skill.reflect === true ||
    (skill.reflectDuration || 0) > 0 ||
    skill.blocksOffensiveSkills === true ||
    (skill.gainChakra || 0) > 0 ||
    (skill.afflictionVal || 0) > 0 ||
    (skill.dotVal || 0) > 0 ||
    (skill.bleedingVal || 0) > 0 ||
    (skill.damageDuration || 0) > 1 ||
    (skill.directDamageDuration || 0) > 1 ||
    (skill.cooldownIncreaseDuration || 0) > 0 ||
    (skill.cooldownIncreaseAmount || 0) > 0 ||
    (skill.redirectOffensiveDuration || 0) > 0 ||
    !!skill.redirectOffensiveToCaster ||
    (skill.deathLinkDuration || 0) > 0 ||
    (skill.skillCopyDuration || 0) > 0 ||
    (skill.healDuration || 0) > 0 ||
    (skill.friendlyDamageVal || 0) > 0 ||
    (skill.shieldRegenTurns || 0) > 0 ||
    (skill.chakraCostIncreaseDuration || 0) > 0 ||
    (skill.killWhenActiveRules?.length || 0) > 0 ||
    (skill.reviveHp || 0) > 0 ||
    (skill.countdownDamageRules?.length || 0) > 0 ||
    (skill.damageRules?.length || 0) > 0 ||
    (skill.targetActiveSkillDamageRules?.length || 0) > 0 ||
    (skill.stunWhenActiveRules?.length || 0) > 0 ||
    (skill.chakraStealRules?.length || 0) > 0 ||
    (skill.selfStackReductionRules?.length || 0) > 0 ||
    (skill.delayedDirectDamage || 0) > 0 ||
    (skill.delayedInvulnerableDuration || 0) > 0 ||
    !!skill.reviveDeadAllies ||
    !!skill.cleanseDebuffs ||
    !!skill.cleanseBuffs ||
    (skill.prisonRule !== undefined) ||
    (skill.name === 'Wood Release: Wooden Spire Prison' &&
      (source.character.folder === 'anbu-kinoe' || source.character.id === 'anbu-kinoe')) ||
    !!skill.counterAttack ||
    !!skill.reflect ||
    (skill.chakraCostReduceRules?.length || 0) > 0 ||
    (skill.opponentSkillUseRules?.length || 0) > 0 ||
    (skill.shieldWhenActiveRules?.length || 0) > 0 ||
    (skill.noCounterReflectWhenActiveRules?.length || 0) > 0 ||
    (skill.drainChakra || 0) > 0 ||
    (skill.removeChakra || 0) > 0 ||
    (skill.stealChakra || 0) > 0 ||
    (skill.stealLifeVal || 0) > 0 ||
    (skill.paralyzeCooldownDuration || 0) > 0 ||
    (skill.removeShieldDuration || 0) > 0 ||
    skill.retaliateDamage === true;
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
    skill.counterAttack === true ||
    skill.reflect === true ||
    skill.invisible === true ||
    (skill.gainChakra || 0) > 0 ||
    ((skill.afflictionInstant || 0) > 0 && !(skill.afflictionVal && skill.afflictionVal > 0))
  );
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
    checkCombatantInvulnerable(target, skill, source) &&
    !ignoresTargetInvulnerability(skill, source, target)) {
    return result('rejected', 'target-invulnerable', state);
  }
  if (isAttack && source.activeEffects.some(effect => effect.type === 'blocks_offensive_skills')) {
    return result('rejected', 'offensive-skills-blocked', state);
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
  const observedSkillUseEffects = nextSource.activeEffects.filter(effect =>
    effect.type === 'on_skill_use_damage' &&
    effect.casterId !== nextSource.id &&
    effect.opponentSkillUseRule,
  );
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
  const activeNames = [...nextState.player, ...nextState.enemy]
    .flatMap(combatant => combatant.activeEffects.map(effect => effect.name.toLowerCase()));
  const conditionalHeal = (nextSkill.healRules || []).reduce((sum, rule) => {
    const required = rule.activeSkillName?.toLowerCase();
    return required && activeNames.some(name =>
      name === required || name.includes(required) || required.includes(name),
    ) ? sum + (rule.healBoost || 0) : sum;
  }, 0);
  nextSkill.heal = (nextSkill.heal || 0) + conditionalHeal;
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
      if (checkCombatantInvulnerable(offensiveTarget, skill, nextSource) &&
        !ignoresTargetInvulnerability(nextSkill, nextSource, offensiveTarget)) continue;
      const isSplashTarget = splashTargets.includes(offensiveTarget);
      const stackDamage = isSplashTarget
        ? { damage: 0, directDamage: 0, consume: [] }
        : calculateStackDamage(nextSkill, nextSource, offensiveTarget);
      const matchingTargetDamageRules = isSplashTarget ? [] :
        (nextSkill.targetActiveSkillDamageRules || []).filter(rule =>
          rule.activeSkillName && hasEffectWithName(offensiveTarget, rule.activeSkillName),
        );
      const ignoreBaseDamage = matchingTargetDamageRules.some(rule => rule.ignoreBaseDamage);
      const conditionalTargetDamage = matchingTargetDamageRules.reduce((total, rule) =>
        total + (rule.damage || 0), 0);
      const damage = (isSplashTarget ? skill.splashDamage || 0 :
        (ignoreBaseDamage ? 0 : effectiveDamage.damage) + conditionalTargetDamage) + stackDamage.damage;
      const directDamage = (isSplashTarget ? 0 :
        (ignoreBaseDamage ? 0 : effectiveDamage.directDamage)) + stackDamage.directDamage;
      if (damage > 0 && directDamage > 0) {
        return result('unsupported', 'combined-damage-types-not-ported', state);
      }
      if (damage > 0 || directDamage > 0) {
        events.push(...applyDamage(offensiveTarget, {
          ...nextSkill,
          damage,
          directDamage,
        }, nextState.turn, nextSource));
        for (const retaliation of offensiveTarget.activeEffects.filter(effect =>
          effect.type === 'retaliate_damage',
        )) {
          if (nextSource.isDead || (retaliation.retaliateDamageVal || retaliation.value || 0) <= 0) continue;
          const classes = getSkillCombatTypes(nextSkill);
          if (retaliation.retaliateClasses?.length &&
            !retaliation.retaliateClasses.some(type => classes.includes(type))) continue;
          const retaliateAmount = retaliation.retaliateDamageVal || retaliation.value || 0;
          const retaliateDirect = retaliation.retaliateDamageType === 'direct_damage' ||
            retaliation.retaliateDamageType === 'piercing';
          events.push(...applyDamage(nextSource, {
            ...nextSkill,
            damage: retaliateDirect ? 0 : retaliateAmount,
            directDamage: retaliateDirect ? retaliateAmount : 0,
          }, nextState.turn, offensiveTarget));
          if (retaliation.retaliateTriggerMode === 'first_only') {
            offensiveTarget.activeEffects = offensiveTarget.activeEffects
              .filter(effect => effect !== retaliation);
          }
        }
        if (!isSplashTarget) {
          const activeDamageRules = (nextSkill.damageRules || []).filter(rule =>
            rule.activeSkillName && rule.damageBoost > 0 &&
            [...nextState.player, ...nextState.enemy].some(combatant =>
              hasEffectWithName(combatant, rule.activeSkillName!),
            ),
          );
          for (const rule of activeDamageRules) {
            const ruleType = rule.damageType;
            if (ruleType === 'life_steal') {
              const beforeHealth = offensiveTarget.health;
              events.push(...applyDamage(offensiveTarget, {
                ...nextSkill,
                damage: rule.damageBoost,
                directDamage: 0,
              }, nextState.turn, nextSource));
              const dealt = Math.max(0, beforeHealth - offensiveTarget.health);
              nextSource.health = Math.min(nextSource.maxHealth, nextSource.health + dealt);
            } else if (ruleType === 'affliction' || ruleType === 'bleeding' || ruleType === 'dot') {
              const effectType = ruleType;
              const duration = effectType === 'affliction'
                ? nextSkill.afflictionDuration || 1
                : effectType === 'bleeding' ? nextSkill.bleedingDuration || 1 : nextSkill.dotDuration || 1;
              const existing = offensiveTarget.activeEffects.find(effect =>
                effect.type === effectType && effect.sourceSkillName === nextSkill.name,
              );
              if (existing) {
                existing.value = rule.damageBoost;
                existing.duration = duration;
              } else {
                offensiveTarget.activeEffects.push({
                  name: nextSkill.name,
                  type: effectType,
                  value: rule.damageBoost,
                  duration,
                  damageType: effectType,
                  delayTurns: effectType === 'affliction'
                    ? nextSkill.afflictionDelay
                    : effectType === 'bleeding' ? nextSkill.bleedingDelay : undefined,
                  casterId: nextSource.id,
                  casterSide: intent.side,
                  sourceSkillName: nextSkill.name,
                  castTurn: nextState.turn,
                  irremovable: effectType === 'affliction'
                    ? nextSkill.afflictionIrremovable
                    : effectType === 'bleeding' ? nextSkill.bleedingIrremovable : nextSkill.dotIrremovable,
                });
              }
            }
          }
        }
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
    const guardTargets = effectTargets(
      skill.shieldTarget || 'Self',
      nextSource,
      nextTarget,
      nextSourceTeam.filter(combatant => !combatant.isDead),
      (intent.side === 'player' ? nextState.enemy : nextState.player).filter(combatant => !combatant.isDead),
      [...nextState.player, ...nextState.enemy].filter(combatant => !combatant.isDead),
      nextSkill,
    );
    for (const guardTarget of guardTargets) {
      guardTarget.activeEffects.push({
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
      if (!skill.invisible && !(skill.invisibleDuration || 0)) {
        events.push({
          type: 'combat-text',
          targetId: guardTarget.id,
          text: `GUARD (-${skill.damageReductionVal})`,
          floatingType: 'effect',
        });
      }
    }
  }

  const activeDamageRules = (nextSkill.damageRules || []).filter(rule =>
    rule.activeSkillName && rule.damageBoost > 0 &&
    [...nextState.player, ...nextState.enemy].some(combatant =>
      hasEffectWithName(combatant, rule.activeSkillName!),
    ),
  );
  const configuredSkill: Skill = {
    ...nextSkill,
    stunTurns: isOffensiveTarget ? triggeredSkillUseEffects.reduce((turns, effect) =>
      Math.max(turns, effect.opponentSkillUseRule?.stunOnStun || 0), nextSkill.stunTurns || 0)
      : nextSkill.stunTurns,
    stunType: isOffensiveTarget && triggeredSkillUseEffects.some(effect =>
      (effect.opponentSkillUseRule?.stunOnStun || 0) > 0,
    ) ? ['physical', 'mental', 'affliction', 'chakra'] : nextSkill.stunType,
    afflictionVal: activeDamageRules.some(rule =>
      rule.damageType === 'affliction' && rule.ignoreBaseDamage,
    ) ? 0 : nextSkill.afflictionVal,
    bleedingVal: activeDamageRules.some(rule =>
      rule.damageType === 'bleeding' && rule.ignoreBaseDamage,
    ) ? 0 : nextSkill.bleedingVal,
    dotVal: activeDamageRules.some(rule =>
      rule.damageType === 'dot' && rule.ignoreBaseDamage,
    ) ? 0 : nextSkill.dotVal,
  };
  const afflictionDamage = configuredSkill.afflictionDelay
    ? 0
    : configuredSkill.afflictionInstant && configuredSkill.afflictionInstant > 0
      ? configuredSkill.afflictionInstant
      : configuredSkill.afflictionVal || 0;
  if (afflictionDamage > 0) {
    const afflictionTargets = effectTargets(
      configuredSkill.afflictionTarget || 'Target',
      nextSource,
      nextTarget,
      nextSourceTeam.filter(combatant => !combatant.isDead),
      (intent.side === 'player' ? nextState.enemy : nextState.player).filter(combatant => !combatant.isDead),
      [...nextState.player, ...nextState.enemy].filter(combatant => !combatant.isDead),
      configuredSkill,
    );
    for (const afflictionTarget of afflictionTargets) {
      if (afflictionTarget.isDead) continue;
      events.push(...applyDamage(afflictionTarget, {
        ...configuredSkill,
        damage: afflictionDamage,
        directDamage: 0,
      }, nextState.turn, nextSource));
      if (!configuredSkill.invisible && !(configuredSkill.invisibleDuration || 0)) {
        events.push({
          type: 'combat-text',
          targetId: afflictionTarget.id,
          text: `AFLIÇÃO (-${afflictionDamage} HP)`,
          floatingType: 'effect',
        });
      }
    }
  }
  events.push(...applyConfiguredEffects(
    nextSource,
    nextTarget,
    configuredSkill,
    nextState.turn,
    intent.side,
    nextSourceTeam.filter(combatant => !combatant.isDead),
    (intent.side === 'player' ? nextState.enemy : nextState.player).filter(combatant => !combatant.isDead),
    [...nextState.player, ...nextState.enemy].filter(combatant => !combatant.isDead),
  ));
  if (isOffensiveTarget) {
    nextSource.activeEffects = nextSource.activeEffects.filter(effect =>
      effect.opponentSkillUseTriggered !== true,
    );
  }
  if ((nextSkill.reviveHp || 0) > 0 && nextSkill.reviveOnDeath !== false) {
    const existing = nextSource.activeEffects.find(effect => effect.type === 'revive_on_death');
    if (existing) {
      existing.stacks = (existing.stacks || 1) + 1;
      existing.value = nextSkill.reviveHp;
    } else {
      nextSource.activeEffects.push({
        name: `${nextSkill.name} (Ressurreição)`,
        type: 'revive_on_death',
        value: nextSkill.reviveHp,
        stacks: 1,
        duration: 99999,
        sourceSkillName: nextSkill.name,
        casterId: nextSource.id,
        casterSide: intent.side,
      });
    }
  }
  if ((nextSkill.skillCopyDuration || 0) > 0) {
    const copyTargets = nextSkill.skillCopyTarget === 'Enemy'
      ? [nextTarget].filter(combatant =>
        !combatant.isDead && combatant.id !== nextSource.id && combatant.character.skills.length > 0,
      )
      : effectTargets(
        nextSkill.skillCopyTarget || 'AnyLiving',
        nextSource,
        nextTarget,
        nextSourceTeam,
        intent.side === 'player' ? nextState.enemy : nextState.player,
        [...nextState.player, ...nextState.enemy],
        nextSkill,
      ).filter(combatant => combatant.id !== nextSource.id && combatant.character.skills.length > 0);
    const copyTarget = copyTargets[0];
    if (copyTarget) {
      const currentCopy = nextSource.activeEffects.find(effect => effect.type === 'skill_copy');
      const originalSkills = currentCopy?.storedSkills
        ? currentCopy.storedSkills.map(candidate => ({ ...candidate }))
        : nextSource.character.skills.map(candidate => ({ ...candidate }));
      let copiedSkills = copyTarget.character.skills.map(candidate => ({ ...candidate }));
      if (nextSkill.skillCopyRandom && copiedSkills.length > 0) {
        const copiedIndex = (nextState.turn + intent.skillIndex) % copiedSkills.length;
        const replacement = copiedSkills[copiedIndex];
        const originalIndex = originalSkills.findIndex(candidate => candidate.name === nextSkill.name);
        copiedSkills = originalSkills.map(candidate => ({ ...candidate }));
        if (originalIndex >= 0) copiedSkills[originalIndex] = { ...replacement };
      }
      nextSource.character.skills = copiedSkills;
      if (currentCopy) nextSource.activeEffects = nextSource.activeEffects.filter(effect => effect !== currentCopy);
      nextSource.activeEffects.push({
        name: `${nextSkill.name} (Cópia de Habilidades)`,
        type: 'skill_copy',
        duration: nextSkill.permanent ? 99999 : Math.max(1, nextSkill.skillCopyDuration),
        sourceSkillName: nextSkill.name,
        casterId: nextSource.id,
        casterSide: intent.side,
        castTurn: nextState.turn,
        storedSkills: originalSkills,
      });
      events.push({
        type: 'skill-copy',
        sourceId: nextSource.id,
        targetId: copyTarget.id,
        skillName: nextSkill.name,
      });
    }
  }
  if (nextSkill.reviveDeadAllies) {
    for (const ally of nextSourceTeam) {
      if (!ally.isDead) continue;
      ally.isDead = false;
      ally.health = Math.min(ally.maxHealth, Math.max(1, nextSkill.reviveHealth || 1));
      ally.hasRevived = true;
      events.push({ type: 'revive', targetId: ally.id, health: ally.health });
    }
  }
  if ((nextSkill.deathLinkDuration || 0) > 0 && nextTarget.id !== nextSource.id) {
    const duration = nextSkill.deathLinkDuration;
    nextSource.activeEffects.push({
      name: `${nextSkill.name} (Vínculo)`,
      type: 'death_link',
      duration,
      targetId: nextTarget.id,
      sourceSkillName: nextSkill.name,
      casterId: nextSource.id,
      casterSide: intent.side,
      castTurn: nextState.turn,
    });
    nextTarget.activeEffects.push({
      name: `${nextSkill.name} (Vínculo)`,
      type: 'death_link',
      duration,
      targetId: nextSource.id,
      sourceSkillName: nextSkill.name,
      casterId: nextSource.id,
      casterSide: intent.side,
      castTurn: nextState.turn,
    });
  }
  for (const rule of nextSkill.killWhenActiveRules || []) {
    if (!rule.activeSkillName ||
      !hasEffectWithName(nextTarget, rule.activeSkillName) ||
      (rule.killHpThreshold !== undefined && nextTarget.health > rule.killHpThreshold)) continue;
    nextTarget.health = 0;
    nextTarget.isDead = true;
    nextTarget.activeEffects = [];
    if (rule.killScope === 'self_and_target') {
      nextSource.health = 0;
      nextSource.isDead = true;
      nextSource.activeEffects = [];
    }
  }
  if ((nextSkill.friendlyDamageVal || 0) > 0) {
    const targets = effectTargets(
      nextSkill.friendlyDamageTarget || 'Self',
      nextSource,
      nextTarget,
      nextSourceTeam.filter(combatant => !combatant.isDead),
      (intent.side === 'player' ? nextState.enemy : nextState.player)
        .filter(combatant => !combatant.isDead),
      [...nextState.player, ...nextState.enemy].filter(combatant => !combatant.isDead),
      nextSkill,
    );
    for (const friendlyTarget of targets) {
      const type = nextSkill.friendlyDamageType || 'damage';
      const effectType = type === 'direct_damage' ? 'direct_damage' : type;
      if (['dot', 'bleeding', 'affliction'].includes(effectType)) {
        friendlyTarget.activeEffects.push({
          name: `${nextSkill.name} (Dano Próprio)`,
          type: effectType as 'dot' | 'bleeding' | 'affliction',
          value: nextSkill.friendlyDamageVal,
          duration: nextSkill.friendlyDamageDuration || 1,
          casterId: nextSource.id,
          casterSide: intent.side,
          sourceSkillName: nextSkill.name,
          castTurn: nextState.turn,
          cantKill: nextSkill.friendlyDamageCantKill,
        });
      } else {
        events.push(...applyDamage(friendlyTarget, {
          ...nextSkill,
          damage: type === 'damage' ? nextSkill.friendlyDamageVal : 0,
          directDamage: type === 'direct_damage' ? nextSkill.friendlyDamageVal : 0,
        }, nextState.turn, nextSource));
        if (nextSkill.friendlyDamageCantKill && friendlyTarget.isDead) {
          friendlyTarget.isDead = false;
          friendlyTarget.health = 1;
        }
      }
    }
  }
  resolveDeathLinks(nextState);

  const livingCombatants = [...nextState.player, ...nextState.enemy]
    .filter(combatant => !combatant.isDead);
  const livingAllies = nextSourceTeam.filter(combatant => !combatant.isDead);
  const livingEnemies = (intent.side === 'player' ? nextState.enemy : nextState.player)
    .filter(combatant => !combatant.isDead);
  for (const chakraTarget of effectTargets(
    nextSkill.gainChakraTarget || 'Self',
    nextSource,
    nextTarget,
    livingAllies,
    livingEnemies,
    livingCombatants,
    nextSkill,
  )) {
    if ((nextSkill.gainChakra || 0) <= 0 || chakraTarget.isDead) continue;
    if ((nextSkill.gainChakraDuration || 1) > 1) {
      chakraTarget.activeEffects.push({
        name: `Fluxo de Chakra (${nextSkill.name})`,
        type: 'gain_chakra',
        value: nextSkill.gainChakra,
        duration: nextSkill.gainChakraDuration || 1,
        gainChakraTypes: nextSkill.gainChakraTypes,
        casterId: nextSource.id,
        casterSide: intent.side,
        sourceSkillName: nextSkill.name,
        castTurn: nextState.turn,
      });
    } else {
      const pool = chakraTarget.id.startsWith('player-')
        ? nextState.playerChakra
        : nextState.enemyChakra;
      addChakra(pool, nextSkill.gainChakra || 0, nextSkill.gainChakraTypes,
        `${nextState.turn}-${nextSource.id}-${nextSkill.name}`);
    }
  }

  const chakraActions = [
    {
      amount: nextSkill.drainChakra || 0,
      duration: nextSkill.drainChakraDuration || 1,
      selector: nextSkill.drainChakraTarget || 'Target',
      type: 'drain_chakra' as const,
    },
    {
      amount: nextSkill.removeChakra || 0,
      duration: nextSkill.removeChakraDuration || 1,
      selector: nextSkill.removeChakraTarget || 'Target',
      type: 'remove_chakra' as const,
    },
    {
      amount: nextSkill.stealChakra || 0,
      duration: nextSkill.stealChakraDuration || 1,
      selector: nextSkill.stealChakraTarget || 'Target',
      type: 'steal_chakra' as const,
    },
  ];
  for (const chakraAction of chakraActions) {
    if (chakraAction.amount <= 0) continue;
    for (const chakraTarget of effectTargets(
      chakraAction.selector,
      nextSource,
      nextTarget,
      livingAllies,
      livingEnemies,
      livingCombatants,
      nextSkill,
    )) {
      if (chakraTarget.isDead) continue;
      const mode = chakraAction.type === 'drain_chakra'
        ? 'drain'
        : chakraAction.type === 'steal_chakra' ? 'steal' : 'remove';
      const changedTypes = changeChakra(nextState, nextSource, chakraTarget, chakraAction.amount, mode);
      events.push({
        type: 'chakra-manipulation',
        mode,
        sourceId: nextSource.id,
        targetId: chakraTarget.id,
        amount: changedTypes.length,
        chakraTypes: changedTypes,
      });
      if (chakraAction.duration > 1) {
        chakraTarget.activeEffects.push({
          name: `${chakraAction.type} (${nextSkill.name})`,
          type: chakraAction.type,
          value: chakraAction.amount,
          duration: chakraAction.duration - 1,
          casterId: nextSource.id,
          casterSide: intent.side,
          sourceSkillName: nextSkill.name,
          castTurn: nextState.turn,
        });
      }
    }
  }

  for (const rule of nextSkill.chakraRemoveRules || []) {
    const required = rule.activeSkillName?.toLowerCase();
    if (!required || rule.removeAmount <= 0 ||
      !activeNames.some(name => name === required || name.includes(required) || required.includes(name))) {
      continue;
    }
    const eligible = livingEnemies.find(combatant =>
      !checkCombatantInvulnerable(combatant, nextSkill, nextSource),
    );
    if (eligible) {
      const changedTypes = changeChakra(nextState, nextSource, eligible, rule.removeAmount, 'remove');
      events.push({
        type: 'chakra-manipulation',
        mode: 'remove',
        sourceId: nextSource.id,
        targetId: eligible.id,
        amount: changedTypes.length,
        chakraTypes: changedTypes,
      });
    }
  }
  for (const rule of nextSkill.chakraStealRules || []) {
    const required = rule.activeSkillName?.toLowerCase();
    if (!required || rule.chakraAmount <= 0 ||
      !nextSource.activeEffects.some(effect => effect.name.toLowerCase().includes(required))) {
      continue;
    }
    const eligible = livingEnemies.find(combatant =>
      !combatant.isDead &&
      (rule.ignoreInvulnerable || !checkCombatantInvulnerable(combatant, 'chakra', nextSource)),
    );
    if (eligible) {
      const changedTypes = changeChakra(nextState, nextSource, eligible, rule.chakraAmount, 'steal');
      events.push({
        type: 'chakra-manipulation',
        mode: 'steal',
        sourceId: nextSource.id,
        targetId: eligible.id,
        amount: changedTypes.length,
        chakraTypes: changedTypes,
      });
    }
  }

  const causesChakraManipulation = (nextSkill.drainChakra || 0) > 0 ||
    (nextSkill.removeChakra || 0) > 0 || (nextSkill.stealChakra || 0) > 0 ||
    (nextSkill.chakraRemoveRules?.length || 0) > 0 ||
    (nextSkill.chakraStealRules?.length || 0) > 0;
  const causesDamage = effectiveDamage.damage > 0 || effectiveDamage.directDamage > 0 ||
    (nextSkill.afflictionVal || 0) > 0 || (nextSkill.dotVal || 0) > 0 ||
    (nextSkill.bleedingVal || 0) > 0 || (nextSkill.stealLifeVal || 0) > 0;
  const causesStun = (nextSkill.stunTurns || 0) > 0;
  for (const observedEffect of observedSkillUseEffects) {
    const rule = observedEffect.opponentSkillUseRule!;
    const owner = [...nextState.player, ...nextState.enemy]
      .find(combatant => combatant.id === observedEffect.casterId);
    if (!owner || owner.isDead) continue;
    if (causesChakraManipulation && (rule.chakraGainOnChakraManipulation || 0) > 0) {
      const ownerPool = owner.id.startsWith('player-')
        ? nextState.playerChakra
        : nextState.enemyChakra;
      addChakra(
        ownerPool,
        rule.chakraGainOnChakraManipulation || 0,
        undefined,
        `${nextState.turn}-${nextSource.id}-${nextSkill.name}-${owner.id}`,
      );
    }
    const damageBonus = causesDamage ? rule.damageBuffOnDamage || 0 : 0;
    const stunTurns = causesStun ? rule.stunOnStun || 0 : 0;
    if (damageBonus > 0 || stunTurns > 0) {
      owner.activeEffects.push({
        name: `${observedEffect.name} (gatilho)`,
        type: 'on_skill_use_damage',
        duration: 1,
        sourceSkillName: observedEffect.sourceSkillName,
        casterId: owner.id,
        casterSide: observedEffect.casterSide,
        castTurn: nextState.turn,
        opponentSkillUseTriggered: true,
        opponentSkillUseRule: {
          duration: 1,
          damageBuffOnDamage: damageBonus,
          stunOnStun: stunTurns,
        },
      });
    }
  }

  if ((nextSkill.stealLifeVal || 0) > 0 && !nextTarget.isDead &&
    !checkCombatantInvulnerable(nextTarget, 'life_steal', nextSource)) {
    const initialHealth = nextTarget.health;
    applyDamage(nextTarget, {
      ...nextSkill,
      damage: nextSkill.stealLifeVal || 0,
      directDamage: 0,
    }, nextState.turn, nextSource);
    const loss = Math.max(0, initialHealth - nextTarget.health);
    nextSource.health = hasImmortalEffect(nextSource)
      ? Math.min(nextSource.maxHealth, nextSource.health + loss)
      : Math.min(nextSource.maxHealth, nextSource.health + loss);
    if ((nextSkill.stealLifeDuration || 1) > 1 && !nextTarget.isDead) {
      nextTarget.activeEffects.push({
        name: `Life steal (${nextSkill.name})`,
        type: 'life_steal',
        value: nextSkill.stealLifeVal,
        duration: (nextSkill.stealLifeDuration || 1) - 1,
        casterId: nextSource.id,
        casterSide: intent.side,
        sourceSkillName: nextSkill.name,
        castTurn: nextState.turn,
      });
    }
  }

  const cleansesDebuffs = nextSkill.cleanseDebuffs === true ||
    (nextSkill.cleanseDebuffTypes?.length || 0) > 0;
  const cleansesBuffs = nextSkill.cleanseBuffs === true ||
    (nextSkill.cleanseBuffTypes?.length || 0) > 0;
  if (cleansesDebuffs || cleansesBuffs) {
    const cleanseTargets = effectTargets(
      nextSkill.cleanseDebuffTarget || nextSkill.cleanseBuffTarget || 'Target',
      nextSource,
      nextTarget,
      livingAllies,
      livingEnemies,
      livingCombatants,
      nextSkill,
    );
    for (const cleanseTarget of cleanseTargets) {
      cleanseTarget.activeEffects = cleanseTarget.activeEffects.filter(effect => {
        const isBuff = ['damage_buff', 'damage_reduction', 'damage_reduction_pierce',
          'invulnerable', 'ignore_stun', 'damage_immunity', 'shield'].includes(effect.type);
        const isDebuff = ['damage_debuff', 'stun', 'dot', 'bleeding', 'affliction',
          'damage_vulnerability', 'blocks_offensive_skills', 'cannot_be_invulnerable',
          'cannot_receive_friendly', 'negate_friendly_effects', 'paralyze_cooldown'].includes(effect.type);
        const removeBuff = cleansesBuffs && isBuff &&
          (!nextSkill.cleanseBuffTypes?.length || nextSkill.cleanseBuffTypes.includes(effect.type));
        const removeDebuff = cleansesDebuffs && isDebuff &&
          (!nextSkill.cleanseDebuffTypes?.length || nextSkill.cleanseDebuffTypes.includes(effect.type));
        return !(removeBuff || removeDebuff) || effect.irremovable === true;
      });
    }
  }

  nextSource.skillUseCounts = {
    ...nextSource.skillUseCounts,
    [nextSkill.name]: (nextSource.skillUseCounts?.[nextSkill.name] || 0) + 1,
  };
  nextSource.currentTurnSkills = [...new Set([
    ...(nextSource.currentTurnSkills || []),
    nextSkill.name,
  ])];

  for (const rule of nextSkill.cooldownReduceRules || []) {
    const required = rule.activeSkillName?.trim().toLowerCase();
    if (!rule.targetSkillName || rule.reduceAmount <= 0 ||
      (required && required !== nextSkill.name.trim().toLowerCase() &&
        ![...nextSourceTeam, ...livingAllies].some(combatant =>
          combatant.activeEffects.some(effect =>
            effect.name.toLowerCase().includes(required),
          ),
        ))) continue;
    const name = rule.targetSkillName.trim().toLowerCase();
    const targetSkill = [...nextSourceTeam, ...livingAllies]
      .flatMap(combatant => combatant.character.skills)
      .find(candidate => candidate.name.trim().toLowerCase() === name);
    if (targetSkill && targetSkill.currentCooldown > 0) {
      targetSkill.currentCooldown = Math.max(0, targetSkill.currentCooldown - rule.reduceAmount);
    }
  }

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

export function tickAuthoritativeCombatEffects(
  state: CombatEngineState,
  casterSide: 'player' | 'enemy',
): void {
  const combatants = [...state.player, ...state.enemy];
  for (const target of combatants) {
    if (target.isDead) continue;
    for (const effect of [...target.activeEffects]) {
      if (effect.casterSide !== casterSide || effect.castTurn === state.turn) continue;
      if (effect.delayTurns && effect.delayTurns > 0) {
        effect.delayTurns -= 1;
        continue;
      }
      if (effect.type === 'pending_invulnerable') {
        target.activeEffects = target.activeEffects.filter(candidate => candidate !== effect);
        target.activeEffects.push({
          name: effect.name,
          type: 'invulnerable',
          duration: effect.pendingInvulnDuration || 1,
          invulnerableTypes: effect.invulnerableTypes,
          invulnerableClasses: effect.invulnerableClasses,
          casterId: effect.casterId,
          casterSide: effect.casterSide,
          sourceSkillName: effect.sourceSkillName,
          castTurn: state.turn,
          skipCastTurnDecrement: true,
        });
        continue;
      }
      if (effect.type === 'custom' && effect.name === 'WoodSpirePunish') {
        const usedOffensiveSkill = (target.previousTurnSkills || []).some(skillName => {
          const usedSkill = target.character.skills.find(candidate => candidate.name === skillName);
          return !!usedSkill && (
            usedSkill.targetType === 'Enemy' || usedSkill.targetType === 'AllEnemies' ||
            (usedSkill.damage || 0) > 0 || (usedSkill.directDamage || 0) > 0 ||
            (usedSkill.afflictionVal || 0) > 0 || (usedSkill.dotVal || 0) > 0 ||
            (usedSkill.bleedingVal || 0) > 0
          );
        });
        const caster = combatants.find(combatant => combatant.id === effect.casterId);
        if (!usedOffensiveSkill && caster && (effect.value || 0) > 0) {
          const skill = caster.character.skills.find(candidate =>
            candidate.name === effect.sourceSkillName,
          );
          if (skill) applyDamage(target, { ...skill, damage: effect.value, directDamage: 0 }, state.turn, caster);
        }
        continue;
      }
      if (effect.type === 'gain_chakra') {
        const pool = target.id.startsWith('player-') ? state.playerChakra : state.enemyChakra;
        addChakra(pool, effect.value || 0, effect.gainChakraTypes,
          `${state.turn}-${effect.casterId || ''}-${effect.sourceSkillName || ''}`);
        continue;
      }
      if (effect.type === 'heal_over_time') {
        target.health = Math.min(target.maxHealth, target.health + (effect.value || 0));
        continue;
      }
      if (effect.type === 'shield' && effect.regenPerTurn) {
        const cap = effect.regenMaxVal && effect.regenMaxVal > 0
          ? effect.regenMaxVal
          : Number.POSITIVE_INFINITY;
        target.shield = Math.min(cap, target.shield + (effect.value || 0));
        continue;
      }
      if (effect.type === 'drain_chakra' || effect.type === 'remove_chakra' ||
        effect.type === 'steal_chakra') {
        const caster = combatants.find(combatant => combatant.id === effect.casterId);
        if (!caster || checkCombatantInvulnerable(target, 'chakra', caster)) continue;
        const mode = effect.type === 'drain_chakra'
          ? 'drain'
          : effect.type === 'steal_chakra' ? 'steal' : 'remove';
        changeChakra(state, caster, target, effect.value || 0, mode);
        continue;
      }
      const isDamageEffect = effect.type === 'damage' || effect.type === 'direct_damage' ||
        effect.type === 'dot' || effect.type === 'bleeding' || effect.type === 'affliction' ||
        effect.type === 'life_steal';
      if (!isDamageEffect || (effect.value || 0) <= 0) continue;
      const caster = combatants.find(combatant => combatant.id === effect.casterId);
      if (caster && checkCombatantInvulnerable(target, effect.type, caster)) continue;
      const skill = caster?.character.skills.find(candidate =>
        candidate.name === effect.sourceSkillName,
      ) || ({
        name: effect.name,
        desc: '',
        icon: effect.icon || '',
        cost: [],
        cooldown: 0,
        currentCooldown: 0,
        targetType: 'Enemy',
        classes: effect.type === 'affliction' ? ['affliction'] : [effect.type],
      } satisfies Skill);
      const beforeHealth = target.health;
      const directDamage = effect.type === 'direct_damage' ? effect.value || 0 : 0;
      const damage = directDamage ? 0 : effect.value || 0;
      applyDamage(target, { ...skill, damage, directDamage }, state.turn, caster);
      if (effect.type === 'life_steal' && caster) {
        const actualDamage = Math.max(0, beforeHealth - target.health);
        caster.health = Math.min(caster.maxHealth, caster.health + actualDamage);
      }
    }
  }
  if (state.player.every(combatant => combatant.isDead)) state.winnerSide = 'enemy';
  else if (state.enemy.every(combatant => combatant.isDead)) state.winnerSide = 'player';
}
