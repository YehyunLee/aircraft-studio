import { useEffect, useState } from "react";
import Link from "next/link";
import { auth0 } from "@/lib/auth0";
import { useRouter } from "next/router";
import BottomNav from "@/components/BottomNav";

// Hangar now shows a flat list of previously generated aircraft (generationHistory)
export default function Hangar({ userName = null }) {
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
    // Accept absolute http(s) URLs OR site-relative paths (e.g., "/api/models/...")
    if (item.modelUrl && typeof item.modelUrl === 'string') {
      const url = item.modelUrl;
      const isHttp = url.startsWith('http://') || url.startsWith('https://');
      const isRelativePath = url.startsWith('/');
      const isTransient = url.startsWith('blob:') || url.startsWith('data:');
      if (!isTransient && (isHttp || isRelativePath)) {
        return `/preview?src=${encodeURIComponent(url)}&title=${title}`;
      }
    }
    if (item.modelId) {
      return `/preview?modelId=${encodeURIComponent(item.modelId)}&title=${title}`;
    }
    return "#";
  }

  function getSimulationHref(item) {
    // Prefer persistent http(s) URLs; otherwise pass modelId to resolve in simulation
    const title = encodeURIComponent(item.name || item.enhancedPrompt || item.originalPrompt || "3D Model");
    if (item.modelUrl && typeof item.modelUrl === 'string') {
      const url = item.modelUrl;
      const isHttp = url.startsWith('http://') || url.startsWith('https://');
      const isRelativePath = url.startsWith('/');
      const isTransient = url.startsWith('blob:') || url.startsWith('data:');
      if (!isTransient && (isHttp || isRelativePath)) {
        return `/simulation?src=${encodeURIComponent(url)}&title=${title}`;
      }
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
        <div className="flex items-center gap-4">
          <Link href="/" className="h-10 w-10 rounded-xl bg-white/10 border border-white/10 overflow-hidden flex items-center justify-center">
            <img src="/logo.png" alt="Aircraft Studio" width={40} height={40} className="object-contain" />
          </Link>
          <Link href="/" className="block">
            <h1 className="text-xl font-semibold tracking-tight hover:underline">Hangar</h1>
          </Link>
        </div>
        <nav className="flex items-center gap-4">
          {userName ? (
            <>
              <span className="text-sm text-white/80">{userName}</span>
              <a href="/auth/logout" target="_top" rel="noopener" className="text-sm text-white/80 hover:text-white transition-colors">Logout</a>
            </>
          ) : (
            <Link href="/login" target="_top" className="text-sm text-white/80 hover:text-white transition-colors">Login</Link>
          )}
        </nav>
      </header>

      <main className="max-w-xl mx-auto space-y-4">
        {history.length === 0 ? (
          <div className="panel rounded-2xl p-6 text-center">
            <p className="mb-2">No generated aircraft yet</p>
            <p className="text-xs text-white/70">Generate an aircraft on the home page to add it to your hangar.</p>
            <div className="mt-4">
              <Link href="/" className="px-4 py-2 rounded-xl bg-white/10 text-white/90 border border-white/15 hover:bg-white/15 transition">Open Generator</Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((item, index) => (
              <div
                key={item.id || index}
                className={`panel p-4 rounded-xl transition-all duration-200 cursor-pointer hover:bg-white/10 ${
                  selectedIndex === index ? "border-white/30 bg-white/10" : "border-white/10"
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
                         <span className="text-xs bg-white/10 text-white/70 px-2 py-1 rounded-full font-medium">Image</span>
                         {(item.modelUrl || item.modelId) && (
                           <span className="text-xs bg-white/10 text-white/70 px-2 py-1 rounded-full font-medium">3D</span>
                         )}
                       </div>
                     </div>
 
                    <div className="text-base font-medium truncate">{item.name || item.enhancedPrompt || item.originalPrompt || item.prompt}</div>
                     <div className="text-[11px] text-white/60 mt-2">{item.timestamp ? new Date(item.timestamp).toLocaleString() : (item.slugId || item.id)}</div>
                   </div>
 
                   <div className="flex flex-col items-end gap-2">
                      <div className="flex gap-2">
                        {(item.modelUrl || item.modelId) ? (
                          <button onClick={(e) => onPreviewClick(e, item)} className="px-3 py-2 rounded-xl bg-white/10 text-white font-medium hover:bg-white/15 transition">Preview</button>
                        ) : (
                          <span className="px-3 py-2 rounded-xl bg-white/10 text-white/70 text-sm">No 3D</span>
                        )}
                       </div>
                      <button
                        onClick={(e) => onSimulationClick(e, item)}
                        className="px-3 py-2 rounded-xl bg-white/10 text-white font-medium hover:bg-white/15 transition"
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
        .panel {
          background: rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06);
        }
      `}</style>
    </div>
  );
}

export async function getServerSideProps(context) {
  try {
    const session = await auth0.getSession(context.req);
    const userName = session?.user?.name || null;
    return { props: { userName } };
  } catch (e) {
    return { props: { userName: null } };
  }
}
