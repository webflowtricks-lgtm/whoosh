import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Character, CombatCharacter } from '../src/types';
import { firstSlotForTurn } from '../src/lib/matchProtocol';
import {
  isCanonicalCombatMatchState,
  type CanonicalCombatMatchState,
} from '../src/lib/canonicalCombatState';

const catalog = JSON.parse(
  readFileSync(new URL('../src/data/custom_characters.json', import.meta.url), 'utf8'),
) as Character[];

function makeCombatant(id: string, characterIndex: number): CombatCharacter {
  return {
    id,
    character: structuredClone(catalog[characterIndex]),
    health: 100,
    maxHealth: 100,
    shield: 0,
    activeEffects: [],
    isDead: false,
  };
}

function canonicalState(): CanonicalCombatMatchState {
  return {
    schemaVersion: 1,
    roomId: 'room-test',
    participants: ['player-one', 'player-two'],
    seed: 8421,
    initiative: { firstSlotThisTurn: firstSlotForTurn(8421, 4) },
    resolvedTurn: 3,
    combat: {
      turn: 4,
      activeSide: 'enemy',
      player: [0, 1, 2].map(index => makeCombatant(`player-${index}`, index)),
      enemy: [0, 1, 2].map(index => makeCombatant(`enemy-${index}`, index + 3)),
      playerChakra: { Tai: 2, Nin: 1, Gen: 0, Blood: 0 },
      enemyChakra: { Tai: 0, Nin: 1, Gen: 1, Blood: 0 },
    },
    submissions: {
      4: [
        [{ sourceId: 'player-0', skillIndex: 1, targetId: 'enemy-0' }],
        null,
      ],
    },
    connections: [
      { connected: true, disconnectedAt: null },
      { connected: false, disconnectedAt: 1_792_000_000_000 },
    ],
    lifecycle: { status: 'active', winnerSlot: null, reason: null },
  };
}

test('canonical match snapshot retains authoritative combat and resume state through JSON persistence', () => {
  const state = canonicalState();
  state.combat.player[0].character.skills[0].currentCooldown = 2;
  state.combat.player[0].activeEffects.push({
    name: 'Stored combo',
    type: 'custom',
    stackType: 'Combo',
    stacks: 2,
    duration: 1,
  });
  state.combat.player[0].shield = 12;

  const restored: unknown = JSON.parse(JSON.stringify(state));

  assert.equal(isCanonicalCombatMatchState(restored), true);
  if (!isCanonicalCombatMatchState(restored)) return;
  assert.equal(restored.combat.player[0].health, 100);
  assert.equal(restored.combat.player[0].shield, 12);
  assert.equal(restored.combat.player[0].character.skills[0].currentCooldown, 2);
  assert.equal(restored.combat.player[0].activeEffects[0].stacks, 2);
  assert.deepEqual(restored.submissions[4][0], [
    { sourceId: 'player-0', skillIndex: 1, targetId: 'enemy-0' },
  ]);
  assert.equal(restored.connections[1].connected, false);
  assert.notEqual(restored.connections[1].disconnectedAt, null);
});

test('rejects inconsistent canonical turn, target submission, and match lifecycle snapshots', () => {
  const skippedTurn = canonicalState();
  skippedTurn.combat.turn = 5;
  assert.equal(isCanonicalCombatMatchState(skippedTurn), false);

  const malformedSubmission = canonicalState();
  malformedSubmission.submissions[4][0]![0].skillIndex = -1;
  assert.equal(isCanonicalCombatMatchState(malformedSubmission), false);

  const wrongInitiative = canonicalState();
  wrongInitiative.initiative.firstSlotThisTurn = (wrongInitiative.initiative.firstSlotThisTurn === 0 ? 1 : 0);
  assert.equal(isCanonicalCombatMatchState(wrongInitiative), false);

  const falseWinner = canonicalState();
  falseWinner.lifecycle = { status: 'finished', winnerSlot: 0, reason: 'combat' };
  assert.equal(isCanonicalCombatMatchState(falseWinner), false);

  const disconnectForfeit = canonicalState();
  disconnectForfeit.lifecycle = { status: 'forfeited', winnerSlot: 0, reason: 'disconnect' };
  assert.equal(isCanonicalCombatMatchState(disconnectForfeit), true);

  const invalidCombatValue = canonicalState();
  invalidCombatValue.combat.enemy[1].health = 101;
  assert.equal(isCanonicalCombatMatchState(invalidCombatValue), false);
});
