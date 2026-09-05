-- Norsk uttale — leaderboard schema (Cloudflare D1 / SQLite).
--
-- Everything a shared board needs and nothing else. There is no column here
-- for a recording, a transcript, a phrase, an IP address or an email, because
-- the board does not need any of them to rank people and the app has promised
-- not to collect them.
--
--   wrangler d1 execute norsk-uttale-leaderboard --file=./schema.sql --remote

CREATE TABLE IF NOT EXISTS users (
    -- Anonymous, client-generated, 32 hex characters.
    id            TEXT PRIMARY KEY,
    -- SHA-256 of the device secret. The secret itself is never stored, so a
    -- dump of this table cannot be used to post as anybody.
    secret_hash   TEXT NOT NULL,
    nickname      TEXT NOT NULL,
    -- Case- and punctuation-folded, for collision detection.
    nickname_key  TEXT NOT NULL UNIQUE,
    -- Derived by the server from this user's own events; never client-supplied.
    level         TEXT,
    -- Weekly rank at the previous sync, so the app can show movement.
    last_rank     INTEGER,
    last_sync_at  INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
);

-- One row per point award. Totals are always SUM()s over this table: no
-- running total is ever accepted from a client.
CREATE TABLE IF NOT EXISTS events (
    -- Client-generated id, and the whole of the replay defence: submitting the
    -- same event twice is a primary-key conflict, not two payouts.
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    points      INTEGER NOT NULL,
    -- CEFR level of the stage, where it had one. Null for the occupation and
    -- adaptive tracks, which have no rung to report.
    level       TEXT,
    -- UTC day and ISO week of the event, so the daily cap and the weekly board
    -- are index lookups rather than date arithmetic in a query.
    day         TEXT NOT NULL,
    week        TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS events_week ON events (week, user_id);
CREATE INDEX IF NOT EXISTS events_user_day ON events (user_id, day);
CREATE INDEX IF NOT EXISTS events_user_level ON events (user_id, level);

-- Running totals, one row per learner per week plus one 'all' row for their
-- lifetime. Only ever written from events this worker accepted, never from
-- anything a client sent — but kept as rows all the same, because summing the
-- whole events table to render ten names is what would take this out of the
-- free tier.
CREATE TABLE IF NOT EXISTS totals (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- An ISO week key such as '2026-W02', or the literal 'all'.
    week    TEXT NOT NULL,
    points  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, week)
);

CREATE INDEX IF NOT EXISTS totals_board ON totals (week, points DESC);

-- The most-improved board. One row per learner per week; replaced on each
-- sync rather than appended to, because only the latest figure is meaningful.
CREATE TABLE IF NOT EXISTS improvement (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week       TEXT NOT NULL,
    delta      REAL NOT NULL,
    samples    INTEGER NOT NULL,
    baseline   INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, week)
);

CREATE INDEX IF NOT EXISTS improvement_week ON improvement (week, delta DESC);
