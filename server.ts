import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const USERS_FILE = path.join(process.cwd(), "src", "data", "users.json");
const CHARACTERS_FILE = path.join(process.cwd(), "src", "data", "custom_characters.json");

const QUESTS_FILE = path.join(process.cwd(), "src", "data", "quests.json");

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
