// api/generate-image.js — TeacherAI image generation
// Flux Schnell at 8 steps + strong negative prompt for text suppression
//
// Supports two usage modes:
//   1. Slide cover art (existing): {type, topic, subject, grade, theme}
//      → auto-picks style by subject, portrait_4_3, topic-level cache
//   2. K worksheet line drawings (new): {type, topic, subject, grade, style, imageSize, subKey}
//      → caller specifies style explicitly, square_hd, per-subKey cache

const FAL_KEY = process.env.FAL_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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
  } catch {}
}

// K WORKSHEET STYLE — simple printable line drawings for Kindergarten.
// Aggressive positive-prompt styling because Flux Schnell often ignores negative prompts.
const K_LINE_DRAWING_STYLE =
  "simple black and white line drawing, coloring book page, thick black outlines on white background, single centered object, no text, minimal detail, childlike";

async function generateAIImage({ topic, subject, grade, theme, style, imageSize }) {
  if (!FAL_KEY) throw new Error('FAL_API_KEY not set');

  const subjectLower = (subject || '').toLowerCase();
  const themeStr = theme ? `, ${theme} theme` : '';
  const gradeNum = (grade || '').replace(/Grade\s*/i, '').replace(/Gr\.\s*/i, '');

  // If caller passed a style string explicitly, use it verbatim.
  // Otherwise auto-pick by subject (existing slide cover-art behavior).
  let resolvedStyle;
  if (style && typeof style === 'string') {
    resolvedStyle = style;
  } else {
    resolvedStyle = subjectLower.includes('science')
      ? 'soft watercolour nature painting, botanical illustration'
      : subjectLower.includes('math')
      ? 'clean flat vector illustration, geometric shapes, bright colours'
      : 'warm children\'s book painting, cosy illustration';
  }

  // Build prompt. K line-drawing mode skips the "Grade X classroom" filler
  // and decorative words because we want a clean single object, not a scene.
  // STYLE-FIRST ORDERING: Flux Schnell at 8 steps locks onto the first
  // concept in the prompt. If we put "buttons" before "watercolour", it
  // generates 3D photoreal buttons and ignores the style. Style descriptors
  // MUST lead, then subject context, then the topic. Topic should be phrased
  // as the painted/illustrated subject, not the standalone noun.
  const isKLineDrawing = resolvedStyle === K_LINE_DRAWING_STYLE;
  const prompt = isKLineDrawing
    ? [resolvedStyle, 'of ' + topic, 'no text anywhere in image', 'no signatures, no artist names, no watermarks'].join(', ')
    : [
        resolvedStyle,                                    // style FIRST — Flux locks here
        `depicting ${topic}${themeStr}`,                  // topic as subject of the style
        `for a Grade ${gradeNum || 'K-8'} classroom poster`,
        'beautiful artwork',
        'soft warm colours',
        'high quality',
        'no text anywhere in image',
        'no signatures, no artist names, no watermarks, no logos',
        'not a photograph, not photorealistic, not 3D rendered',  // negative-prompt-as-positive (Flux ignores neg prompts)
      ].join(', ');

  const negativePrompt = [
    'text', 'letters', 'words', 'numbers', 'labels', 'captions',
    'titles', 'headings', 'watermark', 'writing', 'typography',
    'signature', 'artist name', 'logo', 'autograph',
    'diagram', 'chart', 'infographic', 'ugly', 'blurry',
    'distorted', 'low quality', 'bad art',
  ].join(', ');

  // Image size: caller can override (e.g. 'square_hd' for K worksheet grid).
  // Default stays portrait_4_3 for slide cover art backward compatibility.
  const sizeAllowed = ['square', 'square_hd', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'];
  const resolvedSize = (imageSize && sizeAllowed.includes(imageSize)) ? imageSize : 'portrait_4_3';

  const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      negative_prompt: negativePrompt,
      image_size: resolvedSize,
      num_inference_steps: 8,
      num_images: 1,
      enable_safety_checker: true,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`fal.ai ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error(`No URL in response`);
  return url;
}

const ALLOWED_ORIGINS = [
  'https://www.teacherai.ca',
  'https://teacherai.ca',
];

export default async function handler(req, res) {
  // CORS: whitelist instead of wildcard. Prevents arbitrary websites from
  // calling this endpoint and burning through Fal.ai credits.
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const {
    type = 'ai',
    topic,
    subject,
    grade,
    theme,
    style,       // NEW: explicit style override for K worksheets
    imageSize,   // NEW: explicit size override (square_hd for K grid)
    subKey,      // NEW: per-worksheet-image differentiator for caching
  } = req.body || {};
  if (!topic) return res.status(400).json({ error: 'topic required' });

  // Cache key bumped to v8 because the Flux prompt structure changed
  // (style now leads). Old v7 entries are left alone — they just won't match
  // new requests.
  //
  // Key format: v8:subject:grade:topic:style-code:subKey
  // style is hashed to a short code (l=line, s=science, m=math, c=children) to
  // keep keys short. subKey is optional; if not passed, defaults to '_' so
  // cover-art calls still share a cache slot per topic.
  const styleCode = style === K_LINE_DRAWING_STYLE ? 'l'
    : !style && (subject || '').toLowerCase().includes('science') ? 's'
    : !style && (subject || '').toLowerCase().includes('math') ? 'm'
    : 'c';
  const subKeyClean = (subKey || '_').slice(0, 40).replace(/[^a-z0-9_-]/gi, '');
  const cacheKey = `v8:${(subject||'').slice(0,20)}:${(grade||'').slice(0,10)}:${topic.slice(0,60)}:${styleCode}:${subKeyClean}`;

  try {
    const cached = await getCached(cacheKey);
    if (cached) return res.status(200).json({ url: cached, cached: true });

    const imageUrl = await generateAIImage({ topic, subject, grade, theme, style, imageSize });
    await setCache(cacheKey, imageUrl);
    return res.status(200).json({ url: imageUrl, cached: false });

  } catch (err) {
    console.error('[generate-image]', topic, err.message);
    return res.status(200).json({ url: null, error: err.message });
  }
}
