// api/generate.js — TeacherAI v5.2 (maxDuration:60, AbortController 55s)

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Health check
  if (req.body?.ping) return res.status(200).json({ pong: true, version: 'v5.2' });

  try {
    const body = req.body;
    const { model, max_tokens, messages, system } = body;

    if (!model || !messages) {
      return res.status(400).json({ error: 'Missing required fields: model, messages' });
    }

    const anthropicPayload = { model, max_tokens, messages };
    if (system) anthropicPayload.system = system;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 58000);

    let anthropicRes;
    try {
      anthropicRes = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(anthropicPayload),
      });
    } catch (fetchErr) {
      clearTimeout(timer);
      if (fetchErr.name === 'AbortError') {
        return res.status(504).json({ error: 'Generation timed out after 55s. Try again or reduce outputs selected.' });
      }
      throw fetchErr;
    }
    clearTimeout(timer);

    if (anthropicRes.status === 529) {
      return res.status(529).json({ error: 'AI service at capacity. Please try again in a moment.' });
    }

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      console.error('Anthropic error:', JSON.stringify(data));
      return res.status(anthropicRes.status).json({ error: data?.error?.message || data?.error || 'AI generation failed' });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('generate.js error:', err.message);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
};
