const CACHE_VERSION = '__WHOOSH_ASSET_VERSION__';
const IMAGE_CACHE = `whoosh-img-${CACHE_VERSION}`;
const APP_CACHE = `whoosh-app-${CACHE_VERSION}`;

const IMAGE_PATTERNS = [
  /\/static\/img\//,
  /\/static\/audio\//,
  /raw\.githubusercontent\.com\/naruto-unison\//,
];
const PRELOAD_IMAGE_HOSTS = new Set([
  'i.ibb.co',
  'i.imgur.com',
  'i.pinimg.com',
  'images.unsplash.com',
  'raw.githubusercontent.com',
  'static.wikia.nocookie.net',
  'w0.peakpx.com',
  'wallpapercat.com',
]);

function isImageRequest(request, url) {
  return IMAGE_PATTERNS.some((pattern) => pattern.test(url.href)) ||
    request.destination === 'image' ||
    (request.headers.get('accept') || '').includes('image/');
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('whoosh-') && !k.endsWith(`-${CACHE_VERSION}`))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_GAME_ASSETS') return;

  const port = event.ports[0];
  if (!port) return;

  event.waitUntil((async () => {
    const assets = Array.isArray(event.data.assets) ? event.data.assets : [];
    if (assets.length > 5000) {
      port.postMessage({ type: 'error', message: 'A lista de arquivos do jogo é inválida.' });
      return;
    }

    const cache = await caches.open(IMAGE_CACHE);
    const failures = [];
    const totalBytes = assets.reduce((sum, asset) => sum + (Number(asset.size) || 0), 0);
    let nextIndex = 0;
    let completed = 0;
    let processedBytes = 0;

    const reportProgress = () => {
      port.postMessage({
        type: 'progress',
        completed,
        total: assets.length,
        processedBytes,
        totalBytes,
      });
    };

    const cacheAsset = async (asset) => {
      if (!asset || typeof asset.url !== 'string' ||
          (!/^\/static\/(?:img|audio)\//.test(asset.url) &&
            !(urlIsApprovedImageHost(asset.url)))) {
        failures.push(asset?.url || '');
      } else {
        const url = new URL(asset.url, self.location.origin);
        try {
          const cached = await cache.match(url.href, { ignoreVary: true });
          if (!cached) {
            const response = await fetch(url.href, {
              mode: url.origin === self.location.origin ? 'same-origin' : 'no-cors',
            });
            if (!response.ok && response.type !== 'opaque') {
              throw new Error(`Asset download failed: ${response.status}`);
            }
            await cache.put(url.href, response);
          }
        } catch (error) {
          failures.push(asset.url);
          console.error('Failed to cache game asset:', asset.url, error);
        }
      }

      completed += 1;
      processedBytes += Number(asset?.size) || 0;
      if (completed % 10 === 0 || completed === assets.length) reportProgress();
    };

    const workers = Array.from({ length: Math.min(6, assets.length) }, async () => {
      while (nextIndex < assets.length) {
        const index = nextIndex++;
        await cacheAsset(assets[index]);
      }
    });

    await Promise.all(workers);
    port.postMessage({ type: 'complete', failures });
  })().catch((error) => {
    console.error('Failed to prepare game assets:', error);
    port.postMessage({
      type: 'error',
      message: 'O armazenamento do navegador não permitiu preparar os arquivos do jogo.',
    });
  }));
});

function urlIsApprovedImageHost(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && PRELOAD_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const isImage = isImageRequest(req, url) && !url.searchParams.has('bust');

  if (isImage && !req.headers.has('range')) {
    event.respondWith(
      caches.match(req, { ignoreVary: true }).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            if (res && (res.ok || res.type === 'opaque')) {
              const clone = res.clone();
              caches
                .open(IMAGE_CACHE)
                .then((c) => c.put(req, clone))
                .catch(() => {});
            }
            return res;
          })
          .catch(() => cached || Response.error());
      })
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && req.mode === 'same-origin') {
          const clone = res.clone();
          caches
            .open(APP_CACHE)
            .then((c) => c.put(req, clone))
            .catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || Response.error()))
  );
});
