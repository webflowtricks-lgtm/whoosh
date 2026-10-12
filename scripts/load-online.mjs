import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { WebSocket } from 'ws';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index].startsWith('--')) {
    args.set(process.argv[index].slice(2), process.argv[index + 1]);
    index += 1;
  }
}

const baseUrl = (args.get('url') || process.env.LOAD_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const playerCount = Number(args.get('players') || 60);
const roomCount = Number(args.get('rooms') || 15);
const turnCount = Number(args.get('turns') || 20);
const expectedActivePlayers = roomCount * 2;

if (!Number.isSafeInteger(playerCount) || playerCount < 2 ||
  !Number.isSafeInteger(roomCount) || roomCount < 1 ||
  expectedActivePlayers > playerCount ||
  !Number.isSafeInteger(turnCount) || turnCount < 1) {
  throw new Error('Use valores inteiros válidos: --players >= 2, --rooms >= 1, 2 * rooms <= players e --turns >= 1.');
}

if (new URL(baseUrl).hostname !== 'localhost' && new URL(baseUrl).hostname !== '127.0.0.1' &&
  process.env.LOAD_ALLOW_REMOTE !== 'true') {
  throw new Error('A carga remota exige LOAD_ALLOW_REMOTE=true. Use staging e contas de teste isoladas.');
}

const teamData = JSON.parse(await fs.readFile(path.resolve('src/data/custom_characters.json'), 'utf8'));
const candidates = teamData.filter(character =>
  character && typeof character.id === 'string' &&
  Array.isArray(character.skills) && character.skills.length > 0 && character.skills.length <= 32,
);
if (candidates.length < 3) throw new Error('O roster configurado não tem três personagens compatíveis para a carga.');

const team = candidates.slice(0, 3).map(character => ({
  id: character.id,
  skills: Array.from({ length: character.skills.length }, () => ({})),
}));
const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const usernames = Array.from({ length: playerCount }, (_, index) => `loadtest_${runId}_${index}`);
const roomByPlayer = new Map();
const slotByPlayer = new Map();
const seedByRoom = new Map();
const socketByPlayer = new Map();
const sockets = [];
const latencies = [];
const statusCounts = new Map();
let requestCount = 0;
let requestBytes = 0;
let responseBytes = 0;
let websocketMessagesReceived = 0;
let websocketBytesReceived = 0;
let failures = 0;

async function request(method, endpoint, body, expectedStatuses = [200]) {
  const serializedBody = body === undefined ? undefined : JSON.stringify(body);
  const started = performance.now();
  requestCount += 1;
  requestBytes += serializedBody ? Buffer.byteLength(serializedBody) : 0;
  let response;
  try {
    response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: serializedBody ? { 'Content-Type': 'application/json' } : undefined,
      body: serializedBody,
    });
  } catch (error) {
    failures += 1;
    throw error;
  }

  const text = await response.text();
  const elapsed = performance.now() - started;
  latencies.push(elapsed);
  responseBytes += Buffer.byteLength(text);
  statusCounts.set(response.status, (statusCounts.get(response.status) || 0) + 1);
  if (!expectedStatuses.includes(response.status)) {
    failures += 1;
    throw new Error(`${method} ${endpoint}: HTTP ${response.status}, esperava ${expectedStatuses.join('/')}: ${text.slice(0, 200)}`);
  }

  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { /* Non-JSON error body is preserved above on unexpected status. */ }
  }
  return { data, status: response.status, elapsed };
}

function connectSocket(username, roomId) {
  const wsBase = new URL(baseUrl);
  wsBase.protocol = wsBase.protocol === 'https:' ? 'wss:' : 'ws:';
  wsBase.pathname = '/ws';
  wsBase.search = '';

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsBase, { maxPayload: 128 * 1024 });
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.close();
        reject(new Error(`Timeout aguardando snapshot WS de ${username}.`));
      }
    }, 10000);

    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'join', roomId, username, sessionToken: null }));
    });
    socket.on('message', raw => {
      websocketMessagesReceived += 1;
      websocketBytesReceived += raw.length;
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.type === 'error') {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`WebSocket rejeitou ${username}: ${message.error}`));
        }
        return;
      }
      if (message.type === 'room-state' && !settled) {
        settled = true;
        clearTimeout(timeout);
        socket.send(JSON.stringify({ type: 'ping' }));
        resolve(socket);
      }
    });
    socket.on('error', error => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
    });
    socket.on('close', (code, reason) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`WebSocket fechou antes do snapshot: ${code} ${reason}`));
      }
    });
  });
}

async function health() {
  const result = await request('GET', '/api/health');
  return result.data;
}

async function cleanup() {
  for (const socket of sockets) socket.close();
  await Promise.allSettled(usernames.map(username =>
    request('POST', '/api/matchmaking/quit', { username, roomId: roomByPlayer.get(username) }),
  ));
}

try {
  const initialHealth = await health();
  if (initialHealth?.status !== 'ok') throw new Error(`Servidor não está saudável: ${JSON.stringify(initialHealth)}`);

  const joinResults = await Promise.all(usernames.slice(0, expectedActivePlayers).map(username =>
    request('POST', '/api/matchmaking/join', {
      username,
      name: username,
      team,
      profile: { username, name: username },
    }),
  ));
  const queueFailures = joinResults.filter(result => result.data?.status !== 'matched' && result.data?.status !== 'searching');
  if (queueFailures.length) throw new Error(`${queueFailures.length} jogadores não entraram no matchmaking.`);

  const activeStatus = await Promise.all(usernames.slice(0, expectedActivePlayers).map(username =>
    request('GET', `/api/matchmaking/status?username=${encodeURIComponent(username)}`),
  ));
  for (let index = 0; index < activeStatus.length; index += 1) {
    const state = activeStatus[index].data;
    if (state?.status !== 'matched') throw new Error(`${usernames[index]} não foi pareado: ${JSON.stringify(state)}`);
    roomByPlayer.set(usernames[index], state.roomId);
    slotByPlayer.set(usernames[index], state.myIndex);
    seedByRoom.set(state.roomId, state.seed);
  }

  const groupedRooms = new Map();
  for (const [username, roomId] of roomByPlayer) {
    if (!groupedRooms.has(roomId)) groupedRooms.set(roomId, []);
    groupedRooms.get(roomId).push(username);
  }
  if (groupedRooms.size !== roomCount || [...groupedRooms.values()].some(players => players.length !== 2)) {
    throw new Error(`Pareamento incorreto: ${groupedRooms.size} salas para ${expectedActivePlayers} jogadores.`);
  }

  for (const [roomId, players] of groupedRooms) {
    const joined = await Promise.all(players.map(async username => {
      const socket = await connectSocket(username, roomId);
      socketByPlayer.set(username, socket);
      return socket;
    }));
    sockets.push(...joined);
  }

  const outsider = await request(
    'GET',
    `/api/match/room-state?roomId=${encodeURIComponent(groupedRooms.keys().next().value)}&username=convidado`,
    undefined,
    [403],
  );
  if (outsider.status !== 403) throw new Error('A sala expôs estado para um usuário externo.');

  const firstRoomPlayers = groupedRooms.values().next().value;
  const firstRoomId = roomByPlayer.get(firstRoomPlayers[0]);
  const reconnectingSocket = socketByPlayer.get(firstRoomPlayers[0]);
  await new Promise(resolve => {
    reconnectingSocket.once('close', resolve);
    reconnectingSocket.close();
  });
  const restoredSocket = await connectSocket(firstRoomPlayers[0], firstRoomId);
  sockets.push(restoredSocket);
  socketByPlayer.set(firstRoomPlayers[0], restoredSocket);

  const invalidAction = await request('POST', '/api/match/submit-turn', {
    roomId: firstRoomId,
    username: firstRoomPlayers[0],
    turn: 1,
    actions: [{ sourceId: 'player-0', skillIndex: 999, targetId: 'enemy-0' }],
  }, [400]);
  if (invalidAction.status !== 400) throw new Error('O servidor aceitou um índice de habilidade inválido.');

  const loadStarted = performance.now();
  for (let turn = 1; turn <= turnCount; turn += 1) {
    const turnResults = await Promise.all([
      ...[...groupedRooms].map(async ([roomId, players]) => {
        let seedValue = (seedByRoom.get(roomId) + 0x9e3779b9) >>> 0;
        seedValue ^= seedValue >>> 15;
        seedValue = (seedValue * 2246822519) >>> 0;
        seedValue ^= seedValue >>> 13;
        const starterSlot = seedValue & 1;
        const leaderSlot = (starterSlot + turn - 1) % 2;
        const orderedPlayers = [...players].sort((left, right) =>
          slotByPlayer.get(left) === leaderSlot ? -1 : slotByPlayer.get(right) === leaderSlot ? 1 : 0,
        );
        const results = [];
        for (const username of orderedPlayers) {
          results.push(await request('POST', '/api/match/submit-turn', {
            roomId,
            username,
            turn,
            actions: [{
              sourceId: `player-${turn % 3}`,
              skillIndex: turn % team[turn % 3].skills.length,
              targetId: `enemy-${(turn + slotByPlayer.get(username)) % 3}`,
            }],
          }));
        }
        return results;
      }),
      ...usernames.slice(expectedActivePlayers).map(username =>
        request('GET', `/api/matchmaking/status?username=${encodeURIComponent(username)}`),
      ),
    ]);

    for (const [roomId] of groupedRooms) {
      const state = await request('GET', `/api/match/room-state?roomId=${encodeURIComponent(roomId)}&username=${encodeURIComponent(groupedRooms.get(roomId)[0])}&turn=${turn}`);
      if (state.data?.room?.resolvedTurn !== turn) {
        throw new Error(`Turno ${turn} não sincronizou em ${roomId}: ${JSON.stringify(state.data?.room?.resolvedTurn)}`);
      }
    }

    const report = {
      'player-0': { health: 100, shield: 0, isDead: false },
      'player-1': { health: 100, shield: 0, isDead: false },
      'player-2': { health: 100, shield: 0, isDead: false },
    };
    await Promise.all([...groupedRooms].flatMap(([roomId, players]) =>
      players.map(username => request('POST', '/api/match/report-state', {
        roomId,
        username,
        turn,
        units: report,
        chakra: { Tai: 1, Nin: 1, Gen: 1, Blood: 1, Rand: 1 },
      })),
    ));
    if (turnResults.some(result => result.data?.status === 'error')) {
      throw new Error(`Falha de sincronização no turno ${turn}.`);
    }
  }
  const loadDurationMs = performance.now() - loadStarted;

  const duplicateResult = await request('POST', '/api/match/submit-turn', {
    roomId: firstRoomId,
    username: firstRoomPlayers[0],
    turn: turnCount,
    actions: [{
      sourceId: `player-${turnCount % 3}`,
      skillIndex: turnCount % team[turnCount % 3].skills.length,
      targetId: `enemy-${(turnCount + slotByPlayer.get(firstRoomPlayers[0])) % 3}`,
    }],
  }, [200]);
  if (!duplicateResult.data?.duplicate) {
    throw new Error('Retry idempotente não foi reconhecido como duplicado.');
  }

  const surrenderingPlayer = firstRoomPlayers[0];
  const surrenderResult = await request('POST', '/api/match/surrender', {
    roomId: firstRoomId,
    username: surrenderingPlayer,
    reason: 'manual',
  });
  if (!surrenderResult.data?.success) throw new Error('A partida não foi finalizada por abandono.');
  const finalRoom = await request(
    'GET',
    `/api/match/room-state?roomId=${encodeURIComponent(firstRoomId)}&username=${encodeURIComponent(surrenderingPlayer)}`,
  );
  if (finalRoom.data?.room?.surrenderedBy !== surrenderingPlayer) {
    throw new Error('O abandono não foi refletido no estado da sala.');
  }
  const postFinishAction = await request('POST', '/api/match/submit-turn', {
    roomId: firstRoomId,
    username: surrenderingPlayer,
    turn: turnCount + 1,
    actions: [{
      sourceId: `player-${(turnCount + 1) % 3}`,
      skillIndex: 0,
      targetId: 'enemy-0',
    }],
  }, [409]);
  if (postFinishAction.status !== 409) {
    throw new Error('O servidor aceitou uma ação após o abandono da partida.');
  }

  await new Promise(resolve => setTimeout(resolve, 600));
  const finalHealth = await health();
  const matchRoomsPath = path.resolve(process.env.WHOOSH_DATA_DIR || 'src/data', 'match_rooms.json');
  let persistedStateBytes = null;
  try { persistedStateBytes = (await fs.stat(matchRoomsPath)).size; } catch { /* Optional for non-local deployments. */ }

  const sorted = [...latencies].sort((a, b) => a - b);
  const percentile = value => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)] || 0;
  const initialRuntime = initialHealth.runtime;
  const finalRuntime = finalHealth.runtime;
  const report = {
    target: baseUrl,
    scenario: { players: playerCount, activeRooms: roomCount, activePlayers: expectedActivePlayers, lobbyPollers: playerCount - expectedActivePlayers, turns: turnCount },
    durationMs: Math.round(loadDurationMs),
    http: {
      requests: requestCount,
      errors: failures,
      statusCounts: Object.fromEntries(statusCounts),
      requestBytes,
      responseBytes,
      latencyMs: { min: Math.round(sorted[0] || 0), average: Math.round(latencies.reduce((sum, latency) => sum + latency, 0) / Math.max(1, latencies.length)), p50: Math.round(percentile(0.50)), p95: Math.round(percentile(0.95)), p99: Math.round(percentile(0.99)) },
    },
    websocket: { connections: sockets.length, messagesReceived: websocketMessagesReceived, bytesReceived: websocketBytesReceived },
    serverRuntime: initialRuntime && finalRuntime ? {
      rssDeltaBytes: finalRuntime.rssBytes - initialRuntime.rssBytes,
      heapUsedDeltaBytes: finalRuntime.heapUsedBytes - initialRuntime.heapUsedBytes,
      cpuUserDeltaMicros: finalRuntime.cpuUserMicros - initialRuntime.cpuUserMicros,
      cpuSystemDeltaMicros: finalRuntime.cpuSystemMicros - initialRuntime.cpuSystemMicros,
    } : 'Indisponível: iniciar o servidor local com ENABLE_RUNTIME_METRICS=true.',
    persistedMatchRoomsFileBytes: persistedStateBytes,
    caveat: 'Mede transporte e protocolo de turnos; não executa nem valida o cálculo de dano do cliente.',
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await cleanup();
}
