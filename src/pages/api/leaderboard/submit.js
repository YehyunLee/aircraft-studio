import { auth0 } from '@/lib/auth0';
import { getDb } from '@/lib/mongodb';

// POST { score, clearTime, enemiesDestroyed, shotsFired, hits, modelName?, modelId?, modelPath? }
export default auth0.withApiAuthRequired(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { user } = await auth0.getSession(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { score = 0, clearTime = null, enemiesDestroyed = 0, shotsFired = 0, hits = 0, modelName = null, modelId = null, modelPath = null } = req.body || {};

    // Compute accuracy & basic validations
    const accuracy = shotsFired > 0 ? Math.min(1, Math.max(0, hits / shotsFired)) : 0;

    const db = await getDb();
    const leaderboard = db.collection('leaderboard');

    // Indexes (create if not exist). No-op on subsequent calls.
    await leaderboard.createIndex({ score: -1 });
    await leaderboard.createIndex({ clearTime: 1 });
    await leaderboard.createIndex({ 'user.sub': 1 });

    const doc = {
      user: {
        sub: user.sub,
        name: user.name || user.nickname || user.email || 'Anonymous',
        picture: user.picture || null,
      },
      score: Number(score) || 0,
      clearTime: clearTime == null ? null : Number(clearTime),
      enemiesDestroyed: Number(enemiesDestroyed) || 0,
      shotsFired: Number(shotsFired) || 0,
      hits: Number(hits) || 0,
      accuracy,
      model: {
        id: modelId || null,
        name: modelName || null,
        path: modelPath || null,
      },
      createdAt: new Date(),
    };

    await leaderboard.insertOne(doc);

    res.status(200).json({ ok: true, inserted: true });
  } catch (e) {
    console.error('submit leaderboard error', e);
    res.status(500).json({ error: 'Internal error' });
  }
});
