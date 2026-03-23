import { createClient } from '@supabase/supabase-js';

// Use anon key — RLS policies handle access control
// GET: worksheets table is readable (needed for student worksheet page)
// POST: worksheet_submissions has "Anyone can submit" RLS policy
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
    const { data, error } = await supabase
      .from('worksheets')
      .select('id, topic, grades, subject, content, roster')
      .eq('id', id)
      .single();
    if (error || !data) { res.status(404).json({ error: 'Not found' }); return; }
    res.status(200).json(data);
    return;
  }

  if (req.method === 'POST') {
    const { worksheet_id, student_name, student_id, responses } = req.body;
    if (!worksheet_id) { res.status(400).json({ error: 'Missing worksheet_id' }); return; }
    const { data, error } = await supabase
      .from('worksheet_submissions')
      .insert({ worksheet_id, student_name, student_id: student_id || null, responses })
      .select();
    if (error) {
      console.error('Supabase POST error:', JSON.stringify(error));
      res.status(500).json({ error: error.message, code: error.code, details: error.details, hint: error.hint });
      return;
    }
    res.status(200).json({ success: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
