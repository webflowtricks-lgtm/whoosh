import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Character } from '../src/types';
import { firstSlotForTurn } from '../src/lib/matchProtocol';
import {
  createServerCombatState,
  resolveAuthoritativeTurn,
  validateAuthoritativeActions,
} from '../workers/serverCombat';

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
});

test('rejects catalog mechanics not yet implemented rather than partially resolving them', () => {
  const seed = 5;
  const teamA = team(findCharacter('Tenten'));
  const teamB = team(findCharacter('Gaara of the Sand'));
  const state = createServerCombatState([teamA, teamB], seed);
  const skill = teamA[0].skills.findIndex(candidate => candidate.name === 'Rising Twin Dragons');
  assert.notEqual(skill, -1);
  assert.deepEqual(
    validateAuthoritativeActions(state, 0, [{
      sourceId: 'player-0',
      skillIndex: skill,
      targetId: 'enemy-0',
    }]),
    { status: 'unsupported', code: 'skill-mechanics-not-ported' },
  );
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
