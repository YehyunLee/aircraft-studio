import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import Head from "next/head";
import Script from "next/script";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [enhancedPrompt, setEnhancedPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generating3D, setGenerating3D] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState("");
  const [currentModelUrl, setCurrentModelUrl] = useState("");
  const [error, setError] = useState("");
  const [showGenerator, setShowGenerator] = useState(false);
  
  // Preview modal state
  const [previewModel, setPreviewModel] = useState(null); // { src, title }
  
  // History of all generations in this session
  const [generationHistory, setGenerationHistory] = useState([]);
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(null);

  // Listen for messages from the preview iframe
  useEffect(() => {
    function handleMessage(e) {
      if (!e.data) return;
      if (e.data.type === 'model-preview-close') {
        setPreviewModel(null);
        return;
      }
      if (e.data.type !== 'model-orientation') return;
      // Received orientation from the preview iframe
      const { quaternion, scale, enter } = e.data;
      // Persist orientation for currently previewed model if needed (this app keeps orientations in state)
      if (previewModel && previewModel.src) {
        setGenerationHistory(prev => prev.map(item => item.modelUrl === previewModel.src ? ({ ...item, orientation: { quaternion, scale } }) : item));
      }
      // If the iframe asked to enter, you could trigger AR flow here using 'enter'
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [previewModel]);


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
        const newGeneration = {
          id: Date.now(),
          originalPrompt: prompt,
          enhancedPrompt: enhancedPrompt,
          imageUrl: data.image,
          modelUrl: null,
          timestamp: new Date().toISOString()
        };
        
        setCurrentImageUrl(data.image);
        setCurrentModelUrl("");
        setGenerationHistory(prev => [...prev, newGeneration]);
        setSelectedHistoryIndex(generationHistory.length);
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

  const downloadImage = (imageUrl) => {
    if (!imageUrl) return;

    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `aircraft-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generate3DModel = async (imageUrl, historyIndex) => {
    if (!imageUrl) {
      setError("Please generate an image first");
      return;
    }

    setGenerating3D(true);
    setError("");

    try {
      const response = await fetch("/api/generate-3d", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          imageData: imageUrl,
          filename: `aircraft-${Date.now()}.glb`
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update history with 3D model
        if (historyIndex !== undefined && historyIndex !== null) {
          setGenerationHistory(prev => {
            const updated = [...prev];
            updated[historyIndex].modelUrl = data.modelUrl;
            return updated;
          });
        }
        
        if (imageUrl === currentImageUrl) {
          setCurrentModelUrl(data.modelUrl);
        }
      } else {
        setError(data.error || "Failed to generate 3D model");
      }
    } catch (err) {
      setError("An error occurred while generating the 3D model");
      console.error(err);
    } finally {
      setGenerating3D(false);
    }
  };

  const download3DModel = (modelUrl) => {
    if (!modelUrl) return;

    const link = document.createElement("a");
    link.href = modelUrl;
    link.download = modelUrl.split("/").pop();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const startNewGeneration = () => {
    setPrompt("");
    setEnhancedPrompt("");
    setCurrentImageUrl("");
    setCurrentModelUrl("");
    setError("");
    setSelectedHistoryIndex(null);
  };

  const selectFromHistory = (index) => {
    const item = generationHistory[index];
    setPrompt(item.originalPrompt);
    setEnhancedPrompt(item.enhancedPrompt || "");
    setCurrentImageUrl(item.imageUrl);
    setCurrentModelUrl(item.modelUrl || "");
    setSelectedHistoryIndex(index);
    setError("");
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#050816] via-[#071032] to-[#07101a] text-white font-sans p-6 sm:p-10">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <Script
        src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"
        strategy="afterInteractive"
      />
      <header className="max-w-xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-black font-bold">A</div>
            <h1 className="text-lg font-semibold tracking-tight">Aircraft Studio</h1>
          </div>
          <nav className="flex items-center gap-3">
            <Link href="/aircraft" className="text-xs text-cyan-300 hover:underline">Hangar</Link>
            <Link href="/profile" className="text-xs text-white/80 hover:underline">Profile</Link>
            <a href="/api/auth/login" className="text-xs text-white/80 hover:underline">Login</a>
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
          <div className="space-y-4">
            {/* Header Section */}
            <section className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">AI Aircraft Generator</h2>
                <button 
                  onClick={() => {
                    setShowGenerator(false);
                    startNewGeneration();
                  }}
                  className="text-sm text-white/60 hover:text-white"
                >
                  ← Back
                </button>
              </div>

              {/* Input Section */}
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
                  <button
                    onClick={startNewGeneration}
                    className="px-4 py-2 rounded-lg bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
                  >
                    📝 New
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

                {/* Current Generation */}
                {currentImageUrl && (
                  <div className="space-y-3">
                    <div className="relative rounded-lg overflow-hidden bg-white/5">
                      <img
                        src={currentImageUrl}
                        alt="Generated aircraft"
                        className="w-full h-auto"
                      />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => downloadImage(currentImageUrl)}
                        className="px-3 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
                      >
                        💾 Download Image
                      </button>
                      <button
                        onClick={() => generate3DModel(currentImageUrl, selectedHistoryIndex)}
                        disabled={generating3D}
                        className="px-3 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-400 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                      >
                        {generating3D ? "Converting to 3D..." : "🎯 Convert to 3D"}
                      </button>
                    </div>
                  </div>
                )}

                {currentModelUrl && (
                  <div className="p-3 rounded-lg bg-gradient-to-r from-violet-500/10 to-cyan-400/10 border border-cyan-400/20">
                    <p className="text-xs text-cyan-300 mb-2">✅ 3D Model Generated!</p>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => download3DModel(currentModelUrl)}
                        className="px-3 py-2 rounded-lg bg-cyan-400 text-black text-sm font-medium hover:bg-cyan-300 transition-colors"
                      >
                        📦 Download GLB File
                      </button>
                       <button
                         onClick={() => setPreviewModel({ src: currentModelUrl, title: (enhancedPrompt || prompt || "3D Model") })}
                         className="px-3 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
                       >
                         Quick Preview
                       </button>
                       <Link
                        href={`/simulation?src=${encodeURIComponent(currentModelUrl)}&title=${encodeURIComponent(enhancedPrompt || prompt || "3D Model")}`}
                         className="px-3 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 text-white text-sm font-medium hover:opacity-90 transition-opacity"
                       >
                         🎮 Simulation
                       </Link>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* History Section */}
            {generationHistory.length > 0 && (
              <section className="glass rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-3">Generation History</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {generationHistory.map((item, index) => (
                    <div 
                      key={item.id}
                      className={`p-3 rounded-lg bg-white/5 border transition-all cursor-pointer hover:bg-white/10 ${
                        selectedHistoryIndex === index ? 'border-cyan-400' : 'border-white/10'
                      }`}
                      onClick={() => selectFromHistory(index)}
                    >
                      <div className="flex gap-3">
                        <div className="w-20 h-20 rounded-lg overflow-hidden bg-white/10 flex-shrink-0">
                          <img 
                            src={item.imageUrl} 
                            alt={`Generation ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white/60 mb-1">#{index + 1}</p>
                          <p className="text-sm text-white/90 truncate">{item.originalPrompt}</p>
                          <div className="flex gap-2 mt-2">
                            <span className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-1 rounded">Image</span>
                            {item.modelUrl && (
                              <span className="text-xs bg-violet-500/20 text-violet-300 px-2 py-1 rounded">3D</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadImage(item.imageUrl);
                            }}
                            className="text-xs text-white/60 hover:text-white"
                            title="Download Image"
                          >
                            💾
                          </button>
                          {item.modelUrl ? (
                            <>
                               <button
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   setPreviewModel({ src: item.modelUrl, title: (item.originalPrompt || "3D Model") });
                                 }}
                                 className="text-xs text-white/60 hover:text-white"
                                 title="Quick Preview"
                               >
                                 👁
                               </button>
                               <Link
                                href={`/simulation?src=${encodeURIComponent(item.modelUrl)}&title=${encodeURIComponent(item.originalPrompt || "3D Model")}`}
                                 onClick={(e) => e.stopPropagation()}
                                 className="text-xs text-cyan-300 hover:text-cyan-200"
                                 title="AR Preview"
                               >
                                 🎮
                               </Link>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  download3DModel(item.modelUrl);
                                }}
                                className="text-xs text-white/60 hover:text-white"
                                title="Download 3D Model"
                              >
                                📦
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                generate3DModel(item.imageUrl, index);
                              }}
                              disabled={generating3D}
                              className="text-xs text-white/60 hover:text-white disabled:opacity-30"
                              title="Generate 3D"
                            >
                              🎯
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
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

      {/* 3D Preview Modal */}
      {previewModel && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-gradient-to-br from-[#050816] via-[#071032] to-[#07101a] rounded-2xl overflow-hidden border border-white/10">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-semibold">{previewModel.title}</h2>
              <button
                onClick={() => setPreviewModel(null)}
                className="text-white/60 hover:text-white text-xl"
              >
                ×
              </button>
            </div>
            <div className="relative" style={{ height: '60vh' }}>
              <iframe
                title="Model Preview"
                src={`/model-preview.html?modelUrl=${encodeURIComponent(previewModel.src)}`}
                style={{ position: 'absolute', inset: 0, border: 'none', width: '100%', height: '100%' }}
              />
            </div>
          </div>
        </div>
      )}
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