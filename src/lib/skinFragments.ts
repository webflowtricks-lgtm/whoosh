import type { Character, ShopItem, SkinRarity, UserProfile } from '../types';

export const SKIN_FRAGMENT_PACK_COST = 75_000;
export const SKIN_FRAGMENT_UNLOCK_TARGET = 50;
export const SKIN_RARITY_ORDER: readonly SkinRarity[] = ['comum', 'rara', 'epica', 'lendaria', 'mitica'];
export const GLOBAL_REQUIRED_CHARACTER_SKINS = {
  naruto: 'naruto-skin-1470',
  sakura: 'sakura-skin-5341',
  sasuke: 'sasuke-skin-3412',
} as const;
const GLOBAL_COMMON_SKIN_IDS = Object.values(GLOBAL_REQUIRED_CHARACTER_SKINS);
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
  return GLOBAL_COMMON_SKIN_IDS.some(globalSkinId => globalSkinId === skinId) ||
    (user.unlockedSkins || []).includes(skinId) ||
    (Number.isSafeInteger(user.skinFragments?.[skinId]) &&
      Number(user.skinFragments?.[skinId]) >= SKIN_FRAGMENT_UNLOCK_TARGET);
}

export function getSkinFragmentCount(fragments: Record<string, unknown> | undefined, skinId: string): number {
  const count = fragments?.[skinId];
  return Number.isSafeInteger(count) && Number(count) > 0 ? Number(count) : 0;
}

export function addSkinFragments(previousCount: number, fragmentsAdded: number): number {
  if (!Number.isSafeInteger(previousCount) || previousCount < 0 ||
      !Number.isSafeInteger(fragmentsAdded) || fragmentsAdded < 0) {
    throw new RangeError('A quantidade de fragmentos deve ser um inteiro não negativo.');
  }
  const nextCount = previousCount + fragmentsAdded;
  if (!Number.isSafeInteger(nextCount)) {
    throw new RangeError('A quantidade total de fragmentos excede o limite seguro.');
  }
  return nextCount;
}

export interface BattleSkinFragmentReward {
  characterName: string;
  skinId: string;
}

export function grantBattleSkinFragments(
  profile: Record<string, unknown>,
  characterNames: string[],
  characters: unknown,
): { profile: Record<string, unknown>; rewards: BattleSkinFragmentReward[] } {
  const catalog = getSkinFragmentCatalog(characters);
  const fragments = profile.skinFragments && typeof profile.skinFragments === 'object'
    ? { ...(profile.skinFragments as Record<string, unknown>) }
    : {};
  const unlockedSkins = new Set(
    Array.isArray(profile.unlockedSkins)
      ? profile.unlockedSkins.filter((skinId): skinId is string => typeof skinId === 'string')
      : [],
  );
  const rewards: BattleSkinFragmentReward[] = [];

  for (const characterName of characterNames.slice(0, 3)) {
    const characterSkins = catalog.filter(skin =>
      skin.characterName.trim().toLocaleLowerCase() === characterName.trim().toLocaleLowerCase(),
    );
    if (characterSkins.length === 0) continue;

    const collectibleSkins = characterSkins.filter(skin =>
      !GLOBAL_COMMON_SKIN_IDS.some(globalSkinId => globalSkinId === skin.id),
    );
    if (collectibleSkins.length === 0) continue;
    const eligibleSkins = collectibleSkins.filter(skin =>
      !unlockedSkins.has(skin.id) && getSkinFragmentCount(fragments, skin.id) < SKIN_FRAGMENT_UNLOCK_TARGET,
    );
    const candidates = eligibleSkins.length > 0 ? eligibleSkins : collectibleSkins;
    const skin = candidates.reduce((leastProgressed, candidate) =>
      getSkinFragmentCount(fragments, candidate.id) < getSkinFragmentCount(fragments, leastProgressed.id)
        ? candidate
        : leastProgressed,
    );
    const nextCount = addSkinFragments(getSkinFragmentCount(fragments, skin.id), 1);
    fragments[skin.id] = nextCount;
    if (nextCount >= SKIN_FRAGMENT_UNLOCK_TARGET) unlockedSkins.add(skin.id);
    rewards.push({ characterName: skin.characterName, skinId: skin.id });
  }

  return {
    profile: {
      ...profile,
      skinFragments: fragments,
      unlockedSkins: [...unlockedSkins],
    },
    rewards,
  };
}

export function applyGlobalRequiredCharacterSkins(team: Character[]): Character[] {
  return team.map(character => {
    const requiredSkinId = GLOBAL_REQUIRED_CHARACTER_SKINS[character.id as keyof typeof GLOBAL_REQUIRED_CHARACTER_SKINS];
    const requiredSkin = character.skins?.find(skin => skin.id === requiredSkinId);
    return requiredSkin
      ? { ...character, selectedSkinId: requiredSkin.id, selectedSkinUrl: requiredSkin.image }
      : character;
  });
}

export function autoEquipNewlyUnlockedCharacterSkins(
  previousUser: Pick<UserProfile, 'unlockedSkins' | 'skinFragments' | 'equippedCharacterSkins' | 'unlockedSkillSkins'> | null,
  updatedUser: UserProfile,
  characters: Character[],
  shopItems: ShopItem[] = [],
): UserProfile {
  if (!previousUser) return updatedUser;

  const newlyUnlockedByCharacter = new Map<string, string>();
  const newlyUnlockedSkillSkins = new Map<string, string>();
  for (const character of characters) {
    for (const skin of character.skins || []) {
      if (!isSkinUnlocked(previousUser, skin.id) && isSkinUnlocked(updatedUser, skin.id)) {
        newlyUnlockedByCharacter.set(character.id, skin.id);
      }
    }
  }
  const previousSkillSkins = new Set(previousUser.unlockedSkillSkins || []);
  const unlockedSkillSkins = new Set(updatedUser.unlockedSkillSkins || []);
  for (const item of shopItems) {
    if (
      item.category === 'skill_skin' &&
      item.skillCharacterId &&
      item.skillName &&
      !previousSkillSkins.has(item.id) &&
      unlockedSkillSkins.has(item.id)
    ) {
      newlyUnlockedSkillSkins.set(
        `${item.skillCharacterId}:${item.skillName}`,
        item.id,
      );
    }
  }
  if (newlyUnlockedByCharacter.size === 0 && newlyUnlockedSkillSkins.size === 0) return updatedUser;

  const equippedCharacterSkins = { ...updatedUser.equippedCharacterSkins };
  for (const [characterId, skinId] of newlyUnlockedByCharacter) {
    equippedCharacterSkins[characterId] = skinId;
  }
  const equippedSkillSkins = { ...updatedUser.equippedSkillSkins };
  for (const [equipKey, skinId] of newlyUnlockedSkillSkins) {
    equippedSkillSkins[equipKey] = skinId;
  }
  return { ...updatedUser, equippedCharacterSkins, equippedSkillSkins };
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
  return Math.floor(randomValue * 10) + 1;
}
