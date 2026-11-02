const CACHE_VERSION = '__WHOOSH_ASSET_VERSION__';
const IMAGE_CACHE = `whoosh-img-${CACHE_VERSION}`;
const APP_CACHE = `whoosh-app-${CACHE_VERSION}`;

const IMAGE_PATTERNS = [
  /\/static\/img\//,
  /\/static\/audio\//,
  /raw\.githubusercontent\.com\/naruto-unison\//,
];
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
