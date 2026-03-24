import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) { res.status(400).json({ error: 'Missing id' }); return; }

    // Basic UUID format check — prevents trivially malformed requests
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) { res.status(400).json({ error: 'Invalid worksheet ID' }); return; }

    const { data, error } = await supabase
      .from('worksheets')
      .select('id, topic, grades, subject, content, roster')
      .eq('id', id)
      .single();
    if (error || !data) { res.status(404).json({ error: 'Not found' }); return; }

    // Parse content — may be JSON {worksheet, reading} or legacy plain text
    let worksheetContent = data.content;
    let readingContent = '';
    try {
      const parsed = JSON.parse(data.content);
      if (parsed && typeof parsed === 'object' && parsed.worksheet) {
        worksheetContent = parsed.worksheet;
        readingContent = parsed.reading || '';
      }
    } catch(e) {
      // Legacy plain text — use as-is
    }

    res.status(200).json({
      ...data,
      content: worksheetContent,
      reading_resource: readingContent
    });
    return;
  }

  if (req.method === 'POST') {
    const { worksheet_id, student_name, student_id, responses } = req.body;

    // Validate required fields
    if (!worksheet_id) { res.status(400).json({ error: 'Missing worksheet_id' }); return; }
    if (!student_name || typeof student_name !== 'string' || student_name.trim().length === 0) {
      res.status(400).json({ error: 'Missing student name' }); return;
    }

    // UUID format check
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(worksheet_id)) { res.status(400).json({ error: 'Invalid worksheet ID' }); return; }

    // IDOR check — verify the worksheet actually exists before accepting submission
    const { data: ws, error: wsErr } = await supabase
      .from('worksheets')
      .select('id')
      .eq('id', worksheet_id)
      .single();
    if (wsErr || !ws) {
      res.status(404).json({ error: 'Worksheet not found' }); return;
    }

    // Sanitize student_id — must be a valid UUID or null
    const safeStudentId = (student_id && uuidRegex.test(student_id)) ? student_id : null;

    const { error } = await supabase
      .from('worksheet_submissions')
      .insert({
        worksheet_id,
        student_name: student_name.trim().substring(0, 100), // cap length
        student_id: safeStudentId,
        responses
      });

    if (error) {
      console.error('Supabase POST error:', JSON.stringify(error));
      res.status(500).json({ error: error.message, code: error.code });
      return;
    }
    res.status(200).json({ success: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
