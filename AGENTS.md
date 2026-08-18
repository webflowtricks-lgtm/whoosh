# AGENTS.md

## Project Overview
Whoosh (Naruto Unison Combat) — tactical Naruto-style combat game.
React 19 + Vite 6 + Tailwind 4 + Express. All UI text is Portuguese (PT-BR).

## Commands
- `npm run dev` — `tsx server.ts` (Express + Vite middleware, port **3000**)
- `npm run build` — vite build + esbuild server → `dist/server.cjs`
- `npm run start` — `node dist/server.cjs` (production)
- `npm run lint` — `tsc --noEmit`
- Deploy: `vercel.json` rewrites `/api/*` to `https://naruto-3loc.onrender.com/api`

## Architecture
- **Backend**: single-file Express API (`server.ts`), persistence via JSON files in `src/data/` using `readJSON`/`writeJSON` helpers.
- **Storage pattern (client)**: libs in `src/lib/` cache to localStorage + sync to server (fetch + POST). e.g. `characterStorage.ts`, `rankStorage.ts`, `shopStorage.ts`, `eventStorage.ts`, `bannerStorage.ts`, `frameStorage.ts`.
- **API fetch helper**: `safeFetchJson` in `src/lib/api.ts` (returns null on failure).

## Backend API Endpoints (server.ts)
- Auth: `POST /api/auth/register`, `/api/auth/login`, `/api/auth/google`
- Profile: `PUT /api/user/profile`
- Multiplayer (in-memory, HTTP polling): `/api/matchmaking/join`, `/api/matchmaking/status`, `/api/matchmaking/quit`, `/api/match/submit-turn`, `/api/match/room-state`, `/api/match/surrender`, `/api/match/emoji`, `/api/match/emojis`, `/api/match/chat/send`, `/api/match/chat/messages`
- Config CRUD: `/api/characters`, `/api/ranks`, `/api/shop`, `/api/events`, `/api/banners`, `/api/frames`, `/api/quests` (GET default-seeds + POST overwrite)
- Backup: `/api/config/export`, `/api/config/import`
- Health: `/api/health`

## Frontend
- `src/App.tsx` orchestrates screens: `main-menu` → `quests` → `character-select` → `battle`, plus `admin`. Also handles reconnection modal (`active_match_save` in localStorage) and battle-end XP/quest sync.
- Key components (`src/components/`):
  - `BattleBoard.tsx` — battle engine (very large; handles online polling, chakra trade, emojis/chat, game over overlay)
  - `AdminDashboard.tsx` (~5700 lines) — tabs: ninjas / quests / shop / events / ranks / backup; CRUD editors for everything
  - `CharacterSelect.tsx`, `QuestBoard.tsx`, `MainMenu.tsx`, `AuthScreen.tsx`
  - Modals: `ProfileModal`, `ProfileCardModal`, `ShopModal`, `EventsModal`
  - Admins: `QuestAdmin`, `ShopAdmin`, `EventAdmin`
  - `LanguageSelector`, `RotateOverlay`, `ErrorBoundary`
- Types in `src/types.ts` (Character, Skill, Quest, UserProfile, etc.)
- i18n: `src/lib/i18n.tsx` — `t('pt', 'en')` for UI, `translateGameText` for PT game strings (exact-match dictionary).
- XP: `src/lib/xpSystem.ts`; quest goal eval: `src/lib/questUtils.ts`.
- Image preloading: `src/lib/imagePreloader.ts` (`preloadCharacters`, `preloadCommonUI`).

## Data Files (src/data/)
- `characters.ts` — default characters (large)
- `custom_characters.json` — server-side override (server falls back to defaults)
- `users.json`, `quests.json`, `ranks.json`, `shop.json`, `events.json`, `banners.json`, `frames.json`
- Character images: `public/static/img/ninja/<slug>/` (icon.jpg + skill images)

## Conventions & Notes
- UI text is PT-BR; use `t()` for UI strings needing EN support.
- Language: `'pt' | 'en'`, persisted in localStorage key `ninja_app_language`.
- User profile persisted in localStorage key `naruto_user_profile`.
- Characters cache: localStorage key `naruto_combat_characters`.
- Do NOT commit secrets; `.env` has `GEMINI_API_KEY` / `APP_URL` (leave as-is).
- BattleBoard sanitizes chat server-side (no emojis/html/urls/media).
- Vite ignores `**/src/data/**` for HMR (data served via API).

## ANBU Kakashi — Raikiri Stack Mechanic (Custom Implementation)
**Location**: `src/components/BattleBoard.tsx` lines ~3995–4110 + `src/data/custom_characters.json` (ANBU Kakashi)

**How it works**:
- **Lightning Blade** (`stackable: false`, `stackType: "Raikiri"`) — manually generates/increments Raikiri stacks on self instead of creating its own stack.
- Raikiri stacks: `stackDuration: 1` (expires end of turn if not refreshed).
- Each use of **Lightning Blade** increments stack count (1x → 2x → 3x→ ...).
- When stacks reach 2+, finisher rules trigger (stun + chakra removal).
- **Earth Release: Mud Wall** / **Implanted Sharingan** preserve the stack for 1 more turn (freezes duration decrement during that turn).
- Stack only expires naturally if neither Raikiri nor Lightning Blade is used that turn.

**Key code sections**:
- Stack creation/increment: line ~4010 (checks `sourceSkillName === 'Raikiri'`)
- Finisher trigger: line ~4033+ (applies stun/chakra removal from `stackUseEffectRules`)
- Stack preservation: line ~4095+ (for preserve skills)

