import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSkinFragmentCatalog,
  addSkinFragments,
  getSkinFragmentCount,
  rollSkinFragmentQuantity,
  SKIN_FRAGMENT_PACK_COST,
  SKIN_FRAGMENT_UNLOCK_TARGET,
  SKIN_RARITY_ORDER,
  GLOBAL_REQUIRED_CHARACTER_SKINS,
  applyGlobalRequiredCharacterSkins,
  autoEquipNewlyUnlockedCharacterSkins,
  isSkinUnlocked,
  normalizeSkinRarity,
} from '../src/lib/skinFragments';
import type { Character, UserProfile } from '../src/types';

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
  assert.equal(getSkinFragmentCount({ 'naruto-sage': 59 }, 'naruto-sage'), 59);
  assert.equal(addSkinFragments(49, 10), 59);
  assert.equal(addSkinFragments(50, 7), 57);
  assert.throws(() => addSkinFragments(-1, 1), RangeError);
  for (const skinId of Object.values(GLOBAL_REQUIRED_CHARACTER_SKINS)) {
    assert.equal(isSkinUnlocked({}, skinId), true);
  }
});

test('globally required common character skins override account equipment', () => {
  const team = [{
    id: 'sasuke',
    name: 'Sasuke',
    skins: [
      { id: 'sasuke-skin-3412', name: 'Sasuke comum', image: '/common.png' },
      { id: 'sasuke-alternate', name: 'Sasuke alternativo', image: '/alternate.png' },
    ],
    selectedSkinId: 'sasuke-alternate',
    selectedSkinUrl: '/alternate.png',
  }] as Character[];

  const [sasuke] = applyGlobalRequiredCharacterSkins(team);
  assert.equal(sasuke.selectedSkinId, GLOBAL_REQUIRED_CHARACTER_SKINS.sasuke);
  assert.equal(sasuke.selectedSkinUrl, '/common.png');
});

test('skin fragment pack roll yields a uniform quantity from 1 to 10', () => {
  assert.equal(rollSkinFragmentQuantity(0), 1);
  assert.equal(rollSkinFragmentQuantity(0.0999), 1);
  assert.equal(rollSkinFragmentQuantity(0.1), 2);
  assert.equal(rollSkinFragmentQuantity(0.2999), 3);
  assert.equal(rollSkinFragmentQuantity(0.3), 4);
  assert.equal(rollSkinFragmentQuantity(0.8999), 9);
  assert.equal(rollSkinFragmentQuantity(0.9), 10);
  assert.equal(rollSkinFragmentQuantity(0.9999), 10);
  assert.throws(() => rollSkinFragmentQuantity(1), RangeError);
  assert.equal(SKIN_FRAGMENT_PACK_COST, 75_000);
  assert.equal(SKIN_FRAGMENT_UNLOCK_TARGET, 50);
});

test('newly unlocked character skins are equipped without changing prior unlocks', () => {
  const characters = [
    {
      id: 'naruto',
      name: 'Naruto',
      skins: [
        { id: 'naruto-sage', name: 'Modo Sábio', image: '/sage.png' },
        { id: 'naruto-kurama', name: 'Kurama', image: '/kurama.png' },
      ],
    },
  ] as Character[];
  const previousUser = {
    unlockedSkins: ['naruto-sage'],
    equippedCharacterSkins: { naruto: 'naruto-sage' },
  };
  const updatedUser: UserProfile = {
    username: 'test',
    name: 'Test',
    photoUrl: '',
    unlockedSkins: ['naruto-sage', 'naruto-kurama'],
  };

  const result = autoEquipNewlyUnlockedCharacterSkins(previousUser, updatedUser, characters);
  assert.equal(result.equippedCharacterSkins?.naruto, 'naruto-kurama');
  assert.deepEqual(updatedUser.equippedCharacterSkins, undefined);
});

test('skin unlock evaluation also auto-equips when fragments reach the threshold', () => {
  const characters = [{
    id: 'sasuke',
    name: 'Sasuke',
    skins: [{ id: 'sasuke-hebi', name: 'Hebi', image: '/hebi.png' }],
  }] as Character[];
  const updatedUser: UserProfile = {
    username: 'test',
    name: 'Test',
    photoUrl: '',
    skinFragments: { 'sasuke-hebi': 50 },
  };
  const result = autoEquipNewlyUnlockedCharacterSkins(
    { skinFragments: { 'sasuke-hebi': 49 } },
    updatedUser,
    characters,
  );

  assert.equal(result.equippedCharacterSkins?.sasuke, 'sasuke-hebi');
});

test('newly unlocked skill skins are equipped on their character and skill', () => {
  const shopItems = [{
    id: 'skill-skin-rasengan-perfect',
    name: 'Rasengan Perfeito',
    category: 'skill_skin',
    description: '',
    currency: 'ryos',
    price: 1500,
    skillCharacterId: 'naruto',
    skillName: 'Rasengan',
  }] as const;
  const result = autoEquipNewlyUnlockedCharacterSkins(
    { unlockedSkillSkins: [] },
    {
      username: 'test',
      name: 'Test',
      photoUrl: '',
      unlockedSkillSkins: ['skill-skin-rasengan-perfect'],
    },
    [],
    [...shopItems],
  );

  assert.equal(result.equippedSkillSkins?.['naruto:Rasengan'], 'skill-skin-rasengan-perfect');
});
