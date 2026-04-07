// api/generate.js — TeacherAI v6 (auth + beta gate + per-user cap)
// Verifies Supabase JWT, checks plan, enforces 25-lesson pilot cap.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const { createClient } = require('@supabase/supabase-js');

const PILOT_CAP = 25; // lessons per tester for the 2-week pilot

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1. Verify auth token
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Not signed in' });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: 'Invalid session' });
    const userId = userData.user.id;

    // 2. Load profile, check plan and usage
    const { data: profile, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('plan, lessons_this_month')
      .eq('id', userId)
      .single();

    if (profErr || !profile) return res.status(403).json({ error: 'Profile not found' });

    if (profile.plan !== 'beta' && profile.plan !== 'pro') {
      return res.status(403).json({ error: 'Beta access required. Contact the pilot admin for an access code.' });
    }

    if (profile.plan === 'beta' && profile.lessons_this_month >= PILOT_CAP) {
      return res.status(429).json({
        error: `Pilot limit reached (${PILOT_CAP} lessons). Message the admin if you need more for testing.`
      });
    }

    // 3. Forward to Anthropic
    const { model, max_tokens, messages, system } = req.body;
    const anthropicPayload = { model, max_tokens, messages };
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

    // 4. Increment usage counter (only on success)
    await supabaseAdmin
      .from('profiles')
      .update({ lessons_this_month: (profile.lessons_this_month || 0) + 1 })
      .eq('id', userId);

    return res.status(200).json(data);

  } catch (err) {
    console.error('generate.js error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
};
