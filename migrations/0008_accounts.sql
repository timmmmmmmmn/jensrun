CREATE TABLE accounts (
  player_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX sessions_player ON sessions (player_id);
CREATE TABLE saves (
  player_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE login_fails (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  until INTEGER NOT NULL
);
