import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [enhancedPrompt, setEnhancedPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");
  const [showGenerator, setShowGenerator] = useState(false);

  const enhancePrompt = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/prompt-engineering", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();

      if (response.ok) {
        setEnhancedPrompt(data.enhancedPrompt);
      } else {
        setError(data.error || "Failed to enhance prompt");
      }
    } catch (err) {
      setError("An error occurred while enhancing the prompt");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generateImage = async () => {
    const promptToUse = enhancedPrompt || prompt;
    
    if (!promptToUse.trim()) {
      setError("Please enter or enhance a prompt first");
      return;
    }

    setGeneratingImage(true);
    setError("");
    setImageUrl("");

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: promptToUse }),
      });

      const data = await response.json();

      if (data.success) {
        setImageUrl(data.image);
      } else {
        setError(data.error || "Failed to generate image");
      }
    } catch (err) {
      setError("An error occurred while generating the image");
      console.error(err);
    } finally {
      setGeneratingImage(false);
    }
  };

  const downloadImage = () => {
    if (!imageUrl) return;

    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `aircraft-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetGenerator = () => {
    setPrompt("");
    setEnhancedPrompt("");
    setImageUrl("");
    setError("");
  };

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
        {!showGenerator ? (
          <>
            <section className="glass rounded-2xl p-6">
              <h2 className="text-2xl font-extrabold leading-tight mb-2">Design, engineer, and simulate — mobile-first</h2>
              <p className="text-sm text-white/75 mb-4">Create or pick an aircraft, iterate quickly with AI-assisted image generation, convert concepts into 3D, then preview or play in AR.</p>

              <div className="flex gap-3 mb-4">
                <button 
                  onClick={() => setShowGenerator(true)}
                  className="flex-1 text-center rounded-xl px-4 py-3 bg-cyan-400 text-black font-semibold hover:bg-cyan-300 transition-colors"
                >
                  AI Generator
                </button>
                <Link href="/aircraft" className="px-4 py-3 rounded-xl border border-white/10 text-sm text-white/90 hover:bg-white/5 transition-colors">
                  Enter Hangar
                </Link>
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
                  <Image src="/file.svg" alt="QR" width={72} height={72} className="opacity-50" />
                </div>
                <p className="text-xs text-white/60 mt-2">Scan to open on mobile</p>
              </div>
            </section>
          </>
        ) : (
          <section className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">AI Aircraft Generator</h2>
              <button 
                onClick={() => {
                  setShowGenerator(false);
                  resetGenerator();
                }}
                className="text-sm text-white/60 hover:text-white"
              >
                ← Back
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/75 mb-2">
                  Describe your aircraft
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., 'F-22 Raptor in flight' or 'futuristic stealth bomber with blue accents'"
                  className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 resize-none h-24 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={enhancePrompt}
                  disabled={loading || !prompt.trim()}
                  className="px-4 py-2 rounded-lg bg-violet-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-violet-400 transition-colors"
                >
                  {loading ? "Enhancing..." : "✨ Enhance with AI"}
                </button>
                <button
                  onClick={generateImage}
                  disabled={generatingImage || (!prompt.trim() && !enhancedPrompt)}
                  className="px-4 py-2 rounded-lg bg-cyan-400 text-black font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-cyan-300 transition-colors"
                >
                  {generatingImage ? "Generating..." : "🎨 Generate Image"}
                </button>
              </div>

              {enhancedPrompt && (
                <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <p className="text-xs text-violet-300 mb-1">Enhanced prompt:</p>
                  <p className="text-sm text-white/90">{enhancedPrompt}</p>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                  {error}
                </div>
              )}

              {imageUrl && (
                <div className="space-y-3">
                  <div className="relative rounded-lg overflow-hidden bg-white/5">
                    <img
                      src={imageUrl}
                      alt="Generated aircraft"
                      className="w-full h-auto"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={downloadImage}
                      className="px-3 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
                    >
                      💾 Download
                    </button>
                    <button
                      onClick={resetGenerator}
                      className="px-3 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
                    >
                      🔄 New Design
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="max-w-xl mx-auto mt-8 text-center text-xs text-white/50">
        Fireworks · Flux 1 · Spar 3D · Groq
      </footer>

      <style jsx>{`
        .glass {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
      `}</style>
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