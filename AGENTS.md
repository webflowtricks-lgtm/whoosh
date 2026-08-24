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
- **Before building any new feature/option, check if it already exists** (grep the codebase for related flags/fields). If it does, STOP and tell the user it already exists (name + location) instead of duplicating it. Ex.: `removedOnTargetSkillUse` already removes an effect when the affected target uses any skill (AdminDashboard "🧹 Removida do alvo quando ele usar uma habilidade", engine at BattleBoard `executeSideActions` ~line 7247).
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

## Configurable Rules (Admin skill editor)
Both rules are configured per-skill in `AdminDashboard.tsx` and evaluated in the battle engine (`BattleBoard.tsx`, inside `executeSideActions`, the real execution pipeline; `executeTurnSimulation` is dead code — do NOT add logic there).

- **🌳 Prisão de Madeira (Wood Spire Prison)** — `skill.prisonRule` (types.ts `SkillPrisonRule`): ally gets cleanse (`cleanseAlly`), cooldown reset (`resetCooldownsAlly`), and `damage_reduction` with `excludeAffliction: true` (`allyReduction`); enemy gets `damage_debuff` with `debuffTypes: ['skill']` + `excludeClasses: ['mental']` (`enemyReduction`) and a `WoodSpirePunish` custom effect (`punishmentDamage`) that deals damage per turn when no offensive skill is used (`usedOffensiveThisTurnRef`). `geyserBoost` raises the values when the target has a Geyser Spring stack; `duration` default 2. ANBU Kinoe's hardcoded rule falls back to defaults (15/25/15/2) when `prisonRule` is absent.
- **🔁 Skill em Mim com Stack (selfCastStackRules)** — `skill.selfCastStackRules` (types.ts `SkillSelfCastStackRule`): if the caster has X stacks (`stackType`/`requiredStacks`, same matching semantics as `stackUseEffectRules`), one of the caster's OWN skills (`skillName`, autocomplete in editor) is applied to the caster via an inline mini-executor (damage w/ shield absorption, heal, shield, damage_buff, damage_reduction, dot/bleeding/affliction, cleanse, instant/continuous chakra, invisible, stun). `invisible: true` suppresses ALL logs and floating texts (silent mode).

**Key code sections** (BattleBoard.tsx, `executeSideActions`):
- Prison config block: ~line 4190 (generalized from the Kinoe-only rule)
- Self-cast block: after the ⚡ Combo por Stacks block (~line 6850)
- Punishment resolution in `executeTurnEndResolution` (~line 7274)

## ⏱️ Continuous Damage Timing Rule (ALL DoT types)
**Rule**: ALL continuous damage that stays on a target (`damage`, `direct_damage`, `dot`/queima, `bleeding`/sangramento, `affliction`/aflição, `life_steal`/roubo de vida) is applied when the **CASTER passes their turn** — NOT at end-of-round resolution and NOT when the target passes. Each effect ticks exactly once per round, at the moment its caster ends their turn (filter: `e.casterSide === (casterIsPlayer ? 'player' : 'enemy')`).

**Implementation** (`src/components/BattleBoard.tsx`):
- All ticking lives in `tickCasterContinuousDamage(casterIsPlayer)` (~line 9014), called from `handleEndTurn` right after `executeSideActions` for the side that just passed.
- Per-type semantics preserved inside the tick: `delayTurns` decrement (bleeding/affliction), `castTurn === turn` skip (affliction — instant cast damage already applied; life_steal filters `castTurn !== turn`), immunity checks (`hasDamageImmunity`, `consumeFirstHitOnlyImmunity`), invulnerability bypass (`isBlockedByInvuln`/`ignoreInvulnerable`), shield conversion (`convertDamageToShield`) and shield absorption (direct_damage/life_steal).
- The corresponding blocks in `applyTurnEndUpdates` (inside `executeTurnEndResolution`, ~line 8300) are DISABLED with comments — do NOT re-add ticking there (double-tick). Only Wood Spire punishment, heals-over-time, shield-per-turn and duration decrements remain in end-of-round resolution.
- `direct_damage` additionally applies its FIRST tick inline at skill use in `executeSideActions` (effect created with `duration - 1`, `castTurn = turn`; remaining ticks on later caster passes).
- The duplicated `applyTurnEndUpdates` inside `executeTurnSimulation` (~line 13288) is DEAD CODE — never edit it.

**Key code sections**:
- Caster tick (all 6 damage types): `tickCasterContinuousDamage` ~lines 9036–9230
- Disabled end-of-round blocks: `applyTurnEndUpdates` ~lines 8345–8350 (dot), ~8395–8400 (bleeding), ~8425–8432 (affliction + life_steal)
- Call site: `handleEndTurn` ~line 9320 (`tickCasterContinuousDamage(isCurrentPlayer)`)

## 🌀 Continuous Chakra Drain / Steal / Remove (drainChakra / stealChakra / removeChakra, duration 2+)
**Rule**: chakra drain/steal/remove with duration ≥ 2 does an **immediate 1st tick when the skill is used** on the enemy (counts as turn 1), then continues ticking **once per round** in end-of-round resolution for the remaining turns.

**Implementation** (`src/components/BattleBoard.tsx`, `executeSideActions` — the DRAIN/REMOVE/STEAL CHAKRA blocks ~lines 5348–5460):
- On use: always call `performChakraAction(...)` for the immediate 1st tick, THEN (if `dur > 1`) push a `custom` effect named `Dreno de Chakra (…)` / `Roubo de Chakra (…)` / `Remoção de Chakra (…)` with `duration: dur - 1` and `castTurn: turn`.
- Remaining ticks resolve in `executeTurnEndResolution` → `applyTurnEndUpdates` (~line 9385). The filter requires `e.castTurn !== turn` so the effect does NOT tick again on the same round it was created (avoids double tick).
- **StrictMode-safe**: the end-of-round tick mutates LOCAL pools (`endRoundPlayerChakra` / `endRoundEnemyChakra`) and applies with `setPlayerChakra`/`setEnemyChakra` **once** after both `applyTurnEndUpdates` calls (guarded by `endRoundChakraChanged`). NEVER put the drain/steal math inside a `setState(prev => …)` updater — StrictMode runs it 2× and doubles the drain.
- Drain/Steal transfer to the thief pool ONLY what was actually removed from the victim (no phantom random chakra). If the victim has no chakra that turn, nothing happens — no "-0" log/floating.
- **Invulnerability interaction**: the end-of-round chakra tick is skipped when the victim is invulnerable (`isBlockedByInvuln(effect, 'chakra')`), UNLESS the source skill has `ignoreInvulnerable` OR the victim has the `cannot_be_invulnerable` debuff (Incapaz de Ficar Invulnerável) — in which case `checkCombatantInvulnerable` returns false and the drain/steal proceeds. Same principle as continuous damage.

## 🛡️ Invulnerability vs Continuous Effects (general rule)
When a target the player hit with a multi-turn skill becomes invulnerable on its own turn, the caster's continuous effects that would tick against it are **blocked while it stays invulnerable**:
- **Normal continuous damage** (`damage`) and **chakra drain/steal/remove** are blocked by invulnerability (via `isBlockedByInvuln`).
- Exceptions that STILL apply through invulnerability: the source skill has `ignoreInvulnerable`, a conditional bypass (`hasConditionalInvulnBypass`), or the target carries `cannot_be_invulnerable` (Incapaz de Ficar Invulnerável, which forces `checkCombatantInvulnerable` → false and `hasTotalInvulnerability` → false).
- The instant 1st tick (applied at skill use, before the enemy's invuln turn) always lands normally.

## 🌐 ONLINE Turn Passing — Single-Resolver Architecture (WORKING, do not regress)
**Status**: fixed & confirmed working by the user (build marker `🧪 BUILD v7-single-resolver`). All rules below exist to prevent re-introducing the "skill usada mas turno não passa" / "cada jogador joga 2x" bugs.

**Core rule — ONE resolver only**:
- Clicking "Finalizar Turno" online does ONLY: `submit-turn` to server + `setActivePlanner('enemy')` + `setIsWaitingForOpponent(true)` + wait log. It NEVER resolves the round inside the click handler (no instant-resolve, no confirmation fetch in `handleEndTurn`). If chakra/sound fires immediately on Finalizar click, an old regression snuck back.
- The **1s room-state poll** is the ONLY round resolver. Fast-path at top of poll block: if `submittedTurnRef.has(turn) && !resolvedTurnRef.has(turn) && currentTurnActions[oppOnlineIndex] != null` → execute opponent actions once (guarded by `processedOpponentTurnsRef`) → `resolveOnlineRoundOnce()`. The legacy poll branch below it only hands MY phase over when I haven't submitted yet.

**Fixed initiative draw, alternating leader**:
- The DRAW happens ONCE when the match is found: mount effect computes `startingPlanner` (online = seed-derived `iGoFirstOnTurn(1)`; offline = single Math.random()) and stores it in `matchStarterRef` (persisted as `matchStarter` in `active_match_save`, restored on reconnect).
- EVERY round resolution ALTERNATES deterministically from that draw: `leader = ((startSlot + turn - 1) % 2) === 0 ? 'player' : 'enemy'`. NO per-round Math.random (desyncs clients) and NO permanently-fixed leader (same player would act 2x between opponent actions — user-reported bug).
- Round log message is `🔄 Turno X — VOCÊ/OPONENTE planeja primeiro.` — the `🎲 [INICIATIVA] ... sorteio` message must appear ONLY for Turn 1.

**Chakra drain/steal/remove double-tick guard**: end-of-round tick block marks `(e as any).lastChakraTickTurn = turn` and filters it out — an effect can never tick twice in the same round even when created late (watchdog/catch-up path).

**Guards / safety nets (keep all of them)**:
- `resolvedTurnRef` + `forcedResolveTurnsRef`: resolve/force-resolve max once per turn.
- **🛡️ SERVER-CONFIRMED SUBMIT (v8)**: `submittedTurnRef` is marked ONLY when the server accepts `submit-turn` (in `submitWithRetry` r.ok, or `trySubmitPending` r.ok). NEVER mark it optimistically at click time. The 20s force-resolve watchdog requires BOTH `submittedTurnRef.has(turn)` AND fresh `lastServerConfirmRef` (server room-state/heartbeat saw my slot registered, <30s old) — otherwise it must NOT resolve, or rounds get resolved without the opponent during Render cold starts ("gerou chakra e o turno não passou" bug).
- Circuit breaker in `executeTurnEndResolution`: blocks any resolution <1500ms after the previous one (`lastResolutionAtRef`) — chained resolutions = pathological loop (played StartTurn sound endlessly).
- Online watchdogs while waiting: heartbeat `⏳ Aguardando há Xs — servidor diz: meu turno ✔/✖ | oponente ✔/✖` every ~10s; force-resolve after 20s if submitted; unlock planning phase after 30s + 15 consecutive poll failures.
- Per-click guard `finalizedKeysRef` (key `${turn}:${side}`); refs cleared at battle start only.

**Diagnostics overlay (temporary but keep until fully stable)**:
- `logs` state was NEVER rendered before — added fixed bottom-left panel "🧪 Log v7" (BattleBoard JSX end) showing last 7 logs incl. build marker line `🧪 BUILD v7-single-resolver` as first initial log. Bump this marker whenever touching turn flow again.

**Server side**: rooms persist to `src/data/match_rooms.json` (debounced `markRoomsDirty`, restore-on-boot); `/api/health` reports version. Render free tier cold-start tolerances are baked into the 20-failure room-lost threshold.

