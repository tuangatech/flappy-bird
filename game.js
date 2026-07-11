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

const PIPE_SPEED   = 225;            // px/s leftward
const PIPE_W       = 70;
const GAP_START    = 160;            // vertical opening at score 0
const GAP_MIN      = 132;            // opening never shrinks below this
const GAP_SHRINK   = 0.8;            // px narrower per point scored
const PIPE_SPACING = 320;            // horizontal distance between pairs
const NIGHT_CYCLE  = 40;             // points per full day->night->day cycle
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

let dayBg = null, nightBg = null;
function rebuildBackgrounds() { // regenerated on resize (depends on W)
  bgLayout = makeBgLayout();
  dayBg = makeBackground(BG_DAY);
  nightBg = makeBackground(BG_NIGHT);
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

// Unlock audio on user gestures. Safari is strict: the context must be
// created/resumed inside the gesture AND (on older versions) a silent
// buffer must be played to open the output. Keep trying on every gesture
// until the context reports 'running'.
let audioUnlocked = false;
function unlockAudio() {
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
};

/* ---------------- Game state ---------------- */
const STATE = { TITLE: 0, READY: 1, PLAY: 2, DYING: 3, OVER: 4 };
let state = STATE.TITLE;
let paused = false;

const bird = { x: birdX, y: 0, vy: 0, vx: 0, rot: 0, spin: 0, frame: 0 };
const pipes = []; // { x, gapY, scored }
for (let i = 0; i < PIPE_COUNT; i++) pipes.push({ x: 0, gapY: 0, gap: GAP_START, scored: false });

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

// difficulty ramp: the opening narrows slightly with each point
const gapFor = s => Math.max(GAP_MIN, GAP_START - s * GAP_SHRINK);

function randomGapY(gap) {
  const min = gap / 2 + GAP_MARGIN;
  const max = GROUND_Y - gap / 2 - GAP_MARGIN;
  return min + Math.random() * (max - min);
}

function resetPipes() {
  pipes.forEach((p, i) => {
    p.x = W + 150 + i * PIPE_SPACING;
    p.gap = gapFor(0);
    p.gapY = randomGapY(p.gap);
    p.scored = false;
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
  resetPipes();
  sfx.swoosh();
}

function startPlay() {
  state = STATE.PLAY;
  flap();
}

function flap() {
  bird.vy = FLAP_VY;
  bird.rot = -0.35;
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
    sfx.die();
  } else {
    // slammed into the ground: dampened bounce before settling
    bird.vy = -Math.max(bird.vy, 300) * 0.35;
    bird.vx = -60;
    bird.spin = 3;
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
  sfx.swoosh();
}

function medalFor(s) {
  if (s >= 60) return { label: 'PLATINUM', color: '#e3e6ea', shine: '#ffffff' };
  if (s >= 40) return { label: 'GOLD',     color: '#f8d838', shine: '#fdf2a8' };
  if (s >= 25) return { label: 'SILVER',   color: '#c9cdd4', shine: '#eef0f4' };
  if (s >= 10) return { label: 'BRONZE',   color: '#cd8b52', shine: '#e8b98a' };
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

  // day -> night -> day, one full cycle every NIGHT_CYCLE points
  const targetNight = (1 - Math.cos((score % NIGHT_CYCLE) / NIGHT_CYCLE * Math.PI * 2)) / 2;
  nightT += (targetNight - nightT) * Math.min(1, dt * 1.5);

  const scrolling = state === STATE.TITLE || state === STATE.READY || state === STATE.PLAY;
  if (scrolling) {
    groundX = (groundX - PIPE_SPEED * dt) % groundTile.width;
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
        sfx.thud();
      } else {
        gameOver();
        return;
      }
    }
  }

  if (state === STATE.PLAY) {
    for (const p of pipes) {
      p.x -= PIPE_SPEED * dt;

      // recycle pipe that left the screen (object pooling);
      // it captures the current difficulty's gap for its next pass
      if (p.x + PIPE_W < -CAP_OVER) {
        const maxX = Math.max(...pipes.map(q => q.x));
        p.x = maxX + PIPE_SPACING;
        p.gap = gapFor(score);
        p.gapY = randomGapY(p.gap);
        p.scored = false;
      }

      // scoring: bird passed the pipe's right edge
      if (!p.scored && p.x + PIPE_W < bird.x) {
        p.scored = true;
        score++;
        sfx.point();
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

function drawButton(btn, label) {
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
  outlinedText(label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1, 22, '#ffffff', { lw: 4 });
}

// x is a getter so the buttons stay centered when W changes on resize
const startBtn = { get x() { return W / 2 - 80; }, y: 424, w: 160, h: 52 };
const againBtn = { get x() { return W / 2 - 95; }, y: 412, w: 190, h: 52 };

function inBtn(btn, x, y) {
  return x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
}

function drawBird() {
  const seq = [0, 1, 2, 1]; // wing up, mid, down, mid
  const frame = birdFrames[seq[bird.frame]];
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.rot);
  ctx.drawImage(frame, -BIRD_W / 2, -BIRD_H / 2);
  ctx.restore();
}

function drawGround() {
  for (let x = groundX; x < W; x += groundTile.width) {
    ctx.drawImage(groundTile, Math.round(x), GROUND_Y);
  }
}

function drawBackground() {
  const x = Math.round(bgX);
  ctx.drawImage(dayBg, x, 0);
  ctx.drawImage(dayBg, x + W, 0);
  if (nightT > 0.01) {
    // crossfade toward the night variant (same layout, darker palette + stars)
    ctx.globalAlpha = nightT;
    ctx.drawImage(nightBg, x, 0);
    ctx.drawImage(nightBg, x + W, 0);
    ctx.globalAlpha = 1;
  }
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

  const us = uiScale();

  if (state === STATE.TITLE) {
    fancyTitleText('Flappy Bird', W / 2, 150, 64 * us, '#8ed94e');
    outlinedText('meet Faby the bird', W / 2, 210, 18 * us, '#ffffff', { lw: 4 });
    drawButton(startBtn, 'START');
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
      outlinedText('10+ for a medal', px + 62, py + ph / 2 + 34, 11, '#ffffff', { lw: 3 });
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
      if (!IS_TOUCH) outlinedText('or press R', W / 2, 495, 14, '#ffffff', { lw: 3 });
    }
  }

  if (paused && state === STATE.PLAY) {
    ctx.fillStyle = 'rgba(26,28,44,0.55)';
    ctx.fillRect(0, 0, W, H);
    fancyTitleText('Paused', W / 2, H / 2 - 20, 48, '#ffffff');
    outlinedText('press P to resume', W / 2, H / 2 + 34, 18, '#ffffff', { lw: 4 });
  }

  ctx.restore(); // end screen-shake transform

  // sound indicator (top-right): solid once the audio context is running,
  // translucent while audio is still blocked/not yet unlocked by a gesture
  const audioLive = actx && actx.state === 'running';
  ctx.globalAlpha = audioLive ? 0.95 : 0.45;
  ctx.font = '22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(muted ? '🔇' : '🔊', W - 28, 28);
  ctx.globalAlpha = 1;

  // white flash on impact
  if (flashT > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, flashT / 0.12)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

/* ---------------- Input ---------------- */
function press(x, y) {
  audioCtx(); // unlock audio on first gesture
  // sound icon (top-right corner) toggles mute
  if (x !== null && x >= W - 48 && x <= W - 8 && y >= 8 && y <= 48) {
    setMuted(!muted);
    return;
  }
  switch (state) {
    case STATE.TITLE:
      if (x === null || inBtn(startBtn, x, y)) goReady();
      break;
    case STATE.READY:
      startPlay();
      break;
    case STATE.PLAY:
      if (!paused) flap();
      break;
    case STATE.OVER:
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
