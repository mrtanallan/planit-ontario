// api/generate-image.js — TeacherAI image generation endpoint
// Handles two image types:
//   type=ai        → fal.ai Flux Schnell (AI-generated contextual illustration)
//   type=wikimedia → Wikimedia Commons (real photo/diagram for science)

export const config = { runtime: 'edge' };

const FAL_KEY = process.env.FAL_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Supabase image cache ──────────────────────────────────────────────────────
async function getCachedImage(cacheKey) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/image_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&select=image_url`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows = await r.json();
    return rows?.[0]?.image_url || null;
  } catch { return null; }
}

async function setCachedImage(cacheKey, imageUrl) {
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
      body: JSON.stringify({ cache_key: cacheKey, image_url: imageUrl }),
    });
  } catch { /* cache write failure is non-fatal */ }
}

// ── AI image generation via fal.ai Flux Schnell ───────────────────────────────
async function generateAIImage(topic, subject, grade, theme) {
  if (!FAL_KEY) throw new Error('FAL_API_KEY not configured');

  // Build a safe, educational, classroom-appropriate prompt
  const gradeNum = grade ? grade.replace('Grade ', '') : '';
  const themeContext = theme ? `, ${theme} themed` : '';
  const subjectContext = (subject || '').toLowerCase();

  // Subject-specific style guidance
  const styleGuide = subjectContext.includes('math')
    ? 'flat vector illustration, geometric shapes, clean lines, educational poster style'
    : subjectContext.includes('science')
    ? 'scientific illustration, nature photography style, detailed, educational'
    : subjectContext.includes('language') || subjectContext.includes('literacy')
    ? 'warm illustration, storybook style, inviting, colorful'
    : 'flat vector illustration, educational, bright colors';

  const prompt = [
    `${styleGuide}`,
    `topic: ${topic}${themeContext}`,
    `for Grade ${gradeNum || 'K-8'} Ontario classroom`,
    'child-friendly, age-appropriate, no text, no words, no letters',
    'high quality, professional educational illustration',
    'white background or soft gradient background',
  ].join(', ');

  const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size: 'landscape_4_3',  // 1024x768 — good for slide panels
      num_inference_steps: 4,        // Schnell is fast at 4 steps
      num_images: 1,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`fal.ai error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const imageUrl = data?.images?.[0]?.url;
  if (!imageUrl) throw new Error('No image URL in fal.ai response');
  return imageUrl;
}

// ── Wikimedia Commons image search ────────────────────────────────────────────
// Returns a real CC-licensed photo/diagram suitable for science slides
async function getWikimediaImage(topic, grade) {
  // Build search query from topic — strip common words, focus on key terms
  const cleanTopic = topic
    .replace(/grade\s*\d+/gi, '')
    .replace(/ontario|curriculum|lesson|unit|introduction to/gi, '')
    .replace(/[-–—:]/g, ' ')
    .trim();

  // Add educational context to improve results
  const searchQuery = `${cleanTopic} science diagram`;

  const apiUrl = new URL('https://commons.wikimedia.org/w/api.php');
  apiUrl.searchParams.set('action', 'query');
  apiUrl.searchParams.set('format', 'json');
  apiUrl.searchParams.set('generator', 'search');
  apiUrl.searchParams.set('gsrnamespace', '6'); // File namespace only
  apiUrl.searchParams.set('gsrsearch', searchQuery);
  apiUrl.searchParams.set('gsrlimit', '10');
  apiUrl.searchParams.set('prop', 'imageinfo');
  apiUrl.searchParams.set('iiprop', 'url|size|mime|extmetadata');
  apiUrl.searchParams.set('iiurlwidth', '800');
  apiUrl.searchParams.set('origin', '*');

  const r = await fetch(apiUrl.toString(), {
    headers: { 'User-Agent': 'TeacherAI/1.0 (teacherai.ca; educational tool)' }
  });

  if (!r.ok) throw new Error(`Wikimedia API error: ${r.status}`);
  const data = await r.json();
  const pages = Object.values(data?.query?.pages || {});

  // Filter to good educational images
  const candidates = pages
    .map(p => {
      const info = p.imageinfo?.[0];
      if (!info) return null;
      const mime = info.mime || '';
      const w = info.width || 0;
      const h = info.height || 0;
      // Only images (not audio/video), minimum size, reasonable aspect ratio
      if (!mime.startsWith('image/')) return null;
      if (w < 200 || h < 200) return null;
      if (w / h > 5 || h / w > 5) return null; // Skip very thin strips
      // Skip SVG (rendering issues in slides), prefer JPG/PNG
      if (mime === 'image/svg+xml') return null;

      const meta = info.extmetadata || {};
      const license = (meta.LicenseShortName?.value || '').toLowerCase();
      // Only CC licenses and public domain
      const isOpen = license.includes('cc') || license.includes('public domain') || license === '';

      return isOpen ? {
        url: info.thumburl || info.url,
        title: p.title?.replace('File:', '') || '',
        license: meta.LicenseShortName?.value || 'CC',
        width: w,
        height: h,
      } : null;
    })
    .filter(Boolean);

  if (!candidates.length) return null;

  // Pick the best candidate — prefer landscape images with reasonable dimensions
  const scored = candidates.map(c => ({
    ...c,
    score: (c.width > c.height ? 2 : 0) + (c.width > 400 ? 1 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const { type = 'ai', topic, subject, grade, theme } = body;

  if (!topic) {
    return new Response(JSON.stringify({ error: 'topic required' }), { status: 400 });
  }

  // Cache key — deterministic per topic+grade+subject+type
  const cacheKey = `${type}:${(subject||'').slice(0,20)}:${(grade||'').slice(0,10)}:${topic.slice(0,60)}`;

  try {
    // Check cache first
    const cached = await getCachedImage(cacheKey);
    if (cached) {
      return new Response(JSON.stringify({ url: cached, cached: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    let imageUrl, imageMeta = {};

    if (type === 'wikimedia') {
      const result = await getWikimediaImage(topic, grade);
      if (!result) {
        return new Response(JSON.stringify({ url: null, error: 'No suitable Wikimedia image found' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      imageUrl = result.url;
      imageMeta = { title: result.title, license: result.license };
    } else {
      // Default: AI generation via fal.ai
      imageUrl = await generateAIImage(topic, subject, grade, theme);
    }

    // Cache the result
    await setCachedImage(cacheKey, imageUrl);

    return new Response(JSON.stringify({ url: imageUrl, cached: false, ...imageMeta }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    console.error('generate-image error:', err.message);
    return new Response(JSON.stringify({ url: null, error: err.message }), {
      status: 200, // Return 200 so app can gracefully degrade
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
