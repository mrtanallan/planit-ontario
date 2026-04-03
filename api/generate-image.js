// api/generate-image.js — TeacherAI image generation
// Uses fal.ai queue API to avoid Vercel 10s timeout on Hobby plan
// type=ai        → fal.ai Flux Schnell (submit → poll)
// type=wikimedia → Wikimedia Commons (instant, no key needed)

const FAL_KEY = process.env.FAL_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── Cache ─────────────────────────────────────────────────────────────────────
async function getCached(key) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/image_cache?cache_key=eq.${encodeURIComponent(key)}&select=image_url`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows = await r.json();
    return rows?.[0]?.image_url || null;
  } catch { return null; }
}

async function setCache(key, url) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/image_cache`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify({ cache_key: key, image_url: url }),
    });
  } catch { /* non-fatal */ }
}

// ── fal.ai — submit job then poll until done ──────────────────────────────────
async function generateAIImage(topic, subject, grade, theme) {
  if (!FAL_KEY) throw new Error('FAL_API_KEY not set');

  const subjectLower = (subject || '').toLowerCase();
  const themeStr = theme ? `, ${theme} themed` : '';
  const gradeNum = (grade || '').replace('Grade ', '').replace('Gr. ', '');

  const style = subjectLower.includes('science')
    ? 'scientific illustration, educational, detailed, nature photography style'
    : subjectLower.includes('math')
    ? 'flat vector illustration, geometric shapes, clean lines, educational'
    : 'warm colourful illustration, storybook style, inviting, cheerful';

  const prompt = `${style}, ${topic}${themeStr}, elementary school classroom, child-friendly, age-appropriate, no text, no letters, no words, professional educational illustration, bright colours`;

  const falHeaders = {
    Authorization: `Key ${FAL_KEY}`,
    'Content-Type': 'application/json',
  };

  // Step 1: Submit to queue (returns immediately)
  const submitRes = await fetch('https://queue.fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: falHeaders,
    body: JSON.stringify({
      prompt,
      image_size: 'landscape_4_3',
      num_inference_steps: 4,
      num_images: 1,
      enable_safety_checker: true,
    }),
  });

  if (!submitRes.ok) {
    const txt = await submitRes.text();
    throw new Error(`fal.ai submit ${submitRes.status}: ${txt.slice(0, 200)}`);
  }

  const { request_id } = await submitRes.json();
  if (!request_id) throw new Error('No request_id from fal.ai queue');

  // Step 2: Poll for result — up to 8 seconds, 1s intervals
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise(r => setTimeout(r, 1000));

    const resultRes = await fetch(
      `https://queue.fal.run/fal-ai/flux/schnell/requests/${request_id}`,
      { headers: falHeaders }
    );

    if (!resultRes.ok) continue;
    const data = await resultRes.json();

    // Check status
    if (data.status === 'COMPLETED' || data.images) {
      const url = data.images?.[0]?.url || data.output?.images?.[0]?.url;
      if (url) return url;
    }
    if (data.status === 'FAILED') throw new Error('fal.ai generation failed');
  }

  throw new Error('fal.ai timed out after 8 polls');
}

// ── Wikimedia Commons ─────────────────────────────────────────────────────────
async function getWikimediaImage(topic) {
  const query = topic
    .replace(/grade\s*\d+/gi, '')
    .replace(/ontario|curriculum|lesson|unit|introduction to/gi, '')
    .replace(/[-\u2013\u2014:]/g, ' ')
    .trim();

  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrnamespace', '6');
  url.searchParams.set('gsrsearch', `${query} science`);
  url.searchParams.set('gsrlimit', '12');
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|size|mime|extmetadata');
  url.searchParams.set('iiurlwidth', '800');
  url.searchParams.set('origin', '*');

  const r = await fetch(url.toString(), {
    headers: { 'User-Agent': 'TeacherAI/1.0 (teacherai.ca)' }
  });
  if (!r.ok) throw new Error(`Wikimedia ${r.status}`);

  const data = await r.json();
  const pages = Object.values(data?.query?.pages || {});

  const candidates = pages.map(p => {
    const info = p.imageinfo?.[0];
    if (!info) return null;
    const mime = info.mime || '';
    if (!mime.startsWith('image/jpeg') && !mime.startsWith('image/png')) return null;
    if ((info.width || 0) < 300 || (info.height || 0) < 200) return null;
    const ratio = (info.width || 1) / (info.height || 1);
    if (ratio > 4 || ratio < 0.4) return null;
    const license = (info.extmetadata?.LicenseShortName?.value || '').toLowerCase();
    if (license && !license.includes('cc') && !license.includes('public domain')) return null;
    return {
      url: info.thumburl || info.url,
      title: (p.title || '').replace('File:', ''),
      license: info.extmetadata?.LicenseShortName?.value || 'CC',
      score: (info.width > info.height ? 2 : 0) + (info.width > 500 ? 1 : 0),
    };
  }).filter(Boolean);

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }});
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const { type = 'ai', topic, subject, grade, theme } = body;
  if (!topic) return new Response(JSON.stringify({ error: 'topic required' }), { status: 400 });

  const cacheKey = `${type}:${(subject||'').slice(0,20)}:${(grade||'').slice(0,10)}:${topic.slice(0,60)}`;
  const hdrs = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    const cached = await getCached(cacheKey);
    if (cached) {
      return new Response(JSON.stringify({ url: cached, cached: true }), { status: 200, headers: hdrs });
    }

    let imageUrl, meta = {};

    if (type === 'wikimedia') {
      const result = await getWikimediaImage(topic);
      if (!result) {
        return new Response(JSON.stringify({ url: null, reason: 'no wikimedia match' }), { status: 200, headers: hdrs });
      }
      imageUrl = result.url;
      meta = { title: result.title, license: result.license };
    } else {
      imageUrl = await generateAIImage(topic, subject, grade, theme);
    }

    await setCache(cacheKey, imageUrl);
    return new Response(JSON.stringify({ url: imageUrl, cached: false, ...meta }), { status: 200, headers: hdrs });

  } catch (err) {
    console.error('[generate-image]', type, topic, err.message);
    return new Response(JSON.stringify({ url: null, error: err.message }), { status: 200, headers: hdrs });
  }
}
