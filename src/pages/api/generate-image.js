import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const apiKey = process.env.FIREWORKS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  try {
    const response = await fetch(
      "https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-1-schnell-fp8/text_to_image",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "image/jpeg",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prompt: prompt,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const base64Image = Buffer.from(buffer).toString("base64");

    res.status(200).json({
      success: true,
      image: `data:image/jpeg;base64,${base64Image}`,
    });
  } catch (error) {
    console.error("Error generating image:", error);
    res.status(500).json({
      error: "Failed to generate image",
      details: error.message,
    });
  }
}