import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
        });
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }
    if (q.startsWith('update account_sessions set pending_token_hashes_json')) {
      const [pending, username, active] = this.values;
      const row = this.db.sessions.get(String(username));
      if (row?.active_token_hash === active) {
        row.pending_token_hashes_json = pending;
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
    if (q.startsWith('update accounts set profile_json')) {
      const [profile_json, username] = this.values;
      const row = this.db.accounts.get(String(username));
      if (row) row.profile_json = profile_json;
      return { success: true, meta: { changes: row ? 1 : 0 } };
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
    if (q.startsWith('select active_token_hash from account_sessions')) {
      const row = this.db.sessions.get(String(this.values[0]));
      return row ? { active_token_hash: row.active_token_hash } as T : null;
    }
    if (q.startsWith('select active_token_hash, pending_token_hashes_json from account_sessions')) {
      return (this.db.sessions.get(String(this.values[0])) as T) || null;
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
    if (q.startsWith('select version_id from game_config_versions')) {
      const row = this.db.configHeads.get(String(this.values[0]));
      return row ? { version_id: row.version_id } as T : null;
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
  const firstToken = 'a'.repeat(64);
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
});

test('persists profile progression and cosmetic updates for the current beta client', async () => {
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
  const progressedProfile = JSON.parse(String(env.DB.accounts.get('profile_user')?.profile_json));
  assert.equal(progressedProfile.xp, 999999);
  assert.equal(progressedProfile.wins, 100);
  assert.deepEqual(progressedProfile.collectedCardIds, ['forged-card']);

  const cosmeticUpdate = await handleD1Request(request('/api/user/profile', 'PUT', {
    username: 'profile_user',
    name: 'Updated Name',
    equippedFrame: 'frame-1',
  }, headers), env);
  assert.equal(cosmeticUpdate?.status, 200);
  const profile = JSON.parse(String(env.DB.accounts.get('profile_user')?.profile_json));
  assert.equal(profile.name, 'Updated Name');
  assert.equal(profile.equippedFrame, 'frame-1');
  assert.equal(profile.xp, 999999);
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
