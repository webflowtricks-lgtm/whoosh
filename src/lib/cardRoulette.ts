import type { CardRarity, NinjaCard, QuestReward } from '../types';

export const CARD_ROULETTE_COST = 25_000;
export const CARD_PACK_REWARD_MAX = 50;

export function isValidCardRouletteCost(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export const CARD_ROULETTE_CHANCES: Record<CardRarity, number> = {
  comum: 69.1,
  raro: 25,
  epico: 4,
  lendario: 0.9,
  secreto: 1,
};

export function rebalanceCardRouletteChances(
  chances: Record<CardRarity, number>,
  editedRarity: CardRarity,
  inputValue: string,
): Record<CardRarity, number> {
  const parsedValue = inputValue.trim() === '' ? 0 : Number(inputValue);
  if (!Number.isFinite(parsedValue)) return chances;
  const editedValue = Math.round(Math.min(100, Math.max(0, parsedValue)) * 10) / 10;
  const otherRarities = (['comum', 'raro', 'epico', 'lendario', 'secreto'] as CardRarity[])
    .filter(rarity => rarity !== editedRarity);
  const remaining = Math.round((100 - editedValue) * 10) / 10;
  const weightTotal = otherRarities.reduce((total, rarity) => total + Math.max(0, chances[rarity]), 0);
  const equalShare = remaining / otherRarities.length;
  let assigned = 0;
  const balanced = { ...chances, [editedRarity]: editedValue };

  otherRarities.forEach((rarity, index) => {
    const isLast = index === otherRarities.length - 1;
    const weight = weightTotal > 0 ? Math.max(0, chances[rarity]) : 1;
    const share = isLast
      ? Math.round((remaining - assigned) * 10) / 10
      : Math.round((weightTotal > 0 ? remaining * weight / weightTotal : equalShare) * 10) / 10;
    balanced[rarity] = share;
    assigned += share;
  });

  return balanced;
}

export function isValidCardRouletteChances(value: unknown): value is Record<CardRarity, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const chances = value as Record<string, unknown>;
  const rarities: CardRarity[] = ['comum', 'raro', 'epico', 'lendario', 'secreto'];
  return rarities.every(rarity =>
    typeof chances[rarity] === 'number' &&
    Number.isFinite(chances[rarity]) &&
    Number(chances[rarity]) >= 0 &&
    Number(chances[rarity]) <= 100,
  ) && Math.abs(rarities.reduce((total, rarity) => total + Number(chances[rarity]), 0) - 100) < 0.01;
}

export function cardPackRewardQuantity(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity <= CARD_PACK_REWARD_MAX ? quantity : null;
}

export function redeemCardPackRewards(
  profile: Record<string, unknown>,
  rewards: QuestReward[],
  cards: NinjaCard[],
  chances: Record<CardRarity, number>,
  randomValue: () => number,
): NinjaCard[] {
  const rewardCounts = rewards
    .filter(reward => reward.type === 'card_pack')
    .map(reward => cardPackRewardQuantity(reward.value));
  if (rewardCounts.some(quantity => quantity === null) ||
      rewardCounts.reduce<number>((total, quantity) => total + (quantity || 0), 0) > CARD_PACK_REWARD_MAX) {
    throw new Error(`A quantidade de pacotes deve estar entre 1 e ${CARD_PACK_REWARD_MAX}.`);
  }
  const packageCount = rewardCounts.reduce<number>((total, quantity) => total + (quantity || 0), 0);
  if (packageCount > 0 && cards.length === 0) {
    throw new Error('Não há figurinhas cadastradas para abrir os pacotes.');
  }

  const drawnCards = Array.from({ length: packageCount }, () =>
    drawCardRoulette(cards, randomValue(), randomValue(), chances),
  );
  if (drawnCards.length > 0) {
    const existingIds = Array.isArray(profile.collectedCardIds)
      ? profile.collectedCardIds.filter((id): id is string => typeof id === 'string')
      : [];
    profile.collectedCardIds = [...existingIds, ...drawnCards.map(card => card.id)];
  }
  return drawnCards;
}

export const CARD_ROULETTE_RARITY_ORDER: CardRarity[] = [
  'secreto',
  'lendario',
  'epico',
  'raro',
  'comum',
];

export function getCardRouletteChances(
  cards: NinjaCard[],
  configuredChances: Record<CardRarity, number> = CARD_ROULETTE_CHANCES,
): Record<CardRarity, number> {
  const availableRarities = new Set(cards.map(card => card.rarity));
  const availableWeight = CARD_ROULETTE_RARITY_ORDER.reduce(
    (total, rarity) => total + (availableRarities.has(rarity) ? configuredChances[rarity] : 0),
    0,
  );
  if (availableWeight === 0) {
    const availableCount = availableRarities.size;
    return Object.fromEntries(CARD_ROULETTE_RARITY_ORDER.map(rarity => [
      rarity,
      availableRarities.has(rarity) ? 100 / availableCount : 0,
    ])) as Record<CardRarity, number>;
  }

  return Object.fromEntries(CARD_ROULETTE_RARITY_ORDER.map(rarity => [
    rarity,
    availableRarities.has(rarity)
      ? configuredChances[rarity] / availableWeight * 100
      : 0,
  ])) as Record<CardRarity, number>;
}

export function drawCardRoulette(
  cards: NinjaCard[],
  rarityRandomValue: number,
  cardRandomValue: number = Math.random(),
  configuredChances: Record<CardRarity, number> = CARD_ROULETTE_CHANCES,
): NinjaCard {
  if (
    !Number.isFinite(rarityRandomValue) || rarityRandomValue < 0 || rarityRandomValue >= 1 ||
    !Number.isFinite(cardRandomValue) || cardRandomValue < 0 || cardRandomValue >= 1
  ) {
    throw new Error('O valor aleatório da roleta deve estar entre 0 e 1.');
  }
  if (cards.length === 0) throw new Error('Não há figurinhas cadastradas para a roleta.');

  const effectiveChances = getCardRouletteChances(cards, configuredChances);
  const roll = rarityRandomValue * 100;
  let cumulativeChance = 0;
  for (const rarity of CARD_ROULETTE_RARITY_ORDER) {
    const chance = effectiveChances[rarity];
    if (chance === 0) continue;
    cumulativeChance += chance;
    if (roll < cumulativeChance) {
      const candidates = cards.filter(card => card.rarity === rarity);
      return candidates[Math.floor(cardRandomValue * candidates.length)];
    }
  }

  const finalRarity = [...CARD_ROULETTE_RARITY_ORDER].reverse()
    .find(rarity => effectiveChances[rarity] > 0);
  if (!finalRarity) throw new Error('Não foi possível determinar a raridade sorteada.');
  const candidates = cards.filter(card => card.rarity === finalRarity);
  return candidates[candidates.length - 1];
}
