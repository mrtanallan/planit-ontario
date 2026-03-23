import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // GET /api/worksheet?id=xxx — fetch worksheet for student
  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) { res.status(400).json({ error: 'Missing worksheet id' }); return; }
    const { data, error } = await supabase
      .from('worksheets')
      .select('id, topic, grades, subject, content')
      .eq('id', id)
      .single();
    if (error || !data) { res.status(404).json({ error: 'Worksheet not found' }); return; }
    res.status(200).json(data);
    return;
  }

  // POST /api/worksheet — save submission
  if (req.method === 'POST') {
    const { worksheet_id, student_name, responses } = req.body;
    if (!worksheet_id) { res.status(400).json({ error: 'Missing worksheet_id' }); return; }
    const { error } = await supabase
      .from('worksheet_submissions')
      .insert({ worksheet_id, student_name, responses });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json({ success: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
