import type { Character, SkinRarity, UserProfile } from '../types';

export const SKIN_FRAGMENT_PACK_COST = 75_000;
export const SKIN_FRAGMENT_UNLOCK_TARGET = 50;
export const SKIN_RARITY_ORDER: readonly SkinRarity[] = ['comum', 'rara', 'epica', 'lendaria', 'mitica'];
export const SKIN_RARITY_META: Record<SkinRarity, { labelPt: string; labelEn: string; className: string }> = {
  comum: { labelPt: 'Comum', labelEn: 'Common', className: 'border-slate-300 bg-slate-100 text-slate-700' },
  rara: { labelPt: 'Rara', labelEn: 'Rare', className: 'border-sky-300 bg-sky-100 text-sky-800' },
  epica: { labelPt: 'Épica', labelEn: 'Epic', className: 'border-fuchsia-300 bg-fuchsia-100 text-fuchsia-800' },
  lendaria: { labelPt: 'Lendária', labelEn: 'Legendary', className: 'border-amber-300 bg-amber-100 text-amber-800' },
  mitica: { labelPt: 'Mítica', labelEn: 'Mythic', className: 'border-rose-300 bg-rose-100 text-rose-800' },
};

export function normalizeSkinRarity(value: unknown): SkinRarity {
  return typeof value === 'string' && (SKIN_RARITY_ORDER as readonly string[]).includes(value)
    ? value as SkinRarity
    : 'comum';
}

export function isSkinUnlocked(user: Pick<UserProfile, 'unlockedSkins' | 'skinFragments'>, skinId: string): boolean {
  return (user.unlockedSkins || []).includes(skinId) ||
    (Number.isSafeInteger(user.skinFragments?.[skinId]) &&
      Number(user.skinFragments?.[skinId]) >= SKIN_FRAGMENT_UNLOCK_TARGET);
}

export interface SkinFragmentCatalogEntry {
  id: string;
  name: string;
  characterName: string;
  image: string;
  rarity: SkinRarity;
}

export function getSkinFragmentCatalog(value: unknown): SkinFragmentCatalogEntry[] {
  if (!Array.isArray(value)) return [];
  const skins: SkinFragmentCatalogEntry[] = [];
  const seenIds = new Set<string>();

  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const character = candidate as Partial<Character>;
    if (typeof character.name !== 'string' || !Array.isArray(character.skins)) continue;

    for (const skin of character.skins) {
      if (!skin || typeof skin.id !== 'string' || !skin.id.trim() ||
          typeof skin.name !== 'string' || !skin.name.trim() ||
          typeof skin.image !== 'string' || !skin.image.trim() ||
          seenIds.has(skin.id)) continue;
      seenIds.add(skin.id);
      skins.push({
        id: skin.id,
        name: skin.name,
        characterName: character.name,
        image: skin.image,
        rarity: normalizeSkinRarity(skin.rarity),
      });
    }
  }

  return skins;
}

export function rollSkinFragmentQuantity(randomValue: number): number {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError('O sorteio de fragmentos deve estar entre 0 e 1.');
  }
  if (randomValue < 0.8) return 1;
  if (randomValue < 0.98) return 2;
  return 3;
}
