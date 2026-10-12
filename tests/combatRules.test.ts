import assert from 'node:assert/strict';
import test from 'node:test';
import type { ActiveEffect, Character, CombatCharacter, Skill } from '../src/types';
import {
  checkCombatantInvulnerable,
  hasTotalInvulnerability,
  isOffensiveSkill,
  isSkillBlockedByDelayedUnlock,
  isSkillBlockedByStun,
} from '../src/lib/combatRules';

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'Test Skill',
    desc: '',
    icon: '',
    cost: [],
    cooldown: 0,
    currentCooldown: 0,
    targetType: 'Enemy',
    classes: ['Physical'],
    ...overrides,
  };
}

function effect(overrides: Partial<ActiveEffect> = {}): ActiveEffect {
  return {
    name: 'Test Effect',
    type: 'stun',
    duration: 1,
    ...overrides,
  };
}

function combatant(activeEffects: ActiveEffect[] = []): CombatCharacter {
  const character: Character = {
    id: 'test-character',
    name: 'Test Character',
    description: '',
    tags: [],
    skills: [],
    portrait: '',
    folder: '',
  };
  return {
    id: 'player-0',
    character,
    health: 100,
    maxHealth: 100,
    shield: 0,
    activeEffects,
    isDead: false,
  };
}

test('classifies offensive and friendly skill targets consistently', () => {
  assert.equal(isOffensiveSkill(skill()), true);
  assert.equal(isOffensiveSkill(skill({ targetType: 'AllEnemies' })), true);
  assert.equal(isOffensiveSkill(skill({ targetType: 'Self' })), false);
  assert.equal(isOffensiveSkill(skill({ targetType: 'Ally' })), false);
  assert.equal(isOffensiveSkill(null), false);
});

test('applies full, typed, and offensive-only stun rules', () => {
  assert.equal(isSkillBlockedByStun(skill(), [effect()]), true);
  assert.equal(isSkillBlockedByStun(skill({ classes: ['Mental'] }), [effect({ stunType: ['physical'] })]), false);
  assert.equal(isSkillBlockedByStun(skill({ classes: ['Taijutsu'] }), [effect({ stunType: ['physical'] })]), true);
  assert.equal(isSkillBlockedByStun(skill({ targetType: 'Self' }), [effect({ blocksOffensiveSkills: true })]), false);
  assert.equal(isSkillBlockedByStun(skill({ cannotBeStunned: true }), [effect()]), false);
  assert.equal(isSkillBlockedByStun(skill(), [effect(), effect({ type: 'ignore_stun' })]), false);
  assert.equal(isSkillBlockedByStun(skill(), []), false);
});

test('blocks delayed skills only during their locked phase', () => {
  const delayed = effect({
    type: 'custom',
    delayedUnlockSkills: ['Test Skill'],
    delayedUnlockPhase: 'locked',
  });
  assert.equal(isSkillBlockedByDelayedUnlock(skill(), [delayed]), true);
  assert.equal(isSkillBlockedByDelayedUnlock(skill({ name: 'Other' }), [delayed]), false);
  assert.equal(isSkillBlockedByDelayedUnlock(skill(), [{ ...delayed, delayedUnlockPhase: 'window' }]), false);
  assert.equal(isSkillBlockedByDelayedUnlock(null, [delayed]), false);
});

test('applies invulnerability types, protected classes, and bypass conditions', () => {
  const physicalGuard = combatant([effect({
    type: 'invulnerable',
    invulnerableTypes: ['physical'],
  })]);
  assert.equal(checkCombatantInvulnerable(physicalGuard, skill({ classes: ['Physical'] })), true);
  assert.equal(checkCombatantInvulnerable(physicalGuard, skill({ classes: ['Mental'] })), false);

  const classGuard = combatant([effect({
    type: 'invulnerable',
    invulnerableClasses: ['physical'],
    invulnerableTypes: [],
  })]);
  assert.equal(checkCombatantInvulnerable(classGuard, skill({ classes: ['Physical'] })), true);
  assert.equal(checkCombatantInvulnerable(classGuard, skill({ classes: ['Mental'] })), false);

  assert.equal(
    checkCombatantInvulnerable(combatant([effect({ type: 'invulnerable' }), effect({ type: 'cannot_be_invulnerable' })]), skill()),
    false,
  );
  assert.equal(
    checkCombatantInvulnerable(combatant([effect({ type: 'invulnerable' }), effect({ type: 'negate_friendly_effects' })]), skill()),
    false,
  );
  assert.equal(
    checkCombatantInvulnerable(
      combatant([effect({ type: 'invulnerable' }), effect({ name: 'Mark', type: 'custom' })]),
      skill({ ignoreInvulnWhenActiveRules: [{ activeSkillName: 'Mark' }] }),
    ),
    false,
  );
});

test('treats total invulnerability as disabled by explicit counters', () => {
  assert.equal(hasTotalInvulnerability(combatant([effect({ type: 'invulnerable', invulnerableTotal: true })])), true);
  assert.equal(hasTotalInvulnerability(combatant([
    effect({ type: 'invulnerable', invulnerableTotal: true }),
    effect({ type: 'cannot_be_invulnerable' }),
  ])), false);
  assert.equal(hasTotalInvulnerability(combatant([
    effect({ type: 'invulnerable', invulnerableTotal: true }),
    effect({ type: 'negate_friendly_effects' }),
  ])), false);
});
