import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const USERS_FILE = path.join(process.cwd(), "src", "data", "users.json");
const CHARACTERS_FILE = path.join(process.cwd(), "src", "data", "custom_characters.json");

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
    emojis: { username: string; emoji: string; timestamp: number }[];
    lastActivity: number;
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
      return res.json({
        status: "matched",
        roomId: match.roomId,
        playerIndex: match.playerIndex,
        opponent: match.opponent
      });
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
    const turn = parseInt(req.query.turn as string || "1", 10);

    if (!roomId) {
      return res.status(400).json({ error: "roomId é obrigatório." });
    }

    const room = activeRooms[roomId];
    if (!room) {
      return res.status(404).json({ error: "Sala não encontrada." });
    }

    const turnState = room.turns[turn];
    if (turnState && turnState.player1Actions !== null && turnState.player2Actions !== null) {
      return res.json({
        ready: true,
        player1Actions: turnState.player1Actions,
        player2Actions: turnState.player2Actions
      });
    }

    res.json({ ready: false });
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

    room.emojis.push({
      username: username.trim().toLowerCase(),
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
