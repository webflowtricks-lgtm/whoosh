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

The React/Vite frontend is published with Workers Static Assets. Multiplayer matchmaking, rooms, and WebSockets run through SQLite-backed Durable Objects. D1 now contains the account/profile/session schema, game configuration collections, and archived online-battle history. Worker routes support registration/login, exclusive sessions, profile CRUD, configuration CRUD/import/export, and a secure Firebase ID-token verification path. The legacy Render API remains as a compatibility source for first-login account migration and configuration reads that have not yet been imported.

The combat engine is still not server-authoritative. The Durable Object continues to reject `/api/match/finish` rather than accepting a client-provided winner, and the server cannot safely award normal battle rewards yet. The beta is not a complete backend retirement and Render must not be deleted while the compatibility fallback is in use.

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

`migrations/d1/0001_accounts_and_config.sql` provisions D1 account/session/config/history tables. Configuration items are chunked into bounded SQLite rows because the live character catalog contains individual records larger than 2 MB. Passwords from the legacy JSON source are rehashed with PBKDF2-SHA256; plaintext is not sent to D1. Google accounts are linked by Firebase UID and login verifies Firebase ID-token signatures against Google's published JWKs.

Review the checked-in source summary first with `npm run migrate:d1:preview`. Run a disposable local end-to-end data import with `npm run migrate:d1:local`. For a complete live snapshot, deploy the guarded `/api/migration/export` endpoint on Render and set a high-entropy `DATA_MIGRATION_TOKEN` secret there and in the local shell (never commit or print it). Then run the protected export import:

```powershell
node scripts/migrate-json-to-d1.mjs --apply --migration-export-url https://naruto-3loc.onrender.com/api/migration/export
```

The endpoint is disabled (404) until that secret exists, compares tokens in constant time, refuses export while legacy rooms are active, returns `Cache-Control: no-store`, and does not modify the JSON files. The importer backs up D1 before and after the run under `%LOCALAPPDATA%\NarutoInfinity\d1-backups`, hashes passwords locally before sending SQL, verifies before/source/after counts, and uses idempotent `ON CONFLICT DO NOTHING` writes. It invalidates legacy session tokens at the beta origin so the first login can claim a clean D1 session. The old files remain untouched. The less-complete `--legacy-api-origin` mode only imports profiles/history for usernames in the checked-in snapshot and must not be treated as a full account export.

The existing Render backend is not deleted and remains the compatibility fallback for accounts absent from D1. Do not remove it until the protected live export has completed, all account/config/history counts are verified, and beta logins no longer use the fallback.

Historical user data is retained, but online sessions across the old Vercel origin and the beta Worker are temporarily independent during this cutover. Active Durable Object rooms are not copied from the old Express process; the migration tool aborts if its room snapshot is nonempty. The public live configuration counts were checked against the local source before implementation; the account count on Render cannot be independently enumerated through the existing API. Durable room state still stores submitted actions and client state reports, not server-calculated damage. Complete the combat engine before authoritative outcomes or rewards can move.

R2 is not configured: existing game images are served from the repository's static assets or external image URLs, and no evidence currently requires object storage.
