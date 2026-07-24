/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Character } from '../types';
import { CHARACTERS as DEFAULT_CHARACTERS } from '../data/characters';

const STORAGE_KEY = 'naruto_combat_characters';

export function enrichCharacters(characters: Character[]): Character[] {
  if (!Array.isArray(characters)) return characters;
  return characters.map(char => {
    const defaultChar = DEFAULT_CHARACTERS.find(c => c.id === char.id);
    const skins = char.skins || [];
    const updatedSkills = (char.skills || []).map(sk => {
      let stunType = sk.stunType;
      if (sk.name === 'Rasengan') {
        return {
          ...sk,
          damage: 45,
          stunTurns: 1,
          stunType: ['physical', 'mental', 'affliction', 'chakra'],
        };
      }
      
      let baseSk = sk;
      if (defaultChar) {
        const defaultSk = defaultChar.skills.find(s => s.name === sk.name);
        if (defaultSk) {
          baseSk = { ...defaultSk, ...sk };
          if (!stunType || stunType.length === 0) {
            stunType = defaultSk.stunType;
          }
        }
      }

      if (baseSk.stunTurns && (!stunType || stunType.length === 0)) {
        stunType = ['physical', 'mental', 'affliction', 'chakra'];
      }

      return {
        ...baseSk,
        stunType
      };
    });
    return { ...char, skins, skills: updatedSkills } as Character;
  });
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
        const enriched = enrichCharacters(data.characters);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(enriched));
        } catch (e) {
          console.warn("Failed to save characters to localStorage quota:", e);
        }
        return enriched;
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
