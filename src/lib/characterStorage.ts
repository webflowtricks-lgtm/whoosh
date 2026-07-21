/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Character } from '../types';
import { CHARACTERS as DEFAULT_CHARACTERS } from '../data/characters';

const STORAGE_KEY = 'naruto_combat_characters';

export function getCharacters(): Character[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error('Failed to parse characters from localStorage:', e);
    }
  }
  return DEFAULT_CHARACTERS;
}

export async function fetchCharactersFromServer(): Promise<Character[]> {
  try {
    const res = await fetch('/api/characters');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.characters) && data.characters.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.characters));
        return data.characters;
      }
    }
  } catch (error) {
    console.error('Failed to fetch characters from server:', error);
  }
  return getCharacters();
}

export function saveCharacters(characters: Character[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(characters));
  // Send async request to save on server
  fetch('/api/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ characters }),
  }).catch(err => {
    console.error('Failed to sync characters to server:', err);
  });
}

export function resetToDefaultCharacters(): Character[] {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CHARACTERS));
  fetch('/api/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ characters: DEFAULT_CHARACTERS }),
  }).catch(err => {
    console.error('Failed to reset characters on server:', err);
  });
  return DEFAULT_CHARACTERS;
}
