// api/download-slides.js — TeacherAI
// Accepts slide data JSON, returns a .pptx file download

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Test if pptxgenjs is available
  let PptxGenJS;
  try {
    PptxGenJS = require('pptxgenjs');
  } catch(e) {
    console.error('pptxgenjs not found:', e.message);
    return res.status(500).json({ error: 'pptxgenjs not installed: ' + e.message });
  }

  try {
    const { sd, topic, subject, gradeStr } = req.body;
    if (!sd) return res.status(400).json({ error: 'Missing slide data (sd)' });

    const TEAL = '3BBFAD', NAVY = '1D3461', YELLOW = 'F5C842';
    const GREY = 'F4F3EF', WHITE = 'FFFFFF', MUTED = '888780';
    const W = 13.3, H = 7.5, HEADER_H = 0.85;

    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    pres.title = topic || 'TeacherAI Lesson';

    function addHeader(slide, text, color) {
      color = color || TEAL;
      slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: HEADER_H, fill: { color } });
      slide.addText(text, { x: 0.4, y: 0, w: W - 0.8, h: HEADER_H, fontSize: 22, bold: true, color: WHITE, fontFace: 'Arial', valign: 'middle', margin: 0 });
    }

    function addAccents(slide) {
      slide.addShape(pres.shapes.OVAL, { x: -0.5, y: -0.5, w: 1.5, h: 1.5, fill: { color: YELLOW, transparency: 75 } });
      slide.addShape(pres.shapes.OVAL, { x: W - 1.5, y: H - 1.5, w: 2, h: 2, fill: { color: TEAL, transparency: 80 } });
    }

    // Title slide
    const s1 = pres.addSlide();
    s1.background = { color: NAVY };
    s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: H, fill: { color: TEAL } });
    s1.addText(topic || 'Lesson', { x: 0.8, y: 2.0, w: W - 2, h: 1.6, fontSize: 40, bold: true, color: WHITE, fontFace: 'Arial', wrap: true });
    s1.addText((gradeStr || '') + (subject ? '  ·  ' + subject : ''), { x: 0.8, y: 3.7, w: W - 2, h: 0.6, fontSize: 20, color: 'AAAAAA', fontFace: 'Arial' });
    s1.addText('TEACHERAI  ·  ONTARIO CURRICULUM', { x: 0.8, y: H - 0.6, w: W - 1.6, h: 0.4, fontSize: 10, color: '555555', fontFace: 'Arial', charSpacing: 3 });

    // Learning Goals
    const goals = (sd.learning_goals || []).slice(0, 3);
    if (goals.length) {
      const s2 = pres.addSlide();
      s2.background = { color: GREY };
      addAccents(s2);
      addHeader(s2, 'Learning Goals');
      const colors = [YELLOW, TEAL, 'E07B39'];
      goals.forEach(function(g, i) {
        const y = HEADER_H + 0.8 + i * 1.6;
        s2.addShape(pres.shapes.RECTANGLE, { x: 0.5, y, w: 0.8, h: 0.8, fill: { color: colors[i] } });
        s2.addText(String(i + 1), { x: 0.5, y, w: 0.8, h: 0.8, fontSize: 22, bold: true, color: i === 0 ? '2C2C2A' : WHITE, fontFace: 'Arial', align: 'center', valign: 'middle', margin: 0 });
        s2.addShape(pres.shapes.RECTANGLE, { x: 1.5, y, w: W - 2.0, h: 0.8, fill: { color: WHITE }, shadow: { type: 'outer', blur: 4, offset: 2, angle: 135, color: '000000', opacity: 0.06 } });
        s2.addText(g, { x: 1.7, y, w: W - 2.4, h: 0.8, fontSize: 17, color: NAVY, fontFace: 'Arial', valign: 'middle', wrap: true, margin: 0 });
      });
    }

    // Minds On
    if (sd.minds_on) {
      const s3 = pres.addSlide();
      s3.background = { color: GREY };
      addAccents(s3);
      addHeader(s3, 'Minds On');
      if (sd.minds_on.hook) {
        s3.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: HEADER_H + 0.4, w: W - 1, h: 1.8, fill: { color: WHITE }, shadow: { type: 'outer', blur: 6, offset: 2, angle: 135, color: '000000', opacity: 0.08 } });
        s3.addText(sd.minds_on.hook, { x: 0.7, y: HEADER_H + 0.4, w: W - 1.4, h: 1.8, fontSize: 20, color: NAVY, fontFace: 'Arial', valign: 'middle', wrap: true });
      }
      if (sd.minds_on.prompt) {
        s3.addText(sd.minds_on.prompt, { x: 0.5, y: H - 2.0, w: W - 1, h: 1.5, fontSize: 16, color: '5F5E5A', fontFace: 'Arial', wrap: true });
      }
    }

    // Vocabulary
    const vocab = (sd.vocabulary || []).slice(0, 4);
    if (vocab.length) {
      const s4 = pres.addSlide();
      s4.background = { color: GREY };
      addAccents(s4);
      addHeader(s4, 'Key Vocabulary', '6B63D4');
      const vColors = [TEAL, YELLOW, 'E07B39', '6B63D4'];
      const cols = vocab.length <= 2 ? 1 : 2;
      const colW = cols === 1 ? W - 1 : (W - 1.1) / 2;
      vocab.forEach(function(v, i) {
        const col = i % cols, row = Math.floor(i / cols);
        const x = 0.5 + col * (colW + 0.1);
        const y = HEADER_H + 0.3 + row * 2.3;
        s4.addShape(pres.shapes.RECTANGLE, { x, y, w: colW, h: 2.1, fill: { color: WHITE }, shadow: { type: 'outer', blur: 4, offset: 2, angle: 135, color: '000000', opacity: 0.07 } });
        s4.addShape(pres.shapes.RECTANGLE, { x, y, w: colW, h: 0.07, fill: { color: vColors[i % 4] } });
        s4.addText(v.word || '', { x: x + 0.15, y: y + 0.15, w: colW - 0.3, h: 0.55, fontSize: 20, bold: true, color: NAVY, fontFace: 'Arial' });
        s4.addText(v.definition || '', { x: x + 0.15, y: y + 0.7, w: colW - 0.3, h: 0.9, fontSize: 13, color: '5F5E5A', fontFace: 'Arial', wrap: true });
        if (v.example) s4.addText('"' + v.example + '"', { x: x + 0.15, y: y + 1.6, w: colW - 0.3, h: 0.4, fontSize: 11, color: MUTED, fontFace: 'Arial', italic: true, wrap: true });
      });
    }

    // Content slides
    (sd.content_slides || []).slice(0, 6).forEach(function(cs, i) {
      const s = pres.addSlide();
      s.background = { color: GREY };
      addAccents(s);
      addHeader(s, cs.title || 'Key Concept');
      s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: HEADER_H + 0.3, w: 0.07, h: 4.5, fill: { color: TEAL } });
      s.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: HEADER_H + 0.3, w: 5.8, h: 2.6, fill: { color: WHITE }, shadow: { type: 'outer', blur: 5, offset: 2, angle: 135, color: '000000', opacity: 0.07 } });
      s.addText(cs.key_point || '', { x: 0.9, y: HEADER_H + 0.3, w: 5.4, h: 2.6, fontSize: 17, color: NAVY, fontFace: 'Arial', wrap: true, valign: 'middle' });
      if (cs.example) s.addText('Example: ' + cs.example, { x: 0.9, y: HEADER_H + 3.1, w: 5.6, h: 1.1, fontSize: 13, color: '5F5E5A', fontFace: 'Arial', wrap: true, italic: true });
      s.addShape(pres.shapes.RECTANGLE, { x: 6.8, y: HEADER_H + 0.3, w: 6.0, h: 5.5, fill: { color: 'E8E7E3' } });
      s.addText('[ Visual ]', { x: 6.8, y: HEADER_H + 2.8, w: 6.0, h: 0.5, fontSize: 12, color: 'BBBBBB', fontFace: 'Arial', align: 'center' });
    });

    // Discussion
    const dqs = (sd.discussion_questions || []).slice(0, 3);
    if (dqs.length) {
      const sdSlide = pres.addSlide();
      sdSlide.background = { color: GREY };
      addAccents(sdSlide);
      addHeader(sdSlide, 'Discussion');
      const dColors = [YELLOW, TEAL, 'E07B39'];
      const labels = ['Think', 'Pair', 'Share'];
      dqs.forEach(function(q, i) {
        const y = HEADER_H + 0.3 + i * 1.9;
        sdSlide.addShape(pres.shapes.RECTANGLE, { x: 0.5, y, w: 1.3, h: 0.55, fill: { color: dColors[i] } });
        sdSlide.addText(labels[i], { x: 0.5, y, w: 1.3, h: 0.55, fontSize: 13, bold: true, color: i === 0 ? '2C2C2A' : WHITE, fontFace: 'Arial', align: 'center', valign: 'middle', margin: 0 });
        sdSlide.addShape(pres.shapes.RECTANGLE, { x: 2.0, y, w: W - 2.5, h: 1.4, fill: { color: WHITE }, shadow: { type: 'outer', blur: 4, offset: 2, angle: 135, color: '000000', opacity: 0.06 } });
        sdSlide.addText(q, { x: 2.2, y: y + 0.1, w: W - 2.9, h: 1.2, fontSize: 16, color: NAVY, fontFace: 'Arial', wrap: true, valign: 'middle' });
      });
    }

    // Exit Ticket
    if (sd.exit_ticket) {
      const se = pres.addSlide();
      se.background = { color: GREY };
      addAccents(se);
      addHeader(se, 'Exit Ticket');
      se.addShape(pres.shapes.RECTANGLE, { x: 1.5, y: HEADER_H + 0.8, w: W - 3, h: 3.8, fill: { color: WHITE }, shadow: { type: 'outer', blur: 8, offset: 3, angle: 135, color: '000000', opacity: 0.1 } });
      se.addShape(pres.shapes.RECTANGLE, { x: 1.5, y: HEADER_H + 0.8, w: W - 3, h: 0.08, fill: { color: TEAL } });
      se.addText(sd.exit_ticket, { x: 1.7, y: HEADER_H + 1.1, w: W - 3.4, h: 3.2, fontSize: 22, color: NAVY, fontFace: 'Arial', wrap: true, valign: 'middle', align: 'center' });
    }

    // Write and return
    const buf = await pres.write({ outputType: 'nodebuffer' });
    const filename = (topic || 'TeacherAI_Slides').replace(/[^a-z0-9]/gi, '_') + '.pptx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Content-Length', buf.length);
    return res.status(200).send(buf);

  } catch(err) {
    console.error('download-slides error:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
};
