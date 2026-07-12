(() => {
'use strict';

/* ================================================================
 * Flappy Bird clone — "Faby"
 * Vanilla JS + Canvas, procedural pixel art, Web Audio SFX.
 * See docs/1-spec.md
 * ================================================================ */

/* ---------------- Constants ---------------- */
const H = 600;                       // fixed logical height
let W = 800;                         // logical width adapts to the screen (see resize())
const W_MIN = 360, W_MAX = 800;
const GROUND_H = 96;                 // 16% of canvas height
const GROUND_Y = H - GROUND_H;

const GRAVITY      = 1700;           // px/s^2
const FLAP_VY      = -380;           // px/s impulse
const MAX_VY       = 650;            // terminal fall speed

const PIPE_W       = 70;
const NIGHT_CYCLE  = 40;             // points per full day->night->day cycle

// Progressive difficulty: each knob ramps linearly with the score, from its
// `start` value (beginning at score `from`) to its `end` cap (at score `to`).
const DIFFICULTY = {
  gap:     { start: 160, end: 132, from: 10,  to: 60  }, // px vertical opening
  speed:   { start: 225, end: 350, from: 30,  to: 130 }, // px/s scrolling left
  spacing: { start: 320, end: 220, from: 50,  to: 150 }, // px between pipe pairs
  wobble:  { start: 0,   end: 36,  from: 120, to: 170 }, // px pipe vertical sway
  // vertical step between consecutive gap centers ("course shape"):
  // gentle early, forced movement late, dives bigger than climbs
  stepMin:  { start: 0,  end: 24,  from: 80, to: 150 }, // no aligned gaps late
  stepRise: { start: 70, end: 65,  from: 0,  to: 150 }, // max upward step
  stepFall: { start: 70, end: 110, from: 50, to: 150 }, // max downward step
};
function ramp({ start, end, from, to }, s) {
  const t = Math.min(1, Math.max(0, (s - from) / (to - from)));
  return start + (end - start) * t;
}
const gapFor      = s => ramp(DIFFICULTY.gap, s);
const speedFor    = s => ramp(DIFFICULTY.speed, s);
const spacingFor  = s => ramp(DIFFICULTY.spacing, s);
const wobbleFor   = s => ramp(DIFFICULTY.wobble, s);
const stepMinFor  = s => ramp(DIFFICULTY.stepMin, s);
const stepRiseFor = s => ramp(DIFFICULTY.stepRise, s);
const stepFallFor = s => ramp(DIFFICULTY.stepFall, s);
const PIPE_COUNT   = 4;              // pooled pipe pairs
const GAP_MARGIN   = 70;             // min distance of gap center from top/ground

let birdX          = 240;            // ~30% from the left, recomputed on resize
const BIRD_R       = 12;             // collision radius
const BG_SPEED     = 40;             // parallax background scroll

const OUTLINE = '#543847';
const BEST_KEY = 'flappy.best';

/* ---------------- Canvas ---------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

/* ---------------- Pixel sprite helpers ---------------- */
const PALETTE = {
  k: OUTLINE,      // outline
  y: '#f8c435',    // body yellow
  Y: '#fbe38a',    // highlight
  w: '#ffffff',    // white (eye, wing)
  o: '#fb8332',    // beak orange
  b: '#f5e6c0',    // belly cream
};

function makeSprite(rows, scale) {
  const w = Math.max(...rows.map(r => r.length));
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = rows.length * scale;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = PALETTE[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  return c;
}

/* Faby's body (17 x 12), wing drawn separately per animation frame */
const BIRD_BODY = [
  '.....kkkkkk......',
  '...kkyyyyyykk....',
  '..kyyyyyykwwwwk..',
  '.kyyyyyyykwwkwk..',
  '.kyyyyyyykwwkwk..',
  'kyyyyyyyyykwwwwk.',
  'kyyyyyyyyyykkkkkk',
  'kyyyyyyyyykoooook',
  '.kyyyyyyybkkkkkkk',
  '..kkkkybbbkooook.',
  '...kkbbbbbbkkkk..',
  '.....kkkkkk......',
];
const BIRD_WING = [
  'kkkkk..',
  'kwwwwk.',
  'kwwwwwk',
  '.kkkkk.',
];

const BIRD_SCALE = 3;
const WING_Y = [2, 5, 7]; // row offset of the wing per frame: up, mid, down

const birdFrames = WING_Y.map(wy => {
  const body = makeSprite(BIRD_BODY, BIRD_SCALE);
  const wing = makeSprite(BIRD_WING, BIRD_SCALE);
  const g = body.getContext('2d');
  g.drawImage(wing, 1 * BIRD_SCALE, wy * BIRD_SCALE);
  return body;
});
const BIRD_W = birdFrames[0].width;   // 51
const BIRD_H = birdFrames[0].height;  // 36

/* ---------------- Pipe pre-render ---------------- */
function pipeBands(width) {
  // [startFraction, color] vertical column bands, left to right
  return [
    [0.00, OUTLINE],
    [0.03, '#e7f9d0'],
    [0.09, '#8ed94e'],
    [0.34, '#6cbf34'],
    [0.70, '#4f9426'],
    [0.90, '#3a701c'],
    [0.97, OUTLINE],
  ].map(([f, c]) => [Math.round(f * width), c]);
}

function makePipeBody() {
  const c = document.createElement('canvas');
  c.width = PIPE_W;
  c.height = 8; // stretched vertically when drawn (columns are constant)
  const g = c.getContext('2d');
  const bands = pipeBands(PIPE_W);
  for (let i = 0; i < bands.length; i++) {
    const [x0, col] = bands[i];
    const x1 = i + 1 < bands.length ? bands[i + 1][0] : PIPE_W;
    g.fillStyle = col;
    g.fillRect(x0, 0, x1 - x0, c.height);
  }
  return c;
}

const CAP_H = 26, CAP_OVER = 4;
function makePipeCap() {
  const w = PIPE_W + CAP_OVER * 2;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = CAP_H;
  const g = c.getContext('2d');
  const bands = pipeBands(w);
  for (let i = 0; i < bands.length; i++) {
    const [x0, col] = bands[i];
    const x1 = i + 1 < bands.length ? bands[i + 1][0] : w;
    g.fillStyle = col;
    g.fillRect(x0, 0, x1 - x0, CAP_H);
  }
  g.fillStyle = OUTLINE;
  g.fillRect(0, 0, w, 2);
  g.fillRect(0, CAP_H - 2, w, 2);
  return c;
}

const pipeBody = makePipeBody();
const pipeCap = makePipeCap();

function drawPipePair(x, gapY, gap) {
  const topEnd = gapY - gap / 2;   // bottom edge of top pipe
  const botStart = gapY + gap / 2; // top edge of bottom pipe
  // top pipe
  ctx.drawImage(pipeBody, x, -2, PIPE_W, topEnd - CAP_H + 2);
  ctx.drawImage(pipeCap, x - CAP_OVER, topEnd - CAP_H);
  // bottom pipe
  ctx.drawImage(pipeCap, x - CAP_OVER, botStart);
  ctx.drawImage(pipeBody, x, botStart + CAP_H, PIPE_W, GROUND_Y - botStart - CAP_H + 2);
}

/* ---------------- Background pre-render (day & night) ---------------- */
// Both variants render from ONE random layout so they crossfade cleanly
// as the sky shifts from day to night with the player's score.

const BG_DAY = {
  sky: '#70c5ce', cloud: '#ffffff', building: '#cdeec5',
  winline: '#b9e3b0', bush: '#9be36a', bushStrip: '#7ed957', stars: false,
};
const BG_NIGHT = {
  sky: '#1c3c55', cloud: '#b6cbdb', building: '#3f6076',
  winline: '#557d94', bush: '#2e7a44', bushStrip: '#266a39', stars: true,
};

let bgLayout = null;

function makeBgLayout() {
  const clouds = [], buildings = [], bushes = [], stars = [];
  for (let x = 0; x < W; x += 34 + Math.random() * 30)
    clouds.push({ x, r: 20 + Math.random() * 22 });
  for (let x = 0; x < W; x += 26 + Math.random() * 34)
    buildings.push({ x, w: 22 + Math.random() * 30, h: 26 + Math.random() * 46 });
  for (let x = 0; x < W; x += 30 + Math.random() * 26)
    bushes.push({ x, r: 16 + Math.random() * 18 });
  for (let i = 0; i < 45; i++)
    stars.push({ x: Math.random() * W, y: Math.random() * 330, s: Math.random() < 0.25 ? 3 : 2 });
  return { clouds, buildings, bushes, stars };
}

function makeBackground(pal) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = GROUND_Y;
  const g = c.getContext('2d');

  // sky
  g.fillStyle = pal.sky;
  g.fillRect(0, 0, W, GROUND_Y);

  // stars (night only)
  if (pal.stars) {
    g.fillStyle = '#e9f3ff';
    for (const st of bgLayout.stars) g.fillRect(st.x, st.y, st.s, st.s);
  }

  // helper: draw a feature at x, x-W and x+W so the tile wraps seamlessly
  const wrapped = fn => x => { fn(x - W); fn(x); fn(x + W); };

  // clouds: bumpy band
  const cloudTop = 398;
  g.fillStyle = pal.cloud;
  for (const cl of bgLayout.clouds) {
    wrapped(px => {
      g.beginPath();
      g.arc(px, cloudTop + 14, cl.r, Math.PI, 0);
      g.fill();
    })(cl.x);
  }
  g.fillRect(0, cloudTop + 12, W, GROUND_Y - cloudTop - 12);

  // city skyline silhouette
  g.fillStyle = pal.building;
  for (const b of bgLayout.buildings) {
    wrapped(px => g.fillRect(px, GROUND_Y - 22 - b.h, b.w, b.h))(b.x);
  }
  // windows-ish texture line
  g.fillStyle = pal.winline;
  g.fillRect(0, GROUND_Y - 30, W, 8);

  // bushes: green bumps hugging the ground
  g.fillStyle = pal.bush;
  for (const bu of bgLayout.bushes) {
    wrapped(px => {
      g.beginPath();
      g.arc(px, GROUND_Y + 6, bu.r, Math.PI, 0);
      g.fill();
    })(bu.x);
  }
  g.fillStyle = pal.bushStrip;
  g.fillRect(0, GROUND_Y - 8, W, 8);

  return c;
}

// Backgrounds are drawn as repeating patterns (single fill) rather than two
// images butted edge-to-edge — fractional canvas scales would otherwise show
// a hairline seam where the copies meet.
let dayBg = null, nightBg = null, dayPat = null, nightPat = null;
function rebuildBackgrounds() { // regenerated on resize (depends on W)
  bgLayout = makeBgLayout();
  dayBg = makeBackground(BG_DAY);
  nightBg = makeBackground(BG_NIGHT);
  dayPat = ctx.createPattern(dayBg, 'repeat');
  nightPat = ctx.createPattern(nightBg, 'repeat');
}
rebuildBackgrounds();

/* ---------------- Ground tile pre-render ---------------- */
function makeGroundTile() {
  const tw = 48;
  const c = document.createElement('canvas');
  c.width = tw;
  c.height = GROUND_H;
  const g = c.getContext('2d');

  // dirt base
  g.fillStyle = '#ded895';
  g.fillRect(0, 0, tw, GROUND_H);

  // diagonal green stripes on top
  for (let y = 0; y < 14; y += 2) {
    for (let x = 0; x < tw; x += 2) {
      const light = ((x - y) % 24 + 24) % 24 < 12;
      g.fillStyle = light ? '#9be34f' : '#7ac33e';
      g.fillRect(x, y, 2, 2);
    }
  }
  // bright top lip + dark separator under the grass
  g.fillStyle = '#d3f894';
  g.fillRect(0, 0, tw, 2);
  g.fillStyle = OUTLINE;
  g.fillRect(0, 14, tw, 3);

  // subtle dirt strata
  g.fillStyle = '#f0ebb8';
  g.fillRect(0, 26, tw, 3);
  g.fillStyle = '#cbc37e';
  g.fillRect(0, 48, tw, 2);
  g.fillRect(0, 74, tw, 2);
  return c;
}
const groundTile = makeGroundTile();
const groundPat = ctx.createPattern(groundTile, 'repeat');

/* ---------------- Audio (Web Audio API) ---------------- */
let actx = null, masterGain = null;
let muted = localStorage.getItem('flappy.muted') === '1';

function audioCtx() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null; // no Web Audio support: play silently
    actx = new AC();
    masterGain = actx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(actx.destination);
  }
  // browsers create/keep the context 'suspended' until a user gesture
  if (actx.state === 'suspended') actx.resume();
  return actx;
}

function setMuted(m) {
  muted = m;
  localStorage.setItem('flappy.muted', m ? '1' : '0');
  if (masterGain) masterGain.gain.value = m ? 0 : 1;
}

// iOS mutes Web Audio with the hardware Ring/Silent switch unless the page's
// audio session is 'playback'. Modern Safari (iOS 16.4+) exposes
// navigator.audioSession; older iOS switches category when an HTML <audio>
// element plays. Do both. (iPhone Chrome is WebKit, so this covers it too.)
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }

const SILENT_WAV = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==';
let kickEl = null;
function iosAudioKick() {
  if (kickEl) return;
  try {
    kickEl = document.createElement('audio');
    kickEl.setAttribute('playsinline', '');
    kickEl.loop = true; // keep the playback session alive
    kickEl.src = SILENT_WAV;
    kickEl.play().catch(() => { kickEl = null; }); // retry on next gesture
  } catch (e) { kickEl = null; }
}

// Unlock audio on user gestures. Safari is strict: the context must be
// created/resumed inside the gesture AND (on older versions) a silent
// buffer must be played to open the output. Keep trying on every gesture
// until the context reports 'running'.
let audioUnlocked = false;
function unlockAudio() {
  iosAudioKick(); // must also happen inside a gesture
  if (audioUnlocked) return;
  const ac = audioCtx(); // creates + resume()s inside the gesture
  if (!ac) return;
  try {
    const src = ac.createBufferSource();
    src.buffer = ac.createBuffer(1, 1, 22050); // 1-sample silent buffer
    src.connect(ac.destination);
    src.start(0);
  } catch (e) { /* ignore */ }
  if (ac.state === 'running') audioUnlocked = true;
}
['pointerdown', 'mousedown', 'touchend', 'keydown'].forEach(ev =>
  window.addEventListener(ev, unlockAudio, true));

function tone({ type = 'square', from = 600, to = from, dur = 0.08, vol = 0.2, delay = 0 }) {
  try {
    const ac = audioCtx();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    // NOTE: no connect() chaining — Safari's webkitAudioContext returns
    // undefined from connect(), which would throw and kill every sound
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch (e) { /* audio is never worth crashing the game over */ }
}

function noise({ dur = 0.15, vol = 0.25, delay = 0 }) {
  try {
    const ac = audioCtx();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.start(t0);
  } catch (e) { /* ignore */ }
}

const sfx = {
  flap()  { tone({ type: 'sine', from: 520, to: 170, dur: 0.10, vol: 0.4 }); },
  point() {
    tone({ type: 'square', from: 920, dur: 0.06, vol: 0.25 });
    tone({ type: 'square', from: 1240, dur: 0.09, vol: 0.25, delay: 0.07 });
  },
  hit()   {
    noise({ dur: 0.15, vol: 0.4 });
    tone({ type: 'square', from: 220, to: 60, dur: 0.2, vol: 0.35 });
  },
  die()   { tone({ type: 'sawtooth', from: 380, to: 70, dur: 0.45, vol: 0.28, delay: 0.15 }); },
  thud()  { tone({ type: 'sine', from: 130, to: 55, dur: 0.12, vol: 0.3 }); },
  swoosh() { noise({ dur: 0.2, vol: 0.18 }); },
  nearMiss() { noise({ dur: 0.3, vol: 0.28 }); }, // soft whoosh for grazing a pipe
};

/* ---------------- Particles (feathers & dust) ---------------- */
const particles = []; // { x, y, vx, vy, size, color, life, maxLife, gravity }

function spawnParticles(n, { x, y, colors, speed, up = 0, gravity = 400, life = 0.6, size = 4 }) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.6);
    particles.push({
      x, y,
      vx: Math.cos(a) * v - 30,          // slight leftward drift with the world
      vy: Math.sin(a) * v - up,
      size: size * (0.6 + Math.random() * 0.8),
      color: colors[(Math.random() * colors.length) | 0],
      life: life * (0.6 + Math.random() * 0.8),
      maxLife: life,
      gravity,
    });
  }
}

const featherBurst = (x, y, n, speed) =>
  spawnParticles(n, { x, y, colors: ['#f8c435', '#fbe38a', '#ffffff'], speed, gravity: 350, life: 0.7 });
const dustPuff = (x, y) =>
  spawnParticles(10, { x, y, colors: ['#d8cf9a', '#cbc37e', '#f0ebb8'], speed: 90, up: 90, gravity: 500, life: 0.5, size: 5 });

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y > GROUND_Y - 2) { p.y = GROUND_Y - 2; p.vy *= -0.4; } // settle on the dirt
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life / (p.maxLife * 0.5));
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

/* ---------------- Game state ---------------- */
const STATE = { TITLE: 0, READY: 1, PLAY: 2, DYING: 3, OVER: 4 };
let state = STATE.TITLE;
let paused = false;

const bird = { x: birdX, y: 0, vy: 0, vx: 0, rot: 0, spin: 0, frame: 0, flapT: 0 };
const pipes = []; // { x, gapY, scored }
for (let i = 0; i < PIPE_COUNT; i++) {
  pipes.push({ x: 0, gapY: 0, baseY: 0, gap: DIFFICULTY.gap.start, amp: 0, phase: 0, scored: false });
}

let score = 0;
let best = Number(localStorage.getItem(BEST_KEY)) || 0;
let newBest = false;
let groundX = 0;
let bgX = 0;
let time = 0;        // global clock for animations
let overAt = 0;      // time when game-over panel appeared
let flashT = 0;      // white flash on hit
let shakeT = 0;      // screen shake timer
const SHAKE_DUR = 0.4;
let nightT = 0;      // 0 = day, 1 = night; follows the score cycle smoothly

// How fast the bird can actually move vertically, for reachability clamps:
// spamming flaps sustains ~270 px/s of climb; diving reaches ~650 px/s.
const MAX_CLIMB_RATE = 260; // slightly conservative
const MAX_DIVE_RATE = 500;

function rollPipe(p, s, prev) {
  p.gap = gapFor(s);
  p.amp = wobbleFor(s); // vertical sway amplitude (0 until score 120)
  p.phase = Math.random() * Math.PI * 2;
  // reserve the sway range so the gap never wobbles into the ceiling/ground
  const half = p.gap / 2 + p.amp + GAP_MARGIN;
  const minY = half, maxY = GROUND_Y - half;

  let y;
  if (!prev) {
    y = minY + Math.random() * (maxY - minY);
  } else {
    // Course shape: sample the STEP from the previous gap, not an absolute
    // position — gentle steps early, forced movement late (stepMin), and
    // asymmetric limits (dives can be bigger than climbs).
    const stepMin = stepMinFor(s);
    // reachability caps the rise regardless of the configured range: the
    // bird can only climb ~260 px/s (flap-spamming) / dive ~500 px/s in
    // the time between pipes, worst-case wobble subtracted
    const t = spacingFor(s) / speedFor(s);
    const riseCap = Math.max(40, 0.85 * t * MAX_CLIMB_RATE - p.amp - prev.amp);
    const fallCap = Math.max(60, 0.90 * t * MAX_DIVE_RATE - p.amp - prev.amp);
    const maxRise = Math.min(stepRiseFor(s), riseCap);
    const maxFall = Math.min(stepFallFor(s), fallCap);

    let up = Math.random() < 0.5;
    // bounce off the ceiling/floor when there's no room for the min step
    if (up && prev.baseY - stepMin < minY) up = false;
    else if (!up && prev.baseY + stepMin > maxY) up = true;

    const maxStep = up ? maxRise : maxFall;
    const step = stepMin + Math.random() * Math.max(0, maxStep - stepMin);
    y = prev.baseY + (up ? -step : step);
    y = Math.max(minY, Math.min(maxY, y));
  }

  p.baseY = y;
  p.gapY = y;
  p.scored = false;
}

function resetPipes() {
  let prev = null;
  pipes.forEach((p, i) => {
    p.x = W + 150 + i * spacingFor(0);
    rollPipe(p, 0, prev);
    prev = p;
  });
}

function goReady() {
  state = STATE.READY;
  score = 0;
  newBest = false;
  bird.x = birdX;
  bird.y = GROUND_Y / 2;
  bird.vy = 0;
  bird.vx = 0;
  bird.rot = 0;
  bird.spin = 0;
  bird.flapT = 0;
  particles.length = 0;
  resetPipes();
  sfx.swoosh();
}

function startPlay() {
  state = STATE.PLAY;
  runTokenPromise = api.startRun(); // timestamps the run for the leaderboard
  flap();
}

function flap() {
  bird.vy = FLAP_VY;
  bird.rot = -0.35;
  bird.flapT = 1; // drives the squash pose, decays in update()
  featherBurst(bird.x - 12, bird.y + 10, 3, 70); // a few feathers shake loose
  sfx.flap();
}

function die(hitPipe) {
  state = STATE.DYING;
  flashT = 0.12;
  shakeT = SHAKE_DUR;
  sfx.hit();
  if (hitPipe) {
    // recoil off the pipe: knocked backward, tumbling. If the bird was
    // rising it smacked the pipe from below, so deflect it downward;
    // otherwise it bounces up a little before gravity takes over.
    bird.vx = -170;
    bird.vy = bird.vy < 0 ? 120 : -210;
    bird.spin = 3.5;
    featherBurst(bird.x + 10, bird.y, 14, 180); // feathers everywhere
    sfx.die();
  } else {
    // slammed into the ground: dampened bounce before settling
    bird.vy = -Math.max(bird.vy, 300) * 0.35;
    bird.vx = -60;
    bird.spin = 3;
    featherBurst(bird.x, bird.y, 8, 130);
    dustPuff(bird.x, GROUND_Y);
  }
}

function gameOver() {
  state = STATE.OVER;
  overAt = time;
  if (score > best) {
    best = score;
    newBest = true;
    localStorage.setItem(BEST_KEY, String(best));
  }
  maybeSubmit(score); // fire-and-forget; never blocks the game
  sfx.swoosh();
}

/* ---------------- Global leaderboard ---------------- */
const NICK_KEY = 'flappy.nick';
let nick = localStorage.getItem(NICK_KEY) || '';
let runTokenPromise = null; // fetched at run start, awaited at submit
let board = null;           // cached [{ name, score, at }]
let boardStatus = 'idle';   // idle | loading | ready | error
let boardOpen = false;
let askedNick = false;      // don't re-prompt within a session after a skip
const boardRects = { back: null, name: null }; // hit areas, set during draw

const API_AVAILABLE = location.protocol !== 'file:'; // no functions without a server

const api = {
  async startRun() {
    if (!API_AVAILABLE) return null;
    try {
      const r = await fetch('api/run');
      return r.ok ? (await r.json()).token : null;
    } catch (e) { return null; }
  },
  async top() {
    if (!API_AVAILABLE) throw new Error('unavailable');
    const r = await fetch('api/leaderboard');
    if (!r.ok) throw new Error('unavailable');
    return (await r.json()).board || [];
  },
  async submit(name, s, token) {
    try {
      await fetch('api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score: s, token }),
      });
    } catch (e) { /* offline: the run just doesn't make the board */ }
  },
};

function promptNick() {
  return new Promise(resolve => {
    const overlay = document.getElementById('nick-overlay');
    const input = document.getElementById('nick-input');
    const ok = document.getElementById('nick-ok');
    const skip = document.getElementById('nick-skip');
    input.value = nick;
    overlay.hidden = false;
    setTimeout(() => input.focus(), 30);
    const finish = save => {
      overlay.hidden = true;
      ok.removeEventListener('click', onOk);
      skip.removeEventListener('click', onSkip);
      input.removeEventListener('keydown', onKey);
      resolve(save ? input.value.trim().slice(0, 12) : null);
    };
    const onOk = () => finish(true);
    const onSkip = () => finish(false);
    const onKey = e => {
      e.stopPropagation(); // typing must never flap the bird
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    };
    ok.addEventListener('click', onOk);
    skip.addEventListener('click', onSkip);
    input.addEventListener('keydown', onKey);
  });
}

async function changeNick() {
  const n = await promptNick();
  if (n === null) return; // cancelled
  nick = n;
  if (nick) localStorage.setItem(NICK_KEY, nick);
  else localStorage.removeItem(NICK_KEY);
}

async function maybeSubmit(finalScore) {
  if (finalScore <= 0) return;
  const token = runTokenPromise ? await runTokenPromise : null;
  if (!token) return; // API unreachable (file://, local static server, offline)
  if (!nick && !askedNick) {
    askedNick = true;
    await changeNick();
  }
  if (!nick) return;
  await api.submit(nick, finalScore, token);
  board = null; // refetch next time the panel opens
}

function openBoard() {
  boardOpen = true;
  if (!board) {
    boardStatus = 'loading';
    api.top()
      .then(b => { board = b; boardStatus = 'ready'; })
      .catch(() => { boardStatus = 'error'; });
  } else {
    boardStatus = 'ready';
  }
}

function medalFor(s) {
  if (s >= 150) return { label: 'PLATINUM', color: '#e3e6ea', shine: '#ffffff' };
  if (s >= 100) return { label: 'GOLD',     color: '#f8d838', shine: '#fdf2a8' };
  if (s >= 50)  return { label: 'SILVER',   color: '#c9cdd4', shine: '#eef0f4' };
  if (s >= 25)  return { label: 'BRONZE',   color: '#cd8b52', shine: '#e8b98a' };
  return null;
}

/* ---------------- Update ---------------- */
function circleRectHit(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function update(dt) {
  time += dt;
  if (flashT > 0) flashT -= dt;
  if (shakeT > 0) shakeT -= dt;
  bird.flapT = Math.max(0, bird.flapT - dt * 6);
  updateParticles(dt);

  // day -> night -> day, one full cycle every NIGHT_CYCLE points
  const targetNight = (1 - Math.cos((score % NIGHT_CYCLE) / NIGHT_CYCLE * Math.PI * 2)) / 2;
  nightT += (targetNight - nightT) * Math.min(1, dt * 1.5);

  const scrollSpeed = speedFor(score); // ramps with score; base speed on menus (score 0)
  const scrolling = state === STATE.TITLE || state === STATE.READY || state === STATE.PLAY;
  if (scrolling) {
    groundX = (groundX - scrollSpeed * dt) % groundTile.width;
    bgX = (bgX - BG_SPEED * dt) % W;
  }

  if (state === STATE.TITLE || state === STATE.READY) {
    // idle bobbing
    bird.y = GROUND_Y / 2 + Math.sin(time * 4.5) * 7;
    bird.rot = 0;
    bird.frame = Math.floor(time * 8) % 4;
    return;
  }

  if (state === STATE.PLAY || state === STATE.DYING) {
    // bird physics
    bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_VY);
    bird.y += bird.vy * dt;

    // ceiling clamp
    if (bird.y < BIRD_R) { bird.y = BIRD_R; bird.vy = 0; }

    if (state === STATE.DYING) {
      // knockback drifts backward and fades out with air drag
      bird.x += bird.vx * dt;
      bird.vx *= Math.exp(-2.5 * dt);
      bird.x = Math.max(BIRD_W / 2 + 4, bird.x);
      // tumble: spin accelerates as it falls, until fully nose-down
      bird.rot = Math.min(1.6, bird.rot + bird.spin * dt);
      bird.spin += 9 * dt;
    } else {
      // rotation: quick up-tilt after a flap, slow nose-dive when falling
      const target = bird.vy < 60 ? -0.35 : Math.min(1.5, -0.35 + (bird.vy - 60) / 420 * 1.85);
      const rate = bird.vy < 60 ? 14 : 6;
      bird.rot += (target - bird.rot) * Math.min(1, dt * rate);
    }

    bird.frame = state === STATE.DYING ? 1 : Math.floor(time * 10) % 4;

    // ground contact
    if (bird.y + BIRD_R >= GROUND_Y) {
      bird.y = GROUND_Y - BIRD_R;
      if (state === STATE.PLAY) { die(false); return; }
      if (bird.vy > 250) {
        // dampened bounce off the dirt
        bird.vy = -bird.vy * 0.35;
        bird.vx *= 0.5;
        bird.spin *= 0.4;
        shakeT = Math.max(shakeT, 0.15);
        dustPuff(bird.x, GROUND_Y);
        sfx.thud();
      } else {
        gameOver();
        return;
      }
    }
  }

  if (state === STATE.PLAY) {
    for (const p of pipes) {
      p.x -= scrollSpeed * dt;

      // recycle pipe that left the screen (object pooling);
      // it captures the current difficulty's gap/wobble for its next pass
      if (p.x + PIPE_W < -CAP_OVER) {
        const prev = pipes.reduce((a, b) => (a.x > b.x ? a : b)); // rightmost
        p.x = prev.x + spacingFor(score);
        rollPipe(p, score, prev);
      }

      // high-score pipes sway vertically around their base position
      if (p.amp > 0) p.gapY = p.baseY + Math.sin(time * 1.8 + p.phase) * p.amp;

      // scoring: bird passed the pipe's right edge
      if (!p.scored && p.x + PIPE_W < bird.x) {
        p.scored = true;
        score++;
        // grazed the pipe by a few pixels? acknowledge the style
        const clearance = Math.min(
          bird.y - (p.gapY - p.gap / 2),
          (p.gapY + p.gap / 2) - bird.y
        ) - BIRD_R;
        if (clearance < 14) sfx.nearMiss();
        // the ding is a milestone reward, not a metronome: every 10th pipe
        if (score % 10 === 0) sfx.point();
      }

      // collision
      const topEnd = p.gapY - p.gap / 2;
      const botStart = p.gapY + p.gap / 2;
      if (circleRectHit(bird.x, bird.y, BIRD_R, p.x, 0, PIPE_W, topEnd) ||
          circleRectHit(bird.x, bird.y, BIRD_R, p.x, botStart, PIPE_W, GROUND_Y - botStart)) {
        die(true);
        break;
      }
    }
  }
}

/* ---------------- Drawing helpers ---------------- */
function outlinedText(txt, x, y, size, fill, { align = 'center', stroke = OUTLINE, lw } = {}) {
  ctx.font = `${size}px 'Arial Black', 'Arial Bold', sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw || Math.max(3, size / 7);
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(txt, x, y);
}

function fancyTitleText(txt, x, y, size, fill) {
  // dark outer outline, white inner outline, colored fill — like the original logo
  ctx.font = `${size}px 'Arial Black', 'Arial Bold', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = size / 4;
  ctx.strokeText(txt, x, y + size / 12);
  ctx.strokeText(txt, x, y);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size / 9;
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(txt, x, y);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawButton(btn, label, emoji) {
  roundRect(btn.x, btn.y + 4, btn.w, btn.h, 8);
  ctx.fillStyle = OUTLINE;
  ctx.fill();
  roundRect(btn.x, btn.y, btn.w, btn.h, 8);
  ctx.fillStyle = '#f0862c';
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3;
  ctx.stroke();
  roundRect(btn.x + 4, btn.y + 4, btn.w - 8, btn.h / 3, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();
  if (emoji) {
    // emoji labels look wrong with an outline stroke — plain fill only
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1);
  } else {
    outlinedText(label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1, 22, '#ffffff', { lw: 4 });
  }
}

// x is a getter so the buttons stay centered when W changes on resize
const startBtn = { get x() { return W / 2 - 80; }, y: 424, w: 160, h: 52 };
const againBtn = { get x() { return W / 2 - 95; }, y: 412, w: 190, h: 52 };
// trophy buttons sit just right of the main button on each screen
const titleBoardBtn = { get x() { return W / 2 + 92; }, y: 424, w: 52, h: 52 };
const overBoardBtn = { get x() { return W / 2 + 107; }, y: 412, w: 52, h: 52 };

function inBtn(btn, x, y) {
  return x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
}

function drawBird() {
  const seq = [0, 1, 2, 1]; // wing up, mid, down, mid
  const frame = birdFrames[seq[bird.frame]];
  // squash on flap (wide + short), stretch on a fast fall (narrow + long)
  const squash = bird.flapT;
  const stretch = Math.max(0, (bird.vy - 250) / (MAX_VY - 250));
  const sx = 1 + 0.16 * squash - 0.10 * stretch;
  const sy = 1 - 0.20 * squash + 0.16 * stretch;
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.rot);
  ctx.scale(sx, sy);
  ctx.drawImage(frame, -BIRD_W / 2, -BIRD_H / 2);
  ctx.restore();
}

function drawGround() {
  ctx.save();
  ctx.translate(groundX, GROUND_Y);
  ctx.fillStyle = groundPat;
  ctx.fillRect(-groundX, 0, W, GROUND_H);
  ctx.restore();
}

function drawBackground() {
  ctx.save();
  ctx.translate(bgX, 0); // pattern origin scrolls with the background
  ctx.fillStyle = dayPat;
  ctx.fillRect(-bgX, 0, W, GROUND_Y);
  if (nightT > 0.01) {
    // crossfade toward the night variant (same layout, darker palette + stars)
    ctx.globalAlpha = nightT;
    ctx.fillStyle = nightPat;
    ctx.fillRect(-bgX, 0, W, GROUND_Y);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawMedal(cx, cy, medal) {
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, Math.PI * 2);
  ctx.fillStyle = medal.color;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx.strokeStyle = medal.shine;
  ctx.lineWidth = 3;
  ctx.stroke();
  outlinedText('★', cx, cy + 1, 20, medal.shine, { lw: 3 });
}

/* ---------------- Render ---------------- */
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches;
// shrink big overlay text on narrow (portrait) screens
const uiScale = () => Math.min(1, W / 470);

function render() {
  ctx.save();
  if (shakeT > 0) {
    // screen shake on impact, decaying with the timer
    const m = 8 * (shakeT / SHAKE_DUR);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(0, 0, W, H); // hide the sliver the shake offset exposes
    ctx.translate(Math.sin(time * 67) * m, Math.cos(time * 89) * m);
  }

  drawBackground();

  if (state !== STATE.TITLE) {
    for (const p of pipes) drawPipePair(Math.round(p.x), p.gapY, p.gap);
  }

  drawGround();
  drawBird();
  drawParticles();

  const us = uiScale();

  if (state === STATE.TITLE) {
    fancyTitleText('Flappy Bird', W / 2, 150, 64 * us, '#8ed94e');
    outlinedText('meet Faby the bird', W / 2, 210, 18 * us, '#ffffff', { lw: 4 });
    drawButton(startBtn, 'START');
    drawButton(titleBoardBtn, '🏆', true);
    ctx.fillStyle = 'rgba(84,56,71,0.85)';
    ctx.font = '13px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(IS_TOUCH ? 'a weekend clone — tap START' : 'a weekend clone — press SPACE or click START', W / 2, H - 30);
  }

  if (state === STATE.READY) {
    fancyTitleText('Get Ready', W / 2, 140, 56 * us, '#f8b733');
    outlinedText(IS_TOUCH ? 'TAP TO FLAP' : 'PRESS SPACE OR CLICK TO FLAP', W / 2, 200, 20 * us, '#ffffff', { lw: 4 });
    // tap hint arrow under the bird
    const bounce = Math.sin(time * 6) * 4;
    outlinedText('▲', bird.x, bird.y + 60 + bounce, 26, '#ffffff', { lw: 4 });
    outlinedText('0', W / 2, 70, 48, '#ffffff');
  }

  if (state === STATE.PLAY || state === STATE.DYING) {
    outlinedText(String(score), W / 2, 70, 48, '#ffffff');
  }

  if (state === STATE.OVER) {
    const slide = Math.min(1, (time - overAt) * 3.5);
    const ease = 1 - (1 - slide) * (1 - slide);

    fancyTitleText('Game Over', W / 2, 120 * ease + 40 * (1 - ease), 56 * us, '#f8b733');

    // score panel
    const pw = 340, ph = 150;
    const px = W / 2 - pw / 2;
    const py = 190 + (1 - ease) * 60;
    ctx.globalAlpha = ease;
    roundRect(px, py + 4, pw, ph, 10);
    ctx.fillStyle = OUTLINE;
    ctx.fill();
    roundRect(px, py, pw, ph, 10);
    ctx.fillStyle = '#e6d8a8';
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.stroke();

    const medal = medalFor(score);
    if (medal) {
      drawMedal(px + 62, py + ph / 2 - 10, medal);
      outlinedText(medal.label, px + 62, py + ph / 2 + 34, 13, '#ffffff', { lw: 3 });
    } else {
      ctx.beginPath();
      ctx.arc(px + 62, py + ph / 2 - 10, 26, 0, Math.PI * 2);
      ctx.fillStyle = '#d4c48e';
      ctx.fill();
      ctx.strokeStyle = '#bfae76';
      ctx.lineWidth = 3;
      ctx.stroke();
      outlinedText('25+ for a medal', px + 62, py + ph / 2 + 34, 11, '#ffffff', { lw: 3 });
    }

    outlinedText('SCORE', px + pw - 100, py + 32, 16, '#f0862c', { lw: 3 });
    outlinedText(String(score), px + pw - 100, py + 62, 30, '#ffffff');
    outlinedText('BEST', px + pw - 100, py + 96, 16, '#f0862c', { lw: 3 });
    outlinedText(String(best), px + pw - 100, py + 126, 30, '#ffffff');
    if (newBest) {
      ctx.save();
      ctx.translate(px + pw - 172, py + 88);
      ctx.rotate(-0.18);
      roundRect(-30, -11, 60, 22, 5);
      ctx.fillStyle = '#e4442a';
      ctx.fill();
      outlinedText('NEW', 0, 1, 14, '#ffffff', { lw: 3 });
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    if (ease >= 1) {
      drawButton(againBtn, 'TRY AGAIN');
      drawButton(overBoardBtn, '🏆', true);
      if (!IS_TOUCH) outlinedText('or press R', W / 2, 495, 14, '#ffffff', { lw: 3 });
    }
  }

  if (boardOpen) drawBoardPanel();

  if (paused && state === STATE.PLAY) {
    ctx.fillStyle = 'rgba(26,28,44,0.55)';
    ctx.fillRect(0, 0, W, H);
    fancyTitleText('Paused', W / 2, H / 2 - 20, 48, '#ffffff');
    outlinedText('press P to resume', W / 2, H / 2 + 34, 18, '#ffffff', { lw: 4 });
  }

  ctx.restore(); // end screen-shake transform

  // sound indicator (top-right, menu screens only so it never eats a
  // mid-flight tap): solid once the audio context is running, translucent
  // while audio is still blocked/not yet unlocked by a gesture
  if (state === STATE.TITLE || state === STATE.OVER) {
    const audioLive = actx && actx.state === 'running';
    ctx.globalAlpha = audioLive ? 0.95 : 0.45;
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(muted ? '🔇' : '🔊', W - 28, 28);
    ctx.globalAlpha = 1;
    // Safari blocks Web Audio entirely on file:// pages — surface that
    if (actx && !audioLive && location.protocol === 'file:') {
      ctx.font = '11px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(84,56,71,0.9)';
      ctx.fillText('sound blocked on file:// — serve over http', W - 12, 50);
    }
  }

  // white flash on impact
  if (flashT > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, flashT / 0.12)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBoardPanel() {
  ctx.fillStyle = 'rgba(26,28,44,0.6)';
  ctx.fillRect(0, 0, W, H);

  const pw = Math.min(W - 32, 380);
  const ph = 410;
  const px = W / 2 - pw / 2;
  const py = 62;
  roundRect(px, py + 4, pw, ph, 10);
  ctx.fillStyle = OUTLINE;
  ctx.fill();
  roundRect(px, py, pw, ph, 10);
  ctx.fillStyle = '#e6d8a8';
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3;
  ctx.stroke();

  outlinedText('🏆 LEADERBOARD', W / 2, py + 32, 22, '#ffffff', { lw: 4 });

  if (boardStatus === 'loading') {
    outlinedText('loading…', W / 2, py + ph / 2, 16, '#ffffff', { lw: 3 });
  } else if (boardStatus === 'error') {
    outlinedText('offline — play the deployed link', W / 2, py + ph / 2, 14, '#ffffff', { lw: 3 });
  } else if (board && board.length === 0) {
    outlinedText('no scores yet — be first!', W / 2, py + ph / 2, 15, '#ffffff', { lw: 3 });
  } else if (board) {
    const rowH = 30;
    board.slice(0, 8).forEach((row, i) => {
      const y = py + 72 + i * rowH;
      const mine = nick && row.name === nick;
      ctx.font = `bold 15px 'Trebuchet MS', sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = mine ? '#e4442a' : '#543847';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}.`, px + 26, y);
      ctx.fillText(row.name, px + 56, y);
      ctx.textAlign = 'right';
      ctx.fillText(String(row.score), px + pw - 60, y);
      if (row.at) {
        ctx.fillStyle = 'rgba(84,56,71,0.5)';
        ctx.font = `11px 'Trebuchet MS', sans-serif`;
        ctx.fillText(row.at.slice(5), px + pw - 20, y); // MM-DD
      }
    });
  }

  // "playing as" footer (click to change name)
  boardRects.name = { x: px + 20, y: py + ph - 92, w: pw - 40, h: 24 };
  ctx.font = `13px 'Trebuchet MS', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(84,56,71,0.8)';
  ctx.fillText(
    nick ? `playing as ${nick} — tap to change` : 'tap here to set your name',
    W / 2, boardRects.name.y + 12
  );

  boardRects.back = { x: W / 2 - 70, y: py + ph - 60, w: 140, h: 42 };
  drawButton(boardRects.back, 'BACK');
}

/* ---------------- Input ---------------- */
function press(x, y) {
  audioCtx(); // unlock audio on first gesture

  if (boardOpen) {
    if (x !== null && boardRects.name && inBtn(boardRects.name, x, y)) {
      changeNick();
      return;
    }
    boardOpen = false; // BACK, space, or any other click closes
    return;
  }

  // sound icon (top-right corner) toggles mute — only where it's drawn,
  // so a tap near the corner during play still flaps
  if ((state === STATE.TITLE || state === STATE.OVER) &&
      x !== null && x >= W - 48 && x <= W - 8 && y >= 8 && y <= 48) {
    setMuted(!muted);
    return;
  }
  switch (state) {
    case STATE.TITLE:
      if (x !== null && inBtn(titleBoardBtn, x, y)) { openBoard(); break; }
      if (x === null || inBtn(startBtn, x, y)) goReady();
      break;
    case STATE.READY:
      startPlay();
      break;
    case STATE.PLAY:
      if (!paused) flap();
      break;
    case STATE.OVER:
      if (x !== null && inBtn(overBoardBtn, x, y)) { openBoard(); break; }
      if (x !== null ? inBtn(againBtn, x, y) : time - overAt > 0.5) goReady();
      break;
  }
}

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  press((e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height);
});

document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return; // typing a name, not playing
  if (e.code === 'Escape' && boardOpen) {
    boardOpen = false;
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) press(null, null);
  } else if (e.code === 'KeyM') {
    setMuted(!muted);
  } else if (e.code === 'KeyP' && state === STATE.PLAY) {
    paused = !paused;
  } else if (e.code === 'KeyR' && (state === STATE.OVER || state === STATE.DYING)) {
    goReady();
  }
});

// auto-pause when the tab/window loses focus mid-game
window.addEventListener('blur', () => {
  if (state === STATE.PLAY) paused = true;
});

/* ---------------- Adaptive sizing (desktop & mobile) ---------------- */
const hintEl = document.querySelector('.hint');

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const hintH = hintEl && hintEl.offsetHeight ? hintEl.offsetHeight + 22 : 0;
  const availW = Math.max(200, window.innerWidth - 8);
  const availH = Math.max(200, window.innerHeight - hintH - 8);

  // logical width follows the screen's aspect ratio, clamped between a
  // portrait phone shape (360x600) and the widescreen desktop one (800x600)
  const aspect = Math.max(W_MIN / H, Math.min(W_MAX / H, availW / availH));
  W = Math.round(H * aspect);

  // scale canvas to fill the available space, crisp on high-DPI screens
  const scale = Math.min(availW / W, availH / H);
  canvas.style.width = `${Math.round(W * scale)}px`;
  canvas.style.height = `${Math.round(H * scale)}px`;
  canvas.width = Math.round(W * scale * dpr);
  canvas.height = Math.round(H * scale * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // world layout that depends on W
  birdX = Math.round(W * 0.3);
  if (state !== STATE.DYING && state !== STATE.OVER) bird.x = birdX;
  rebuildBackgrounds();
  bgX %= W;
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

/* ---------------- Main loop ---------------- */
// minimal read-only hook for automated testing
window.__flappy = {
  get state() { return state; },
  get width() { return W; },
  get score() { return score; },
  get birdX() { return bird.x; },
  get birdY() { return bird.y; },
  get pipes() { return pipes.map(p => ({ x: p.x, gapY: p.gapY, gap: p.gap })); },
  get nightT() { return nightT; },
  get audioState() { return actx ? actx.state : 'none'; },
  speedAt: s => speedFor(s),
  gapAt: s => gapFor(s),
  spacingAt: s => spacingFor(s),
  // roll a chain of n gaps at difficulty score s, return consecutive deltas
  simulateGaps(s, n) {
    const prev = { baseY: GROUND_Y / 2, amp: wobbleFor(s) };
    const deltas = [];
    for (let i = 0; i < n; i++) {
      const q = {};
      rollPipe(q, s, prev);
      deltas.push(q.baseY - prev.baseY);
      prev.baseY = q.baseY;
      prev.amp = q.amp;
    }
    return deltas;
  },
  get masterGain() { return masterGain; },
};

let lastT = 0;
function frame(t) {
  const dt = Math.min((t - lastT) / 1000, 1 / 30); // delta time, clamped
  lastT = t;
  if (!paused) update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(t => { lastT = t; requestAnimationFrame(frame); });

})();
