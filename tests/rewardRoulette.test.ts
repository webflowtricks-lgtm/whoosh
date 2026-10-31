import assert from 'node:assert/strict';
import test from 'node:test';
import type { NinjaCard } from '../src/types';
import {
  appendRewardRouletteHistory,
  buildRewardRoulettePool,
  drawRewardRoulettePrize,
  drawRewardRouletteSpin,
  grantRewardRoulettePrize,
  REWARD_ROULETTE_COST,
  REWARD_ROULETTE_LEGENDARY_INTERVAL,
  REWARD_ROULETTE_HISTORY_LIMIT,
  REWARD_ROULETTE_MAX_SPINS,
} from '../src/lib/rewardRoulette';

const testCards: NinjaCard[] = [
  {
    id: 'naruto-base',
    characterId: 'naruto',
    characterName: 'Naruto',
    slug: 'naruto',
    rarity: 'comum',
    title: 'Clássico',
    description: '',
    points: 1,
  },
  {
    id: 'itachi-legend',
    characterId: 'itachi',
    characterName: 'Itachi',
    slug: 'itachi',
    rarity: 'lendario',
    title: 'Lendário',
    description: '',
    points: 20,
  },
];

const testProfileBanners = [{
  id: 'The Prodigal Son',
  name: 'The Prodigal Son',
  imageUrl: 'data:image/webp;base64,profile-banner',
}];

test('reward roulette pool includes coins, collectible voices, character skins, and cards', () => {
  const pool = buildRewardRoulettePool([
    {
      id: 'kakashi',
      name: 'Kakashi',
      skins: [{ id: 'kakashi-mythic', name: 'Kakashi Mítico', image: '/kakashi.png', rarity: 'mitica' }],
    },
  ], testCards, testProfileBanners);

  assert.ok(pool.some(prize => prize.kind === 'ryos' && prize.amount === 10));
  assert.ok(pool.some(prize => prize.kind === 'voice' && prize.name === 'Kakashi' && prize.rarity === 'lendaria'));
  assert.ok(pool.some(prize => prize.id === 'ryos-300-legendary' && prize.rarity === 'lendaria'));
  assert.ok(pool.some(prize => prize.kind === 'skin' && prize.rarity === 'mitica'));
  assert.ok(pool.some(prize => prize.kind === 'card' && prize.cardId === 'naruto-base'));
  assert.ok(pool.some(prize => prize.kind === 'card' && prize.rarity === 'lendaria'));
  assert.ok(pool.some(prize =>
    prize.kind === 'banner' &&
    prize.rarity === 'epica' &&
    prize.bannerId === 'The Prodigal Son' &&
    prize.name === 'The Prodigal Son' &&
    prize.imageUrl === testProfileBanners[0].imageUrl,
  ));
  assert.equal(REWARD_ROULETTE_COST, 25);
  assert.equal(REWARD_ROULETTE_MAX_SPINS, 10);
  assert.equal(REWARD_ROULETTE_LEGENDARY_INTERVAL, 10);
});

test('reward roulette selects the requested rarity band and rejects invalid values', () => {
  const pool = buildRewardRoulettePool([], testCards);
  const common = drawRewardRoulettePrize(pool, 0, 0);
  const mythic = drawRewardRoulettePrize(pool, 0.999, 0);

  assert.equal(common.rarity, 'comum');
  assert.equal(mythic.rarity, 'lendaria');
  assert.throws(() => drawRewardRoulettePrize(pool, 1, 0), RangeError);
});

test('reward roulette allows the same prize to be drawn repeatedly', () => {
  const pool = buildRewardRoulettePool([], []);
  const draws = Array.from({ length: 5 }, () => drawRewardRoulettePrize(pool, 0, 0));

  assert.equal(new Set(draws.map(prize => prize.id)).size, 1);
});

test('every tenth reward roulette spin is guaranteed legendary and resets the counter', () => {
  const prizes = buildRewardRoulettePool([], []);
  const profile: Record<string, unknown> = { ryos: 1000 };
  for (let spin = 1; spin < REWARD_ROULETTE_LEGENDARY_INTERVAL; spin++) {
    const draw = drawRewardRouletteSpin(profile, prizes, 0, 0);
    assert.equal(draw.guaranteedLegendary, false);
    assert.equal(draw.spinsUntilLegendary, REWARD_ROULETTE_LEGENDARY_INTERVAL - spin);
  }

  const guaranteed = drawRewardRouletteSpin(profile, prizes, 0, 0);
  assert.equal(guaranteed.guaranteedLegendary, true);
  assert.equal(guaranteed.prize.rarity, 'lendaria');
  assert.equal(guaranteed.spinsUntilLegendary, REWARD_ROULETTE_LEGENDARY_INTERVAL);
  assert.equal(profile.rewardRouletteSpinCount, 0);
});

test('a random legendary resets the guarantee counter before the tenth spin', () => {
  const prizes = [
    { id: 'common', kind: 'ryos' as const, rarity: 'comum' as const, name: 'Common', amount: 1 },
    { id: 'legendary', kind: 'ryos' as const, rarity: 'lendaria' as const, name: 'Legendary', amount: 2 },
  ];
  const profile: Record<string, unknown> = { ryos: 1000 };
  const earlyLegendary = drawRewardRouletteSpin(profile, prizes, 0.99, 0);
  assert.equal(earlyLegendary.prize.rarity, 'lendaria');
  assert.equal(earlyLegendary.guaranteedLegendary, false);
  assert.equal(earlyLegendary.spinsUntilLegendary, REWARD_ROULETTE_LEGENDARY_INTERVAL);
  assert.equal(profile.rewardRouletteSpinCount, 0);

  const nextDraw = drawRewardRouletteSpin(profile, prizes, 0, 0);
  assert.equal(nextDraw.guaranteedLegendary, false);
  assert.equal(nextDraw.spinsUntilLegendary, REWARD_ROULETTE_LEGENDARY_INTERVAL - 1);
});

test('reward roulette grants ryos, skins, voices, and duplicate compensation', () => {
  const profile: Record<string, unknown> = { ryos: 100, unlockedSkins: [], unlockedVoiceIds: [], collectedCardIds: [] };
  const skin = {
    id: 'skin-kakashi',
    kind: 'skin' as const,
    rarity: 'mitica' as const,
    name: 'Kakashi Mítico',
    skinId: 'kakashi-mythic',
  };
  const voice = {
    id: 'voice-kakashi',
    kind: 'voice' as const,
    rarity: 'lendaria' as const,
    name: 'Kakashi',
    voiceId: 'kakashi-jutsucopiado',
  };

  grantRewardRoulettePrize(profile, { id: 'ryos-20', kind: 'ryos', rarity: 'comum', name: '20 Ryos', amount: 20 });
  grantRewardRoulettePrize(profile, skin);
  grantRewardRoulettePrize(profile, voice);
  const duplicateSkin = grantRewardRoulettePrize(profile, skin);
  const duplicateVoice = grantRewardRoulettePrize(profile, voice);

  assert.equal(profile.ryos, 195);
  assert.deepEqual(profile.unlockedSkins, ['kakashi-mythic']);
  assert.deepEqual(profile.unlockedVoiceIds, ['kakashi-jutsucopiado']);
  assert.equal(duplicateSkin.duplicate, true);
  assert.equal(duplicateVoice.duplicate, true);
});

test('reward roulette unlocks the epic banner and compensates duplicates', () => {
  const profile: Record<string, unknown> = { ryos: 100, unlockedBanners: [], unlockedBannerUrls: [] };
  const banner = {
    id: 'profile-banner-The Prodigal Son',
    kind: 'banner' as const,
    rarity: 'epica' as const,
    name: 'The Prodigal Son',
    bannerId: 'The Prodigal Son',
    imageUrl: testProfileBanners[0].imageUrl,
  };

  grantRewardRoulettePrize(profile, banner);
  const duplicate = grantRewardRoulettePrize(profile, banner);

  assert.deepEqual(profile.unlockedBanners, ['The Prodigal Son']);
  assert.deepEqual(profile.unlockedBannerUrls, [testProfileBanners[0].imageUrl]);
  assert.equal(profile.ryos, 150);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.prize.kind, 'ryos');
});

test('reward roulette preserves collectible card duplicates and rejects unsafe balances', () => {
  const profile: Record<string, unknown> = { ryos: Number.MAX_SAFE_INTEGER };
  const card = {
    id: 'card-naruto',
    kind: 'card' as const,
    rarity: 'comum' as const,
    name: 'Naruto',
    cardId: 'naruto-base',
  };

  grantRewardRoulettePrize(profile, card);
  const duplicate = grantRewardRoulettePrize(profile, card);
  assert.deepEqual(profile.collectedCardIds, ['naruto-base', 'naruto-base']);
  assert.equal(duplicate.duplicate, true);
  assert.throws(() => grantRewardRoulettePrize(profile, {
    id: 'too-many',
    kind: 'ryos',
    rarity: 'comum',
    name: 'Many Ryos',
    amount: 1,
  }), RangeError);
});

test('reward roulette history keeps newest rewards and omits repeated banner image data', () => {
  const profile: Record<string, unknown> = {};
  const prize = {
    id: 'profile-banner-test',
    kind: 'banner' as const,
    rarity: 'epica' as const,
    name: 'Test banner',
    bannerId: 'test-banner',
    imageUrl: 'data:image/webp;base64,large-image',
  };
  const draw = { prize, spinsUntilLegendary: 9 };

  const firstBatch = appendRewardRouletteHistory(profile, [draw], 'batch-1', '2026-10-31T12:00:00.000Z');
  assert.equal(firstBatch.length, 1);
  assert.equal(firstBatch[0].id, 'batch-1-1');
  assert.equal(firstBatch[0].draw.prize.imageUrl, undefined);

  const history = appendRewardRouletteHistory(
    profile,
    Array.from({ length: REWARD_ROULETTE_HISTORY_LIMIT + 1 }, (_, index) => ({
      prize: { ...prize, id: `banner-${index}` },
    })),
    'batch-2',
    '2026-10-31T13:00:00.000Z',
  );
  assert.equal(history.length, REWARD_ROULETTE_HISTORY_LIMIT);
  assert.equal(history[0].id, 'batch-2-1');
  assert.equal(history[history.length - 1].id, `batch-2-${REWARD_ROULETTE_HISTORY_LIMIT}`);
  assert.equal(history.some(entry => entry.id === 'batch-1-1'), false);
  assert.equal((profile.rewardRouletteHistory as unknown[]).length, REWARD_ROULETTE_HISTORY_LIMIT);
});
