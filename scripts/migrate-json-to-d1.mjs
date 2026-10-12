import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1] || null;
};
const apply = args.includes('--apply');
const local = args.includes('--local');
const database = option('--database') || 'naruto-infinity-beta';
const dataDir = path.resolve(root, option('--data-dir') || 'src/data');
const liveOrigin = option('--legacy-api-origin');
const migrationExportUrl = option('--migration-export-url');
const backupDir = path.resolve(
  option('--backup-dir') || path.join(process.env.LOCALAPPDATA || tmpdir(), 'NarutoInfinity', 'd1-backups'),
);

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function readJson(name) {
  return readFile(path.join(dataDir, name), 'utf8').then(JSON.parse);
}

function configVersion(key, serialized) {
  return createHash('sha256').update(`${key}\0${serialized}`).digest('hex').slice(0, 32);
}

function chunks(text, size = 10_000) {
  const result = [];
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(offset + size, text.length);
    if (end < text.length &&
        text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) end--;
    result.push(text.slice(offset, end));
    offset = end;
  }
  return result;
}

function normalizedUsername(input) {
  if (typeof input !== 'string') throw new Error('Conta sem username válido.');
  const username = input.trim().toLowerCase();
  if (!username || username.length > 100 || /[\u0000-\u001f\u007f]/.test(username)) {
    throw new Error('Username legado fora do limite de compatibilidade.');
  }
  return username;
}

if (liveOrigin && migrationExportUrl) {
  throw new Error('Escolha apenas --legacy-api-origin ou --migration-export-url.');
}
let migrationBundle = null;
if (migrationExportUrl) {
  const url = new URL(migrationExportUrl);
  const token = process.env.DATA_MIGRATION_TOKEN;
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      !token || token.length < 32) {
    throw new Error('Use uma URL HTTP(S) válida e defina DATA_MIGRATION_TOKEN localmente (mínimo 32 caracteres).');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(url, {
      headers: { 'X-Data-Migration-Token': token, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        response.status === 409
          ? 'O backend informou que ainda existem partidas ativas; nenhum dado foi importado.'
          : `Exportação protegida do backend respondeu HTTP ${response.status}.`,
      );
    }
    migrationBundle = await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

const rawUsers = migrationBundle ? migrationBundle.users : await readJson('users.json');
if (!Array.isArray(rawUsers)) throw new Error('users.json precisa conter uma lista.');
const users = rawUsers.map(user => {
  if (!user || typeof user !== 'object') throw new Error('Registro de conta inválido.');
  const username = normalizedUsername(user.username);
  const password = typeof user.password === 'string' ? user.password : '';
  let salt = null;
  let hash = null;
  if (password) {
    salt = randomBytes(16).toString('hex');
    hash = pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100_000, 32, 'sha256').toString('hex');
  }
  const profile = { ...user, username };
  delete profile.password;
  delete profile.googleId;
  const googleSubject = typeof user.googleId === 'string' && user.googleId ? user.googleId : null;
  const email = typeof user.email === 'string' && user.email ? user.email : null;
  delete profile.email;
  return { username, salt, hash, profile, googleSubject, email };
});
if (new Set(users.map(user => user.username)).size !== users.length) {
  throw new Error('Há usernames duplicados após normalização; a migração foi interrompida.');
}

const configSources = [
  ['characters', 'custom_characters.json'],
  ['quests', 'quests.json'],
  ['shop', 'shop.json'],
  ['events', 'events.json'],
  ['ranks', 'ranks.json'],
  ['banners', 'banners.json'],
  ['frames', 'frames.json'],
  ['cards', 'cards.json'],
  ['cardPacks', 'card_packs.json'],
];
let configs = [];
for (const [key, filename] of configSources) {
  const value = migrationBundle?.config
    ? migrationBundle.config[key]
    : await readJson(filename);
  if (!Array.isArray(value)) throw new Error(`${filename} precisa conter uma lista.`);
  configs.push({ key, value });
}

if (migrationBundle && migrationBundle.activeRooms !== 0) {
  throw new Error('O backend legado informou que há partidas ativas; nenhum dado foi importado.');
}
const rooms = migrationBundle ? { rooms: {}, matches: {} } : await readJson('match_rooms.json');
if (!rooms || typeof rooms !== 'object' || Array.isArray(rooms)) {
  throw new Error('match_rooms.json possui formato inesperado.');
}
if (
  Object.keys(rooms).some(key => !['rooms', 'matches'].includes(key)) ||
  !rooms.rooms || typeof rooms.rooms !== 'object' || Array.isArray(rooms.rooms) ||
  !rooms.matches || typeof rooms.matches !== 'object' || Array.isArray(rooms.matches) ||
  Object.keys(rooms.rooms).length !== 0 || Object.keys(rooms.matches).length !== 0
) {
  throw new Error('Há salas antigas ativas; encerre ou migre essas partidas antes de importar D1.');
}

const oldSessions = migrationBundle ? migrationBundle.accountSessions : await readJson('account_sessions.json');
if (!oldSessions || typeof oldSessions !== 'object' || Array.isArray(oldSessions)) {
  throw new Error('account_sessions.json possui formato inesperado.');
}
const sessions = [];
for (const [rawUsername, session] of Object.entries(oldSessions)) {
  const username = normalizedUsername(rawUsername);
  if (!session || typeof session.activeTokenHash !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(session.activeTokenHash) ||
      !Array.isArray(session.pendingTokenHashes) ||
      session.pendingTokenHashes.some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value))) {
    throw new Error('Um registro de sessão legado possui formato inválido.');
  }
  sessions.push({ username, active: session.activeTokenHash, pending: session.pendingTokenHashes });
}

const historyData = migrationBundle
  ? migrationBundle.onlineBattleHistory
  : await readJson('online_battle_history.json');
let history = Array.isArray(historyData) ? historyData : Object.values(historyData);
if (liveOrigin) {
  const origin = new URL(liveOrigin);
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('--legacy-api-origin precisa ser uma origem HTTP(S) sem credenciais ou caminho.');
  }
  const fetchJson = async pathName => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(new URL(pathName, origin), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Endpoint legado respondeu HTTP ${response.status}.`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  };
  const [liveConfig, profiles, liveHistories] = await Promise.all([
    fetchJson('/api/config/export'),
    Promise.all(users.map(user =>
      fetchJson(`/api/user/profile?username=${encodeURIComponent(user.username)}`))),
    Promise.all(users.map(user =>
      fetchJson(`/api/user/online-battle-history?username=${encodeURIComponent(user.username)}`))),
  ]);
  const configFieldByKey = {
    characters: 'characters', quests: 'quests', shop: 'shop', events: 'events',
    ranks: 'ranks', banners: 'banners', frames: 'frames', cards: 'cards',
    cardPacks: 'cardPacks',
  };
  configs = configs.map(config => {
    const value = liveConfig[configFieldByKey[config.key]];
    if (!Array.isArray(value)) throw new Error(`Export legado sem lista válida para ${config.key}.`);
    return { ...config, value };
  });
  profiles.forEach((result, index) => {
    if (!result?.user || typeof result.user !== 'object') {
      throw new Error(`O backend legado não retornou o perfil ${index + 1} da fonte local.`);
    }
    const migratedProfile = { ...result.user, username: users[index].username };
    delete migratedProfile.password;
    delete migratedProfile.googleId;
    users[index].profile = migratedProfile;
  });
  const byRoomId = new Map(history.map(record => [record.roomId, record]));
  for (const result of liveHistories) {
    if (!Array.isArray(result?.matches)) throw new Error('Histórico legado retornou formato inválido.');
    for (const record of result.matches) byRoomId.set(record.roomId, record);
  }
  history = [...byRoomId.values()];
  console.log('Fonte ao vivo do backend legado consultada: catálogos, perfis conhecidos e histórico.');
} else if (migrationBundle) {
  console.log('Exportação integral protegida do backend legado carregada; dados em memória não foram impressos.');
}
for (const record of history) {
  if (!record || typeof record.roomId !== 'string' || !Array.isArray(record.players) ||
      record.players.length !== 2 || typeof record.winnerUsername !== 'string' ||
      typeof record.finishedAt !== 'string' || typeof record.reason !== 'string') {
    throw new Error('Um registro do histórico de batalhas possui formato inválido.');
  }
}

const roomCount = Object.keys(rooms.rooms).length;
const sourceCounts = {
  accounts: users.length,
  accountSessionsResetAtCutover: sessions.length,
  onlineBattleHistory: history.length,
  activeRooms: roomCount,
  configurations: Object.fromEntries(configs.map(({ key, value }) => [key, value.length])),
  largestCharacterBytes: Math.max(
    0,
    ...configs.find(config => config.key === 'characters').value.map(
      value => Buffer.byteLength(JSON.stringify(value)),
    ),
  ),
};
console.log('Fonte local validada (quantidades; nenhum dado de conta é impresso):');
console.log(JSON.stringify(sourceCounts, null, 2));
if (!apply) {
  console.log('Prévia apenas: nenhuma alteração foi feita no D1. Use --apply para executar.');
  process.exit(0);
}

const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const runWrangler = (parameters, stdio = 'inherit') => {
  const result = spawnSync(process.execPath, [wrangler, ...parameters], {
    cwd: root,
    stdio,
    encoding: stdio === 'pipe' ? 'utf8' : undefined,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Wrangler falhou (${result.status ?? result.signal}). ${result.stderr || ''}`);
  }
  return result;
};

await mkdir(backupDir, { recursive: true });
const timestamp = new Date().toISOString().replaceAll(':', '-');
const backupPath = path.join(backupDir, `${database}-before-import-${timestamp}.sql`);
const workDir = await mkdtemp(path.join(tmpdir(), 'naruto-d1-migration-'));
const stateDir = path.join(workDir, 'state');
const locationArgs = local ? ['--local', '--persist-to', stateDir] : ['--remote'];
const expected = {
  accounts: users.length,
  account_sessions: 0,
  archived_online_battle_history: history.length,
  ...Object.fromEntries(configs.map(({ key, value }) => [`config:${key}`, value.length])),
};
const readCounts = () => {
  const query = `
    SELECT 'accounts' AS name, COUNT(*) AS count FROM accounts
    UNION ALL SELECT 'account_sessions', COUNT(*) FROM account_sessions
    UNION ALL SELECT 'archived_online_battle_history', COUNT(*) FROM archived_online_battle_history
    UNION ALL SELECT 'config:' || config_key, item_count FROM game_config_versions
  `;
  const result = runWrangler(
    ['d1', 'execute', database, ...locationArgs, '--command', query, '--json'],
    'pipe',
  );
  const parsed = JSON.parse(result.stdout);
  const rows = parsed.flatMap(entry => entry.results || []);
  return Object.fromEntries(rows.map(row => [row.name, Number(row.count)]));
};
const readConfigIntegrityIssues = () => {
  const query = `
    SELECT config_key, ordinal, COUNT(*) AS chunks,
      MIN(chunk_number) AS first_chunk, MAX(chunk_number) AS last_chunk
    FROM game_config_items
    GROUP BY config_key, version_id, ordinal
    HAVING first_chunk != 0 OR chunks != last_chunk + 1
    UNION ALL
    SELECT versions.config_key, -1 AS ordinal, COUNT(DISTINCT items.ordinal) AS chunks,
      MIN(items.ordinal) AS first_chunk, MAX(items.ordinal) AS last_chunk
    FROM game_config_versions AS versions
    LEFT JOIN game_config_items AS items
      ON items.config_key = versions.config_key
      AND items.version_id = versions.version_id
    GROUP BY versions.config_key, versions.item_count
    HAVING chunks != versions.item_count
      OR (versions.item_count > 0 AND (first_chunk != 0 OR last_chunk != versions.item_count - 1))
  `;
  const result = runWrangler(
    ['d1', 'execute', database, ...locationArgs, '--command', query, '--json'],
    'pipe',
  );
  return JSON.parse(result.stdout).flatMap(entry => entry.results || []);
};

if (local) {
  runWrangler(['d1', 'migrations', 'apply', database, '--local', '--persist-to', stateDir]);
} else {
  runWrangler(['d1', 'migrations', 'apply', database, '--remote']);
}
if (!local) {
  runWrangler([
    'd1', 'export', database, ...locationArgs, '--skip-confirmation', '--output', backupPath,
  ]);
  console.log(`Backup D1 anterior à importação: ${backupPath}`);
}

const before = readCounts();
const sqlPath = path.join(workDir, 'import.sql');
const statements = ['PRAGMA foreign_keys = ON;'];
for (const user of users) {
  const userProfile = sqlString(JSON.stringify(user.profile));
  if (user.hash && user.salt) {
    statements.push(`
      INSERT INTO accounts (username, password_salt, password_hash, profile_json)
      VALUES (${sqlString(user.username)}, ${sqlString(user.salt)}, ${sqlString(user.hash)}, ${userProfile})
      ON CONFLICT(username) DO UPDATE SET
        password_salt = excluded.password_salt,
        password_hash = excluded.password_hash
      WHERE excluded.password_hash IS NOT NULL;
    `);
  } else {
    statements.push(`
      INSERT INTO accounts (username, password_salt, password_hash, profile_json)
      VALUES (${sqlString(user.username)}, NULL, NULL, ${userProfile})
      ON CONFLICT(username) DO NOTHING;
    `);
  }
  if (user.googleSubject) {
    statements.push(`
      INSERT INTO account_google_identities (google_subject, username, email)
      VALUES (${sqlString(user.googleSubject)}, ${sqlString(user.username)},
        ${user.email ? sqlString(user.email) : 'NULL'})
      ON CONFLICT(google_subject) DO NOTHING;
    `);
  }
}
for (const { key, value } of configs) {
  const version = configVersion(key, JSON.stringify(value));
  value.forEach((item, ordinal) => {
    const parts = chunks(JSON.stringify(item));
    parts.forEach((part, chunkNumber) => {
      statements.push(`
        INSERT INTO game_config_items (config_key, version_id, ordinal, chunk_number, value_part)
        VALUES (${sqlString(key)}, ${sqlString(version)}, ${ordinal}, ${chunkNumber}, ${sqlString(part)})
        ON CONFLICT(config_key, version_id, ordinal, chunk_number) DO NOTHING;
      `);
    });
  });
  statements.push(`
    INSERT INTO game_config_versions (config_key, version_id, item_count)
    VALUES (${sqlString(key)}, ${sqlString(version)}, ${value.length})
    ON CONFLICT(config_key) DO NOTHING;
  `);
}
for (const record of history) {
  statements.push(`
    INSERT INTO archived_online_battle_history (room_id, players_json, winner_username, finished_at, reason)
    VALUES (${sqlString(record.roomId)}, ${sqlString(JSON.stringify(record.players))},
      ${sqlString(record.winnerUsername)}, ${sqlString(record.finishedAt)}, ${sqlString(record.reason)})
    ON CONFLICT(room_id) DO NOTHING;
  `);
}

try {
  await writeFile(sqlPath, statements.join('\n'), { encoding: 'utf8', mode: 0o600 });
  runWrangler(['d1', 'execute', database, ...locationArgs, '--file', sqlPath], 'pipe');
  if (local) runWrangler(['d1', 'execute', database, ...locationArgs, '--file', sqlPath], 'pipe');
  const after = readCounts();
  const mismatches = Object.entries(expected)
    .filter(([key, minimum]) => (after[key] || 0) < minimum);
  if (mismatches.length) {
    throw new Error(`Contagem D1 abaixo da fonte: ${mismatches.map(([key]) => key).join(', ')}.`);
  }
  const integrityIssues = readConfigIntegrityIssues();
  if (integrityIssues.length) {
    throw new Error(
      `Configurações D1 incompletas ou com blocos ausentes: ${
        [...new Set(integrityIssues.map(issue => issue.config_key))].join(', ')
      }.`,
    );
  }
  console.log('Contagens D1 verificadas:');
  console.log(JSON.stringify({ before, source: expected, after }, null, 2));
  if (!local) {
    const afterPath = path.join(backupDir, `${database}-after-import-${timestamp}.sql`);
    runWrangler([
      'd1', 'export', database, ...locationArgs, '--skip-confirmation', '--output', afterPath,
    ]);
    console.log(`Export D1 após importação: ${afterPath}`);
  }
} finally {
  await rm(workDir, { recursive: true, force: true });
}
console.log(`Importação ${local ? 'local' : 'remota'} concluída; inserções são idempotentes.`);
