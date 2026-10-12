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

The React/Vite frontend is published with Workers Static Assets. Multiplayer matchmaking, turn submissions, room snapshots, WebSocket pushes, chat, emojis, surrender, disconnect timeouts, and online surrender history now run through Cloudflare Durable Objects with SQLite-backed room state. The coordinator Durable Object serializes matchmaking and each battle uses its own named room Durable Object.

Authentication, account sessions, profiles/progression, character/configuration administration, and account JSON persistence still use the Express/Render API. The Worker validates multiplayer HTTP sessions against that API, and room WebSocket joins revalidate there as well. This is an incremental migration: D1 has not replaced account storage, and battle damage, victory, and rewards are not server-authoritative yet. The room API deliberately rejects `/api/match/finish` rather than accepting a client-provided win/loss result; until combat is authoritative, normal battle result history/rewards remain incomplete on this beta.

### Run the Cloudflare frontend gateway locally

1. Run the existing backend on port 3000 in one terminal: `npm run dev`.
2. Copy `.dev.vars.example` to `.dev.vars`. This local-only file points the gateway to `http://localhost:3000`; do not commit it.
3. Build only the public Vite assets: `npm run build:cf`.
4. Start the local Workers runtime: `npm run cf:dev`.
5. Open `http://127.0.0.1:8788/`. Matchmaking and room APIs use local Durable Objects; account and configuration APIs continue to use the configured legacy origin. `.dev.vars.example` shows the local backend setting.

The Cloudflare asset directory is `dist/client`, intentionally separate from the legacy Node bundle at `dist/server.cjs` so the server bundle and source map are not published as static assets.

### Beta on Cloudflare (incremental cutover)

The beta Worker is served at `https://naruto-infinity-beta.robertosouzasouza999.workers.dev` and does not replace the Vercel domain. Matchmaking and room state are stored in the Worker account's Durable Objects; accounts, profiles and game configuration still share production Render data. This beta can create real online rooms, so coordinate testing with the existing player population.

After `npx wrangler login`, `npm run cf:deploy` builds and publishes the Worker. It does not change DNS. Wrangler migrations create SQLite-backed Durable Object namespaces for the matchmaker coordinator and individual rooms. Rollback to the prior frontend Worker version is possible, but matches created by the Durable Objects are not visible to Render; do not switch an active match between the beta and the old Vercel game.

### Data and service cutover gates

The remaining JSON persistence set includes users/progress, characters and game configuration, cards/packs, and account sessions. A D1 migration needs a consistent export, immutable verified backup, field-level validation, idempotent import, before/after counts, and a tested rollback. The current account file uses legacy password storage, and Google sign-in identity is currently accepted through the existing API contract; authentication needs a compatibility plan before accounts can move to D1. Durable room state currently stores submitted actions and client state reports, not server-calculated damage. The combat engine must be completed before authoritative outcomes or rewards can move.

R2 is not configured: existing game images are served from the repository's static assets or external image URLs, and no evidence currently requires object storage.
