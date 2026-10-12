interface WorkerAssets {
  fetch(request: Request): Promise<Response>;
}

interface WorkerEnv {
  ASSETS: WorkerAssets;
  LEGACY_API_ORIGIN?: string;
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

    const upstreamUrl = new URL(url.pathname + url.search, origin);
    try {
      return await fetch(new Request(upstreamUrl, request));
    } catch (error) {
      console.error('[edge-gateway] Falha ao encaminhar requisição ao backend legado.', error);
      return migrationError(502, 'O backend legado está temporariamente indisponível.');
    }
  },
};
