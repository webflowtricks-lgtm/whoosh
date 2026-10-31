import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character } from '../src/types';
import { isCharacterEnabled } from '../src/lib/characterStorage';

const character = (enabled?: boolean): Character => ({
  id: 'test-character',
  name: 'Test Character',
  description: '',
  tags: [],
  skills: [],
  portrait: '',
  folder: '',
  ...(enabled === undefined ? {} : { enabled }),
});

test('characters remain enabled unless explicitly hidden', () => {
  assert.equal(isCharacterEnabled(character()), true);
  assert.equal(isCharacterEnabled(character(true)), true);
  assert.equal(isCharacterEnabled(character(false)), false);
});
