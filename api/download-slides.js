// api/download-slides.js — TeacherAI
// Accepts slide data JSON, returns a .pptx file download
// No browser blob issues — runs entirely in Node.js

const PptxGenJS = require('pptxgenjs');

const TEAL   = '3BBFAD';
const NAVY   = '1D3461';
const YELLOW = 'F5C842';
const GREY   = 'F4F3EF';
const WHITE  = 'FFFFFF';
const MUTED  = '888780';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { sd, topic, subject, gradeStr } = req.body;
    if (!sd) return res.status(400).json({ error: 'Missing slide data' });

    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE'; // 13.3" x 7.5"
    pres.title = topic || 'TeacherAI Lesson';
    pres.author = 'TeacherAI';

    const W = 13.3, H = 7.5;
    const HEADER_H = 0.85;

    // ── Helper: header bar ──────────────────────────────────────
    function addHeader(slide, text, color = TEAL) {
      slide.addShape(pres.shapes.RECTANGLE, {
        x: 0, y: 0, w: W, h: HEADER_H,
        fill: { color }
      });
      slide.addText(text, {
        x: 0.4, y: 0, w: W - 0.8, h: HEADER_H,
        fontSize: 22, bold: true, color: WHITE,
        fontFace: 'Arial', valign: 'middle', margin: 0
      });
    }

    function addCornerAccents(slide) {
      slide.addShape(pres.shapes.OVAL, { x: -0.5, y: -0.5, w: 1.5, h: 1.5, fill: { color: YELLOW, transparency: 75 } });
      slide.addShape(pres.shapes.OVAL, { x: W - 1.5, y: H - 1.5, w: 2, h: 2, fill: { color: TEAL, transparency: 80 } });
    }

    // ── SLIDE 1: Title ──────────────────────────────────────────
    const s1 = pres.addSlide();
    s1.background = { color: NAVY };
    s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: H, fill: { color: TEAL } });
    s1.addShape(pres.shapes.OVAL, { x: W - 3, y: -0.5, w: 3.5, h: 3.5, fill: { color: TEAL, transparency: 85 } });
    s1.addShape(pres.shapes.OVAL, { x: -0.5, y: H - 2.5, w: 2.5, h: 2.5, fill: { color: YELLOW, transparency: 85 } });
    s1.addText(topic || 'Lesson', {
      x: 0.8, y: 1.8, w: W - 2, h: 1.6,
      fontSize: 40, bold: true, color: WHITE, fontFace: 'Arial Black', wrap: true
    });
    s1.addText((gradeStr || '') + (subject ? '  ·  ' + subject : ''), {
      x: 0.8, y: 3.5, w: W - 2, h: 0.6,
      fontSize: 20, color: 'AAAAAA', fontFace: 'Arial'
    });
    s1.addShape(pres.shapes.RECTANGLE, { x: 0.8, y: 4.2, w: 1.8, h: 0.06, fill: { color: TEAL } });
    s1.addText(new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }), {
      x: 0.8, y: 4.4, w: 5, h: 0.5, fontSize: 14, color: '666666', fontFace: 'Arial'
    });
    s1.addText('TEACHERAI  ·  ONTARIO CURRICULUM', {
      x: 0.8, y: H - 0.6, w: W - 1.6, h: 0.4,
      fontSize: 10, color: '444444', fontFace: 'Courier New', charSpacing: 3
    });

    // ── SLIDE 2: Learning Goals ─────────────────────────────────
    const goals = (sd.learning_goals || []).slice(0, 3);
    if (goals.length) {
      const s2 = pres.addSlide();
      s2.background = { color: GREY };
      addCornerAccents(s2);
      addHeader(s2, 'Learning Goals');
      s2.addText('By the end of this lesson, we will...', {
        x: 0.5, y: HEADER_H + 0.2, w: W - 1, h: 0.4,
        fontSize: 12, color: MUTED, fontFace: 'Arial', italic: true
      });
      const colors = [YELLOW, TEAL, 'E07B39'];
      goals.forEach((g, i) => {
        const yPos = HEADER_H + 0.8 + i * 1.5;
        s2.addShape(pres.shapes.RECTANGLE, {
          x: 0.5, y: yPos, w: 0.8, h: 0.8,
          fill: { color: colors[i] }
        });
        s2.addText(String(i + 1), {
          x: 0.5, y: yPos, w: 0.8, h: 0.8,
          fontSize: 22, bold: true, color: i === 0 ? '2C2C2A' : WHITE,
          fontFace: 'Arial Black', align: 'center', valign: 'middle', margin: 0
        });
        s2.addShape(pres.shapes.RECTANGLE, {
          x: 1.5, y: yPos, w: W - 2, h: 0.8,
          fill: { color: WHITE },
          shadow: { type: 'outer', blur: 4, offset: 2, angle: 135, color: '000000', opacity: 0.06 }
        });
        s2.addText(g, {
          x: 1.7, y: yPos, w: W - 2.2, h: 0.8,
          fontSize: 18, color: NAVY, fontFace: 'Arial', valign: 'middle', wrap: true, margin: 0
        });
      });
    }

    // ── SLIDE 3: Minds On ───────────────────────────────────────
    if (sd.minds_on) {
      const s3 = pres.addSlide();
      s3.background = { color: GREY };
      addCornerAccents(s3);
      addHeader(s3, 'Minds On');
      if (sd.minds_on.hook) {
        s3.addShape(pres.shapes.RECTANGLE, {
          x: 0.5, y: HEADER_H + 0.3, w: W - 1, h: 1.6,
          fill: { color: WHITE },
          shadow: { type: 'outer', blur: 6, offset: 2, angle: 135, color: '000000', opacity: 0.08 }
        });
        s3.addText(sd.minds_on.hook, {
          x: 0.7, y: HEADER_H + 0.3, w: W - 1.4, h: 1.6,
          fontSize: 20, color: NAVY, fontFace: 'Arial', valign: 'middle', wrap: true
        });
      }
      if (sd.minds_on.prompt) {
        const tps = ['Think', 'Pair', 'Share'];
        const tpsColors = [YELLOW, TEAL, 'E07B39'];
        tps.forEach((t, i) => {
          s3.addShape(pres.shapes.RECTANGLE, {
            x: 0.5 + i * 2.4, y: H - 2.8, w: 2.2, h: 0.55,
            fill: { color: tpsColors[i] }
          });
          s3.addText(t, {
            x: 0.5 + i * 2.4, y: H - 2.8, w: 2.2, h: 0.55,
            fontSize: 16, bold: true, color: i === 0 ? '2C2C2A' : WHITE,
            fontFace: 'Arial', align: 'center', valign: 'middle', margin: 0
          });
        });
        s3.addText(sd.minds_on.prompt, {
          x: 0.5, y: H - 2.1, w: W - 1, h: 1.2,
          fontSize: 16, color: '5F5E5A', fontFace: 'Arial', wrap: true
        });
      }
    }

    // ── SLIDE 4: Vocabulary ─────────────────────────────────────
    const vocab = (sd.vocabulary || []).slice(0, 4);
    if (vocab.length) {
      const s4 = pres.addSlide();
      s4.background = { color: GREY };
      addCornerAccents(s4);
      addHeader(s4, 'Key Vocabulary', '6B63D4');
      const vColors = [TEAL, YELLOW, 'E07B39', '6B63D4'];
      const cols = vocab.length <= 2 ? 1 : 2;
      const colW = (W - 1) / cols;
      vocab.forEach((v, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = 0.5 + col * (colW + 0.1);
        const y = HEADER_H + 0.3 + row * 2.2;
        s4.addShape(pres.shapes.RECTANGLE, {
          x, y, w: colW - 0.1, h: 2.0,
          fill: { color: WHITE },
          shadow: { type: 'outer', blur: 4, offset: 2, angle: 135, color: '000000', opacity: 0.07 }
        });
        s4.addShape(pres.shapes.RECTANGLE, { x, y, w: colW - 0.1, h: 0.07, fill: { color: vColors[i % 4] } });
        s4.addText(v.word || '', {
          x: x + 0.15, y: y + 0.15, w: colW - 0.4, h: 0.55,
          fontSize: 20, bold: true, color: NAVY, fontFace: 'Arial'
        });
        s4.addText(v.definition || '', {
          x: x + 0.15, y: y + 0.7, w: colW - 0.4, h: 0.8,
          fontSize: 13, color: '5F5E5A', fontFace: 'Arial', wrap: true
        });
        if (v.example) {
          s4.addText('"' + v.example + '"', {
            x: x + 0.15, y: y + 1.5, w: colW - 0.4, h: 0.4,
            fontSize: 11, color: MUTED, fontFace: 'Arial', italic: true, wrap: true
          });
        }
      });
    }

    // ── SLIDES 5+: Content Slides ───────────────────────────────
    const contentSlides = (sd.content_slides || []).slice(0, 6);
    contentSlides.forEach((cs, i) => {
      const s = pres.addSlide();
      s.background = { color: GREY };
      addCornerAccents(s);
      addHeader(s, cs.title || 'Key Concept');
      // Key point box
      s.addShape(pres.shapes.RECTANGLE, {
        x: 0.5, y: HEADER_H + 0.3, w: 0.07, h: 4.2,
        fill: { color: TEAL }
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x: 0.7, y: HEADER_H + 0.3, w: 5.5, h: 2.5,
        fill: { color: WHITE },
        shadow: { type: 'outer', blur: 5, offset: 2, angle: 135, color: '000000', opacity: 0.07 }
      });
      s.addText(cs.key_point || '', {
        x: 0.9, y: HEADER_H + 0.3, w: 5.1, h: 2.5,
        fontSize: 17, color: NAVY, fontFace: 'Arial', wrap: true, valign: 'middle'
      });
      if (cs.example) {
        s.addText('Example:', {
          x: 0.9, y: HEADER_H + 3.0, w: 1.2, h: 0.4,
          fontSize: 12, bold: true, color: TEAL, fontFace: 'Arial'
        });
        s.addText(cs.example, {
          x: 0.9, y: HEADER_H + 3.4, w: 5.3, h: 1.0,
          fontSize: 13, color: '5F5E5A', fontFace: 'Arial', wrap: true, italic: true
        });
      }
      if (cs.teacher_note) {
        s.addText('📌 ' + cs.teacher_note, {
          x: 0.9, y: H - 0.7, w: 5, h: 0.5,
          fontSize: 11, color: MUTED, fontFace: 'Arial', italic: true
        });
      }
      // Visual placeholder on right
      s.addShape(pres.shapes.RECTANGLE, {
        x: 6.6, y: HEADER_H + 0.3, w: 6.2, h: 5.5,
        fill: { color: 'E8E7E3' }
      });
      s.addText('[ Visual / Diagram ]', {
        x: 6.6, y: HEADER_H + 2.5, w: 6.2, h: 0.5,
        fontSize: 13, color: 'BBBBBB', fontFace: 'Arial', align: 'center'
      });
      // Slide number badge
      s.addShape(pres.shapes.OVAL, {
        x: W - 0.65, y: HEADER_H + 0.1, w: 0.4, h: 0.4,
        fill: { color: TEAL }
      });
      s.addText(String(i + 1), {
        x: W - 0.65, y: HEADER_H + 0.1, w: 0.4, h: 0.4,
        fontSize: 10, bold: true, color: WHITE, align: 'center', valign: 'middle', margin: 0
      });
    });

    // ── Practice slide ──────────────────────────────────────────
    if (sd.practice_problem) {
      const pp = sd.practice_problem;
      const sp = pres.addSlide();
      sp.background = { color: GREY };
      addCornerAccents(sp);
      addHeader(sp, 'Practice Questions', NAVY);
      sp.addShape(pres.shapes.RECTANGLE, {
        x: 0.5, y: HEADER_H + 0.3, w: W - 1, h: 1.8,
        fill: { color: NAVY }
      });
      sp.addText('YOUR TURN', {
        x: 0.7, y: HEADER_H + 0.35, w: 3, h: 0.45,
        fontSize: 11, bold: true, color: TEAL, fontFace: 'Arial', charSpacing: 2
      });
      sp.addText(pp.question || '', {
        x: 0.7, y: HEADER_H + 0.8, w: W - 1.4, h: 1.1,
        fontSize: 18, color: WHITE, fontFace: 'Arial', wrap: true
      });
      if (pp.hints && pp.hints.length) {
        sp.addText('Hints:', {
          x: 0.7, y: HEADER_H + 2.3, w: 2, h: 0.4,
          fontSize: 13, bold: true, color: NAVY, fontFace: 'Arial'
        });
        sp.addText(pp.hints.map((h, i) => String(i + 1) + '. ' + h).join('\n'), {
          x: 0.7, y: HEADER_H + 2.7, w: W - 1.4, h: 2.0,
          fontSize: 14, color: '5F5E5A', fontFace: 'Arial', wrap: true
        });
      }
    }

    // ── Discussion slide ────────────────────────────────────────
    const dqs = (sd.discussion_questions || []).slice(0, 3);
    if (dqs.length) {
      const sd2 = pres.addSlide();
      sd2.background = { color: GREY };
      addCornerAccents(sd2);
      addHeader(sd2, 'Discussion');
      const labels = ['Think', 'Pair', 'Share'];
      const dColors = [YELLOW, TEAL, 'E07B39'];
      dqs.forEach((q, i) => {
        const y = HEADER_H + 0.3 + i * 1.8;
        sd2.addShape(pres.shapes.RECTANGLE, {
          x: 0.5, y, w: 1.2, h: 0.5,
          fill: { color: dColors[i] }
        });
        sd2.addText(labels[i], {
          x: 0.5, y, w: 1.2, h: 0.5,
          fontSize: 13, bold: true, color: i === 0 ? '2C2C2A' : WHITE,
          fontFace: 'Arial', align: 'center', valign: 'middle', margin: 0
        });
        sd2.addShape(pres.shapes.RECTANGLE, {
          x: 1.9, y, w: W - 2.4, h: 1.3,
          fill: { color: WHITE },
          shadow: { type: 'outer', blur: 4, offset: 2, angle: 135, color: '000000', opacity: 0.06 }
        });
        sd2.addText(q, {
          x: 2.1, y: y + 0.05, w: W - 2.8, h: 1.2,
          fontSize: 16, color: NAVY, fontFace: 'Arial', wrap: true, valign: 'middle'
        });
      });
    }

    // ── Exit Ticket slide ───────────────────────────────────────
    if (sd.exit_ticket) {
      const se = pres.addSlide();
      se.background = { color: GREY };
      addCornerAccents(se);
      addHeader(se, 'Exit Ticket 🎟️');
      se.addShape(pres.shapes.RECTANGLE, {
        x: 1.5, y: HEADER_H + 0.8, w: W - 3, h: 3.5,
        fill: { color: WHITE },
        shadow: { type: 'outer', blur: 8, offset: 3, angle: 135, color: '000000', opacity: 0.1 }
      });
      se.addText(sd.exit_ticket, {
        x: 1.8, y: HEADER_H + 1.0, w: W - 3.6, h: 3.0,
        fontSize: 22, color: NAVY, fontFace: 'Arial', wrap: true, valign: 'middle', align: 'center'
      });
      se.addShape(pres.shapes.RECTANGLE, { x: 1.5, y: HEADER_H + 0.8, w: W - 3, h: 0.08, fill: { color: TEAL } });
    }

    // ── Return as PPTX binary ───────────────────────────────────
    const pptxBuffer = await pres.write({ outputType: 'nodebuffer' });
    const filename = (topic || 'TeacherAI_Slides').replace(/[^a-z0-9]/gi, '_') + '.pptx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pptxBuffer.length);
    return res.status(200).send(pptxBuffer);

  } catch (err) {
    console.error('download-slides error:', err);
    return res.status(500).json({ error: err.message });
  }
};
