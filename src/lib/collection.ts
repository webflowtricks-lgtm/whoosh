/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserProfile, NinjaCard, NinjaPack } from '../types';
import { getCards } from './cardStorage';

export interface PackResult {
  granted: NinjaCard[];
}

// Feixe médio de raridades ao abrir um pacote (probabilidades em %).
export const PACK_RARITY_WEIGHTS: Record<'comum' | 'raro' | 'epico' | 'lendario' | 'secreto', number> = {
  comum: 55,
  raro: 25,
  epico: 14,
  lendario: 5,
  secreto: 1,
};

export interface CollectionApi {
  collectedIds: string[];
  owned: Set<string>;
  grantCards: (ids: string[]) => void;
  openPack: (cards: NinjaCard[], options?: { count?: number; gemsCost?: number; pack?: NinjaPack }) => PackResult;
}

// Rolagem ponderada por raridade, respeitando um subconjunto permitido.
export function rollPackRarity(allowed: NinjaCard['rarity'][] | undefined): NinjaCard['rarity'] {
  const order: NinjaCard['rarity'][] = ['comum', 'raro', 'epico', 'lendario', 'secreto'];
  const allowedSet = allowed && allowed.length > 0 ? new Set(allowed) : null;
  const weights: { rarity: NinjaCard['rarity']; weight: number }[] = order
    .filter(r => !allowedSet || allowedSet.has(r))
    .map(r => ({ rarity: r, weight: PACK_RARITY_WEIGHTS[r] }));
  if (weights.length === 0) return 'comum';

  const total = weights.reduce((s, w) => s + w.weight, 0);
  const r = Math.random() * total;
  let acc = 0;
  for (const { rarity, weight } of weights) {
    acc += weight;
    if (r < acc) return rarity;
  }
  return weights[weights.length - 1].rarity;
}

// Hook que centraliza o progresso da coleção de cards no perfil do usuário.
export function useCollection(
  user: UserProfile | null,
  onUpdateUser?: (u: UserProfile) => void,
  allCards: NinjaCard[] = getCards()
): CollectionApi {
  const collectedIds = user?.collectedCardIds || [];
  const owned = new Set(collectedIds);

  const grantCards = (ids: string[]) => {
    if (!user || !onUpdateUser) return;
    const merged = Array.from(new Set([...collectedIds, ...ids]));
    onUpdateUser({ ...user, collectedCardIds: merged });
  };

  const openPack = (cards: NinjaCard[], options?: { count?: number; gemsCost?: number; pack?: NinjaPack }): PackResult => {
    const count = options?.count ?? 3;
    const gemsCost = options?.gemsCost ?? 0;
    const pack = options?.pack;
    const pool = cards.length ? cards : allCards;

    // Filtra os candidatos conforme o pacote: cards marcados com o pacote OU
    // (se o pacote tiver filtro de raridade) cards daquela raridade.
    let candidates = pool;
    if (pack) {
      const allowed = pack.allowedRarities?.length ? new Set(pack.allowedRarities) : null;
      candidates = pool.filter(c => {
        const inPack = (c.packs || []).includes(pack.id);
        if (allowed) {
          return inPack || allowed.has(c.rarity);
        }
        return inPack;
      });
      if (candidates.length === 0) {
        // Fallback: se nada combina, usa todos (pacote "completo").
        candidates = pool.filter(c => !allowed || allowed.has(c.rarity));
        if (candidates.length === 0) candidates = pool;
      }
    }

    const granted: NinjaCard[] = [];
    for (let i = 0; i < count; i++) {
      const rarity = rollPackRarity(pack?.allowedRarities);
      const rarityCandidates = candidates.filter(c => c.rarity === rarity);
      if (rarityCandidates.length === 0) continue;
      granted.push(rarityCandidates[Math.floor(Math.random() * rarityCandidates.length)]);
    }
    if (user && onUpdateUser) {
      const merged = Array.from(new Set([...collectedIds, ...granted.map(c => c.id)]));
      onUpdateUser({
        ...user,
        collectedCardIds: merged,
        gems: Math.max(0, (user.gems ?? 0) - gemsCost),
      });
    }
    return { granted };
  };

  return { collectedIds, owned, grantCards, openPack };
}
