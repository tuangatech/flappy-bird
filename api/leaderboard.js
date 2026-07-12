// GET  /api/leaderboard — top 10: [{ name, score, at }]
// POST /api/leaderboard — { name, score, token } -> stores personal best
//
// Storage: one Redis sorted set (ZADD GT keeps each player's best) plus a
// hash for the "when" of each entry. Names are social-contract: whoever
// submits under a name shares that entry — fine for a small friend group.
import { Redis } from '@upstash/redis';
import { sign } from './run.js';

const BOARD_KEY = 'flappy:lb';
const META_KEY = 'flappy:lb:meta';

// A run can't produce points faster than physics allows: min pipe spacing
// (260px) over max scroll speed (350px/s) ≈ 0.74s per point, after a ~2.5s
// lead-in. Use slightly generous margins so no legit run is ever rejected.
const MIN_SECONDS_PER_POINT = 0.7;
const LEAD_IN_SECONDS = 2;
const MAX_SCORE = 5000;

function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export default async function handler(req, res) {
  const r = redis();
  if (!r) return res.status(503).json({ error: 'leaderboard not configured' });

  try {
    if (req.method === 'GET') {
      const flat = await r.zrange(BOARD_KEY, 0, 9, { rev: true, withScores: true });
      const meta = (await r.hgetall(META_KEY)) || {};
      const board = [];
      for (let i = 0; i < flat.length; i += 2) {
        board.push({ name: String(flat[i]), score: Number(flat[i + 1]), at: meta[flat[i]] || null });
      }
      return res.status(200).json({ board });
    }

    if (req.method === 'POST') {
      const { name, score, token } = req.body || {};
      const clean = String(name || '').replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 12);
      const s = Math.floor(Number(score));
      if (!clean || !Number.isFinite(s) || s < 1 || s > MAX_SCORE) {
        return res.status(400).json({ error: 'bad input' });
      }

      // verify the run-start token and the real elapsed time it proves
      const [ts, sig] = String(token || '').split('.');
      if (!ts || sig !== sign(ts)) return res.status(400).json({ error: 'bad token' });
      const elapsed = (Date.now() - Number(ts)) / 1000;
      if (elapsed > 86400) return res.status(400).json({ error: 'stale token' });
      if (elapsed < LEAD_IN_SECONDS + MIN_SECONDS_PER_POINT * s) {
        return res.status(400).json({ error: 'implausible score for run duration' });
      }

      await r.zadd(BOARD_KEY, { gt: true }, { score: s, member: clean });
      await r.hset(META_KEY, { [clean]: new Date().toISOString().slice(0, 10) });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
  } catch (e) {
    return res.status(500).json({ error: 'server error' });
  }
}
