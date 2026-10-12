export interface MatchProtocolAction {
  sourceId: string;
  skillIndex: number;
  targetId: string;
}

export interface MatchProtocolPlayer {
  username: string;
  team: Array<{ id: string; skills: unknown[] }>;
}

export interface MatchProtocolRoom {
  seed: number;
  players: [MatchProtocolPlayer, MatchProtocolPlayer];
  turns: Record<number, (MatchProtocolAction[] | null)[]>;
  resolvedTurn: number;
  surrenderedBy: string | null;
  winnerUsername?: string | null;
}

export type TurnSubmissionResult =
  | { status: 'accepted'; resolvedTurn: number }
  | { status: 'duplicate'; resolvedTurn: number }
  | { status: 'invalid'; message: string }
  | { status: 'conflict'; message: string };

export const MAX_TEAM_SIZE = 3;
export const MAX_SKILLS_PER_CHARACTER = 32;
export const MAX_TURN_ACTIONS = MAX_TEAM_SIZE * MAX_SKILLS_PER_CHARACTER;

export function firstSlotForTurn(seed: number, turn: number): 0 | 1 {
  let x = (seed + 0x9e3779b9) >>> 0;
  x ^= x >>> 15;
  x = (x * 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x & 1) as 0 | 1;
}

export function isValidMatchTeam(team: unknown): team is MatchProtocolPlayer['team'] {
  if (!Array.isArray(team) || team.length !== MAX_TEAM_SIZE) return false;
  const ids = new Set<string>();

  return team.every(character => {
    if (
      !character ||
      typeof character !== 'object' ||
      typeof character.id !== 'string' ||
      !character.id.trim() ||
      !Array.isArray(character.skills) ||
      character.skills.length === 0 ||
      character.skills.length > MAX_SKILLS_PER_CHARACTER ||
      ids.has(character.id)
    ) {
      return false;
    }
    ids.add(character.id);
    return true;
  });
}

export function submitTurnActions(
  room: MatchProtocolRoom,
  slot: 0 | 1,
  turn: number,
  actions: unknown,
): TurnSubmissionResult {
  if (!Number.isSafeInteger(turn) || turn < 1 || !Array.isArray(actions) || actions.length > MAX_TURN_ACTIONS) {
    return { status: 'invalid', message: 'Dados de turno inválidos.' };
  }
  if (room.surrenderedBy || room.winnerUsername) {
    return { status: 'conflict', message: 'A partida já foi finalizada.' };
  }

  const submitted = actions as MatchProtocolAction[];
  for (const action of submitted) {
    if (
      !action ||
      typeof action !== 'object' ||
      typeof action.sourceId !== 'string' ||
      typeof action.targetId !== 'string' ||
      !Number.isSafeInteger(action.skillIndex) ||
      action.skillIndex < 0
    ) {
      return { status: 'invalid', message: 'Ação de combate inválida.' };
    }

    const source = /^player-(\d+)$/.exec(action.sourceId);
    const target = /^(?:player|enemy)-(\d+)$/.exec(action.targetId);
    const sourceIndex = source ? Number(source[1]) : -1;
    const targetIndex = target ? Number(target[1]) : -1;
    const character = room.players[slot].team[sourceIndex];
    if (
      !character ||
      targetIndex < 0 ||
      targetIndex >= MAX_TEAM_SIZE ||
      action.skillIndex >= character.skills.length
    ) {
      return { status: 'invalid', message: 'Ação de combate fora dos limites permitidos.' };
    }
  }

  const existing = room.turns[turn]?.[slot];
  if (existing) {
    if (JSON.stringify(existing) === JSON.stringify(submitted)) {
      return { status: 'duplicate', resolvedTurn: room.resolvedTurn };
    }
    return { status: 'conflict', message: 'Este jogador já enviou ações diferentes neste turno.' };
  }

  if (turn !== room.resolvedTurn + 1) {
    return { status: 'conflict', message: 'O turno enviado está fora de sequência.' };
  }

  const firstSlot = firstSlotForTurn(room.seed, turn);
  const secondSlot = (firstSlot === 0 ? 1 : 0) as 0 | 1;
  const existingTurn = room.turns[turn] || [null, null];
  const expectedSlot = existingTurn[firstSlot] === null ? firstSlot : secondSlot;
  if (slot !== expectedSlot) {
    return { status: 'conflict', message: 'Ainda não é a vez deste jogador neste turno.' };
  }

  if (!room.turns[turn]) room.turns[turn] = [null, null];
  room.turns[turn][slot] = submitted;

  const slots = room.turns[turn];
  if (slots[0] !== null && slots[1] !== null) {
    room.resolvedTurn = turn;
  }

  return { status: 'accepted', resolvedTurn: room.resolvedTurn };
}
