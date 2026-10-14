import type { Character, ChakraPool, CombatCharacter } from '../src/types';
import type { MatchProtocolAction } from '../src/lib/matchProtocol';
import {
  firstSlotForTurn,
  MAX_TEAM_SIZE,
} from '../src/lib/matchProtocol';
import {
  resolveCombatIntent,
  tickAuthoritativeCombatEffects,
  type CombatEngineResult,
  type CombatEngineState,
} from '../src/lib/combatEngine';

export interface AuthoritativeTurnResult {
  status: 'resolved' | 'unsupported' | 'rejected';
  code?: string;
  state: CombatEngineState;
  winnerSlot: 0 | 1 | null;
}

function combatant(id: string, character: Character): CombatCharacter {
  return {
    id,
    character: structuredClone(character),
    health: 100,
    maxHealth: 100,
    shield: 0,
    activeEffects: [],
    isDead: false,
  };
}

function initializeStartingStacks(
  teams: [CombatCharacter[], CombatCharacter[]],
): void {
  teams.forEach((allies, side) => {
    const enemies = teams[side === 0 ? 1 : 0];
    for (const caster of allies) {
      for (const skill of caster.character.skills) {
        if (!skill.stackable) continue;
        const stackType = skill.stackType || skill.name;
        const startTags = (skill.stackStartTags || []).map(tag => tag.toLowerCase());
        const targets = new Map<string, CombatCharacter>();
        const matchingAllies = startTags.length
          ? allies.filter(ally => ally.character.tags.some(tag => startTags.includes(tag.toLowerCase())))
          : [];
        for (const target of matchingAllies) targets.set(target.id, target);

        if (skill.stackStartActive) {
          const initialTargets = skill.stackTarget === 'Ally'
            ? allies.filter(ally => ally.id !== caster.id).slice(0, 1)
            : skill.stackTarget === 'AllAllies'
              ? allies
              : skill.stackTarget === 'AllEnemies'
                ? enemies
                : [caster];
          for (const target of initialTargets) targets.set(target.id, target);
        }

        const startCount = Math.max(1, skill.stackStartCount || 1);
        for (const target of targets.values()) {
          const existing = target.activeEffects.find(effect =>
            effect.type === 'custom' && effect.stackable && effect.stackType === stackType,
          );
          if (existing) {
            existing.stacks = skill.stackNonCumulative
              ? 1
              : (existing.stacks || 0) + startCount;
            existing.duration = Math.max(existing.duration, skill.stackDuration ?? 999);
            continue;
          }
          target.activeEffects.push({
            name: `${stackType} (Stack)`,
            type: 'custom',
            value: 0,
            stacks: startCount,
            duration: skill.stackDuration ?? 999,
            icon: skill.icon,
            stackable: true,
            stackType,
            stackApplyOnAttack: skill.stackApplyOnAttack || false,
            stackApplyOnAttackDuration: skill.stackApplyOnAttackDuration,
            casterId: caster.id,
            casterSide: side === 0 ? 'player' : 'enemy',
            castTurn: 0,
            sourceSkillName: skill.name,
          });
        }
      }
    }
  });
}

function gainStacksOnSkillUse(state: CombatEngineState, sourceId: string): void {
  const source = [...state.player, ...state.enemy].find(character => character.id === sourceId);
  if (!source) return;
  for (const effect of source.activeEffects) {
    if (effect.type !== 'custom' || !effect.stackable || !effect.stackType) continue;
    const originSkill = source.character.skills.find(skill => skill.name === effect.sourceSkillName);
    if (!originSkill?.stackable ||
      (originSkill.stackGainMode !== 'skill' && originSkill.stackGainMode !== 'both')) continue;
    effect.stacks = (effect.stacks || 1) + (originSkill.stackGainAmount || 1);
    const cap = originSkill.stackCapReset;
    if (cap && cap > 0 && effect.stacks >= cap) effect.stacks = 1;
  }
}

function chakraRoll(seed: number, turn: number, slot: 0 | 1, count: number): ChakraPool {
  const pool: ChakraPool = { Tai: 0, Nin: 0, Gen: 0, Blood: 0 };
  const types: (keyof ChakraPool)[] = ['Tai', 'Nin', 'Gen', 'Blood'];
  const seedText = `${seed}-${turn}-slot-${slot}`;
  let randomSeed = 0;
  for (let index = 0; index < seedText.length; index++) {
    randomSeed = seedText.charCodeAt(index) + ((randomSeed << 5) - randomSeed);
  }
  randomSeed = Math.abs(randomSeed);
  for (let index = 0; index < count; index++) {
    randomSeed = (randomSeed * 1664525 + 1013904223) % 4294967296;
    pool[types[Math.floor((randomSeed / 4294967296) * types.length)]]++;
  }
  return pool;
}

export function createServerCombatState(
  teams: [Character[], Character[]],
  seed: number,
): CombatEngineState {
  if (teams.some(team => team.length !== MAX_TEAM_SIZE)) {
    throw new Error('A partida autoritativa exige dois times completos de três personagens.');
  }
  const firstSlot = firstSlotForTurn(seed, 1);
  const player = teams[0].map((character, index) => combatant(`player-${index}`, character));
  const enemy = teams[1].map((character, index) => combatant(`enemy-${index}`, character));
  initializeStartingStacks([player, enemy]);
  return {
    turn: 1,
    activeSide: firstSlot === 0 ? 'player' : 'enemy',
    player,
    enemy,
    playerChakra: chakraRoll(seed, 1, 0, firstSlot === 0 ? 1 : 3),
    enemyChakra: chakraRoll(seed, 1, 1, firstSlot === 1 ? 1 : 3),
    damageDealt: { player: 0, enemy: 0 },
  };
}

function mapAction(
  action: MatchProtocolAction,
  slot: 0 | 1,
): { sourceId: string; skillIndex: number; targetId: string } | null {
  const sourceMatch = /^player-(\d+)$/.exec(action.sourceId);
  const targetMatch = /^(player|enemy)-(\d+)$/.exec(action.targetId);
  if (!sourceMatch || !targetMatch) return null;
  const sourceIndex = Number(sourceMatch[1]);
  const targetIndex = Number(targetMatch[2]);
  if (sourceIndex >= MAX_TEAM_SIZE || targetIndex >= MAX_TEAM_SIZE) return null;
  const ownSide = slot === 0 ? 'player' : 'enemy';
  const opposingSide = slot === 0 ? 'enemy' : 'player';
  const targetSide = targetMatch[1] === 'player' ? ownSide : opposingSide;
  return {
    sourceId: `${ownSide}-${sourceIndex}`,
    skillIndex: action.skillIndex,
    targetId: `${targetSide}-${targetIndex}`,
  };
}

function decrementTurnState(state: CombatEngineState): void {
  const combatants = [...state.player, ...state.enemy];
  for (const character of combatants) {
    if (character.isDead) continue;
    const cooldownsParalyzed = character.activeEffects.some(effect =>
      effect.type === 'paralyze_cooldown',
    );
    if (!cooldownsParalyzed) {
      for (const skill of character.character.skills) {
        if (skill.currentCooldown > 0) skill.currentCooldown--;
      }
    }
    character.activeEffects = character.activeEffects.filter(effect => {
      if (effect.duration >= 99999) return true;
      if (effect.castTurn === state.turn) return true;
      if (effect.type === 'skill_copy' && effect.duration <= 1 && effect.storedSkills) {
        character.character.skills = effect.storedSkills.map(skill => ({ ...skill }));
      }
      effect.duration--;
      return effect.duration > 0;
    });
    if (character.shieldExpiresTurn && character.shieldExpiresTurn <= state.turn + 1) {
      character.shield = 0;
      character.shieldExpiresTurn = undefined;
    }
  }
}

function nextTurn(state: CombatEngineState, seed: number): void {
  for (const character of [...state.player, ...state.enemy]) {
    character.previousTurnSkills = character.currentTurnSkills || [];
    character.currentTurnSkills = [];
  }
  tickAuthoritativeCombatEffects(state, 'player');
  tickAuthoritativeCombatEffects(state, 'enemy');
  decrementTurnState(state);
  state.turn++;
  const firstSlot = firstSlotForTurn(seed, state.turn);
  state.activeSide = firstSlot === 0 ? 'player' : 'enemy';
  const playerCount = state.player.filter(character => !character.isDead).length;
  const enemyCount = state.enemy.filter(character => !character.isDead).length;
  state.playerChakra = addChakra(state.playerChakra, chakraRoll(seed, state.turn, 0, playerCount));
  state.enemyChakra = addChakra(state.enemyChakra, chakraRoll(seed, state.turn, 1, enemyCount));
}

function addChakra(current: ChakraPool, added: ChakraPool): ChakraPool {
  return {
    Tai: current.Tai + added.Tai,
    Nin: current.Nin + added.Nin,
    Gen: current.Gen + added.Gen,
    Blood: current.Blood + added.Blood,
  };
}

function resolveActions(
  initial: CombatEngineState,
  slot: 0 | 1,
  actions: MatchProtocolAction[],
  skipRuntimeRejections = false,
): AuthoritativeTurnResult {
  let state = initial;
  for (const action of actions) {
    const mapped = mapAction(action, slot);
    if (!mapped) return { status: 'rejected', code: 'invalid-action-target', state: initial, winnerSlot: null };
    const side = slot === 0 ? 'player' : 'enemy';
    const result: CombatEngineResult = resolveCombatIntent(
      { ...state, activeSide: side },
      { ...mapped, side },
    );
    if (result.status !== 'applied') {
      if (skipRuntimeRejections && result.status === 'rejected' && [
        'invalid-source-or-skill',
        'invalid-target',
        'source-cannot-act',
        'target-invulnerable',
        'skill-on-cooldown',
        'insufficient-chakra',
      ].includes(result.code)) {
        continue;
      }
      return {
        status: result.status,
        code: result.code,
        state: initial,
        winnerSlot: null,
      };
    }
    gainStacksOnSkillUse(result.state, mapped.sourceId);
    const opposingBefore = (side === 'player' ? state.enemy : state.player)
      .reduce((sum, combatant) => sum + combatant.health + combatant.shield, 0);
    const opposingAfter = (side === 'player' ? result.state.enemy : result.state.player)
      .reduce((sum, combatant) => sum + combatant.health + combatant.shield, 0);
    const damageDealt = Math.max(0, opposingBefore - opposingAfter);
    state = {
      ...result.state,
      damageDealt: {
        player: (state.damageDealt?.player || 0) + (side === 'player' ? damageDealt : 0),
        enemy: (state.damageDealt?.enemy || 0) + (side === 'enemy' ? damageDealt : 0),
      },
    };
    if (state.winnerSide) {
      return {
        status: 'resolved',
        state,
        winnerSlot: state.winnerSide === 'player' ? 0 : 1,
      };
    }
  }
  return { status: 'resolved', state, winnerSlot: null };
}

export function validateAuthoritativeActions(
  state: CombatEngineState,
  slot: 0 | 1,
  actions: MatchProtocolAction[],
): { status: 'valid' } | { status: 'unsupported' | 'rejected'; code: string } {
  const result = resolveActions(state, slot, actions, true);
  return result.status === 'resolved'
    ? { status: 'valid' }
    : { status: result.status, code: result.code || 'invalid-action' };
}

export function resolveAuthoritativeActions(
  state: CombatEngineState,
  slot: 0 | 1,
  actions: MatchProtocolAction[],
): AuthoritativeTurnResult {
  if (state.winnerSide) {
    return {
      status: 'rejected',
      code: 'match-already-won',
      state,
      winnerSlot: state.winnerSide === 'player' ? 0 : 1,
    };
  }
  const validation = validateAuthoritativeActions(state, slot, actions);
  if (validation.status !== 'valid') {
    return {
      status: validation.status,
      code: validation.code,
      state,
      winnerSlot: null,
    };
  }
  return resolveActions(state, slot, actions, true);
}

export function advanceAuthoritativeTurn(
  state: CombatEngineState,
  seed: number,
): AuthoritativeTurnResult {
  if (state.winnerSide) {
    return {
      status: 'resolved',
      state,
      winnerSlot: state.winnerSide === 'player' ? 0 : 1,
    };
  }
  const next = structuredClone(state);
  nextTurn(next, seed);
  return { status: 'resolved', state: next, winnerSlot: null };
}

export function resolveAuthoritativeTurn(
  state: CombatEngineState,
  seed: number,
  turn: number,
  actions: [MatchProtocolAction[], MatchProtocolAction[]],
): AuthoritativeTurnResult {
  if (state.winnerSide || turn !== state.turn) {
    return { status: 'rejected', code: 'invalid-turn-state', state, winnerSlot: null };
  }
  for (const slot of [0, 1] as const) {
    const validation = validateAuthoritativeActions(state, slot, actions[slot]);
    if (validation.status !== 'valid') {
      return {
        status: validation.status,
        code: validation.code,
        state,
        winnerSlot: null,
      };
    }
  }
  const firstSlot = firstSlotForTurn(seed, turn);
  const order: [0 | 1, 0 | 1] = [firstSlot, firstSlot === 0 ? 1 : 0];
  let next = state;
  for (const slot of order) {
    const result = resolveAuthoritativeActions(next, slot, actions[slot]);
    if (result.status !== 'resolved' || result.winnerSlot !== null) return result;
    next = result.state;
  }
  return advanceAuthoritativeTurn(next, seed);
}
