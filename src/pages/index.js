import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import Head from "next/head";
import Script from "next/script";
import { saveModelBlob, getModelObjectURL } from "../lib/idbModels";

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
  // Unified flow state
  const [flowRunning, setFlowRunning] = useState(false);
  const [flowStep, setFlowStep] = useState("idle"); // idle | enhancing | generating-image | converting-3d | done
  
  // Preview modal state
  const [previewModel, setPreviewModel] = useState(null); // { src, title }
  
  // History of all generations in this session
  const [generationHistory, setGenerationHistory] = useState([]);
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(null);

  // Load generation history from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedHistory = localStorage.getItem('generationHistory');
      if (savedHistory) {
        try {
          setGenerationHistory(JSON.parse(savedHistory));
        } catch (e) {
          console.error('Failed to load generation history:', e);
        }
      }
    }
  }, []);

  // Save generation history to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && generationHistory.length > 0) {
      localStorage.setItem('generationHistory', JSON.stringify(generationHistory));
    }
  }, [generationHistory]);

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
      return null;
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
        return data.enhancedPrompt;
      } else {
        setError(data.error || "Failed to enhance prompt");
        return null;
      }
    } catch (err) {
      setError("An error occurred while enhancing the prompt");
      console.error(err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const generateImage = async (promptOverride) => {
    const promptToUse = promptOverride || enhancedPrompt || prompt;
    
    if (!promptToUse.trim()) {
      setError("Please enter or enhance a prompt first");
      return null;
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
        const nowId = Date.now();
        const nextIndex = generationHistory.length;
        const newGeneration = {
          id: nowId,
          originalPrompt: prompt,
          enhancedPrompt: promptOverride || enhancedPrompt || "",
          imageUrl: data.image,
          modelUrl: null,
          modelId: null,
          timestamp: new Date().toISOString()
        };
        setCurrentImageUrl(data.image);
        setCurrentModelUrl("");
        setGenerationHistory(prev => [...prev, newGeneration]);
        setSelectedHistoryIndex(nextIndex);
        return { index: nextIndex, imageUrl: data.image };
      } else {
        setError(data.error || "Failed to generate image");
        return null;
      }
    } catch (err) {
      setError("An error occurred while generating the image");
      console.error(err);
      return null;
    } finally {
      setGeneratingImage(false);
    }
  };



  const generate3DModel = async (imageUrl, historyIndex, markCurrent = false) => {
    if (!imageUrl) {
      setError("Please generate an image first");
      return null;
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
          // Prefer sending an image URL if it is an http(s) asset; otherwise pass data URL/base64
          imageUrl: (typeof imageUrl === 'string' && imageUrl.startsWith('http')) ? imageUrl : undefined,
          imageData: (typeof imageUrl === 'string' && !imageUrl.startsWith('http')) ? imageUrl : undefined,
          filename: `aircraft-${Date.now()}.glb`
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Normalize server response to a usable URL
        let resolvedModelUrl = data.modelUrl;
        let persistedId = null;
        if (!resolvedModelUrl && data.modelDataUrl) {
          try {
            // Convert base64 data URL to Blob URL for preview and download
            const base64 = data.modelDataUrl.split(',')[1];
            const binary = atob(base64);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'model/gltf-binary' });
            resolvedModelUrl = URL.createObjectURL(blob);
            // Persist in IndexedDB so it survives refreshes
            try {
              const id = data.filename || `aircraft-${Date.now()}.glb`;
              await saveModelBlob(id, blob);
              persistedId = id;
            } catch (persistErr) {
              console.warn('Unable to persist GLB to IndexedDB', persistErr);
            }
          } catch (e) {
            console.error('Failed to convert model data to Blob URL', e);
            throw e;
          }
        }

        // Update history with 3D model
        if (historyIndex !== undefined && historyIndex !== null) {
          setGenerationHistory(prev => {
            const updated = [...prev];
            updated[historyIndex].modelUrl = resolvedModelUrl;
            if (persistedId) updated[historyIndex].modelId = persistedId;
            return updated;
          });
        }
        
        if (markCurrent || imageUrl === currentImageUrl) {
          setCurrentModelUrl(resolvedModelUrl);
        }
        return resolvedModelUrl;
      } else {
        setError(data.error || "Failed to generate 3D model");
        return null;
      }
    } catch (err) {
      setError("An error occurred while generating the 3D model");
      console.error(err);
      return null;
    } finally {
      setGenerating3D(false);
    }
  };

  // Orchestrate full flow: enhance -> image -> 3D
  const generateAircraft = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }
    setFlowRunning(true);
    setFlowStep('enhancing');
    setError('');
    try {
      const enhanced = await enhancePrompt();
      // Show the enhanced prompt UI as soon as it's available (state already set in enhancePrompt)
      const promptToUse = enhanced || enhancedPrompt || prompt;
      setFlowStep('generating-image');
      const imgRes = await generateImage(promptToUse);
      if (!imgRes) throw new Error('Image generation failed');
      setFlowStep('converting-3d');
  const modelUrl = await generate3DModel(imgRes.imageUrl, imgRes.index, true);
      if (!modelUrl) throw new Error('3D conversion failed');
      setFlowStep('done');
    } catch (e) {
      console.error(e);
      setFlowStep('idle');
    } finally {
      setFlowRunning(false);
    }
  };



  const removeFromHistory = (index, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      // Update generation history and persist
      setGenerationHistory(prev => {
        const next = [...prev];
        if (index >= 0 && index < next.length) {
          next.splice(index, 1);
        }
        if (typeof window !== 'undefined') {
          if (next.length > 0) {
            localStorage.setItem('generationHistory', JSON.stringify(next));
          } else {
            localStorage.removeItem('generationHistory');
          }
        }
        return next;
      });

      // Adjust selection and clear current display when needed
      if (selectedHistoryIndex === null) {
        // nothing
      } else if (selectedHistoryIndex === index) {
        setSelectedHistoryIndex(null);
        setPrompt("");
        setEnhancedPrompt("");
        setCurrentImageUrl("");
        setCurrentModelUrl("");
        setError("");
      } else if (selectedHistoryIndex > index) {
        setSelectedHistoryIndex(selectedHistoryIndex - 1);
      }
    } catch (err) {
      console.error('Failed to remove history item', err);
    }
  };

  // Resolve a usable model URL for a history item (prefers explicit URL, falls back to IndexedDB)
  const resolveHistoryModelUrl = async (item) => {
    if (!item) return null;
    if (item.modelUrl) return item.modelUrl;
    if (item.modelId) {
      try {
        const url = await getModelObjectURL(item.modelId);
        if (url) return url;
      } catch (e) {
        console.warn('Failed to resolve model from IndexedDB', e);
      }
    }
    return null;
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
    <div className="min-h-screen bg-gradient-to-br from-[#050816] via-[#071032] to-[#07101a] text-white font-sans p-4 sm:p-6 lg:p-8">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <Script
        src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"
        strategy="afterInteractive"
      />

      {/* Header */}
      <header className="max-w-4xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-black font-bold text-lg shadow-lg">A</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Aircraft Studio</h1>
              <p className="text-xs text-white/60">AI-Powered Aircraft Design</p>
            </div>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/aircraft" className="text-sm text-cyan-300 hover:text-cyan-200 transition-colors font-medium">Hangar</Link>
            <Link href="/profile" className="text-sm text-white/80 hover:text-white transition-colors">Profile</Link>
            <a href="/api/auth/login" className="text-sm text-white/80 hover:text-white transition-colors">Login</a>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto">
        {!showGenerator ? (
          <>
            {/* Hero Section */}
            <section className="glass-card rounded-3xl p-8 mb-8 text-center">
              <div className="max-w-2xl mx-auto">
                <h2 className="text-3xl sm:text-4xl font-extrabold leading-tight mb-4 bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
                  Design, Engineer, and Simulate
                </h2>
                <p className="text-lg text-white/80 mb-6 leading-relaxed">
                  Create aircraft concepts with AI assistance. Generate stunning images, convert them to 3D models, and experience them in augmented reality.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                  <button
                    onClick={() => setShowGenerator(true)}
                    className="px-8 py-4 bg-gradient-to-r from-cyan-400 to-cyan-500 text-black font-bold rounded-xl hover:from-cyan-300 hover:to-cyan-400 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                  >
                    🚀 Start Creating
                  </button>
                  <Link
                    href="/aircraft"
                    className="px-8 py-4 rounded-xl border-2 border-white/20 text-white font-semibold hover:bg-white/10 hover:border-white/30 transition-all duration-300 text-center"
                  >
                    Browse Hangar
                  </Link>
                </div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <FeatureCard
                    icon="🤖"
                    title="AI Engineering"
                    subtitle="Text-driven aircraft design with Groq AI"
                  />
                  <FeatureCard
                    icon="🎨"
                    title="Fast Generation"
                    subtitle="High-quality images with Fireworks AI"
                  />
                  <FeatureCard
                    icon="🎯"
                    title="3D Conversion"
                    subtitle="Convert concepts to .glb files with Spar 3D"
                  />
                </div>
              </div>
            </section>

            {/* Mobile CTA */}
            <section className="text-center">
              <p className="text-sm text-white/70 mb-4">Optimized for mobile — design anywhere</p>
              <div className="inline-block glass-card rounded-2xl p-6">
                <div className="w-32 h-32 bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center rounded-xl mb-4">
                  <Image src="/qr_code.png" alt="QR Code" width={64} height={64} className="opacity-70" />
                </div>
                <p className="text-sm text-white/70">Scan to open on mobile</p>
              </div>
            </section>
          </>
        ) : (
          <div className="space-y-6">
            {/* Generator Header */}
            <section className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold mb-1">AI Aircraft Generator</h2>
                  <p className="text-sm text-white/70">Transform your ideas into aircraft designs</p>
                </div>
                <button
                  onClick={() => {
                    setShowGenerator(false);
                    startNewGeneration();
                  }}
                  className="px-4 py-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-all duration-200 text-sm font-medium"
                >
                  ← Back to Home
                </button>
              </div>

              {/* Input Section */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-white/90 mb-3">
                    Describe Your Aircraft Concept
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g., 'Futuristic stealth fighter with blue LED accents' or 'Classic WWII Spitfire in sunset colors'"
                    className="w-full p-4 rounded-xl bg-white/5 border border-white/20 text-white placeholder-white/50 resize-none h-28 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all duration-200 text-sm leading-relaxed"
                  />
                </div>

                {/* Action Buttons - Unified Flow */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={generateAircraft}
                    disabled={flowRunning || !prompt.trim()}
                    className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-cyan-300 hover:to-cyan-400 transition-all duration-300 transform hover:scale-[1.02] shadow-lg hover:shadow-xl disabled:transform-none"
                  >
                    {flowRunning ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                        {flowStep === 'enhancing' && 'enchanging prompt'}
                        {flowStep === 'generating-image' && 'Generating image'}
                        {flowStep === 'converting-3d' && 'Converting to 3D model'}
                        {flowStep === 'done' && 'Done'}
                      </div>
                    ) : (
                      <>🚀 Generate Aircraft</>
                    )}
                  </button>
                  <button
                    onClick={startNewGeneration}
                    disabled={flowRunning}
                    className="px-6 py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-all duration-200 disabled:opacity-50"
                  >
                    📝 New
                  </button>
                </div>

                {/* Combined Output Card: AI Prompt + Image/Model */}
                {(enhancedPrompt || currentImageUrl) && (
                  <section className="glass-card rounded-2xl p-6">
                    <div className="space-y-4">
                      {enhancedPrompt && (
                        <div className="p-4 rounded-xl bg-gradient-to-r from-violet-500/10 to-violet-600/10 border border-violet-500/30">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-violet-400">✨</span>
                            <p className="text-sm font-semibold text-violet-300">AI Enhanced Prompt</p>
                          </div>
                          <p className="text-sm text-white/90 leading-relaxed">{enhancedPrompt}</p>
                        </div>
                      )}
                      {currentImageUrl && (
                        <div className="space-y-4">
                          <div className="relative rounded-xl overflow-hidden bg-white/5 border border-white/10">
                            <img
                              src={currentImageUrl}
                              alt="Generated aircraft"
                              className="w-full h-auto"
                            />
                          </div>
                          {currentModelUrl ? (
                            <div className="flex flex-col sm:flex-row gap-3">
                              <button
                                onClick={() => setPreviewModel({ src: currentModelUrl, title: (enhancedPrompt || prompt || "3D Model") })}
                                className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-all duration-200"
                              >
                                👁 Quick Preview
                              </button>
                              <Link
                                href={`/simulation?src=${encodeURIComponent(currentModelUrl)}&title=${encodeURIComponent(enhancedPrompt || prompt || "3D Model")}`}
                                className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 text-white font-semibold hover:opacity-90 transition-all duration-300 transform hover:scale-[1.02] shadow-lg hover:shadow-xl text-center"
                              >
                                🎮 AR Simulation
                              </Link>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* Error Display */}
                {error && (
                  <div className="p-4 rounded-xl bg-gradient-to-r from-red-500/10 to-red-600/10 border border-red-500/30">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-red-400">⚠️</span>
                      <p className="text-sm font-semibold text-red-300">Error</p>
                    </div>
                    <p className="text-sm text-red-200">{error}</p>
                  </div>
                )}
              </div>
            </section>

            {/* Current Generation Display merged above */}

            {/* Generation History */}
            {generationHistory.length > 0 && (
              <section className="glass-card rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4">Generation History</h3>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                           {generationHistory.map((item, index) => (
                     <div
                       key={item.id}
                       className={`p-4 rounded-xl bg-white/5 border transition-all duration-200 cursor-pointer hover:bg-white/10 ${
                         selectedHistoryIndex === index ? 'border-cyan-400 bg-cyan-400/5' : 'border-white/10'
                       }`}
                       onClick={() => selectFromHistory(index)}
                     >
                       <div className="flex gap-4">
                         <div className="w-20 h-20 rounded-lg overflow-hidden bg-white/10 flex-shrink-0 border border-white/10">
                           <img
                             src={item.imageUrl}
                             alt={`Generation ${index + 1}`}
                             className="w-full h-full object-cover"
                           />
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
                           <p className="text-sm text-white/90 truncate mb-3">{item.originalPrompt}</p>
                            <div className="flex gap-2">
                              {(item.modelUrl || item.modelId) && (
                                <>
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const url = await resolveHistoryModelUrl(item);
                                      if (url) setPreviewModel({ src: url, title: (item.originalPrompt || "3D Model") });
                                    }}
                                    className="text-xs text-white/60 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10"
                                    title="Quick Preview"
                                  >
                                    👁
                                  </button>
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const url = await resolveHistoryModelUrl(item);
                                      if (url) window.location.href = `/simulation?src=${encodeURIComponent(url)}&title=${encodeURIComponent(item.originalPrompt || "3D Model")}`;
                                    }}
                                    className="text-xs text-cyan-300 hover:text-cyan-200 transition-colors px-2 py-1 rounded hover:bg-cyan-300/20"
                                    title="AR Preview"
                                  >
                                    🎮
                                  </button>
                                </>
                               )}

                            <button
                              onClick={(e) => removeFromHistory(index, e)}
                              className="text-xs text-red-300 hover:text-red-200 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
                              title="Remove"
                            >
                              🗑
                            </button>
                          </div>
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

      <footer className="max-w-4xl mx-auto mt-12 text-center">
        <p className="text-sm text-white/50 mb-2">Powered by</p>
        <div className="flex justify-center items-center gap-4 text-xs text-white/40">
          <span>Fireworks</span>
          <span>•</span>
          <span>Flux 1</span>
          <span>•</span>
          <span>Spar 3D</span>
          <span>•</span>
          <span>Groq</span>
        </div>
      </footer>

      <style jsx>{`
        .glass-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
      `}</style>

      {/* 3D Preview Modal */}
      {previewModel && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-4xl glass-card rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-xl font-semibold">{previewModel.title}</h2>
              <button
                onClick={() => setPreviewModel(null)}
                className="text-white/60 hover:text-white text-2xl transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10"
              >
                ×
              </button>
            </div>
            <div className="relative" style={{ height: '70vh' }}>
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
      <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center text-sm font-semibold mb-3 border border-white/20">{title[0]}</div>
      <div className="text-sm font-semibold mb-1">{title}</div>
      <div className="text-xs text-white/60 text-center">{subtitle}</div>
    </div>
  );
}

function FeatureCard({ icon, title, subtitle }) {
  return (
    <div className="text-center p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300">
      <div className="text-2xl mb-3">{icon}</div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <p className="text-xs text-white/70">{subtitle}</p>
    </div>
  );
}