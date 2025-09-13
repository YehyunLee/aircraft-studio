import { Groq } from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const systemPrompt = `You are an expert prompt engineer specializing in creating, descriptive prompts for image generation. 
    Transform the user's input into a rich, detailed prompt that will generate high-quality images.
    If user says, "F22", or "B2", you should describe the shape and how it may look like. This prompt will be then used for
    image generation, though they are good at image gen, they may not know how some fighter jet / aircraft look like.
    Keep the enhanced prompt concise but comprehensive, around 2-3 sentences.`;

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `Transform this idea into a detailed image generation prompt: "${prompt}"`,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 300,
    });

    const enhancedPrompt = completion.choices[0]?.message?.content || prompt;

    res.status(200).json({ 
      originalPrompt: prompt,
      enhancedPrompt: enhancedPrompt 
    });
  } catch (error) {
    console.error('Groq API error:', error);
    res.status(500).json({ 
      error: 'Failed to process prompt',
      details: error.message 
    });
  }
}