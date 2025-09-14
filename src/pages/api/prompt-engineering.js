import { Groq } from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, action = 'enhance', jetName = null } = req.body || {};

  if (action === 'stats') {
    if (!jetName && !prompt) {
      return res.status(400).json({ error: 'jetName or prompt is required for stats' });
    }
    try {
      const system = `You are an aerospace gameplay tuning assistant. Given a jet/aircraft name and short description, output balanced gameplay stats as strict JSON for an AR arcade shooter. Use conservative, fun defaults if uncertain. Return ONLY JSON.`;
      const user = `Jet: ${jetName || 'Unknown'}\nContext: ${prompt || ''}\n\nReturn JSON with numeric fields in meters/seconds where applicable:\n{
  "forwardSpeed": number,      // base forward cruise speed magnitude [0.4..1.4]
  "shotSpeed": number,         // projectile/beam travel speed [5..14]
  "beamRange": number,         // max beam length [1.2..3.5]
  "beamWidth": number,         // beam width in meters [0.02..0.06]
  "cooldown": number,          // seconds between shots [0.08..0.35]
  "aimSpreadDeg": number       // player aim cone half-angle in degrees [4..18]
}`;

      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.4,
        max_tokens: 300,
      });

      const raw = completion.choices[0]?.message?.content || '';
      let parsed = null;
      try {
        // Attempt to extract JSON even if surrounded by text
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
      } catch (_) {
        // fallback defaults
        parsed = {};
      }

      const clamp = (v, a, b, d) => {
        const n = typeof v === 'number' && Number.isFinite(v) ? v : d;
        return Math.min(b, Math.max(a, n));
      };

      const stats = {
        forwardSpeed: clamp(parsed.forwardSpeed, 0.4, 1.4, 0.88),
        shotSpeed: clamp(parsed.shotSpeed, 5, 14, 8.0),
        beamRange: clamp(parsed.beamRange, 1.2, 3.5, 2.1),
        beamWidth: clamp(parsed.beamWidth, 0.02, 0.06, 0.035),
        cooldown: clamp(parsed.cooldown, 0.08, 0.35, 0.18),
        aimSpreadDeg: clamp(parsed.aimSpreadDeg, 4, 18, 10.0),
      };

      return res.status(200).json({ ok: true, stats, source: 'groq' });
    } catch (error) {
      console.error('Groq stats error:', error);
      return res.status(200).json({
        ok: true,
        stats: {
          forwardSpeed: 0.88,
          shotSpeed: 8.0,
          beamRange: 2.1,
          beamWidth: 0.035,
          cooldown: 0.18,
          aimSpreadDeg: 10.0,
        },
        source: 'default',
      });
    }
  }

  // Default behavior: enhanced image prompt
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