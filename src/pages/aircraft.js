import { useEffect, useState } from "react";
import Link from "next/link";

export default function Hangar() {
  const [jets, setJets] = useState([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("jets");
    try {
      setJets(raw ? JSON.parse(raw) : []);
    } catch {
      setJets([]);
    }
  }, []);

  function createNew() {
    const id = Date.now().toString(36);
    const newJet = { id, name: "Untitled", createdAt: Date.now() };
    const next = [newJet, ...jets];
    localStorage.setItem("jets", JSON.stringify(next));
    setJets(next);
  }

  return (
    <div className="min-h-dvh p-6 bg-gradient-to-br from-[#050816] via-[#071032] to-[#07101a] text-white">
      <header className="max-w-xl mx-auto flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Hangar</h1>
        <button onClick={createNew} className="rounded-xl px-3 py-2 bg-cyan-400 text-black font-semibold">+ Craft</button>
      </header>

      <main className="max-w-xl mx-auto space-y-4">
        {jets.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center">
            <p className="mb-2">No aircraft yet</p>
            <p className="text-xs text-white/70">Tap Craft to design your first jet.</p>
            <div className="mt-4">
              <button onClick={createNew} className="px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-200 border border-cyan-400/40">+ Craft</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {jets.map((j) => (
              <Link key={j.id} href={`/craft/edit/${j.id}`} className="block">
                <article className="glass rounded-xl overflow-hidden p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">{j.name || "Untitled"}</div>
                      <div className="text-[11px] text-white/60">{new Date(j.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div className="text-[11px] text-white/60">→</div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
