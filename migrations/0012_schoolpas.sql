-- wachtwoorden waarmee je onder schooltijd (doordeweeks 9:00-14:30) toch mag spelen
CREATE TABLE schoolpas (
  code TEXT PRIMARY KEY,
  label TEXT,
  until INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  last_used INTEGER,
  created INTEGER NOT NULL
);
