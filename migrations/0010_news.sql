-- nieuws in het hoofdmenu, met plaatje en einddatum (via /beheer)
CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  img BLOB,
  img_type TEXT,
  until INTEGER NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS news_until ON news (until);
