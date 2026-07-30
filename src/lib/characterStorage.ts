/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Character } from '../types';
import { CHARACTERS as DEFAULT_CHARACTERS } from '../data/characters';
import { preloadCharacters } from './imagePreloader';

const STORAGE_KEY = 'naruto_combat_characters';

export function enrichCharacters(characters: Character[]): Character[] {
  if (!Array.isArray(characters)) return characters;
  const enriched = characters.map(char => ({
    ...char,
    skins: char.skins || [],
    skills: (char.skills || []).map(sk => {
      const s = { ...sk };
      if (s.stunTurns && (!s.stunType || s.stunType.length === 0)) {
        s.stunType = ['physical', 'mental', 'affliction', 'chakra'];
      }
      // Remove null properties (explicitly cleared by user)
      for (const key of Object.keys(s)) {
        if ((s as any)[key] === null) {
          delete (s as any)[key];
        }
      }
      return s;
    }),
  })) as Character[];

  // Trigger background image preloading for fast rendering
  preloadCharacters(enriched);

  return enriched;
}

export function getCharacters(): Character[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return enrichCharacters(parsed);
      }
    } catch (e) {
      console.error('Failed to parse characters from localStorage:', e);
    }
  }
  return enrichCharacters(DEFAULT_CHARACTERS);
}

export async function fetchCharactersFromServer(): Promise<Character[]> {
  try {
    const res = await fetch('/api/characters');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.characters) && data.characters.length > 0) {
        return enrichCharacters(data.characters);
      }
    }
  } catch (error) {
    // Network or server error - gracefully fallback to local storage
  }
  return getCharacters();
}

export function saveCharacters(characters: Character[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(characters));
  } catch (e) {
    console.warn("Failed to save characters to localStorage quota:", e);
  }
  // Send async request to save on server (fire-and-forget)
  fetch('/api/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ characters }),
  }).then(res => {
    if (!res.ok) console.error('Failed to sync characters to server:', res.statusText);
  }).catch(err => {
    console.error('Failed to sync characters to server:', err);
  });
}

export function resetToDefaultCharacters(): Character[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CHARACTERS));
  } catch (e) {
    console.warn("Failed to save default characters to localStorage quota:", e);
  }
  fetch('/api/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ characters: DEFAULT_CHARACTERS }),
  }).catch(err => {
    console.error('Failed to reset characters on server:', err);
  });
  return DEFAULT_CHARACTERS;
}
