# The leaderboard server

**Optional.** The app is a static site and works completely without this. Points,
streaks, leagues and the improvement measure are all computed in the browser and kept in
`localStorage`; without a server the community screen shows a learner their own progress
and says plainly that there is no shared board.

This exists because a board shared *between people* has to live somewhere, and a static
GitHub Pages build has nowhere to put it. It is the smallest thing that can do that job.

---

## What it is

| | |
|---|---|
| Runtime | One Cloudflare Worker (`worker.ts`) |
| Storage | One D1 (SQLite) database, four tables (`schema.sql`) |
| Endpoints | `POST /v1/sync`, `GET /v1/board`, `GET /v1/limits` |
| Dependencies | None. It imports two modules from `../src/utils/`, which is the point |
| Cost | Free tier, with room to spare — see below |

The rules it enforces live in [`../src/utils/leaderboardRules.ts`](../src/utils/leaderboardRules.ts),
which the browser also imports. There is one table of point ceilings, one nickname
validator and one daily cap in this repository, not two — so the caps the client respects
and the caps the server rejects on cannot drift apart.

## Deploying it

```bash
npm install -g wrangler
wrangler login

cd server
wrangler d1 create norsk-uttale-leaderboard      # copy the id into wrangler.toml
wrangler d1 execute norsk-uttale-leaderboard --file=./schema.sql --remote
wrangler deploy
```

Then build the app against it:

```bash
VITE_LEADERBOARD_URL=https://norsk-uttale-leaderboard.<you>.workers.dev npm run build
```

Set `ALLOWED_ORIGINS` in `wrangler.toml` to wherever the app is served from before
deploying, and add `VITE_LEADERBOARD_URL` to the deploy workflow's build step if the
hosted build should have a board.

**Without `VITE_LEADERBOARD_URL` the app never opens a connection to any of this.** That
is the default, and it is what the GitHub Pages build ships as.

## The data model

```
users        id · secret_hash · nickname · nickname_key · level · last_rank
events       id · user_id · kind · points · level · day · week · timestamps
totals       user_id · week ('2026-W02' or 'all') · points
improvement  user_id · week · delta · samples · baseline
```

Totals are always derived here: `totals` is written only from events this worker chose to
accept, and no running total is ever read out of a request. It exists because summing the
whole `events` table to render ten names is the one query that would take this out of the
free tier.

## Security model

The threat is a modified client, because that is what a static web app hands you: anyone
can open devtools and `POST` whatever they like. The design accepts that and bounds it.

**What is defended:**

| Attack | Defence |
|---|---|
| `{"points": 999999}` | Per-kind ceilings in `MAX_POINTS`; anything above is rejected, not clamped |
| Negative or fractional points | Rejected — the engine emits neither, so their presence proves a hand-written payload |
| Arbitrary lifetime totals | Not accepted at all. Every total is a server-side sum of accepted events |
| Replaying yesterday's results | Client-generated event ids are the primary key; a resubmission is a conflict, not a payout |
| Backdating a good week | Events older than seven days or dated in the future are rejected |
| Grinding one exercise | Client-side caps, plus a server-side `DAILY_CAP` of 600 points a day enforced across requests and devices |
| Farming the 50-point streak bonus | One `streak` event per learner per UTC day, counted in the database |
| Posting as somebody else | A random 256-bit device secret, stored only as a SHA-256 hash |
| Nickname abuse | Shared `sanitizeNickname`: length, character class, no links, reserved names refused |
| Request flooding | 200 events a request, one sync per learner per three seconds |

**What is not defended, and why:**

- **Sybils.** Anonymous identities are free to create, so one person can make a hundred.
  Stopping that needs real accounts, which this app does not have and which would cost
  more privacy than the leaderboard is worth.
- **Plausible forgery.** A modified client can post events for practice that never
  happened, up to `DAILY_CAP` a day. The server cannot tell the difference, because the
  audio never leaves the device — that is the same privacy property working against us.
  The ceiling means the prize for cheating is looking like a diligent learner, not
  topping the board by six orders of magnitude.
- **The improvement figure.** `delta` is computed on the device and only sanity-checked
  here (finite, within ±100, backed by at least ten attempts on each side). The server
  never sees individual scores and so cannot recompute it. It is the most trusting number
  in the system; if the most-improved board is ever gamed, this is where.
- **Clock manipulation.** Event timestamps come from the client's clock, within a
  five-minute forward skew. Someone who sets their clock forward can advance a streak.

Closing any of the last three properly means scoring the audio server-side, which would
undo the thing that makes this app worth using.

## Cost

Cloudflare's free tier gives 100 000 Worker requests a day and 100 000 D1 row writes a
day, with 5 million row reads.

A learner practising once a day produces roughly 20–30 events, one sync, and a handful of
board views. At **1 000 daily learners** that is about 5 000 requests, ~30 000 row writes
and — because the boards read from `totals` and not from `events` — a few thousand row
reads a day. Comfortably inside the free tier, with the write count as the binding
constraint. Around 3 000 daily learners it would want either a paid plan (\$5/month) or
batching several events into one row.

## Leagues

`league()` in the client is a badge computed from all-time points: Bronze, Silver, Gold,
Diamond. It is deliberately not a competition.

Real leagues — cohorts of thirty learners who are promoted and relegated weekly, so
everybody is always near the top of *something* — are the right answer to a big board
being discouraging, and are what this should grow into. They need a population to divide
up, and a placement rule for new learners, and a weekly job to do the dividing. None of
that is worth building before there are enough learners to fill one cohort. Deferred on
purpose, not overlooked.
