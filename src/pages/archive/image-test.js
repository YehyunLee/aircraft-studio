import { useState } from "react";
import Head from "next/head";

export default function ImageTest() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");

  const generateImage = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }

    setLoading(true);
    setError("");
    setImageUrl("");

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
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
      setLoading(false);
    }
  };

  const downloadImage = () => {
    if (!imageUrl) return;

    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `generated-image-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <Head>
        <title>Image Generation Test</title>
        <meta name="description" content="Test page for image generation" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main style={{ 
        padding: "2rem", 
        minHeight: "100vh", 
        display: "flex", 
        flexDirection: "column", 
        alignItems: "center",
        justifyContent: "center"
      }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1>Image Generation Test</h1>
          <p>Enter a text prompt to generate an image using Fireworks AI</p>
        </div>

        <div style={{ 
          display: "flex", 
          flexDirection: "column", 
          alignItems: "center",
          gap: "2rem",
          width: "100%"
        }}>
          <div style={{ width: "100%", maxWidth: "600px" }}>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt here... (e.g., 'A beautiful sunset over the ocean')"
              style={{
                width: "100%",
                padding: "1rem",
                fontSize: "1rem",
                borderRadius: "8px",
                border: "1px solid #ccc",
                minHeight: "100px",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>

          <button
            onClick={generateImage}
            disabled={loading}
            style={{
              padding: "0.75rem 2rem",
              fontSize: "1rem",
              borderRadius: "8px",
              border: "none",
              background: loading ? "#ccc" : "#0070f3",
              color: "white",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.2s",
            }}
            onMouseOver={(e) => {
              if (!loading) e.target.style.background = "#0051cc";
            }}
            onMouseOut={(e) => {
              if (!loading) e.target.style.background = "#0070f3";
            }}
          >
            {loading ? "Generating..." : "Generate Image"}
          </button>

          {error && (
            <div
              style={{
                padding: "1rem",
                background: "#fee",
                color: "#c00",
                borderRadius: "8px",
                maxWidth: "600px",
                width: "100%",
              }}
            >
              {error}
            </div>
          )}

          {imageUrl && (
            <div style={{ textAlign: "center" }}>
              <img
                src={imageUrl}
                alt="Generated image"
                style={{
                  maxWidth: "100%",
                  maxHeight: "500px",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                }}
              />
              <div style={{ marginTop: "1rem" }}>
                <button
                  onClick={downloadImage}
                  style={{
                    padding: "0.5rem 1rem",
                    fontSize: "0.9rem",
                    borderRadius: "6px",
                    border: "1px solid #0070f3",
                    background: "white",
                    color: "#0070f3",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseOver={(e) => {
                    e.target.style.background = "#0070f3";
                    e.target.style.color = "white";
                  }}
                  onMouseOut={(e) => {
                    e.target.style.background = "white";
                    e.target.style.color = "#0070f3";
                  }}
                >
                  Download Image
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}