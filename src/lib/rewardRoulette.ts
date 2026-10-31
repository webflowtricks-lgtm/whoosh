import type {
  Character,
  CardRarity,
  NinjaCard,
  RewardRouletteDraw,
  RewardRouletteHistoryEntry,
  RewardRoulettePrize,
  RewardRouletteRarity,
  SkinRarity,
} from '../types';
import type { CustomBannerItem } from './bannerStorage';

export type {
  RewardRouletteDraw,
  RewardRouletteHistoryEntry,
  RewardRoulettePrize,
  RewardRouletteRarity,
} from '../types';

export const REWARD_ROULETTE_COST = 25;
export const REWARD_ROULETTE_MAX_SPINS = 10;
export const REWARD_ROULETTE_LEGENDARY_INTERVAL = 10;
export const REWARD_ROULETTE_HISTORY_LIMIT = 100;
export const REWARD_ROULETTE_LEGENDARY_SKIN_ID = 'young-obito-skin-test-legendary';

const RARITY_CHANCES: Record<RewardRouletteRarity, number> = {
  comum: 60,
  rara: 25,
  epica: 11,
  lendaria: 1,
  mitica: 0.5,
};

const CARD_RARITY_MAP: Record<CardRarity, RewardRouletteRarity> = {
  comum: 'comum',
  raro: 'rara',
  epico: 'epica',
  lendario: 'lendaria',
  secreto: 'mitica',
};

function isSkinRarity(value: unknown): value is SkinRarity {
  return value === 'comum' || value === 'rara' || value === 'epica' ||
    value === 'lendaria' || value === 'mitica';
}

export function buildRewardRoulettePool(
  characters: Array<Pick<Character, 'id' | 'name' | 'skins'>>,
  cards: Array<Pick<NinjaCard, 'id' | 'characterName' | 'rarity'>>,
  profileBanners: Array<Pick<CustomBannerItem, 'id' | 'name' | 'imageUrl'>> = [],
): RewardRoulettePrize[] {
  const prizes: RewardRoulettePrize[] = [
    { id: 'ryos-10', kind: 'ryos', rarity: 'comum', name: '10 Ryos', amount: 10 },
    { id: 'ryos-20', kind: 'ryos', rarity: 'comum', name: '20 Ryos', amount: 20 },
    { id: 'ryos-35', kind: 'ryos', rarity: 'comum', name: '35 Ryos', amount: 35 },
    { id: 'ryos-50', kind: 'ryos', rarity: 'rara', name: '50 Ryos', amount: 50 },
    { id: 'ryos-75', kind: 'ryos', rarity: 'rara', name: '75 Ryos', amount: 75 },
    { id: 'ryos-100', kind: 'ryos', rarity: 'rara', name: '100 Ryos', amount: 100 },
    { id: 'ryos-200', kind: 'ryos', rarity: 'epica', name: '200 Ryos', amount: 200 },
    { id: 'ryos-350', kind: 'ryos', rarity: 'epica', name: '350 Ryos', amount: 350 },
    { id: 'ryos-300-legendary', kind: 'ryos', rarity: 'lendaria', name: '300 Ryos', amount: 300 },
    {
      id: 'voice-kakashi-copy',
      kind: 'voice',
      rarity: 'lendaria',
      name: 'Kakashi',
      voiceId: 'kakashi-jutsucopiado',
    },
  ];

  const profileBanner = profileBanners.find(banner =>
    typeof banner.id === 'string' && banner.id.length > 0 &&
    typeof banner.name === 'string' && banner.name.length > 0 &&
    typeof banner.imageUrl === 'string' && banner.imageUrl.length > 0,
  );
  if (profileBanner) {
    prizes.push({
      id: `profile-banner-${profileBanner.id}`,
      kind: 'banner',
      rarity: 'epica',
      name: profileBanner.name,
      bannerId: profileBanner.id,
      imageUrl: profileBanner.imageUrl,
    });
  }

  const seenSkinIds = new Set<string>();
  for (const character of characters) {
    for (const skin of character.skins || []) {
      if (!skin?.id || !skin.name || seenSkinIds.has(skin.id)) continue;
      seenSkinIds.add(skin.id);
      prizes.push({
        id: `skin-${skin.id}`,
        kind: 'skin',
        rarity: isSkinRarity(skin.rarity) ? skin.rarity : 'comum',
        name: skin.name,
        skinId: skin.id,
        characterName: character.name,
      });
    }
  }

  const seenCardIds = new Set<string>();
  for (const card of cards) {
    if (!card?.id || !card.characterName || !CARD_RARITY_MAP[card.rarity] || seenCardIds.has(card.id)) continue;
    seenCardIds.add(card.id);
    prizes.push({
      id: `card-${card.id}`,
      kind: 'card',
      rarity: CARD_RARITY_MAP[card.rarity],
      name: card.characterName,
      cardId: card.id,
      characterName: card.characterName,
    });
  }

  return prizes;
}

export function drawRewardRoulettePrize(
  prizes: RewardRoulettePrize[],
  rarityRandomValue: number,
  prizeRandomValue: number,
  forcedRarity?: RewardRouletteRarity,
): RewardRoulettePrize {
  if (
    !Number.isFinite(rarityRandomValue) || rarityRandomValue < 0 || rarityRandomValue >= 1 ||
    !Number.isFinite(prizeRandomValue) || prizeRandomValue < 0 || prizeRandomValue >= 1
  ) {
    throw new RangeError('Os valores aleatórios da roleta devem estar entre 0 e 1.');
  }
  if (prizes.length === 0) throw new Error('Não há recompensas cadastradas para a roleta.');

  const availableRarities = [...new Set(prizes.map(prize => prize.rarity))];
  if (forcedRarity) {
    const forcedCandidates = prizes.filter(prize => prize.rarity === forcedRarity);
    if (forcedCandidates.length === 0) {
      throw new Error(`Não há recompensas ${forcedRarity} cadastradas para a roleta.`);
    }
    return forcedCandidates[Math.floor(prizeRandomValue * forcedCandidates.length)];
  }
  const availableWeight = availableRarities.reduce((total, rarity) => total + RARITY_CHANCES[rarity], 0);
  let roll = rarityRandomValue * availableWeight;
  let selectedRarity = availableRarities[availableRarities.length - 1];
  for (const rarity of ['comum', 'rara', 'epica', 'lendaria', 'mitica'] as const) {
    if (!availableRarities.includes(rarity)) continue;
    roll -= RARITY_CHANCES[rarity];
    if (roll < 0) {
      selectedRarity = rarity;
      break;
    }
  }

  const candidates = prizes.filter(prize => prize.rarity === selectedRarity);
  return candidates[Math.floor(prizeRandomValue * candidates.length)];
}

export function drawRewardRouletteSpin(
  profile: Record<string, unknown>,
  prizes: RewardRoulettePrize[],
  rarityRandomValue: number,
  prizeRandomValue: number,
): RewardRouletteDraw {
  const spinCount = Number.isSafeInteger(profile.rewardRouletteSpinCount) &&
    Number(profile.rewardRouletteSpinCount) >= 0 &&
    Number(profile.rewardRouletteSpinCount) < REWARD_ROULETTE_LEGENDARY_INTERVAL
    ? Number(profile.rewardRouletteSpinCount)
    : 0;
  const guaranteedLegendary = spinCount === REWARD_ROULETTE_LEGENDARY_INTERVAL - 1;
  const prize = drawRewardRoulettePrize(
    prizes,
    rarityRandomValue,
    prizeRandomValue,
    guaranteedLegendary ? 'lendaria' : undefined,
  );
  const draw = grantRewardRoulettePrize(profile, prize);
  const nextSpinCount = prize.rarity === 'lendaria' ? 0 : spinCount + 1;
  profile.rewardRouletteSpinCount = nextSpinCount;

  return {
    ...draw,
    guaranteedLegendary,
    spinsUntilLegendary: REWARD_ROULETTE_LEGENDARY_INTERVAL - nextSpinCount,
  };
}

export function appendRewardRouletteHistory(
  profile: Record<string, unknown>,
  draws: RewardRouletteDraw[],
  batchId: string,
  createdAt = new Date().toISOString(),
): RewardRouletteHistoryEntry[] {
  const existingHistory = Array.isArray(profile.rewardRouletteHistory)
    ? profile.rewardRouletteHistory.filter(isRewardRouletteHistoryEntry)
    : [];
  const newEntries = draws.map((draw, index) => {
    const { imageUrl: _imageUrl, ...compactPrize } = draw.prize;
    return {
      id: `${batchId}-${index + 1}`,
      createdAt,
      draw: { ...draw, prize: compactPrize },
    };
  });
  const history = [...newEntries, ...existingHistory].slice(0, REWARD_ROULETTE_HISTORY_LIMIT);
  profile.rewardRouletteHistory = history;
  return history;
}

export function isRewardRouletteHistoryEntry(value: unknown): value is RewardRouletteHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RewardRouletteHistoryEntry>;
  const draw = entry.draw;
  const prize = draw?.prize;
  return typeof entry.id === 'string' &&
    typeof entry.createdAt === 'string' &&
    !!draw && !!prize &&
    typeof prize.id === 'string' &&
    typeof prize.name === 'string' &&
    ['ryos', 'skin', 'voice', 'card', 'banner'].includes(prize.kind) &&
    ['comum', 'rara', 'epica', 'lendaria', 'mitica'].includes(prize.rarity);
}

export function grantRewardRoulettePrize(
  profile: Record<string, unknown>,
  prize: RewardRoulettePrize,
): RewardRouletteDraw {
  const currentRyos = Number.isSafeInteger(profile.ryos) && Number(profile.ryos) >= 0
    ? Number(profile.ryos)
    : 1500;
  const addRyos = (amount: number) => {
    if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(currentRyos + amount)) {
      throw new RangeError('A recompensa de Ryos está fora do limite permitido.');
    }
    profile.ryos = currentRyos + amount;
  };

  if (prize.kind === 'ryos') {
    addRyos(prize.amount || 0);
    return { prize };
  }

  if (prize.kind === 'skin' && prize.skinId) {
    const unlockedSkins = Array.isArray(profile.unlockedSkins)
      ? profile.unlockedSkins.filter((id): id is string => typeof id === 'string')
      : [];
    const fragments = profile.skinFragments && typeof profile.skinFragments === 'object'
      ? profile.skinFragments as Record<string, unknown>
      : {};
    const alreadyUnlocked = unlockedSkins.includes(prize.skinId) ||
      (Number.isSafeInteger(fragments[prize.skinId]) &&
        Number(fragments[prize.skinId]) >= 50);
    if (alreadyUnlocked) {
      addRyos(25);
      return {
        prize: { id: 'duplicate-skin-ryos', kind: 'ryos', rarity: prize.rarity, name: '25 Ryos', amount: 25 },
        duplicate: true,
      };
    }
    profile.unlockedSkins = [...unlockedSkins, prize.skinId];
    return { prize };
  }

  if (prize.kind === 'voice' && prize.voiceId) {
    const unlockedVoiceIds = Array.isArray(profile.unlockedVoiceIds)
      ? profile.unlockedVoiceIds.filter((id): id is string => typeof id === 'string')
      : [];
    if (unlockedVoiceIds.includes(prize.voiceId)) {
      addRyos(50);
      return {
        prize: { id: 'duplicate-voice-ryos', kind: 'ryos', rarity: prize.rarity, name: '50 Ryos', amount: 50 },
        duplicate: true,
      };
    }
    profile.unlockedVoiceIds = [...unlockedVoiceIds, prize.voiceId];
    return { prize };
  }

  if (prize.kind === 'card' && prize.cardId) {
    const collectedCardIds = Array.isArray(profile.collectedCardIds)
      ? profile.collectedCardIds.filter((id): id is string => typeof id === 'string')
      : [];
    profile.collectedCardIds = [...collectedCardIds, prize.cardId];
    return { prize, duplicate: collectedCardIds.includes(prize.cardId) };
  }

  if (prize.kind === 'banner' && prize.bannerId && prize.imageUrl) {
    const unlockedBanners = Array.isArray(profile.unlockedBanners)
      ? profile.unlockedBanners.filter((id): id is string => typeof id === 'string')
      : [];
    const unlockedBannerUrls = Array.isArray(profile.unlockedBannerUrls)
      ? profile.unlockedBannerUrls.filter((url): url is string => typeof url === 'string')
      : [];
    const alreadyUnlocked = unlockedBanners.includes(prize.bannerId) ||
      unlockedBannerUrls.includes(prize.imageUrl);
    if (alreadyUnlocked) {
      addRyos(50);
      return {
        prize: { id: 'duplicate-banner-ryos', kind: 'ryos', rarity: prize.rarity, name: '50 Ryos', amount: 50 },
        duplicate: true,
      };
    }
    profile.unlockedBanners = [...unlockedBanners, prize.bannerId];
    profile.unlockedBannerUrls = [...unlockedBannerUrls, prize.imageUrl];
    return { prize };
  }

  throw new Error('A recompensa sorteada não tem dados válidos para resgate.');
}
