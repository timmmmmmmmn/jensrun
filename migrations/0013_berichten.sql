-- berichten die spelers achterlaten, te lezen op /beheer (eventueel als reactie op een nieuwsbericht)
CREATE TABLE berichten (
  id TEXT PRIMARY KEY,
  player_id TEXT,
  name TEXT,
  text TEXT NOT NULL,
  news_id TEXT,
  news_title TEXT,
  device TEXT,
  ip TEXT,
  gelezen INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE INDEX berichten_created ON berichten (created);
CREATE INDEX berichten_ip ON berichten (ip, created);
-- nieuws kan een knop 'Stuur een bericht' krijgen
ALTER TABLE news ADD COLUMN knop INTEGER NOT NULL DEFAULT 0;
