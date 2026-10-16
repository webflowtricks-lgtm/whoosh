import { calculateBattleXp } from '../src/lib/battleRewards';
import { isVillageId } from '../src/lib/villages';

interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  meta?: { changes?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface D1Env {
  DB: D1Database;
  FIREBASE_PROJECT_ID?: string;
}

interface AccountRow {
  username: string;
  password_salt: string | null;
  password_hash: string | null;
  profile_json: string;
}

const DEFAULT_AVATAR =
  'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg';
const SESSION_TTL_MS = 120_000;
const SESSION_BATTLE_LEASE_SECONDS = 180;
const CONFIG_WRITE_LOCK_TTL_MS = 5 * 60 * 1000;

class ConfigWriteBusyError extends Error {
  constructor(key: string) {
    super(`Outra atualização da configuração ${key} ainda está em andamento.`);
  }
}

interface FirebaseJwk extends JsonWebKey {
  kid?: string;
}
const ACCOUNT_FIELDS = new Set([
  'name', 'photoUrl', 'title', 'equippedFrame', 'equippedFrameUrl', 'equippedBannerUrl',
]);
const SERVER_OWNED_PROFILE_FIELDS = new Set([
  'xp', 'rank', 'wins', 'losses', 'ryos', 'gems', 'collectedCardIds', 'village', 'villageChangeCount',
]);
const VILLAGE_CHANGE_COST = 100;
let firebaseJwksCache: { keys: FirebaseJwk[]; expiresAt: number } | null = null;

const json = (body: unknown, status = 200): Response => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

const error = (status: number, message: string): Response =>
  json({ error: message }, status);

function normalizedUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const username = value.trim().toLowerCase();
  return username.length > 0 && username.length <= 100 && !/[\u0000-\u001f\u007f]/.test(username)
    ? username
    : null;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

function validSessionToken(token: unknown): token is string {
  return typeof token === 'string' &&
    /^(?:[a-f0-9]{32,128}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(token);
}

async function digestHex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return hex(new Uint8Array(bytes));
}

async function derivePassword(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: Uint8Array.from(saltHex.match(/.{2}/g) || [], pair => parseInt(pair, 16)),
    iterations: 100_000,
  }, key, 256);
  return hex(new Uint8Array(bits));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

function publicAccount(row: AccountRow): Record<string, unknown> {
  const profile = JSON.parse(row.profile_json) as Record<string, unknown>;
  delete profile.password;
  delete profile.password_hash;
  delete profile.password_salt;
  delete profile.googleId;
  delete profile.email;
  return { ...profile, username: row.username };
}

async function createTicket(db: D1Database, username: string): Promise<string> {
  const ticket = randomHex(32);
  await db.prepare(
    'INSERT INTO session_tickets (ticket_hash, username, expires_at) VALUES (?, ?, ?)',
  ).bind(await digestHex(ticket), username, Date.now() + SESSION_TTL_MS).run();
  return ticket;
}

async function register(request: Request, env: D1Env): Promise<Response> {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return error(400, 'Dados de cadastro inválidos.');
  const username = normalizedUsername(body.username);
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!username || !password || password.length > 4096 || !name || name.length > 100) {
    return error(400, 'Usuário, senha e nome de exibição inválidos.');
  }
  const photoUrl = typeof body.photoUrl === 'string' && body.photoUrl.length <= 2048
    ? body.photoUrl
    : DEFAULT_AVATAR;
  const salt = randomHex(16);
  const passwordHash = await derivePassword(password, salt);
  const profile = { username, name, photoUrl };
  const created = await env.DB.prepare(`
    INSERT INTO accounts (username, password_salt, password_hash, profile_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(username) DO NOTHING
  `).bind(username, salt, passwordHash, JSON.stringify(profile)).run();
  if (created.meta?.changes !== 1) {
    return error(409, 'Este nome de usuário já está sendo utilizado.');
  }
  return json({ success: true, sessionTicket: await createTicket(env.DB, username), user: profile });
}

async function login(request: Request, env: D1Env): Promise<Response> {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const username = normalizedUsername(body?.username);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username || !password || password.length > 4096) {
    return error(400, 'Usuário e senha são obrigatórios.');
  }
  const account = await env.DB.prepare(
    'SELECT username, password_salt, password_hash, profile_json FROM accounts WHERE username = ?',
  ).bind(username).first<AccountRow>();
  if (!account) return error(401, 'Usuário ou senha incorretos.');
  if (!account.password_hash || !account.password_salt ||
      !constantTimeEqual(await derivePassword(password, account.password_salt), account.password_hash)) {
    return error(401, 'Usuário ou senha incorretos.');
  }
  return json({
    success: true,
    sessionTicket: await createTicket(env.DB, username),
    user: publicAccount(account),
  });
}

async function googleLogin(request: Request, env: D1Env): Promise<Response> {
  if (!env.FIREBASE_PROJECT_ID) return error(503, 'O login Google ainda não foi configurado neste Worker.');
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (typeof body?.idToken !== 'string' || body.idToken.length > 8192) {
    return error(400, 'Token de identidade Google inválido.');
  }
  const parts = body.idToken.split('.');
  if (parts.length !== 3) return error(401, 'A identidade Google não pôde ser confirmada.');
  let claims: {
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
    iss?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
  };
  try {
    const decode = (part: string) => JSON.parse(
      new TextDecoder().decode(Uint8Array.from(
        atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')),
        character => character.charCodeAt(0),
      )),
    );
    const header = decode(parts[0]) as { alg?: string; kid?: string };
    claims = decode(parts[1]) as typeof claims;
    if (header.alg !== 'RS256' || !header.kid) return error(401, 'Token de identidade Firebase inválido.');
    if (!firebaseJwksCache || firebaseJwksCache.expiresAt <= Date.now()) {
      const response = await fetch(
        'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
      );
      if (!response.ok) throw new Error(`Firebase public key endpoint returned ${response.status}.`);
      const result = await response.json() as { keys?: FirebaseJwk[] };
      if (!Array.isArray(result.keys) || result.keys.length === 0) {
        throw new Error('Firebase public key response is empty.');
      }
      const maxAge = Number(response.headers.get('Cache-Control')?.match(/max-age=(\d+)/i)?.[1] || 3600);
      firebaseJwksCache = { keys: result.keys, expiresAt: Date.now() + maxAge * 1000 };
    }
    const jwk = firebaseJwksCache.keys.find(key => key.kid === header.kid);
    if (!jwk) return error(401, 'Token de identidade Firebase expirou; entre novamente.');
    const verificationKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signature = Uint8Array.from(
      atob(parts[2].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[2].length / 4) * 4, '=')),
      character => character.charCodeAt(0),
    );
    const validSignature = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      verificationKey,
      signature,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!validSignature) return error(401, 'A assinatura da identidade Firebase é inválida.');
  } catch (cause) {
    console.error('[d1-auth] Não foi possível verificar o token de identidade Firebase.', cause);
    return error(502, 'Não foi possível validar a identidade Google.');
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`;
  if (claims.iss !== expectedIssuer || claims.aud !== env.FIREBASE_PROJECT_ID ||
      !claims.sub || claims.sub.length > 128 || !claims.email || claims.email_verified !== true ||
      typeof claims.exp !== 'number' || claims.exp <= nowSeconds ||
      typeof claims.iat !== 'number' || claims.iat > nowSeconds + 60 ||
      typeof claims.auth_time !== 'number' || claims.auth_time > nowSeconds ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)) {
    return error(401, 'A identidade Google não pôde ser confirmada.');
  }
  const identity = await env.DB.prepare(`
    SELECT a.username, a.password_salt, a.password_hash, a.profile_json
    FROM account_google_identities g JOIN accounts a ON a.username = g.username
    WHERE g.google_subject = ?
  `).bind(claims.sub).first<AccountRow>();
  let account = identity;
  if (!account) {
    const existingByEmail = await env.DB.prepare(`
      SELECT username, password_salt, password_hash, profile_json FROM accounts
      WHERE lower(json_extract(profile_json, '$.email')) = lower(?) LIMIT 1
    `).bind(claims.email).first<AccountRow>();
    if (existingByEmail) {
      account = existingByEmail;
    } else {
      const base = claims.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 80) || 'google_user';
      let candidate = base;
      for (let suffix = 1; suffix <= 10; suffix++) {
        const exists = await env.DB.prepare('SELECT username FROM accounts WHERE username = ?')
          .bind(candidate).first<{ username: string }>();
        if (!exists) break;
        candidate = `${base.slice(0, 90)}_${suffix}`;
      }
      const profile = {
        username: candidate,
        name: typeof claims.name === 'string' ? claims.name.slice(0, 100) : candidate,
        photoUrl: typeof claims.picture === 'string' ? claims.picture.slice(0, 2048) : DEFAULT_AVATAR,
        email: claims.email,
      };
      await env.DB.prepare(`
        INSERT INTO accounts (username, password_salt, password_hash, profile_json)
        VALUES (?, NULL, NULL, ?)
      `).bind(candidate, JSON.stringify(profile)).run();
      account = await env.DB.prepare(
        'SELECT username, password_salt, password_hash, profile_json FROM accounts WHERE username = ?',
      ).bind(candidate).first<AccountRow>();
    }
  }
  if (!account) return error(500, 'Não foi possível carregar a conta Google.');
  const profile = JSON.parse(account.profile_json) as Record<string, unknown>;
  if (typeof claims.name === 'string') profile.name = claims.name.slice(0, 100);
  if (typeof claims.picture === 'string') profile.photoUrl = claims.picture.slice(0, 2048);
  const refreshedProfile = JSON.stringify(profile);
  await env.DB.prepare('UPDATE accounts SET profile_json = ? WHERE username = ?')
    .bind(refreshedProfile, account.username).run();
  account = { ...account, profile_json: refreshedProfile };
  await env.DB.prepare(`
    INSERT INTO account_google_identities (google_subject, username, email)
    VALUES (?, ?, ?)
    ON CONFLICT(google_subject) DO UPDATE SET username = excluded.username, email = excluded.email
  `).bind(claims.sub, account.username, claims.email).run();
  return json({
    success: true,
    sessionTicket: await createTicket(env.DB, account.username),
    user: publicAccount(account),
  });
}

function validSessionInput(username: unknown, token: unknown): username is string {
  return normalizedUsername(username) !== null &&
    validSessionToken(token);
}

export async function isD1SessionActive(
  env: D1Env,
  username: string,
  token: string | null,
): Promise<boolean> {
  if (username === 'convidado') return true;
  if (!validSessionToken(token)) return false;
  const row = await env.DB.prepare(
    'SELECT active_token_hash FROM account_sessions WHERE username = ?',
  ).bind(username.trim().toLowerCase()).first<{ active_token_hash: string }>();
  return !!row && constantTimeEqual(row.active_token_hash, await digestHex(token));
}

export async function getD1ArchivedHistory(
  env: D1Env,
  username: string,
): Promise<Array<Record<string, unknown>>> {
  const result = await env.DB.prepare(`
    SELECT room_id, players_json, winner_username, finished_at, reason
    FROM archived_online_battle_history
    WHERE EXISTS (
      SELECT 1 FROM json_each(archived_online_battle_history.players_json)
      WHERE lower(json_extract(value, '$.username')) = lower(?)
    )
    ORDER BY finished_at DESC
    LIMIT 5
  `).bind(username).all<{
    room_id: string;
    players_json: string;
    winner_username: string;
    finished_at: string;
    reason: string;
  }>();
  if (!result.success) throw new Error('Falha ao consultar o histórico arquivado no D1.');
  return (result.results || []).map(row => ({
    roomId: row.room_id,
    players: JSON.parse(row.players_json),
    winnerUsername: row.winner_username,
    finishedAt: row.finished_at,
    reason: row.reason,
  }));
}

async function sessionRoute(request: Request, env: D1Env, pathname: string): Promise<Response> {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const username = normalizedUsername(body?.username);
  if (!body || !validSessionInput(body.username, body.sessionToken)) {
    return error(400, 'Dados da sessão inválidos.');
  }
  if (pathname.endsWith('/claim') && body.initialVillageId !== undefined && !isVillageId(body.initialVillageId)) {
    return error(400, 'Vila inicial inválida.');
  }
  const sessionToken = body.sessionToken as string;
  const tokenHash = await digestHex(sessionToken);

  if (pathname.endsWith('/claim')) {
    if (typeof body.sessionTicket !== 'string') return error(400, 'Ticket de sessão inválido.');
    const ticketHash = await digestHex(body.sessionTicket);
    const ticket = await env.DB.prepare(`
      DELETE FROM session_tickets WHERE ticket_hash = ? AND username = ? AND expires_at > ?
      RETURNING username
    `).bind(ticketHash, username, Date.now()).first<{ username: string }>();
    if (!ticket) return error(401, 'A autenticação expirou. Entre novamente.');

    let claimed = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const existing = await env.DB.prepare(`
        SELECT active_token_hash, pending_token_hashes_json, updated_at,
          updated_at <= datetime('now', '-${SESSION_BATTLE_LEASE_SECONDS} seconds') AS lease_expired
        FROM account_sessions WHERE username = ?
      `).bind(username).first<{
        active_token_hash: string;
        pending_token_hashes_json: string;
        updated_at: string;
        lease_expired: number;
      }>();
      if (!existing) {
        const inserted = await env.DB.prepare(`
          INSERT INTO account_sessions (username, active_token_hash, pending_token_hashes_json)
          VALUES (?, ?, '[]') ON CONFLICT(username) DO NOTHING
        `).bind(username, tokenHash).run();
        if (inserted.meta?.changes === 1) {
          claimed = true;
          break;
        }
        continue;
      }
      if (existing.active_token_hash === tokenHash) {
        await env.DB.prepare(`
          UPDATE account_sessions SET updated_at = CURRENT_TIMESTAMP
          WHERE username = ? AND active_token_hash = ?
        `).bind(username, tokenHash).run();
        claimed = true;
        break;
      }
      if (existing.lease_expired) {
        const reclaimed = await env.DB.prepare(`
          UPDATE account_sessions
          SET active_token_hash = ?, pending_token_hashes_json = '[]', updated_at = CURRENT_TIMESTAMP
          WHERE username = ? AND active_token_hash = ? AND pending_token_hashes_json = ? AND updated_at = ?
        `).bind(
          tokenHash,
          username,
          existing.active_token_hash,
          existing.pending_token_hashes_json,
          existing.updated_at,
        ).run();
        if (reclaimed.meta?.changes === 1) {
          claimed = true;
          break;
        }
        continue;
      }
      const pending = JSON.parse(existing.pending_token_hashes_json) as string[];
      if (pending.length === 1 && pending[0] === tokenHash) {
        claimed = true;
        break;
      }
      // A login request is not activity from the current device and must not
      // extend its inactivity lease. Keep only the newest waiting device so a
      // stale request cannot later take over in place of the current one.
      const updated = await env.DB.prepare(`
        UPDATE account_sessions SET pending_token_hashes_json = ?
        WHERE username = ? AND active_token_hash = ? AND pending_token_hashes_json = ? AND updated_at = ?
      `).bind(JSON.stringify([tokenHash]), username, existing.active_token_hash, existing.pending_token_hashes_json, existing.updated_at).run();
      if (updated.meta?.changes === 1) {
        claimed = true;
        break;
      }
    }
    if (!claimed) return error(409, 'Outra sessão foi registrada ao mesmo tempo; tente novamente.');
    if (isVillageId(body.initialVillageId)) {
      const accountRow = await env.DB.prepare(
        'SELECT profile_json FROM accounts WHERE username = ?',
      ).bind(username).first<{ profile_json: string }>();
      if (!accountRow) return error(404, 'Usuário não encontrado.');
      const profile = JSON.parse(accountRow.profile_json) as Record<string, unknown>;
      let profileChanged = false;
      const hasSavedVillage = typeof profile.village === 'string' && profile.village.trim().length > 0;
      if (!hasSavedVillage) {
        profile.village = body.initialVillageId;
        profile.villageChangeCount = 0;
        profileChanged = true;
      } else if (!Number.isInteger(profile.villageChangeCount) || Number(profile.villageChangeCount) < 0) {
        profile.villageChangeCount = 0;
        profileChanged = true;
      }
      if (typeof profile.ryos !== 'number' || !Number.isFinite(profile.ryos)) {
        profile.ryos = 1500;
        profileChanged = true;
      }
      if (profileChanged) {
        const updated = await env.DB.prepare(
          'UPDATE accounts SET profile_json = ? WHERE username = ? AND profile_json = ?',
        ).bind(JSON.stringify(profile), username, accountRow.profile_json).run();
        if (updated.meta?.changes !== 1) return error(409, 'O perfil foi alterado ao mesmo tempo; entre novamente.');
      }
    }
  } else if (pathname.endsWith('/takeover')) {
    const row = await env.DB.prepare(
      'SELECT active_token_hash, pending_token_hashes_json FROM account_sessions WHERE username = ?',
    ).bind(username).first<{ active_token_hash: string; pending_token_hashes_json: string }>();
    if (!row) return error(409, 'A sessão ativa já foi encerrada.');
    const pending = JSON.parse(row.pending_token_hashes_json) as string[];
    const requester = typeof body.requestingSessionToken === 'string'
      ? await digestHex(body.requestingSessionToken)
      : pending[0];
    const isActive = row.active_token_hash === tokenHash;
    const isPending = !!requester && pending.includes(requester);
    if (!requester || (!isActive && !isPending)) {
      return error(409, 'Não há outro aparelho aguardando acesso.');
    }
    const updated = await env.DB.prepare(`
      UPDATE account_sessions
      SET active_token_hash = ?, pending_token_hashes_json = '[]', updated_at = CURRENT_TIMESTAMP
      WHERE username = ? AND active_token_hash = ?
    `).bind(isActive ? requester : tokenHash, username, row.active_token_hash).run();
    if (updated.meta?.changes !== 1) return error(409, 'Outra solicitação concluiu a troca primeiro.');
    if (isActive) {
      await env.DB.prepare(`
        UPDATE account_sessions SET updated_at = CURRENT_TIMESTAMP
        WHERE username = ? AND active_token_hash = ?
      `).bind(username, requester).run();
    }
  } else if (pathname.endsWith('/cancel')) {
    const row = await env.DB.prepare(
      'SELECT active_token_hash, pending_token_hashes_json FROM account_sessions WHERE username = ?',
    ).bind(username).first<{ active_token_hash: string; pending_token_hashes_json: string }>();
    if (row) {
      const pending = JSON.parse(row.pending_token_hashes_json) as string[];
      const filtered = pending.filter(item => item !== tokenHash);
      await env.DB.prepare(`
        UPDATE account_sessions SET pending_token_hashes_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE username = ? AND active_token_hash = ?
      `).bind(JSON.stringify(filtered), username, row.active_token_hash).run();
    }
  } else if (pathname.endsWith('/release')) {
    await env.DB.prepare(
      'DELETE FROM account_sessions WHERE username = ? AND active_token_hash = ?',
    ).bind(username, tokenHash).run();
    return json({ success: true });
  } else if (pathname.endsWith('/heartbeat')) {
    const updated = await env.DB.prepare(`
      UPDATE account_sessions SET updated_at = CURRENT_TIMESTAMP
      WHERE username = ? AND active_token_hash = ?
    `).bind(username, tokenHash).run();
    if (updated.meta?.changes !== 1) return json({ success: true, status: 'revoked' });
  } else if (pathname.endsWith('/unlock')) {
    await env.DB.prepare(`
      UPDATE account_sessions SET updated_at = datetime('now', '-${SESSION_BATTLE_LEASE_SECONDS + 60} seconds')
      WHERE username = ? AND active_token_hash = ?
    `).bind(username, tokenHash).run();
  }

  const account = await env.DB.prepare(
    'SELECT active_token_hash, pending_token_hashes_json FROM account_sessions WHERE username = ?',
  ).bind(username).first<{ active_token_hash: string; pending_token_hashes_json: string }>();
  if (!account) return json({ success: true, status: 'revoked' });
  const pending = JSON.parse(account.pending_token_hashes_json) as string[];
  if (account.active_token_hash === tokenHash) {
    return json({ success: true, status: 'active', takeoverRequested: pending.length > 0 });
  }
  return json({ success: true, status: pending.includes(tokenHash) ? 'pending' : 'revoked' });
}

async function profileRoute(request: Request, env: D1Env, pathname: string): Promise<Response | null> {
  const url = new URL(request.url);
  if (pathname === '/api/user/village/change' && request.method === 'POST') {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const username = normalizedUsername(body?.username);
    if (!body || !username || !isVillageId(body.village)) return error(400, 'Vila inválida.');
    const token = request.headers.get('X-Account-Session') || '';
    if (!await isD1SessionActive(env, username, token)) return error(401, 'Sessão inválida ou revogada.');

    const row = await env.DB.prepare(
      'SELECT profile_json FROM accounts WHERE username = ?',
    ).bind(username).first<{ profile_json: string }>();
    if (!row) return error(404, 'Usuário não encontrado.');
    const profile = JSON.parse(row.profile_json) as Record<string, unknown>;
    if (profile.village === body.village) {
      return json({ success: true, changed: false, charged: 0, user: profile });
    }

    const currentCount = Number.isInteger(profile.villageChangeCount) && Number(profile.villageChangeCount) >= 0
      ? Number(profile.villageChangeCount)
      : 0;
    const isInitialVillage = typeof profile.village !== 'string' || profile.village.trim().length === 0;
    const charged = isInitialVillage || currentCount === 0 ? 0 : VILLAGE_CHANGE_COST;
    const ryos = typeof profile.ryos === 'number' && Number.isFinite(profile.ryos)
      ? profile.ryos
      : 1500;
    if (ryos < charged) return error(409, 'Você não tem Ryos suficientes para trocar de vila.');

    const updatedProfile = {
      ...profile,
      village: body.village,
      villageChangeCount: currentCount + 1,
      ryos: ryos - charged,
    };
    const updated = await env.DB.prepare(
      'UPDATE accounts SET profile_json = ? WHERE username = ? AND profile_json = ?',
    ).bind(JSON.stringify(updatedProfile), username, row.profile_json).run();
    if (updated.meta?.changes !== 1) return error(409, 'O perfil mudou durante a troca. Tente novamente.');
    return json({ success: true, changed: true, charged, user: updatedProfile });
  }
  if (pathname === '/api/user/profile' && request.method === 'GET') {
    const username = normalizedUsername(url.searchParams.get('username'));
    if (!username) return error(400, 'Nome de usuário é obrigatório.');
    const row = await env.DB.prepare(
      'SELECT username, password_salt, password_hash, profile_json FROM accounts WHERE username = ?',
    ).bind(username).first<AccountRow>();
    if (!row) return error(404, 'Usuário não encontrado.');
    return json({ success: true, user: publicAccount(row) });
  }
  if (pathname !== '/api/user/profile' || request.method !== 'PUT') return null;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const username = normalizedUsername(body?.username);
  if (!username) return error(400, 'Nome de usuário é obrigatório.');
  if (!await isD1SessionActive(env, username, request.headers.get('X-Account-Session'))) {
    return error(401, 'Sessão da conta ausente ou revogada. Entre novamente.');
  }
  const row = await env.DB.prepare(
    'SELECT username, password_salt, password_hash, profile_json FROM accounts WHERE username = ?',
  ).bind(username).first<AccountRow>();
  if (!row) return error(404, 'Usuário não encontrado.');
  const profile = JSON.parse(row.profile_json) as Record<string, unknown>;
  const ignoredFields: string[] = [];
  let changed = false;
  for (const [key, value] of Object.entries(body || {})) {
    if (SERVER_OWNED_PROFILE_FIELDS.has(key)) {
      ignoredFields.push(key);
      continue;
    }
    if (!ACCOUNT_FIELDS.has(key)) continue;
    if (key === 'name' && typeof value === 'string' && value.trim()) {
      const nextValue = value.trim().slice(0, 60);
      if (profile[key] !== nextValue) {
        profile[key] = nextValue;
        changed = true;
      }
    } else if (key === 'photoUrl' && typeof value === 'string' && value.length <= 2048) {
      if (profile[key] !== value) {
        profile[key] = value;
        changed = true;
      }
    } else if (value === null || ['string', 'boolean'].includes(typeof value) || Array.isArray(value)) {
      if (JSON.stringify(profile[key]) !== JSON.stringify(value)) {
        profile[key] = value;
        changed = true;
      }
    }
  }
  if (changed) {
    await env.DB.prepare(
      'UPDATE accounts SET profile_json = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?',
    ).bind(JSON.stringify(profile), username).run();
  }
  return json({
    success: true,
    user: { ...profile, username },
    ...(ignoredFields.length > 0 ? { ignoredFields } : {}),
  });
}

const CONFIGS: Record<string, { key: string; field: string }> = {
  '/api/characters': { key: 'characters', field: 'characters' },
  '/api/ranks': { key: 'ranks', field: 'ranks' },
  '/api/shop': { key: 'shop', field: 'items' },
  '/api/events': { key: 'events', field: 'events' },
  '/api/banners': { key: 'banners', field: 'banners' },
  '/api/frames': { key: 'frames', field: 'frames' },
  '/api/cards': { key: 'cards', field: 'cards' },
  '/api/cards/packs': { key: 'cardPacks', field: 'packs' },
  '/api/quests': { key: 'quests', field: 'quests' },
  '/api/ai-settings': { key: 'aiSettings', field: 'settings' },
};

async function readConfig(db: D1Database, key: string): Promise<unknown[] | null> {
  const head = await db.prepare(
    'SELECT version_id, item_count FROM game_config_versions WHERE config_key = ?',
  ).bind(key).first<{ version_id: string; item_count: number }>();
  if (head) {
    if (!Number.isSafeInteger(head.item_count) || head.item_count < 0) {
      throw new Error(`Contagem inválida na configuração ${key} do D1.`);
    }
    const statement = db.prepare(`
      SELECT ordinal, chunk_number, value_part FROM game_config_items
      WHERE config_key = ? AND version_id = ? ORDER BY ordinal, chunk_number
    `).bind(key, head.version_id);
    const result = await statement.all<{
      ordinal: number;
      chunk_number: number;
      value_part: string;
    }>();
    if (!result.success) throw new Error(`Falha ao ler configuração ${key} do D1.`);
    const values = Array.from({ length: head.item_count }, () => ({
      serialized: '',
      nextChunk: 0,
    }));
    for (const row of result.results || []) {
      const value = values[row.ordinal];
      if (!value || row.chunk_number !== value.nextChunk) {
        throw new Error(`Configuração ${key} incompleta ou fora de ordem no D1.`);
      }
      value.serialized += row.value_part;
      value.nextChunk++;
    }
    if (values.some(value => value.nextChunk === 0)) {
      throw new Error(`Configuração ${key} incompleta no D1.`);
    }
    return values.map(value => JSON.parse(value.serialized));
  }
  const legacy = await db.prepare(
    'SELECT value_json FROM game_config WHERE config_key = ?',
  ).bind(key).first<{ value_json: string }>();
  if (!legacy) return null;
  const value = JSON.parse(legacy.value_json) as unknown;
  if (!Array.isArray(value)) throw new Error(`Configuração legada ${key} possui formato inválido.`);
  return value;
}

export async function getD1Config(db: D1Database, key: string): Promise<unknown[] | null> {
  return readConfig(db, key);
}

export async function getD1AccountProfile(
  db: D1Database,
  username: string,
): Promise<Record<string, unknown> | null> {
  const row = await db.prepare(
    'SELECT username, password_salt, password_hash, profile_json FROM accounts WHERE username = ?',
  ).bind(username.trim().toLowerCase()).first<AccountRow>();
  return row ? publicAccount(row) : null;
}

export interface AuthoritativeMatchRewardInput {
  roomId: string;
  winnerUsername: string;
  turns: number;
  players: Array<{
    username: string;
    aliveCount: number;
    damageDealt: number;
  }>;
}

export interface AuthoritativeMatchReward {
  username: string;
  xpGained: number;
  user: Record<string, unknown> | null;
}

export async function awardD1MatchRewards(
  env: D1Env,
  match: AuthoritativeMatchRewardInput,
): Promise<AuthoritativeMatchReward[]> {
  if (!match.roomId || !match.winnerUsername || match.players.length !== 2 ||
      match.players[0].username === match.players[1].username) {
    throw new Error('Resultado autoritativo inválido para conceder recompensas.');
  }
  const ranks = await getD1Config(env.DB, 'ranks');
  if (!ranks?.length) throw new Error('A configuração de patentes é necessária para conceder recompensas.');
  const sortedRanks = ranks
    .filter((rank): rank is Record<string, unknown> =>
      !!rank && typeof rank === 'object' &&
      typeof (rank as Record<string, unknown>).requiredXp === 'number' &&
      typeof (rank as Record<string, unknown>).name === 'string')
    .sort((left, right) => Number(left.requiredXp) - Number(right.requiredXp));
  if (!sortedRanks.length) throw new Error('A configuração de patentes no D1 é inválida.');

  const statements: D1PreparedStatement[] = [];
  const rewards: AuthoritativeMatchReward[] = match.players.map(player => ({
    username: player.username.trim().toLowerCase(),
    xpGained: calculateBattleXp(
      player.username.trim().toLowerCase() === match.winnerUsername.trim().toLowerCase(),
      Math.max(1, Math.min(10_000, Math.trunc(match.turns))),
      Math.max(0, Math.min(3, Math.trunc(player.aliveCount))),
      Math.max(0, Math.min(1_000_000, Math.trunc(player.damageDealt))),
    ),
    user: null,
  }));

  for (const reward of rewards) {
    if (reward.username === 'convidado') continue;
    const victory = reward.username === match.winnerUsername.trim().toLowerCase();
    statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO online_battle_rewards (room_id, username, xp_delta)
      VALUES (?, ?, ?)
    `).bind(match.roomId, reward.username, reward.xpGained));
    statements.push(env.DB.prepare(`
      UPDATE accounts
      SET profile_json = json_set(
        profile_json,
        '$.xp', MAX(0, CAST(COALESCE(json_extract(profile_json, '$.xp'), 0) AS INTEGER) + ?),
        '$.wins', CAST(COALESCE(json_extract(profile_json, '$.wins'), 0) AS INTEGER) + ?,
        '$.losses', CAST(COALESCE(json_extract(profile_json, '$.losses'), 0) AS INTEGER) + ?
      ), updated_at = CURRENT_TIMESTAMP
      WHERE username = ? AND changes() = 1
    `).bind(reward.xpGained, victory ? 1 : 0, victory ? 0 : 1, reward.username));
  }

  if (statements.length) {
    const results = await env.DB.batch(statements);
    if (results.some(result => !result.success)) {
      throw new Error(`Falha ao conceder recompensas da partida ${match.roomId}.`);
    }
  }

  for (const reward of rewards) {
    if (reward.username === 'convidado') continue;
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await env.DB.prepare(
        'SELECT profile_json FROM accounts WHERE username = ?',
      ).bind(reward.username).first<{ profile_json: string }>();
      if (!row) throw new Error(`Conta ausente ao concluir recompensa: ${reward.username}.`);
      const profile = JSON.parse(row.profile_json) as Record<string, unknown>;
      const xp = Math.max(0, Number(profile.xp) || 0);
      let rank = sortedRanks[0];
      for (const candidate of sortedRanks) {
        if (xp < Number(candidate.requiredXp)) break;
        rank = candidate;
      }
      const updated = await env.DB.prepare(`
        UPDATE accounts
        SET profile_json = json_set(profile_json, '$.rank', json(?)),
            updated_at = CURRENT_TIMESTAMP
        WHERE username = ?
          AND CAST(COALESCE(json_extract(profile_json, '$.xp'), 0) AS INTEGER) = ?
      `).bind(JSON.stringify(rank), reward.username, xp).run();
      if (updated.meta?.changes === 1) break;
      if (attempt === 2) throw new Error(`Não foi possível atualizar a patente de ${reward.username}.`);
    }
    reward.user = await getD1AccountProfile(env.DB, reward.username);
  }

  return rewards.map(reward => ({
    username: reward.username,
    xpGained: reward.xpGained,
    user: reward.user || null,
  }));
}

async function writeConfig(db: D1Database, key: string, values: unknown[]): Promise<void> {
  if (values.length > 20_000) throw new Error(`Configuração ${key} excede o limite de registros.`);
  const version = randomHex(16);
  const lockOwner = randomHex(16);
  const statements: D1PreparedStatement[] = [];
  for (let index = 0; index < values.length; index++) {
    const serialized = JSON.stringify(values[index]);
    if (typeof serialized !== 'string') {
      throw new Error(`Registro ${index} da configuração ${key} não pode ser serializado.`);
    }
    for (let offset = 0, chunkNumber = 0; offset < serialized.length; chunkNumber++) {
      let end = Math.min(offset + 10_000, serialized.length);
      if (end < serialized.length &&
          serialized.charCodeAt(end - 1) >= 0xd800 && serialized.charCodeAt(end - 1) <= 0xdbff) {
        end--;
      }
      const part = serialized.slice(offset, end);
      statements.push(db.prepare(`
        INSERT INTO game_config_items (config_key, version_id, ordinal, chunk_number, value_part)
        VALUES (?, ?, ?, ?, ?)
      `).bind(key, version, index, chunkNumber, part));
      offset = end;
    }
  }
  const now = Date.now();
  const acquired = await db.prepare(`
    INSERT INTO game_config_write_locks (config_key, owner_token, expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(config_key) DO UPDATE SET
      owner_token = excluded.owner_token,
      expires_at = excluded.expires_at
    WHERE game_config_write_locks.expires_at <= ?
  `).bind(key, lockOwner, now + CONFIG_WRITE_LOCK_TTL_MS, now).run();
  if (!acquired.success) throw new Error(`Falha ao bloquear a configuração ${key} no D1.`);
  if (acquired.meta?.changes !== 1) throw new ConfigWriteBusyError(key);

  try {
    for (let index = 0; index < statements.length; index += 100) {
      const result = await db.batch(statements.slice(index, index + 100));
      if (result.some(batch => !batch.success)) {
        throw new Error(`Falha ao gravar configuração ${key} no D1.`);
      }
      const renewed = await db.prepare(`
        UPDATE game_config_write_locks
        SET expires_at = ?
        WHERE config_key = ? AND owner_token = ?
      `).bind(Date.now() + CONFIG_WRITE_LOCK_TTL_MS, key, lockOwner).run();
      if (!renewed.success || renewed.meta?.changes !== 1) {
        throw new Error(`O bloqueio da configuração ${key} foi perdido durante a gravação.`);
      }
    }

    const committed = await db.batch([
      db.prepare(`
        INSERT INTO game_config_versions (config_key, version_id, item_count)
        VALUES (?, ?, ?)
        ON CONFLICT(config_key) DO UPDATE SET
          version_id = excluded.version_id,
          item_count = excluded.item_count,
          updated_at = CURRENT_TIMESTAMP
      `).bind(key, version, values.length),
      db.prepare('DELETE FROM game_config_items WHERE config_key = ? AND version_id != ?')
        .bind(key, version),
      db.prepare('DELETE FROM game_config WHERE config_key = ?').bind(key),
    ]);
    if (committed.some(result => !result.success)) {
      throw new Error(`Falha ao publicar configuração ${key} no D1.`);
    }
  } finally {
    const released = await db.prepare(`
      DELETE FROM game_config_write_locks WHERE config_key = ? AND owner_token = ?
    `).bind(key, lockOwner).run();
    if (!released.success || released.meta?.changes !== 1) {
      throw new Error(`Falha ao liberar o bloqueio da configuração ${key} no D1.`);
    }
  }
}

async function getConfig(
  env: D1Env,
  config: { key: string; field: string },
  request: Request,
): Promise<Response> {
  if (config.key === 'characters') {
    const head = await env.DB.prepare(
      'SELECT version_id FROM game_config_versions WHERE config_key = ?',
    ).bind(config.key).first<{ version_id: string }>();
    if (head) {
      const etag = `"characters-${head.version_id}"`;
      const headers = {
        'Cache-Control': 'private, no-cache, must-revalidate',
        ETag: etag,
      };
      const requestedEtags = request.headers.get('If-None-Match')
        ?.split(',')
        .map(value => value.trim());
      if (requestedEtags?.includes('*') || requestedEtags?.includes(etag)) {
        return new Response(null, { status: 304, headers });
      }
      const stored = await readConfig(env.DB, config.key);
      if (stored === null) throw new Error('Catálogo de personagens desapareceu durante a leitura.');
      const body = JSON.stringify({ success: true, [config.field]: stored });
      return new Response(body, {
        headers: {
          ...headers,
          'Content-Type': 'application/json; charset=utf-8',
          'X-Progress-Content-Length': String(new TextEncoder().encode(body).byteLength),
        },
      });
    }
  }
  const stored = await readConfig(env.DB, config.key);
  if (stored !== null) {
    const body = { success: true, [config.field]: stored };
    if (config.key === 'characters') {
      const serialized = JSON.stringify(body);
      return new Response(serialized, {
        headers: {
          'Cache-Control': 'private, no-cache, must-revalidate',
          'Content-Type': 'application/json; charset=utf-8',
          'X-Progress-Content-Length': String(new TextEncoder().encode(serialized).byteLength),
        },
      });
    }
    return json(body);
  }
  if (config.key === 'aiSettings') {
    return json({
      success: true,
      settings: [{ maxEnemyCharacterNumber: 69 }],
    });
  }
  return error(503, `Configuração ${config.key} ainda não foi migrada para D1.`);
}

async function saveConfig(
  request: Request,
  env: D1Env,
  config: { key: string; field: string },
): Promise<Response> {
  const username = request.headers.get('X-Account-Username')?.trim().toLowerCase();
  if (!username) return error(401, 'Entre na conta administradora para alterar as configurações globais.');
  if (username !== '2') return error(403, 'Somente a conta administradora pode alterar as configurações globais.');
  if (!await isD1SessionActive(env, username, request.headers.get('X-Account-Session'))) {
    return error(401, 'A sessão da conta administradora está ausente ou foi revogada.');
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !Array.isArray(body[config.field])) return error(400, `Lista de ${config.field} inválida.`);
  if ((config.key === 'characters' || config.key === 'ranks') &&
      (body[config.field] as unknown[]).length === 0) {
    return error(400, `${config.field === 'characters' ? 'O catálogo de personagens' : 'A lista de ranks'} não pode ficar vazia.`);
  }
  if (config.key === 'aiSettings') {
    const settings = body.settings as Array<Record<string, unknown>>;
    const limit = settings[0]?.maxEnemyCharacterNumber;
    if (settings.length !== 1 || !Number.isSafeInteger(limit) ||
        Number(limit) < 3 || Number(limit) > 100_000) {
      return error(400, 'O limite de personagens da IA deve ser um número inteiro entre 3 e 100000.');
    }
    body.settings = [{ maxEnemyCharacterNumber: Number(limit) }];
  }
  try {
    await writeConfig(env.DB, config.key, body[config.field] as unknown[]);
  } catch (cause) {
    if (cause instanceof ConfigWriteBusyError) return error(409, cause.message);
    console.error(`[d1-config] Falha ao salvar configuração ${config.key}.`, cause);
    return error(500, `Não foi possível salvar ${config.key} no D1.`);
  }
  const labels: Record<string, string> = {
    characters: 'Personagens', ranks: 'Ranks atualizados', items: 'Loja atualizada',
    events: 'Eventos atualizados', banners: 'Banners atualizados', frames: 'Molduras atualizadas',
    cards: 'Cards atualizados', packs: 'Pacotes atualizados', quests: 'Missões atualizadas',
  };
  return json({ success: true, message: `${labels[config.field] || 'Configuração'} no servidor com sucesso!` });
}

async function configRoute(request: Request, env: D1Env, pathname: string): Promise<Response | null> {
  if (pathname === '/api/config/export' && request.method === 'GET') {
    const backup: Record<string, unknown> = {
      appName: 'Naruto Unison Combat',
      exportDate: new Date().toISOString(),
    };
    let missing = false;
    for (const config of Object.values(CONFIGS)) {
      const items = config.key === 'aiSettings'
        ? (await readConfig(env.DB, config.key) ?? [{ maxEnemyCharacterNumber: 69 }])
        : await readConfig(env.DB, config.key);
      if (items === null) {
        missing = true;
        continue;
      }
      backup[config.key] = items;
    }
    if (missing) return error(503, 'Nem todas as configurações foram migradas para D1.');
    return json(backup);
  }
  if (pathname === '/api/config/import' && request.method === 'POST') {
    const username = request.headers.get('X-Account-Username')?.trim().toLowerCase();
    if (!username) return error(401, 'Entre na conta administradora para importar configurações globais.');
    if (username !== '2') return error(403, 'Somente a conta administradora pode importar configurações globais.');
    if (!await isD1SessionActive(env, username, request.headers.get('X-Account-Session'))) {
      return error(401, 'A sessão da conta administradora está ausente ou foi revogada.');
    }
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return error(400, 'Arquivo de configuração JSON inválido.');
    const inputKeys: Record<string, string> = {
      characters: 'characters', quests: 'quests', shop: 'shop', events: 'events',
      ranks: 'ranks', banners: 'banners', frames: 'frames', cards: 'cards', cardPacks: 'cardPacks',
      aiSettings: 'aiSettings',
    };
    const datasets = Object.entries(inputKeys)
      .filter(([input]) => Array.isArray(body[input]));
    if (datasets.length === 0) return error(400, 'Nenhum dado de configuração válido encontrado no arquivo JSON.');
    if (datasets.some(([input, key]) =>
      (key === 'characters' || key === 'ranks') &&
      (body[input] as unknown[]).length === 0
    )) {
      return error(400, 'O catálogo de personagens e a lista de ranks não podem ficar vazios.');
    }
    for (const [input, key] of datasets) {
      if (key === 'aiSettings') {
        const settings = body[input] as Array<Record<string, unknown>>;
        const limit = settings[0]?.maxEnemyCharacterNumber;
        if (settings.length !== 1 || !Number.isSafeInteger(limit) ||
            Number(limit) < 3 || Number(limit) > 100_000) {
          return error(400, 'Configuração de batalha contra IA inválida.');
        }
      }
      try {
        await writeConfig(env.DB, key, body[input] as unknown[]);
      } catch (cause) {
        if (cause instanceof ConfigWriteBusyError) {
          return error(409, `${cause.message} A importação pode ter aplicado os conjuntos anteriores; tente novamente.`);
        }
        throw cause;
      }
    }
    return json({ success: true, message: `Configurações importadas para D1 (${datasets.length} conjuntos).` });
  }
  const config = CONFIGS[pathname];
  if (!config) return null;
  if (request.method === 'GET') return getConfig(env, config, request);
  if (request.method === 'POST') return saveConfig(request, env, config);
  return null;
}

export async function handleD1Request(request: Request, env: D1Env): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/auth/register' && request.method === 'POST') return register(request, env);
  if (pathname === '/api/auth/login' && request.method === 'POST') return login(request, env);
  if (pathname.startsWith('/api/auth/session/') && request.method === 'POST') {
    return sessionRoute(request, env, pathname);
  }
  if (pathname === '/api/auth/google' && request.method === 'POST') return googleLogin(request, env);
  if (pathname === '/api/user/online-battle-history' && request.method === 'GET') {
    const username = normalizedUsername(new URL(request.url).searchParams.get('username'));
    if (!username) return error(400, 'Nome de usuário é obrigatório.');
    return json({ success: true, matches: await getD1ArchivedHistory(env, username) });
  }
  const profile = await profileRoute(request, env, pathname);
  if (profile) return profile;
  return configRoute(request, env, pathname);
}
