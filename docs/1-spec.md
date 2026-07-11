# Flappy Bird Clone — Browser Game Specification

A browser-based clone of Flappy Bird. The player controls a bird named **Faby** who continuously moves toward the right side of the screen. The player clicks or presses the space bar to keep Faby flying through columns of randomly placed green pipes that scroll constantly to the left. Touching a pipe or the ground knocks Faby out and ends the game. The game is endless — the only goal is to score as many points as possible (1 point per pipe column passed).

Visual reference: see [flappy-bird-screens.jpg](./flappy-bird-screens.jpg) for the original mobile game screens (title screen, "Get Ready" screen, and in-game play).

## ✅ Decisions

- **Stack**: Vanilla JavaScript + HTML5 Canvas, no build step, no dependencies.
- **Graphics**: Hand-drawn pixel art rendered procedurally on canvas (no image assets).
- **Audio**: Sound effects (flap, score, hit, die) synthesized with the Web Audio API (no audio files).
- **Canvas**: Adaptive — fixed logical height of 600 px; logical width follows the screen's aspect ratio, clamped between 360 (portrait phones) and 800 (widescreen desktop).

## 💻 Core Browser Engine Specs

- **Technology Stack**: HTML5 Canvas API with Vanilla JavaScript (no framework needed).
- **Canvas Size (adaptive)**: Logical height is always 600 px. Logical width adapts to the window's aspect ratio, clamped to [360, 800] — a phone in portrait plays the original's tall view (~1 pipe visible), a desktop plays the wide 800 × 600 view (2–3 pipes visible). Physics and difficulty are identical on both since height, gravity, gap, and scroll speed are unchanged.
- **Scaling & Resolution**: The canvas is scaled to fill the window (letterboxed against a dark CSS background when clamped) and its backing store is multiplied by `devicePixelRatio` so pixel art stays crisp on high-DPI/Retina displays. Layout recomputes live on `resize`/`orientationchange` — the background is regenerated and the bird's X (30% of width) and centered UI reposition.
- **Mobile**: Touch input via `pointerdown` (with `touch-action: none` to suppress browser gestures), `user-scalable=no` viewport, UI copy switches to "tap" wording, keyboard hints hidden on coarse-pointer devices.
- **Target Frame Rate**: Consistent 60 FPS using `requestAnimationFrame`.

## 🕹️ Desktop Gameplay & Physics Tuning

Because a desktop screen offers a much wider field of view than a mobile phone, the standard mobile physics parameters must be scaled up so the player cannot react too easily.

- **Input Handling**: Listen for `keydown` (specifically the Spacebar) and `mousedown` / `pointerdown` (left mouse click). Prevent the default browser scrolling behavior when the spacebar is pressed.
- **Bird Physics**:
  - **Gravity**: Increase downward acceleration relative to a mobile version so the bird falls quickly.
  - **Jump Force**: A snappy, instantaneous upward velocity boost.
  - **Tilt Rotation**: Rotate the bird sprite up to +20 degrees during a jump, and slowly nose-dive down to -70 degrees when falling.
- **Pipe Architecture**:
  - **Horizontal Gap (Spacing)**: Space the pipe pairs roughly 300 to 350 pixels apart horizontally. This ensures 2 to 3 sets of pipes are always visible on the wider screen at once.
  - **Vertical Passing Gap**: Starts at a friendly 160 px and shrinks with the score (see Progressive Difficulty below), never below 132 px.
  - **Scroll Speed**: Set to roughly 200 to 250 pixels per second moving left (constant).

## 📈 Progressive Difficulty & Ambience

- **Gap Shrink**: The vertical pipe opening starts at **160 px** and narrows by **0.8 px per point scored**, with a floor of **132 px** (reached at score 35). Each pipe captures the current gap when it spawns/recycles, so pipes already on screen never visibly change.
- **Day → Night Cycle**: The background crossfades from the daytime palette to a night one (dark blue sky, stars, dimmed clouds/skyline/bushes) as the score climbs — full night at 20 points, back to day at 40, repeating every 40 points. Both variants are pre-rendered from the same random layout so the crossfade is seamless. Pipes, ground, and the bird stay in their day colors for readability.
- **Constant Elsewhere**: Scroll speed, pipe spacing, gravity, and flap impulse do not ramp — the challenge comes from the tightening gap and the player's endurance, in the spirit of the original.

## 💥 Physical Effects

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
- **Death Sequence Timeline**: smack → flash + shake → recoil off the pipe → tumble nose-down while drifting backward → thud into the dirt → small bounce → settle → Game Over panel slides in.

## 🎨 UI & Game States

Follow the look and feel of the original game screens in [flappy-bird-screens.jpg](./flappy-bird-screens.jpg).

- **Game HUD (Heads-Up Display)**:
  - **Current Score**: Large, stylized font centered at the top (e.g., 40px bold text with outline, as in the original).
  - **High Score**: Saved locally using browser `localStorage`, shown on the game-over screen.
- **State Screens**:
  - **Title Screen**: Game logo, animated floating bird, and a Start button (see screen 1 of the reference).
  - **Get Ready Screen**: "Get Ready" banner with a tap/press hint before the first flap starts the run (see screen 2 of the reference). Show "Press Space or Click to Jump" for desktop.
  - **In-Game**: Score counter at top, pipes scrolling in from the right (see screen 3 of the reference).
  - **Game Over Screen**: A centered panel showing the final score, a medal classification (Bronze ≥ 10, Silver ≥ 25, Gold ≥ 40, Platinum ≥ 60), the high score, a "Try Again" button, and a keyboard shortcut (like `R`) to instantly restart.
- **The Horizon Line**: The scrolling ground texture should occupy the bottom 15% to 20% of the canvas height to properly anchor the scene. City skyline and clouds form the static/parallax background above it.

## ⚡ Technical Implementation Recommendations

- **Delta Time Physics**: Tie bird movement and pipe scrolling to frame delta time (`dt`) rather than assuming a flat 60Hz monitor. If a user plays on a 144Hz desktop monitor, the game will run at double speed without delta time tracking.
- **Invisible Score Triggers**: Place a vertical bounding box exactly in line with the right edge of the pipes. When the bird's X coordinate crosses this box, increment the score counter and play an audio blip.
- **Object Pooling**: Do not constantly destroy and recreate JavaScript objects for the pipes, as this causes browser garbage collection stutter. Instead, recycle old pipes that exit the left side of the canvas by moving them back to the far right side with a newly randomized height calculation.
