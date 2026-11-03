CREATE TABLE weekly (
  week TEXT NOT NULL,
  player_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (week, player_id)
);
CREATE INDEX weekly_rank ON weekly (week, score DESC);
