// api/lesson-slides.js — TeacherAI saved slide decks
// GET    ?lesson_id=...        → { slides, updated_at } or { slides: null }
// PUT    { lesson_id, slides, model? } → { ok: true }
// DELETE ?lesson_id=...        → { ok: true }  (force regenerate on next load)
//
// Auth: reuses the same Supabase JWT verification pattern as generate.js.
// RLS is enforced at the DB level, but we also scope queries by user_id
// defensively in case service key is used.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function verifyAuth(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false, reason: 'no token' };
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return { ok: false, reason: `auth ${r.status}` };
    const user = await r.json();
    if (!user?.id) return { ok: false, reason: 'no user id' };
    return { ok: true, userId: user.id };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function sb(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

module.exports = async (req, res) => {
  // CORS (adjust origin as needed)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in again.' });
  }
  const userId = auth.userId;

  // lesson_id from query (GET/DELETE) or body (PUT)
  const lessonId =
    (req.query && req.query.lesson_id) ||
    (req.body && req.body.lesson_id);
  if (!lessonId || typeof lessonId !== 'string') {
    return res.status(400).json({ error: 'lesson_id required' });
  }
  const lidEnc = encodeURIComponent(lessonId);

  try {
    // ─────────────────────────── GET ───────────────────────────
    if (req.method === 'GET') {
      const r = await sb(
        `lesson_slides?lesson_id=eq.${lidEnc}&user_id=eq.${userId}&select=slides,updated_at,model`
      );
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        console.error('lesson-slides GET error:', r.status, t);
        return res.status(500).json({ error: 'Failed to load slides' });
      }
      const rows = await r.json();
      const row = rows?.[0];
      return res.status(200).json({
        slides: row?.slides || null,
        updated_at: row?.updated_at || null,
        model: row?.model || null,
      });
    }

    // ─────────────────────────── PUT ───────────────────────────
    if (req.method === 'PUT') {
      const { slides, model } = req.body || {};
      if (!slides) return res.status(400).json({ error: 'slides required' });

      // Rough size guard — slide JSON shouldn't exceed ~500KB
      const approxSize = JSON.stringify(slides).length;
      if (approxSize > 500_000) {
        return res.status(413).json({ error: 'Slides payload too large' });
      }

      const payload = {
        lesson_id: lessonId,
        user_id: userId,
        slides,
        model: model || null,
        updated_at: new Date().toISOString(),
      };

      // Upsert via Prefer header
      const r = await sb('lesson_slides', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const t = await r.text().catch(() => '');
        console.error('lesson-slides PUT error:', r.status, t);
        return res.status(500).json({ error: 'Failed to save slides' });
      }
      return res.status(200).json({ ok: true });
    }

    // ─────────────────────────── DELETE ───────────────────────────
    if (req.method === 'DELETE') {
      const r = await sb(
        `lesson_slides?lesson_id=eq.${lidEnc}&user_id=eq.${userId}`,
        { method: 'DELETE' }
      );
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        console.error('lesson-slides DELETE error:', r.status, t);
        return res.status(500).json({ error: 'Failed to delete slides' });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('lesson-slides.js error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
