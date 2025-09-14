import Head from "next/head";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { auth0 } from "@/lib/auth0";

export default function LeaderboardPage({ userName = null, entries = [], mode = 'top-users' }) {
  return (
    <div className="min-h-dvh text-white font-sans bg-[#05060a] relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:24px_24px]"
      />

      <Head>
        <title>Leaderboard | Aircraft Studio</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <div className="relative z-10 p-4 sm:p-6 lg:p-8 pb-24">
        <header className="max-w-3xl mx-auto mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white font-bold text-lg">A</div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Leaderboard</h1>
                <p className="text-xs text-white/60">Top pilots and best runs</p>
              </div>
            </div>
            <nav className="flex items-center gap-4">
              <Link href="/" className="text-sm text-white/80 hover:text-white transition-colors">Home</Link>
              {userName ? (
                <span className="text-sm text-white/70">{userName}</span>
              ) : (
                <Link href="/login" target="_top" className="text-sm text-white/80 hover:text-white transition-colors">Login</Link>
              )}
            </nav>
          </div>
        </header>

        <main className="max-w-3xl mx-auto">
          <section className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-white/60">
                {mode === 'all' ? 'Showing all runs' : 'Showing best run per user'}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Link href={{ pathname: '/leaderboard', query: { mode: 'top-users' } }} className={`px-3 py-1 rounded-lg border ${mode !== 'all' ? 'bg-white/15 border-white/25 text-white' : 'bg-white/5 border-white/15 text-white/80 hover:text-white'}`}>Top by user</Link>
                <Link href={{ pathname: '/leaderboard', query: { mode: 'all' } }} className={`px-3 py-1 rounded-lg border ${mode === 'all' ? 'bg-white/15 border-white/25 text-white' : 'bg-white/5 border-white/15 text-white/80 hover:text-white'}`}>All runs</Link>
              </div>
            </div>
            {entries.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-white/70">No runs yet. Be the first to top the charts!</p>
                <p className="text-xs text-white/50 mt-2">Leaderboard updates globally from recent simulation runs.</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/10">
                {entries.map((e, i) => (
                  <li key={e.id || i} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-white/50 w-6 text-right">{i + 1}</span>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{e.name}</div>
                        <div className="text-xs text-white/50 truncate">{e.modelName || 'Any Aircraft'}</div>
                        <div className="text-xs text-white/50 truncate mt-0.5">
                          Enemies: {e.enemiesDestroyed ?? 0} • Hits: {e.hits ?? 0} / Shots: {e.shotsFired ?? 0}
                          {typeof e.accuracy === 'number' && (
                            <> • Acc: {Math.round(e.accuracy * 100)}%</>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-white/90 text-sm">{e.score ?? 0} pts</div>
                      {e.clearTime != null && (
                        <div className="text-white/50 text-[11px]">{e.clearTime.toFixed ? e.clearTime.toFixed(2) : e.clearTime}s</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>

      <BottomNav />

      <style jsx>{`
        .glass-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </div>
  );
}

export async function getServerSideProps(context) {
  try {
    const session = await auth0.getSession(context.req);
    const userName = session?.user?.name || null;

    // Import server-only DB helper here to keep it out of the client bundle
    const { getDb } = await import("@/lib/mongodb");

    const modeParam = (context.query?.mode || 'top-users').toString();
    const mode = modeParam === 'all' ? 'all' : 'top-users';

    // Query MongoDB directly (avoids self-signed HTTPS issues in dev)
    const db = await getDb();
    const leaderboard = db.collection('leaderboard');
    let docs = [];

    if (mode === 'all') {
      docs = await leaderboard
        .find({}, { projection: { _id: 0 } })
        .sort({ score: -1, clearTime: 1, createdAt: 1 })
        .limit(100)
        .toArray();
    } else {
      // Best run per user: prefer Auth0 sub; fallback to user name
      const pipeline = [
        { $addFields: { userKey: { $ifNull: [ '$user.sub', '$user.name' ] } } },
        { $sort: { score: -1, clearTime: 1, createdAt: 1 } },
        { $group: { _id: '$userKey', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
        { $project: { _id: 0 } },
        { $limit: 100 },
        { $sort: { score: -1, clearTime: 1, createdAt: 1 } },
      ];
      docs = await leaderboard.aggregate(pipeline).toArray();
    }

    const entries = (docs || []).map((it, idx) => ({
      id: idx,
      name: it?.user?.name || 'Anonymous',
      score: it?.score || 0,
      clearTime: it?.clearTime ?? null,
      modelName: it?.model?.name || null,
      enemiesDestroyed: it?.enemiesDestroyed ?? null,
      shotsFired: it?.shotsFired ?? null,
      hits: it?.hits ?? null,
      accuracy: typeof it?.accuracy === 'number' ? it.accuracy : null,
    }));

    return { props: { userName, entries, mode } };
  } catch (e) {
    return { props: { userName: null, entries: [], mode: 'top-users' } };
  }
}
