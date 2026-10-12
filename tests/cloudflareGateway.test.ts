import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../workers/index';

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
    LEGACY_API_ORIGIN: 'https://legacy.example',
    MATCHMAKER: matchmaker.value,
    MATCH_ROOM: namespace().value,
  };

  const request = new Request('https://game.example/character-select');
  const response = await worker.fetch(request, env);

  assert.equal(await response.text(), 'static app');
  assert.equal(assetRequest, request);
});

test('requires an active account session before routing match HTTP requests', async () => {
  const originalFetch = globalThis.fetch;
  const matchmaker = namespace();
  const env = {
    ASSETS: { async fetch() { return new Response('asset'); } },
    LEGACY_API_ORIGIN: 'https://legacy.example',
    MATCHMAKER: matchmaker.value,
    MATCH_ROOM: namespace().value,
  };
  try {
    globalThis.fetch = async () => Response.json({ status: 'revoked' });
    const rejected = await worker.fetch(new Request('https://game.example/api/matchmaking/status?username=ninja', {
      headers: { 'X-Account-Session': 'a'.repeat(32) },
    }), env);
    assert.equal(rejected.status, 401);
    assert.equal(matchmaker.requestedId, '');

    globalThis.fetch = async () => Response.json({ status: 'active' });
    const accepted = await worker.fetch(new Request('https://game.example/api/matchmaking/status?username=ninja', {
      headers: { 'X-Account-Session': 'a'.repeat(32) },
    }), env);
    assert.equal(accepted.status, 200);
    assert.equal(matchmaker.requestedId, 'global-matchmaker');
    assert.ok(matchmaker.forwarded);
    assert.equal(matchmaker.forwarded?.url, 'https://game.example/api/matchmaking/status?username=ninja');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('routes WebSockets to the room Durable Object named by roomId', async () => {
  const roomNamespace = namespace(new Response(null, { status: 426 }));
  const env = {
    ASSETS: { async fetch() { throw new Error('WebSocket reached assets'); } },
    LEGACY_API_ORIGIN: 'https://legacy.example',
    MATCHMAKER: namespace().value,
    MATCH_ROOM: roomNamespace.value,
  };
  const response = await worker.fetch(new Request('https://game.example/ws?roomId=room-7'), env);
  assert.equal(response.status, 426);
  assert.equal(roomNamespace.requestedId, 'room-7');
});

test('routes online battle history through the Durable Object store', async () => {
  const originalFetch = globalThis.fetch;
  const matchmaker = namespace();
  const env = {
    ASSETS: { async fetch() { throw new Error('History reached assets'); } },
    LEGACY_API_ORIGIN: 'https://legacy.example',
    MATCHMAKER: matchmaker.value,
    MATCH_ROOM: namespace().value,
  };
  try {
    globalThis.fetch = async () => {
      throw new Error('Public history must not depend on the legacy backend');
    };
    const response = await worker.fetch(new Request(
      'https://game.example/api/user/online-battle-history?username=ninja',
    ), env);
    assert.equal(response.status, 200);
    assert.equal(matchmaker.requestedId, 'global-matchmaker');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
