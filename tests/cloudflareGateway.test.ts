import assert from 'node:assert/strict';
import test from 'node:test';
import type { D1Database, D1PreparedStatement } from '../workers/d1Api';
import worker from '../workers/index';

function database(activeSessionHash: string | null = null): D1Database {
  return {
    prepare(query: string): D1PreparedStatement {
      return {
        bind() {
          return this;
        },
        async first<T>() {
          if (query.includes('FROM account_sessions') && activeSessionHash) {
            return { active_token_hash: activeSessionHash } as T;
          }
          return null;
        },
        async all<T>() {
          return { success: true, results: [] as T[] };
        },
        async run<T>() {
          return { success: true, results: [] as T[] };
        },
      };
    },
    async batch<T>() {
      return [{ success: true, results: [] as T[] }];
    },
  };
}

async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function namespace(response: Response = Response.json({ routed: true })) {
  let requestedId = '';
  let forwarded: Request | null = null;
  const value: DurableObjectNamespace = {
    idFromName(name) {
      requestedId = name;
      return { name } as DurableObjectId;
    },
    get() {
      return {
        async fetch(input) {
          forwarded = input instanceof Request ? input : new Request(input);
          return response;
        },
      };
    },
  };
  return {
    value,
    get requestedId() { return requestedId; },
    get forwarded() { return forwarded; },
  };
}

test('serves non-API requests from Workers Static Assets', async () => {
  let assetRequest: Request | null = null;
  const matchmaker = namespace();
  const env = {
    ASSETS: {
      async fetch(request: Request) {
        assetRequest = request;
        return new Response('static app');
      },
    },
    MATCHMAKER: matchmaker.value,
    MATCH_ROOM: namespace().value,
  };

  const request = new Request('https://game.example/character-select');
  const response = await worker.fetch(request, env);

  assert.equal(await response.text(), 'static app');
  assert.equal(assetRequest, request);
});

test('streams the latest Android APK from validated static release parts', async () => {
  const partOne = new Uint8Array([1, 2]);
  const partTwo = new Uint8Array([3, 4, 5]);
  const release = {
    version: '1.2.0',
    apkSizeBytes: 5,
    parts: [
      { path: '/downloads/app/1.2.0/part-000', size: partOne.length },
      { path: '/downloads/app/1.2.0/part-001', size: partTwo.length },
    ],
  };
  const assetPaths: string[] = [];
  const env = {
    ASSETS: {
      async fetch(request: Request) {
        const path = new URL(request.url).pathname;
        assetPaths.push(path);
        if (path === '/app-version.json') return Response.json(release);
        if (path === release.parts[0].path) return new Response(partOne);
        if (path === release.parts[1].path) return new Response(partTwo);
        return new Response('Not found', { status: 404 });
      },
    },
    MATCHMAKER: namespace().value,
    MATCH_ROOM: namespace().value,
  };

  const response = await worker.fetch(new Request('https://game.example/api/app/download'), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/vnd.android.package-archive');
  assert.equal(response.headers.get('content-length'), '5');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="naruto-arena-mobile-1.2.0.apk"');
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [1, 2, 3, 4, 5]);
  assert.deepEqual(assetPaths, ['/app-version.json', ...release.parts.map(part => part.path)]);
});

test('rejects invalid Android release manifests instead of downloading arbitrary assets', async () => {
  const env = {
    ASSETS: { async fetch() { return Response.json({
      version: '1.2.0',
      apkSizeBytes: 2,
      parts: [{ path: '/users/private-data', size: 2 }],
    }); } },
    MATCHMAKER: namespace().value,
    MATCH_ROOM: namespace().value,
  };
  const response = await worker.fetch(new Request('https://game.example/api/app/download'), env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'A versão para download está configurada incorretamente.' });
});

test('does not fetch Android APK parts for HEAD requests', async () => {
  let requestedPart = false;
  const env = {
    ASSETS: {
      async fetch(request: Request) {
        if (new URL(request.url).pathname === '/app-version.json') {
          return Response.json({
            version: '1.2.0',
            apkSizeBytes: 2,
            parts: [{ path: '/downloads/app/1.2.0/part-000', size: 2 }],
          });
        }
        requestedPart = true;
        return new Response(new Uint8Array([1, 2]));
      },
    },
    MATCHMAKER: namespace().value,
    MATCH_ROOM: namespace().value,
  };
  const response = await worker.fetch(new Request('https://game.example/api/app/download', { method: 'HEAD' }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), '2');
  assert.equal(requestedPart, false);
});

test('requires an active account session before routing match HTTP requests', async () => {
  const matchmaker = namespace();
  const env = {
    ASSETS: { async fetch() { return new Response('asset'); } },
    DB: database(),
    MATCHMAKER: matchmaker.value,
    MATCH_ROOM: namespace().value,
  };
  const token = 'a'.repeat(32);
  const rejected = await worker.fetch(new Request('https://game.example/api/matchmaking/status?username=ninja', {
    headers: { 'X-Account-Session': token },
  }), env);
  assert.equal(rejected.status, 401);
  assert.equal(matchmaker.requestedId, '');

  const activeEnv = { ...env, DB: database(await tokenHash(token)) };
  const accepted = await worker.fetch(new Request('https://game.example/api/matchmaking/status?username=ninja', {
    headers: { 'X-Account-Session': token },
  }), activeEnv);
  assert.equal(accepted.status, 200);
  assert.equal(matchmaker.requestedId, 'global-matchmaker');
  assert.ok(matchmaker.forwarded);
  assert.equal(matchmaker.forwarded?.url, 'https://game.example/api/matchmaking/status?username=ninja');
});

test('routes WebSockets to the room Durable Object named by roomId', async () => {
  const roomNamespace = namespace(new Response(null, { status: 426 }));
  const env = {
    ASSETS: { async fetch() { throw new Error('WebSocket reached assets'); } },
    DB: database(),
    MATCHMAKER: namespace().value,
    MATCH_ROOM: roomNamespace.value,
  };
  const response = await worker.fetch(new Request('https://game.example/ws?roomId=room-7'), env);
  assert.equal(response.status, 426);
  assert.equal(roomNamespace.requestedId, 'room-7');
});

test('routes online battle history through the Durable Object store', async () => {
  const matches = Array.from({ length: 7 }, (_, index) => ({
    roomId: `room-${index}`,
    players: [{ username: 'ninja', name: 'Ninja' }, { username: 'opponent', name: 'Opponent' }],
    winnerUsername: 'ninja',
    finishedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    reason: 'battle',
  }));
  const matchmaker = namespace(Response.json({ success: true, matches }));
  const env = {
    ASSETS: { async fetch() { throw new Error('History reached assets'); } },
    DB: database(),
    MATCHMAKER: matchmaker.value,
    MATCH_ROOM: namespace().value,
  };
  const response = await worker.fetch(new Request(
    'https://game.example/api/user/online-battle-history?username=ninja',
  ), env);
  assert.equal(response.status, 200);
  assert.equal(matchmaker.requestedId, 'global-matchmaker');
  const body = await response.json() as { matches: Array<{ roomId: string }> };
  assert.deepEqual(body.matches.map(match => match.roomId), ['room-6', 'room-5', 'room-4', 'room-3', 'room-2']);
});
