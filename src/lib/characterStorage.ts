/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Character } from '../types';
import { CHARACTERS as DEFAULT_CHARACTERS } from '../data/characters';
import { preloadCharacters } from './imagePreloader';
import { safeFetchJson } from './api';

const STORAGE_KEY = 'naruto_combat_characters';

// Cache em memória: garante que dados novos vindos do servidor sejam usados
// mesmo quando o localStorage estoura a cota (QuotaExceededError) e não atualiza.
let memoryCache: Character[] | null = null;

export function enrichCharacters(characters: Character[]): Character[] {
  if (!Array.isArray(characters)) return characters;
  const enriched = characters.map(char => ({
    ...char,
    skins: char.skins || [],
    skills: (char.skills || []).map(sk => {
      const s = { ...sk };
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
  if (memoryCache && memoryCache.length > 0) {
    return memoryCache;
  }
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
    const data = await safeFetchJson<{ success?: boolean; characters?: Character[] }>('/api/characters');
    if (data && data.success && Array.isArray(data.characters) && data.characters.length > 0) {
      const enriched = enrichCharacters(data.characters);
      memoryCache = enriched;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(enriched));
      } catch (e) {
        console.warn("Failed to update localStorage cache from server data:", e);
      }
      return enriched;
    }
  } catch (error) {
    // Network or server error - gracefully fallback to local storage
  }
  return getCharacters();
}

export async function saveCharacters(characters: Character[]): Promise<Character[]> {
  const enriched = enrichCharacters(characters);
  memoryCache = enriched;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enriched));
  } catch (e) {
    console.warn("Failed to save characters to localStorage quota:", e);
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return enriched;
  }

  try {
    const res = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characters: enriched }),
    });
    if (!res.ok) {
      console.warn('Failed to sync characters to server:', res.statusText);
    }
  } catch (err) {
    console.warn('Failed to sync characters to server:', err);
  }

  return enriched;
}

export async function resetToDefaultCharacters(): Promise<Character[]> {
  const enriched = enrichCharacters(DEFAULT_CHARACTERS);
  memoryCache = enriched;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enriched));
  } catch (e) {
    console.warn("Failed to save default characters to localStorage quota:", e);
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return enriched;
  }

  try {
    const res = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characters: enriched }),
    });
    if (!res.ok) {
      console.warn('Failed to reset characters on server:', res.statusText);
    }
  } catch (err) {
    console.warn('Failed to reset characters on server:', err);
  }

  return enriched;
}
