import { createClient } from '@supabase/supabase-js';

// In-memory rate limiter — resets on cold start but stops casual abuse
const rateLimitMap = new Map();
const RATE_LIMIT = 30;          // max requests
const RATE_WINDOW = 60 * 60 * 1000; // per hour (ms)

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function pruneRateLimit() {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > RATE_WINDOW) rateLimitMap.delete(ip);
  }
}

// ── Answer key generation ──────────────────────────────────
async function handleAnswerKey(req, res) {
  const { worksheetText, topic, grade, subject } = req.body;

  if (!worksheetText) {
    return res.status(400).json({ error: 'Missing worksheetText' });
  }

  const prompt = `You are an Ontario elementary teacher creating an answer key.

Topic: ${topic || 'Unknown'}
Grade: ${grade || 'Unknown'}
Subject: ${subject || 'Unknown'}

Here is the student worksheet:
<worksheet>
${worksheetText}
</worksheet>

Create a detailed answer key for this worksheet. For each question or task:
- Identify the question number or label exactly as it appears
- Provide the expected answer(s) — including acceptable variations
- Add a brief marking note (1 sentence) about what to look for or accept as partial credit

Return ONLY a valid JSON object in this exact format, no preamble, no markdown:
{
  "questions": [
    {
      "id": "Q1",
      "question_excerpt": "first 6 words of the question...",
      "expected_answers": ["answer1", "acceptable variant"],
      "marking_note": "Accept any response that..."
    }
  ],
  "general_notes": "One or two sentences of overall marking guidance for this task."
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';

    let answerKey;
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      answerKey = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: 'Failed to parse answer key JSON', raw });
    }

    return res.status(200).json({ answer_key: answerKey });
  } catch (error) {
    console.error('Answer key generation error:', error);
    return res.status(500).json({ error: 'Failed to generate answer key' });
  }
}

// ── Auto-marking ───────────────────────────────────────────
async function handleMark(req, res) {
  const { submissions, answerKey, topic, grade, subject } = req.body;

  // submissions: [{ studentLabel: "Student A", responses: { "Q1": "answer", ... } }]
  // answerKey: the object from handleAnswerKey

  if (!submissions || !Array.isArray(submissions) || !answerKey) {
    return res.status(400).json({ error: 'Missing submissions or answerKey' });
  }

  // Build a compact answer key summary for the prompt
  const keyText = answerKey.questions.map(q =>
    `${q.id}: Expected: ${q.expected_answers.join(' / ')} | Note: ${q.marking_note}`
  ).join('\n');

  // Build submissions text — student names already anonymized by caller
  const submissionsText = submissions.map(s => {
    const responseLines = Object.entries(s.responses || {})
      .map(([qId, ans]) => `  ${qId}: ${ans || '(no answer)'}`)
      .join('\n');
    return `--- ${s.studentLabel} ---\n${responseLines}`;
  }).join('\n\n');

  const prompt = `You are an Ontario elementary school teacher marking student worksheet submissions.

Topic: ${topic || 'Unknown'}
Grade: ${grade || 'Unknown'}
Subject: ${subject || 'Unknown'}

ANSWER KEY:
${keyText}

General marking guidance: ${answerKey.general_notes || 'Mark based on understanding shown.'}

STUDENT SUBMISSIONS:
${submissionsText}

For each student, assess their work against the answer key and the Ontario Achievement Chart levels:
- Level 1: Limited understanding/communication
- Level 2: Some understanding, partially meets expectations  
- Level 3: Considerable understanding, meets expectations (grade-level standard)
- Level 4: Thorough understanding, exceeds expectations

Return ONLY a valid JSON array, no preamble, no markdown:
[
  {
    "studentLabel": "Student A",
    "suggested_level": "L3",
    "level_rationale": "One sentence explaining the level.",
    "feedback": "2-3 sentences of Ontario-style descriptive feedback. Strengths first, then one specific next step. Do not mention the student's name.",
    "question_scores": [
      { "id": "Q1", "result": "correct" },
      { "id": "Q2", "result": "partial" },
      { "id": "Q3", "result": "incorrect" }
    ]
  }
]

Use "correct", "partial", or "incorrect" for each question result.
Write feedback in Ontario descriptive style — specific, growth-oriented, professional.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';

    let results;
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      results = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: 'Failed to parse marking JSON', raw });
    }

    return res.status(200).json({ results });
  } catch (error) {
    console.error('Auto-mark error:', error);
    return res.status(500).json({ error: 'Failed to mark submissions' });
  }
}

// ── Main handler ───────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  // ── 1. Auth check ─────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized — no token provided' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized — invalid or expired session' });
  }

  // ── 2. Rate limit ─────────────────────────────────────────
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
  pruneRateLimit();
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests — please wait before generating again.' });
  }

  // ── 3. Route by action ────────────────────────────────────
  const { action } = req.body;

  if (action === 'answer_key') return handleAnswerKey(req, res);
  if (action === 'mark') return handleMark(req, res);

  // ── 4. Default: proxy to Anthropic (existing lesson generation) ──
  const { model, max_tokens, messages, tools } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    const anthropicBody = { model, max_tokens, messages };
    if (tools) anthropicBody.tools = tools;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(anthropicBody)
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Anthropic API error:', error);
    res.status(500).json({ error: 'Failed to generate content' });
  }
}
