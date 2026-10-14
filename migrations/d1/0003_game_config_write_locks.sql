CREATE TABLE IF NOT EXISTS game_config_write_locks (
  config_key TEXT PRIMARY KEY,
  owner_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
