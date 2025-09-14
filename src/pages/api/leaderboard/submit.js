import { auth0 } from '@/lib/auth0';
import { getDb } from '@/lib/mongodb';

// POST { score, clearTime, enemiesDestroyed, shotsFired, hits, modelName?, modelId?, modelPath? }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    // Require an authenticated session; anonymous submissions are not allowed
    const sess = await auth0.getSession(req);
    const sessionUser = sess?.user || null;
    if (!sessionUser?.sub) {
      return res.status(401).json({ ok: false, inserted: false, error: 'Authentication required' });
    }

    const { score = 0, clearTime = null, enemiesDestroyed = 0, shotsFired = 0, hits = 0, modelName = null, modelId = null, modelPath = null } = req.body || {};

    // Basic validation + normalization
    const normScore = Number.isFinite(Number(score)) ? Number(score) : 0;
    const normClearTime = clearTime == null ? null : (Number.isFinite(Number(clearTime)) ? Number(clearTime) : null);
    const normEnemies = Number.isFinite(Number(enemiesDestroyed)) ? Number(enemiesDestroyed) : 0;
    const normShots = Number.isFinite(Number(shotsFired)) ? Number(shotsFired) : 0;
    const normHits = Number.isFinite(Number(hits)) ? Number(hits) : 0;
    const accuracy = normShots > 0 ? Math.min(1, Math.max(0, normHits / normShots)) : 0;

    const db = await getDb();
    const leaderboard = db.collection('leaderboard');

    // Indexes (create if not exist). No-op on subsequent calls.
    await leaderboard.createIndex({ score: -1 });
    await leaderboard.createIndex({ clearTime: 1 });
    await leaderboard.createIndex({ 'user.sub': 1 });

    const doc = {
      user: {
        sub: sessionUser.sub,
        name: sessionUser.name || sessionUser.nickname || sessionUser.email || 'User',
        picture: sessionUser.picture || null,
      },
      score: Math.max(0, Math.floor(normScore)),
      clearTime: normClearTime,
      enemiesDestroyed: Math.max(0, Math.floor(normEnemies)),
      shotsFired: Math.max(0, Math.floor(normShots)),
      hits: Math.max(0, Math.floor(normHits)),
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
}
