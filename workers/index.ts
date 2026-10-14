import { MatchmakerDurableObject, MatchRoomDurableObject } from './matchDurableObjects';
import {
  getD1ArchivedHistory,
  handleD1Request,
  isD1SessionActive,
  type D1Env,
} from './d1Api';

interface WorkerAssets {
  fetch(request: Request): Promise<Response>;
}

interface WorkerEnv {
  ASSETS: WorkerAssets;
  DB?: D1Env['DB'];
  FIREBASE_PROJECT_ID?: string;
  MATCHMAKER: DurableObjectNamespace;
  MATCH_ROOM: DurableObjectNamespace;
}

function apiError(status: number, message: string): Response {
  return Response.json(
    { error: message },
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

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/ws') {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return Response.json({ status: 'ok', version: 'd1-do-v1' }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    if (!env.DB) return apiError(503, 'O banco D1 não está disponível.');

    if (url.pathname === '/api/user/online-battle-history' && request.method === 'GET') {
      const username = url.searchParams.get('username')?.trim().toLowerCase();
      if (!username) return apiError(400, 'Nome de usuário é obrigatório.');
      try {
        const archived = await getD1ArchivedHistory({ DB: env.DB }, username);
        const liveResponse = await env.MATCHMAKER
          .get(env.MATCHMAKER.idFromName('global-matchmaker'))
          .fetch(request);
        if (!liveResponse.ok) return liveResponse;
        const live = await liveResponse.json() as { matches?: Array<Record<string, unknown>> };
        const matches = new Map<string, Record<string, unknown>>();
        for (const record of [...(live.matches || []), ...archived]) {
          if (typeof record.roomId === 'string') matches.set(record.roomId, record);
        }
        return Response.json({
          success: true,
          matches: [...matches.values()].sort(
            (left, right) => Date.parse(String(right.finishedAt)) - Date.parse(String(left.finishedAt)),
          ).slice(0, 5),
        }, { headers: { 'Cache-Control': 'no-store' } });
      } catch (error) {
        console.error('[edge-gateway] Falha ao combinar histórico D1 e Durable Object.', error);
        return apiError(502, 'Não foi possível carregar o histórico de partidas.');
      }
    }

    try {
      const response = await handleD1Request(request, {
        DB: env.DB,
        FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID,
      });
      if (response) return response;
    } catch (error) {
      console.error('[d1-api] Falha ao processar requisição no D1.', error);
      return apiError(500, 'Falha ao processar a solicitação no armazenamento D1.');
    }

    if (url.pathname === '/ws' || isMatchRoute(url.pathname)) {
      if (url.pathname !== '/ws' && url.pathname !== '/api/user/online-battle-history') {
        const username = await readUsername(request);
        if (!username) return apiError(400, 'Nome de usuário é obrigatório.');
        try {
          const sessionToken = request.headers.get('X-Account-Session');
          if (!await isD1SessionActive({ DB: env.DB }, username, sessionToken)) {
            return apiError(401, 'Sessão da conta ausente ou revogada. Entre novamente.');
          }
        } catch (error) {
          console.error('[edge-gateway] Falha ao validar a sessão no D1.', error);
          return apiError(502, 'Não foi possível validar a sessão da conta.');
        }
      }

      const namespace = url.pathname === '/ws' ? env.MATCH_ROOM : env.MATCHMAKER;
      const objectId = url.pathname === '/ws'
        ? url.searchParams.get('roomId')
        : 'global-matchmaker';
      if (!objectId) return apiError(400, 'roomId é obrigatório para WebSocket.');
      return namespace.get(namespace.idFromName(objectId)).fetch(request);
    }

    return apiError(404, 'Rota da API não encontrada.');
  },
};

export { MatchmakerDurableObject, MatchRoomDurableObject };
