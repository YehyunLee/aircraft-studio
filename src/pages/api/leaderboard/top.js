import { getDb } from '@/lib/mongodb';

// GET /api/leaderboard/top?limit=50&sort=score|time
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const sortBy = (req.query.sort || 'score').toString();
    const db = await getDb();
    const leaderboard = db.collection('leaderboard');

    const sort = sortBy === 'time' ? { clearTime: 1, score: -1 } : { score: -1, clearTime: 1 };

    const docs = await leaderboard
      .find({}, { projection: { _id: 0 } })
      .sort(sort)
      .limit(limit)
      .toArray();

    res.status(200).json({ ok: true, entries: docs });
  } catch (e) {
    console.error('top leaderboard error', e);
    res.status(500).json({ error: 'Internal error' });
  }
}
