CREATE TABLE IF NOT EXISTS online_battle_rewards (
  room_id TEXT NOT NULL,
  username TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
  xp_delta INTEGER NOT NULL,
  awarded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, username)
);
