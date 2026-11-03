-- alle potjes (niet alleen het record), voor de dagelijkse krant
CREATE TABLE runs (
  player_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  score INTEGER NOT NULL,
  dist INTEGER NOT NULL,
  reason TEXT,
  street TEXT,
  created INTEGER NOT NULL
);
CREATE INDEX runs_created ON runs (created);
