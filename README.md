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

The React/Vite frontend is published with Workers Static Assets. Multiplayer matchmaking, rooms, and WebSockets run through SQLite-backed Durable Objects. D1 contains account/profile/session tables, game configuration collections, and archived online-battle history. Worker routes support registration/login, exclusive sessions, profile CRUD, configuration CRUD/import/export, and Firebase ID-token verification. A live Render snapshot has been imported and checked: all 6 exported accounts and all 9 configuration sets match the beta. The Cloudflare Worker no longer falls back to Render; a missing account or configuration fails closed.

The deployed Worker has an **experimental, partial** authoritative PvP path: the room Durable Object initializes and persists canonical combat state, resolves supported submitted actions, derives knockout/surrender/disconnect outcomes, and rejects client HP/chakra reports and client-provided winners. D1 awards online XP and wins/losses from server state through the idempotent ledger in `migrations/d1/0002_online_battle_rewards.sql`. The battle resolver has not yet been verified in a live match.

This is not yet a complete combat migration. `src/lib/combatEngine.ts` deliberately supports only a subset of skills and effects. Battle-start stack markers (including Young Karin's Young Sight, Yuhi Kurenai's Genjutsu Mastery, and Uchiha-tag stacks used by Fugaku's team) are initialized and grow on successful skill use, but this does not implement every effect of their skills/passives; unsupported submitted mechanics are still rejected with HTTP 422. D1 also rejects client-owned profile progression, so offline-battle progression is not persisted through the Cloudflare profile API yet. The admin tab "Batalha contra IA" configures the 1-based roster cutoff used when randomly building the AI enemy team; the setting is stored in D1 and defaults to position 69. Keep Render available; do not treat this work as a completed backend retirement.

### Run the Cloudflare frontend gateway locally

1. Apply the D1 migration and populate a local D1 database with the project migration workflow.
2. Copy `.dev.vars.example` to `.dev.vars` if local secrets or variables are needed; there is no legacy service URL.
3. Build only the public Vite assets: `npm run build:cf`.
4. Start the local Workers runtime: `npm run cf:dev`.
5. Open `http://127.0.0.1:8788/`. The local Worker requires local D1 data for account and configuration APIs; it does not proxy requests to Render.

The Cloudflare asset directory is `dist/client`, intentionally separate from the legacy Node bundle at `dist/server.cjs` so the server bundle and source map are not published as static assets.

### Production on Cloudflare

The production Worker is served at `https://whoosh.robertosouzasouza999.workers.dev`. Matchmaking and room state are stored in Durable Objects; accounts, profiles, and game configuration are served from D1. The Vercel API rewrite and production WebSocket URL point directly to this Worker. Its D1 database is still named `naruto-infinity-beta` and uses the ID in `wrangler.jsonc`; the database name is not the Worker hostname. Deploying the Vercel project is separate from deploying this Worker.

Before publishing code that adds a D1 migration, apply it to the production database with `npx wrangler d1 migrations apply naruto-infinity-beta --remote`; the D1 database keeps that name even though its Worker is `whoosh`. After `npx wrangler login`, `npm run cf:deploy` builds and publishes the Worker. It does not change DNS. Wrangler migrations create SQLite-backed Durable Object namespaces for the matchmaker coordinator and individual rooms. Rollback to the prior Worker version is possible, but matches created by the Durable Objects are not visible to the legacy backend; do not switch an active match between them.

### Data and service cutover gates

`migrations/d1/0001_accounts_and_config.sql` provisions D1 account/session/config/history tables. Configuration items are chunked into bounded SQLite rows because the live character catalog contains individual records larger than 2 MB. Passwords from the legacy JSON source are rehashed with PBKDF2-SHA256; plaintext is not sent to D1. Google accounts are linked by Firebase UID and login verifies Firebase ID-token signatures against Google's published JWKs.

Review the checked-in source summary first with `npm run migrate:d1:preview`. Run a disposable local end-to-end data import with `npm run migrate:d1:local`. For a complete live snapshot, deploy the guarded `/api/migration/export` endpoint on Render and set a high-entropy `DATA_MIGRATION_TOKEN` secret there and in the local shell (never commit or print it). Then run the protected export import:

```powershell
node scripts/migrate-json-to-d1.mjs --apply --migration-export-url https://naruto-3loc.onrender.com/api/migration/export
```

The endpoint is disabled (404) until that secret exists, compares tokens in constant time, refuses export while legacy rooms are active, returns `Cache-Control: no-store`, and does not modify the JSON files. The completed live import reported 6 accounts, 216 characters, 17 quests, 12 shop items, 3 events, 15 ranks, 3 banners, 3 frames, 195 cards, and 0 card packs, with no active legacy rooms. All 9 configuration sets and all 6 profiles were compared against the live Render API and matched. Render exported no online battle history; the 32 history rows already present in D1 were preserved. D1 backups from before and after the import are kept under `%LOCALAPPDATA%\NarutoInfinity\d1-backups`. The migration token was removed from Render after the import; to repeat the export, re-enable it temporarily and remove it again afterward. Legacy session tokens were not transferred; players establish fresh D1 sessions when they sign in. The old Render JSON files were not modified.

The existing Render backend is not deleted. All accounts present in the live export are in D1, but legacy sessions were not transferred, so players may need to sign in again. The Vercel domain remains on Vercel; its API and WebSocket destinations point to the production Worker. Keep the legacy backend available for rollback until the Vercel deployment and production flows are verified.

Online sessions across the old Vercel origin and the `whoosh` Worker are independent. Active Durable Object rooms are not copied from the old Express process; the migration tool aborts if its room snapshot is nonempty. The 32 D1 history rows are retained, but none matched the 6 usernames in the current Render account export, so their ownership still needs investigation before any cleanup. The current working tree no longer accepts client state reports as combat truth; however, authoritative resolution is limited to the pilot's supported mechanics and still needs full parity and end-to-end testing before deployment.

R2 is not configured: existing game images are served from the repository's static assets or external image URLs, and no evidence currently requires object storage.
