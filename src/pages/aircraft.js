import { useEffect, useState } from "react";
import Link from "next/link";

// Hangar now shows a flat list of previously generated aircraft (generationHistory)
export default function Hangar() {
  const [history, setHistory] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);

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

  function downloadImage(url) {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `aircraft-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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

  return (
    <div className="min-h-dvh p-6 bg-gradient-to-br from-[#050816] via-[#071032] to-[#07101a] text-white">
      <header className="max-w-xl mx-auto flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Hangar</h1>
        <Link href="/" className="rounded-xl px-3 py-2 bg-white/6 text-sm">Back</Link>
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
                         {item.modelUrl && (
                           <span className="text-xs bg-violet-500/20 text-violet-300 px-2 py-1 rounded-full font-medium">3D</span>
                         )}
                       </div>
                     </div>
 
                     <div className="text-sm truncate">{item.enhancedPrompt || item.originalPrompt || item.prompt}</div>
                     <div className="text-[11px] text-white/60 mt-2">{item.timestamp ? new Date(item.timestamp).toLocaleString() : item.id}</div>
                   </div>
 
                   <div className="flex flex-col items-end gap-2">
                     <div className="flex gap-2">
                       <button onClick={(e) => { e.stopPropagation(); downloadImage(item.imageUrl); }} className="px-3 py-2 rounded-xl bg-white/6 text-sm">Download</button>
                       {item.modelUrl ? (
                         <Link href={`/preview?src=${encodeURIComponent(item.modelUrl)}&title=${encodeURIComponent(item.enhancedPrompt || item.originalPrompt || "3D Model")}`} className="px-3 py-2 rounded-xl bg-cyan-400 text-black font-semibold">Preview</Link>
                       ) : (
                         <span className="px-3 py-2 rounded-xl bg-white/6 text-sm">No 3D</span>
                       )}
                      </div>
                      <Link href={`/simulation?src=${encodeURIComponent(item.modelUrl || "")}&title=${encodeURIComponent(item.enhancedPrompt || item.originalPrompt || "3D Model")}`} className="text-xs text-white/60">Open in Simulation</Link>

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

      <style jsx>{`
        .glass { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }
      `}</style>
    </div>
  );
}
