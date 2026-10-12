import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../workers/index';

type TestEnv = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  LEGACY_API_ORIGIN?: string;
};

test('serves non-API requests from Workers Static Assets', async () => {
  let assetRequest: Request | null = null;
  const env: TestEnv = {
    ASSETS: {
      async fetch(request) {
        assetRequest = request;
        return new Response('static app');
      },
    },
  };

  const request = new Request('https://game.example/character-select');
  const response = await worker.fetch(request, env);

  assert.equal(await response.text(), 'static app');
  assert.equal(assetRequest, request);
});

test('fails explicitly when the legacy API origin is missing or invalid', async () => {
  const env: TestEnv = {
    ASSETS: { async fetch() { return new Response('asset'); } },
  };
  const request = new Request('https://game.example/api/auth/login', { method: 'POST' });

  const missing = await worker.fetch(request, env);
  assert.equal(missing.status, 503);
  assert.equal((await missing.json() as { migration: string }).migration, 'legacy-backend-required');

  env.LEGACY_API_ORIGIN = 'https://user:password@example.com/private';
  const invalid = await worker.fetch(request, env);
  assert.equal(invalid.status, 503);
});

test('proxies API path, query, method, session header and body without trusting proxy input', async () => {
  const originalFetch = globalThis.fetch;
  let forwarded: Request | null = null;
  globalThis.fetch = async input => {
    forwarded = input as Request;
    return Response.json({ proxied: true }, { status: 201 });
  };
  try {
    const env: TestEnv = {
      ASSETS: { async fetch() { throw new Error('API request reached the asset handler'); } },
      LEGACY_API_ORIGIN: 'https://legacy.example',
    };
    const request = new Request('https://game.example/api/user/profile?username=test', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Session': 'opaque-session-token',
      },
      body: JSON.stringify({ name: 'Test' }),
    });

    const response = await worker.fetch(request, env);

    assert.equal(response.status, 201);
    assert.ok(forwarded);
    assert.equal(forwarded.url, 'https://legacy.example/api/user/profile?username=test');
    assert.equal(forwarded.method, 'PUT');
    assert.equal(forwarded.headers.get('X-Account-Session'), 'opaque-session-token');
    assert.deepEqual(await forwarded.json(), { name: 'Test' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('routes the match WebSocket path to the legacy origin', async () => {
  const originalFetch = globalThis.fetch;
  let forwardedUrl = '';
  globalThis.fetch = async input => {
    forwardedUrl = (input as Request).url;
    return new Response(null, { status: 426 });
  };
  try {
    const env: TestEnv = {
      ASSETS: { async fetch() { throw new Error('WebSocket request reached the asset handler'); } },
      LEGACY_API_ORIGIN: 'https://legacy.example',
    };
    const request = new Request('https://game.example/ws?roomId=room-1');
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 426);
    assert.equal(forwardedUrl, 'https://legacy.example/ws?roomId=room-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
