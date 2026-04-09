// api/generate.js — TeacherAI v9 (auth gate + opt-in streaming)
//
// STREAMING: opt-in via { stream: true } in request body.
//   - When stream is true, proxy streams Anthropic SSE back to client.
//     Client should use callGenerateStreaming() in index.html which
//     accumulates text and returns a shape matching non-streaming responses.
//   - When stream is false/absent, behaves IDENTICALLY to non-streaming v8.
//
// AUTH GATE (Chat 9):
//   - Verifies Supabase JWT using ES256 (asymmetric, public-key via JWKS).
//     Also falls back to HS256 with SUPABASE_JWT_SECRET for legacy tokens.
//   - JWKS is fetched once per cold start from
//     ${SUPABASE_URL}/auth/v1/.well-known/jwks.json and cached in module scope.
//     Warm invocations reuse the cache → zero added latency after first hit.
//   - Mode controlled by AUTH_ENFORCE env var:
//       unset / "false" / "soft"  → SOFT FAIL: logs rejections, allows request through
//       "true" / "hard"           → HARD FAIL: returns 401 on invalid/missing JWT
//   - To go live: set AUTH_ENFORCE=true in Vercel env vars and redeploy.
//   - No new npm deps — uses Node stdlib crypto only. Requires Node 16+ for
//     crypto.createPublicKey({format:'jwk'}). Vercel runs Node 20.

const crypto = require('crypto');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Base64url decode (JWT uses base64url, not standard base64)
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

// ────────────────────────────────────────────────────────────────────
// JWKS cache. Populated on first verify, reused across warm invocations.
// Cold starts re-fetch. If fetch fails, cache stays null and we fall
// through to HS256 (if SUPABASE_JWT_SECRET is set) or reject.
// ────────────────────────────────────────────────────────────────────
let _jwksCache = null;       // { [kid]: KeyObject }
let _jwksFetchedAt = 0;
const JWKS_TTL_MS = 10 * 60 * 1000; // 10 minutes; matches Supabase edge cache

async function getJWKS() {
  const now = Date.now();
  if (_jwksCache && (now - _jwksFetchedAt) < JWKS_TTL_MS) return _jwksCache;

  const base = process.env.SUPABASE_URL;
  if (!base) throw new Error('SUPABASE_URL not set');
  const url = base.replace(/\/$/, '') + '/auth/v1/.well-known/jwks.json';

  const res = await fetch(url);
  if (!res.ok) throw new Error('jwks fetch failed: ' + res.status);
  const body = await res.json();
  if (!body || !Array.isArray(body.keys)) throw new Error('jwks malformed');

  const cache = {};
  for (const jwk of body.keys) {
    try {
      // Node 16+ accepts JWK format directly for EC and RSA keys
      cache[jwk.kid || '_default'] = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    } catch (e) {
      console.warn('[auth] skipping unparseable jwk:', jwk.kid, e.message);
    }
  }
  _jwksCache = cache;
  _jwksFetchedAt = now;
  return cache;
}

// Convert JOSE ES256 signature (raw r||s, 64 bytes) to DER, which is what
// Node's crypto.verify() expects for ECDSA.
function joseSigToDer(raw) {
  if (raw.length !== 64) throw new Error('bad ES256 sig length: ' + raw.length);
  const r = raw.slice(0, 32);
  const s = raw.slice(32, 64);
  // Strip leading zeros, add one back if high bit set (DER positive int)
  function trim(buf) {
    let i = 0;
    while (i < buf.length - 1 && buf[i] === 0) i++;
    let out = buf.slice(i);
    if (out[0] & 0x80) out = Buffer.concat([Buffer.from([0]), out]);
    return out;
  }
  const rT = trim(r);
  const sT = trim(s);
  const seqLen = 2 + rT.length + 2 + sT.length;
  return Buffer.concat([
    Buffer.from([0x30, seqLen]),
    Buffer.from([0x02, rT.length]), rT,
    Buffer.from([0x02, sT.length]), sT,
  ]);
}

// Verify a Supabase JWT. Returns payload on success, throws on failure.
// Handles ES256 (asymmetric, via JWKS) and HS256 (legacy, via shared secret).
async function verifySupabaseJWT(token) {
  if (!token || typeof token !== 'string') throw new Error('no token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');

  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(b64urlDecode(headerB64).toString('utf8'));
  const signingInput = Buffer.from(headerB64 + '.' + payloadB64, 'utf8');
  const providedSig = b64urlDecode(sigB64);

  if (header.alg === 'ES256') {
    const jwks = await getJWKS();
    const key = jwks[header.kid] || jwks['_default'];
    if (!key) throw new Error('no matching jwk for kid=' + header.kid);
    const derSig = joseSigToDer(providedSig);
    const ok = crypto.verify('SHA256', signingInput, key, derSig);
    if (!ok) throw new Error('bad ES256 signature');
  } else if (header.alg === 'HS256') {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) throw new Error('HS256 token but no SUPABASE_JWT_SECRET');
    const expectedSig = crypto.createHmac('sha256', secret).update(signingInput).digest();
    if (expectedSig.length !== providedSig.length ||
        !crypto.timingSafeEqual(expectedSig, providedSig)) {
      throw new Error('bad HS256 signature');
    }
  } else {
    throw new Error('unsupported alg: ' + header.alg);
  }

  const payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('token expired');
  return payload;
}

// Run the auth check. Returns { userId, mode, ok, reason }.
// Never throws — caller decides whether to enforce.
async function checkAuth(req) {
  const enforce = String(process.env.AUTH_ENFORCE || '').toLowerCase();
  const mode = (enforce === 'true' || enforce === 'hard') ? 'hard' : 'soft';

  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) return { userId: null, mode, ok: false, reason: 'no bearer header' };

  try {
    const payload = await verifySupabaseJWT(match[1]);
    return { userId: payload.sub || null, mode, ok: true, reason: null };
  } catch (err) {
    return { userId: null, mode, ok: false, reason: err.message };
  }
}

// ────────────────────────────────────────────────────────────────────
// USAGE LOGGING (Chat 9)
// Fire-and-forget write to Supabase generations table. Never blocks the
// response path. Swallows all errors and logs them — logging must never
// break generation. Called via `void logGeneration(...)` so we don't
// await. Requires SUPABASE_URL + SUPABASE_SERVICE_KEY env vars.
// ────────────────────────────────────────────────────────────────────
async function logGeneration(row) {
  try {
    if (!row.user_id) return; // anonymous traffic (soft-mode leftovers) — skip
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!base || !key) {
      console.warn('[log] missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
      return;
    }
    const url = base.replace(/\/$/, '') + '/rest/v1/generations';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn('[log] insert failed', res.status, txt.slice(0, 200));
    }
  } catch (err) {
    console.warn('[log] exception', err.message);
  }
}

const ALLOWED_ORIGINS = [
  'https://www.teacherai.ca',
  'https://teacherai.ca',
];

module.exports = async function handler(req, res) {
  // CORS: whitelist instead of wildcard. Chat 8 M1 fix.
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ──────────────────────────────────────────────────────────────────
  // AUTH GATE (Chat 9)
  // ──────────────────────────────────────────────────────────────────
  const auth = await checkAuth(req);
  if (!auth.ok) {
    if (auth.mode === 'hard') {
      console.warn('[auth] HARD BLOCK:', auth.reason);
      return res.status(401).json({ error: 'Unauthorized. Please sign in again.' });
    } else {
      console.warn('[auth] SOFT FAIL (would have blocked):', auth.reason);
    }
  } else {
    console.log('[auth] OK user=' + auth.userId);
  }
  // Expose for later logging / rate-limit use
  req.userId = auth.userId;
  // ──────────────────────────────────────────────────────────────────

  // ──────────────────────────────────────────────────────────────────
  // STREAMING: opt-in branch (self-contained, fully revertible)
  // ──────────────────────────────────────────────────────────────────
  if (req.body && req.body.stream === true) {
    const t0 = Date.now();
    try {
      const { model, max_tokens, messages, system } = req.body;
      const anthropicPayload = { model, max_tokens, messages, stream: true };
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

      // Handle non-200 BEFORE starting the stream (status is known up front)
      if (anthropicRes.status === 529) {
        return res.status(529).json({ error: 'AI service at capacity. Please try again in a moment.' });
      }
      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text().catch(() => '');
        console.error('Anthropic error (stream):', anthropicRes.status, errText);
        let errJson = {};
        try { errJson = JSON.parse(errText); } catch(_) {}
        return res.status(anthropicRes.status).json({ error: errJson.error || 'AI generation failed' });
      }

      // Pipe the SSE stream to the client. Vercel's 25s idle timer
      // resets on every chunk, so as long as Anthropic streams tokens we
      // never hit a 504.
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Sniff token usage as SSE passes through. We do NOT buffer —
      // every chunk is forwarded to the client immediately, we just
      // accumulate a trailing string to parse complete lines out of.
      // message_start has input_tokens; message_delta has output_tokens.
      let tokensIn = null;
      let tokensOut = null;
      let sseBuffer = '';

      const reader = anthropicRes.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk); // forward IMMEDIATELY
        sseBuffer += chunk;
        // Parse out any complete `data: ...\n` lines for usage sniffing
        let nl;
        while ((nl = sseBuffer.indexOf('\n')) !== -1) {
          const line = sseBuffer.slice(0, nl);
          sseBuffer = sseBuffer.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const ev = JSON.parse(jsonStr);
            if (ev.type === 'message_start' && ev.message && ev.message.usage) {
              tokensIn = ev.message.usage.input_tokens ?? tokensIn;
              tokensOut = ev.message.usage.output_tokens ?? tokensOut;
            } else if (ev.type === 'message_delta' && ev.usage) {
              tokensOut = ev.usage.output_tokens ?? tokensOut;
            }
          } catch (_) { /* ignore partial JSON */ }
        }
      }
      res.end();

      // Fire-and-forget usage log
      const meta = (req.body && req.body.meta) || {};
      void logGeneration({
        user_id: req.userId,
        type: meta.type || 'unknown',
        grade: meta.grade || null,
        subject: meta.subject || null,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        duration_ms: Date.now() - t0,
      });
      return;
    } catch (err) {
      console.error('generate.js stream error:', err);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Server error. Please try again.' });
      }
      try { res.end(); } catch(_) {}
      return;
    }
  }
  // ──────────────────────────────────────────────────────────────────
  // END STREAMING BRANCH
  // ──────────────────────────────────────────────────────────────────

  // Original non-streaming path — byte-identical to pre-streaming v8
  const t0 = Date.now();
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

    // Fire-and-forget usage log (never blocks the response)
    const meta = (req.body && req.body.meta) || {};
    void logGeneration({
      user_id: req.userId,
      type: meta.type || 'unknown',
      grade: meta.grade || null,
      subject: meta.subject || null,
      tokens_in: (data.usage && data.usage.input_tokens) || null,
      tokens_out: (data.usage && data.usage.output_tokens) || null,
      duration_ms: Date.now() - t0,
    });

    return res.status(200).json(data);

  } catch (err) {
    console.error('generate.js error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
