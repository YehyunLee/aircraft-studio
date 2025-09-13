import axios from "axios";
import FormData from "form-data";
import path from "path";
import { getStore } from "@netlify/blobs";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { imageData, imageUrl, filename } = req.body;

  if (!imageData && !imageUrl) {
    return res.status(400).json({ error: "Either imageData (base64) or imageUrl is required" });
  }

  const apiKey = process.env.STABILITY_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Stability API key not configured" });
  }

  try {
    // Obtain image bytes as Buffer
    let imageBuffer;
    let detectedMime = "image/png";

    if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
      // Fetch image from remote URL server-side to avoid large client payloads
      const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', validateStatus: undefined });
      if (imgResp.status < 200 || imgResp.status >= 300) {
        throw new Error(`Failed to fetch image from URL (status ${imgResp.status})`);
      }
      imageBuffer = Buffer.from(imgResp.data);
      const contentType = imgResp.headers['content-type'];
      if (contentType && typeof contentType === 'string') {
        detectedMime = contentType;
      }
    } else if (imageData && typeof imageData === 'string' && imageData.startsWith('data:')) {
      // Data URL: data:image/png;base64,....
      const matches = imageData.match(/^data:(.*?);base64,(.*)$/);
      if (!matches) {
        throw new Error('Invalid data URL for imageData');
      }
      detectedMime = matches[1] || 'image/png';
      imageBuffer = Buffer.from(matches[2], 'base64');
    } else if (imageData && typeof imageData === 'string') {
      // Raw base64 without prefix
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
      imageBuffer = Buffer.from(base64Data, 'base64');
      detectedMime = 'image/png';
    } else {
      throw new Error('No valid image input provided');
    }

    // Prepare the request
    const formData = new FormData();
    // Send the image as a Buffer; filename and contentType help the API parse it correctly
    formData.append("image", imageBuffer, {
      filename: `input-${Date.now()}.${detectedMime.includes('png') ? 'png' : 'jpg'}`,
      contentType: detectedMime,
    });
    formData.append("texture_resolution", "2048");
    formData.append("foreground_ratio", "1.3");
    formData.append("remesh", "none");
    formData.append("guidance_scale", "3");

    // Make request to Stability AI
    const response = await axios.post(
      "https://api.stability.ai/v2beta/3d/stable-point-aware-3d",
      formData,
      {
        validateStatus: undefined,
        responseType: "arraybuffer",
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
          "stability-client-id": "aircraft-studio",
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    if (response.status === 200) {
      // Convert returned ArrayBuffer to base64 data URL so the client can create a Blob URL
      const glbBuffer = Buffer.from(response.data);
      const base64 = glbBuffer.toString('base64');
      const dataUrl = `data:model/gltf-binary;base64,${base64}`;

      const glbFilename = filename || `aircraft-${Date.now()}.glb`;

      // Try persisting to Netlify Blobs for a stable URL
      let stored = false;
      let publicModelUrl = null;
      try {
        const store = getStore('models');
        await store.set(glbFilename, glbBuffer);
        stored = true;
        // Expose via our API route so it works under the same domain and CORS
        publicModelUrl = `/api/models/${encodeURIComponent(glbFilename)}`;
      } catch (e) {
        // If not on Netlify or any issue occurs, fall back to returning data URL only
        stored = false;
        publicModelUrl = null;
      }

      res.status(200).json({
        success: true,
        filename: glbFilename,
        // If we stored it, give a stable URL; always include data URL for immediate preview
        modelUrl: publicModelUrl || null,
        modelDataUrl: dataUrl,
        message: "3D model generated successfully",
      });
    } else {
      throw new Error(`API returned status ${response.status}: ${response.data.toString()}`);
    }
  } catch (error) {
    console.error("Error generating 3D model:", error);

    res.status(500).json({
      error: "Failed to generate 3D model",
      details: error.message,
    });
  }
}