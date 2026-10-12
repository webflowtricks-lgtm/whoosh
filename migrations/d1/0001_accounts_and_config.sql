CREATE TABLE IF NOT EXISTS accounts (
  username TEXT PRIMARY KEY,
  password_salt TEXT,
  password_hash TEXT,
  profile_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS account_sessions (
  username TEXT PRIMARY KEY REFERENCES accounts(username) ON DELETE CASCADE,
  active_token_hash TEXT NOT NULL,
  pending_token_hashes_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS session_tickets (
  ticket_hash TEXT PRIMARY KEY,
  username TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS session_tickets_expires_at
  ON session_tickets(expires_at);

CREATE TABLE IF NOT EXISTS game_config (
  config_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_config_versions (
  config_key TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_config_items (
  config_key TEXT NOT NULL,
  version_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  chunk_number INTEGER NOT NULL,
  value_part TEXT NOT NULL,
  PRIMARY KEY (config_key, version_id, ordinal, chunk_number)
);

CREATE TABLE IF NOT EXISTS account_google_identities (
  google_subject TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE REFERENCES accounts(username) ON DELETE CASCADE,
  email TEXT
);

CREATE TABLE IF NOT EXISTS archived_online_battle_history (
  room_id TEXT PRIMARY KEY,
  players_json TEXT NOT NULL,
  winner_username TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  reason TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS archived_history_finished_at
  ON archived_online_battle_history(finished_at DESC);
