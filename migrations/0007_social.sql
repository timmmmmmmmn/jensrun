CREATE TABLE clans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE TABLE clan_members (
  player_id TEXT PRIMARY KEY,
  clan_id TEXT NOT NULL,
  joined INTEGER NOT NULL
);
CREATE INDEX clan_members_clan ON clan_members (clan_id);
CREATE TABLE friends (
  player_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (player_id, friend_id)
);
CREATE INDEX friends_friend ON friends (friend_id);
CREATE TABLE notifs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX notifs_player ON notifs (player_id, id);
