import assert from 'node:assert/strict';
import test from 'node:test';
import type { NinjaCard } from '../src/types';
import {
  CARD_ROULETTE_CHANCES,
  CARD_PACK_REWARD_MAX,
  cardPackRewardQuantity,
  drawCardRoulette,
  getCardRouletteChances,
  isValidCardRouletteChances,
  isValidCardRouletteCost,
  rebalanceCardRouletteChances,
  redeemCardPackRewards,
} from '../src/lib/cardRoulette';

test('roulette cost accepts non-negative safe integers only', () => {
  assert.equal(isValidCardRouletteCost(0), true);
  assert.equal(isValidCardRouletteCost(25_000), true);
  assert.equal(isValidCardRouletteCost(-1), false);
  assert.equal(isValidCardRouletteCost(1.5), false);
  assert.equal(isValidCardRouletteCost(Number.MAX_SAFE_INTEGER + 1), false);
  assert.equal(isValidCardRouletteCost('25000'), false);
});

const cards: NinjaCard[] = [
  { id: 'mythic', characterId: 'n1', characterName: 'Mythic', slug: 'n1', rarity: 'secreto', title: '', description: '', points: 50 },
  { id: 'legendary', characterId: 'n2', characterName: 'Legendary', slug: 'n2', rarity: 'lendario', title: '', description: '', points: 20 },
  { id: 'epic', characterId: 'n3', characterName: 'Epic', slug: 'n3', rarity: 'epico', title: '', description: '', points: 8 },
  { id: 'rare', characterId: 'n4', characterName: 'Rare', slug: 'n4', rarity: 'raro', title: '', description: '', points: 3 },
  { id: 'common', characterId: 'n5', characterName: 'Common', slug: 'n5', rarity: 'comum', title: '', description: '', points: 1 },
];

test('roulette uses the configured rarity probabilities when every rarity is available', () => {
  const actualChances = getCardRouletteChances(cards);
  for (const rarity of Object.keys(CARD_ROULETTE_CHANCES) as Array<keyof typeof CARD_ROULETTE_CHANCES>) {
    assert.ok(Math.abs(actualChances[rarity] - CARD_ROULETTE_CHANCES[rarity]) < 1e-9);
  }
  assert.equal(drawCardRoulette(cards, 0.005, 0.5).id, 'mythic');
  assert.equal(drawCardRoulette(cards, 0.015, 0.5).id, 'legendary');
  assert.equal(drawCardRoulette(cards, 0.04, 0.5).id, 'epic');
  assert.equal(drawCardRoulette(cards, 0.1, 0.5).id, 'rare');
  assert.equal(drawCardRoulette(cards, 0.4, 0.5).id, 'common');
});

test('roulette draws using admin-configured rarity chances and validates totals', () => {
  const configured = {
    comum: 50,
    raro: 20,
    epico: 15,
    lendario: 10,
    secreto: 5,
  };
  assert.equal(isValidCardRouletteChances(configured), true);
  assert.equal(getCardRouletteChances(cards, configured).raro, 20);
  assert.equal(drawCardRoulette(cards, 0.01, 0, configured).rarity, 'secreto');
  assert.equal(drawCardRoulette(cards, 0.06, 0, configured).rarity, 'lendario');
  assert.equal(drawCardRoulette(cards, 0.16, 0, configured).rarity, 'epico');
  assert.equal(drawCardRoulette(cards, 0.31, 0, configured).rarity, 'raro');
  assert.equal(drawCardRoulette(cards, 0.51, 0, configured).rarity, 'comum');
  assert.equal(isValidCardRouletteChances({ ...configured, comum: 49 }), false);
  assert.equal(isValidCardRouletteChances({ ...configured, raro: -1, comum: 51 }), false);
});

test('editing one roulette chance proportionally rebalances the other rarities to 100%', () => {
  const updated = rebalanceCardRouletteChances(CARD_ROULETTE_CHANCES, 'lendario', '20');
  assert.equal(updated.lendario, 20);
  assert.equal(updated.comum, 55.8);
  assert.equal(updated.raro, 20.2);
  assert.equal(updated.epico, 3.2);
  assert.equal(updated.secreto, 0.8);
  assert.equal(Object.values(updated).reduce((total, chance) => total + chance, 0), 100);
  assert.equal(isValidCardRouletteChances(updated), true);

  const zeroWeights = rebalanceCardRouletteChances({
    comum: 100,
    raro: 0,
    epico: 0,
    lendario: 0,
    secreto: 0,
  }, 'comum', '0');
  assert.deepEqual(zeroWeights, {
    comum: 0,
    raro: 25,
    epico: 25,
    lendario: 25,
    secreto: 25,
  });
});

test('roulette redistributes the chance of absent rarities among the available ones', () => {
  const availableCards = cards.filter(card => card.rarity === 'comum' || card.rarity === 'secreto');
  const chances = getCardRouletteChances(availableCards);
  assert.equal(chances.secreto, 1 / 70.1 * 100);
  assert.equal(chances.comum, 69.1 / 70.1 * 100);
  assert.equal(chances.raro, 0);
  assert.equal(drawCardRoulette(availableCards, 0.999, 0).rarity, 'comum');
  const zeroWeights = getCardRouletteChances(availableCards, {
    comum: 0,
    raro: 100,
    epico: 0,
    lendario: 0,
    secreto: 0,
  });
  assert.equal(zeroWeights.comum, 50);
  assert.equal(zeroWeights.secreto, 50);
  assert.equal(drawCardRoulette(availableCards, 0.75, 0, {
    comum: 0,
    raro: 100,
    epico: 0,
    lendario: 0,
    secreto: 0,
  }).rarity, 'comum');
});

test('roulette rejects invalid random values and an empty catalog', () => {
  assert.throws(() => drawCardRoulette(cards, 1, 0), /entre 0 e 1/);
  assert.throws(() => drawCardRoulette([], 0, 0), /Não há figurinhas/);
});

test('card-pack rewards validate their quantity and grant each server-drawn card', () => {
  assert.equal(cardPackRewardQuantity('1'), 1);
  assert.equal(cardPackRewardQuantity(String(CARD_PACK_REWARD_MAX)), CARD_PACK_REWARD_MAX);
  assert.equal(cardPackRewardQuantity('0'), null);
  assert.equal(cardPackRewardQuantity('1.5'), null);
  assert.equal(cardPackRewardQuantity(String(CARD_PACK_REWARD_MAX + 1)), null);

  const profile: Record<string, unknown> = { collectedCardIds: ['already-owned'] };
  const drawn = redeemCardPackRewards(
    profile,
    [{ type: 'card_pack', value: '2' }],
    cards,
    CARD_ROULETTE_CHANCES,
    () => 0.5,
  );
  assert.equal(drawn.length, 2);
  assert.deepEqual(profile.collectedCardIds, ['already-owned', 'common', 'common']);
  assert.throws(() => redeemCardPackRewards(
    {},
    [{ type: 'card_pack', value: String(CARD_PACK_REWARD_MAX + 1) }],
    cards,
    CARD_ROULETTE_CHANCES,
    () => 0.5,
  ), /quantidade de pacotes/);
  assert.throws(() => redeemCardPackRewards(
    {},
    [{ type: 'card_pack', value: '1' }],
    [],
    CARD_ROULETTE_CHANCES,
    () => 0.5,
  ), /Não há figurinhas/);
});
