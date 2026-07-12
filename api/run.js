// GET /api/run — issues a signed run-start token. The submit endpoint uses it
// to know the true wall-clock duration of a run (plausibility check), so the
// client never gets to claim its own timing. Stateless: nothing is stored.
import crypto from 'node:crypto';

export function secret() {
  return (
    process.env.LB_SECRET ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    'dev-secret'
  );
}

export function sign(ts) {
  return crypto.createHmac('sha256', secret()).update(String(ts)).digest('hex');
}

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const ts = Date.now();
  res.status(200).json({ token: `${ts}.${sign(ts)}` });
}
