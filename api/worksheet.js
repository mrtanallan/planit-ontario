import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Validate UUID format
function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: fetch worksheet for student ──────────────────────────
  if (req.method === 'GET') {
    const { id } = req.query;

    if (!id || !isValidUUID(id)) {
      return res.status(400).json({ error: 'Invalid worksheet ID' });
    }

    const { data: worksheet, error } = await supabase
      .from('worksheets')
      .select('id, topic, grades, subject, content, roster, created_at')
      .eq('id', id)
      .single();

    if (error || !worksheet) {
      return res.status(404).json({ error: 'Worksheet not found' });
    }

    // Parse content JSON — handles both legacy plain text and new JSON format
    let wsContent = '';
    let readingContent = '';
    let gradesContent = null;

    try {
      const parsed = JSON.parse(worksheet.content);
      wsContent = parsed.worksheet || '';
      readingContent = parsed.reading || '';
      // Pass through grades_content for split-grade worksheets
      if (parsed.grades_content && Object.keys(parsed.grades_content).length > 0) {
        gradesContent = parsed.grades_content;
      }
    } catch (e) {
      // Legacy: plain text content
      wsContent = worksheet.content || '';
    }

    const response = {
      topic: worksheet.topic,
      grades: worksheet.grades,
      subject: worksheet.subject,
      content: wsContent,
      reading_resource: readingContent,
      roster: worksheet.roster || [],
    };

    // Include grades_content if present (split-grade worksheets)
    if (gradesContent) {
      response.grades_content = gradesContent;
    }

    return res.status(200).json(response);
  }

  // ── POST: save student submission ─────────────────────────────
  if (req.method === 'POST') {
    const { worksheet_id, student_name, student_id, responses } = req.body;

    // Validate inputs
    if (!worksheet_id || !isValidUUID(worksheet_id)) {
      return res.status(400).json({ error: 'Invalid worksheet ID' });
    }
    if (!student_name || typeof student_name !== 'string') {
      return res.status(400).json({ error: 'Student name required' });
    }

    // IDOR check — verify worksheet exists
    const { data: ws, error: wsErr } = await supabase
      .from('worksheets')
      .select('id')
      .eq('id', worksheet_id)
      .single();

    if (wsErr || !ws) {
      return res.status(404).json({ error: 'Worksheet not found' });
    }

    // Sanitize inputs
    const safeName = student_name.trim().substring(0, 100);
    const safeStudentId = (student_id && isValidUUID(student_id)) ? student_id : null;
    const safeResponses = responses && typeof responses === 'object' ? responses : {};

    const { error: insertError } = await supabase
      .from('worksheet_submissions')
      .insert({
        worksheet_id,
        student_name: safeName,
        student_id: safeStudentId,
        responses: safeResponses,
      });

    if (insertError) {
      return res.status(500).json({ error: 'Failed to save submission' });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
