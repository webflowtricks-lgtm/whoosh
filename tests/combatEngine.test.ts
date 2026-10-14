import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Character, CombatCharacter } from '../src/types';
import {
  resolveCombatIntent,
  tickAuthoritativeCombatEffects,
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

test('Kakashi copies the selected enemy skill and emits an authoritative copy event', () => {
  const state = createState({
    playerCharacter: character('Kakashi Hatake'),
    playerChakra: { Tai: 1, Nin: 1, Gen: 1, Blood: 1 },
  });
  const selectedTarget = character('Young Rin');
  state.enemy.push(combatant('enemy-1', character('Tenten')));
  state.enemy.push(combatant('enemy-2', selectedTarget));
  const skillIndex = state.player[0].character.skills.findIndex(skill => skill.name === 'Copied Sharingan');
  assert.notEqual(skillIndex, -1);

  const result = resolveCombatIntent(state, {
    side: 'player',
    sourceId: 'player-0',
    skillIndex,
    targetId: 'enemy-2',
  });

  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') return;
  const copiedSkills = result.state.player[0].character.skills;
  const expectedCopiedSkill = selectedTarget.skills[(state.turn + skillIndex) % selectedTarget.skills.length];
  assert.equal(copiedSkills[skillIndex].name, expectedCopiedSkill.name);
  const copyEvent = result.events.find(event => event.type === 'skill-copy');
  assert.ok(copyEvent);
  if (copyEvent?.type !== 'skill-copy') return;
  assert.equal(copyEvent.sourceId, 'player-0');
  assert.equal(copyEvent.targetId, 'enemy-2');
  assert.equal(copyEvent.skillName, 'Copied Sharingan');
});

test('applies configured damage buffs and debuffs before subsequent attacks', () => {
  const state = createState({
    playerCharacter: character('Tenten'),
    playerChakra: { Tai: 4, Nin: 4, Gen: 0, Blood: 0 },
  });
  const setupSkill = state.player[0].character.skills[0];
  Object.assign(setupSkill, {
    name: 'Test Damage Modifiers',
    cost: [],
    cooldown: 0,
    targetType: 'Enemy',
    damage: 0,
    directDamage: 0,
    damageDebuffVal: 5,
    damageDebuffDuration: 2,
    damageDebuffTypes: ['skill'],
    damageBuffVal: 8,
    damageBuffDuration: 2,
    damageBuffTarget: 'Self',
  });

  const setup = resolveCombatIntent(state, {
    side: 'player',
    sourceId: 'player-0',
    skillIndex: 0,
    targetId: 'enemy-0',
  });
  assert.equal(setup.status, 'applied');
  if (setup.status !== 'applied') return;
  assert.equal(setup.state.player[0].activeEffects.some(effect => effect.type === 'damage_buff'), true);
  assert.equal(setup.state.enemy[0].activeEffects.some(effect => effect.type === 'damage_debuff'), true);

  const attackIndex = setup.state.player[0].character.skills.findIndex(skill => skill.name === 'Jidanda');
  const attack = resolveCombatIntent(setup.state, {
    side: 'player',
    sourceId: 'player-0',
    skillIndex: attackIndex,
    targetId: 'enemy-0',
  });

  assert.equal(attack.status, 'applied');
  if (attack.status !== 'applied') return;
  assert.equal(attack.state.enemy[0].health, 62);
});

test('Young Nagato Amateur Rinnegan resolves reveal effects on all allies', () => {
  const state = createState({
    playerCharacter: character('Young Nagato'),
    playerAllies: [character('Tenten'), character('Shikamaru Nara')],
  });
  const { intent: action } = intent('Amateur Rinnegan', state);

  const result = resolveCombatIntent(state, action);

  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') return;
  assert.deepEqual(
    result.state.player.map(ally => ally.activeEffects.some(effect => effect.type === 'reveal_invisible')),
    [true, true, true],
  );
});

test('Young Kakashi Implanted Sharingan reacts to observed chakra, damage, and stun skills', () => {
  const state = createState({
    playerCharacter: character('Young Kakashi'),
    enemyCharacter: character('Tenten'),
    playerChakra: { Tai: 10, Nin: 10, Gen: 10, Blood: 10 },
  });
  const { intent: observeAction } = intent('Implanted Sharingan', state);
  const observed = resolveCombatIntent(state, observeAction);
  assert.equal(observed.status, 'applied');
  if (observed.status !== 'applied') return;
  assert.ok(observed.state.enemy[0].activeEffects.some(effect =>
    effect.type === 'on_skill_use_damage' && effect.opponentSkillUseRule,
  ));

  const enemy = observed.state.enemy[0];
  const enemySkillIndex = enemy.character.skills.findIndex(skill => skill.name === 'Jidanda');
  assert.notEqual(enemySkillIndex, -1);
  Object.assign(enemy.character.skills[enemySkillIndex], {
    cost: [],
    damage: 20,
    removeChakra: 1,
    stunTurns: 1,
  });
  observed.state.playerChakra = { Tai: 0, Nin: 0, Gen: 0, Blood: 0 };
  observed.state.player[0].activeEffects.push({
    name: 'Test Ignore Stun',
    type: 'ignore_stun',
    duration: 99,
  });
  const chakraBefore = Object.values(observed.state.playerChakra).reduce((sum, value) => sum + value, 0);
  observed.state.activeSide = 'enemy';

  const enemyAction = resolveCombatIntent(observed.state, {
    side: 'enemy',
    sourceId: 'enemy-0',
    skillIndex: enemySkillIndex,
    targetId: 'player-0',
  });
  assert.equal(enemyAction.status, 'applied');
  if (enemyAction.status !== 'applied') return;
  assert.equal(
    Object.values(enemyAction.state.playerChakra).reduce((sum, value) => sum + value, 0),
    chakraBefore + 1,
  );

  const kakashi = enemyAction.state.player[0];
  const kakashiSkillIndex = kakashi.character.skills.findIndex(skill =>
    (skill.damage || 0) > 0 || (skill.directDamage || 0) > 0,
  );
  assert.notEqual(kakashiSkillIndex, -1);
  kakashi.character.skills[kakashiSkillIndex].cost = [];
  enemyAction.state.activeSide = 'player';
  const targetHealth = enemyAction.state.enemy[0].health;
  const kakashiAction = resolveCombatIntent(enemyAction.state, {
    side: 'player',
    sourceId: 'player-0',
    skillIndex: kakashiSkillIndex,
    targetId: 'enemy-0',
  });

  assert.equal(kakashiAction.status, 'applied');
  if (kakashiAction.status !== 'applied') return;
  const kakashiSkill = kakashi.character.skills[kakashiSkillIndex];
  const expectedDamage = (kakashiSkill.damage || kakashiSkill.directDamage || 0) + 10;
  assert.equal(targetHealth - kakashiAction.state.enemy[0].health, expectedDamage);
  const stun = kakashiAction.state.enemy[0].activeEffects.find(effect => effect.type === 'stun');
  assert.equal(stun?.duration, 1);
  assert.deepEqual(stun?.stunType, ['physical', 'mental', 'affliction', 'chakra']);
  assert.equal(
    kakashiAction.state.player[0].activeEffects.some(effect => effect.opponentSkillUseTriggered),
    false,
  );
});

test('Maito Gai Leaf Hurricane partially bypasses configured damage reduction', () => {
  const state = createState({
    playerCharacter: character('Maito Gai'),
    enemyUpdates: {
      activeEffects: [{ name: 'Guard', type: 'damage_reduction', value: 15, duration: 1 }],
    },
  });
  const { intent: action } = intent('Leaf Hurricane', state);

  const result = resolveCombatIntent(state, action);

  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') return;
  assert.equal(result.state.enemy[0].health, 80);
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

test('resolves catalog all-enemy attacks, splash damage, and target stacks', () => {
  const state = createState({ playerCharacter: character('Tenten') });
  state.enemy.push(combatant('enemy-1', character('Tenten')), combatant('enemy-2', character('Tenten')));
  const { intent: action } = intent('Rising Twin Dragons', state);

  const resolved = resolveCombatIntent(state, action);

  assert.equal(resolved.status, 'applied');
  if (resolved.status !== 'applied') return;
  assert.deepEqual(resolved.state.enemy.map(enemy => enemy.health), [80, 90, 90]);
  assert.equal(resolved.state.enemy[0].activeEffects.find(effect =>
    effect.type === 'custom' && effect.stackType === 'Marca',
  )?.stacks, 1);
  assert.equal(resolved.state.enemy[1].activeEffects.some(effect => effect.stackType === 'Marca'), false);
});

test('applies self-stack damage when using a stackable attack', () => {
  const state = createState({ playerCharacter: character('Waraji & Zori') });
  state.playerChakra = { Tai: 4, Nin: 0, Gen: 0, Blood: 0 };
  const skillIndex = state.player[0].character.skills.findIndex(skill => skill.name === 'Double Slash');
  assert.notEqual(skillIndex, -1);

  const first = resolveCombatIntent(state, {
    side: 'player',
    sourceId: 'player-0',
    skillIndex,
    targetId: 'enemy-0',
  });
  assert.equal(first.status, 'applied');
  if (first.status !== 'applied') return;
  assert.equal(first.state.enemy[0].health, 70);
  assert.equal(first.state.player[0].activeEffects.find(effect => effect.stackType === 'Double Slash')?.stacks, 1);

  const second = resolveCombatIntent(first.state, {
    side: 'player',
    sourceId: 'player-0',
    skillIndex,
    targetId: 'enemy-0',
  });
  assert.equal(second.status, 'applied');
  if (second.status !== 'applied') return;
  assert.equal(second.state.enemy[0].health, 35);
  assert.equal(second.state.player[0].activeEffects.find(effect => effect.stackType === 'Double Slash')?.stacks, 2);
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

test('rejects unknown skill mechanics rather than silently simulating them', () => {
  const state = createState({ playerCharacter: character('ANBU Kakashi') });
  const action = intent('Raikiri', state);
  Object.assign(state.player[0].character.skills[action.intent.skillIndex], {
    unportedServerRule: true,
  });
  const result = resolveCombatIntent(state, action.intent);

  assert.equal(result.status, 'unsupported');
  if (result.status === 'unsupported') assert.equal(result.code, 'skill-mechanics-not-ported');
  assert.equal(state.enemy[0].health, 100);
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

test('applies Sasuke Sharingan Guard to its configured self target', () => {
  const sasuke = character('Sasuke Uchiha');
  const sharingan = sasuke.skills.find(skill => skill.name === 'Sharingan');
  assert.ok(sharingan, 'Sasuke has the Sharingan skill');
  sharingan.shieldTarget = 'Self';
  const state = createState({
    playerCharacter: sasuke,
    playerChakra: { Tai: 2, Nin: 2, Gen: 2, Blood: 2 },
  });
  const { intent: action } = intent('Sharingan', state);

  const result = resolveCombatIntent(state, action);

  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') return;
  assert.ok(result.state.player[0].activeEffects.some(effect =>
    effect.type === 'damage_reduction' && effect.sourceSkillName === 'Sharingan',
  ));
  assert.equal(result.state.enemy[0].activeEffects.some(effect =>
    effect.type === 'damage_reduction' && effect.sourceSkillName === 'Sharingan',
  ), false);
});

test('Naruto Chackra Boost applies its conditional heal while Shadow Clones is active', () => {
  const naruto = character('Naruto Uzumaki');
  const state = createState({
    playerCharacter: naruto,
    playerChakra: { Tai: 1, Nin: 1, Gen: 0, Blood: 0 },
  });
  state.player[0].health = 55;
  state.player[0].activeEffects.push({
    name: 'Shadow Clones (Redução de Dano)',
    type: 'damage_reduction',
    value: 15,
    duration: 3,
    casterId: 'player-0',
    casterSide: 'player',
  });
  const skillIndex = state.player[0].character.skills.findIndex(skill => skill.name === 'Chackra Boost');
  assert.notEqual(skillIndex, -1);

  const result = resolveCombatIntent(state, {
    side: 'player',
    sourceId: 'player-0',
    skillIndex,
    targetId: 'player-0',
  });

  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') return;
  assert.equal(result.state.player[0].health, 70);
  assert.ok(result.events.some(event => event.type === 'heal' && event.healed === 15));
});

test('Young Rin Medical Kit keeps healing its chosen ally over the configured duration', () => {
  const state = createState({
    playerCharacter: character('Young Rin'),
    playerAllies: [character('Tenten')],
    playerChakra: { Tai: 1, Nin: 1, Gen: 0, Blood: 0 },
  });
  state.player[1].health = 60;
  const skillIndex = state.player[0].character.skills.findIndex(skill => skill.name === 'Medical Kit');
  assert.notEqual(skillIndex, -1);

  const result = resolveCombatIntent(state, {
    side: 'player',
    sourceId: 'player-0',
    skillIndex,
    targetId: 'player-1',
  });

  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') return;
  const target = result.state.player[1];
  assert.equal(target.health, 70, 'the first 10 HP heal is applied immediately');
  assert.ok(target.activeEffects.some(effect =>
    effect.type === 'heal_over_time' && effect.value === 10 && effect.duration === 2,
  ));

  result.state.turn = 2;
  tickAuthoritativeCombatEffects(result.state, 'player');
  assert.equal(target.health, 80);
  result.state.turn = 3;
  tickAuthoritativeCombatEffects(result.state, 'player');
  assert.equal(target.health, 90);
});

test('applies a cleanse configured by debuff types without requiring the boolean flag', () => {
  const sakura = character('Sakura Haruno');
  const healingTechnique = sakura.skills.find(skill => skill.name === 'Healing Technique');
  assert.ok(healingTechnique, 'Sakura has Healing Technique');
  healingTechnique.cleanseDebuffTypes = ['affliction'];
  const state = createState({
    playerCharacter: sakura,
    playerAllies: [character('Tenten')],
  });
  state.player[1].activeEffects.push(
    { name: 'Poison', type: 'affliction', value: 5, duration: 2 },
    { name: 'Burn', type: 'dot', value: 5, duration: 2 },
  );

  const result = resolveCombatIntent(state, {
    side: 'player',
    sourceId: 'player-0',
    skillIndex: state.player[0].character.skills.findIndex(skill => skill.name === 'Healing Technique'),
    targetId: 'player-1',
  });

  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') return;
  assert.equal(result.state.player[1].activeEffects.some(effect => effect.type === 'affliction'), false);
  assert.equal(result.state.player[1].activeEffects.some(effect => effect.type === 'dot'), true);
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

test('supports every active skill in the first 69 catalog entries', () => {
  const unsupported: string[] = [];
  for (const selectedCharacter of catalog.slice(0, 69)) {
    for (const [skillIndex, selectedSkill] of selectedCharacter.skills.entries()) {
      if (selectedSkill.isPassive) continue;
      const playerCharacter = character(selectedCharacter.name);
      playerCharacter.skills = playerCharacter.skills.map(skill => ({
        ...skill,
        currentCooldown: 0,
        cost: [],
      }));
      const state = createState({
        playerCharacter,
        playerAllies: [character('Tenten'), character('Shikamaru Nara')],
        enemyCharacter: character('Tenten'),
      });
      state.enemy.push(combatant('enemy-1', character('Tenten')), combatant('enemy-2', character('Tenten')));
      const skill = state.player[0].character.skills[skillIndex];
      for (const name of [skill.requireEffect].filter((value): value is string => !!value)) {
        state.player[0].activeEffects.push({
          name,
          type: 'damage_reduction',
          duration: 99,
          sourceSkillName: name,
        });
      }
      for (const name of [skill.requireTargetEffect].filter((value): value is string => !!value)) {
        state.enemy[0].activeEffects.push({
          name,
          type: 'damage_reduction',
          duration: 99,
          sourceSkillName: name,
        });
      }
      if (skill.requirePreviousSkill) {
        state.player[0].skillUseCounts = { [skill.requirePreviousSkill]: 1 };
      }
      if (skill.requireHpBelow) state.player[0].health = Math.max(1, skill.requireHpBelow - 1);
      if (skill.requireRevived) state.player[0].hasRevived = true;
      const targetId = skill.targetType === 'Self' || skill.targetType === 'AllAllies' ||
        skill.targetType === 'SelfAndAlly' || skill.targetType === 'Ally'
        ? 'player-0'
        : 'enemy-0';
      const resolved = resolveCombatIntent(state, {
        side: 'player',
        sourceId: 'player-0',
        skillIndex,
        targetId,
      });
      if (resolved.status === 'unsupported') {
        unsupported.push(`${selectedCharacter.name} / ${skill.name}: ${resolved.code}`);
      }
    }
  }

  assert.deepEqual(unsupported, []);
});
