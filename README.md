<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/8522cf8c-35ea-4988-a803-d48e12ccc968

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Cloudflare migration status

The repository currently uses an Express/Node backend and JSON-file persistence. The Cloudflare target is **not yet a full backend migration**. The first reversible deployment unit is a Workers Static Assets frontend with an edge gateway that forwards `/api/*` and `/ws` to the existing backend, preserving the current API and WebSocket behavior while the backend is migrated separately.

### Run the Cloudflare frontend gateway locally

1. Run the existing backend on port 3000 in one terminal: `npm run dev`.
2. Copy `.dev.vars.example` to `.dev.vars`. This local-only file points the gateway to `http://localhost:3000`; do not commit it.
3. Build only the public Vite assets: `npm run build:cf`.
4. Start the local Workers runtime: `npm run cf:dev`.
5. Open `http://127.0.0.1:8788/`. API and WebSocket paths are forwarded to the configured legacy origin. Without a valid `LEGACY_API_ORIGIN`, API requests fail explicitly with HTTP 503; failed upstream requests return 502.

The Cloudflare asset directory is `dist/client`, intentionally separate from the legacy Node bundle at `dist/server.cjs` so the server bundle and source map are not published as static assets.

### Beta on Cloudflare (shared production backend)

The beta Worker is separate from the Vercel domain and is served on its `workers.dev` address. It uses the existing Render backend (`https://narutoarena.onrender.com`) for `/api/*` and `/ws`; therefore beta users share production accounts, progress, matchmaking, battles, and data. This is a frontend/edge beta, not the Cloudflare backend migration. It has no D1 or Durable Object bindings.

To deploy after authenticating Wrangler with `npx wrangler login`, run `npm run cf:deploy`. This publishes the Worker named `naruto-infinity-beta`; it does not change DNS or replace Vercel. Verify the deployed URL, sign-in, profile loading, matchmaking and battle WebSocket behavior before inviting players. Rollback is to disable/delete this beta Worker; the existing Vercel/Render route remains unchanged. Avoid load tests or test accounts that could affect real players or production data.

### Data and service cutover gates

The JSON persistence set includes users/progress, characters and game configuration, cards/packs, account sessions, active match rooms, and online battle history. A production migration needs a consistent export, immutable verified backup, field-level validation, idempotent import, before/after counts, and a tested rollback. The current account file uses legacy password storage, and Google sign-in identity is currently accepted through the existing API contract; authentication must be hardened and compatibility-tested before accounts can move to D1. Match rooms cannot move to Durable Objects as authoritative state until the full combat engine and disconnect/reconnect/reward lifecycle are ported and differential-tested.

R2 is not configured: existing game images are served from the repository's static assets or external image URLs, and no evidence currently requires object storage.
