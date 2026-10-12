import type { CombatEngineState } from './combatEngine';
import { firstSlotForTurn } from './matchProtocol';

export interface CanonicalCombatAction {
  sourceId: string;
  skillIndex: number;
  targetId: string;
}

export interface CanonicalCombatMatchState {
  schemaVersion: 1;
  roomId: string;
  participants: [string, string];
  seed: number;
  initiative: { firstSlotThisTurn: 0 | 1 };
  resolvedTurn: number;
  combat: CombatEngineState;
  submissions: Record<number, [CanonicalCombatAction[] | null, CanonicalCombatAction[] | null]>;
  connections: [
    { connected: boolean; disconnectedAt: number | null },
    { connected: boolean; disconnectedAt: number | null },
  ];
  lifecycle: {
    status: 'active' | 'forfeited' | 'finished';
    winnerSlot: 0 | 1 | null;
    reason: 'combat' | 'surrender' | 'disconnect' | null;
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCombatant(value: unknown, expectedId: string): boolean {
  if (!value || typeof value !== 'object') return false;
  const combatant = value as Record<string, unknown>;
  if (
    combatant.id !== expectedId ||
    typeof combatant.isDead !== 'boolean' ||
    !isNonNegativeInteger(combatant.health) ||
    !isNonNegativeInteger(combatant.maxHealth) ||
    combatant.maxHealth === 0 ||
    combatant.health > combatant.maxHealth ||
    combatant.isDead !== (combatant.health === 0) ||
    !Number.isFinite(combatant.shield) ||
    (combatant.shield as number) < 0 ||
    !Array.isArray(combatant.activeEffects) ||
    !combatant.character ||
    typeof combatant.character !== 'object'
  ) return false;
  const character = combatant.character as Record<string, unknown>;
  return Array.isArray(character.skills);
}

function isAction(value: unknown): value is CanonicalCombatAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as Record<string, unknown>;
  return typeof action.sourceId === 'string' &&
    typeof action.targetId === 'string' &&
    isNonNegativeInteger(action.skillIndex);
}

function isSubmission(value: unknown): value is [CanonicalCombatAction[] | null, CanonicalCombatAction[] | null] {
  return Array.isArray(value) &&
    value.length === 2 &&
    value.every(slot => slot === null || (Array.isArray(slot) && slot.every(isAction)));
}

export function isCanonicalCombatMatchState(value: unknown): value is CanonicalCombatMatchState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  if (
    state.schemaVersion !== 1 ||
    typeof state.roomId !== 'string' ||
    !state.roomId.trim() ||
    !Array.isArray(state.participants) ||
    state.participants.length !== 2 ||
    state.participants.some(username => typeof username !== 'string' || !username.trim()) ||
    state.participants[0] === state.participants[1] ||
    !isNonNegativeInteger(state.seed) ||
    !state.initiative ||
    typeof state.initiative !== 'object' ||
    !isNonNegativeInteger(state.resolvedTurn) ||
    !state.combat ||
    typeof state.combat !== 'object' ||
    !state.submissions ||
    typeof state.submissions !== 'object' ||
    !Array.isArray(state.connections) ||
    state.connections.length !== 2 ||
    !state.lifecycle ||
    typeof state.lifecycle !== 'object'
  ) return false;

  const combat = state.combat as Record<string, unknown>;
  const initiative = state.initiative as Record<string, unknown>;
  if (
    !Number.isSafeInteger(combat.turn) ||
    (combat.turn as number) !== (state.resolvedTurn as number) + 1 ||
    !['player', 'enemy'].includes(String(combat.activeSide)) ||
    !Array.isArray(combat.player) ||
    !Array.isArray(combat.enemy) ||
    combat.player.length !== 3 ||
    combat.enemy.length !== 3 ||
    !combat.player.every((combatant, index) => isCombatant(combatant, `player-${index}`)) ||
    !combat.enemy.every((combatant, index) => isCombatant(combatant, `enemy-${index}`)) ||
    initiative.firstSlotThisTurn !== firstSlotForTurn(state.seed as number, combat.turn as number)
  ) return false;

  const playerChakra = combat.playerChakra as Record<string, unknown> | null;
  const enemyChakra = combat.enemyChakra as Record<string, unknown> | null;
  const validChakra = (pool: Record<string, unknown> | null) =>
    !!pool && ['Tai', 'Nin', 'Gen', 'Blood'].every(type => isNonNegativeInteger(pool[type]));
  if (!validChakra(playerChakra) || !validChakra(enemyChakra)) return false;

  const submissions = state.submissions as Record<string, unknown>;
  if (!Object.entries(submissions).every(([turn, submission]) =>
    /^[1-9]\d*$/.test(turn) &&
    Number(turn) <= (state.resolvedTurn as number) + 1 &&
    isSubmission(submission),
  )) return false;

  if (!state.connections.every(connection => {
    if (!connection || typeof connection !== 'object') return false;
    const entry = connection as Record<string, unknown>;
    return typeof entry.connected === 'boolean' &&
      (entry.disconnectedAt === null || (typeof entry.disconnectedAt === 'number' && Number.isFinite(entry.disconnectedAt)));
  })) return false;

  const lifecycle = state.lifecycle as Record<string, unknown>;
  if (
    !['active', 'forfeited', 'finished'].includes(String(lifecycle.status)) ||
    !(lifecycle.winnerSlot === null || lifecycle.winnerSlot === 0 || lifecycle.winnerSlot === 1) ||
    !(lifecycle.reason === null || lifecycle.reason === 'combat' || lifecycle.reason === 'surrender' || lifecycle.reason === 'disconnect')
  ) return false;

  if (lifecycle.status === 'active') {
    return lifecycle.winnerSlot === null &&
      lifecycle.reason === null &&
      !combat.winnerSide;
  }
  if (lifecycle.status === 'forfeited') {
    return lifecycle.winnerSlot !== null &&
      (lifecycle.reason === 'surrender' || lifecycle.reason === 'disconnect') &&
      !combat.winnerSide;
  }
  return lifecycle.winnerSlot !== null &&
    lifecycle.reason === 'combat' &&
    (combat.winnerSide === (lifecycle.winnerSlot === 0 ? 'player' : 'enemy'));
}
