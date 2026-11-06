-- BREWZA database schema (SQLite). Created automatically by app.py on first start.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL DEFAULT 'Guest',
  gender        TEXT NOT NULL DEFAULT '' CHECK (gender IN ('', 'female', 'male', 'other')),
  range_m       INTEGER NOT NULL DEFAULT 2000 CHECK (range_m BETWEEN 200 AND 50000),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A place users interacted with. place_id comes from OpenStreetMap: n123 (node), w123 (way), r123 (relation)
CREATE TABLE IF NOT EXISTS places (
  place_id   TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  address    TEXT,
  kind       TEXT NOT NULL CHECK (kind IN ('cafe', 'bar', 'restaurant')),
  lat        REAL,
  lng        REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wishlist (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id TEXT    NOT NULL REFERENCES places(place_id),
  added_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, place_id)
);

CREATE TABLE IF NOT EXISTS visits (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id   TEXT    NOT NULL REFERENCES places(place_id),
  visited_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, place_id)
);

-- Ratings now come from BREWZA users (OpenStreetMap has no ratings). 'spend' powers the budget filter.
CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id   TEXT    NOT NULL REFERENCES places(place_id),
  stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  spend      INTEGER CHECK (spend IS NULL OR spend BETWEEN 10 AND 20000),  -- INR per person (optional)
  body       TEXT    NOT NULL CHECK (length(body) BETWEEN 5 AND 500),
  photo      TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_place ON reviews(place_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_user  ON reviews(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS review_likes (
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  PRIMARY KEY (review_id, user_id)
);

CREATE TABLE IF NOT EXISTS review_reports (
  review_id  INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (review_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room       TEXT    NOT NULL,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name       TEXT    NOT NULL,
  body       TEXT    NOT NULL CHECK (length(body) BETWEEN 1 AND 300),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_messages(room, id);
