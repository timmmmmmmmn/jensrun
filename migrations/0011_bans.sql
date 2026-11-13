-- bans (voor altijd, until NULL) en time-outs (tot until); raakt de speler zelf
-- en, als de beheerder dat aanvinkt, ook het apparaat en/of het IP-adres
CREATE TABLE bans (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  player_id TEXT,
  name TEXT,
  device TEXT,
  ip TEXT,
  message TEXT NOT NULL,
  until INTEGER,
  created INTEGER NOT NULL
);
CREATE INDEX bans_player ON bans (player_id);
CREATE INDEX bans_device ON bans (device);
CREATE INDEX bans_ip ON bans (ip);
-- laatst geziene apparaat en IP per speler, zodat de beheerder die kan bannen
CREATE TABLE seen (
  player_id TEXT PRIMARY KEY,
  device TEXT,
  ip TEXT,
  updated INTEGER NOT NULL
);
