// api/generate.js — TeacherAI v8
// Pilot gating: verifies JWT, checks plan (beta/pro only), enforces 25-lesson cap for beta users.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const BETA_LESSON_LIMIT = 25;

const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY  // service key — bypasses RLS
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Verify JWT
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token. Please sign in.' });
  }

  const supabase = getSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }

  // 2. Load profile and check plan
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('plan, lessons_this_month')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return res.status(403).json({ error: 'Account not found. Please sign out and sign back in.' });
  }

  const plan = profile.plan || 'free';

  if (plan !== 'beta' && plan !== 'pro') {
    return res.status(403).json({
      error: 'Pilot access required. Please use a valid pilot access code to activate your account.',
      code: 'NO_ACCESS'
    });
  }

  // 3. Enforce beta lesson cap
  if (plan === 'beta' && (profile.lessons_this_month || 0) >= BETA_LESSON_LIMIT) {
    return res.status(429).json({
      error: `Pilot limit reached (${BETA_LESSON_LIMIT} lessons). Thank you for testing TeacherAI! Full access coming soon.`,
      code: 'PILOT_LIMIT_REACHED',
      lessonsUsed: profile.lessons_this_month,
      limit: BETA_LESSON_LIMIT
    });
  }

  // 4. Forward to Anthropic
  try {
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

    // 5. Increment lesson count on success (beta only)
    if (plan === 'beta') {
      supabase
        .from('profiles')
        .update({ lessons_this_month: (profile.lessons_this_month || 0) + 1 })
        .eq('id', user.id)
        .then(() => {})
        .catch(err => console.warn('Failed to increment lessons_this_month:', err.message));
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('generate.js error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
};
