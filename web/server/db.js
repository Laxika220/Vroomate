"use strict";
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");

const dbPath = process.env.VROOMATE_DB || path.join(__dirname, "..", "data", "vroomate.db");
if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student','faculty','driver','community')),
  is_admin      INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0,
  gender        TEXT NOT NULL DEFAULT 'x' CHECK (gender IN ('f','m','x')),
  bio           TEXT NOT NULL DEFAULT '',
  interests     TEXT NOT NULL DEFAULT '[]',
  home_stop     TEXT,
  photo         TEXT,
  phone         TEXT,
  course        TEXT NOT NULL DEFAULT '',
  women_only    INTEGER NOT NULL DEFAULT 0,
  discoverable  INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_codes (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS drivers (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  licence_no   TEXT NOT NULL,
  id_note      TEXT NOT NULL DEFAULT '',
  submitted_at INTEGER NOT NULL,
  reviewed_at  INTEGER,
  review_note  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vehicles (
  id         INTEGER PRIMARY KEY,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('car','suv','van','bike')),
  model      TEXT NOT NULL,
  colour     TEXT NOT NULL,
  plate      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  seats      INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 12),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trips (
  id             INTEGER PRIMARY KEY,
  driver_id      INTEGER NOT NULL REFERENCES users(id),
  vehicle_id     INTEGER NOT NULL REFERENCES vehicles(id),
  origin_stop    TEXT NOT NULL,
  dest_stop      TEXT NOT NULL,
  depart_at      INTEGER NOT NULL,
  seats_total    INTEGER NOT NULL CHECK (seats_total BETWEEN 1 AND 12),
  seats_available INTEGER NOT NULL,
  fare_per_km_seat REAL NOT NULL DEFAULT 0,
  notes          TEXT NOT NULL DEFAULT '',
  women_only     INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','cancelled','completed')),
  created_at     INTEGER NOT NULL,
  CHECK (seats_available >= 0 AND seats_available <= seats_total)
);
CREATE INDEX IF NOT EXISTS idx_trips_open ON trips(status, depart_at);

CREATE TABLE IF NOT EXISTS groups (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status   TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','joined')),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS ride_requests (
  id          INTEGER PRIMARY KEY,
  rider_id    INTEGER NOT NULL REFERENCES users(id),
  group_id    INTEGER REFERENCES groups(id),
  origin_stop TEXT NOT NULL,
  dest_stop   TEXT NOT NULL,
  earliest_at INTEGER NOT NULL,
  latest_at   INTEGER NOT NULL,
  seats       INTEGER NOT NULL DEFAULT 1 CHECK (seats BETWEEN 1 AND 8),
  max_fare    INTEGER,
  note        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fulfilled','cancelled','expired')),
  created_at  INTEGER NOT NULL,
  CHECK (latest_at >= earliest_at)
);
CREATE INDEX IF NOT EXISTS idx_req_open ON ride_requests(status, earliest_at);

CREATE TABLE IF NOT EXISTS bookings (
  id          INTEGER PRIMARY KEY,
  trip_id     INTEGER NOT NULL REFERENCES trips(id),
  rider_id    INTEGER NOT NULL REFERENCES users(id),
  group_id    INTEGER REFERENCES groups(id),
  request_id  INTEGER REFERENCES ride_requests(id),
  seats       INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 8),
  pickup_stop TEXT NOT NULL,
  drop_stop   TEXT NOT NULL,
  fare_total  INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','confirmed','rejected','cancelled','completed')),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_book_trip ON bookings(trip_id, status);
CREATE INDEX IF NOT EXISTS idx_book_rider ON bookings(rider_id, status);

CREATE TABLE IF NOT EXISTS swipes (
  swiper_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction  TEXT NOT NULL CHECK (direction IN ('like','pass')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (swiper_id, target_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id         INTEGER PRIMARY KEY,
  user_a     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE TABLE IF NOT EXISTS conversations (
  id         INTEGER PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('match','group','booking')),
  ref_id     INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (kind, ref_id)
);
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_id    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, id);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  link       TEXT NOT NULL DEFAULT '',
  read_at    INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  target_id   INTEGER NOT NULL REFERENCES users(id),
  reason      TEXT NOT NULL,
  details     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
`);

/** Run fn inside an IMMEDIATE transaction (takes the write lock up front, so
 *  seat checks and updates cannot interleave with another writer). */
function tx(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch (_) { /* already rolled back */ }
    throw e;
  }
}

module.exports = { db, tx, dbPath };
