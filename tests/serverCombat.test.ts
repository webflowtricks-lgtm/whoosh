import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Character } from '../src/types';
import { firstSlotForTurn } from '../src/lib/matchProtocol';
import {
  advanceAuthoritativeTurn,
  createServerCombatState,
  resolveAuthoritativeActions,
  resolveAuthoritativeTurn,
  validateAuthoritativeActions,
} from '../workers/serverCombat';
import { resolveCombatIntent } from '../src/lib/combatEngine';

const catalog = JSON.parse(
  readFileSync(new URL('../src/data/custom_characters.json', import.meta.url), 'utf8'),
) as Character[];

function findCharacter(name: string): Character {
  const character = catalog.find(candidate => candidate.name === name);
  assert.ok(character, `Expected ${name} in the production catalog`);
  return structuredClone(character);
}

function findSkill(character: Character, name: string): number {
  const index = character.skills.findIndex(skill => skill.name === name);
  assert.notEqual(index, -1, `Expected ${name} on ${character.name}`);
  return index;
}

function team(character: Character): Character[] {
  return [structuredClone(character), findCharacter('Sakura Haruno'), findCharacter('Shiranui Genma')];
}

test('initializes canonical teams, initiative chakra, and seeded turn generation', () => {
  const seed = 8421;
  const state = createServerCombatState([
    team(findCharacter('Tenten')),
    team(findCharacter('Gaara of the Sand')),
  ], seed);
  const leader = firstSlotForTurn(seed, 1);
  const firstPool = leader === 0 ? state.playerChakra : state.enemyChakra;
  const secondPool = leader === 0 ? state.enemyChakra : state.playerChakra;
  const sum = (pool: typeof state.playerChakra) => pool.Tai + pool.Nin + pool.Gen + pool.Blood;

  assert.equal(sum(firstPool), 1);
  assert.equal(sum(secondPool), 3);
  assert.deepEqual(
    createServerCombatState([team(findCharacter('Tenten')), team(findCharacter('Gaara of the Sand'))], seed),
    state,
  );
  assert.deepEqual(state.player.map(character => character.id), ['player-0', 'player-1', 'player-2']);
  assert.deepEqual(state.enemy.map(character => character.id), ['enemy-0', 'enemy-1', 'enemy-2']);
});

test('resolves both player perspectives in initiative order without trusting reported HP', () => {
  const seed = 8421;
  const tenten = findCharacter('Tenten');
  const enemy = findCharacter('Tenten');
  const state = createServerCombatState([team(tenten), team(enemy)], seed);
  state.playerChakra = { Tai: 5, Nin: 5, Gen: 5, Blood: 5 };
  state.enemyChakra = { Tai: 5, Nin: 5, Gen: 5, Blood: 5 };
  const firstSlot = firstSlotForTurn(seed, 1);
  const firstActions = [{ sourceId: 'player-0', skillIndex: findSkill(tenten, 'Jidanda'), targetId: 'enemy-0' }];
  const secondActions = [{ sourceId: 'player-0', skillIndex: findSkill(enemy, 'Jidanda'), targetId: 'enemy-0' }];
  const submissions: [typeof firstActions, typeof secondActions] = [[], []];
  submissions[firstSlot] = firstActions;
  submissions[firstSlot === 0 ? 1 : 0] = secondActions;

  assert.deepEqual(validateAuthoritativeActions(state, firstSlot, firstActions), { status: 'valid' });
  const resolved = resolveAuthoritativeTurn(state, seed, 1, submissions);

  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.winnerSlot, null);
  assert.equal(resolved.state.turn, 2);
  assert.ok(resolved.state.playerChakra.Tai + resolved.state.playerChakra.Nin +
    resolved.state.playerChakra.Gen + resolved.state.playerChakra.Blood > 0);
  assert.notEqual(resolved.state.enemy[0].health, 100);
  assert.notEqual(resolved.state.player[0].health, 100);
  assert.equal(state.enemy[0].health, 100, 'the source canonical snapshot remains unchanged');
  assert.equal(state.player[0].health, 100, 'the source canonical snapshot remains unchanged');

  const firstPhase = resolveAuthoritativeActions(state, firstSlot, submissions[firstSlot]);
  const secondPhase = resolveAuthoritativeActions(
    firstPhase.state,
    firstSlot === 0 ? 1 : 0,
    submissions[firstSlot === 0 ? 1 : 0],
  );
  const stagedResolved = advanceAuthoritativeTurn(secondPhase.state, seed);
  assert.deepEqual(stagedResolved, resolved, 'staged online resolution matches the complete-turn result');
});

test('publishes the first online action before the responder submits', () => {
  const seed = 8421;
  const naruto = findCharacter('Naruto Uzumaki');
  const state = createServerCombatState([
    team(naruto),
    team(findCharacter('Gaara of the Sand')),
  ], seed);
  state.playerChakra = { Tai: 10, Nin: 10, Gen: 10, Blood: 10 };
  state.enemyChakra = { Tai: 10, Nin: 10, Gen: 10, Blood: 10 };
  const leader = firstSlotForTurn(seed, 1);
  const shadowClones = [{
    sourceId: 'player-0',
    skillIndex: findSkill(naruto, 'Shadow Clones'),
    targetId: 'player-0',
  }];

  const partial = resolveAuthoritativeActions(state, leader, shadowClones);

  assert.equal(partial.status, 'resolved');
  assert.equal(partial.state.turn, 1, 'the turn stays open for the responder');
  assert.ok(partial.state[leader === 0 ? 'player' : 'enemy'][0].activeEffects.some(effect =>
    effect.sourceSkillName === 'Shadow Clones',
  ), 'the submitted buff is already part of the canonical state');
  assert.equal(state.player[0].activeEffects.some(effect =>
    effect.sourceSkillName === 'Shadow Clones',
  ), false, 'the original canonical snapshot is unchanged');

  const response = resolveAuthoritativeActions(partial.state, leader === 0 ? 1 : 0, []);
  assert.equal(response.status, 'resolved');
  const completed = advanceAuthoritativeTurn(response.state, seed);
  assert.equal(completed.state.turn, 2);
});

test('publishes submitted offensive damage while the online turn remains open', () => {
  const seed = 8421;
  const tenten = findCharacter('Tenten');
  const state = createServerCombatState([
    team(tenten),
    team(findCharacter('Gaara of the Sand')),
  ], seed);
  state.playerChakra = { Tai: 10, Nin: 10, Gen: 10, Blood: 10 };
  state.enemyChakra = { Tai: 10, Nin: 10, Gen: 10, Blood: 10 };
  const leader = firstSlotForTurn(seed, 1);
  const action = [{
    sourceId: 'player-0',
    skillIndex: findSkill(tenten, 'Jidanda'),
    targetId: 'enemy-0',
  }];

  const partial = resolveAuthoritativeActions(state, leader, action);

  assert.equal(partial.status, 'resolved');
  assert.equal(partial.state.turn, 1);
  const target = leader === 0 ? partial.state.enemy[0] : partial.state.player[0];
  assert.ok(target.health < 100, 'server-calculated damage is visible after the first submission');
});

test('rejects unknown mechanics at server action validation', () => {
  const seed = 5;
  const teamA = team(findCharacter('ANBU Kakashi'));
  const teamB = team(findCharacter('Gaara of the Sand'));
  const state = createServerCombatState([teamA, teamB], seed);
  const skill = teamA[0].skills.findIndex(candidate => candidate.name === 'Raikiri');
  assert.notEqual(skill, -1);
  Object.assign(state.player[0].character.skills[skill], {
    unportedServerRule: true,
  });
  assert.deepEqual(
    validateAuthoritativeActions(state, 0, [{
      sourceId: 'player-0',
      skillIndex: skill,
      targetId: 'enemy-0',
    }]),
    { status: 'unsupported', code: 'skill-mechanics-not-ported' },
  );
});

test('supports Rock Lee Fifth Gate marker and threshold immortality', () => {
  const lee = findCharacter('Rock Lee');
  const state = createServerCombatState([
    team(lee),
    team(findCharacter('Tenten')),
  ], 21);
  state.playerChakra = { Tai: 5, Nin: 5, Gen: 5, Blood: 5 };
  state.enemyChakra = { Tai: 5, Nin: 5, Gen: 5, Blood: 5 };
  state.player[0].health = 45;
  const fifthGate = findSkill(lee, 'Fifth Gate Opening');

  const activated = resolveCombatIntent(state, {
    side: 'player',
    sourceId: 'player-0',
    skillIndex: fifthGate,
    targetId: 'player-0',
  });
  assert.equal(activated.status, 'applied');
  if (activated.status !== 'applied') return;
  assert.ok(activated.state.player[0].activeEffects.some(effect =>
    effect.sourceSkillName === 'Fifth Gate Opening',
  ));
  assert.deepEqual(
    validateAuthoritativeActions(activated.state, 0, [{
      sourceId: 'player-0',
      skillIndex: fifthGate,
      targetId: 'player-0',
    }]),
    { status: 'rejected', code: 'effect-already-active' },
  );

  const damaged = resolveCombatIntent({
    ...activated.state,
    activeSide: 'enemy',
  }, {
    side: 'enemy',
    sourceId: 'enemy-0',
    skillIndex: findSkill(findCharacter('Tenten'), 'Jidanda'),
    targetId: 'player-0',
  });
  assert.equal(damaged.status, 'applied');
  if (damaged.status !== 'applied') return;
  assert.ok(damaged.state.player[0].health <= 40);
  assert.ok(damaged.state.player[0].health >= 1);
  assert.ok(damaged.state.player[0].activeEffects.some(effect => effect.type === 'immortal'));
  assert.equal(damaged.state.player[0].isDead, false);
});

test('supports Tenten Twin Dragons Defense through the opposing action in the same turn', () => {
  const tenten = findCharacter('Tenten');
  const state = createServerCombatState([
    team(tenten),
    team(findCharacter('Tenten')),
  ], 21);
  state.playerChakra = { Tai: 5, Nin: 5, Gen: 5, Blood: 5 };
  state.enemyChakra = { Tai: 5, Nin: 5, Gen: 5, Blood: 5 };

  const defense = resolveCombatIntent(state, {
    side: 'player',
    sourceId: 'player-0',
    skillIndex: findSkill(tenten, 'Twin Dragons Defense'),
    targetId: 'player-0',
  });
  assert.equal(defense.status, 'applied');
  if (defense.status !== 'applied') return;
  assert.ok(defense.state.player[0].activeEffects.some(effect =>
    effect.type === 'invulnerable' && effect.duration === 1 && effect.castTurn === 1,
  ));

  const attack = resolveCombatIntent({
    ...defense.state,
    activeSide: 'enemy',
  }, {
    side: 'enemy',
    sourceId: 'enemy-0',
    skillIndex: findSkill(findCharacter('Tenten'), 'Jidanda'),
    targetId: 'player-0',
  });
  assert.equal(attack.status, 'rejected');
  if (attack.status === 'rejected') assert.equal(attack.code, 'target-invulnerable');
});

test('derives a battle winner from server-calculated team deaths', () => {
  const tenten = findCharacter('Tenten');
  const teamA = [tenten, structuredClone(tenten), structuredClone(tenten)];
  const teamB = [structuredClone(tenten), structuredClone(tenten), structuredClone(tenten)];
  let state = createServerCombatState([teamA, teamB], 91);
  state.playerChakra = { Tai: 100, Nin: 100, Gen: 100, Blood: 100 };
  state.enemyChakra = { Tai: 100, Nin: 100, Gen: 100, Blood: 100 };
  const actions = teamA.map((character, index) => ({
    sourceId: `player-${index}`,
    skillIndex: findSkill(character, 'Jidanda'),
    targetId: `enemy-${index}`,
  }));
  let finalWinner: 0 | 1 | null = null;

  for (let turn = 1; turn <= 3; turn++) {
    const slots: [typeof actions, typeof actions] = [[], []];
    slots[0] = actions;
    const resolved = resolveAuthoritativeTurn(state, 91, turn, slots);
    assert.equal(resolved.status, 'resolved');
    state = resolved.state;
    finalWinner = resolved.winnerSlot;
  }

  assert.equal(finalWinner, 0);
  assert.equal(state.enemy.every(character => character.isDead), true);
  assert.equal(state.winnerSide, 'player');
});

test('ignores later queued actions whose target was defeated earlier in the turn', () => {
  const tenten = findCharacter('Tenten');
  const teamA = [tenten, structuredClone(tenten), structuredClone(tenten)];
  const teamB = [structuredClone(tenten), structuredClone(tenten), structuredClone(tenten)];
  const state = createServerCombatState([teamA, teamB], 0);
  state.playerChakra = { Tai: 100, Nin: 100, Gen: 100, Blood: 100 };
  state.enemyChakra = { Tai: 100, Nin: 100, Gen: 100, Blood: 100 };
  const killTarget = teamA.map((character, index) => ({
    sourceId: `player-${index}`,
    skillIndex: findSkill(character, 'Jidanda'),
    targetId: 'enemy-0',
  }));
  const noActions: typeof killTarget = [];
  const result = resolveAuthoritativeTurn(state, 0, 1, [killTarget, noActions]);

  assert.equal(result.status, 'resolved');
  assert.equal(result.state.enemy[0].isDead, true);
});

test('allows configured passive characters and initializes their starting stacks', () => {
  const cases = [
    { name: 'Young Karin', stackType: 'Young Sight' },
    { name: 'Yuhi Kurenai', stackType: 'Genjutsu Mastery' },
  ];
  for (const entry of cases) {
    const state = createServerCombatState([
      team(findCharacter(entry.name)),
      team(findCharacter('Gaara of the Sand')),
    ], 2);
    assert.equal(
      state.player[0].activeEffects.find(effect => effect.stackType === entry.stackType)?.stacks,
      1,
      `${entry.name} should begin with its configured passive stack`,
    );
  }

  const fugaku = findCharacter('Uchiha Fugaku');
  const fugakuTeam = [fugaku, findCharacter('Sasuke Uchiha'), findCharacter('Shiranui Genma')];
  const fugakuState = createServerCombatState([
    fugakuTeam,
    team(findCharacter('Gaara of the Sand')),
  ], 2);
  assert.equal(
    fugakuState.player[1].activeEffects.find(effect => effect.stackType === 'Uchiha Clan Member')?.stacks,
    1,
    'Fugaku should initialize the Uchiha-tagged ally stack',
  );
});

test('gains starting passive stacks when the character uses a skill', () => {
  const tenten = findCharacter('Tenten');
  const passive = findCharacter('Young Karin').skills.find(skill => skill.name === 'Young Sight');
  assert.ok(passive);
  tenten.skills.push(structuredClone(passive));
  const state = createServerCombatState([
    [tenten, findCharacter('Sakura Haruno'), findCharacter('Shiranui Genma')],
    team(findCharacter('Gaara of the Sand')),
  ], 2);
  state.playerChakra = { Tai: 100, Nin: 100, Gen: 100, Blood: 100 };
  const resolved = resolveAuthoritativeTurn(state, 2, 1, [[{
    sourceId: 'player-0',
    skillIndex: findSkill(tenten, 'Jidanda'),
    targetId: 'enemy-0',
  }], []]);

  assert.equal(resolved.status, 'resolved');
  assert.equal(
    resolved.state.player[0].activeEffects.find(effect => effect.stackType === 'Young Sight')?.stacks,
    2,
  );
});
