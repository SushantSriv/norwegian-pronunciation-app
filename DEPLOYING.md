Written for: whoever is moving this app onto a domain of its own — one person, once, with a card in hand.

# Putting the app on your own domain

Everything in this repository is already prepared for it. What is left is buying a domain
and about twenty minutes of clicking. This is the order to do it in, and what to check
after each step so a mistake is caught where it happened rather than three steps later.

**Nothing here is required.** The app is live on GitHub Pages and stays live throughout;
the old address keeps working until you decide otherwise.

---

## Why Cloudflare, specifically

One reason above the others: **GitHub Pages cannot set response headers, and Cloudflare
Pages can.**

The speech model needs more than one CPU thread to be quick, and a browser only grants
that to a page that is *cross-origin isolated*, which is a property conferred by two
response headers. Measured in Chromium, on the same clip:

| | transcribe | wait after speaking |
|---|---|---|
| one thread | 6.41 s | 5.74 s |
| four threads | 2.96 s | 2.98 s |

On GitHub Pages the app works around this with a service worker that supplies the headers
itself ([`public/coi.js`](public/coi.js)), at the cost of one extra reload on a visitor's
first ever load. On Cloudflare the headers come from the host
([`public/_headers`](public/_headers)) and the very first page load is already isolated.
The service worker stays in place regardless and simply has nothing left to do.

The second reason is that the optional leaderboard already runs on Cloudflare Workers and
D1, so the whole thing ends up in one account with one bill — and at this size, no bill.

Cloudflare now routes even static sites through Workers rather than Pages, which is why
the dashboard talks about a *Worker* throughout. Nothing about this app changes: a Worker
with static assets and no script is a static site.

---

## 1. Buy the domain

Anywhere you like. **Cloudflare Registrar** is the least work because the domain arrives
already on Cloudflare, with nothing to point anywhere, and it sells at cost with no
first-year discount that triples on renewal.

`.no` is worth knowing about before you set your heart on it: Norid requires the
registrant to be an organisation or a person registered in Norway, and it is bought
through a Norwegian registrar rather than Cloudflare. `.com`, `.app` and `.no`-adjacent
options like `.eu` have no such requirement. `.app` is on the HSTS preload list, which
means it is HTTPS-only by force — a small point in its favour for a site that asks for
microphone access, since that requires a secure context anyway.

**If you bought it elsewhere:** add the site in the Cloudflare dashboard (*Add a domain*),
then change the nameservers at your registrar to the two Cloudflare gives you. Propagation
is usually minutes, occasionally a day.

---

## 2. Create the Workers project

Cloudflare has folded Pages into Workers, so the dashboard walks you through a **Worker**
even for a site with no server code. That is fine — a Worker with static assets and no
script is exactly a static site — but it does mean one thing has to exist in the repo that
Pages would not have needed, and it already does: [`wrangler.toml`](wrangler.toml) at the
root, pointing at `dist`. Without it `npx wrangler deploy` has nothing to deploy and the
build fails at the last step.

In the dashboard: **Workers & Pages → Create → Import a repository**, and pick this one.

| Setting | Value |
|---|---|
| Project name | `norwegian-pronunciation-app` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Preview command | `npx wrangler preview` |
| Path | `/` |

And these build variables:

| Variable | Value | Why |
|---|---|---|
| `VITE_BASE` | `/` | The app is served from the root of a domain, not from `/<repo-name>/`. Leave it out and the HTML loads while every asset 404s one directory too deep — which looks exactly like the site being broken. |
| `NODE_VERSION` | `22` | What CI uses. Vite 7 wants 20.19+ or 22.12+, and matching CI means a build that passes there passes here. |
| `VITE_LEADERBOARD_URL` | *(leave empty)* | Set it in step 4, once the worker exists. Empty means the shared board stays off and the community screen shows each learner their own history. |

> `VITE_BASE` is read by [`vite.config.ts`](vite.config.ts) and defaults to the GitHub
> Pages subpath, so none of this disturbs the existing deployment.

**A note on the API token.** Reusing one from another project works only if it is scoped
to the whole account with *Workers Scripts: Edit*. If the deploy fails with a permissions
error, that is why — make a fresh token from the **Edit Cloudflare Workers** template
rather than widening the old one.

The first deploy lands on `<project>.workers.dev`. **Check it before going further:**

```bash
npm run check:deploy -- https://<project>.workers.dev
```

That drives a real browser and checks the things that fail silently: the base path,
cross-origin isolation, the service worker, the manifest, and whether the speech model's
CDN is still reachable. It should report `isolation headers from the host: yes` — that is
the whole point of moving, and it comes from [`public/_headers`](public/_headers), which
Vite copies into `dist` and Workers reads as configuration.

### Deploying from GitHub Actions instead

[`.github/workflows/cloudflare.yml`](.github/workflows/cloudflare.yml) does the same thing
from CI and runs the tests first, which the dashboard's build command does not. It is
inert until you set the repository **variable** `CLOUDFLARE_DEPLOY` to `true`, plus the
secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

**Use one or the other, not both.** The dashboard already deploys on every push; adding
the workflow on top means two systems racing to deploy the same commit.

## 3. Point the domain at it

**The Worker → Settings → Domains & Routes → Add → Custom domain.** Add both the apex
(`example.com`) and `www`; Cloudflare creates the DNS records and issues the certificate
itself, usually within a minute or two.

Then check it again, at the real address:

```bash
npm run check:deploy -- https://example.com
```

---

## 4. The leaderboard, if you want it (optional)

The shared board is off in any build without `VITE_LEADERBOARD_URL`, and the community
screen then shows the learner their own history instead. Turning it on:

```bash
cd server
npx wrangler d1 create norsk-uttale-leaderboard      # copy the id into wrangler.toml
npx wrangler d1 execute norsk-uttale-leaderboard --file=./schema.sql --remote
```

Before deploying, edit [`server/wrangler.toml`](server/wrangler.toml):

- `ALLOWED_ORIGINS` — add your domain. **Do this first.** If the origin is not allowed,
  the first thing the new domain does is fail every sync.
- Uncomment the `[[routes]]` block to serve the worker from `api.example.com` rather than
  `workers.dev`.

```bash
npx wrangler deploy
```

The leaderboard is a **second** Workers project, not part of this one: wrangler reads the
config in its working directory, so the root [`wrangler.toml`](wrangler.toml) deploys the
site and `server/wrangler.toml` deploys the board. To build it from the dashboard too,
create another project against the same repository with **Path** `/server`.

Then set `VITE_LEADERBOARD_URL` to `https://api.example.com` in the site project's build
variables and redeploy. [`server/README.md`](server/README.md) has the data model, the
security model and the free-tier arithmetic.

---

## 5. Afterwards

**Keep GitHub Pages running for a while.** It costs nothing, and it is somewhere to
compare against if something on the new address behaves oddly.

Two things to know about existing visitors:

- **Their progress does not follow them.** The learning profile, the points ledger and the
  leaderboard identity all live in `localStorage`, which is per-origin — someone who has
  been practising on `sushantsriv.github.io` starts empty on the new domain. There is no
  fix for this short of an export/import feature; it is worth deciding whether you care
  before you announce the move.
- **The old service worker keeps serving the old site** until its cache expires or they
  clear it. If you eventually retire the GitHub Pages copy, replace it with a page that
  redirects, rather than deleting it — a stale service worker with nothing behind it is a
  white screen, not a 404.

### Costs

All of it is inside Cloudflare's free tier at any size this app will plausibly reach.
Workers Builds allows 3 000 build minutes a month; static asset requests are unmetered,
and the leaderboard's Worker allows 100 000 requests a day with 100 000 D1 row writes. `server/README.md` works through what
that means in learners: roughly 1 000 people practising daily, with row writes as the
binding constraint. The domain is the only recurring cost.
