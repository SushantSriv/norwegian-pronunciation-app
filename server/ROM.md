# The shared exam room

Two candidates, two devices, one conversation — and no audio on the server.

The oral exam has a second candidate, and the conversation task is a fifth to a third
of it. The app cannot supply a person, and it refuses to fake one: a synthetic partner
that always agrees teaches the wrong thing. So this is the alternative. One of you opens
a room, sends the link, and the two browsers connect directly.

## What it carries

Exhaustively: a seat letter, a shared seed, which segment the pair is on, how long each
person has been speaking, and opaque WebRTC signalling blobs.

**Never** audio, transcripts, names, or anything either candidate said. The voices go
peer to peer between the two browsers. A signalling blob is relayed without being parsed
and without being stored. The room could not keep a recording if it wanted to, because
one is never sent to it.

Speaking time is a number each client reports about *itself*. That is trusted on
purpose: there is no leaderboard here and no ranking of any kind, so there is nothing to
gain by lying. It is a pair checking *«er vi begge aktive?»*, not a score.

## What it cannot promise

- **A direct connection is not always possible.** Some networks — a lot of workplace and
  mobile-carrier ones — only allow two browsers to talk through a relay, and running a
  relay (TURN) costs money, so there is not one here. When it fails it fails *visibly*
  and says to try another network.
- **Your IP address is visible to whoever you practise with.** That is how a direct
  connection is made; every video call works this way. It is why the screen says to send
  the code to somebody you meant to practise with.

## Deploying it

```bash
npx wrangler deploy --config server/wrangler.rom.toml
```

It is deployed, at
`https://norsk-uttale-rom.sushantsrivastava198.workers.dev`. To take it down
again: `npx wrangler delete --config server/wrangler.rom.toml`.

Then build the app with `VITE_ROOM_URL` pointing at the worker. **Leave that variable
unset and the pair feature is not offered at all**, which is the right default — an app
should not show a button that cannot work.

| Setting | Value |
|---|---|
| `VITE_ROOM_URL` | `https://norsk-uttale-rom.sushantsrivastava198.workers.dev` today; `https://rom.saynorwegian.app` once the domain exists |
| `ALLOWED_ORIGINS` (in `wrangler.rom.toml`) | every origin the app is served from, comma separated |

Update `ALLOWED_ORIGINS` **before** pointing a new domain at the site, or the first thing
the new domain does is fail every room.

### Locally

`server/.dev.vars` (git-ignored) overrides the variables for `wrangler dev`:

```
ALLOWED_ORIGINS = "http://localhost:5173,http://localhost:5180"
```

```bash
npx wrangler dev --config server/wrangler.rom.toml --port 8788 --local
VITE_ROOM_URL=http://localhost:8788 npm run dev
```

## What it costs

Durable Objects are on the Workers **free** plan with no commitment: 100 000 requests a
day, incoming WebSocket messages billed at a twentieth of a request each, no charge for
outgoing ones, and an idle room hibernates and is billed no duration at all. A rehearsal
is a few hundred messages, so the free allocation is thousands of sessions a day.

## Separate from the leaderboard, on purpose

They share nothing — different data, different failure modes, different reasons to
exist — and a room going down should not take a leaderboard with it. Two configs, two
workers, two deploys.
