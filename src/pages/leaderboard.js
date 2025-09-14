import Head from "next/head";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { auth0 } from "@/lib/auth0";

export default function LeaderboardPage({ userName = null, entries = [] }) {
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
                <Link href="/login" className="text-sm text-white/80 hover:text-white transition-colors">Login</Link>
              )}
            </nav>
          </div>
        </header>

        <main className="max-w-3xl mx-auto">
          <section className="glass-card rounded-2xl p-6">
            {entries.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-white/70">No runs yet. Be the first to top the charts!</p>
                <p className="text-xs text-white/50 mt-2">Once we wire MongoDB, your best simulation stats will appear here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/10">
                {entries.map((e, i) => (
                  <li key={e.id || i} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-white/50 w-6 text-right">{i + 1}</span>
                      <span className="font-medium">{e.name}</span>
                    </div>
                    <div className="text-white/70 text-sm">{e.score ?? 0} pts</div>
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
    // Placeholder entries
    const entries = [];
    return { props: { userName, entries } };
  } catch (e) {
    return { props: { userName: null, entries: [] } };
  }
}
