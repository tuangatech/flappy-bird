# 🐤 Flappy Bird — Faby

**🎮 [Play it now](https://flappy-bird-hanoimail-6658s-projects.vercel.app)** — works on desktop and mobile.

A browser-based Flappy Bird clone built in a weekend. You control **Faby**, a bird who
constantly moves to the right — tap, click, or hit the space bar to flap through the
gaps between green pipes. Touch a pipe or the ground and you're knocked out. The game
is endless; the only goal is a higher score.

Built with **vanilla JavaScript + HTML5 Canvas** — no frameworks, no build step, no
image or audio assets. All pixel art is drawn procedurally on canvas and all sound
effects are synthesized with the Web Audio API.

![Flappy Bird — Faby game screens](docs/screens.png)

See [docs/1-spec.md](docs/1-spec.md) for the full game specification.

## Features

- 🎨 Procedural pixel art — Faby, pipes, ground, clouds, and skyline, all drawn in code
- 🔊 Web Audio sound effects — flap, score ding, hit smack, ground thud
- 💥 Physical impact effects — knockback recoil off pipes, tumble rotation, dampened
  ground bounce, screen shake, white flash, feather bursts and dust puffs, squash &
  stretch, and a near-miss whoosh when you graze a pipe
- 📈 Progressive difficulty — the pipe gap tightens (160 → 132 px between scores 10
  and 60), scroll speed rises (225 → 350 px/s between scores 30 and 130), pipe
  spacing shrinks (320 → 260 px between scores 50 and 150), and past 120 the pipes
  start swaying vertically (up to ±36 px); all tunable via the `DIFFICULTY` config
- 🌙 Day → night cycle — the sky crossfades to a starry night as your score climbs,
  cycling back to day every 40 points
- 📱 Adaptive screen — portrait phones get the original tall view (~1 pipe visible),
  desktops get a wide 800×600 view (2–3 pipes); identical difficulty on both
- 🖥️ Crisp on high-DPI/Retina displays (`devicePixelRatio`-aware rendering)
- 🏅 Medals (Bronze / Silver / Gold / Platinum at 25 / 50 / 100 / 150 points) and a
  best score persisted in `localStorage`
- ⚙️ Delta-time physics (consistent speed on 60 Hz and 144 Hz monitors) and pipe
  object pooling (no GC stutter)
- 🌍 Global leaderboard for your friend group — one Redis sorted set behind two
  Vercel serverless functions, with a run-duration plausibility check (see below)

## Controls

| Input | Action |
|---|---|
| `Space` / mouse click / tap | Flap |
| `P` | Pause / resume (auto-pauses when the window loses focus) |
| `R` | Restart after game over |
| `M` / click 🔊 icon | Mute / unmute (remembered in `localStorage`) |
| 🏆 button | Leaderboard (title & game-over screens); `Esc` closes |

## Run locally

No build step, no dependencies. The easiest way: **double-click `index.html`**
(or drag it into a browser) — the game just runs.

No sound? See [Troubleshooting](#troubleshooting).

## Project structure

```
├── index.html       # page shell + canvas + name-entry overlay
├── style.css        # centered dark layout, mobile/touch rules
├── game.js          # the entire game (physics, rendering, audio, states)
├── package.json     # redis client for the API functions (game itself has no deps)
├── api/
│   ├── run.js           # GET: signed run-start token (for the plausibility check)
│   └── leaderboard.js   # GET: top 10 · POST: submit a score
└── docs/
    ├── 1-spec.md    # game specification
    └── flappy-bird-screens.jpg  # original game reference screens
```

## Tuning

All gameplay knobs are constants at the top of [game.js](game.js): gravity, flap
impulse, pipe speed/gap/spacing, and the impact-physics values (knockback strength,
bounce restitution, spin rate) in `die()` and the `DYING` branch of `update()`.

## Deploy to Vercel

This is a pure static site, so it deploys to Vercel with zero configuration —
no framework preset, no build command, no output directory.

### Prerequisites

1. **A Vercel account** — the free Hobby plan is enough: [vercel.com/signup](https://vercel.com/signup).
2. **Log in once from the CLI** (Option A): `vercel login` — it opens the browser to
   authenticate. (Option B authenticates through the dashboard instead.)
3. **Make the game public** — new Vercel projects ship with **Deployment Protection
   (Vercel Authentication) enabled**, so visitors get a Vercel login wall instead of
   the game. To let anyone play: in the Vercel dashboard go to your project →
   **Settings → Deployment Protection → Vercel Authentication** and set it to
   **Disabled** (or scope it to *Only Preview Deployments* if you want preview URLs
   to stay private while the production URL is public). There's nothing sensitive in
   a static game, so disabling it is fine.

### Option A — Vercel CLI (fastest)

```bash
# install the CLI once
npm i -g vercel

# from the project root
cd flappy-bird
vercel          # preview deployment — answer the prompts (defaults are fine)
vercel --prod   # production deployment
```

When prompted:

- **Set up and deploy?** → `Y`
- **Which scope?** → your account
- **Link to existing project?** → `N` (first time)
- **Project name?** → `flappy-bird` (or anything you like)
- **In which directory is your code located?** → `./`
- Vercel auto-detects **no framework** — accept the defaults (no build command,
  no output directory)

You'll get a live URL like `https://flappy-bird-<hash>.vercel.app` for the preview,
and your production URL after `vercel --prod`.

### Option B — Git integration (auto-deploy on push)

1. Push this folder to a GitHub/GitLab/Bitbucket repository.
2. Go to [vercel.com/new](https://vercel.com/new) and **Import** the repository.
3. Leave everything as detected:
   - **Framework Preset**: `Other`
   - **Build Command**: *(empty)*
   - **Output Directory**: *(empty — serves the repo root)*
4. Click **Deploy**.

Every push to the default branch now deploys to production automatically, and every
pull request gets its own preview URL.

### Notes

- No `vercel.json` is needed. If you ever want cache headers for the game files, a
  minimal one would be:

  ```json
  {
    "headers": [
      {
        "source": "/(.*)\\.(js|css)",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=3600, must-revalidate" }
        ]
      }
    ]
  }
  ```

- The best score is stored in the player's browser (`localStorage`), so it survives
  deployments — nothing server-side to configure.

## Global leaderboard

A tiny global board for a small friend group. Each player's **personal best** is
kept in one Redis sorted set; two serverless functions serve it.

**How it works**

- On game over (score ≥ 1) the game submits your best under your nickname. You're
  asked for a name once (stored in `localStorage`); change it any time via the 🏆
  panel → "tap to change".
- Names are **honor system** — whoever submits under a name shares that entry, so
  agree on names in the group chat.
- **Plausibility check**: when a run starts, the game fetches a signed timestamp
  token (`GET /api/run`). On submit, the server derives the run's true wall-clock
  duration from it and rejects scores that are physically impossible for that time
  (based on max pipe rate) — enough to stop casual `curl` pranks.
- Offline / local file: everything degrades gracefully — the board shows "offline"
  and the game is unaffected.

**Setup (one-time)**

1. In the Vercel dashboard: **Marketplace → Upstash (Redis)** → create a free
   database and connect it to the project. This injects the
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` env vars (the legacy
   `KV_REST_API_*` names also work).
2. Optionally add an `LB_SECRET` env var (any random string) to sign run tokens —
   otherwise the Redis token doubles as the signing secret.
3. Redeploy. Done — no schema, no migrations.

To test the API locally, use `vercel dev` (after `vercel env pull`); a plain
static server serves the game fine but the board will just show "offline".

## Troubleshooting

All of these are about sound — the game itself runs everywhere.

**Check the 🔊 icon first** (title and game-over screens):

| Icon | Meaning |
|---|---|
| Solid 🔊 | Audio engine is running — if it's still silent, the problem is outside the page (tab mute, volume, silent switch). |
| Translucent 🔊 | The browser is blocking audio — see the cases below. |
| 🔇 | Muted in-game — press `M` or click the icon. |

**No sound in Safari on Mac (local file)** — Safari blocks Web Audio on pages
opened via `file://` (the game shows a small hint under the icon). Chrome
doesn't have this restriction. Play the deployed URL, or serve the folder over
a tiny local server:

```bash
npx serve .              # then visit http://localhost:3000
# or
python3 -m http.server   # then visit http://localhost:8000
```

**No sound on iPhone (Safari or Chrome — both are WebKit)** — the game switches
its audio session to *playback* so the Ring/Silent switch shouldn't mute it,
but if you still hear nothing:

1. Tap the screen once (browsers only unlock audio after a user gesture).
2. Press the volume-up button *while the game tab is open* — media volume is
   separate from ringer volume.
3. Check the Ring/Silent switch and Control Center mute.
4. Make sure a Focus mode isn't silencing media.

**Still silent in desktop Safari (served over HTTP)** — check
Safari → Settings → Websites → Auto-Play for the site and set
**"Allow All Auto-Play"**, and look for the tab-mute speaker icon in the
address bar.
