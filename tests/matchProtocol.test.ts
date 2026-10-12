import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidMatchTeam,
  submitTurnActions,
  type MatchProtocolRoom,
} from '../src/lib/matchProtocol';

function createRoom(): MatchProtocolRoom {
  const team = Array.from({ length: 3 }, (_, index) => ({
    id: `character-${index}`,
    skills: [{ name: `skill-${index}` }, { name: `skill-${index}-secondary` }],
  }));
  return {
    players: [
      { username: 'one', team },
      { username: 'two', team: team.map(character => ({ ...character })) },
    ],
    turns: {},
    resolvedTurn: 0,
    surrenderedBy: null,
  };
}

const validAction = {
  sourceId: 'player-0',
  skillIndex: 0,
  targetId: 'enemy-0',
};

test('accepts a three-character team with unique ids and bounded skills', () => {
  assert.equal(isValidMatchTeam(createRoom().players[0].team), true);
  assert.equal(isValidMatchTeam(createRoom().players[0].team.slice(0, 2)), false);
  assert.equal(isValidMatchTeam([
    { id: 'same', skills: [{}] },
    { id: 'same', skills: [{}] },
    { id: 'third', skills: [{}] },
  ]), false);
});

test('validates combat action source, target and skill indices', () => {
  const room = createRoom();
  assert.equal(submitTurnActions(room, 0, 1, [validAction]).status, 'accepted');
  assert.equal(submitTurnActions(createRoom(), 0, 1, [{ ...validAction, sourceId: 'enemy-0' }]).status, 'invalid');
  assert.equal(submitTurnActions(createRoom(), 0, 1, [{ ...validAction, targetId: 'enemy-3' }]).status, 'invalid');
  assert.equal(submitTurnActions(createRoom(), 0, 1, [{ ...validAction, skillIndex: 2 }]).status, 'invalid');
});

test('advances the authoritative turn only after both player slots submit', () => {
  const room = createRoom();
  assert.equal(submitTurnActions(room, 0, 1, [validAction]).status, 'accepted');
  assert.equal(room.resolvedTurn, 0);

  assert.equal(submitTurnActions(room, 1, 1, [validAction]).status, 'accepted');
  assert.equal(room.resolvedTurn, 1);

  assert.equal(submitTurnActions(room, 0, 2, [validAction]).status, 'accepted');
  assert.equal(room.resolvedTurn, 1);
});

test('makes retries idempotent and rejects a conflicting overwrite', () => {
  const room = createRoom();
  assert.equal(submitTurnActions(room, 0, 1, [validAction]).status, 'accepted');
  assert.equal(submitTurnActions(room, 0, 1, [validAction]).status, 'duplicate');
  assert.equal(
    submitTurnActions(room, 0, 1, [{ ...validAction, skillIndex: 1 }]).status,
    'conflict',
  );
  assert.equal(room.turns[1][0]?.[0].skillIndex, 0);
});

test('rejects turn skips, malformed and oversized submissions without mutation', () => {
  const room = createRoom();
  assert.equal(submitTurnActions(room, 0, 2, [validAction]).status, 'conflict');
  assert.equal(submitTurnActions(room, 0, 1, [{ ...validAction, skillIndex: -1 }]).status, 'invalid');
  assert.equal(submitTurnActions(room, 0, 1, new Array(97).fill(validAction)).status, 'invalid');
  assert.deepEqual(room.turns, {});
  assert.equal(room.resolvedTurn, 0);
});

test('serializes concurrent submissions without double-resolving or overwriting', async () => {
  const room = createRoom();
  const submissions = await Promise.all(
    Array.from({ length: 100 }, (_, index) =>
      Promise.resolve().then(() =>
        submitTurnActions(
          room,
          (index % 2) as 0 | 1,
          1,
          [index % 2 === 0 ? validAction : { ...validAction, skillIndex: 1 }],
        ),
      ),
    ),
  );

  assert.equal(submissions.filter(result => result.status === 'accepted').length, 2);
  assert.equal(submissions.filter(result => result.status === 'duplicate').length, 98);
  assert.equal(room.resolvedTurn, 1);
  assert.equal(room.turns[1][0]?.[0].skillIndex, 0);
  assert.equal(room.turns[1][1]?.[0].skillIndex, 1);
});
