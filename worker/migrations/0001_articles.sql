CREATE TABLE IF NOT EXISTS requests (
  key TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  quality TEXT NOT NULL CHECK (quality IN ('standard', 'premium')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  charged INTEGER NOT NULL CHECK (charged >= 0),
  snapshot TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS requests_budget ON requests(day, quality);
