import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getInactiveMatchSlot,
  MATCH_INACTIVITY_TIMEOUT_MS,
} from '../src/lib/matchInactivity';

test('does not forfeit before 120 seconds without player activity', () => {
  assert.equal(
    getInactiveMatchSlot([1_000, 1_000], 1_000 + MATCH_INACTIVITY_TIMEOUT_MS - 1),
    null,
  );
});

test('forfeits the first player to reach 120 seconds of inactivity', () => {
  assert.equal(
    getInactiveMatchSlot([1_000, 2_000], 1_000 + MATCH_INACTIVITY_TIMEOUT_MS),
    0,
  );
});

test('chooses the longest-idle player if both deadlines have passed', () => {
  assert.equal(
    getInactiveMatchSlot([1_000, 500], 1_000 + MATCH_INACTIVITY_TIMEOUT_MS),
    1,
  );
});
