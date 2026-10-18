import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  awardD1MatchRewards,
  getD1Config,
  handleD1Request,
  type D1Database,
  type D1PreparedStatement,
} from '../workers/d1Api';

type Row = Record<string, unknown>;

class MemoryD1 implements D1Database {
  accounts = new Map<string, Row>();
  tickets = new Map<string, Row>();
  sessions = new Map<string, Row>();
  configHeads = new Map<string, Row>();
  configItems: Row[] = [];
  configWriteLocks = new Map<string, Row>();
  rewardClaims = new Set<string>();
  lastChanges = 0;
  profileUpdateCount = 0;

  prepare(query: string): D1PreparedStatement {
    return new MemoryStatement(this, query);
  }

  async batch(statements: D1PreparedStatement[]) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

class MemoryStatement implements D1PreparedStatement {
  private values: unknown[] = [];

  constructor(private readonly db: MemoryD1, private readonly query: string) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this;
  }

  async run() {
    const q = this.query.replace(/\s+/g, ' ').trim().toLowerCase();
    if (q.startsWith('insert into accounts')) {
      const [username, password_salt, password_hash, profile_json] = this.values;
      if (this.db.accounts.has(String(username))) return { success: true, meta: { changes: 0 } };
      this.db.accounts.set(String(username), {
        username, password_salt, password_hash, profile_json,
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith('insert into session_tickets')) {
      const [ticket_hash, username, expires_at] = this.values;
      this.db.tickets.set(String(ticket_hash), { ticket_hash, username, expires_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith('insert into account_sessions')) {
      const [username, active_token_hash] = this.values;
      if (!this.db.sessions.has(String(username))) {
        this.db.sessions.set(String(username), {
          username,
          active_token_hash,
          pending_token_hashes_json: '[]',
          updated_at: Date.now(),
        });
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }
    if (q.startsWith('update account_sessions set pending_token_hashes_json')) {
      const [pending, username, active, previousPending, updatedAt] = this.values;
      const row = this.db.sessions.get(String(username));
      if (row?.active_token_hash === active &&
          row.pending_token_hashes_json === previousPending &&
          row.updated_at === updatedAt) {
        row.pending_token_hashes_json = pending;
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }
    if (q.startsWith('update account_sessions set updated_at = current_timestamp')) {
      const [username, active] = this.values;
      const row = this.db.sessions.get(String(username));
      if (row?.active_token_hash === active) {
        row.updated_at = Date.now();
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }
    if (q.startsWith('update account_sessions set updated_at = datetime')) {
      const [username, active] = this.values;
      const row = this.db.sessions.get(String(username));
      if (row?.active_token_hash === active) {
        row.updated_at = Date.now() - 240_000;
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }
    if (q.startsWith('update account_sessions set active_token_hash')) {
      const [active, username, previous] = this.values;
      const row = this.db.sessions.get(String(username));
      if (row?.active_token_hash === previous) {
        row.active_token_hash = active;
        row.pending_token_hashes_json = '[]';
        row.updated_at = Date.now();
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }
    if (q.startsWith('delete from account_sessions')) {
      const [username, active] = this.values;
      const row = this.db.sessions.get(String(username));
      if (row?.active_token_hash === active) this.db.sessions.delete(String(username));
      return { success: true, meta: { changes: row?.active_token_hash === active ? 1 : 0 } };
    }
    if (q.startsWith('insert or ignore into online_battle_rewards')) {
      const [roomId, username] = this.values;
      const key = `${roomId}:${username}`;
      const changes = this.db.rewardClaims.has(key) ? 0 : 1;
      this.db.rewardClaims.add(key);
      this.db.lastChanges = changes;
      return { success: true, meta: { changes } };
    }
    if (q.startsWith('update accounts set profile_json = ?')) {
      const [profile_json, username, expectedProfile] = this.values;
      const row = this.db.accounts.get(String(username));
      const matches = !!row && (expectedProfile === undefined || row.profile_json === expectedProfile);
      if (matches && row) {
        row.profile_json = profile_json;
        this.db.profileUpdateCount++;
      }
      this.db.lastChanges = matches ? 1 : 0;
      return { success: true, meta: { changes: matches ? 1 : 0 } };
    }
    if (q.startsWith('update accounts set profile_json = json_set(') &&
        q.includes('json_insert')) {
      const mail = JSON.parse(String(this.values[0])) as Row;
      const targetUsername = q.includes("where username != 'convidado'")
        ? null
        : String(this.values[1]);
      const recipients = targetUsername === null
        ? [...this.db.accounts.values()].filter(row => row.username !== 'convidado')
        : [this.db.accounts.get(targetUsername)].filter((row): row is Row => !!row);
      for (const row of recipients) {
        const profile = JSON.parse(String(row.profile_json)) as Row;
        const inbox = Array.isArray(profile.questMaintenanceInbox)
          ? profile.questMaintenanceInbox as Row[]
          : [];
        inbox.push(mail);
        profile.questMaintenanceInbox = inbox;
        row.profile_json = JSON.stringify(profile);
      }
      this.db.lastChanges = recipients.length;
      return { success: true, meta: { changes: recipients.length } };
    }
    if (q.startsWith('update accounts set profile_json = json_set(profile_json,')) {
      const [rankJson, username, expectedXp] = this.values;
      const row = this.db.accounts.get(String(username));
      const profile = row ? JSON.parse(String(row.profile_json)) as Row : null;
      const changes = !!row && Number(profile?.xp || 0) === Number(expectedXp) ? 1 : 0;
      if (changes && row && profile) {
        profile.rank = JSON.parse(String(rankJson));
        row.profile_json = JSON.stringify(profile);
      }
      this.db.lastChanges = changes;
      return { success: true, meta: { changes } };
    }
    if (q.startsWith('update accounts set profile_json = json_set(')) {
      const [xpDelta, winsDelta, lossesDelta] = this.values;
      const username = this.values[this.values.length - 1];
      const row = this.db.accounts.get(String(username));
      const changes = row && this.db.lastChanges === 1 ? 1 : 0;
      if (changes) {
        const profile = JSON.parse(String(row.profile_json)) as Row;
        profile.xp = Math.max(0, (Number(profile.xp) || 0) + Number(xpDelta));
        profile.wins = (Number(profile.wins) || 0) + Number(winsDelta);
        profile.losses = (Number(profile.losses) || 0) + Number(lossesDelta);
        if (q.includes('$.questprogress')) {
          profile.questProgress = JSON.parse(String(this.values[3]));
        }
        row.profile_json = JSON.stringify(profile);
      }
      this.db.lastChanges = changes;
      return { success: true, meta: { changes } };
    }
    if (q.startsWith('insert into game_config_write_locks')) {
      const [config_key, owner_token, expires_at, now] = this.values;
      const current = this.db.configWriteLocks.get(String(config_key));
      if (!current || Number(current.expires_at) <= Number(now)) {
        this.db.configWriteLocks.set(String(config_key), {
          config_key, owner_token, expires_at,
        });
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }
    if (q.startsWith('update game_config_write_locks')) {
      const [expires_at, config_key, owner_token] = this.values;
      const current = this.db.configWriteLocks.get(String(config_key));
      if (current?.owner_token === owner_token) {
        current.expires_at = expires_at;
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }
    if (q.startsWith('delete from game_config_write_locks')) {
      const [config_key, owner_token] = this.values;
      const current = this.db.configWriteLocks.get(String(config_key));
      const changes = current?.owner_token === owner_token ? 1 : 0;
      if (changes) this.db.configWriteLocks.delete(String(config_key));
      return { success: true, meta: { changes } };
    }
    if (q.startsWith('insert into game_config_items')) {
      const [config_key, version_id, ordinal, chunk_number, value_part] = this.values;
      this.db.configItems.push({ config_key, version_id, ordinal, chunk_number, value_part });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith('insert into game_config_versions')) {
      const [config_key, version_id, item_count] = this.values;
      this.db.configHeads.set(String(config_key), { config_key, version_id, item_count });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith('delete from game_config_items')) {
      const [config_key, version_id] = this.values;
      this.db.configItems = this.db.configItems.filter(row =>
        row.config_key !== config_key || row.version_id === version_id,
      );
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith('delete from game_config where')) {
      return { success: true, meta: { changes: 0 } };
    }
    throw new Error(`Unhandled mock D1 statement: ${q.slice(0, 90)}`);
  }

  async first<T = Row>(): Promise<T | null> {
    const q = this.query.replace(/\s+/g, ' ').trim().toLowerCase();
    if (q.startsWith('select username, password_salt, password_hash, profile_json from accounts')) {
      return (this.db.accounts.get(String(this.values[0])) as T) || null;
    }
    if (q.startsWith('select profile_json from accounts')) {
      const row = this.db.accounts.get(String(this.values[0]));
      return row ? { profile_json: row.profile_json } as T : null;
    }
    if (q.startsWith('select active_token_hash from account_sessions')) {
      const row = this.db.sessions.get(String(this.values[0]));
      return row ? { active_token_hash: row.active_token_hash } as T : null;
    }
    if (q.startsWith('select active_token_hash, pending_token_hashes_json from account_sessions')) {
      return (this.db.sessions.get(String(this.values[0])) as T) || null;
    }
    if (q.startsWith('select active_token_hash, pending_token_hashes_json, updated_at,')) {
      const row = this.db.sessions.get(String(this.values[0]));
      if (!row) return null;
      const updatedAt = Number(row.updated_at);
      return {
        ...row,
        lease_expired: Number.isFinite(updatedAt) && Date.now() - updatedAt >= 180_000 ? 1 : 0,
      } as T;
    }
    if (q.startsWith('delete from session_tickets')) {
      const [ticket_hash, username, now] = this.values;
      const ticket = this.db.tickets.get(String(ticket_hash));
      if (ticket?.username === username && Number(ticket.expires_at) > Number(now)) {
        this.db.tickets.delete(String(ticket_hash));
        return { username } as T;
      }
      return null;
    }
    if (q.startsWith('select version_id, item_count from game_config_versions')) {
      const row = this.db.configHeads.get(String(this.values[0]));
      return row ? { version_id: row.version_id, item_count: row.item_count } as T : null;
    }
    if (q.startsWith('select version_id from game_config_versions')) {
      const row = this.db.configHeads.get(String(this.values[0]));
      return row ? { version_id: row.version_id } as T : null;
    }
    if (q.startsWith('select value_json from game_config where')) return null;
    throw new Error(`Unhandled mock D1 first: ${q.slice(0, 90)}`);
  }

  async all<T = Row>() {
    const q = this.query.replace(/\s+/g, ' ').trim().toLowerCase();
    if (q.startsWith('select username, profile_json from accounts')) {
      return {
        success: true,
        results: [...this.db.accounts.values()].map(row => ({
          username: row.username,
          profile_json: row.profile_json,
        })) as T[],
      };
    }
    if (q.startsWith('select ordinal, chunk_number, value_part from game_config_items')) {
      const [key, version] = this.values;
      const results = this.db.configItems
        .filter(row => row.config_key === key && row.version_id === version)
        .sort((left, right) =>
          Number(left.ordinal) - Number(right.ordinal) ||
          Number(left.chunk_number) - Number(right.chunk_number),
        )
        .map(row => ({
          ordinal: row.ordinal,
          chunk_number: row.chunk_number,
          value_part: row.value_part,
        }));
      return { success: true, results: results as T[] };
    }

    throw new Error(`Unhandled mock D1 all: ${q.slice(0, 90)}`);
  }
}

test('awards server-derived online rewards idempotently and updates rank', async () => {
  const db = new MemoryD1();
  db.accounts.set('winner', {
    username: 'winner',
    password_salt: null,
    password_hash: null,
    profile_json: JSON.stringify({ username: 'winner', name: 'Winner', xp: 100, wins: 2, losses: 1 }),
  });
  db.accounts.set('loser', {
    username: 'loser',
    password_salt: null,
    password_hash: null,
    profile_json: JSON.stringify({ username: 'loser', name: 'Loser', xp: 500, wins: 1, losses: 4 }),
  });
  db.configHeads.set('ranks', { config_key: 'ranks', version_id: 'rank-v1', item_count: 3 });
  db.configItems.push(
    { config_key: 'ranks', version_id: 'rank-v1', ordinal: 0, chunk_number: 0, value_part: JSON.stringify({ id: 'academy', name: 'Academia', requiredXp: 0 }) },
    { config_key: 'ranks', version_id: 'rank-v1', ordinal: 1, chunk_number: 0, value_part: JSON.stringify({ id: 'genin', name: 'Genin', requiredXp: 200 }) },
    { config_key: 'ranks', version_id: 'rank-v1', ordinal: 2, chunk_number: 0, value_part: JSON.stringify({ id: 'chunin', name: 'Chunin', requiredXp: 600 }) },
  );

  const match = {
    roomId: 'room-reward-1',
    winnerUsername: 'winner',
    turns: 3,
    players: [
      { username: 'winner', aliveCount: 2, damageDealt: 200 },
      { username: 'loser', aliveCount: 1, damageDealt: 100 },
    ],
  };
  const first = await awardD1MatchRewards({ DB: db }, match);
  const winnerAfterFirst = JSON.parse(String(db.accounts.get('winner')?.profile_json));
  const loserAfterFirst = JSON.parse(String(db.accounts.get('loser')?.profile_json));
  assert.equal(winnerAfterFirst.xp, 525);
  assert.equal(winnerAfterFirst.wins, 3);
  assert.equal(winnerAfterFirst.rank.id, 'genin');
  assert.equal(loserAfterFirst.xp, 79);
  assert.equal(loserAfterFirst.losses, 5);
  assert.equal(loserAfterFirst.rank.id, 'academy');
  assert.equal(first[0].user?.xp, 525);

  await awardD1MatchRewards({ DB: db }, match);
  assert.equal(JSON.parse(String(db.accounts.get('winner')?.profile_json)).xp, 525);
  assert.equal(JSON.parse(String(db.accounts.get('loser')?.profile_json)).xp, 79);
  assert.equal(db.rewardClaims.size, 2);
});

function request(path: string, method = 'POST', body?: unknown, headers?: HeadersInit): Request {
  return new Request(`https://worker.test${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function seedD1Config(db: MemoryD1, key: string, items: unknown[]): void {
  const version = `${key}-seed`;
  db.configHeads.set(key, { config_key: key, version_id: version, item_count: items.length });
  items.forEach((item, ordinal) => {
    db.configItems.push({
      config_key: key,
      version_id: version,
      ordinal,
      chunk_number: 0,
      value_part: JSON.stringify(item),
    });
  });
}

test('records authenticated AI battle progress across eligible quests once per battle', async () => {
  const env = { DB: new MemoryD1() };
  const registration = await handleD1Request(request('/api/auth/register', 'POST', {
    username: 'ai_quest_user',
    password: 'correct horse',
    name: 'AI Quest User',
  }), env);
  const token = 'a'.repeat(64);
  await handleD1Request(request('/api/auth/session/claim', 'POST', {
    username: 'ai_quest_user',
    sessionToken: token,
    sessionTicket: (await responseBody(registration!)).sessionTicket,
  }), env);
  seedD1Config(env.DB, 'quests', [{
    id: 'ai-quest',
    title: 'Missão IA',
    minRank: 'Estudante de Academia',
    requiredQuestIds: [],
    goals: [{
      id: 'use-rasengan',
      type: 'use_skill',
      targetSkill: 'Rasengan',
      targetValue: 2,
      currentValue: 0,
      currentStreak: 0,
    }, {
      id: 'win-with-naruto',
      type: 'win_battles_with_chars',
      targetCharacters: ['Naruto Uzumaki'],
      targetValue: 1,
      currentValue: 0,
    }, {
      id: 'win-with-sasuke',
      type: 'win_battles_with_chars',
      targetCharacters: ['Sasuke Uchiha'],
      targetValue: 1,
      currentValue: 0,
    }],
    rewards: [],
  }, {
    id: 'ai-quest-follow-up',
    title: 'Outra missão IA',
    minRank: 'Estudante',
    requiredQuestIds: [],
    goals: [{
      id: 'win-with-naruto-too',
      type: 'win_battles_with_chars',
      targetCharacters: ['Naruto Uzumaki'],
      targetValue: 1,
      currentValue: 0,
    }],
    rewards: [],
  }]);
  seedD1Config(env.DB, 'ranks', [{
    name: 'Estudante',
    requiredXp: 0,
  }, {
    name: 'Genin',
    requiredXp: 1000,
  }]);
  const stats = {
    damageDealt: 0,
    damageReceived: 0,
    healingDone: 0,
    shieldGenerated: 0,
    stunsApplied: 0,
    skillsUsed: { Rasengan: 2 },
    killsWithSkill: {},
    playerCharactersUsed: ['Naruto Uzumaki (S)', 'Sasuke Uchiha (S)'],
    playerTeamCharacters: [
      { name: 'Naruto Uzumaki (S)', tags: ['Folha'] },
      { name: 'Sasuke Uchiha (S)', tags: ['Folha'] },
    ],
    damageDealtRecords: [],
    damageReceivedRecords: [],
    healingDoneRecords: [],
    shieldGeneratedRecords: [],
    killRecords: [],
    counterRecords: [],
    skillUseRecords: [
      { charName: 'Uzumaki Naruto', tags: ['Folha'], skillName: 'Rasengan' },
      { charName: 'Uzumaki Naruto', tags: ['Folha'], skillName: 'Rasengan' },
    ],
  };
  const report = () => handleD1Request(request('/api/quests/ai-progress', 'POST', {
    username: 'ai_quest_user',
    battleId: 'battle-ai-0001',
    victory: true,
    stats,
  }, { 'X-Account-Session': token }), env);

  const first = await report();
  assert.equal(first?.status, 200);
  const firstBody = await responseBody(first!);
  assert.equal((firstBody.user as Row).questProgress instanceof Object, true);
  assert.equal(((firstBody.user as Row).questProgress as Row)['ai-quest'] instanceof Array, true);
  assert.equal((((firstBody.user as Row).questProgress as Row)['ai-quest'] as Row[])[0].currentValue, 2);
  assert.equal((((firstBody.user as Row).questProgress as Row)['ai-quest'] as Row[])[1].currentValue, 1);
  assert.equal((((firstBody.user as Row).questProgress as Row)['ai-quest'] as Row[])[2].currentValue, 1);
  assert.equal((((firstBody.user as Row).questProgress as Row)['ai-quest-follow-up'] as Row[])[0].currentValue, 1);
  assert.deepEqual(firstBody.progressedQuestIds, ['ai-quest', 'ai-quest-follow-up']);

  const duplicate = await report();
  assert.equal(duplicate?.status, 200);
  assert.equal((await responseBody(duplicate!)).alreadyProcessed, true);
  assert.equal(env.DB.profileUpdateCount, 1);
});

test('claims completed quest rewards once and does not duplicate owned item rewards', async () => {
  const env = { DB: new MemoryD1() };
  const registration = await handleD1Request(request('/api/auth/register', 'POST', {
    username: 'quest_claim_user',
    password: 'correct horse',
    name: 'Quest Claim User',
  }), env);
  const token = 'b'.repeat(64);
  await handleD1Request(request('/api/auth/session/claim', 'POST', {
    username: 'quest_claim_user',
    sessionToken: token,
    sessionTicket: (await responseBody(registration!)).sessionTicket,
  }), env);
  seedD1Config(env.DB, 'quests', [{
    id: 'claimable-quest',
    title: 'Missão resgatável',
    minRank: 'Estudante de Academia',
    requiredQuestIds: [],
    goals: [{ id: 'win-with-naruto', type: 'win_battles_with_chars', targetValue: 1 }],
    rewards: [
      { type: 'ryos', value: '250' },
      { type: 'title', value: 'Herói de Konoha' },
      { type: 'card', value: 'card-001' },
    ],
  }]);
  seedD1Config(env.DB, 'ranks', [{ name: 'Estudante', requiredXp: 0 }]);
  const row = env.DB.accounts.get('quest_claim_user')!;
  const profile = JSON.parse(String(row.profile_json)) as Row;
  profile.questProgress = {
    'claimable-quest': [{ id: 'win-with-naruto', currentValue: 1, currentStreak: 0 }],
  };
  profile.collectedCardIds = ['card-001'];
  row.profile_json = JSON.stringify(profile);

  const claim = () => handleD1Request(request('/api/quests/claim', 'POST', {
    username: 'quest_claim_user',
    questId: 'claimable-quest',
  }, { 'X-Account-Session': token }), env);
  const first = await claim();
  assert.equal(first?.status, 200);
  const firstBody = await responseBody(first!);
  const updatedUser = firstBody.user as Row;
  assert.deepEqual(updatedUser.completedQuestIds, ['claimable-quest']);
  assert.equal(updatedUser.ryos, 1750);
  assert.deepEqual(updatedUser.unlockedTitles, ['Herói de Konoha']);
  assert.deepEqual(updatedUser.collectedCardIds, ['card-001']);
  assert.deepEqual(firstBody.grantedRewards, [
    { type: 'ryos', value: '250' },
    { type: 'title', value: 'Herói de Konoha' },
  ]);

  const duplicate = await claim();
  assert.equal(duplicate?.status, 200);
  assert.equal((await responseBody(duplicate!)).alreadyClaimed, true);
  assert.equal(JSON.parse(String(env.DB.accounts.get('quest_claim_user')!.profile_json)).ryos, 1750);
});

test('registers accounts with hashed passwords, rejects duplicates, and verifies login', async () => {
  const env = { DB: new MemoryD1() };
  const registration = await handleD1Request(request('/api/auth/register', 'POST', {
    username: 'Beta_Test',
    password: 'correct horse',
    name: 'Beta Test',
  }), env);
  assert.equal(registration?.status, 200);
  const created = await responseBody(registration!);
  assert.equal(typeof created.sessionTicket, 'string');
  assert.deepEqual(created.user, {
    username: 'beta_test',
    name: 'Beta Test',
    photoUrl: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg',
  });
  assert.equal(JSON.stringify(created).includes('correct horse'), false);
  assert.notEqual(env.DB.accounts.get('beta_test')?.password_hash, 'correct horse');

  const duplicate = await handleD1Request(request('/api/auth/register', 'POST', {
    username: 'beta_test',
    password: 'other password',
    name: 'Other',
  }), env);
  assert.equal(duplicate?.status, 409);

  const badLogin = await handleD1Request(request('/api/auth/login', 'POST', {
    username: 'beta_test',
    password: 'wrong password',
  }), env);
  assert.equal(badLogin?.status, 401);
  const login = await handleD1Request(request('/api/auth/login', 'POST', {
    username: 'beta_test',
    password: 'correct horse',
  }), env);
  assert.equal(login?.status, 200);
});

test('claims sessions, reports takeover, and revokes the prior device', async () => {
  const env = { DB: new MemoryD1() };
  const signup = await handleD1Request(request('/api/auth/register', 'POST', {
    username: 'session_user',
    password: 'password',
    name: 'Session User',
  }), env);
  const firstTicket = String((await responseBody(signup!)).sessionTicket);
  const firstToken = '123e4567-e89b-12d3-a456-426614174000';
  const firstClaim = await handleD1Request(request('/api/auth/session/claim', 'POST', {
    username: 'session_user',
    sessionToken: firstToken,
    sessionTicket: firstTicket,
    initialVillageId: 'konoha',
  }), env);
  assert.equal((await responseBody(firstClaim!)).status, 'active');
  const firstProfile = JSON.parse(String(env.DB.accounts.get('session_user')?.profile_json));
  assert.equal(firstProfile.village, 'konoha');
  assert.equal(firstProfile.villageChangeCount, 0);
  assert.equal(firstProfile.ryos, 1500);

  const secondLogin = await handleD1Request(request('/api/auth/login', 'POST', {
    username: 'session_user',
    password: 'password',
  }), env);
  const secondTicket = String((await responseBody(secondLogin!)).sessionTicket);
  const secondToken = 'b'.repeat(64);
  const secondClaim = await handleD1Request(request('/api/auth/session/claim', 'POST', {
    username: 'session_user',
    sessionToken: secondToken,
    sessionTicket: secondTicket,
  }), env);
  assert.equal((await responseBody(secondClaim!)).status, 'pending');

  const activeStatus = await handleD1Request(request('/api/auth/session/status', 'POST', {
    username: 'session_user',
    sessionToken: firstToken,
  }), env);
  assert.equal((await responseBody(activeStatus!)).takeoverRequested, true);

  const takeover = await handleD1Request(request('/api/auth/session/takeover', 'POST', {
    username: 'session_user',
    sessionToken: firstToken,
  }), env);
  assert.equal(takeover?.status, 200);
  const revokedStatus = await handleD1Request(request('/api/auth/session/status', 'POST', {
    username: 'session_user',
    sessionToken: firstToken,
  }), env);
  const activeNewStatus = await handleD1Request(request('/api/auth/session/status', 'POST', {
    username: 'session_user',
    sessionToken: secondToken,
  }), env);
  assert.equal((await responseBody(revokedStatus!)).status, 'revoked');
  assert.equal((await responseBody(activeNewStatus!)).status, 'active');

  const activeLease = env.DB.sessions.get('session_user')?.updated_at;
  const thirdLogin = await handleD1Request(request('/api/auth/login', 'POST', {
    username: 'session_user',
    password: 'password',
  }), env);
  const thirdToken = 'c'.repeat(64);
  const thirdClaim = await handleD1Request(request('/api/auth/session/claim', 'POST', {
    username: 'session_user',
    sessionToken: thirdToken,
    sessionTicket: (await responseBody(thirdLogin!)).sessionTicket,
  }), env);
  assert.equal((await responseBody(thirdClaim!)).status, 'pending');
  assert.equal(env.DB.sessions.get('session_user')?.updated_at, activeLease);

  const sessionRow = env.DB.sessions.get('session_user')!;
  sessionRow.updated_at = Date.now() - 180_001;
  const fourthLogin = await handleD1Request(request('/api/auth/login', 'POST', {
    username: 'session_user',
    password: 'password',
  }), env);
  const fourthToken = 'f'.repeat(64);
  const fourthClaim = await handleD1Request(request('/api/auth/session/claim', 'POST', {
    username: 'session_user',
    sessionToken: fourthToken,
    sessionTicket: (await responseBody(fourthLogin!)).sessionTicket,
  }), env);
  assert.equal((await responseBody(fourthClaim!)).status, 'active');
  assert.equal(env.DB.sessions.get('session_user')?.pending_token_hashes_json, '[]');

  const heartbeat = await handleD1Request(request('/api/auth/session/heartbeat', 'POST', {
    username: 'session_user',
    sessionToken: fourthToken,
  }), env);
  assert.equal((await responseBody(heartbeat!)).status, 'active');
  assert.ok(Date.now() - Number(env.DB.sessions.get('session_user')?.updated_at) < 1000);

  const unlock = await handleD1Request(request('/api/auth/session/unlock', 'POST', {
    username: 'session_user',
    sessionToken: fourthToken,
  }), env);
  assert.equal((await responseBody(unlock!)).status, 'active');
  assert.ok(Date.now() - Number(env.DB.sessions.get('session_user')?.updated_at) >= 180_000);
});

test('roulette draw charges 25000 coins and persists duplicate card copies', async () => {
  const db = new MemoryD1();
  const token = 'c'.repeat(64);
  db.accounts.set('roulette_user', {
    username: 'roulette_user',
    password_salt: null,
    password_hash: null,
    profile_json: JSON.stringify({
      username: 'roulette_user',
      ryos: 50_000,
      collectedCardIds: ['common-card'],
    }),
  });
  db.sessions.set('roulette_user', {
    username: 'roulette_user',
    active_token_hash: createHash('sha256').update(token).digest('hex'),
  });
  const card = {
    id: 'common-card',
    characterId: 'ninja',
    characterName: 'Ninja',
    slug: 'ninja',
    rarity: 'comum',
    title: 'Classic',
    description: 'Common card',
    points: 1,
  };
  db.configHeads.set('cards', { config_key: 'cards', version_id: 'cards-v1', item_count: 1 });
  db.configItems.push({
    config_key: 'cards',
    version_id: 'cards-v1',
    ordinal: 0,
    chunk_number: 0,
    value_part: JSON.stringify(card),
  });

  const draw = () => handleD1Request(request('/api/cards/roulette/draw', 'POST', {
    username: 'roulette_user',
  }, { 'X-Account-Session': token }), { DB: db });
  const first = await draw();
  assert.equal(first?.status, 200);
  const firstBody = await responseBody(first!);
  const firstCard = firstBody.card as { id: string };
  const firstUser = firstBody.user as { ryos: number; gems?: number; collectedCardIds: string[] };
  assert.equal(firstCard.id, 'common-card');
  assert.equal(firstBody.isDuplicate, true);
  assert.equal(firstUser.ryos, 25_000);
  assert.equal(firstUser.gems, undefined);
  assert.deepEqual(firstUser.collectedCardIds, ['common-card', 'common-card']);

  const second = await draw();
  assert.equal(second?.status, 200);
  const secondBody = await responseBody(second!);
  assert.equal(secondBody.isDuplicate, true);
  const secondUser = secondBody.user as { ryos: number; collectedCardIds: string[] };
  assert.equal(secondUser.ryos, 0);
  assert.equal(secondUser.collectedCardIds.length, 3);

  const insufficient = await draw();
  assert.equal(insufficient?.status, 409);
  assert.equal(JSON.parse(String(db.accounts.get('roulette_user')?.profile_json)).ryos, 0);
});

test('only the active session for account 2 can publish global configuration', async () => {
  const env = { DB: new MemoryD1() };
  const adminSignup = await handleD1Request(request('/api/auth/register', 'POST', {
    username: '2',
    password: 'admin-password',
    name: 'Admin',
  }), env);
  const adminToken = 'd'.repeat(64);
  await handleD1Request(request('/api/auth/session/claim', 'POST', {
    username: '2',
    sessionToken: adminToken,
    sessionTicket: (await responseBody(adminSignup!)).sessionTicket,
  }), env);

  const userSignup = await handleD1Request(request('/api/auth/register', 'POST', {
    username: 'ordinary_user',
    password: 'user-password',
    name: 'User',
  }), env);
  const userToken = 'e'.repeat(64);
  await handleD1Request(request('/api/auth/session/claim', 'POST', {
    username: 'ordinary_user',
    sessionToken: userToken,
    sessionTicket: (await responseBody(userSignup!)).sessionTicket,
  }), env);

  const payload = { characters: [{ id: 'global-character', skills: [{ name: 'Skill' }] }] };
  const noIdentity = await handleD1Request(request('/api/characters', 'POST', payload), env);
  assert.equal(noIdentity?.status, 401);

  const otherAccount = await handleD1Request(request('/api/characters', 'POST', payload, {
    'X-Account-Username': 'ordinary_user',
    'X-Account-Session': userToken,
  }), env);
  assert.equal(otherAccount?.status, 403);

  const wrongAdminSession = await handleD1Request(request('/api/characters', 'POST', payload, {
    'X-Account-Username': '2',
    'X-Account-Session': userToken,
  }), env);
  assert.equal(wrongAdminSession?.status, 401);

  const saved = await handleD1Request(request('/api/characters', 'POST', payload, {
    'X-Account-Username': '2',
    'X-Account-Session': adminToken,
  }), env);
  assert.equal(saved?.status, 200);
  assert.deepEqual(await getD1Config(env.DB, 'characters'), payload.characters);

  const otherPlayerRead = await handleD1Request(request('/api/characters', 'GET'), env);
  assert.equal(otherPlayerRead?.status, 200);
  assert.equal(otherPlayerRead?.headers.get('Cache-Control'), 'private, no-cache, must-revalidate');
  const characterResponseText = await otherPlayerRead!.text();
  const catalogEtag = otherPlayerRead!.headers.get('ETag');
  assert.ok(catalogEtag);
  assert.equal(
    Number(otherPlayerRead!.headers.get('X-Progress-Content-Length')),
    new TextEncoder().encode(characterResponseText).byteLength,
  );
  assert.deepEqual(JSON.parse(characterResponseText).characters, payload.characters);
  const unchangedCatalogRead = await handleD1Request(request('/api/characters', 'GET', undefined, {
    'If-None-Match': catalogEtag!,
  }), env);
  assert.equal(unchangedCatalogRead?.status, 304);
  assert.equal(await unchangedCatalogRead?.text(), '');
  assert.equal(unchangedCatalogRead?.headers.get('ETag'), catalogEtag);

  const emptyCatalog = await handleD1Request(request('/api/characters', 'POST', {
    characters: [],
  }, {
    'X-Account-Username': '2',
    'X-Account-Session': adminToken,
  }), env);
  assert.equal(emptyCatalog?.status, 400);

  const deniedImport = await handleD1Request(request('/api/config/import', 'POST', {
    ranks: [{ id: 'forged' }],
  }, {
    'X-Account-Username': 'ordinary_user',
    'X-Account-Session': userToken,
  }), env);
  assert.equal(deniedImport?.status, 403);

  const importedCatalog = [{ id: 'backup-character', skills: [{ name: 'Updated by backup' }] }];
  const imported = await handleD1Request(request('/api/config/import', 'POST', {
    characters: importedCatalog,
  }, {
    'X-Account-Username': '2',
    'X-Account-Session': adminToken,
  }), env);
  assert.equal(imported?.status, 200);

  const playerOneRead = await handleD1Request(request('/api/characters', 'GET'), env);
  const playerTwoRead = await handleD1Request(request('/api/characters', 'GET'), env);
  assert.deepEqual((await responseBody(playerOneRead!)).characters, importedCatalog);
  assert.deepEqual((await responseBody(playerTwoRead!)).characters, importedCatalog);

  env.DB.configWriteLocks.set('characters', {
    owner_token: 'another-write',
    expires_at: Date.now() + 60_000,
  });
  const concurrentSave = await handleD1Request(request('/api/characters', 'POST', payload, {
    'X-Account-Username': '2',
    'X-Account-Session': adminToken,
  }), env);
  assert.equal(concurrentSave?.status, 409);
  const unchangedRead = await handleD1Request(request('/api/characters', 'GET'), env);
  assert.deepEqual((await responseBody(unchangedRead!)).characters, importedCatalog);
});

test('sends maintenance reward mail to all completed accounts and claims it idempotently', async () => {
  const env = { DB: new MemoryD1() };
  const adminSignup = await handleD1Request(request('/api/auth/register', 'POST', {
    username: '2',
    password: 'admin-password',
    name: 'Admin',
  }), env);
  const adminToken = 'a'.repeat(64);
  await handleD1Request(request('/api/auth/session/claim', 'POST', {
    username: '2',
    sessionToken: adminToken,
    sessionTicket: (await responseBody(adminSignup!)).sessionTicket,
  }), env);

  const createAccount = async (username: string, token: string) => {
    const signup = await handleD1Request(request('/api/auth/register', 'POST', {
      username,
      password: 'account-password',
      name: username,
    }), env);
    await handleD1Request(request('/api/auth/session/claim', 'POST', {
      username,
      sessionToken: token,
      sessionTicket: (await responseBody(signup!)).sessionTicket,
    }), env);
    return token;
  };
  const snapshotToken = await createAccount('snapshot_user', 'b'.repeat(64));
  const legacyToken = await createAccount('legacy_user', 'c'.repeat(64));
  await createAccount('already_owned', 'd'.repeat(64));
  await createAccount('not_completed', 'e'.repeat(64));

  const setProfile = (username: string, profile: Record<string, unknown>) => {
    env.DB.accounts.get(username)!.profile_json = JSON.stringify({
      username,
      name: username,
      photoUrl: 'avatar',
      ryos: 500,
      gems: 80,
      ...profile,
    });
  };
  setProfile('snapshot_user', {
    completedQuestIds: ['q1'],
    unlockedTitles: ['Existing Title'],
    questRewardSnapshots: {
      q1: { ryos: 100, gems: 10, items: ['title:Existing Title'] },
    },
  });
  setProfile('legacy_user', { completedQuestIds: ['q1'], unlockedTitles: [] });
  setProfile('already_owned', {
    completedQuestIds: ['q1'],
    unlockedTitles: ['Existing Title'],
    unlockedBanners: ['Maintenance Banner'],
    questRewardSnapshots: {
      q1: { ryos: 100, gems: 10, items: ['title:Existing Title', 'banner:Maintenance Banner'] },
    },
  });
  setProfile('not_completed', { completedQuestIds: [] });

  const previousQuest = {
    id: 'q1',
    title: 'Missão de teste',
    goals: [{ id: 'g1', type: 'use_skill', targetValue: 1 }],
    rewards: [
      { type: 'ryos', value: '100' },
      { type: 'gems', value: '10' },
      { type: 'title', value: 'Existing Title' },
    ],
  };
  seedD1Config(env.DB, 'quests', [previousQuest]);
  const editedQuest = {
    ...previousQuest,
    rewards: [
      { type: 'ryos', value: '220' },
      { type: 'gems', value: '40' },
      { type: 'title', value: 'Existing Title' },
      { type: 'banner', value: 'Maintenance Banner', imageUrl: '/banner.png' },
    ],
  };
  const save = (quest: typeof editedQuest) => handleD1Request(request('/api/quests', 'POST', {
    quests: [quest],
  }, {
    'X-Account-Username': '2',
    'X-Account-Session': adminToken,
  }), env);

  const firstSave = await save(editedQuest);
  assert.equal(firstSave?.status, 200);
  const snapshotProfile = JSON.parse(String(env.DB.accounts.get('snapshot_user')?.profile_json));
  assert.equal(snapshotProfile.ryos, 500);
  assert.equal(snapshotProfile.gems, 80);
  assert.deepEqual(snapshotProfile.unlockedTitles, ['Existing Title']);
  const getInbox = async (username: string, token: string) => handleD1Request(request(
    `/api/quests/maintenance-inbox?username=${encodeURIComponent(username)}`,
    'GET',
    undefined,
    { 'X-Account-Session': token },
  ), env);
  const snapshotInbox = await responseBody((await getInbox('snapshot_user', snapshotToken))!);
  const snapshotMessages = snapshotInbox.messages as Array<Record<string, unknown>>;
  assert.equal(snapshotMessages.length, 1);
  const snapshotMail = snapshotMessages[0];
  assert.equal(snapshotMail.subject, 'Recompensa de manutenção de missão');
  assert.deepEqual(snapshotMail.rewards, [
    { type: 'ryos', value: '120' },
    { type: 'gems', value: '30' },
    { type: 'banner', value: 'Maintenance Banner', imageUrl: '/banner.png' },
  ]);

  const legacyProfile = JSON.parse(String(env.DB.accounts.get('legacy_user')?.profile_json));
  assert.equal(legacyProfile.ryos, 500);
  assert.equal(legacyProfile.gems, 80);
  const legacyInbox = await responseBody((await getInbox('legacy_user', legacyToken))!);
  assert.equal((legacyInbox.messages as unknown[]).length, 1);
  const alreadyOwnedInbox = await responseBody((await getInbox('already_owned', 'd'.repeat(64)))!);
  const alreadyOwnedMessages = alreadyOwnedInbox.messages as Array<Record<string, unknown>>;
  assert.deepEqual(alreadyOwnedMessages[0].rewards, [
    { type: 'ryos', value: '120' },
    { type: 'gems', value: '30' },
  ]);
  const emptyInbox = await responseBody((await getInbox('not_completed', 'e'.repeat(64)))!);
  assert.deepEqual(emptyInbox.messages, []);

  await save(editedQuest);
  const repeatedInbox = await responseBody((await getInbox('snapshot_user', snapshotToken))!);
  assert.equal((repeatedInbox.messages as unknown[]).length, 1);

  const mailId = String(snapshotMail.id);
  const claim = () => handleD1Request(request('/api/quests/maintenance-inbox/claim', 'POST', {
    username: 'snapshot_user',
    mailId,
  }, {
    'X-Account-Session': snapshotToken,
  }), env);
  const firstClaim = await handleD1Request(request('/api/quests/maintenance-inbox/claim', 'POST', {
    username: 'snapshot_user',
    mailId,
  }, {
    'X-Account-Session': snapshotToken,
  }), env);
  assert.equal(firstClaim?.status, 200);
  const claimedProfile = JSON.parse(String(env.DB.accounts.get('snapshot_user')?.profile_json));
  assert.equal(claimedProfile.ryos, 620);
  assert.equal(claimedProfile.gems, 110);
  assert.deepEqual(claimedProfile.unlockedBanners, ['Maintenance Banner']);
  assert.ok(claimedProfile.questMaintenanceInbox[0].claimedAt);
  const repeatClaim = await claim();
  assert.equal((await responseBody(repeatClaim!)).alreadyClaimed, true);
  assert.equal(JSON.parse(String(env.DB.accounts.get('snapshot_user')?.profile_json)).ryos, 620);
});

test('rejects a D1 configuration with missing chunks instead of parsing partial catalog data', async () => {
  const db = new MemoryD1();
  db.configHeads.set('characters', {
    config_key: 'characters',
    version_id: 'characters-v1',
    item_count: 2,
  });
  db.configItems.push(
    { config_key: 'characters', version_id: 'characters-v1', ordinal: 0, chunk_number: 0, value_part: '{"id":"first"}' },
    { config_key: 'characters', version_id: 'characters-v1', ordinal: 1, chunk_number: 1, value_part: '{"id":"partial"}' },
  );

  await assert.rejects(
    getD1Config(db, 'characters'),
    /Configuração characters incompleta ou fora de ordem no D1/,
  );
});

test('rejects client-owned progression writes while persisting cosmetic profile updates', async () => {
  const env = { DB: new MemoryD1() };
  const signup = await handleD1Request(request('/api/auth/register', 'POST', {
    username: 'profile_user',
    password: 'password',
    name: 'Profile User',
  }), env);
  const token = 'c'.repeat(64);
  await handleD1Request(request('/api/auth/session/claim', 'POST', {
    username: 'profile_user',
    sessionToken: token,
    sessionTicket: (await responseBody(signup!)).sessionTicket,
  }), env);
  const headers = { 'X-Account-Session': token };

  const progressionUpdate = await handleD1Request(request('/api/user/profile', 'PUT', {
    username: 'profile_user',
    xp: 999999,
    wins: 100,
    gems: 999999,
    collectedCardIds: ['forged-card'],
    village: 'takumi',
    villageChangeCount: 999,
  }, headers), env);
  assert.equal(progressionUpdate?.status, 200);
  assert.deepEqual((await responseBody(progressionUpdate!)).ignoredFields, [
    'xp', 'wins', 'gems', 'collectedCardIds', 'village', 'villageChangeCount',
  ]);
  const progressedProfile = JSON.parse(String(env.DB.accounts.get('profile_user')?.profile_json));
  assert.equal(progressedProfile.xp, undefined);
  assert.equal(progressedProfile.wins, undefined);
  assert.equal(progressedProfile.gems, undefined);
  assert.equal(progressedProfile.collectedCardIds, undefined);
  assert.equal(progressedProfile.village, undefined);
  assert.equal(progressedProfile.villageChangeCount, undefined);
  assert.equal(env.DB.profileUpdateCount, 0);

  const cosmeticUpdate = await handleD1Request(request('/api/user/profile', 'PUT', {
    username: 'profile_user',
    name: 'Updated Name',
    equippedFrame: 'frame-1',
  }, headers), env);
  assert.equal(cosmeticUpdate?.status, 200);
  const profile = JSON.parse(String(env.DB.accounts.get('profile_user')?.profile_json));
  assert.equal(profile.name, 'Updated Name');
  assert.equal(profile.equippedFrame, 'frame-1');
  assert.equal(profile.xp, undefined);
  assert.equal(env.DB.profileUpdateCount, 1);

  const unchangedCosmetics = await handleD1Request(request('/api/user/profile', 'PUT', {
    username: 'profile_user',
    name: 'Updated Name',
    equippedFrame: 'frame-1',
  }, headers), env);
  assert.equal(unchangedCosmetics?.status, 200);
  assert.equal(env.DB.profileUpdateCount, 1);
});

test('changes villages with one free change and server-authoritative 100 Ryos charges', async () => {
  const env = { DB: new MemoryD1() };
  const signup = await handleD1Request(request('/api/auth/register', 'POST', {
    username: 'village_user',
    password: 'password',
    name: 'Village User',
  }), env);
  const token = 'd'.repeat(64);
  await handleD1Request(request('/api/auth/session/claim', 'POST', {
    username: 'village_user',
    sessionToken: token,
    sessionTicket: (await responseBody(signup!)).sessionTicket,
    initialVillageId: 'konoha',
  }), env);
  const headers = { 'X-Account-Session': token };

  const firstChange = await handleD1Request(request('/api/user/village/change', 'POST', {
    username: 'village_user',
    village: 'takumi',
  }, headers), env);
  assert.equal(firstChange?.status, 200);
  assert.equal((await responseBody(firstChange!)).charged, 0);
  let profile = JSON.parse(String(env.DB.accounts.get('village_user')?.profile_json));
  assert.equal(profile.village, 'takumi');
  assert.equal(profile.villageChangeCount, 1);
  assert.equal(profile.ryos, 1500);

  const secondChange = await handleD1Request(request('/api/user/village/change', 'POST', {
    username: 'village_user',
    village: 'amegakure',
  }, headers), env);
  assert.equal(secondChange?.status, 200);
  assert.equal((await responseBody(secondChange!)).charged, 100);
  profile = JSON.parse(String(env.DB.accounts.get('village_user')?.profile_json));
  assert.equal(profile.village, 'amegakure');
  assert.equal(profile.villageChangeCount, 2);
  assert.equal(profile.ryos, 1400);

  const sameVillage = await handleD1Request(request('/api/user/village/change', 'POST', {
    username: 'village_user',
    village: 'amegakure',
  }, headers), env);
  assert.equal((await responseBody(sameVillage!)).changed, false);
  assert.equal(JSON.parse(String(env.DB.accounts.get('village_user')?.profile_json)).ryos, 1400);

  profile.ryos = 50;
  env.DB.accounts.get('village_user')!.profile_json = JSON.stringify(profile);
  const insufficient = await handleD1Request(request('/api/user/village/change', 'POST', {
    username: 'village_user',
    village: 'kirigakure',
  }, headers), env);
  assert.equal(insufficient?.status, 409);
  assert.equal(JSON.parse(String(env.DB.accounts.get('village_user')?.profile_json)).village, 'amegakure');

  const invalidVillage = await handleD1Request(request('/api/user/village/change', 'POST', {
    username: 'village_user',
    village: 'unknown',
  }, headers), env);
  assert.equal(invalidVillage?.status, 400);
});

test('rejects an unimported configuration without contacting the legacy API', async () => {
  const env = { DB: new MemoryD1() };
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ success: true, characters: [{ id: 'one' }, { id: 'two' }] });
    };
    const first = await handleD1Request(request('/api/characters', 'GET'), env);
    const second = await handleD1Request(request('/api/characters', 'GET'), env);
    assert.equal(first?.status, 503);
    assert.equal(second?.status, 503);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provides and persists the configurable AI enemy character limit', async () => {
  const env = { DB: new MemoryD1() };
  const initial = await handleD1Request(request('/api/ai-settings', 'GET'), env);
  assert.deepEqual((await responseBody(initial!)).settings, [{ maxEnemyCharacterNumber: 69 }]);
  const adminSignup = await handleD1Request(request('/api/auth/register', 'POST', {
    username: '2',
    password: 'admin-password',
    name: 'Admin',
  }), env);
  const token = 'f'.repeat(64);
  await handleD1Request(request('/api/auth/session/claim', 'POST', {
    username: '2',
    sessionToken: token,
    sessionTicket: (await responseBody(adminSignup!)).sessionTicket,
  }), env);
  const adminHeaders = { 'X-Account-Username': '2', 'X-Account-Session': token };

  const invalid = await handleD1Request(request('/api/ai-settings', 'POST', {
    settings: [{ maxEnemyCharacterNumber: 2 }],
  }, adminHeaders), env);
  assert.equal(invalid?.status, 400);

  const saved = await handleD1Request(request('/api/ai-settings', 'POST', {
    settings: [{ maxEnemyCharacterNumber: 123 }],
  }, adminHeaders), env);
  assert.equal(saved?.status, 200);
  const loaded = await handleD1Request(request('/api/ai-settings', 'GET'), env);
  assert.deepEqual((await responseBody(loaded!)).settings, [{ maxEnemyCharacterNumber: 123 }]);
});

test('admin can configure roulette rarity chances and rejects invalid totals', async () => {
  const env = { DB: new MemoryD1() };
  const defaults = await handleD1Request(request('/api/cards/roulette-settings', 'GET'), env);
  assert.equal(defaults?.status, 200);
  assert.deepEqual((await responseBody(defaults!)).chances, {
    comum: 69.1,
    raro: 25,
    epico: 4,
    lendario: 0.9,
    secreto: 1,
  });

  const registration = await handleD1Request(request('/api/auth/register', 'POST', {
    username: '2',
    password: 'admin-password',
    name: 'Admin',
  }), env);
  const token = 'e'.repeat(64);
  await handleD1Request(request('/api/auth/session/claim', 'POST', {
    username: '2',
    sessionToken: token,
    sessionTicket: (await responseBody(registration!)).sessionTicket,
  }), env);
  const headers = { 'X-Account-Username': '2', 'X-Account-Session': token };
  const unauthorized = await handleD1Request(request('/api/cards/roulette-settings', 'POST', {
    chances: { comum: 50, raro: 20, epico: 15, lendario: 10, secreto: 4 },
  }), env);
  assert.equal(unauthorized?.status, 403);

  const invalid = await handleD1Request(request('/api/cards/roulette-settings', 'POST', {
    chances: { comum: 50, raro: 20, epico: 15, lendario: 10, secreto: 4 },
  }, headers), env);
  assert.equal(invalid?.status, 400);

  const chances = { comum: 50, raro: 20, epico: 15, lendario: 10, secreto: 5 };
  const saved = await handleD1Request(request('/api/cards/roulette-settings', 'POST', {
    chances,
  }, headers), env);
  assert.equal(saved?.status, 200);
  const loaded = await handleD1Request(request('/api/cards/roulette-settings', 'GET'), env);
  assert.deepEqual((await responseBody(loaded!)).chances, chances);
});

test('admin can send inbox mail to one account or all accounts, with rewards claimed by the recipient', async () => {
  const env = { DB: new MemoryD1() };
  seedD1Config(env.DB, 'cards', [{
    id: 'mail-card',
    characterId: 'mail-ninja',
    characterName: 'Mail Ninja',
    slug: 'mail-ninja',
    rarity: 'comum',
    title: 'Classic',
    description: 'Card sent through inbox roulette',
    points: 1,
  }]);
  const register = async (username: string) => {
    const response = await handleD1Request(request('/api/auth/register', 'POST', {
      username,
      password: 'test-password',
      name: username,
    }), env);
    assert.equal(response?.status, 200);
    const body = await responseBody(response!);
    const token = username === '2' ? 'a'.repeat(64) : 'b'.repeat(64);
    const claimed = await handleD1Request(request('/api/auth/session/claim', 'POST', {
      username,
      sessionToken: token,
      sessionTicket: body.sessionTicket,
    }), env);
    assert.equal(claimed?.status, 200);
    return { token, headers: { 'X-Account-Username': username, 'X-Account-Session': token } };
  };
  const admin = await register('2');
  const recipient = await register('recipient');
  const secondRecipient = await register('second');

  const denied = await handleD1Request(request('/api/admin/mail/send', 'POST', {
    sendToAll: false,
    targetId: 'recipient',
    subject: 'Prize',
    message: 'Thanks!',
    rewards: [],
  }), env);
  assert.equal(denied?.status, 403);

  const invalid = await handleD1Request(request('/api/admin/mail/send', 'POST', {
    sendToAll: false,
    targetId: 'recipient',
    subject: 'Prize',
    message: 'Thanks!',
    rewards: [{ type: 'ryos', value: '-1' }],
  }, admin.headers), env);
  assert.equal(invalid?.status, 400);

  const sent = await handleD1Request(request('/api/admin/mail/send', 'POST', {
    sendToAll: false,
    targetId: 'recipient',
    subject: 'Prêmio especial',
    message: 'Obrigado por jogar!',
    rewards: [{ type: 'ryos', value: '250' }],
  }, admin.headers), env);
  assert.equal(sent?.status, 200);
  assert.equal((await responseBody(sent!)).sentCount, 1);

  const recipientInboxResponse = await handleD1Request(request(
    '/api/quests/maintenance-inbox?username=recipient',
    'GET',
    undefined,
    recipient.headers,
  ), env);
  const recipientInbox = await responseBody(recipientInboxResponse!);
  const messages = recipientInbox.messages as Array<Record<string, unknown>>;
  assert.equal(messages.length, 1);
  assert.equal(messages[0].subject, 'Prêmio especial');
  const claimed = await handleD1Request(request('/api/quests/maintenance-inbox/claim', 'POST', {
    username: 'recipient',
    mailId: messages[0].id,
  }, recipient.headers), env);
  assert.equal(claimed?.status, 200);
  assert.equal((await responseBody(claimed!)).success, true);

  const invalidPack = await handleD1Request(request('/api/admin/mail/send', 'POST', {
    sendToAll: false,
    targetId: 'recipient',
    subject: 'Pacote inválido',
    message: 'Quantidade acima do limite.',
    rewards: [{ type: 'card_pack', value: '51' }],
  }, admin.headers), env);
  assert.equal(invalidPack?.status, 400);

  const packMail = await handleD1Request(request('/api/admin/mail/send', 'POST', {
    sendToAll: false,
    targetId: 'recipient',
    subject: 'Pacotes',
    message: 'Abra seus pacotes!',
    rewards: [{ type: 'card_pack', value: '2' }],
  }, admin.headers), env);
  assert.equal(packMail?.status, 200);
  const updatedInboxResponse = await handleD1Request(request(
    '/api/quests/maintenance-inbox?username=recipient',
    'GET',
    undefined,
    recipient.headers,
  ), env);
  const updatedInbox = await responseBody(updatedInboxResponse!);
  const packMessage = (updatedInbox.messages as Array<Record<string, unknown>>)
    .find(message => message.subject === 'Pacotes');
  assert.ok(packMessage);

  const packClaim = () => handleD1Request(request('/api/quests/maintenance-inbox/claim', 'POST', {
    username: 'recipient',
    mailId: packMessage!.id,
  }, recipient.headers), env);
  const firstPackClaim = await packClaim();
  assert.equal(firstPackClaim?.status, 200);
  const firstPackBody = await responseBody(firstPackClaim!);
  assert.deepEqual(
    (firstPackBody.rouletteCards as Array<{ id: string }>).map(card => card.id),
    ['mail-card', 'mail-card'],
  );
  const claimedProfile = firstPackBody.user as { collectedCardIds: string[] };
  assert.deepEqual(claimedProfile.collectedCardIds, ['mail-card', 'mail-card']);
  const retryPackClaim = await packClaim();
  assert.equal(retryPackClaim?.status, 200);
  const retryPackBody = await responseBody(retryPackClaim!);
  assert.equal(retryPackBody.alreadyClaimed, true);
  assert.deepEqual(
    (retryPackBody.rouletteCards as Array<{ id: string }>).map(card => card.id),
    ['mail-card', 'mail-card'],
  );
  assert.deepEqual(
    (retryPackBody.user as { collectedCardIds: string[] }).collectedCardIds,
    ['mail-card', 'mail-card'],
  );

  const broadcast = await handleD1Request(request('/api/admin/mail/send', 'POST', {
    sendToAll: true,
    subject: 'Aviso',
    message: 'Mensagem para todas as contas.',
    rewards: [],
  }, admin.headers), env);
  assert.equal(broadcast?.status, 200);
  assert.equal((await responseBody(broadcast!)).sentCount, 3);
  const secondInboxResponse = await handleD1Request(request(
    '/api/quests/maintenance-inbox?username=second',
    'GET',
    undefined,
    secondRecipient.headers,
  ), env);
  const secondInbox = await responseBody(secondInboxResponse!);
  assert.equal((secondInbox.messages as Array<Record<string, unknown>>).length, 1);
});
