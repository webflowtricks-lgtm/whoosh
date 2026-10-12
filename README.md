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

The combat engine is still not server-authoritative. The Durable Object continues to reject `/api/match/finish` rather than accepting a client-provided winner, and the server cannot safely award normal battle rewards yet. The beta is not a complete backend retirement. Keep Render available for rollback and for the old deployment until the Vercel API cutover is verified.

### Run the Cloudflare frontend gateway locally

1. Apply the D1 migration and populate a local D1 database with the project migration workflow.
2. Copy `.dev.vars.example` to `.dev.vars` if local secrets or variables are needed; there is no legacy service URL.
3. Build only the public Vite assets: `npm run build:cf`.
4. Start the local Workers runtime: `npm run cf:dev`.
5. Open `http://127.0.0.1:8788/`. The local Worker requires local D1 data for account and configuration APIs; it does not proxy requests to Render.

The Cloudflare asset directory is `dist/client`, intentionally separate from the legacy Node bundle at `dist/server.cjs` so the server bundle and source map are not published as static assets.

### Beta on Cloudflare (incremental cutover)

The beta Worker is served at `https://naruto-infinity-beta.robertosouzasouza999.workers.dev` and does not replace the Vercel domain. Matchmaking and room state are stored in Durable Objects; accounts, profiles, and game configuration are served from D1. The repository's Vercel API rewrite and production WebSocket URL now point directly to the Cloudflare Worker. Deploying the Vercel project is a separate step from deploying this Worker. This beta can create real online rooms, so coordinate testing with the existing player population.

After `npx wrangler login`, `npm run cf:deploy` builds and publishes the Worker. It does not change DNS. Wrangler migrations create SQLite-backed Durable Object namespaces for the matchmaker coordinator and individual rooms. Rollback to the prior frontend Worker version is possible, but matches created by the Durable Objects are not visible to Render; do not switch an active match between the beta and the old Vercel game.

### Data and service cutover gates

`migrations/d1/0001_accounts_and_config.sql` provisions D1 account/session/config/history tables. Configuration items are chunked into bounded SQLite rows because the live character catalog contains individual records larger than 2 MB. Passwords from the legacy JSON source are rehashed with PBKDF2-SHA256; plaintext is not sent to D1. Google accounts are linked by Firebase UID and login verifies Firebase ID-token signatures against Google's published JWKs.

Review the checked-in source summary first with `npm run migrate:d1:preview`. Run a disposable local end-to-end data import with `npm run migrate:d1:local`. For a complete live snapshot, deploy the guarded `/api/migration/export` endpoint on Render and set a high-entropy `DATA_MIGRATION_TOKEN` secret there and in the local shell (never commit or print it). Then run the protected export import:

```powershell
node scripts/migrate-json-to-d1.mjs --apply --migration-export-url https://naruto-3loc.onrender.com/api/migration/export
```

The endpoint is disabled (404) until that secret exists, compares tokens in constant time, refuses export while legacy rooms are active, returns `Cache-Control: no-store`, and does not modify the JSON files. The completed live import reported 6 accounts, 216 characters, 17 quests, 12 shop items, 3 events, 15 ranks, 3 banners, 3 frames, 195 cards, and 0 card packs, with no active legacy rooms. All 9 configuration sets and all 6 profiles were compared against the live Render API and matched. Render exported no online battle history; the 32 history rows already present in D1 were preserved. D1 backups from before and after the import are kept under `%LOCALAPPDATA%\NarutoInfinity\d1-backups`. The migration token was removed from Render after the import; to repeat the export, re-enable it temporarily and remove it again afterward. Legacy session tokens were not transferred; players establish fresh D1 sessions when they sign in. The old Render JSON files were not modified.

The existing Render backend is not deleted. All accounts present in the live export are in D1, but legacy sessions were not transferred, so players may need to sign in again. The Vercel domain remains on Vercel; only its API and WebSocket destinations are being cut over. Keep Render available for rollback until the Vercel deployment and beta flows are verified.

Online sessions across the old Vercel origin and the beta Worker are independent. Active Durable Object rooms are not copied from the old Express process; the migration tool aborts if its room snapshot is nonempty. The 32 D1 history rows are retained, but none matched the 6 usernames in the current Render account export, so their ownership still needs investigation before any cleanup. Durable room state still stores submitted actions and client state reports, not server-calculated damage. Complete and validate the combat engine before authoritative outcomes or rewards can move.

R2 is not configured: existing game images are served from the repository's static assets or external image URLs, and no evidence currently requires object storage.
