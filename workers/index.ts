import { MatchmakerDurableObject, MatchRoomDurableObject } from './matchDurableObjects';

interface WorkerAssets {
  fetch(request: Request): Promise<Response>;
}

interface WorkerEnv {
  ASSETS: WorkerAssets;
  LEGACY_API_ORIGIN?: string;
  MATCHMAKER: DurableObjectNamespace;
  MATCH_ROOM: DurableObjectNamespace;
}

function getLegacyOrigin(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) return null;
    return url;
  } catch {
    return null;
  }
}

function migrationError(status: number, message: string): Response {
  return Response.json(
    { error: message, migration: 'legacy-backend-required' },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

const MATCH_ROUTES = [
  '/api/matchmaking/',
  '/api/match/',
  '/api/user/online-battle-history',
];

function isMatchRoute(pathname: string): boolean {
  return MATCH_ROUTES.some(prefix => pathname.startsWith(prefix));
}

async function readUsername(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  if (request.method === 'GET' || request.method === 'HEAD') {
    return url.searchParams.get('username')?.trim().toLowerCase() || null;
  }
  try {
    const body = await request.clone().json() as { username?: unknown };
    return typeof body.username === 'string' ? body.username.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

async function isActiveAccountSession(request: Request, username: string, origin: URL): Promise<boolean> {
  if (username === 'convidado') return true;
  const sessionToken = request.headers.get('X-Account-Session');
  if (!sessionToken || !/^[a-f0-9-]{32,128}$/i.test(sessionToken)) return false;
  const response = await fetch(new URL('/api/auth/session/status', origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, sessionToken }),
  });
  if (!response.ok) return false;
  const result = await response.json() as { status?: unknown };
  return result.status === 'active';
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/ws') {
      return env.ASSETS.fetch(request);
    }

    const origin = getLegacyOrigin(env.LEGACY_API_ORIGIN);
    if (!origin) {
      return migrationError(
        503,
        'O backend legado ainda não foi configurado para este ambiente.',
      );
    }

    if (url.pathname === '/ws' || isMatchRoute(url.pathname)) {
      if (url.pathname !== '/ws' && url.pathname !== '/api/user/online-battle-history') {
        const username = await readUsername(request);
        if (!username) return migrationError(400, 'Nome de usuário é obrigatório.');
        try {
          if (!await isActiveAccountSession(request, username, origin)) {
            return migrationError(401, 'Sessão da conta ausente ou revogada. Entre novamente.');
          }
        } catch (error) {
          console.error('[edge-gateway] Falha ao validar a sessão no backend de autenticação.', error);
          return migrationError(502, 'Não foi possível validar a sessão da conta.');
        }
      }

      const namespace = url.pathname === '/ws' ? env.MATCH_ROOM : env.MATCHMAKER;
      const objectId = url.pathname === '/ws'
        ? url.searchParams.get('roomId')
        : 'global-matchmaker';
      if (!objectId) return migrationError(400, 'roomId é obrigatório para WebSocket.');
      const stub = namespace.get(namespace.idFromName(objectId));
      return stub.fetch(request);
    }

    const upstreamUrl = new URL(url.pathname + url.search, origin);
    try {
      return await fetch(new Request(upstreamUrl, request));
    } catch (error) {
      console.error('[edge-gateway] Falha ao encaminhar requisição ao backend legado.', error);
      return migrationError(502, 'O backend legado está temporariamente indisponível.');
    }
  },
};

export { MatchmakerDurableObject, MatchRoomDurableObject };
