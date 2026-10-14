/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Character } from '../types';
import { CHARACTERS as DEFAULT_CHARACTERS } from '../data/characters';
import { preloadCharacters } from './imagePreloader';
import { saveGlobalConfig } from './api';

const STORAGE_KEY = 'naruto_combat_characters';

// Cache em memória: garante que dados novos vindos do servidor sejam usados
// mesmo quando o localStorage estoura a cota (QuotaExceededError) e não atualiza.
let memoryCache: Character[] | null = null;
let serverCatalogLoaded = false;

// Mídia base64 grande não cabe na cota do localStorage (~5MB); o cache persiste
// sem ela e o memoryCache mantém os dados completos.
const stripHeavyData = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(stripHeavyData);
  if (obj && typeof obj === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && /^data:(?:image|video)\//i.test(v) && v.length > 2000) continue;
      out[k] = stripHeavyData(v);
    }
    return out;
  }
  return obj;
};

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

export async function fetchCharactersFromServer(options: { required?: boolean } = {}): Promise<Character[]> {
  if (options.required) serverCatalogLoaded = false;
  try {
    const response = await fetch('/api/characters', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Não foi possível carregar o catálogo global de personagens (HTTP ${response.status}).`);
    }
    const data = await response.json() as { success?: boolean; characters?: Character[] };
    if (data && data.success && Array.isArray(data.characters) && data.characters.length > 0) {
      const enriched = enrichCharacters(data.characters);
      memoryCache = enriched;
      serverCatalogLoaded = true;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stripHeavyData(enriched)));
      } catch (e) {
        console.warn("Failed to update localStorage cache from server data:", e);
      }
      return enriched;
    }
    throw new Error('O servidor não retornou um catálogo global válido de personagens.');
  } catch (error) {
    if (options.required) {
      throw error instanceof Error
        ? error
        : new Error('Não foi possível confirmar o catálogo global de personagens no servidor.');
    }
  }
  return getCharacters();
}

export async function saveCharacters(characters: Character[]): Promise<Character[]> {
  if (!serverCatalogLoaded) {
    throw new Error('Carregue e confirme o catálogo global do servidor antes de salvar alterações.');
  }
  const enriched = enrichCharacters(characters);
  await saveGlobalConfig('/api/characters', { characters: enriched });
  memoryCache = enriched;
  serverCatalogLoaded = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripHeavyData(enriched)));
  } catch (e) {
    console.warn("Failed to save characters to localStorage quota:", e);
  }
  return enriched;
}

export async function resetToDefaultCharacters(): Promise<Character[]> {
  const enriched = enrichCharacters(DEFAULT_CHARACTERS);
  await saveGlobalConfig('/api/characters', { characters: enriched });
  memoryCache = enriched;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripHeavyData(enriched)));
  } catch (e) {
    console.warn("Failed to save default characters to localStorage quota:", e);
  }
  return enriched;
}
