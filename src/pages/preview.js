import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";

export default function Preview() {
  const router = useRouter();
  const { src, title, modelId } = router.query;

  useEffect(() => {
    if (!src && !modelId) return;
    // Redirect to the unified quick-preview HTML which uses Three.js
    const url = src
      ? `/model-preview.html?modelUrl=${encodeURIComponent(src)}${title ? `&title=${encodeURIComponent(title)}` : ""}`
      : `/model-preview.html?modelId=${encodeURIComponent(modelId)}${title ? `&title=${encodeURIComponent(title)}` : ""}`;
    // Use replace so back button doesn't create a redirect loop
    window.location.replace(url);
  }, [src, modelId, title]);

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#050816] via-[#071032] to-[#07101a] text-white font-sans">
      <Head>
        <title>{title ? `${title} – Preview` : "3D Preview"}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <header className="p-4 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="text-sm text-white/70 hover:text-white"
        >
          ← Back
        </button>
        <h1 className="text-sm font-medium truncate max-w-[60%] text-center">
          {title || "3D Preview"}
        </h1>
        {src || modelId ? (
          <a
            href={src || undefined}
            download
            className="text-sm text-cyan-300 hover:text-cyan-200"
          >
            Download
          </a>
        ) : (
          <span className="w-12" />
        )}
      </header>

      <main className="px-3 pb-6">
        {!src && !modelId ? (
          <div className="p-6 text-center text-white/70">No model provided. Append <code>?src=/models/your.glb</code> or <code>?modelId=YOUR_ID</code> — or open Quick Preview in the app.</div>
        ) : (
          <div className="p-6 text-center text-white/70">Redirecting to quick preview…</div>
        )}
      </main>
    </div>
  );
}
