Written for: whoever is moving this app onto a domain of its own — one person, once, with a card in hand.

# Putting the app on your own domain

Everything in this repository is already prepared for it. What is left is buying a domain
and about twenty minutes of clicking. This is the order to do it in, and what to check
after each step so a mistake is caught where it happened rather than three steps later.

**Nothing here is required.** The app is live on GitHub Pages and stays live throughout;
the old address keeps working until you decide otherwise.

---

## Why Cloudflare, specifically

Honestly: less than it used to be.

The original reason was that **GitHub Pages cannot set response headers and Cloudflare
can**, and the app needed `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`
to unlock WASM threads for the speech model it carried — worth 6.41 s against 2.96 s on
the same clip. That model has since been removed in favour of the browser's own speech
service, and with it the entire reason those headers mattered.

What remains is ordinary and still sufficient: the optional leaderboard already runs on
Cloudflare Workers and D1, so the whole thing sits in one account with one bill — and at
this size, no bill. Cloudflare now routes even static sites through Workers rather than
Pages, which is why the dashboard talks about a *Worker* throughout. Nothing about this
app changes: a Worker with static assets and no script is a static site.

---

## 1. Buy the domain

**`saynorwegian.app`.** The `.app` TLD is on the browsers' global HSTS preload list, which
means every browser forces HTTPS on it before a request is ever made. That matters more
here than on most sites: `getUserMedia` only works in a secure context, so on plain `http`
the microphone does not merely warn — it does not work at all. With `.app` there is no
path by which a learner lands on an insecure version and finds the app broken.

It reads as a tool rather than a page, too, which is worth something at the moment the
browser asks *"saynorwegian.app wants to use your microphone"*.

**Cloudflare Registrar** is the least work: the domain arrives already on Cloudflare with
nothing to point anywhere, and it sells at cost. `.app` is a Google-operated TLD and
Cloudflare resells it.

If you buy it elsewhere, add the site in the Cloudflare dashboard (*Add a domain*) and
change the nameservers at your registrar to the two Cloudflare gives you. Propagation is
usually minutes.

> The leaderboard's allowed origins already name this domain. Link previews and the
> canonical link do **not** — they default to whichever address is actually serving, and
> you point them here with `VITE_SITE_URL` in step 2, once DNS resolves. Setting it early
> means the live site advertises a host that does not answer, which is worse than saying
> nothing.

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
| `VITE_SITE_URL` | `https://saynorwegian.app/` | **Set this once the domain resolves, not before.** It is the absolute address used for the canonical link and for link previews, which crawlers will not resolve relatively. Left unset, a build describes itself as the GitHub Pages copy — truthful while that is what serves, wrong once this is. |
| `VITE_LEADERBOARD_URL` | *(leave empty)* | Set it in step 4, once the worker exists. Empty means the shared board stays off and the community screen shows each learner their own history. |
| `VITE_ROOM_URL` | `https://norsk-uttale-rom.sushantsrivastava198.workers.dev` | Where the shared exam room lives. **Leave it out and the pair-practice lobby is not shown at all** — the app refuses to offer a button that cannot work — so a build without it looks like the feature is missing. See [server/ROM.md](server/ROM.md). |

> **Build variables are dashboard-only.** None of these four can be set by a
> commit. A build that is missing one does not fail; it quietly ships an app
> with a subpath that 404s, or a feature that hides itself. If something you
> just merged is not visible on the Cloudflare copy, check here first.

### If the build is set to deploy manually

Workers Builds can be switched from building every push to building only when
you ask. When it is, **merging to `main` changes nothing on its own** and no
check is reported against the commit — so a green GitHub Pages run is not
evidence that Cloudflare shipped. Trigger it from *Deployments → New
deployment*, and check which commit the build page names before reading
anything into a failure: a retry re-runs the commit it already had, not the
one you just merged.

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

That drives a real browser and checks the things that fail silently: the base path, a
secure context, whether the browser's speech service is reachable, the service worker, the
manifest, the icons and the link previews.

**The secure-context check matters more than it looks.** `getUserMedia` refuses to run
outside one, so on plain `http` the microphone does not warn — it does not work. That is
also the argument for `.app`.

### Deploying from GitHub Actions instead

[`.github/workflows/cloudflare.yml`](.github/workflows/cloudflare.yml) does the same thing
from CI and runs the tests first, which the dashboard's build command does not. It is
inert until you set the repository **variable** `CLOUDFLARE_DEPLOY` to `true`, plus the
secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

**Use one or the other, not both.** The dashboard already deploys on every push; adding
the workflow on top means two systems racing to deploy the same commit.

## 3. Point the domain at it

**The Worker → Settings → Domains & Routes → Add → Custom domain.** Add both
`saynorwegian.app` and `www.saynorwegian.app`; Cloudflare creates the DNS records and
issues the certificate itself, usually within a minute or two.

Then check it at the real address:

```bash
npm run check:deploy -- https://saynorwegian.app
```

Everything should pass now. If `check:deploy` still prints the `NOTE` about link previews
advertising a different host, `VITE_SITE_URL` has not been set — go back to step 2.

Once it is live, **turn the `workers.dev` URL off** — Worker → Settings → Domains &
Routes. Leaving it on means the app is reachable at two addresses that each keep their own
`localStorage`, so a learner who wanders between them appears to lose all their progress.

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

- `ALLOWED_ORIGINS` already lists `saynorwegian.app`, `www.saynorwegian.app` and the
  GitHub Pages origin, so both addresses work during the move. Trim it afterwards.
- Uncomment the `[[routes]]` block to serve the worker from `api.saynorwegian.app` rather
  than `workers.dev`.

```bash
npx wrangler deploy
```

The leaderboard is a **second** Workers project, not part of this one: wrangler reads the
config in its working directory, so the root [`wrangler.toml`](wrangler.toml) deploys the
site and `server/wrangler.toml` deploys the board. To build it from the dashboard too,
create another project against the same repository with **Path** `/server`.

Then set `VITE_LEADERBOARD_URL` to `https://api.saynorwegian.app` in the site project's
build variables and redeploy. [`server/README.md`](server/README.md) has the data model, the
security model and the free-tier arithmetic.

---

## 5. Afterwards

**Keep GitHub Pages running for a while.** It costs nothing, and it is somewhere to
compare against if something on the new address behaves oddly.

Watch for one thing: **GitHub Pages can switch itself off**, and the deploy then fails with
`Get Pages site failed: Not Found` followed by `Create Pages site failed: Resource not
accessible by integration` — the workflow's `enablement: true` cannot re-create a site the
`GITHUB_TOKEN` is not allowed to create. It happened on this repository during the move to
Cloudflare. The fix is one call:

```bash
gh api -X POST repos/<owner>/<repo>/pages -f build_type=workflow
```

then re-run the workflow. The symptom is a plain GitHub 404 page at the old address while
CI reports the build as failed, so it is worth actually opening the old URL after a merge
rather than trusting that nothing touched it.

**Delete the Vercel project.** The repository has no Vercel configuration — the deployment
comes from the Vercel GitHub App, configured on Vercel's side — but a copy has been live
and broken at `norwegian-pronunciation-app.vercel.app` for some time: it was built for the
GitHub Pages subpath and serves a white page at the root. Remove it in the Vercel
dashboard (*Project → Settings → Delete*), and revoke the app's access to this repository
in GitHub under *Settings → Integrations → Applications → Vercel*.

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
