// api/generate-image.js — TeacherAI image generation
// Matches generate.js format exactly: Node.js API Routes (req, res)
// type=ai        → fal.ai Flux Schnell (queue submit → poll)
// type=wikimedia → Wikimedia Commons (free, no key)

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

// ── fal.ai: submit to queue then poll ────────────────────────────────────────
async function generateAIImage(topic, subject, grade, theme) {
  if (!FAL_KEY) throw new Error('FAL_API_KEY not set');

  const subjectLower = (subject || '').toLowerCase();
  const themeStr = theme ? `, ${theme} themed` : '';
  const gradeNum = (grade || '').replace(/Grade\s*/i, '').replace(/Gr\.\s*/i, '');

  const style = subjectLower.includes('science')
    ? 'scientific illustration, educational, detailed, nature photography style'
    : subjectLower.includes('math')
    ? 'flat vector illustration, geometric shapes, clean lines, educational'
    : 'warm colourful illustration, storybook style, inviting, cheerful';

  const prompt = `${style}, ${topic}${themeStr}, elementary school classroom, child-friendly, age-appropriate, no text, no letters, no words, professional educational illustration, bright colours`;

  const falHeaders = { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' };

  // Submit job to queue — returns immediately with request_id
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

  const submitted = await submitRes.json();
  const request_id = submitted.request_id;
  if (!request_id) throw new Error(`No request_id. Response: ${JSON.stringify(submitted).slice(0,200)}`);

  // Poll for result — up to 8 seconds
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const pollRes = await fetch(
        `https://queue.fal.run/fal-ai/flux/schnell/requests/${request_id}`,
        { headers: falHeaders }
      );
      if (!pollRes.ok) continue;
      const data = await pollRes.json();
      if (data.status === 'FAILED') throw new Error('fal.ai generation failed');
      const url = data?.images?.[0]?.url || data?.output?.images?.[0]?.url;
      if (url) return url;
    } catch (e) {
      if (e.message.includes('failed')) throw e;
    }
  }
  throw new Error('fal.ai timed out after 8s polling');
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
  url.searchParams.set('gsrsearch', query);  // use topic directly, no extra keywords
  url.searchParams.set('gsrlimit', '20');    // more candidates for better filtering
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
    const title = (p.title || '').replace('File:', '').toLowerCase();
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const titleMatchScore = queryWords.filter(w => title.includes(w)).length * 3;
    return {
      url: info.thumburl || info.url,
      title: (p.title || '').replace('File:', ''),
      license: info.extmetadata?.LicenseShortName?.value || 'CC',
      score: titleMatchScore + (info.width > info.height ? 2 : 0) + (info.width > 500 ? 1 : 0),
    };
  }).filter(Boolean);

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// ── Handler — matches generate.js pattern exactly ─────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { type = 'ai', topic, subject, grade, theme } = req.body || {};
  if (!topic) return res.status(400).json({ error: 'topic required' });

  const cacheKey = `${type}:${(subject||'').slice(0,20)}:${(grade||'').slice(0,10)}:${topic.slice(0,60)}`;

  try {
    const cached = await getCached(cacheKey);
    if (cached) return res.status(200).json({ url: cached, cached: true });

    let imageUrl, meta = {};

    if (type === 'wikimedia') {
      const result = await getWikimediaImage(topic);
      if (!result) return res.status(200).json({ url: null, reason: 'no wikimedia match' });
      imageUrl = result.url;
      meta = { title: result.title, license: result.license };
    } else {
      imageUrl = await generateAIImage(topic, subject, grade, theme);
    }

    await setCache(cacheKey, imageUrl);
    return res.status(200).json({ url: imageUrl, cached: false, ...meta });

  } catch (err) {
    console.error('[generate-image]', type, topic, err.message);
    return res.status(200).json({ url: null, error: err.message });
  }
}
