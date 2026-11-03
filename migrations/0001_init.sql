CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  created INTEGER NOT NULL
);
CREATE TABLE scores (
  player_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  score INTEGER NOT NULL,
  dist INTEGER NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (player_id, mode)
);
CREATE INDEX scores_mode ON scores (mode, score DESC);
