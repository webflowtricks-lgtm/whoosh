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
    if (SUPPORTED_SKILL_FIELDS.has(field) || value == null || value === false || value === 0 || value === '') {
      return false;
    }
    return !Array.isArray(value) || value.length > 0;
  });
}

function hasUnsupportedActiveEffects(combatants: CombatCharacter[]): boolean {
  return combatants.some(combatant =>
    combatant.activeEffects.some(effect =>
      !SUPPORTED_ACTIVE_EFFECT_TYPES.has(effect.type) &&
      !(effect.type === 'custom' && effect.stackable === true && !!effect.stackType),
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
): CombatEngineEvent[] {
  const events: CombatEngineEvent[] = [];
  if ((skill.heal || 0) > 0) {
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

  if ((skill.shieldVal || 0) > 0) {
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

function applyDamage(
  target: CombatCharacter,
  skill: Skill,
  turn: number,
): CombatEngineEvent[] {
  const direct = (skill.directDamage || 0) > 0;
  const damageType = direct ? 'direct_damage' : 'damage';
  const incomingTypes = direct
    ? ['direct_damage', 'piercing']
    : ['damage', ...getSkillCombatTypes(skill)];
  let damage = direct ? skill.directDamage || 0 : skill.damage || 0;

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
  const isAttack = (skill.damage || 0) > 0 || (skill.directDamage || 0) > 0;
  const isFriendlyAction = (skill.heal || 0) > 0 || (skill.shieldVal || 0) > 0;
  if (isAttack && isFriendlyAction) return result('unsupported', 'combined-offense-and-support-not-ported', state);

  if (targetType !== 'Enemy' && targetType !== 'Self' && targetType !== 'Ally' && targetType !== 'AllAllies') {
    return result('unsupported', 'target-type-not-ported', state);
  }
  if ((targetType === 'Enemy' && !isAttack) || (targetType !== 'Enemy' && !isFriendlyAction)) {
    return result('unsupported', 'target-type-effect-combination-not-ported', state);
  }

  const selectableTeam = targetType === 'Enemy' ? opposingTeam : sourceTeam;
  const target = selectableTeam.find(combatant => combatant.id === intent.targetId);
  if (!target || target.isDead) return result('rejected', 'invalid-target', state);
  if (targetType === 'Self' && target.id !== source.id) {
    return result('rejected', 'invalid-target', state);
  }
  if (isAttack && checkCombatantInvulnerable(target, skill, source)) {
    return result('rejected', 'target-invulnerable', state);
  }
  if (!isAttack && !isFriendlyAction) {
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
  const friendlyTargets = targetType === 'AllAllies'
    ? nextSourceTeam.filter(combatant => !combatant.isDead)
    : [nextTarget];
  const nextSkill = nextSource.character.skills[intent.skillIndex];
  nextSkill.currentCooldown = effectiveCooldown;
  if (intent.side === 'player') nextState.playerChakra = newChakraPool;
  else nextState.enemyChakra = newChakraPool;

  const events: CombatEngineEvent[] = [
    { type: 'chakra-spent', side: intent.side, chakra: { ...newChakraPool } },
    ...(isAttack
      ? applyDamage(nextTarget, nextSkill, nextState.turn)
      : friendlyTargets.flatMap(friendlyTarget =>
        applyFriendlyEffects(nextSource, friendlyTarget, nextSkill, nextState.turn),
      )),
  ];
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
