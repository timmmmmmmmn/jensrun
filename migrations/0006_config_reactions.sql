CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE reactions (
  target_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (target_id, from_id)
);
