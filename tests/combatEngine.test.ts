import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Character, CombatCharacter } from '../src/types';
import {
  resolveCombatIntent,
  type CombatEngineState,
} from '../src/lib/combatEngine';

const catalog = JSON.parse(
  readFileSync(new URL('../src/data/custom_characters.json', import.meta.url), 'utf8'),
) as Character[];

function character(name: string): Character {
  const result = catalog.find(item => item.name === name);
  assert.ok(result, `Expected ${name} to exist in the configured catalog`);
  return structuredClone(result);
}

function combatant(id: string, selectedCharacter: Character, updates: Partial<CombatCharacter> = {}): CombatCharacter {
  return {
    id,
    character: structuredClone(selectedCharacter),
    health: 100,
    maxHealth: 100,
    shield: 0,
    activeEffects: [],
    isDead: false,
    ...updates,
  };
}

function createState(options: {
  playerCharacter?: Character;
  playerAllies?: Character[];
  enemyCharacter?: Character;
  enemyUpdates?: Partial<CombatCharacter>;
  playerChakra?: CombatEngineState['playerChakra'];
  activeSide?: CombatEngineState['activeSide'];
} = {}): CombatEngineState {
  return {
    turn: 1,
    activeSide: options.activeSide || 'player',
    player: [
      combatant('player-0', options.playerCharacter || character('Tenten')),
      ...(options.playerAllies || []).map((ally, index) => combatant(`player-${index + 1}`, ally)),
    ],
    enemy: [combatant('enemy-0', options.enemyCharacter || character('Tenten'), options.enemyUpdates)],
    playerChakra: options.playerChakra || { Tai: 1, Nin: 1, Gen: 0, Blood: 0 },
    enemyChakra: { Tai: 1, Nin: 1, Gen: 0, Blood: 0 },
  };
}

function intent(skillName: string, state: CombatEngineState = createState()) {
  const skillIndex = state.player[0].character.skills.findIndex(skill => skill.name === skillName);
  assert.notEqual(skillIndex, -1, `${skillName} is in the real character catalog`);
  return {
    state,
    intent: { side: 'player' as const, sourceId: 'player-0', skillIndex, targetId: 'enemy-0' },
  };
}

test('resolves catalog Tenten Jidanda base damage, cost, and cooldown', () => {
  const { state, intent: action } = intent('Jidanda', createState({
    playerCharacter: character('Tenten'),
    playerChakra: { Tai: 1, Nin: 1, Gen: 0, Blood: 0 },
  }));

  const result = resolveCombatIntent(state, action);

  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') return;
  assert.equal(result.state.enemy[0].health, 65);
  assert.equal(result.state.playerChakra.Tai, 0);
  assert.equal(result.state.playerChakra.Nin, 0);
  assert.equal(result.state.player[0].character.skills[action.skillIndex].currentCooldown, 1);
  assert.equal(state.enemy[0].health, 100, 'the input snapshot remains immutable');
});

test('resolves Naruto conditional damage and chakra-cost rules authoritatively', () => {
  const state = createState({
    playerCharacter: character('Naruto Uzumaki'),
    playerChakra: { Tai: 2, Nin: 0, Gen: 0, Blood: 0 },
  });
  const setupSkillIndex = state.player[0].character.skills.findIndex(skill => skill.name === 'Shadow Clones');
  assert.notEqual(setupSkillIndex, -1);
  const setup = resolveCombatIntent(state, {
    side: 'player',
    sourceId: 'player-0',
    skillIndex: setupSkillIndex,
    targetId: 'player-0',
  });
  assert.equal(setup.status, 'applied');
  if (setup.status !== 'applied') return;
  const { intent: action } = intent('Uzumaki Barrage', state);

  const resolved = resolveCombatIntent(setup.state, action);

  assert.equal(resolved.status, 'applied');
  if (resolved.status !== 'applied') return;
  assert.equal(resolved.state.enemy[0].health, 65);
  assert.equal(resolved.state.playerChakra.Tai, 0);
  assert.equal(resolved.state.playerChakra.Nin, 0);
});

test('applies configured stun-only actions and enforces their blocked skill classes', () => {
  const state = createState({
    playerCharacter: character('Ino Yamanaka'),
    playerChakra: { Tai: 0, Nin: 0, Gen: 2, Blood: 0 },
  });
  const { intent: action } = intent('Mind Transfer', state);

  const resolved = resolveCombatIntent(state, action);

  assert.equal(resolved.status, 'applied');
  if (resolved.status !== 'applied') return;
  const stun = resolved.state.enemy[0].activeEffects.find(effect => effect.type === 'stun');
  assert.equal(stun?.duration, 3);
  assert.deepEqual(stun?.stunType, ['physical', 'mental', 'affliction', 'chakra']);
  assert.equal(resolved.state.enemy[0].health, 100);
});

test('resolves catalog Shiranui Genma direct damage and shield absorption', () => {
  const state = createState({
    playerCharacter: character('Shiranui Genma'),
    enemyUpdates: { shield: 7 },
  });
  const { intent: action } = intent('Prepared Toothpick Shot', state);

  const result = resolveCombatIntent(state, action);

  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') return;
  assert.equal(result.state.enemy[0].health, 87);
  assert.equal(result.state.enemy[0].shield, 0);
  assert.equal(result.state.playerChakra.Tai, 0);
});

test('resolves Sakura Healing Technique on a selected ally and caps HP at the legacy 100', () => {
  const state = createState({
    playerCharacter: character('Sakura Haruno'),
    playerAllies: [character('Tenten')],
  });
  state.player[1].health = 90;
  const skillIndex = state.player[0].character.skills.findIndex(skill => skill.name === 'Healing Technique');
  assert.notEqual(skillIndex, -1);

  const result = resolveCombatIntent(state, {
    side: 'player',
    sourceId: 'player-0',
    skillIndex,
    targetId: 'player-1',
  });

  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') return;
  assert.equal(result.state.player[1].health, 100);
  assert.deepEqual(result.events.find(event => event.type === 'heal'), {
    type: 'heal',
    targetId: 'player-1',
    health: 100,
    healed: 10,
  });
  assert.equal(result.state.playerChakra.Nin, 0);
});

test('resolves catalog self shield and preserves its maximum cap', () => {
  const state = createState({ playerCharacter: character('Gaara of the Sand') });
  state.player[0].shield = 20;
  const skillIndex = state.player[0].character.skills.findIndex(skill => skill.name === 'Sand Armor');
  assert.notEqual(skillIndex, -1);

  const result = resolveCombatIntent(state, {
    side: 'player',
    sourceId: 'player-0',
    skillIndex,
    targetId: 'player-0',
  });

  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') return;
  assert.equal(result.state.player[0].shield, 40);
  assert.equal(result.state.player[0].shieldExpiresTurn, undefined);
  assert.deepEqual(result.events.find(event => event.type === 'shield'), {
    type: 'shield',
    targetId: 'player-0',
    shield: 40,
    added: 20,
    expiresTurn: undefined,
  });
});

test('resolves catalog AllAllies shield and friendly-effect immunity', () => {
  const state = createState({
    playerCharacter: character('Shino Aburame'),
    playerAllies: [character('Tenten')],
  });
  state.player[1].activeEffects.push({
    name: 'Cannot receive friendly effects',
    type: 'cannot_receive_friendly',
    duration: 1,
  });
  const skillIndex = state.player[0].character.skills.findIndex(skill => skill.name === 'Wall of Insects');
  assert.notEqual(skillIndex, -1);

  const result = resolveCombatIntent(state, {
    side: 'player',
    sourceId: 'player-0',
    skillIndex,
    targetId: 'player-1',
  });

  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') return;
  assert.deepEqual(result.state.player.map(ally => ally.shield), [25, 25]);

  const blockedState = createState({
    playerCharacter: character('Sakura Haruno'),
    playerAllies: [character('Tenten')],
  });
  blockedState.player[1].health = 70;
  blockedState.player[1].activeEffects.push({
    name: 'Cannot receive friendly effects',
    type: 'cannot_receive_friendly',
    duration: 1,
  });
  const healIndex = blockedState.player[0].character.skills.findIndex(skill => skill.name === 'Healing Technique');
  const blocked = resolveCombatIntent(blockedState, {
    side: 'player',
    sourceId: 'player-0',
    skillIndex: healIndex,
    targetId: 'player-1',
  });
  assert.equal(blocked.status, 'applied');
  if (blocked.status !== 'applied') return;
  assert.equal(blocked.state.player[1].health, 70);
  assert.ok(blocked.events.some(event =>
    event.type === 'friendly-effect-blocked' && event.effect === 'heal',
  ));
});

test('rejects invalid targets and insufficient chakra without mutating state', () => {
  const state = createState({ playerCharacter: character('Tenten'), playerChakra: { Tai: 0, Nin: 0, Gen: 0, Blood: 0 } });
  const { intent: action } = intent('Jidanda', state);

  const unaffordable = resolveCombatIntent(state, action);
  assert.equal(unaffordable.status, 'rejected');
  if (unaffordable.status === 'rejected') assert.equal(unaffordable.code, 'insufficient-chakra');

  const badTarget = resolveCombatIntent(state, { ...action, targetId: 'player-0' });
  assert.equal(badTarget.status, 'rejected');
  if (badTarget.status === 'rejected') assert.equal(badTarget.code, 'invalid-target');
  assert.equal(state.enemy[0].health, 100);
});

test('rejects cooldown, stun, wrong phase, and invulnerable target actions', () => {
  const cooldownState = createState({ playerCharacter: character('Tenten') });
  const cooldown = intent('Jidanda', cooldownState);
  cooldownState.player[0].character.skills[cooldown.intent.skillIndex].currentCooldown = 1;
  const cooldownResult = resolveCombatIntent(cooldownState, cooldown.intent);
  assert.equal(cooldownResult.status, 'rejected');
  if (cooldownResult.status === 'rejected') assert.equal(cooldownResult.code, 'skill-on-cooldown');

  const stunnedState = createState({ playerCharacter: character('Tenten') });
  stunnedState.player[0].activeEffects.push({ name: 'Test stun', type: 'stun', duration: 1 });
  const stunned = intent('Jidanda', stunnedState);
  const stunnedResult = resolveCombatIntent(stunnedState, stunned.intent);
  assert.equal(stunnedResult.status, 'rejected');
  if (stunnedResult.status === 'rejected') assert.equal(stunnedResult.code, 'source-cannot-act');

  const wrongPhase = resolveCombatIntent(
    { ...stunnedState, activeSide: 'enemy' },
    stunned.intent,
  );
  assert.equal(wrongPhase.status, 'rejected');
  if (wrongPhase.status === 'rejected') assert.equal(wrongPhase.code, 'wrong-turn');

  const protectedState = createState({
    playerCharacter: character('Tenten'),
    enemyUpdates: {
      activeEffects: [{ name: 'Test invulnerability', type: 'invulnerable', duration: 1, invulnerableTypes: ['chakra', 'physical'] }],
    },
  });
  const protectedAction = intent('Jidanda', protectedState);
  const protectedResult = resolveCombatIntent(protectedState, protectedAction.intent);
  assert.equal(protectedResult.status, 'rejected');
  if (protectedResult.status === 'rejected') assert.equal(protectedResult.code, 'target-invulnerable');
});

test('keeps unported real mechanics out of the pilot resolver', () => {
  const state = createState({ playerCharacter: character('ANBU Kakashi') });
  const action = intent('Raikiri', state);
  const result = resolveCombatIntent(state, action.intent);

  assert.equal(result.status, 'unsupported');
  if (result.status === 'unsupported') assert.equal(result.code, 'skill-mechanics-not-ported');
  assert.equal(state.enemy[0].health, 100);
});

test('explicitly rejects representative catalog skills from unported mechanic groups', () => {
  const samples = [
    ['Kiba Inuzuka', 'Two-Headed Wolf'],
    ['Zaku Abumi', 'Wallof Air'],
    ['Yamanaka Inoichi', 'Full Body Takeover'],
    ['Waraji & Zori', 'Bodyguard'],
    ['ANBU Kinoe', 'Wood Arm Binding'],
    ['Haku', 'Thousand Needles of Death'],
    ['Shizune', 'Healing Resuscitation Regeneration'],
    ['Hinata Hyuga', 'Sixty-Four Palms'],
  ] as const;

  for (const [characterName, skillName] of samples) {
    const state = createState({ playerCharacter: character(characterName) });
    const { intent: action } = intent(skillName, state);
    const result = resolveCombatIntent(state, action);

    assert.equal(result.status, 'unsupported', `${characterName} / ${skillName} must not be partially simulated`);
    assert.equal(state.enemy[0].health, 100);
  }
});

test('handles a catalog damage skill with a revive-on-death effect', () => {
  const state = createState({
    playerCharacter: character('Tenten'),
    enemyUpdates: {
      health: 30,
      activeEffects: [{
        name: 'Stored resurrection',
        type: 'revive_on_death',
        value: 40,
        stacks: 2,
        duration: 99999,
      }],
    },
  });
  const { intent: action } = intent('Jidanda', state);

  const result = resolveCombatIntent(state, action);

  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') return;
  assert.equal(result.state.enemy[0].health, 40);
  assert.equal(result.state.enemy[0].isDead, false);
  assert.equal(result.state.enemy[0].hasRevived, true);
  assert.equal(result.state.enemy[0].activeEffects[0].stacks, 1);
  assert.deepEqual(result.events[2], { type: 'revive', targetId: 'enemy-0', health: 40 });
});

test('declares victory only after the whole opposing team is dead', () => {
  const state = createState({
    playerCharacter: character('Tenten'),
    enemyUpdates: { health: 20 },
  });
  const { intent: action } = intent('Jidanda', state);

  const result = resolveCombatIntent(state, action);

  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') return;
  assert.equal(result.state.winnerSide, 'player');
  assert.ok(result.events.some(event =>
    event.type === 'match-ended' && event.winnerSide === 'player',
  ));
  assert.equal(resolveCombatIntent(result.state, action).status, 'rejected');
});

test('uses catalog damage immunity and damage reduction without trusting client results', () => {
  const state = createState({
    playerCharacter: character('Tenten'),
    enemyUpdates: {
      activeEffects: [
        { name: 'Guard', type: 'damage_reduction', value: 10, duration: 1 },
      ],
    },
  });
  const { intent: action } = intent('Jidanda', state);
  const reduced = resolveCombatIntent(state, action);
  assert.equal(reduced.status, 'applied');
  if (reduced.status !== 'applied') return;
  assert.equal(reduced.state.enemy[0].health, 75);

  const immuneState = createState({
    playerCharacter: character('Tenten'),
    enemyUpdates: {
      activeEffects: [{
        name: 'First physical immunity',
        type: 'damage_immunity',
        duration: 1,
        immunityTypes: ['physical'],
        firstHitOnly: true,
      }],
    },
  });
  const immuneAction = intent('Jidanda', immuneState);
  const immune = resolveCombatIntent(immuneState, immuneAction.intent);
  assert.equal(immune.status, 'applied');
  if (immune.status !== 'applied') return;
  assert.equal(immune.state.enemy[0].health, 100);
  assert.equal(immune.state.enemy[0].activeEffects.length, 0);
});

test('refuses to partially apply a skill with multiple damage channels', () => {
  const state = createState({ playerCharacter: character('Tenten') });
  const { intent: action } = intent('Jidanda', state);
  state.player[0].character.skills[action.skillIndex].directDamage = 12;

  const result = resolveCombatIntent(state, action);

  assert.equal(result.status, 'unsupported');
  if (result.status === 'unsupported') {
    assert.equal(result.code, 'multiple-damage-channels-not-ported');
  }
  assert.equal(state.enemy[0].health, 100);
});
