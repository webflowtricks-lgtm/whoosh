import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const USERS_FILE = path.join(process.cwd(), "src", "data", "users.json");
const CHARACTERS_FILE = path.join(process.cwd(), "src", "data", "custom_characters.json");

const QUESTS_FILE = path.join(process.cwd(), "src", "data", "quests.json");
const RANKS_FILE = path.join(process.cwd(), "src", "data", "ranks.json");
const SHOP_FILE = path.join(process.cwd(), "src", "data", "shop.json");
const EVENTS_FILE = path.join(process.cwd(), "src", "data", "events.json");
const BANNERS_FILE = path.join(process.cwd(), "src", "data", "banners.json");
const FRAMES_FILE = path.join(process.cwd(), "src", "data", "frames.json");

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
    res.json({ status: "ok" });
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

  app.put("/api/user/profile", (req, res) => {
    const { username, name, photoUrl } = req.body;
    if (!username || !name) {
      return res.status(400).json({ error: "Usuário e nome de exibição são obrigatórios." });
    }

    const cleanUsername = username.trim().toLowerCase();
    const users = readJSON<any[]>(USERS_FILE, []);

    const userIdx = users.findIndex((u) => u.username === cleanUsername);
    if (userIdx === -1) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    users[userIdx].name = name.trim();
    if (photoUrl) {
      users[userIdx].photoUrl = photoUrl;
    }

    writeJSON(USERS_FILE, users);

    res.json({ success: true, user: { username: users[userIdx].username, name: users[userIdx].name, photoUrl: users[userIdx].photoUrl } });
  });

  // ==========================================
  // MATCHMAKING AND MULTIPLAYER GAME SYSTEM
  // ==========================================

  interface WaitingPlayer {
    username: string;
    name: string;
    photoUrl: string;
    team: any[];
    timestamp: number;
  }

  interface TurnActions {
    player1Actions: any[] | null;
    player2Actions: any[] | null;
  }

  interface MatchRoom {
    id: string;
    player1: { username: string; name: string; photoUrl: string; team: any[] };
    player2: { username: string; name: string; photoUrl: string; team: any[] };
    turns: { [turnNumber: number]: TurnActions };
    emojis: { username: string; senderName?: string; emoji: string; timestamp: number }[];
    chatMessages?: { id: string; username: string; senderName: string; senderTitle?: string; text: string; timestamp: number }[];
    lastActivity: number;
    surrenderedBy?: string | null;
    player1Ping?: number;
    player2Ping?: number;
  }

  const waitingQueue: WaitingPlayer[] = [];
  const activeRooms: { [id: string]: MatchRoom } = {};
  const userMatches: { [username: string]: { roomId: string; playerIndex: 1 | 2; opponent: any } } = {};

  // Join Matchmaking Queue
  app.post("/api/matchmaking/join", (req, res) => {
    const { username, name, photoUrl, team } = req.body;
    if (!username || !team || !Array.isArray(team)) {
      return res.status(400).json({ error: "Dados inválidos para matchmaking." });
    }

    const cleanUsername = username.trim().toLowerCase();

    // Clean up older searches for this user
    const existingIdx = waitingQueue.findIndex(p => p.username === cleanUsername);
    if (existingIdx !== -1) {
      waitingQueue.splice(existingIdx, 1);
    }
    delete userMatches[cleanUsername];

    // Check for another waiting player in queue
    const otherPlayerIdx = waitingQueue.findIndex(p => p.username !== cleanUsername);
    if (otherPlayerIdx !== -1) {
      const opponent = waitingQueue.splice(otherPlayerIdx, 1)[0];
      const roomId = "room_" + Math.random().toString(36).substring(2, 11);

      const room: MatchRoom = {
        id: roomId,
        player1: { username: opponent.username, name: opponent.name, photoUrl: opponent.photoUrl, team: opponent.team },
        player2: { username: cleanUsername, name: name || "Shinobi", photoUrl: photoUrl || "", team },
        turns: {},
        emojis: [],
        chatMessages: [],
        lastActivity: Date.now()
      };

      activeRooms[roomId] = room;

      userMatches[opponent.username] = { roomId, playerIndex: 1, opponent: room.player2 };
      userMatches[cleanUsername] = { roomId, playerIndex: 2, opponent: room.player1 };

      return res.json({
        status: "matched",
        roomId,
        playerIndex: 2,
        opponent: room.player1
      });
    }

    // No opponent found yet, add to queue
    waitingQueue.push({
      username: cleanUsername,
      name: name || "Shinobi",
      photoUrl: photoUrl || "",
      team,
      timestamp: Date.now()
    });

    res.json({ status: "searching" });
  });

  // Get Matchmaking Status
  app.get("/api/matchmaking/status", (req, res) => {
    const username = (req.query.username as string || "").trim().toLowerCase();
    if (!username) {
      return res.status(400).json({ error: "Username é obrigatório." });
    }

    const match = userMatches[username];
    if (match) {
      const room = activeRooms[match.roomId];
      if (room) {
        return res.json({
          status: "matched",
          roomId: match.roomId,
          playerIndex: match.playerIndex,
          opponent: match.opponent,
          playerTeam: match.playerIndex === 1 ? room.player1.team : room.player2.team,
          opponentTeam: match.playerIndex === 1 ? room.player2.team : room.player1.team
        });
      }
    }

    const isWaiting = waitingQueue.some(p => p.username === username);
    if (isWaiting) {
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

    room.lastActivity = Date.now();
    const cleanUsername = username.trim().toLowerCase();

    if (!room.turns[turn]) {
      room.turns[turn] = { player1Actions: null, player2Actions: null };
    }

    if (room.player1.username === cleanUsername) {
      room.turns[turn].player1Actions = actions;
    } else if (room.player2.username === cleanUsername) {
      room.turns[turn].player2Actions = actions;
    } else {
      return res.status(403).json({ error: "Você não faz parte desta sala." });
    }

    res.json({ success: true, actionsSubmitted: true });
  });

  // Get Turn State (Polling)
  app.get("/api/match/room-state", (req, res) => {
    const roomId = req.query.roomId as string;
    if (!roomId) {
      return res.status(400).json({ error: "roomId é obrigatório." });
    }

    const room = activeRooms[roomId];
    if (!room) {
      return res.status(404).json({ error: "Sala não encontrada." });
    }

    // Mark current player's ping to detect disconnects
    const username = (req.query.username as string || "").trim().toLowerCase();
    if (username) {
      if (room.player1.username === username) {
        room.player1Ping = Date.now();
      } else if (room.player2.username === username) {
        room.player2Ping = Date.now();
      }
    }

    // Initialize pings on first state query
    if (!room.player1Ping) room.player1Ping = Date.now();
    if (!room.player2Ping) room.player2Ping = Date.now();

    // Check for disconnection timeouts (25 seconds of inactivity)
    const now = Date.now();
    if (!room.surrenderedBy) {
      if (now - room.player1Ping > 25000) {
        room.surrenderedBy = room.player1.username;
      } else if (now - room.player2Ping > 25000) {
        room.surrenderedBy = room.player2.username;
      }
    }

    // Construct the turnActions object in the format expected by BattleBoard.tsx
    const turnActions: { [turn: number]: { player0: any[] | null; player1: any[] | null } } = {};
    for (const t in room.turns) {
      turnActions[t] = {
        player0: room.turns[t].player1Actions,
        player1: room.turns[t].player2Actions
      };
    }

    res.json({
      success: true,
      room: {
        id: room.id,
        player1: room.player1,
        player2: room.player2,
        turnActions: turnActions,
        surrenderedBy: room.surrenderedBy || null
      }
    });
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
    let senderName = username;
    if (room.player1.username === cleanUsername) {
      senderName = room.player1.name || room.player1.username;
    } else if (room.player2.username === cleanUsername) {
      senderName = room.player2.name || room.player2.username;
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
    let senderName = username;
    if (room.player1.username === cleanUsername) {
      senderName = room.player1.name || room.player1.username;
    } else if (room.player2.username === cleanUsername) {
      senderName = room.player2.name || room.player2.username;
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
      // Clean up opponent as well
      delete userMatches[room.player1.username];
      delete userMatches[room.player2.username];
    }

    res.json({ success: true });
  });

  // Background Cleanup of Stale Rooms (older than 10 mins)
  setInterval(() => {
    const now = Date.now();
    for (const id in activeRooms) {
      if (now - activeRooms[id].lastActivity > 600000) {
        const room = activeRooms[id];
        delete userMatches[room.player1.username];
        delete userMatches[room.player2.username];
        delete activeRooms[id];
      }
    }
  }, 60000);

  // Character Sync API
  app.get("/api/characters", (req, res) => {
    const characters = readJSON<any[]>(CHARACTERS_FILE, []);
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
      { id: 'rank_genin', name: 'Genin', requiredXp: 1, color: 'from-emerald-600 to-teal-500 border-emerald-500/30 text-emerald-400' },
      { id: 'rank_chunin', name: 'Chunin', requiredXp: 2, color: 'from-blue-600 to-cyan-500 border-blue-500/30 text-blue-400' },
      { id: 'rank_jonin', name: 'Jonin', requiredXp: 3, color: 'from-indigo-600 to-purple-500 border-indigo-500/30 text-indigo-400' },
      { id: 'rank_anbu', name: 'ANBU', requiredXp: 4, color: 'from-red-600 to-pink-500 border-red-500/30 text-red-400' },
      { id: 'rank_hokage', name: 'Hokage', requiredXp: 5, color: 'from-orange-600 to-amber-500 border-orange-500/30 text-orange-400' }
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
