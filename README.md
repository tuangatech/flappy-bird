# 🐤 Flappy Bird — Faby

A browser-based Flappy Bird clone built in a weekend. You control **Faby**, a bird who
constantly moves to the right — tap, click, or hit the space bar to flap through the
gaps between green pipes. Touch a pipe or the ground and you're knocked out. The game
is endless; the only goal is a higher score.

Built with **vanilla JavaScript + HTML5 Canvas** — no frameworks, no build step, no
image or audio assets. All pixel art is drawn procedurally on canvas and all sound
effects are synthesized with the Web Audio API.

See [docs/1-spec.md](docs/1-spec.md) for the full game specification.

## Features

- 🎨 Procedural pixel art — Faby, pipes, ground, clouds, and skyline, all drawn in code
- 🔊 Web Audio sound effects — flap, score ding, hit smack, ground thud
- 💥 Physical impact effects — knockback recoil off pipes, tumble rotation, dampened
  ground bounce, screen shake, white flash
- 📈 Progressive difficulty — the pipe gap slowly tightens as you score (160 px → 132 px)
- 🌙 Day → night cycle — the sky crossfades to a starry night as your score climbs,
  cycling back to day every 40 points
- 📱 Adaptive screen — portrait phones get the original tall view (~1 pipe visible),
  desktops get a wide 800×600 view (2–3 pipes); identical difficulty on both
- 🖥️ Crisp on high-DPI/Retina displays (`devicePixelRatio`-aware rendering)
- 🏅 Medals (Bronze / Silver / Gold / Platinum at 10 / 25 / 40 / 60 points) and a
  best score persisted in `localStorage`
- ⚙️ Delta-time physics (consistent speed on 60 Hz and 144 Hz monitors) and pipe
  object pooling (no GC stutter)

## Controls

| Input | Action |
|---|---|
| `Space` / mouse click / tap | Flap |
| `P` | Pause / resume (auto-pauses when the window loses focus) |
| `R` | Restart after game over |
| `M` / click 🔊 icon | Mute / unmute (remembered in `localStorage`) |

## Run locally

No build step — the quickest way is a tiny local server:

```bash
npx serve .              # then visit http://localhost:3000
# or
python3 -m http.server   # then visit http://localhost:8000
```

Opening `index.html` directly (`file://`) also works in Chrome, **but Safari
blocks Web Audio on `file://` pages**, so the game runs silently there. Serve
over HTTP (above) or use the deployed URL to get sound in Safari.

## Project structure

```
├── index.html       # page shell + canvas
├── style.css        # centered dark layout, mobile/touch rules
├── game.js          # the entire game (physics, rendering, audio, states)
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
