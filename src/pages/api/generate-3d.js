import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";

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

  const { imageData, filename } = req.body;

  if (!imageData) {
    return res.status(400).json({ error: "Image data is required" });
  }

  const apiKey = process.env.STABILITY_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Stability API key not configured" });
  }

  try {
    // Convert base64 image to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");
    
    // Create temporary file for the image
    const tempDir = path.join(process.cwd(), "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempImagePath = path.join(tempDir, `temp-${Date.now()}.png`);
    fs.writeFileSync(tempImagePath, imageBuffer);

    // Prepare the request
    const formData = new FormData();
    formData.append("image", fs.createReadStream(tempImagePath));
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

    // Clean up temp image file
    fs.unlinkSync(tempImagePath);

    if (response.status === 200) {
      // Create directory for GLB files if it doesn't exist
      const glbDir = path.join(process.cwd(), "public", "models");
      if (!fs.existsSync(glbDir)) {
        fs.mkdirSync(glbDir, { recursive: true });
      }

      // Save GLB file
      const glbFilename = filename || `aircraft-${Date.now()}.glb`;
      const glbPath = path.join(glbDir, glbFilename);
      fs.writeFileSync(glbPath, Buffer.from(response.data));

      // Return the public URL for the GLB file
      const publicUrl = `/models/${glbFilename}`;

      res.status(200).json({
        success: true,
        modelUrl: publicUrl,
        filename: glbFilename,
        message: "3D model generated successfully",
      });
    } else {
      throw new Error(`API returned status ${response.status}: ${response.data.toString()}`);
    }
  } catch (error) {
    console.error("Error generating 3D model:", error);
    
    // Clean up temp files on error
    const tempDir = path.join(process.cwd(), "temp");
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      files.forEach(file => {
        if (file.startsWith("temp-")) {
          fs.unlinkSync(path.join(tempDir, file));
        }
      });
    }

    res.status(500).json({
      error: "Failed to generate 3D model",
      details: error.message,
    });
  }
}