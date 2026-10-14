import assert from 'node:assert/strict';
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
      const [profile_json, username] = this.values;
      const row = this.db.accounts.get(String(username));
      if (row) {
        row.profile_json = profile_json;
        this.db.profileUpdateCount++;
      }
      this.db.lastChanges = row ? 1 : 0;
      return { success: true, meta: { changes: row ? 1 : 0 } };
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
      const [xpDelta, winsDelta, lossesDelta, username] = this.values;
      const row = this.db.accounts.get(String(username));
      const changes = row && this.db.lastChanges === 1 ? 1 : 0;
      if (changes) {
        const profile = JSON.parse(String(row.profile_json)) as Row;
        profile.xp = Math.max(0, (Number(profile.xp) || 0) + Number(xpDelta));
        profile.wins = (Number(profile.wins) || 0) + Number(winsDelta);
        profile.losses = (Number(profile.losses) || 0) + Number(lossesDelta);
        row.profile_json = JSON.stringify(profile);
      }
      this.db.lastChanges = changes;
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
    if (q.startsWith('select value_json from game_config where')) return null;
    throw new Error(`Unhandled mock D1 first: ${q.slice(0, 90)}`);
  }

  async all<T = Row>() {
    const q = this.query.replace(/\s+/g, ' ').trim().toLowerCase();
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
  }), env);
  assert.equal((await responseBody(firstClaim!)).status, 'active');

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
  assert.equal(otherPlayerRead?.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual((await responseBody(otherPlayerRead!)).characters, payload.characters);

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
  }, headers), env);
  assert.equal(progressionUpdate?.status, 200);
  assert.deepEqual((await responseBody(progressionUpdate!)).ignoredFields, [
    'xp', 'wins', 'gems', 'collectedCardIds',
  ]);
  const progressedProfile = JSON.parse(String(env.DB.accounts.get('profile_user')?.profile_json));
  assert.equal(progressedProfile.xp, undefined);
  assert.equal(progressedProfile.wins, undefined);
  assert.equal(progressedProfile.gems, undefined);
  assert.equal(progressedProfile.collectedCardIds, undefined);
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
