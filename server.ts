import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { CHARACTERS as DEFAULT_CHARACTERS } from "./src/data/characters";

const USERS_FILE = path.join(process.cwd(), "src", "data", "users.json");
const CHARACTERS_FILE = path.join(process.cwd(), "src", "data", "custom_characters.json");

const QUESTS_FILE = path.join(process.cwd(), "src", "data", "quests.json");
const RANKS_FILE = path.join(process.cwd(), "src", "data", "ranks.json");
const SHOP_FILE = path.join(process.cwd(), "src", "data", "shop.json");
const EVENTS_FILE = path.join(process.cwd(), "src", "data", "events.json");
const BANNERS_FILE = path.join(process.cwd(), "src", "data", "banners.json");
const FRAMES_FILE = path.join(process.cwd(), "src", "data", "frames.json");
const MATCH_ROOMS_FILE = path.join(process.cwd(), "src", "data", "match_rooms.json");

// Ensure data directory exists
const dataDir = path.dirname(USERS_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Helpers to read/write JSON files
function readJSON<T>(filePath: string, defaultValue: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as T;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return defaultValue;
  }
}

function writeJSON<T>(filePath: string, data: T): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", version: "match-persistence-v2", rooms: Object.keys(activeRooms).length });
  });

  // User auth api
  app.post("/api/auth/register", (req, res) => {
    const { username, password, name, photoUrl } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: "Nome de usuário, senha e nome de exibição são obrigatórios." });
    }

    const cleanUsername = username.trim().toLowerCase();
    const users = readJSON<any[]>(USERS_FILE, []);

    const exists = users.find((u) => u.username === cleanUsername);
    if (exists) {
      return res.status(400).json({ error: "Este nome de usuário já está sendo utilizado." });
    }

    const newUser = {
      username: cleanUsername,
      password: password, // Simple plain password as requested
      name: name.trim(),
      photoUrl: photoUrl || "https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg",
    };

    users.push(newUser);
    writeJSON(USERS_FILE, users);

    res.json({ success: true, user: { username: newUser.username, name: newUser.name, photoUrl: newUser.photoUrl } });
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Usuário e senha são obrigatórios." });
    }

    const cleanUsername = username.trim().toLowerCase();
    const users = readJSON<any[]>(USERS_FILE, []);

    const user = users.find((u) => u.username === cleanUsername && u.password === password);
    if (!user) {
      return res.status(400).json({ error: "Usuário ou senha incorretos." });
    }

    res.json({ success: true, user: { username: user.username, name: user.name, photoUrl: user.photoUrl } });
  });

  app.post("/api/auth/google", (req, res) => {
    const { googleId, email, name, photoUrl } = req.body;
    if (!googleId && !email) {
      return res.status(400).json({ error: "Dados do Google inválidos." });
    }

    const users = readJSON<any[]>(USERS_FILE, []);
    let rawUsername = email ? email.split("@")[0] : `google_${googleId}`;
    let cleanUsername = rawUsername.toLowerCase().replace(/[^a-z0-9_]/g, "_");

    let user = users.find((u) => u.googleId === googleId || u.username === cleanUsername || (email && u.email === email));

    if (!user) {
      user = {
        username: cleanUsername,
        password: "",
        googleId: googleId,
        email: email,
        name: name || cleanUsername,
        photoUrl: photoUrl || "https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg",
      };
      users.push(user);
      writeJSON(USERS_FILE, users);
    } else {
      if (name) user.name = name;
      if (photoUrl) user.photoUrl = photoUrl;
      if (googleId) user.googleId = googleId;
      if (email) user.email = email;
      writeJSON(USERS_FILE, users);
    }

    res.json({ success: true, user });
  });

  app.put("/api/user/profile", (req, res) => {
    const { username, name, photoUrl, xp, rank, wins, losses, ryos, gems, title, equippedFrame, equippedFrameUrl, equippedBannerUrl } = req.body;
    if (!username) {
      return res.status(400).json({ error: "Nome de usuário é obrigatório." });
    }

    const cleanUsername = username.trim().toLowerCase();
    const users = readJSON<any[]>(USERS_FILE, []);

    const userIdx = users.findIndex((u) => u.username === cleanUsername);
    if (userIdx === -1) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    if (name) users[userIdx].name = name.trim();
    if (photoUrl) users[userIdx].photoUrl = photoUrl;
    if (typeof xp === 'number') users[userIdx].xp = Math.max(0, xp);
    if (rank) users[userIdx].rank = rank;
    if (typeof wins === 'number') users[userIdx].wins = wins;
    if (typeof losses === 'number') users[userIdx].losses = losses;
    if (typeof ryos === 'number') users[userIdx].ryos = ryos;
    if (typeof gems === 'number') users[userIdx].gems = gems;
    if (title) users[userIdx].title = title;
    if (equippedFrame) users[userIdx].equippedFrame = equippedFrame;
    if (equippedFrameUrl !== undefined) users[userIdx].equippedFrameUrl = equippedFrameUrl;
    if (equippedBannerUrl !== undefined) users[userIdx].equippedBannerUrl = equippedBannerUrl;

    writeJSON(USERS_FILE, users);

    res.json({ success: true, user: users[userIdx] });
  });

  // ==========================================
  // MATCHMAKING AND MULTIPLAYER GAME SYSTEM (1v1)
  // ==========================================
  // Rebuild (clean): the server is the single source of truth for turn
  // initiative via a per-room random `seed`. Both clients derive whose turn
  // it is each round from the SAME deterministic PRNG, so they can never
  // disagree (this eliminates the old "turno não passa" / "finalizar 2x" /
  // "ambos aguardando" race that came from each client computing initiative
  // independently). Turn actions are stored per player-slot [0,1]; a round
  // resolves locally on each client once both slots for that turn are filled.

  interface PlayerSlot {
    username: string;   // lowercase, unique id
    name: string;
    photoUrl: string;
    profile: any;       // full UserProfile (xp/rank/title/banner/frame…) for the enemy card
    team: any[];
  }

  interface QueuePlayer extends PlayerSlot {
    timestamp: number;
  }

  interface MatchRoom {
    id: string;
    seed: number;                                 // shared initiative seed
    players: [PlayerSlot, PlayerSlot];            // index 0 and 1
    turns: { [turn: number]: (any[] | null)[] };  // turns[t] = [actions0, actions1]
    // 🌐 AUTORIDADE DE TURNO (v13): o servidor é o dono do progresso. resolvedTurn =
    // maior número de turno cujos DOIS slots já foram submetidos. Os clientes só
    // resolvem turnos <= resolvedTurn, em ordem — impossível divergir o contador.
    resolvedTurn: number;
    // 🔄 Relatórios de estado pós-resolução (sincronia de HP/escudo/chakra):
    // cada cliente reporta o estado do PRÓPRIO esquadrão após resolver a rodada;
    // o oponente adota esses valores (a visão de cada um sobre os seus personagens
    // é autoritativa), corrigindo divergências de simulação entre clientes.
    stateReports?: { [username: string]: { turn: number; units: { [id: string]: { health: number; shield: number; isDead: boolean } }; chakra: Record<string, number> } };
    emojis: { username: string; senderName?: string; emoji: string; timestamp: number }[];
    chatMessages: { id: string; username: string; senderName: string; senderTitle?: string; text: string; timestamp: number }[];
    lastActivity: number;
    surrenderedBy: string | null;
    pings: [number, number];
    phaseDeadline: number;
  }

  const waitingQueue: QueuePlayer[] = [];
  const activeRooms: { [id: string]: MatchRoom } = {};
  // maps a username -> which room they are in and their slot index (0 or 1)
  const userMatches: { [username: string]: { roomId: string; myIndex: 0 | 1 } } = {};

  // 💾 PERSISTÊNCIA DE SALAS — sem isso, um restart do servidor (deploy/spin-down
  // do Render) apagava TODAS as partidas ativas da memória e ambos os clientes
  // ficavam eternamente em "Aguardando oponente" + erros de conexão (404 de sala).
  const persistRoomsState = () => {
    writeJSON(MATCH_ROOMS_FILE, { rooms: activeRooms, matches: userMatches });
  };
  let roomsDirty = false;
  let roomsSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const markRoomsDirty = () => {
    roomsDirty = true;
    if (!roomsSaveTimer) {
      roomsSaveTimer = setTimeout(() => {
        roomsSaveTimer = null;
        if (roomsDirty) {
          roomsDirty = false;
          persistRoomsState();
        }
      }, 400);
    }
  };

  // Restaura salas/matchings sobreviventes de uma execução anterior. A fila de
  // matchmaking NÃO é restaurada de propósito: entradas velhas pareariam fantasmas.
  try {
    const saved = readJSON<{ rooms: { [id: string]: MatchRoom } | MatchRoom[]; matches: { [username: string]: { roomId: string; myIndex: 0 | 1 } } }>(MATCH_ROOMS_FILE, { rooms: {}, matches: {} });
    if (saved && typeof saved === "object") {
      const savedRooms = Array.isArray(saved.rooms) ? [] : (saved.rooms || {});
      for (const id in savedRooms) {
        const r = savedRooms[id];
        if (r && r.id && Array.isArray(r.players) && r.players.length === 2) {
          // Pings/lastActivity RENOVADOS na restauração: pings velhos do disco fariam
          // o primeiro poll pós-restart marcar o oponente como rendido ("desconectado")
          // antes mesmo dele voltar a pingar. Com pings frescos, ambos os jogadores têm
          // uma janela completa de 60s para provar que ainda estão vivos.
          const fresh = Date.now();
          activeRooms[id] = {
            ...r,
            resolvedTurn: typeof r.resolvedTurn === "number" ? r.resolvedTurn : 0,
            emojis: r.emojis || [],
            chatMessages: r.chatMessages || [],
            pings: [fresh, fresh],
            lastActivity: fresh,
            phaseDeadline: typeof (r as any).phaseDeadline === "number" ? (r as any).phaseDeadline : fresh + 60000,
          };
        }
      }
      for (const username in (saved.matches || {})) {
        const m = saved.matches[username];
        if (m && m.roomId && activeRooms[m.roomId]) {
          userMatches[username] = m;
        }
      }
      if (Object.keys(activeRooms).length > 0) {
        console.log(`[MATCH] ${Object.keys(activeRooms).length} sala(s) restaurada(s) do disco.`);
        markRoomsDirty();
      }
    }
  } catch (err) {
    console.error("[MATCH] Falha ao restaurar salas persistidas:", err);
  }

  const slotOf = (room: MatchRoom, username: string): 0 | 1 | -1 => {
    if (room.players[0].username === username) return 0;
    if (room.players[1].username === username) return 1;
    return -1;
  };

  // Public opponent payload (what the other player is allowed to see)
  const publicOpponent = (slot: PlayerSlot) => ({
    username: slot.username,
    name: slot.name,
    photoUrl: slot.photoUrl,
    team: slot.team,
    profile: slot.profile,
  });

  // Join Matchmaking Queue
  app.post("/api/matchmaking/join", (req, res) => {
    const { username, name, photoUrl, team, profile } = req.body;
    if (!username || !team || !Array.isArray(team)) {
      return res.status(400).json({ error: "Dados inválidos para matchmaking." });
    }

    const cleanUsername = username.trim().toLowerCase();

    // Clean up any stale queue entry / match mapping for this user
    const existingIdx = waitingQueue.findIndex(p => p.username === cleanUsername);
    if (existingIdx !== -1) waitingQueue.splice(existingIdx, 1);
    delete userMatches[cleanUsername];

    const me: PlayerSlot = {
      username: cleanUsername,
      name: name || "Shinobi",
      photoUrl: photoUrl || "",
      profile: profile || { username: cleanUsername, name: name || "Shinobi", photoUrl: photoUrl || "" },
      team,
    };

    // Pair with the first different waiting player
    const otherIdx = waitingQueue.findIndex(p => p.username !== cleanUsername);
    if (otherIdx !== -1) {
      const opponent = waitingQueue.splice(otherIdx, 1)[0];
      const roomId = "room_" + Math.random().toString(36).substring(2, 11);
      const seed = Math.floor(Math.random() * 0x7fffffff);

      const oppSlot: PlayerSlot = {
        username: opponent.username,
        name: opponent.name,
        photoUrl: opponent.photoUrl,
        profile: opponent.profile,
        team: opponent.team,
      };

      // opponent = slot 0, joining player = slot 1
      const room: MatchRoom = {
        id: roomId,
        seed,
        players: [oppSlot, me],
        turns: {},
        resolvedTurn: 0,
        emojis: [],
        chatMessages: [],
        lastActivity: Date.now(),
        surrenderedBy: null,
        pings: [Date.now(), Date.now()],
        phaseDeadline: Date.now() + 60000,
      };

      activeRooms[roomId] = room;
      userMatches[oppSlot.username] = { roomId, myIndex: 0 };
      userMatches[cleanUsername] = { roomId, myIndex: 1 };
      markRoomsDirty();

      // Respond to the joining player (slot 1). The waiting player (slot 0)
      // discovers the match via /api/matchmaking/status polling.
      return res.json({
        status: "matched",
        roomId,
        myIndex: 1,
        seed,
        opponent: publicOpponent(oppSlot),
      });
    }

    // Nobody waiting yet → enqueue
    waitingQueue.push({ ...me, timestamp: Date.now() });
    res.json({ status: "searching" });
  });

  // Get Matchmaking Status (also used to verify a room on reconnection)
  app.get("/api/matchmaking/status", (req, res) => {
    const username = (req.query.username as string || "").trim().toLowerCase();
    if (!username) {
      return res.status(400).json({ error: "Username é obrigatório." });
    }

    const match = userMatches[username];
    if (match) {
      const room = activeRooms[match.roomId];
      if (room) {
        // 🧹 Sala rendida não é mais uma partida ativa: devolve idle para o
        // cliente não reconectar/ressuscitar uma partida que já acabou.
        if (room.surrenderedBy) {
          delete userMatches[username];
          return res.json({ status: "idle" });
        }
        const oppIndex = match.myIndex === 0 ? 1 : 0;
        return res.json({
          status: "matched",
          roomId: match.roomId,
          myIndex: match.myIndex,
          seed: room.seed,
          opponent: publicOpponent(room.players[oppIndex]),
        });
      }
    }

    if (waitingQueue.some(p => p.username === username)) {
      return res.json({ status: "searching" });
    }

    res.json({ status: "idle" });
  });

  // Submit Turn Actions
  app.post("/api/match/submit-turn", (req, res) => {
    const { roomId, username, actions, turn } = req.body;
    if (!roomId || !username || typeof turn !== "number" || !Array.isArray(actions)) {
      return res.status(400).json({ error: "Dados de turno inválidos." });
    }

    const room = activeRooms[roomId];
    if (!room) {
      return res.status(404).json({ error: "Sala não encontrada ou partida finalizada." });
    }

    const cleanUsername = username.trim().toLowerCase();
    const idx = slotOf(room, cleanUsername);
    if (idx === -1) {
      return res.status(403).json({ error: "Você não faz parte desta sala." });
    }

    room.lastActivity = Date.now();
    room.pings[idx] = Date.now();
    if (!room.turns[turn]) room.turns[turn] = [null, null];
    room.turns[turn][idx] = actions;
    // deadline da fase: quando um lado envia, o outro ganha 60s reais (anti-burla refresh)
    {
      const _other = idx === 0 ? 1 : 0;
      const _both = (room.turns[turn] as any)[0] !== null && (room.turns[turn] as any)[1] !== null;
      if (!_both) room.phaseDeadline = Date.now() + 60000;
    }

    // 🌐 AUTORIDADE DE TURNO (v13): assim que os DOIS slots deste turno estão
    // preenchidos, o servidor declara o turno resolvido. resolvedTurn avança em
    // ordem estrita (só de N para N+1) para os clientes seguirem a mesma cadência.
    const slots = room.turns[turn];
    if (Array.isArray(slots) && slots[0] != null && slots[1] != null && turn === room.resolvedTurn + 1) {
      room.resolvedTurn = turn;
      // Encadeia caso turnos futuros já estejam completos (chegaram fora de ordem).
      let next = room.resolvedTurn + 1;
      while (room.turns[next] && room.turns[next][0] != null && room.turns[next][1] != null) {
        room.resolvedTurn = next;
        next++;
      }
      room.phaseDeadline = Date.now() + 60000;
    }
    markRoomsDirty();

    res.json({ success: true, resolvedTurn: room.resolvedTurn });
  });

  // Get Room State (Polling)
  app.get("/api/match/room-state", (req, res) => {
    const roomId = req.query.roomId as string;
    if (!roomId) {
      return res.status(400).json({ error: "roomId é obrigatório." });
    }

    const room = activeRooms[roomId];
    if (!room) {
      return res.status(404).json({ error: "Sala não encontrada." });
    }

    // Update ping for the querying player. Also refresh lastActivity so an
    // ACTIVE match (both players polling) is never garbage-collected mid-game
    // — the GC only targets truly abandoned rooms.
    const username = (req.query.username as string || "").trim().toLowerCase();
    const idx = slotOf(room, username);
    if (idx !== -1) room.pings[idx] = Date.now();
    room.lastActivity = Date.now();

    // Disconnection timeout (60s). Background tabs / locked phones suspend the
    // browser timers, so a shorter window produced phantom defeats.
    const now = Date.now();
    if (!room.surrenderedBy) {
      if (now - room.pings[0] > 60000) {
        room.surrenderedBy = room.players[0].username;
        markRoomsDirty();
      } else if (now - room.pings[1] > 60000) {
        room.surrenderedBy = room.players[1].username;
        markRoomsDirty();
      }
    }

    // turnActions keyed by turn → [actions0, actions1]
    const turnActions: { [turn: number]: (any[] | null)[] } = {};
    for (const t in room.turns) turnActions[t] = room.turns[t];

    res.json({
      success: true,
      room: {
        id: room.id,
        seed: room.seed,
        players: room.players.map(publicOpponent),
        turnActions,
        resolvedTurn: room.resolvedTurn ?? 0,
        stateReports: room.stateReports || {},
        surrenderedBy: room.surrenderedBy || null,
        phaseDeadline: room.phaseDeadline ?? Date.now() + 60000,
      },
    });
  });

  // 🔄 State Report (sincronia pós-resolução): cliente reporta HP/escudo/morte dos
  // PRÓPRIOS personagens + pool de chakra, por turno. O oponente lê via room-state
  // e adota esses valores para o esquadrão dele (fonte da verdade = dono do time).
  app.post("/api/match/report-state", (req: any, res: any) => {
    const { roomId, username, turn, units, chakra } = req.body || {};
    if (!roomId || !username || typeof turn !== "number" || !units) {
      return res.status(400).json({ error: "Dados de relatório inválidos." });
    }
    const room = activeRooms[roomId];
    if (!room) {
      return res.status(404).json({ error: "Sala não encontrada." });
    }
    if (!room.stateReports) room.stateReports = {};
    // Mantém apenas o relato mais recente por jogador (a atribuição sobrescreve).
    room.stateReports[username.trim().toLowerCase()] = {
      turn,
      units,
      chakra: chakra && typeof chakra === "object" ? chakra : {}
    };
    room.lastActivity = Date.now();
    markRoomsDirty();
    res.json({ success: true });
  });

  // Declare Surrender / Defeat
  app.post("/api/match/surrender", (req, res) => {
    const { roomId, username } = req.body;
    if (!roomId || !username) {
      return res.status(400).json({ error: "roomId e username são obrigatórios." });
    }

    const room = activeRooms[roomId];
    if (!room) {
      return res.status(404).json({ error: "Sala não encontrada." });
    }

    room.surrenderedBy = username.trim().toLowerCase();
    room.lastActivity = Date.now();
    // 🧹 Limpa o mapeamento usuario→partida dos DOIS jogadores: sem isso,
    // /matchmaking/status continuava devolvendo esta sala como "matched" e a
    // partida rendida "ressuscitava" (voltava pra mesma partida).
    for (const p of room.players) {
      delete userMatches[p.username];
    }
    markRoomsDirty();

    res.json({ success: true });
  });

  // Send Battle Emoji Reaction
  app.post("/api/match/emoji", (req, res) => {
    const { roomId, username, emoji } = req.body;
    if (!roomId || !username || !emoji) {
      return res.status(400).json({ error: "Dados de reação inválidos." });
    }

    const room = activeRooms[roomId];
    if (!room) {
      return res.status(404).json({ error: "Sala não encontrada." });
    }

    const cleanUsername = username.trim().toLowerCase();
    const emojiIdx = slotOf(room, cleanUsername);
    let senderName = username;
    if (emojiIdx !== -1) {
      senderName = room.players[emojiIdx].name || room.players[emojiIdx].username;
    }

    room.emojis.push({
      username: cleanUsername,
      senderName,
      emoji,
      timestamp: Date.now()
    });

    // Limit log size to 30
    if (room.emojis.length > 30) {
      room.emojis.shift();
    }
    markRoomsDirty();

    res.json({ success: true });
  });

  // Receive Emojis
  app.get("/api/match/emojis", (req, res) => {
    const roomId = req.query.roomId as string;
    const since = parseInt(req.query.since as string || "0", 10);

    if (!roomId) {
      return res.status(400).json({ error: "roomId é obrigatório." });
    }

    const room = activeRooms[roomId];
    if (!room) {
      return res.status(404).json({ error: "Sala não encontrada." });
    }

    const fresh = room.emojis.filter(e => e.timestamp > since);
    res.json({ success: true, emojis: fresh });
  });

  // Helper to sanitize chat messages (blocks emojis, html, urls, media files)
  function sanitizeChatMessageServer(rawText: string): string {
    if (!rawText) return "";
    let text = String(rawText).trim();
    // Strip HTML/XML tags
    text = text.replace(/<[^>]*>/g, "");
    // Strip Emojis
    text = text.replace(
      /([\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F251}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{FE00}-\u{FE0F}])/gu,
      ""
    );
    // Neutralize URLs / links
    const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(com|net|org|io|br|edu|gov|xyz|app|dev)(\/[^\s]*)?)/gi;
    text = text.replace(urlPattern, "[link removido]");
    // Neutralize media file references
    const mediaPattern = /[a-zA-Z0-9_.-]+\.(png|jpg|jpeg|gif|webp|mp4|webm|mov|avi|mkv)/gi;
    text = text.replace(mediaPattern, "[mídia removida]");

    if (text.length > 100) {
      text = text.substring(0, 100);
    }
    return text.trim();
  }

  // Send Battle Chat Message (Transient memory only)
  app.post("/api/match/chat/send", (req, res) => {
    const { roomId, username, text, title } = req.body;
    if (!roomId || !username || !text) {
      return res.status(400).json({ error: "Dados inválidos." });
    }

    const room = activeRooms[roomId];
    if (!room) {
      return res.status(404).json({ error: "Sala não encontrada." });
    }

    const cleanText = sanitizeChatMessageServer(text);
    if (!cleanText) {
      return res.status(400).json({ error: "Mensagem inválida. Emojis, mídias e links não são permitidos." });
    }

    const cleanUsername = username.trim().toLowerCase();
    const chatIdx = slotOf(room, cleanUsername);
    let senderName = username;
    if (chatIdx !== -1) {
      senderName = room.players[chatIdx].name || room.players[chatIdx].username;
    }

    const msg = {
      id: "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      username: cleanUsername,
      senderName,
      senderTitle: title ? sanitizeChatMessageServer(title) : undefined,
      text: cleanText,
      timestamp: Date.now()
    };

    if (!room.chatMessages) {
      room.chatMessages = [];
    }
    room.chatMessages.push(msg);
    if (room.chatMessages.length > 50) {
      room.chatMessages.shift();
    }
    markRoomsDirty();

    res.json({ success: true, message: msg });
  });

  // Receive Battle Chat Messages
  app.get("/api/match/chat/messages", (req, res) => {
    const roomId = req.query.roomId as string;
    const since = parseInt(req.query.since as string || "0", 10);

    if (!roomId) {
      return res.status(400).json({ error: "roomId é obrigatório." });
    }

    const room = activeRooms[roomId];
    if (!room) {
      return res.status(404).json({ error: "Sala não encontrada." });
    }

    const msgs = room.chatMessages || [];
    const fresh = msgs.filter(m => m.timestamp > since);
    res.json({ success: true, messages: fresh });
  });

  // Quit/Finish Battle
  app.post("/api/matchmaking/quit", (req, res) => {
    const { username, roomId } = req.body;
    const cleanUsername = (username || "").trim().toLowerCase();

    // Remove from matchmaking queue
    const idx = waitingQueue.findIndex(p => p.username === cleanUsername);
    if (idx !== -1) {
      waitingQueue.splice(idx, 1);
    }

    delete userMatches[cleanUsername];

    if (roomId && activeRooms[roomId]) {
      const room = activeRooms[roomId];
      delete activeRooms[roomId];
      // Clean up both players' match mappings
      delete userMatches[room.players[0].username];
      delete userMatches[room.players[1].username];
      markRoomsDirty();
    }

    res.json({ success: true });
  });

  // Server-authoritative turn timeout: se o relogio de 60s estourar, auto-passa com acoes vazias
  setInterval(() => {
    const now2 = Date.now();
    for (const id in activeRooms) {
      const room2 = activeRooms[id];
      if (room2.surrenderedBy) continue;
      if (!room2.phaseDeadline || now2 <= room2.phaseDeadline) continue;
      // Deadline estourou - descobre de quem eh a vez neste turno/fase
      const curTurn = (room2.resolvedTurn ?? 0) + 1;
      if (!room2.turns[curTurn]) room2.turns[curTurn] = [null, null];
      const slots: any[] = room2.turns[curTurn]!;
      let activeIdx: 0 | 1 | null = null;
      // Determina lder real deste turno via mesma funcao do cliente (seed -> starterSlot)
      const starterSlot = (() => {
        let x = (room2.seed + 0x9e3779b9) >>> 0;
        x ^= x >>> 15;
        x = (x * 2246822519) >>> 0;
        x ^= x >>> 13;
        return (x & 1) as 0 | 1;
      })();
      const leaderForTurn = ((starterSlot + (curTurn - 1)) % 2) as 0 | 1;
      if (slots[0] === null && slots[1] === null) {
        activeIdx = leaderForTurn;
      } else if (slots[0] !== null && slots[1] === null) {
        activeIdx = 1;
      } else if (slots[0] === null && slots[1] !== null) {
        activeIdx = 0;
      } else {
        continue; // ambos ja submeteram
      }
      // Auto-passa com acoes vazias
      slots[activeIdx] = [];
      room2.lastActivity = now2;
      // Se era o ultimo a faltar, resolve o turno
      if (slots[0] !== null && slots[1] !== null) {
        let nxt = (room2.resolvedTurn ?? 0) + 1;
        while (room2.turns[nxt] && (room2.turns[nxt] as any)[0] !== null && (room2.turns[nxt] as any)[1] !== null) {
          room2.resolvedTurn = nxt;
          nxt++;
        }
        room2.phaseDeadline = now2 + 60000;
      } else {
        room2.phaseDeadline = now2 + 60000;
      }
      markRoomsDirty();
      console.log(`[TIMEOUT] Sala ${id} turno ${curTurn} slot ${activeIdx} auto-pass por timeout 60s`);
    }
  }, 1000);

  // Background Cleanup of Stale Rooms (older than 10 mins; surrendered rooms after 2 mins)
  setInterval(() => {
    let gcChanged = false;
    const now = Date.now();
    for (const id in activeRooms) {
      const room = activeRooms[id];
      const ttl = room.surrenderedBy ? 600000 : 600000; // 10min para rendição também (era 2min) - dá tempo de voltar na aba e ver quem venceu
      if (now - room.lastActivity > ttl) {
        delete userMatches[room.players[0].username];
        delete userMatches[room.players[1].username];
        delete activeRooms[id];
        gcChanged = true;
      }
    }
    if (gcChanged) markRoomsDirty();
  }, 60000);

  // Character Sync API
  app.get("/api/characters", (req, res) => {
    let characters = readJSON<any[]>(CHARACTERS_FILE, []);
    if (!Array.isArray(characters) || characters.length === 0) {
      characters = DEFAULT_CHARACTERS;
      writeJSON(CHARACTERS_FILE, DEFAULT_CHARACTERS);
    }
    res.json({ success: true, characters });
  });

  app.post("/api/characters", (req, res) => {
    const { characters } = req.body;
    if (!Array.isArray(characters)) {
      return res.status(400).json({ error: "Lista de personagens inválida." });
    }

    writeJSON(CHARACTERS_FILE, characters);
    res.json({ success: true, message: "Personagens atualizados no banco de dados com sucesso!" });
  });

  // Ranks API
  app.get("/api/ranks", (req, res) => {
    const defaultRanks = [
      { id: 'rank_estudante', name: 'Estudante de Academia', requiredXp: 0, color: 'from-slate-500 to-slate-400 border-slate-500/30 text-slate-300' },
      { id: 'rank_genin', name: 'Genin', requiredXp: 1000, color: 'from-emerald-600 to-teal-500 border-emerald-500/30 text-emerald-400' },
      { id: 'rank_chunin', name: 'Chunin', requiredXp: 3500, color: 'from-blue-600 to-cyan-500 border-blue-500/30 text-blue-400' },
      { id: 'rank_jonin', name: 'Jonin', requiredXp: 8500, color: 'from-indigo-600 to-purple-500 border-indigo-500/30 text-indigo-400' },
      { id: 'rank_anbu', name: 'ANBU', requiredXp: 18000, color: 'from-red-600 to-pink-500 border-red-500/30 text-red-400' },
      { id: 'rank_sannin', name: 'Sannin Lendário', requiredXp: 35000, color: 'from-purple-600 to-fuchsia-500 border-purple-500/30 text-purple-300' },
      { id: 'rank_hokage', name: 'Hokage', requiredXp: 60000, color: 'from-orange-600 to-amber-500 border-orange-500/30 text-orange-400' },
      { id: 'rank_lenda', name: 'Lenda Shinobi', requiredXp: 100000, color: 'from-yellow-500 to-amber-300 border-yellow-400/50 text-yellow-300' }
    ];
    const ranks = readJSON<any[]>(RANKS_FILE, defaultRanks);
    res.json({ success: true, ranks });
  });

  app.post("/api/ranks", (req, res) => {
    const { ranks } = req.body;
    if (!Array.isArray(ranks)) {
      return res.status(400).json({ error: "Lista de ranks inválida." });
    }
    writeJSON(RANKS_FILE, ranks);
    res.json({ success: true, message: "Ranks atualizados com sucesso!" });
  });

  // Shop API
  app.get("/api/shop", (req, res) => {
    const defaultShop = [
      { id: 'title-sabio-sannin', name: 'Lenda dos Sannin', category: 'title', description: 'Título exclusivo de prestígio reconhecido por todos os países ninjas.', currency: 'ryos', price: 1500, badge: 'TÍTULO' },
      { id: 'title-akatsuki-renegado', name: 'Akatsuki Renegado', category: 'title', description: 'Título para aqueles que trilham o caminho da névoa e das sombras.', currency: 'gems', price: 60, badge: 'TÍTULO' },
      { id: 'title-mestre-taijutsu', name: 'Mestre dos Oito Portões', category: 'title', description: 'Título honroso concedido a guerreiros que dominam a força do Taijutsu.', currency: 'ryos', price: 900, badge: 'TÍTULO' },
      { id: 'title-deus-shinobi', name: 'Deus dos Shinobis', category: 'title', description: 'O mais alto título do mundo ninja, gravado nos monumentos da arena.', currency: 'gems', price: 120, badge: 'MÍTICO' },
      { id: 'skin-naruto-sage', name: 'Naruto Modo Sábio', category: 'skin', characterName: 'Naruto Uzumaki', description: 'Visual lendário de Naruto vestindo a capa vermelha do Modo Sábio de Senjutsu.', currency: 'gems', price: 150, skinImageUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80', badge: 'LENDÁRIO' },
      { id: 'skin-sasuke-hebi', name: 'Sasuke Traje Hebi', category: 'skin', characterName: 'Sasuke Uchiha', description: 'Visual de Sasuke durante a formação do esquadrão Hebi na caça a Itachi.', currency: 'ryos', price: 2500, skinImageUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80', badge: 'RARO' },
      { id: 'skin-kakashi-anbu', name: 'Kakashi Capitão ANBU', category: 'skin', characterName: 'Kakashi Hatake', description: 'Traje operacional sombrio das Forças Especiais ANBU de Konoha.', currency: 'gems', price: 100, skinImageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=800&auto=format&fit=crop&q=80', badge: 'ANBU' },
      { id: 'frame-chama-vontade', name: 'Fogo da Vontade', category: 'frame', description: 'Moldura reluzente inspirada no fogo e determinação dos ninjas de Konoha.', currency: 'ryos', price: 800, frameStyle: 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)] bg-gradient-to-tr from-amber-500 to-red-500', badge: 'POPULAR' },
      { id: 'frame-sharingan-crimson', name: 'Sharingan Carmesim', category: 'frame', description: 'Moldura com áurea rubra misteriosa inspirada no lendário Dōjutsu do Clã Uchiha.', currency: 'gems', price: 50, frameStyle: 'border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.7)] bg-gradient-to-tr from-red-600 to-rose-950', badge: 'LENDÁRIO' },
      { id: 'frame-anbu-operativo', name: 'Operativo ANBU', category: 'frame', description: 'Moldura prateada elegante reservada para ninjas das forças especiais de esquadrão.', currency: 'ryos', price: 1200, frameStyle: 'border-slate-300 shadow-[0_0_15px_rgba(203,213,225,0.5)] bg-gradient-to-tr from-slate-200 to-slate-500', badge: 'ANBU' },
      { id: 'bundle-ryos-p', name: 'Bolsa de Ryos', category: 'bundle', description: 'Bolsa contendo 1.000 Ryos para desbloqueios e compras na loja.', currency: 'gems', price: 20, bundleGrant: { type: 'ryos', amount: 1000 }, badge: 'PACOTE' },
      { id: 'bundle-ryos-g', name: 'Baú do Tesouro Ninja', category: 'bundle', description: 'Grande baú com 3.000 Ryos para expansão rápida do seu império ninja.', currency: 'gems', price: 50, bundleGrant: { type: 'ryos', amount: 3000 }, badge: 'OFERTA' }
    ];
    const items = readJSON<any[]>(SHOP_FILE, defaultShop);
    res.json({ success: true, items });
  });

  app.post("/api/shop", (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "Lista de itens da loja inválida." });
    }
    writeJSON(SHOP_FILE, items);
    res.json({ success: true, message: "Loja atualizada no servidor com sucesso!" });
  });

  // Events API
  app.get("/api/events", (req, res) => {
    const defaultEvents = [
      {
        id: 'guerra-ninja-1',
        title: '4ª Grande Guerra Shinobi',
        subtitle: 'Evento de Batalha Global de Aliança',
        description: 'A Aliança Shinobi precisa da sua força no campo de batalha! Participe das batalhas da Arena, vença com seus ninjas e ajude a proteger o mundo ninja contra a ameaça dos Edo Tensei.',
        bannerUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
        badge: 'EVENTO PRINCIPAL',
        timeLeft: '4 dias 18 horas',
        featured: true,
        objectives: [
          { id: 'gn1-obj1', description: 'Vença 3 partidas na Arena Tática', current: 2, target: 3, rewardType: 'ryos', rewardValue: 500, rewardLabel: '500 Ryos' },
          { id: 'gn1-obj2', description: 'Cause 1.500 de dano total em combate', current: 1250, target: 1500, rewardType: 'gems', rewardValue: 50, rewardLabel: '50 Gemas Ninja' },
          { id: 'gn1-obj3', description: 'Use habilidades de Ninjutsu 15 vezes', current: 15, target: 15, rewardType: 'title', rewardValue: 'Herói da Aliança', rewardLabel: 'Título: "Herói da Aliança"' },
          { id: 'gn1-obj4', description: 'Complete 5 Missões Ninja no Quadro de Missões', current: 3, target: 5, rewardType: 'frame', rewardValue: 'Guerra Shinobi', rewardLabel: 'Moldura Exclusiva "Guerra Shinobi"' }
        ]
      },
      {
        id: 'festival-folha-2026',
        title: 'Festival da Folha - Konoha',
        subtitle: 'Comemoração de Outono',
        description: 'Celebre a paz em Konohagakure! Ganhe bônus de Ryos ao jogar partidas diárias e complete desafios de suporte e cura.',
        bannerUrl: 'https://images.unsplash.com/photo-1528164344705-47542687990d?w=800&auto=format&fit=crop&q=80',
        badge: 'FESTIVAL',
        timeLeft: '11 dias',
        featured: false,
        objectives: [
          { id: 'ff-obj1', description: 'Recupere 800 de Vida acumulados em batalhas', current: 800, target: 800, rewardType: 'ryos', rewardValue: 300, rewardLabel: '300 Ryos' },
          { id: 'ff-obj2', description: 'Monte um esquadrão completo de ninjas da Folha', current: 1, target: 1, rewardType: 'gems', rewardValue: 30, rewardLabel: '30 Gemas' }
        ]
      },
      {
        id: 'invasao-akatsuki',
        title: 'Ameaça Vermelha: Caça às Bestas',
        subtitle: 'Desafio Semanal Akatsuki',
        description: 'Membros da Akatsuki foram avistados nas fronteiras do País do Fogo. Conclua combates usando invulnerabilidade e contra-ataque!',
        bannerUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=800&auto=format&fit=crop&q=80',
        badge: 'DESAFIO ESPECIAL',
        timeLeft: '2 dias 05 horas',
        featured: false,
        objectives: [
          { id: 'ak-obj1', description: 'Aplique Atordoamento ou Silêncio 5 vezes em inimigos', current: 5, target: 5, rewardType: 'title', rewardValue: 'Caçador de Renegados', rewardLabel: 'Título: "Caçador de Renegados"' },
          { id: 'ak-obj2', description: 'Gere 600 de Escudo acumulados', current: 420, target: 600, rewardType: 'gems', rewardValue: 40, rewardLabel: '40 Gemas Ninja' }
        ]
      }
    ];
    const events = readJSON<any[]>(EVENTS_FILE, defaultEvents);
    res.json({ success: true, events });
  });

  app.post("/api/events", (req, res) => {
    const { events } = req.body;
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: "Lista de eventos inválida." });
    }
    writeJSON(EVENTS_FILE, events);
    res.json({ success: true, message: "Eventos atualizados no servidor com sucesso!" });
  });

  // Banners API
  app.get("/api/banners", (req, res) => {
    const defaultBanners = [
      { id: 'banner-fogo-vontade', name: 'Fogo da Vontade', description: 'Chamas ardentes da vontade de fogo de Konoha.', imageUrl: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=1200&auto=format&fit=crop', badge: 'DESBLOQUEADO' },
      { id: 'banner-nevoa-sangrenta', name: 'Névoa Sangrenta', description: 'Névoa mística e densa da Vila Oculta da Névoa.', imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop', badge: 'MISSÃO' },
      { id: 'banner-noite-akatsuki', name: 'Noite Akatsuki', description: 'Céu estrelado noturno com atmosfera dos Renegados.', imageUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1200&auto=format&fit=crop', badge: 'LENDÁRIO' },
      { id: 'banner-vale-fim', name: 'Vale do Fim', description: 'Cenário épico do confronto lendário no Vale do Fim.', imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1200&auto=format&fit=crop', badge: 'ÉPICO' }
    ];
    const banners = readJSON<any[]>(BANNERS_FILE, defaultBanners);
    res.json({ success: true, banners });
  });

  app.post("/api/banners", (req, res) => {
    const { banners } = req.body;
    if (!Array.isArray(banners)) {
      return res.status(400).json({ error: "Lista de banners inválida." });
    }
    writeJSON(BANNERS_FILE, banners);
    res.json({ success: true, message: "Banners atualizados no servidor com sucesso!" });
  });

  // Frames API
  app.get("/api/frames", (req, res) => {
    const defaultFrames = [
      { id: 'frame-guerra-png', name: 'Moldura Guerra Shinobi (PNG)', description: 'Moldura dourada com selos ninjas dourados e brilho de batalha.', imageUrl: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=300&auto=format&fit=crop&q=80', badge: 'GUERRA' },
      { id: 'frame-akatsuki-png', name: 'Moldura Nuvens da Akatsuki (PNG)', description: 'Borda com nuvens vermelhas estilizadas da Akatsuki.', imageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=300&auto=format&fit=crop&q=80', badge: 'AKATSUKI' },
      { id: 'frame-folha-png', name: 'Moldura Símbolo da Folha (PNG)', description: 'Moldura folhada verde com o símbolo da Vila Oculta da Folha.', imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&auto=format&fit=crop&q=80', badge: 'KONOHA' }
    ];
    const frames = readJSON<any[]>(FRAMES_FILE, defaultFrames);
    res.json({ success: true, frames });
  });

  app.post("/api/frames", (req, res) => {
    const { frames } = req.body;
    if (!Array.isArray(frames)) {
      return res.status(400).json({ error: "Lista de molduras inválida." });
    }
    writeJSON(FRAMES_FILE, frames);
    res.json({ success: true, message: "Molduras atualizadas no servidor com sucesso!" });
  });

  // Quests API
  app.get("/api/quests", (req, res) => {
    // Default seed quests if the file is empty or missing
    const defaultQuests = [
      {
        id: "q1",
        title: "Caminho do Shinobi",
        desc: "Dê seus primeiros passos como um estudante. Vença 3 batalhas seguidas usando Uzumaki Naruto ou Uchiha Sasuke sem sofrer derrotas.",
        coverUrl: "https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/portrait.jpg",
        minRank: "Estudante de Academia",
        requiredQuestIds: [],
        goals: [
          {
            id: "g1_1",
            type: "win_consecutive_battles_with_chars",
            targetCharacters: ["Uzumaki Naruto", "Uchiha Sasuke"],
            targetValue: 3,
            currentValue: 0,
            consecutive: true,
            currentStreak: 0
          }
        ],
        rewards: [
          { type: "title", value: "Estudante Determinado" },
          { type: "unlock_character", "value": "Yuki Haku" }
        ],
        completed: false
      },
      {
        id: "q2",
        title: "Os Espelhos de Gelo",
        desc: "Aprenda a controlar o jutsu secreto de linhagem de Yuki Haku. Conclua os Espelhos Demoníacos de Haku e garanta vitórias.",
        coverUrl: "https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/haku/portrait.jpg",
        minRank: "Genin",
        requiredQuestIds: ["q1"],
        goals: [
          {
            id: "g2_1",
            type: "use_skill",
            targetSkill: "Demonic Mirroring Ice Crystals",
            targetValue: 3,
            currentValue: 0,
            singleMatch: false
          },
          {
            id: "g2_2",
            type: "win_battles_with_chars",
            targetCharacters: ["Yuki Haku"],
            targetValue: 5,
            currentValue: 0
          }
        ],
        rewards: [
          { type: "title", value: "Gênio do Gelo" },
          { type: "unlock_character", value: "Momochi Zabuza" }
        ],
        completed: false
      },
      {
        id: "q3",
        title: "Demônio do Nevoeiro",
        desc: "Ganhe batalhas usando a temível dupla Haku, Zabuza e Kakashi na mesma partida para reviver o combate na ponte.",
        coverUrl: "https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/zabuza/portrait.jpg",
        minRank: "Chunin",
        requiredQuestIds: ["q2"],
        goals: [
          {
            id: "g3_1",
            type: "win_battles_with_chars",
            targetCharacters: ["Yuki Haku", "Momochi Zabuza", "Kakashi Hatake"],
            targetValue: 15,
            currentValue: 0
          }
        ],
        rewards: [
          { type: "title", value: "Lenda da Névoa" }
        ],
        completed: false
      },
      {
        id: "q4",
        title: "O Treinamento de Jiraiya",
        desc: "Mostre o poder de sua persistência. Finalize um inimigo com Rasengan e recupere 150 pontos de vida no total.",
        coverUrl: "https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/portrait.jpg",
        minRank: "Jonin",
        requiredQuestIds: [],
        goals: [
          {
            id: "g4_1",
            type: "kill_with_skill",
            targetSkill: "Rasengan",
            targetValue: 1,
            currentValue: 0
          },
          {
            id: "g4_2",
            type: "heal",
            targetValue: 150,
            currentValue: 0,
            singleMatch: false
          }
        ],
        rewards: [
          { type: "title", value: "Herói de Konoha" }
        ],
        completed: false
      },
      {
        id: "q5",
        title: "Defesa Absoluta de Areia",
        desc: "Gaara controla a areia para criar defesas impenetráveis. Gere 1000 de escudo no total e stune um inimigo 5 vezes.",
        coverUrl: "https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/gaara/portrait.jpg",
        minRank: "ANBU",
        requiredQuestIds: [],
        goals: [
          {
            id: "g5_1",
            type: "shield",
            targetValue: 1000,
            currentValue: 0,
            singleMatch: false
          },
          {
            id: "g5_2",
            type: "stun_enemy",
            targetValue: 5,
            currentValue: 0,
            singleMatch: false
          }
        ],
        rewards: [
          { type: "title", value: "Escudo Impenetrável" }
        ],
        completed: false
      },
      {
        id: "q6",
        title: "Desafio Final: O Despertar do Hokage",
        desc: "Mostre a vontade do fogo. Absorva um total de 20.000 de dano e inflija um total de 20.000 de dano nas batalhas.",
        coverUrl: "https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/portrait.jpg",
        minRank: "Hokage",
        requiredQuestIds: [],
        goals: [
          {
            id: "g6_1",
            type: "damage_received",
            targetValue: 20000,
            currentValue: 0,
            singleMatch: false
          },
          {
            id: "g6_2",
            type: "damage_dealt",
            targetValue: 20000,
            currentValue: 0,
            singleMatch: false
          }
        ],
        rewards: [
          { type: "title", value: "Hokage Lendário" }
        ],
        completed: false
      }
    ];

    const quests = readJSON<any[]>(QUESTS_FILE, defaultQuests);
    res.json({ success: true, quests });
  });

  app.post("/api/quests", (req, res) => {
    const { quests } = req.body;
    if (!Array.isArray(quests)) {
      return res.status(400).json({ error: "Lista de missões inválida." });
    }

    writeJSON(QUESTS_FILE, quests);
    res.json({ success: true, message: "Missões atualizadas com sucesso!" });
  });

  // Environment Full Configuration Export/Import API
  app.get("/api/config/export", (req, res) => {
    const characters = readJSON<any[]>(CHARACTERS_FILE, []);
    const quests = readJSON<any[]>(QUESTS_FILE, []);
    const shop = readJSON<any[]>(SHOP_FILE, []);
    const events = readJSON<any[]>(EVENTS_FILE, []);
    const ranks = readJSON<any[]>(RANKS_FILE, []);
    const banners = readJSON<any[]>(BANNERS_FILE, []);
    const frames = readJSON<any[]>(FRAMES_FILE, []);

    const configBackup = {
      appName: "Naruto Unison Combat",
      exportDate: new Date().toISOString(),
      characters,
      quests,
      shop,
      events,
      ranks,
      banners,
      frames
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="naruto-config-backup-${Date.now()}.json"`);
    res.json(configBackup);
  });

  app.post("/api/config/import", (req, res) => {
    const data = req.body;
    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Arquivo de configuração JSON inválido." });
    }

    let countDetails: string[] = [];

    if (Array.isArray(data.characters)) {
      writeJSON(CHARACTERS_FILE, data.characters);
      countDetails.push(`${data.characters.length} Personagens`);
    }
    if (Array.isArray(data.quests)) {
      writeJSON(QUESTS_FILE, data.quests);
      countDetails.push(`${data.quests.length} Missões`);
    }
    if (Array.isArray(data.shop)) {
      writeJSON(SHOP_FILE, data.shop);
      countDetails.push(`${data.shop.length} Itens da Loja`);
    }
    if (Array.isArray(data.events)) {
      writeJSON(EVENTS_FILE, data.events);
      countDetails.push(`${data.events.length} Eventos`);
    }
    if (Array.isArray(data.ranks)) {
      writeJSON(RANKS_FILE, data.ranks);
      countDetails.push(`${data.ranks.length} Ranks/XP`);
    }
    if (Array.isArray(data.banners)) {
      writeJSON(BANNERS_FILE, data.banners);
      countDetails.push(`${data.banners.length} Banners`);
    }
    if (Array.isArray(data.frames)) {
      writeJSON(FRAMES_FILE, data.frames);
      countDetails.push(`${data.frames.length} Molduras`);
    }

    if (countDetails.length === 0) {
      return res.status(400).json({ error: "Nenhum dado de configuração válido encontrado no arquivo JSON." });
    }

    res.json({
      success: true,
      message: `Configurações importadas e sincronizadas no servidor com sucesso! (${countDetails.join(", ")})`
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
 