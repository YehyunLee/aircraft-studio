import { useEffect, useState } from "react";
import Link from "next/link";

export default function Hangar() {
  const [jets, setJets] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [iterations, setIterations] = useState({}); // { jetId: [ {id,title,note,createdAt} ] }
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("jets");
    try {
      setJets(raw ? JSON.parse(raw) : []);
    } catch {
      setJets([]);
    }

    const rawIters = localStorage.getItem("jetIterations");
    try {
      setIterations(rawIters ? JSON.parse(rawIters) : {});
    } catch {
      setIterations({});
    }
  }, []);

  function persistIterations(next) {
    setIterations(next);
    try {
      localStorage.setItem("jetIterations", JSON.stringify(next));
    } catch {}
  }

  function createNew() {
    const id = Date.now().toString(36);
    const newJet = { id, name: "Untitled", createdAt: Date.now() };
    const next = [newJet, ...jets];
    try {
      localStorage.setItem("jets", JSON.stringify(next));
    } catch {}
    setJets(next);
    // open the newly created jet
    setExpandedId(id);
    setNewTitle("");
  }

  function toggleExpand(id) {
    setNewTitle("");
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function addIteration(jetId) {
    const title = newTitle.trim() || `Iteration ${((iterations[jetId] || []).length + 1)}`;
    const iter = { id: Date.now().toString(36), title, note: "", createdAt: Date.now() };
    const next = { ...iterations, [jetId]: [iter, ...(iterations[jetId] || [])] };
    persistIterations(next);
    setNewTitle("");
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
            {jets.map((j) => {
              const isOpen = expandedId === j.id;
              const jetIters = iterations[j.id] || [];
              return (
                <div key={j.id} className="block">
                  <button onClick={() => toggleExpand(j.id)} className="w-full text-left glass rounded-xl overflow-hidden p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">{j.name || "Untitled"}</div>
                        <div className="text-[11px] text-white/60">{new Date(j.createdAt).toLocaleDateString()}</div>
                      </div>
                      <div className="text-[11px] text-white/60">{isOpen ? "▼" : ""}</div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="glass rounded-b-xl p-3 -mt-1">
                      <div className="mb-3">
                        <div className="text-xs text-white/70 mb-2">Iterations & conversations</div>
                        {jetIters.length === 0 ? (
                          <div className="text-[13px] text-white/60">No iterations yet. Create one to start a conversation.</div>
                        ) : (
                          <ul className="space-y-2">
                            {jetIters.map((it) => (
                              <li key={it.id} className="p-2 bg-white/3 rounded-md">
                                <div className="flex items-center justify-between">
                                  <div className="text-sm">{it.title}</div>
                                  <div className="text-[11px] text-white/60">{new Date(it.createdAt).toLocaleString()}</div>
                                </div>
                                {it.note && <div className="text-[12px] text-white/70 mt-1">{it.note}</div>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <input
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="New iteration title"
                          className="flex-1 rounded-xl px-3 py-2 bg-white/5 text-sm"
                        />
                        <button onClick={() => addIteration(j.id)} className="px-3 py-2 rounded-xl bg-cyan-400 text-black font-semibold">Add</button>
                        <Link href={`/craft/edit/${j.id}`} className="px-3 py-2 rounded-xl bg-white/6 text-sm">Open</Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
