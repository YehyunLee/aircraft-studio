import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#050816] via-[#071032] to-[#07101a] text-white font-sans p-6 sm:p-10">
      <header className="max-w-xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-black font-bold">A</div>
            <h1 className="text-lg font-semibold tracking-tight">Aircraft Studio</h1>
          </div>
          <nav>
            <Link href="/aircraft" className="text-xs text-cyan-300 hover:underline">Hangar</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-xl mx-auto mt-8">
        <section className="glass rounded-2xl p-6">
          <h2 className="text-2xl font-extrabold leading-tight mb-2">Design, engineer, and simulate — mobile-first</h2>
          <p className="text-sm text-white/75 mb-4">Create or pick an aircraft, iterate quickly with AI-assisted image generation, convert concepts into 3D, then preview or play in AR.</p>

          <div className="flex gap-3 mb-4">
            <Link href="/aircraft" className="flex-1 text-center rounded-xl px-4 py-3 bg-cyan-400 text-black font-semibold">Enter Hangar</Link>
            <a href="#" className="px-3 py-3 rounded-xl border border-white/10 text-sm text-white/90">Quick Play</a>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs text-white/70">
            <Feature title="Groq AI" subtitle="Text-driven engineering" />
            <Feature title="Fireworks" subtitle="Fast image gen" />
            <Feature title="Spar 3D" subtitle="Img → .glb" />
          </div>
        </section>

        <section className="mt-6 text-center">
          <p className="text-[12px] text-white/60">Designed for phones — tap, swipe, iterate.</p>
          <div className="mt-4 inline-block bg-white/6 rounded-lg p-3">
            <div className="w-36 h-36 bg-white/5 flex items-center justify-center rounded-md">
              {/* QR placeholder */}
              <Image src="/file.svg" alt="QR" width={72} height={72} className="opacity-50" />
            </div>
            <p className="text-xs text-white/60 mt-2">Scan to open on mobile</p>
          </div>
        </section>
      </main>

      <footer className="max-w-xl mx-auto mt-8 text-center text-xs text-white/50">Fireworks · Flux 1 · Spar 3D · Groq</footer>
    </div>
  );
}

function Feature({ title, subtitle }) {
  return (
    <div className="flex flex-col items-center">
      <div className="h-9 w-9 rounded-md bg-white/6 flex items-center justify-center text-[11px] font-semibold mb-2">{title[0]}</div>
      <div className="text-[12px] font-medium">{title}</div>
      <div className="text-[11px] text-white/60">{subtitle}</div>
    </div>
  );
}
