import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSkinFragmentCatalog,
  rollSkinFragmentQuantity,
  SKIN_FRAGMENT_PACK_COST,
  SKIN_FRAGMENT_UNLOCK_TARGET,
  SKIN_RARITY_ORDER,
  isSkinUnlocked,
  normalizeSkinRarity,
} from '../src/lib/skinFragments';

test('skin fragment catalog keeps unique, usable skin entries', () => {
  const skins = getSkinFragmentCatalog([
    {
      name: 'Naruto',
      skins: [
        { id: 'naruto-sage', name: 'Modo Sábio', image: '/sage.png', rarity: 'lendaria' },
        { id: 'naruto-sage', name: 'Duplicada', image: '/duplicate.png' },
        { id: '', name: 'Sem ID', image: '/invalid.png' },
      ],
    },
    { name: 'Sasuke', skins: [{ id: 'sasuke-hebi', name: 'Hebi', image: '/hebi.png' }] },
    { name: 'Sem skins', skins: [] },
  ]);

  assert.deepEqual(skins.map(skin => [skin.id, skin.characterName, skin.rarity]), [
    ['naruto-sage', 'Naruto', 'lendaria'],
    ['sasuke-hebi', 'Sasuke', 'comum'],
  ]);
  assert.deepEqual(SKIN_RARITY_ORDER, ['comum', 'rara', 'epica', 'lendaria', 'mitica']);
  assert.equal(normalizeSkinRarity('invalid'), 'comum');
  assert.equal(isSkinUnlocked({ unlockedSkins: ['naruto-sage'] }, 'naruto-sage'), true);
  assert.equal(isSkinUnlocked({ skinFragments: { 'naruto-sage': 50 } }, 'naruto-sage'), true);
  assert.equal(isSkinUnlocked({ skinFragments: { 'naruto-sage': 49 } }, 'naruto-sage'), false);
});

test('skin fragment pack roll is weighted toward one fragment and always yields 1-3', () => {
  assert.equal(rollSkinFragmentQuantity(0), 1);
  assert.equal(rollSkinFragmentQuantity(0.7999), 1);
  assert.equal(rollSkinFragmentQuantity(0.8), 2);
  assert.equal(rollSkinFragmentQuantity(0.9799), 2);
  assert.equal(rollSkinFragmentQuantity(0.98), 3);
  assert.throws(() => rollSkinFragmentQuantity(1), RangeError);
  assert.equal(SKIN_FRAGMENT_PACK_COST, 75_000);
  assert.equal(SKIN_FRAGMENT_UNLOCK_TARGET, 50);
});
