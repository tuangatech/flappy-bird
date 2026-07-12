# Flappy Bird Clone — Browser Game Specification

A browser-based clone of Flappy Bird. The player controls a bird named **Faby** who continuously moves toward the right side of the screen. The player clicks or presses the space bar to keep Faby flying through columns of randomly placed green pipes that scroll constantly to the left. Touching a pipe or the ground knocks Faby out and ends the game. The game is endless — the only goal is to score as many points as possible (1 point per pipe column passed).

Visual reference: see [flappy-bird-screens.jpg](./flappy-bird-screens.jpg) for the original mobile game screens (title screen, "Get Ready" screen, and in-game play).

## 🛠️ Tech Stack & Design Decisions

- **Stack**: Vanilla JavaScript + HTML5 Canvas, no build step, no dependencies.
- **Graphics**: Hand-drawn pixel art rendered procedurally on canvas (no image assets).
- **Audio**: Sound effects (flap, score, hit, die) synthesized with the Web Audio API (no audio files).
- **Canvas**: Adaptive — fixed logical height of 600 px; logical width follows the screen's aspect ratio, clamped between 360 (portrait phones) and 800 (widescreen desktop).

## 💻 Engine & Platform Specs

- **Technology Stack**: HTML5 Canvas API with Vanilla JavaScript (no framework needed).
- **Canvas Size (adaptive)**: Logical height is always 600 px. Logical width adapts to the window's aspect ratio, clamped to [360, 800] — a phone in portrait plays the original's tall view (~1 pipe visible), a desktop plays the wide 800 × 600 view (2–3 pipes visible). Physics and difficulty are identical on both since height, gravity, gap, and scroll speed are unchanged.
- **Scaling & Resolution**: The canvas is scaled to fill the window (letterboxed against a dark CSS background when clamped) and its backing store is multiplied by `devicePixelRatio` so pixel art stays crisp on high-DPI/Retina displays. Layout recomputes live on `resize`/`orientationchange` — the background is regenerated and the bird's X (30% of width) and centered UI reposition.
- **Mobile**: Touch input via `pointerdown` (with `touch-action: none` to suppress browser gestures), `user-scalable=no` viewport, UI copy switches to "tap" wording, keyboard hints hidden on coarse-pointer devices.
- **Target Frame Rate**: Consistent 60 FPS using `requestAnimationFrame`.

## 🕹️ Gameplay & Physics Tuning

Because a desktop screen offers a much wider field of view than a mobile phone, the standard mobile physics parameters must be scaled up so the player cannot react too easily.

- **Controls**:
  - **Flap**: `Space`, left mouse click, or touch tap (`pointerdown`). Default browser scrolling on Spacebar is suppressed.
  - **Pause**: `P` toggles; the game also auto-pauses when the window loses focus (`blur`), with a "Paused" overlay.
  - **Restart**: `R` from the game-over (or dying) state.
  - **Mute**: `M`, or the 🔊 icon shown on the title and game-over screens (hidden during play so a corner tap can't eat a flap). Preference persists in `localStorage`.
- **Bird Physics**:
  - **Gravity**: Increase downward acceleration relative to a mobile version so the bird falls quickly.
  - **Jump Force**: A snappy, instantaneous upward velocity boost.
  - **Tilt Rotation**: Rotate the bird sprite up to +20 degrees during a jump, and slowly nose-dive down to -70 degrees when falling.
- **Pipe Architecture**:
  - **Horizontal Gap (Spacing)**: Pipe pairs start 320 px apart (2 to 3 sets visible on the wide desktop screen) and tighten with the score (see Progressive Difficulty below).
  - **Vertical Passing Gap**: Starts at a friendly 160 px and shrinks with the score (see Progressive Difficulty below), never below 132 px.
  - **Scroll Speed**: Starts at 225 pixels per second moving left and rises with the score (see Progressive Difficulty below).

## 📈 Progressive Difficulty

Every difficulty knob ramps **linearly with the score** from a `start` value (ramp begins at score `from`) to an `end` cap (reached at score `to`). All knobs live in the `DIFFICULTY` config at the top of `game.js` — each is independently tunable.

| Knob | Start value | End value (cap) | Ramp begins | Cap reached |
|---|---|---|---|---|
| Vertical pipe gap | 160 px | 132 px | score 10 | score 60 |
| Scroll speed | 225 px/s | 350 px/s | score 30 | score 130 |
| Pipe spacing (horizontal) | 320 px | 220 px | score 50 | score 150 |
| Pipe vertical sway (wobble) | 0 px | ±36 px | score 120 | score 170 |
| Gap step: forced minimum | 0 px | 24 px | score 80 | score 150 |
| Gap step: max rise | 70 px | 65 px | score 0 | score 150 |
| Gap step: max fall | 70 px | 110 px | score 50 | score 150 |

- **Staggered onset**: the gap starts tightening at 10, speed starts rising at 30, spacing starts closing at 50, and past 120 the pipes themselves begin to sway vertically (sine motion, random phase per pipe) — difficulty arrives in layers rather than all at once, and each new ramp reads as a milestone. Everything is at full difficulty by score 170.
- **Moving pipes**: each pipe's sway amplitude is captured at spawn and its base position is placed so the gap can never sway into the ceiling or ground. Collision tracks the moving gap in real time.
- **Course shaping (gap steps)**: each new gap's position is sampled as a *step* from the previous gap, not an absolute position. Early game draws gentle steps (0–70 px); from score 80 a **forced minimum step** ramps in (24 px by 150) so gaps never align — every late pipe demands a move. Steps are **asymmetric**: dives grow to 110 px while climbs cap near 65 px, matching the bird's physics envelope. When the course reaches the ceiling/floor, the step direction bounces.
- **Reachability guarantee**: independent of the configured step ranges, every rise is capped by what the bird can physically climb in the time between pipes — max climb ≈ 260 px/s (flap-spamming), max dive ≈ 500 px/s, computed from the *current* spacing and speed with worst-case wobble subtracted. No layout is ever unwinnable.
- **Per-pipe capture**: each pipe captures the current gap and spacing when it spawns/recycles, so pipes already on screen never visibly change; speed applies globally (ground scroll matches pipe speed).
- **Constant**: gravity and flap impulse never change — the bird always handles the same; only the world gets harder.

## 💥 Impact Physics & Game Feel

Impacts should feel physical rather than scripted — the bird reacts to *what* it hit and *how*, instead of simply freezing and dropping.

- **Flight Physics** (normal play):
  - Constant downward **gravity** (~1700 px/s²) with a **terminal fall velocity** (~650 px/s) so the bird never falls unrealistically fast.
  - A flap applies an **instantaneous upward impulse** (~-380 px/s), replacing the current vertical velocity.
  - **Ceiling clamp**: the bird cannot leave the top of the screen; vertical velocity resets to 0 on contact (not fatal).
- **Pipe Collision — Knockback & Tumble**:
  - **Backward recoil**: on impact the bird is knocked away from the pipe with a horizontal velocity (~-170 px/s) that decays with **air drag** (exponential falloff, `e^(-2.5·t)`), so it drifts backward and slows naturally while falling.
  - **Direction-aware bounce**: if the bird was falling when it hit, it bounces slightly *upward* (~-210 px/s) before gravity takes over; if it was rising (smacked the pipe from below), it is deflected *downward* instead.
  - **Tumble rotation**: instead of the smooth in-flight tilt, the death fall uses an **accelerating spin** (~9 rad/s²) until the bird is fully nose-down (~90°), simulating a knocked-out tumble.
- **Ground Impact — Dampened Bounce**:
  - Hitting the dirt at high speed produces one **dampened bounce** (restitution ≈ 0.35 — the bird rebounds at 35% of impact speed), losing half its horizontal drift and most of its spin, then settles on the ground.
  - Slow contacts settle immediately with no bounce. Ground-slam deaths during play get the same bounce treatment before the Game Over panel appears.
- **Impact Feedback**:
  - **White flash** overlay (~0.12 s) on the killing hit.
  - **Screen shake**: ~8 px amplitude decaying over ~0.4 s on impact, with a smaller shake on the ground bounce.
  - **Audio**: noise-burst "smack" + descending sweep on the pipe hit, low sine "thud" on the ground bounce.
- **Feather & Dust Particles**: a few feathers shake loose on every flap; a pipe hit bursts ~14 feathers; ground impacts kick up a tan dust puff. Particles are pixel squares with gravity, a slight leftward world-drift, a dampened bounce off the dirt, and alpha fade-out.
- **Squash & Stretch**: the sprite compresses (wide + short) for a beat on each flap and stretches (narrow + long) during fast falls — classic animation-principle feedback layered on top of the tilt rotation.
- **Near-Miss Whoosh**: clearing a pipe with less than ~14 px to spare plays a soft wind whoosh under the score ding, acknowledging skilled (or lucky) play.
- **Death Sequence Timeline**: smack → flash + shake → feather burst → recoil off the pipe → tumble nose-down while drifting backward → thud + dust puff into the dirt → small bounce → settle → Game Over panel slides in.

## 🎨 UI & Game States

Follow the look and feel of the original game screens in [flappy-bird-screens.jpg](./flappy-bird-screens.jpg).

- **Game HUD (Heads-Up Display)**:
  - **Current Score**: Large, stylized font centered at the top (e.g., 40px bold text with outline, as in the original).
  - **High Score**: Saved locally using browser `localStorage`, shown on the game-over screen.
- **State Screens**:
  - **Title Screen**: Game logo, animated floating bird, and a Start button (see screen 1 of the reference).
  - **Get Ready Screen**: "Get Ready" banner with a tap/press hint before the first flap starts the run (see screen 2 of the reference). Show "Press Space or Click to Jump" for desktop.
  - **In-Game**: Score counter at top, pipes scrolling in from the right (see screen 3 of the reference).
  - **Game Over Screen**: A centered panel that slides/fades in, showing the final score, a medal classification (Bronze ≥ 25, Silver ≥ 50, Gold ≥ 100, Platinum ≥ 150), the high score with a rotated red "NEW" badge on a fresh record, a "Try Again" button, and a keyboard shortcut (`R`) to instantly restart.
- **The Horizon Line**: The scrolling ground texture should occupy the bottom 15% to 20% of the canvas height to properly anchor the scene. City skyline and clouds form the static/parallax background above it.
- **Day → Night Cycle (ambience)**: The background crossfades from the daytime palette to a night one (dark blue sky, stars, dimmed clouds/skyline/bushes) as the score climbs — full night at 20 points, back to day at 40, repeating every 40 points. Both variants are pre-rendered from the same random layout so the crossfade is seamless. Pipes, ground, and the bird stay in their day colors for readability.

## 🔊 Audio & Sound Design

All sound is synthesized at runtime with the Web Audio API — the project ships zero audio files.

- **Sound Set**: flap (sine sweep down, a wing "swoosh"), score ding (two-tone square — plays on every **10th** pipe as a milestone reward rather than on every pass), near-miss whoosh, hit (low-pass filtered noise burst + low square drop), die (descending sawtooth sweep), ground thud (low sine drop), and a transition swoosh between screens.
- **Mixing**: every voice routes through a single master `GainNode` — one place to mute or set volume.
- **Autoplay/Unlock Strategy** (hard-won, browser-specific):
  - The `AudioContext` is created and `resume()`d **inside user-gesture handlers** (`pointerdown`, `mousedown`, `touchend`, `keydown`), retrying on every gesture until the context reports `running`.
  - A 1-sample **silent buffer is played during the gesture** — required by older Safari to open the output.
  - **iOS**: `navigator.audioSession.type = 'playback'` (iOS 16.4+) plus a silent looping `<audio>` element started on first touch, so the hardware Ring/Silent switch does not mute the game. (iPhone Chrome is WebKit and behaves like iPhone Safari.)
  - Sound calls are wrapped so audio failures can never crash gameplay.
- **Known Limitation**: Safari refuses Web Audio on `file://` pages — the game shows an in-canvas hint and plays silently; serve over HTTP for sound.
- **Status Indicator**: the 🔊/🔇 icon (title & game-over screens) renders translucent while the context is blocked and solid once running — doubling as an audio-health diagnostic.

## ⚡ Rendering & Performance

- **Delta Time Physics**: Bird movement and pipe scrolling are tied to frame delta time (`dt`), clamped to a max step of 1/30 s so a background-tab hiccup can't teleport the bird. Consistent speed on 60 Hz and 144 Hz monitors.
- **Pre-rendered Offscreen Sprites**: All pixel art is generated once into offscreen canvases — the bird's 3 wing frames from string-map pixel grids with a named color palette, pipe body/cap as column-banded strips (the body is a thin strip stretched vertically at draw time), the ground tile, and the two full background variants. Per-frame work is pure `drawImage`/pattern fills; nothing is procedurally redrawn per frame.
- **Seamless Pattern Scrolling**: The scrolling background and ground are drawn as repeating `createPattern` fills with a translate offset — a single fill can't show the hairline seams that image-butting produces at fractional canvas scales.
- **Invisible Score Triggers**: When the bird's X passes a pipe's right edge, the score increments once (per-pipe `scored` flag); the milestone ding plays on every 10th point.
- **Object Pooling**: The 4 pipe pairs are recycled — a pipe exiting the left edge moves back to the right with freshly rolled gap size/position, so no allocation or GC churn during play.

## 🌍 Global Leaderboard

A minimal global board designed for a small, trusted friend group (< 5 players).

- **Storage**: one Redis sorted set (Upstash via Vercel). `ZADD GT` stores each player's personal best atomically — no read-modify-write races, no per-run rows. A companion hash records the date of each best.
- **API**: two Vercel serverless functions — `GET /api/run` issues an HMAC-signed timestamp token at run start; `GET /api/leaderboard` returns the top 10; `POST /api/leaderboard` validates and stores `{name, score, token}`.
- **Plausibility check**: the submit endpoint recomputes the token's signature and derives the run's true wall-clock duration server-side, rejecting scores faster than physics allows (~0.7 s per point + lead-in, from max scroll speed and min pipe spacing) plus an absolute cap. Client-reported timing is never trusted.
- **Nicknames**: social contract — chosen once via an HTML overlay prompt (native keyboard on mobile), stored in `localStorage`, editable from the board panel. Server sanitizes (trim, strip control chars, 12-char max). Duplicate names share an entry by design.
- **UI**: a 🏆 button on the title and game-over screens opens a canvas-drawn panel (top 8, own name highlighted, date per entry, loading/offline/empty states, BACK/Esc/click-outside to close). Keyboard input is suppressed while the name field is focused so typing never flaps the bird.
- **Graceful degradation**: on `file://`, a plain static server, or offline, every fetch failure is caught — the board shows "offline" and gameplay is completely unaffected.

## 🧪 Testing & Debug Hook

- **Debug Hook**: `window.__flappy` exposes read-only game internals (state, score, bird position, pipe positions/gaps, night-cycle phase, audio state, and the difficulty ramp functions) for automated verification. It performs no writes — gameplay cannot be affected by it.
- **Automated Verification**: development is verified with Playwright autopilots that actually play the game — navigating pipes to score, deliberately crashing to assert the impact-physics trajectory (knockback, bounce, settle), measuring empirical scroll speed against the difficulty config, capturing an AnalyserNode peak to prove audible output on both Chromium and WebKit, and pixel-scanning sky rows for rendering seams.
