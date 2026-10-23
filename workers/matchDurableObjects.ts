import {
  firstSlotForTurn,
  isValidMatchTeam,
  submitTurnActions,
  type MatchProtocolAction,
} from '../src/lib/matchProtocol';
import type { Character } from '../src/types';
import type { QuestBattleStats } from '../src/lib/questProgress';
import { resolveQuestRequiredRank } from '../src/lib/questProgress';
import { getCurrentRecurringQuests } from '../src/lib/recurringQuests';
import type { CombatEngineEvent, CombatEngineState } from '../src/lib/combatEngine';
import {
  getD1AccountProfile,
  getD1Config,
  isD1SessionActive,
  awardD1MatchRewards,
  type AuthoritativeMatchReward,
  type D1Env,
} from './d1Api';
import {
  advanceAuthoritativeTurn,
  createServerCombatState,
  resolveAuthoritativeActions,
} from './serverCombat';
import {
  getInactiveMatchSlot,
  MATCH_INACTIVITY_TIMEOUT_MS,
} from '../src/lib/matchInactivity';

interface WorkerAssets {
  fetch(request: Request): Promise<Response>;
}

interface PlayerSlot {
  username: string;
  name: string;
  photoUrl: string;
  profile: Record<string, unknown>;
  team: Character[];
  activeQuestId?: string;
  questStats: QuestBattleStats;
}

interface MatchRoomData {
  id: string;
  seed: number;
  players: [PlayerSlot, PlayerSlot];
  combatState?: CombatEngineState;
  actionsAppliedTurn?: number;
  appliedActionSlots?: (0 | 1)[];
  combatEventBatches?: Array<{
    id: string;
    turn: number;
    slot: 0 | 1;
    actions: Array<{
      actionIndex: number;
      sourceId: string;
      skillName: string;
      skillIcon?: string;
      killedTargets: string[];
      events: CombatEngineEvent[];
    }>;
  }>;
  resolvedTurn: number;
  surrenderedBy: string | null;
  winnerUsername: string | null;
  surrenderReason: 'manual' | 'disconnect' | 'timeout' | 'inactivity' | null;
  phaseDeadline: number;
  finishedAt?: number | null;
  pings: [number, number];
  activityAt?: [number, number];
  timeoutStreak: [number, number];
}

interface TurnRow {
  turn: number;
  slot: number;
  actions_json: string;
}

function emptyQuestStats(team: Character[]): QuestBattleStats {
  return {
    damageDealt: 0,
    damageReceived: 0,
    healingDone: 0,
    shieldGenerated: 0,
    stunsApplied: 0,
    countersReflects: 0,
    skillsUsed: {},
    killsWithSkill: {},
    playerCharactersUsed: team.map(character => character.name),
    playerTeamCharacters: team.map(character => ({
      name: character.name,
      tags: character.tags || [],
    })),
    damageDealtRecords: [],
    damageReceivedRecords: [],
    healingDoneRecords: [],
    shieldGeneratedRecords: [],
    killRecords: [],
    counterRecords: [],
    skillUseRecords: [],
  };
}

function recordQuestActionEvents(
  players: [PlayerSlot, PlayerSlot],
  sourceSlot: 0 | 1,
  before: CombatEngineState,
  actions: Array<{
    sourceId: string;
    skillName: string;
    events: CombatEngineEvent[];
    killedTargets: string[];
  }>,
): void {
  const sourceStats = players[sourceSlot].questStats;
  if (!sourceStats) return;
  for (const action of actions) {
    const actor = [...before.player, ...before.enemy].find(combatant => combatant.id === action.sourceId);
    if (!actor) continue;
    const actorName = actor.character.name;
    const actorTags = actor.character.tags || [];
    sourceStats.skillUseRecords.push({ charName: actorName, tags: actorTags, skillName: action.skillName });
    sourceStats.skillsUsed[action.skillName] = (sourceStats.skillsUsed[action.skillName] || 0) + 1;

    for (const event of action.events) {
      if (event.type === 'damage') {
        const targetSlot: 0 | 1 | null = before.player.some(combatant => combatant.id === event.targetId)
          ? 0
          : before.enemy.some(combatant => combatant.id === event.targetId) ? 1 : null;
        const target = [...before.player, ...before.enemy].find(combatant => combatant.id === event.targetId);
        if (target && targetSlot !== null) {
          players[targetSlot].questStats.damageReceived += event.amount;
          players[targetSlot].questStats.damageReceivedRecords.push({
            charName: target.character.name,
            tags: target.character.tags || [],
            amount: event.amount,
          });
          if (targetSlot !== sourceSlot) {
            sourceStats.damageDealt += event.amount;
            sourceStats.damageDealtRecords.push({
              charName: actorName,
              tags: actorTags,
              skillName: action.skillName,
              amount: event.amount,
            });
          }
        }
      } else if (event.type === 'heal') {
        sourceStats.healingDone += event.healed;
        sourceStats.healingDoneRecords.push({
          charName: actorName,
          tags: actorTags,
          skillName: action.skillName,
          amount: event.healed,
        });
      } else if (event.type === 'shield') {
        sourceStats.shieldGenerated += event.added;
        sourceStats.shieldGeneratedRecords.push({
          charName: actorName,
          tags: actorTags,
          skillName: action.skillName,
          amount: event.added,
        });
      } else if (event.type === 'combat-text' && event.floatingType === 'stun') {
        const targetSlot = before.player.some(combatant => combatant.id === event.targetId)
          ? 0
          : before.enemy.some(combatant => combatant.id === event.targetId) ? 1 : null;
        if (targetSlot !== null && targetSlot !== sourceSlot) sourceStats.stunsApplied += 1;
      }
    }
    for (const targetId of action.killedTargets || []) {
      const targetSlot = before.player.some(combatant => combatant.id === targetId)
        ? 0
        : before.enemy.some(combatant => combatant.id === targetId) ? 1 : null;
      const target = [...before.player, ...before.enemy].find(combatant => combatant.id === targetId);
      if (target && targetSlot !== null && targetSlot !== sourceSlot) {
        sourceStats.killRecords.push({ charName: actorName, tags: actorTags, skillName: action.skillName });
        sourceStats.killsWithSkill[action.skillName] = (sourceStats.killsWithSkill[action.skillName] || 0) + 1;
      }
    }
  }
}

interface EmojiRow {
  username: string;
  sender_name: string;
  emoji: string;
  timestamp: number;
}

interface ChatRow {
  id: string;
  username: string;
  sender_name: string;
  sender_title: string | null;
  text: string;
  timestamp: number;
}

interface HistoryRecord {
  roomId: string;
  players: [{ username: string; name: string }, { username: string; name: string }];
  winnerUsername: string;
  finishedAt: string;
  reason: 'battle' | 'manual' | 'disconnect' | 'timeout' | 'inactivity';
}

interface MatchEnv {
  DB?: D1Env['DB'];
  MATCH_ROOM: DurableObjectNamespace;
  MATCHMAKER: DurableObjectNamespace;
}

const json = (body: unknown, status = 200): Response => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

const fail = (status: number, error: string): Response => json({ error }, status);

const canonicalUsername = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

function publicOpponent(player: PlayerSlot): Record<string, unknown> {
  return {
    username: player.username,
    name: player.name,
    photoUrl: player.photoUrl,
    team: player.team,
    profile: player.profile,
  };
}

function cleanPublicProfile(value: unknown, username: string, displayName: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { username, name: displayName };
  }
  const profile = { ...(value as Record<string, unknown>) };
  for (const key of ['password', 'googleId', 'email']) delete profile[key];
  profile.username = username;
  return profile;
}

function stripLargeInlineMedia(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripLargeInlineMedia);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && /^data:(?:image|video)\//i.test(entry) && entry.length > 2000) continue;
    result[key] = stripLargeInlineMedia(entry);
  }
  return result;
}

function validSessionToken(value: string | null): value is string {
  return !!value && /^[a-f0-9-]{32,128}$/i.test(value);
}

async function verifySession(env: MatchEnv, username: string, token: string | null): Promise<boolean> {
  if (username === 'convidado') return true;
  if (!validSessionToken(token)) return false;
  if (env.DB) return isD1SessionActive({ DB: env.DB }, username, token);
  return false;
}

function getRoomId(request: Request, body?: Record<string, unknown>): string {
  return typeof body?.roomId === 'string'
    ? body.roomId
    : new URL(request.url).searchParams.get('roomId') || '';
}

export class MatchmakerDurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: MatchEnv,
  ) {
    this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS queue (
        username TEXT PRIMARY KEY,
        player_json TEXT NOT NULL,
        queued_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS matches (
        username TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        slot INTEGER NOT NULL CHECK (slot IN (0, 1))
      );
      CREATE TABLE IF NOT EXISTS room_directory (
        room_id TEXT PRIMARY KEY,
        players_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS online_battle_history (
        room_id TEXT PRIMARY KEY,
        record_json TEXT NOT NULL,
        finished_at TEXT NOT NULL
      );
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/matchmaking/join' || pathname === '/api/matchmaking/quit') {
      return this.state.blockConcurrencyWhile(() => this.route(request));
    }
    return this.route(request);
  }

  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/internal/history' && request.method === 'POST') {
      return this.saveHistory(await request.json() as HistoryRecord);
    }
    if (url.pathname === '/api/matchmaking/join' && request.method === 'POST') {
      return this.join(request);
    }
    if (url.pathname === '/api/matchmaking/status' && request.method === 'GET') {
      return this.status(url.searchParams.get('username') || '');
    }
    if (url.pathname === '/api/matchmaking/quit' && request.method === 'POST') {
      return this.quit(await request.json() as Record<string, unknown>);
    }
    if (url.pathname === '/api/user/online-battle-history' && request.method === 'GET') {
      return this.history(url.searchParams.get('username') || '');
    }
    if (url.pathname.startsWith('/api/match/')) {
      const body = request.method === 'GET' ? undefined : await request.clone().json().catch(() => ({})) as Record<string, unknown>;
      const roomId = getRoomId(request, body);
      if (!roomId) return fail(400, 'roomId é obrigatório.');
      const stub = this.env.MATCH_ROOM.get(this.env.MATCH_ROOM.idFromName(roomId));
      return stub.fetch(request);
    }
    return fail(404, 'Rota de partida não encontrada.');
  }

  private async authoritativePlayer(raw: Record<string, unknown>): Promise<PlayerSlot | null> {
    const username = canonicalUsername(raw.username);
    if (!username || username.length > 100 || !isValidMatchTeam(raw.team)) return null;
    if (!this.env.DB) throw new Error('D1 não está configurado para validar a equipe.');
    const [characters, storedProfile] = await Promise.all([
      getD1Config(this.env.DB, 'characters'),
      username === 'convidado'
        ? Promise.resolve(null)
        : getD1AccountProfile(this.env.DB, username),
    ]);
    if (!characters) throw new Error('Catálogo oficial de personagens ausente do D1.');
    if (username !== 'convidado' && !storedProfile) return null;
    const catalog = new Map(
      characters
        .filter((character): character is Record<string, unknown> =>
          !!character && typeof character === 'object' && 'id' in character &&
          typeof character.id === 'string')
        .map(character => [character.id as string, character]),
    );

    const team = raw.team.map(selection => {
      const official = catalog.get(selection.id);
      if (!official || !Array.isArray(official.skills) || official.skills.length === 0) return null;
      return stripLargeInlineMedia({
        ...official,
        selectedSkinId: typeof (selection as Record<string, unknown>).selectedSkinId === 'string'
          ? ((selection as Record<string, unknown>).selectedSkinId as string).slice(0, 100)
          : undefined,
        selectedSkinUrl: typeof (selection as Record<string, unknown>).selectedSkinUrl === 'string'
          ? ((selection as Record<string, unknown>).selectedSkinUrl as string).slice(0, 2048)
          : undefined,
      }) as unknown as Character;
    });
    if (team.some(character => !character)) return null;

    let activeQuestId: string | undefined;
    if (typeof raw.activeQuestId === 'string' && raw.activeQuestId.length <= 160 && storedProfile) {
      const [quests, ranks] = await Promise.all([
        getD1Config(this.env.DB, 'quests'),
        getD1Config(this.env.DB, 'ranks'),
      ]);
      const quest = [...(quests || []), ...getCurrentRecurringQuests()].find(item =>
        !!item && typeof item === 'object' && (item as Record<string, unknown>).id === raw.activeQuestId,
      ) as Record<string, unknown> | undefined;
      const completedQuestIds = Array.isArray(storedProfile.completedQuestIds)
        ? storedProfile.completedQuestIds
        : [];
      const sortedRanks = (ranks || []).filter((item): item is Record<string, unknown> =>
        !!item && typeof item === 'object' && typeof (item as Record<string, unknown>).name === 'string' &&
        typeof (item as Record<string, unknown>).requiredXp === 'number',
      ).sort((left, right) => Number(left.requiredXp) - Number(right.requiredXp));
      const playerXp = Math.max(0, Number(storedProfile.xp) || 0);
      const currentRank = [...sortedRanks].reverse().find(rank => playerXp >= Number(rank.requiredXp));
      const minRank = typeof quest?.minRank === 'string' ? quest.minRank : '';
      const requiredRank = resolveQuestRequiredRank(minRank, sortedRanks as Array<{
        name: string;
        requiredXp: number;
      }>);
      const rankEligible = !minRank || !requiredRank || !!ranks?.length && !!currentRank &&
        Number(currentRank.requiredXp) >= Number(requiredRank.requiredXp);
      if (quest && Array.isArray(quest.goals) && !completedQuestIds.includes(raw.activeQuestId) &&
          (!Array.isArray(quest.requiredQuestIds) ||
            quest.requiredQuestIds.every(id => completedQuestIds.includes(id))) &&
          rankEligible) {
        activeQuestId = raw.activeQuestId;
      }
    }

    const guestProfile = cleanPublicProfile(raw.profile, username, username);
    const profile = storedProfile || guestProfile;
    const displayName = typeof profile.name === 'string' && profile.name.trim()
      ? profile.name.trim().slice(0, 100)
      : username;
    return {
      username,
      name: displayName,
      photoUrl: typeof profile.photoUrl === 'string' ? profile.photoUrl.slice(0, 2048) : '',
      profile: cleanPublicProfile(profile, username, displayName),
      team: team as Character[],
      activeQuestId,
      questStats: emptyQuestStats(team as Character[]),
    };
  }

  private async join(request: Request): Promise<Response> {
    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return fail(400, 'Dados inválidos para matchmaking.');
    }
    let player: PlayerSlot | null;
    try {
      player = await this.authoritativePlayer(body);
    } catch (error) {
      console.error('[matchmaker] Falha ao resolver equipe oficial.', error);
      return fail(502, 'Não foi possível validar a equipe no catálogo oficial.');
    }
    if (!player) return fail(400, 'A equipe deve conter três personagens válidos e uma conta existente.');
    try {
      createServerCombatState([
        player.team,
        player.team,
      ], 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Equipe incompatível com o motor autoritativo.';
      return Response.json({ error: message, code: 'unsupported-team' }, {
        status: 422,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const current = this.state.storage.sql.exec<{ room_id: string; slot: number }>(
      'SELECT room_id, slot FROM matches WHERE username = ?',
      player.username,
    ).toArray()[0];
    if (current) {
      const directory = this.state.storage.sql.exec<{ players_json: string }>(
        'SELECT players_json FROM room_directory WHERE room_id = ?',
        current.room_id,
      ).toArray()[0];
      if (directory) {
        const players = JSON.parse(directory.players_json) as [PlayerSlot, PlayerSlot];
        return json({
          status: 'matched',
          roomId: current.room_id,
          myIndex: current.slot,
          seed: await this.readRoomSeed(current.room_id),
          opponent: publicOpponent(players[current.slot === 0 ? 1 : 0]),
        });
      }
      this.state.storage.sql.exec('DELETE FROM matches WHERE username = ?', player.username);
    }

    const queued = this.state.storage.sql.exec<{ username: string; player_json: string }>(
      'SELECT username, player_json FROM queue WHERE username != ? ORDER BY queued_at LIMIT 1',
      player.username,
    ).toArray()[0];
    if (!queued) {
      this.state.storage.sql.exec(
        'INSERT INTO queue (username, player_json, queued_at) VALUES (?, ?, ?) ON CONFLICT(username) DO UPDATE SET player_json = excluded.player_json, queued_at = excluded.queued_at',
        player.username,
        JSON.stringify(player),
        Date.now(),
      );
      return json({ status: 'searching' });
    }

    const opponent = JSON.parse(queued.player_json) as PlayerSlot;
    const roomId = `room_${crypto.randomUUID()}`;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
    const createdAt = Date.now();
    const players: [PlayerSlot, PlayerSlot] = [opponent, player];
    const room = {
      id: roomId,
      seed,
      players,
      resolvedTurn: 0,
      surrenderedBy: null,
      winnerUsername: null,
      surrenderReason: null,
      phaseDeadline: createdAt + 60000,
      finishedAt: null,
      pings: [createdAt, createdAt],
      activityAt: [createdAt, createdAt],
      timeoutStreak: [0, 0],
    };
    const roomStub = this.env.MATCH_ROOM.get(this.env.MATCH_ROOM.idFromName(roomId));
    const createResponse = await roomStub.fetch('https://match-room.internal/internal/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(room),
    });
    if (!createResponse.ok) {
      console.error('[matchmaker] Durable room creation failed.', await createResponse.text());
      return fail(503, 'Não foi possível criar a sala da partida.');
    }

    this.state.storage.sql.exec(
      'DELETE FROM queue WHERE username = ?',
      queued.username,
    );
    this.state.storage.sql.exec(
      'DELETE FROM queue WHERE username = ?',
      player.username,
    );
    this.state.storage.sql.exec(
      'INSERT OR REPLACE INTO room_directory (room_id, players_json, created_at) VALUES (?, ?, ?)',
      roomId,
      JSON.stringify(players),
      createdAt,
    );
    this.state.storage.sql.exec(
      'INSERT OR REPLACE INTO matches (username, room_id, slot) VALUES (?, ?, 0), (?, ?, 1)',
      opponent.username,
      roomId,
      player.username,
      roomId,
    );
    return json({
      status: 'matched',
      roomId,
      myIndex: 1,
      seed,
      opponent: publicOpponent(opponent),
    });
  }

  private async readRoomSeed(roomId: string): Promise<number> {
    const stub = this.env.MATCH_ROOM.get(this.env.MATCH_ROOM.idFromName(roomId));
    const response = await stub.fetch('https://match-room.internal/internal/seed');
    if (!response.ok) throw new Error(`Não foi possível carregar seed da sala ${roomId}.`);
    return (await response.json() as { seed: number }).seed;
  }

  private async status(rawUsername: string): Promise<Response> {
    const username = canonicalUsername(rawUsername);
    if (!username) return fail(400, 'Username é obrigatório.');
    const match = this.state.storage.sql.exec<{ room_id: string; slot: number }>(
      'SELECT room_id, slot FROM matches WHERE username = ?',
      username,
    ).toArray()[0];
    if (match) {
      const directory = this.state.storage.sql.exec<{ players_json: string }>(
        'SELECT players_json FROM room_directory WHERE room_id = ?',
        match.room_id,
      ).toArray()[0];
      if (directory) {
        const players = JSON.parse(directory.players_json) as [PlayerSlot, PlayerSlot];
        return json({
          status: 'matched',
          roomId: match.room_id,
          myIndex: match.slot,
          seed: await this.readRoomSeed(match.room_id),
          opponent: publicOpponent(players[match.slot === 0 ? 1 : 0]),
        });
      }
      this.state.storage.sql.exec('DELETE FROM matches WHERE username = ?', username);
    }
    const waiting = this.state.storage.sql.exec(
      'SELECT username FROM queue WHERE username = ?',
      username,
    ).toArray().length > 0;
    return json({ status: waiting ? 'searching' : 'idle' });
  }

  private async quit(body: Record<string, unknown>): Promise<Response> {
    const username = canonicalUsername(body.username);
    if (!username) return fail(400, 'Nome de usuário é obrigatório.');
    this.state.storage.sql.exec('DELETE FROM queue WHERE username = ?', username);
    const match = this.state.storage.sql.exec<{ room_id: string }>(
      'SELECT room_id FROM matches WHERE username = ?',
      username,
    ).toArray()[0];
    this.state.storage.sql.exec('DELETE FROM matches WHERE username = ?', username);
    if (typeof body.roomId === 'string' && match?.room_id === body.roomId) {
      const stub = this.env.MATCH_ROOM.get(this.env.MATCH_ROOM.idFromName(body.roomId));
      await stub.fetch('https://match-room.internal/internal/quit', { method: 'POST' });
      this.state.storage.sql.exec('DELETE FROM matches WHERE room_id = ?', body.roomId);
      this.state.storage.sql.exec('DELETE FROM room_directory WHERE room_id = ?', body.roomId);
    }
    return json({ success: true });
  }

  private history(rawUsername: string): Response {
    const username = canonicalUsername(rawUsername);
    if (!username) return fail(400, 'Nome de usuário é obrigatório.');
    const rows = this.state.storage.sql.exec<{ record_json: string }>(
      `SELECT record_json FROM online_battle_history
       WHERE EXISTS (
         SELECT 1 FROM json_each(online_battle_history.record_json, '$.players')
         WHERE lower(json_extract(value, '$.username')) = ?
       )
       ORDER BY finished_at DESC
       LIMIT 5`,
      username,
    ).toArray();
    const matches = rows
      .map(row => JSON.parse(row.record_json) as HistoryRecord)
      .filter(record => record.players.some(player => player.username === username));
    return json({ success: true, matches });
  }

  private saveHistory(record: HistoryRecord): Response {
    if (!record || typeof record.roomId !== 'string' || !Array.isArray(record.players) ||
      typeof record.winnerUsername !== 'string') return fail(400, 'Registro de partida inválido.');
    this.state.storage.sql.exec(
      'INSERT OR IGNORE INTO online_battle_history (room_id, record_json, finished_at) VALUES (?, ?, ?)',
      record.roomId,
      JSON.stringify(record),
      record.finishedAt,
    );
    this.state.storage.sql.exec('DELETE FROM matches WHERE room_id = ?', record.roomId);
    return json({ success: true });
  }
}

export class MatchRoomDurableObject {
  private readonly sockets = new Map<WebSocket, string>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: MatchEnv,
  ) {
    this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        state_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS turn_submissions (
        turn INTEGER NOT NULL,
        slot INTEGER NOT NULL CHECK (slot IN (0, 1)),
        actions_json TEXT NOT NULL,
        PRIMARY KEY (turn, slot)
      );
      CREATE TABLE IF NOT EXISTS emojis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        emoji TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        sender_title TEXT,
        text TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/internal/create' && request.method === 'POST') {
      return this.create(await request.json() as MatchRoomData);
    }
    if (url.pathname === '/internal/seed') {
      const room = this.readRoom();
      return room ? json({ seed: room.seed }) : fail(404, 'Sala não encontrada.');
    }
    if (url.pathname === '/internal/quit' && request.method === 'POST') {
      this.state.storage.sql.exec('DELETE FROM room_state');
      this.state.storage.sql.exec('DELETE FROM turn_submissions');
      return json({ success: true });
    }
    if (url.pathname === '/ws' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return this.connectWebSocket();
    }
    if (!url.pathname.startsWith('/api/match/')) return fail(404, 'Rota de sala não encontrada.');

    let body: Record<string, unknown> | undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        body = await request.clone().json() as Record<string, unknown>;
      } catch {
        return fail(400, 'Corpo da requisição inválido.');
      }
    }
    const username = canonicalUsername(body?.username ?? url.searchParams.get('username'));
    const room = this.readRoom();
    if (!room) return fail(404, 'Sala não encontrada ou partida finalizada.');
    const slot = this.slotOf(room, username);
    if (slot !== 0 && slot !== 1) return fail(403, 'Você não faz parte desta sala.');

    const path = url.pathname;
    if (path === '/api/match/submit-turn' && request.method === 'POST') {
      return this.state.blockConcurrencyWhile(async () => {
        const current = this.readRoom();
        if (!current) return fail(404, 'Sala não encontrada ou partida finalizada.');
        const currentSlot = this.slotOf(current, username);
        if (currentSlot !== 0 && currentSlot !== 1) return fail(403, 'Você não faz parte desta sala.');
        if (await this.forfeitIfInactive(current, Date.now())) {
          return json({ success: true, room: this.roomPayload(this.readRoom() || current), alreadyFinished: true });
        }
        this.touchPlayerActivity(current, currentSlot, Date.now());
        await this.saveRoom(current);
        return this.submit(current, currentSlot, body!);
      });
    }
    if (path === '/api/match/activity' && request.method === 'POST') {
      return this.state.blockConcurrencyWhile(async () => {
        const current = this.readRoom();
        if (!current) return fail(404, 'Sala não encontrada ou partida finalizada.');
        const currentSlot = this.slotOf(current, username);
        if (currentSlot !== 0 && currentSlot !== 1) return fail(403, 'Você não faz parte desta sala.');
        if (current.surrenderedBy || current.winnerUsername) {
          return json({ success: true, alreadyFinished: true });
        }
        const now = Date.now();
        if (await this.forfeitIfInactive(current, now)) {
          return json({ success: true, alreadyFinished: true });
        }
        this.touchPlayerActivity(current, currentSlot, now);
        await this.saveRoom(current);
        return json({ success: true });
      });
    }
    room.pings[slot] = Date.now();
    await this.saveRoom(room);
    if (path === '/api/match/room-state' && request.method === 'GET') return this.roomState(room, url, slot);
    if (path === '/api/match/report-state' && request.method === 'POST') return this.report();
    if (path === '/api/match/surrender' && request.method === 'POST') return this.surrender(room, username, body!);
    if (path === '/api/match/finish' && request.method === 'POST') {
      let rewards: AuthoritativeMatchReward[] = [];
      if (room.winnerUsername) rewards = await this.persistBattleHistory(room);
      else if (room.surrenderedBy) {
        const winner = room.players[this.slotOf(room, room.surrenderedBy) === 0 ? 1 : 0];
        rewards = await this.awardRoomRewards(room, winner.username);
      } else return fail(409, 'O servidor ainda não confirmou o resultado desta partida.');
      return json({
        success: true,
        winnerUsername: room.winnerUsername,
        finishedAt: room.finishedAt,
        reward: rewards.find(reward => reward.username === username) || null,
      });
    }
    if (path === '/api/match/emoji' && request.method === 'POST') return this.sendEmoji(room, username, body!);
    if (path === '/api/match/emojis' && request.method === 'GET') return this.getEmojis(url);
    if (path === '/api/match/chat/send' && request.method === 'POST') return this.sendChat(room, username, body!);
    if (path === '/api/match/chat/messages' && request.method === 'GET') return this.getChat(url);
    return fail(404, 'Rota de sala não encontrada.');
  }

  private async create(room: MatchRoomData): Promise<Response> {
    if (!room || typeof room.id !== 'string' || !Array.isArray(room.players) ||
      room.players.length !== 2 || room.players[0].username === room.players[1].username ||
      !Number.isSafeInteger(room.seed) || room.players.some(player => !isValidMatchTeam(player.team))) {
      return fail(400, 'Estado inicial de sala inválido.');
    }
    if (this.readRoom()) return fail(409, 'A sala já existe.');
    try {
      room.combatState = createServerCombatState([
        room.players[0].team,
        room.players[1].team,
      ], room.seed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Equipe incompatível com o motor autoritativo.';
      return Response.json({ error: message, code: 'unsupported-team' }, {
        status: 422,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    this.state.storage.sql.exec(
      'INSERT INTO room_state (singleton, state_json) VALUES (1, ?)',
      JSON.stringify(room),
    );
    this.state.storage.sql.exec('DELETE FROM turn_submissions');
    this.state.storage.sql.exec('DELETE FROM emojis');
    this.state.storage.sql.exec('DELETE FROM chat_messages');
    await this.scheduleAlarm(room);
    return json({ success: true });
  }

  private readRoom(): MatchRoomData | null {
    const row = this.state.storage.sql.exec<{ state_json: string }>(
      'SELECT state_json FROM room_state WHERE singleton = 1',
    ).toArray()[0];
    if (!row) return null;
    const room = JSON.parse(row.state_json) as MatchRoomData;
    if (!Array.isArray(room.activityAt) || room.activityAt.length !== 2 ||
      room.activityAt.some(timestamp => !Number.isFinite(timestamp))) {
      const now = Date.now();
      room.activityAt = Array.isArray(room.pings) && room.pings.length === 2
        ? [room.pings[0], room.pings[1]]
        : [now, now];
    }
    return room;
  }

  private async saveRoom(room: MatchRoomData): Promise<void> {
    this.state.storage.sql.exec(
      'INSERT INTO room_state (singleton, state_json) VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET state_json = excluded.state_json',
      JSON.stringify(room),
    );
    await this.scheduleAlarm(room);
  }

  private touchPlayerActivity(room: MatchRoomData, slot: 0 | 1, now: number): void {
    room.pings[slot] = now;
    if (!room.activityAt || now - room.activityAt[slot] >= 5000) {
      room.activityAt = room.activityAt || [...room.pings];
      room.activityAt[slot] = now;
    }
  }

  private async scheduleAlarm(room: MatchRoomData): Promise<void> {
    if (room.surrenderedBy || room.winnerUsername) {
      await this.state.storage.setAlarm((room.finishedAt || Date.now()) + 600000);
      return;
    }
    const activityAt = room.activityAt || room.pings;
    await this.state.storage.setAlarm(Math.min(
      room.phaseDeadline,
      activityAt[0] + MATCH_INACTIVITY_TIMEOUT_MS,
      activityAt[1] + MATCH_INACTIVITY_TIMEOUT_MS,
    ));
  }

  private async forfeitIfInactive(room: MatchRoomData, now: number): Promise<boolean> {
    if (room.surrenderedBy || room.winnerUsername) return false;
    const inactiveSlot = getInactiveMatchSlot(room.activityAt || room.pings, now);
    if (inactiveSlot === null) return false;
    await this.forfeit(room, room.players[inactiveSlot].username, 'inactivity');
    return true;
  }

  private slotOf(room: MatchRoomData, username: string): 0 | 1 | -1 {
    if (room.players[0].username === username) return 0;
    if (room.players[1].username === username) return 1;
    return -1;
  }

  private submissions(): Record<number, [MatchProtocolAction[] | null, MatchProtocolAction[] | null]> {
    const result: Record<number, [MatchProtocolAction[] | null, MatchProtocolAction[] | null]> = {};
    for (const row of this.state.storage.sql.exec<TurnRow>(
      'SELECT turn, slot, actions_json FROM turn_submissions ORDER BY turn, slot',
    )) {
      if (!result[row.turn]) result[row.turn] = [null, null];
      if (row.slot === 0) result[row.turn][0] = JSON.parse(row.actions_json) as MatchProtocolAction[];
      else if (row.slot === 1) result[row.turn][1] = JSON.parse(row.actions_json) as MatchProtocolAction[];
    }
    return result;
  }

  private roomPayload(room: MatchRoomData, full = false): Record<string, unknown> {
    const turns = this.submissions();
    const current = room.resolvedTurn + 1;
    const turnActions: Record<number, [unknown[] | null, unknown[] | null]> = {};
    if (full) {
      Object.assign(turnActions, turns);
    } else {
      for (let turn = Math.max(1, current - 1); turn <= current + 1; turn++) {
        if (turns[turn]) turnActions[turn] = turns[turn];
      }
    }
    const combatState = room.combatState ? {
      turn: room.combatState.turn,
      activeSide: room.combatState.activeSide,
      player: room.combatState.player.map(combatant => ({
        id: combatant.id,
        health: combatant.health,
        maxHealth: combatant.maxHealth,
        shield: combatant.shield,
        shieldExpiresTurn: combatant.shieldExpiresTurn,
        activeEffects: combatant.activeEffects,
        isDead: combatant.isDead,
        hasRevived: combatant.hasRevived,
        skillUseCounts: combatant.skillUseCounts,
        skillCooldowns: combatant.character.skills.map(skill => skill.currentCooldown || 0),
        ...(combatant.activeEffects.some(effect => effect.type === 'skill_copy')
          ? { skillOverrides: combatant.character.skills }
          : {}),
      })),
      enemy: room.combatState.enemy.map(combatant => ({
        id: combatant.id,
        health: combatant.health,
        maxHealth: combatant.maxHealth,
        shield: combatant.shield,
        shieldExpiresTurn: combatant.shieldExpiresTurn,
        activeEffects: combatant.activeEffects,
        isDead: combatant.isDead,
        hasRevived: combatant.hasRevived,
        skillUseCounts: combatant.skillUseCounts,
        skillCooldowns: combatant.character.skills.map(skill => skill.currentCooldown || 0),
        ...(combatant.activeEffects.some(effect => effect.type === 'skill_copy')
          ? { skillOverrides: combatant.character.skills }
          : {}),
      })),
      playerChakra: room.combatState.playerChakra,
      enemyChakra: room.combatState.enemyChakra,
      winnerSide: room.combatState.winnerSide,
      damageDealt: room.combatState.damageDealt,
    } : null;
    return {
      id: room.id,
      seed: room.seed,
      players: full
        ? room.players.map(({ username, name, photoUrl }) => ({ username, name, photoUrl }))
        : room.players.map(({ username }) => ({ username })),
      turnActions,
      resolvedTurn: room.resolvedTurn,
      combatState,
      combatEventBatches: room.combatEventBatches || [],
      surrenderedBy: room.surrenderedBy,
      winnerUsername: room.winnerUsername,
      surrenderReason: room.surrenderReason,
      phaseDeadline: room.phaseDeadline,
    };
  }

  private broadcast(room: MatchRoomData, excludeUsername?: string): void {
    const payload = JSON.stringify({ type: 'room-state', room: this.roomPayload(room) });
    for (const socket of this.state.getWebSockets()) {
      const username = this.socketUsername(socket);
      if (socket.readyState === WebSocket.OPEN && username !== excludeUsername) {
        try { socket.send(payload); } catch (error) {
          console.error('[match-room] WebSocket broadcast failed.', error);
        }
      }
    }
  }

  private sendEvent(event: unknown, excludeUsername?: string): void {
    const payload = JSON.stringify(event);
    for (const socket of this.state.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN && this.socketUsername(socket) !== excludeUsername) {
        try { socket.send(payload); } catch (error) {
          console.error('[match-room] WebSocket event failed.', error);
        }
      }
    }
  }

  private socketUsername(socket: WebSocket): string | null {
    if (this.sockets.has(socket)) return this.sockets.get(socket)!;
    const attachment = socket.deserializeAttachment() as { username?: unknown } | null;
    const username = typeof attachment?.username === 'string' ? attachment.username : null;
    if (username) this.sockets.set(socket, username);
    return username;
  }

  private connectWebSocket(): Response {
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) as Record<string, unknown>;
    } catch {
      socket.send(JSON.stringify({ type: 'error', error: 'Mensagem WebSocket inválida.' }));
      return;
    }
    let room = this.readRoom();
    if (!room) {
      socket.send(JSON.stringify({ type: 'error', error: 'Sala não encontrada.' }));
      socket.close(1008, 'Unknown match room');
      return;
    }
    if (message.type === 'join') {
      const username = canonicalUsername(message.username);
      const slot = this.slotOf(room, username);
      if ((slot !== 0 && slot !== 1) || message.roomId !== room.id ||
        !await verifySession(this.env, username, typeof message.sessionToken === 'string' ? message.sessionToken : null)) {
        socket.send(JSON.stringify({ type: 'error', error: 'Sessão inválida ou usuário fora da sala.' }));
        socket.close(1008, 'Unauthorized match socket');
        return;
      }
      socket.serializeAttachment({
        username,
        sessionToken: typeof message.sessionToken === 'string' ? message.sessionToken : null,
      });
      this.sockets.set(socket, username);
      room.pings[slot] = Date.now();
      await this.saveRoom(room);
      socket.send(JSON.stringify({ type: 'room-state', room: this.roomPayload(room, true) }));
      return;
    }
    const username = this.socketUsername(socket);
    if (message.type === 'activity' && username) {
      room = this.readRoom();
      const slot = room ? this.slotOf(room, username) : -1;
      if (!room || (slot !== 0 && slot !== 1) ||
        room.surrenderedBy || room.winnerUsername) return;
      const now = Date.now();
      if (await this.forfeitIfInactive(room, now)) return;
      this.touchPlayerActivity(room, slot, now);
      await this.saveRoom(room);
      return;
    }
    if (message.type === 'ping' && username) {
      room = this.readRoom();
      const slot = room ? this.slotOf(room, username) : -1;
      if (!room || (slot !== 0 && slot !== 1) ||
        !await verifySession(this.env, username, this.currentSocketToken(socket))) {
        socket.close(1008, 'Account session revoked');
        return;
      }
      room.pings[slot] = Date.now();
      await this.saveRoom(room);
      socket.send(JSON.stringify({ type: 'pong' }));
    }
  }

  private currentSocketToken(socket: WebSocket): string | null {
    const attachment = socket.deserializeAttachment() as { sessionToken?: unknown } | null;
    return typeof attachment?.sessionToken === 'string' ? attachment.sessionToken : null;
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    this.sockets.delete(socket);
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    this.sockets.delete(socket);
  }

  private async submit(room: MatchRoomData, slot: 0 | 1, body: Record<string, unknown>): Promise<Response> {
    if (room.surrenderedBy || room.winnerUsername) {
      if (room.winnerUsername && !room.surrenderedBy) await this.persistBattleHistory(room);
      return json({ success: true, room: this.roomPayload(room), alreadyFinished: true });
    }
    if (!room.combatState) {
      return fail(409, 'Esta sala não possui estado de combate autoritativo. Encerre a partida e procure outra sala.');
    }
    const turns = structuredClone(this.submissions());
    const protocolRoom = {
      seed: room.seed,
      players: room.players,
      turns,
      resolvedTurn: room.resolvedTurn,
      surrenderedBy: room.surrenderedBy,
      winnerUsername: room.winnerUsername,
    };
    const result = submitTurnActions(protocolRoom, slot, body.turn as number, body.actions);
    if (result.status === 'invalid') return fail(400, result.message);
    if (result.status === 'conflict') return fail(409, result.message);
    if (result.status === 'duplicate') {
      if (room.winnerUsername) await this.persistBattleHistory(room);
      return json({ success: true, resolvedTurn: room.resolvedTurn, room: this.roomPayload(room), duplicate: true });
    }
    const submittedTurn = body.turn as number;
    const submittedActions = turns[submittedTurn][slot]!;
    const bothSubmitted = turns[submittedTurn][0] !== null && turns[submittedTurn][1] !== null;
    const firstSlot = firstSlotForTurn(room.seed, submittedTurn);
    const actionOrder: (0 | 1)[] = bothSubmitted
      ? [firstSlot, firstSlot === 0 ? 1 : 0]
      : [slot];
    const appliedSlots = new Set<0 | 1>(
      room.actionsAppliedTurn === submittedTurn ? room.appliedActionSlots || [] : [],
    );
    let nextCombatState = room.combatState;
    let winnerSlot: 0 | 1 | null = null;
    for (const actionSlot of actionOrder) {
      if (appliedSlots.has(actionSlot)) continue;
      const applied = resolveAuthoritativeActions(
        nextCombatState,
        actionSlot,
        turns[submittedTurn][actionSlot] || [],
      );
      if (applied.status !== 'resolved') {
        const status = applied.status === 'unsupported' ? 422 : 400;
        return fail(status, `Ação recusada pelo motor autoritativo (${applied.code || 'ação inválida'}).`);
      }
      if (applied.actionEvents?.length) {
        recordQuestActionEvents(room.players, actionSlot, nextCombatState, applied.actionEvents);
      }
      nextCombatState = applied.state;
      if (applied.actionEvents?.length) {
        room.combatEventBatches = [
          ...(room.combatEventBatches || []),
          {
            id: `${submittedTurn}:${actionSlot}`,
            turn: submittedTurn,
            slot: actionSlot,
            actions: applied.actionEvents,
          },
        ].slice(-8);
      }
      appliedSlots.add(actionSlot);
      winnerSlot = applied.winnerSlot;
      if (winnerSlot !== null) break;
    }
    if (bothSubmitted) {
      room.resolvedTurn = submittedTurn;
      if (winnerSlot === null) {
        const advanced = advanceAuthoritativeTurn(nextCombatState, room.seed);
        if (advanced.status !== 'resolved') {
          return fail(400, `Turno recusado pelo motor autoritativo (${advanced.code || 'estado inválido'}).`);
        }
        nextCombatState = advanced.state;
        winnerSlot = advanced.winnerSlot;
      }
    }
    room.actionsAppliedTurn = submittedTurn;
    room.appliedActionSlots = [...appliedSlots];
    room.combatState = nextCombatState;
    room.phaseDeadline = Date.now() + 60000;
    room.timeoutStreak[slot] = 0;
    if (winnerSlot !== null) {
      room.winnerUsername = room.players[winnerSlot].username;
      room.finishedAt = Date.now();
    }
    this.state.storage.transactionSync(() => {
      this.state.storage.sql.exec(
        'INSERT INTO turn_submissions (turn, slot, actions_json) VALUES (?, ?, ?)',
        submittedTurn,
        slot,
        JSON.stringify(submittedActions),
      );
      this.state.storage.sql.exec(
        'INSERT INTO room_state (singleton, state_json) VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET state_json = excluded.state_json',
        JSON.stringify(room),
      );
    });
    await this.scheduleAlarm(room);
    if (winnerSlot !== null) await this.persistBattleHistory(room);
    this.broadcast(room, room.players[slot].username);
    return json({ success: true, resolvedTurn: room.resolvedTurn, room: this.roomPayload(room) });
  }

  private async roomState(room: MatchRoomData, url: URL, requesterSlot: 0 | 1): Promise<Response> {
    const now = Date.now();
    const otherSlot: 0 | 1 = requesterSlot === 0 ? 1 : 0;
    if (!room.surrenderedBy && now - room.pings[otherSlot] > 60000) {
      await this.forfeit(room, room.players[otherSlot].username, 'disconnect');
      room = this.readRoom() || room;
    }
    const all = this.submissions();
    const queryTurn = Number.parseInt(url.searchParams.get('turn') || '', 10);
    const current = Number.isSafeInteger(queryTurn) && queryTurn > 0 ? queryTurn : room.resolvedTurn + 1;
    const turnActions: Record<number, [unknown[] | null, unknown[] | null]> = {};
    for (let turn = Math.max(1, current - 1); turn <= current + 1; turn++) {
      if (all[turn]) turnActions[turn] = all[turn];
    }
    const payload = this.roomPayload(room);
    payload.turnActions = turnActions;
    return json({ success: true, room: payload });
  }

  private report(): Response {
    return fail(410, 'Relatórios de vida e chakra enviados pelo cliente foram desativados.');
  }

  private async awardRoomRewards(
    room: MatchRoomData,
    winnerUsername: string,
  ): Promise<AuthoritativeMatchReward[]> {
    if (!room.combatState) return [];
    if (!this.env.DB) throw new Error('D1 indisponível para conceder recompensas de batalha.');
    return awardD1MatchRewards({ DB: this.env.DB }, {
      roomId: room.id,
      winnerUsername,
      turns: Math.max(1, room.combatState.turn),
      players: room.players.map((player, slot) => ({
        username: player.username,
        aliveCount: (slot === 0 ? room.combatState!.player : room.combatState!.enemy)
          .filter(combatant => !combatant.isDead).length,
        damageDealt: room.combatState!.damageDealt?.[slot === 0 ? 'player' : 'enemy'] || 0,
        activeQuestId: player.activeQuestId,
        questStats: player.questStats,
      })),
    });
  }

  private async persistBattleHistory(room: MatchRoomData): Promise<AuthoritativeMatchReward[]> {
    if (!room.winnerUsername || !room.finishedAt) return [];
    const record: HistoryRecord = {
      roomId: room.id,
      players: room.players.map(player => ({
        username: player.username,
        name: player.name || player.username,
      })) as HistoryRecord['players'],
      winnerUsername: room.winnerUsername,
      finishedAt: new Date(room.finishedAt).toISOString(),
      reason: 'battle',
    };
    const manager = this.env.MATCHMAKER.get(this.env.MATCHMAKER.idFromName('global-matchmaker'));
    const response = await manager.fetch('https://matchmaker.internal/internal/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (!response.ok) {
      throw new Error(`Falha ao salvar histórico da batalha ${room.id}: ${response.status}`);
    }
    return this.awardRoomRewards(room, room.winnerUsername);
  }

  private async surrender(room: MatchRoomData, username: string, body: Record<string, unknown>): Promise<Response> {
    if (room.surrenderedBy || room.winnerUsername) return json({ success: true, alreadyFinished: true });
    const reason = body.reason === 'disconnect' ? 'disconnect' : 'manual';
    await this.forfeit(room, username, reason);
    return json({ success: true });
  }

  private async forfeit(
    room: MatchRoomData,
    loserUsername: string,
    reason: 'manual' | 'disconnect' | 'timeout' | 'inactivity',
  ): Promise<void> {
    const loserSlot = this.slotOf(room, loserUsername);
    if (loserSlot < 0 || room.surrenderedBy || room.winnerUsername) return;
    const winner = room.players[loserSlot === 0 ? 1 : 0];
    const record: HistoryRecord = {
      roomId: room.id,
      players: room.players.map(player => ({ username: player.username, name: player.name || player.username })) as HistoryRecord['players'],
      winnerUsername: winner.username,
      finishedAt: new Date().toISOString(),
      reason,
    };
    const manager = this.env.MATCHMAKER.get(this.env.MATCHMAKER.idFromName('global-matchmaker'));
    const historyResponse = await manager.fetch('https://matchmaker.internal/internal/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (!historyResponse.ok) throw new Error(`Falha ao salvar histórico da sala ${room.id}: ${historyResponse.status}`);
    await this.awardRoomRewards(room, winner.username);
    room.surrenderedBy = loserUsername;
    room.surrenderReason = reason;
    room.finishedAt = Date.now();
    room.phaseDeadline = Date.now() + 60000;
    await this.saveRoom(room);
    this.broadcast(room);
  }

  private async sendEmoji(room: MatchRoomData, username: string, body: Record<string, unknown>): Promise<Response> {
    if (typeof body.emoji !== 'string' || body.emoji.length > 32) return fail(400, 'Reação inválida.');
    const slot = this.slotOf(room, username);
    if (slot !== 0 && slot !== 1) return fail(403, 'Você não faz parte desta sala.');
    const player = room.players[slot];
    const emoji = { username, senderName: player.name || username, emoji: body.emoji, timestamp: Date.now() };
    this.state.storage.sql.exec(
      'INSERT INTO emojis (username, sender_name, emoji, timestamp) VALUES (?, ?, ?, ?)',
      username,
      emoji.senderName,
      emoji.emoji,
      emoji.timestamp,
    );
    this.state.storage.sql.exec('DELETE FROM emojis WHERE id NOT IN (SELECT id FROM emojis ORDER BY id DESC LIMIT 30)');
    this.sendEvent({ type: 'emoji', emoji }, username);
    return json({ success: true });
  }

  private getEmojis(url: URL): Response {
    const since = Number.parseInt(url.searchParams.get('since') || '0', 10);
    const emojis = this.state.storage.sql.exec<EmojiRow>(
      'SELECT username, sender_name, emoji, timestamp FROM emojis WHERE timestamp > ? ORDER BY timestamp',
      Number.isFinite(since) ? since : 0,
    ).toArray().map(row => ({
      username: row.username,
      senderName: row.sender_name,
      emoji: row.emoji,
      timestamp: row.timestamp,
    }));
    return json({ success: true, emojis });
  }

  private async sendChat(room: MatchRoomData, username: string, body: Record<string, unknown>): Promise<Response> {
    if (typeof body.text !== 'string') return fail(400, 'Dados inválidos.');
    const text = this.sanitizeChat(body.text);
    if (!text) return fail(400, 'Mensagem inválida. Emojis, mídias e links não são permitidos.');
    const slot = this.slotOf(room, username);
    if (slot !== 0 && slot !== 1) return fail(403, 'Você não faz parte desta sala.');
    const player = room.players[slot];
    const id = `msg_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const senderTitle = typeof body.title === 'string' ? this.sanitizeChat(body.title) : null;
    const message = {
      id,
      username,
      senderName: player.name || username,
      ...(senderTitle ? { senderTitle } : {}),
      text,
      timestamp: Date.now(),
    };
    this.state.storage.sql.exec(
      'INSERT INTO chat_messages (id, username, sender_name, sender_title, text, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      message.id,
      message.username,
      message.senderName,
      senderTitle,
      message.text,
      message.timestamp,
    );
    this.state.storage.sql.exec('DELETE FROM chat_messages WHERE id NOT IN (SELECT id FROM chat_messages ORDER BY timestamp DESC LIMIT 50)');
    this.sendEvent({ type: 'chat', message });
    return json({ success: true, message });
  }

  private getChat(url: URL): Response {
    const since = Number.parseInt(url.searchParams.get('since') || '0', 10);
    const messages = this.state.storage.sql.exec<ChatRow>(
      'SELECT id, username, sender_name, sender_title, text, timestamp FROM chat_messages WHERE timestamp > ? ORDER BY timestamp',
      Number.isFinite(since) ? since : 0,
    ).toArray().map(row => ({
      id: row.id,
      username: row.username,
      senderName: row.sender_name,
      ...(row.sender_title ? { senderTitle: row.sender_title } : {}),
      text: row.text,
      timestamp: row.timestamp,
    }));
    return json({ success: true, messages });
  }

  private sanitizeChat(raw: string): string {
    let text = raw.trim().replace(/<[^>]*>/g, '');
    text = text.replace(
      /([\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F251}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{FE00}-\u{FE0F}])/gu,
      '',
    );
    text = text.replace(
      /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(com|net|org|io|br|edu|gov|xyz|app|dev)(\/[^\s]*)?)/gi,
      '[link removido]',
    );
    text = text.replace(/[a-zA-Z0-9_.-]+\.(png|jpg|jpeg|gif|webp|mp4|webm|mov|avi|mkv)/gi, '[mídia removida]');
    return text.slice(0, 100).trim();
  }

  async alarm(): Promise<void> {
    const room = this.readRoom();
    if (!room) return;
    const now = Date.now();
    if (room.surrenderedBy || room.winnerUsername) {
      if (room.finishedAt && now - room.finishedAt > 600000) {
        this.state.storage.sql.exec('DELETE FROM room_state');
        this.state.storage.sql.exec('DELETE FROM turn_submissions');
        return;
      }
      await this.scheduleAlarm(room);
      return;
    }
    if (await this.forfeitIfInactive(room, now)) return;
    if (now <= room.phaseDeadline) {
      await this.scheduleAlarm(room);
      return;
    }
    const turns = this.submissions();
    const turn = room.resolvedTurn + 1;
    const slots = turns[turn] || [null, null];
    const leader = firstSlotForTurn(room.seed, turn);
    const activeSlot: 0 | 1 | null = slots[0] === null && slots[1] === null
      ? leader
      : slots[0] !== null && slots[1] === null
        ? 1
        : slots[0] === null && slots[1] !== null
          ? 0
          : null;
    if (activeSlot === null) {
      room.phaseDeadline = now + 60000;
      await this.saveRoom(room);
      return;
    }
    const resolvedSlot: 0 | 1 = activeSlot === 0 ? 0 : 1;
    if (now - room.pings[resolvedSlot] < 75000) {
      room.phaseDeadline = now + 45000;
      await this.saveRoom(room);
      return;
    }
    this.state.storage.sql.exec(
      'INSERT OR IGNORE INTO turn_submissions (turn, slot, actions_json) VALUES (?, ?, ?)',
      turn,
      resolvedSlot,
      '[]',
    );
    room.timeoutStreak[resolvedSlot] += 1;
    room.phaseDeadline = now + 60000;
    const updatedTurns = this.submissions();
    if (updatedTurns[turn]?.[0] !== null && updatedTurns[turn]?.[1] !== null) room.resolvedTurn = turn;
    if (room.timeoutStreak[resolvedSlot] >= 2) {
      await this.forfeit(room, room.players[resolvedSlot].username, 'timeout');
      return;
    }
    await this.saveRoom(room);
    this.broadcast(room);
  }
}
