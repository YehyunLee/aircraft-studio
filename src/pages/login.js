import Link from "next/link";
import Head from "next/head";

export default function LoginPage() {
  const returnTo = "/"; // After login, send users back home by default

  return (
    <div className="min-h-dvh text-white font-sans bg-[#05060a] relative">
      {/* grid background (subtle line grid) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:24px_24px]"
      />

      <Head>
        <title>Sign in | Aircraft Studio</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <div className="relative z-10 p-4 sm:p-6 lg:p-8 pb-24">
        {/* Header */}
        <header className="max-w-2xl mx-auto mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white font-bold text-lg">A</div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Aircraft Studio</h1>
                <p className="text-xs text-white/60">AI design • AR simulation</p>
              </div>
            </div>
            <nav className="flex items-center gap-4">
              <Link href="/" className="text-sm text-white/80 hover:text-white transition-colors">Home</Link>
            </nav>
          </div>
        </header>

        <main className="max-w-md mx-auto">
          <section className="glass-card rounded-3xl p-8 text-center">
            <h2 className="text-2xl font-bold mb-2">Welcome</h2>
            <p className="text-white/70 text-sm mb-6">
              Continue as guest or sign in with Google to sync your settings and access saved work.
            </p>

            <div className="flex flex-col gap-3">
              <Link
                className="px-4 py-3 rounded-xl bg-white/10 text-white text-center hover:bg-white/15 transition-colors"
                href="/"
              >
                Continue as Guest
              </Link>

              <a
                className="px-4 py-3 rounded-xl bg-white text-[#1f1f1f] text-center hover:bg-white/90 transition-colors shadow"
                href={`/auth/login?connection=google-oauth2&returnTo=${encodeURIComponent(returnTo)}`}
              >
                Sign in with Google
              </a>
            </div>
          </section>

          <p className="text-xs text-white/50 mt-6 text-center">
            You can switch accounts or log out anytime from the header once signed in.
          </p>
        </main>
      </div>

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
