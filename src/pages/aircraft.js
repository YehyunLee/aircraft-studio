import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import BottomNav from "@/components/BottomNav";

// Hangar now shows a flat list of previously generated aircraft (generationHistory)
export default function Hangar() {
  const [history, setHistory] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("generationHistory");
      setHistory(raw ? JSON.parse(raw) : []);
    } catch (e) {
      setHistory([]);
    }

    function onStorage(e) {
      if (!e.key) return;
      if (e.key === "generationHistory") {
        try {
          setHistory(e.newValue ? JSON.parse(e.newValue) : []);
        } catch {
          setHistory([]);
        }
      }
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function selectFromHistory(index) {
    setSelectedIndex(index === selectedIndex ? null : index);
  }



  function removeFromHistory(index, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("generationHistory");
      const arr = raw ? JSON.parse(raw) : [];
      if (index >= 0 && index < arr.length) {
        arr.splice(index, 1);
        if (arr.length > 0) {
          localStorage.setItem("generationHistory", JSON.stringify(arr));
        } else {
          localStorage.removeItem("generationHistory");
        }
        setHistory(arr);
        setSelectedIndex(prev => {
          if (prev === null) return null;
          if (prev === index) return null;
          return prev > index ? prev - 1 : prev;
        });
      }
    } catch (err) {
      console.error("Failed to remove history item", err);
    }
  }

  function getPreviewHref(item) {
    // Prefer persistent http(s) URLs; otherwise forward modelId to preview so it can resolve from IndexedDB
    const title = encodeURIComponent(item.name || item.enhancedPrompt || item.originalPrompt || "3D Model");
    if (item.modelUrl && typeof item.modelUrl === 'string' && item.modelUrl.startsWith('http')) {
      return `/preview?src=${encodeURIComponent(item.modelUrl)}&title=${title}`;
    }
    if (item.modelId) {
      return `/preview?modelId=${encodeURIComponent(item.modelId)}&title=${title}`;
    }
    return "#";
  }

  function getSimulationHref(item) {
    // Prefer persistent http(s) URLs; otherwise pass modelId to resolve in simulation
    const title = encodeURIComponent(item.name || item.enhancedPrompt || item.originalPrompt || "3D Model");
    if (item.modelUrl && typeof item.modelUrl === 'string' && item.modelUrl.startsWith('http')) {
      return `/simulation?src=${encodeURIComponent(item.modelUrl)}&title=${title}`;
    }
    if (item.modelId) {
      return `/simulation?modelId=${encodeURIComponent(item.modelId)}&title=${title}`;
    }
    return "/simulation";
  }

  function onPreviewClick(e, item) {
    e.stopPropagation();
    const href = getPreviewHref(item);
    if (href && href !== '#') router.push(href);
  }

  async function onSimulationClick(e, item) {
    e.stopPropagation();
    const href = getSimulationHref(item);
    if (href) router.push(href);
  }

  return (
    <div className="min-h-dvh p-6 text-white bg-[#05060a] relative">
      {/* grid background (subtle line grid) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:24px_24px]"
      />
      <div className="relative z-10 pb-24">
      <header className="max-w-xl mx-auto flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Hangar</h1>
        <Link href="/" className="rounded-xl px-3 py-2 bg-white/10 border border-white/10 text-sm hover:bg-white/15 transition">Back</Link>
      </header>

      <main className="max-w-xl mx-auto space-y-4">
        {history.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center">
            <p className="mb-2">No generated aircraft yet</p>
            <p className="text-xs text-white/70">Generate an aircraft on the home page to add it to your hangar.</p>
            <div className="mt-4">
              <Link href="/" className="px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-200 border border-cyan-400/40">Open Generator</Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((item, index) => (
              <div
                key={item.id || index}
                className={`p-4 rounded-xl bg-white/5 border transition-all duration-200 cursor-pointer hover:bg-white/10 ${
                  selectedIndex === index ? "border-cyan-400 bg-cyan-400/5" : "border-white/10"
                }`}
                onClick={() => selectFromHistory(index)}
              >
                  <div className="flex gap-4">
                   <div className="w-20 h-20 rounded-lg overflow-hidden bg-white/10 flex-shrink-0 border border-white/10">
                     <img src={item.imageUrl} alt={`Generation ${index + 1}`} className="w-full h-full object-cover" />
                   </div>
 
                   <div className="flex-1 min-w-0">
                     <div className="flex items-center gap-2 mb-2">
                       <p className="text-sm text-white/60">#{index + 1}</p>
                       <div className="flex gap-2">
                         <span className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-1 rounded-full font-medium">Image</span>
                         {(item.modelUrl || item.modelId) && (
                           <span className="text-xs bg-violet-500/20 text-violet-300 px-2 py-1 rounded-full font-medium">3D</span>
                         )}
                       </div>
                     </div>
 
                    <div className="text-base font-medium truncate">{item.name || item.enhancedPrompt || item.originalPrompt || item.prompt}</div>
                     <div className="text-[11px] text-white/60 mt-2">{item.timestamp ? new Date(item.timestamp).toLocaleString() : (item.slugId || item.id)}</div>
                   </div>
 
                   <div className="flex flex-col items-end gap-2">
                      <div className="flex gap-2">
                        {(item.modelUrl || item.modelId) ? (
                          <button onClick={(e) => onPreviewClick(e, item)} className="px-3 py-2 rounded-xl bg-cyan-400 text-black font-semibold">Preview</button>
                        ) : (
                          <span className="px-3 py-2 rounded-xl bg-white/6 text-sm">No 3D</span>
                        )}
                       </div>
                      <button
                        onClick={(e) => onSimulationClick(e, item)}
                        className="px-3 py-2 rounded-xl bg-violet-400 text-black font-semibold hover:bg-violet-500 transition-colors"
                      >
                        Simulation
                      </button>

                    <div className="mt-2">
                      <button
                        onClick={(e) => removeFromHistory(index, e)}
                        className="text-xs text-red-300 hover:text-red-200 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
                        title="Remove"
                      >
                        🗑 Remove
                      </button>
                    </div>
                  </div>
                 </div>
              </div>
            ))}
          </div>
        )}
      </main>
      </div>
      <BottomNav />

      <style jsx>{`
        .glass { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }
      `}</style>
    </div>
  );
}
