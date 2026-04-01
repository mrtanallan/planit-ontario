// api/generate.js — TeacherAI v5.1 (safe version — no Stripe yet)
// Forwards requests to Anthropic. Stripe/payment gating added separately later.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    const { model, max_tokens, messages, system } = body;

    const anthropicPayload = { model, max_tokens, messages };
    // Forward system prompt if provided (used by SVG generation calls)
    if (system) anthropicPayload.system = system;

    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicPayload),
    });

    if (anthropicRes.status === 529) {
      return res.status(529).json({ error: 'AI service at capacity. Please try again in a moment.' });
    }

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      console.error('Anthropic error:', data);
      return res.status(anthropicRes.status).json({ error: data.error || 'AI generation failed' });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('generate.js error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
};
