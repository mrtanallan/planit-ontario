// pptx-export.js — TeacherAI PPTX export
// Loaded via <script src="/pptx-export.js"> after pptxgenjs

function svgToPng(svgHtml, w, h) {
  w = w || 960; h = h || 540;
  return new Promise(function(resolve, reject) {
    var svg = svgHtml.trim();
    if (svg.indexOf('xmlns') === -1) {
      svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    svg = svg.replace(/<svg([^>]*)>/, function(match, attrs) {
      var a = attrs.replace(/width="[^"]*"/, '').replace(/height="[^"]*"/, '');
      return '<svg' + a + ' width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">';
    });
    var blob = new Blob([svg], {type: 'image/svg+xml;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = function(e) { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

async function downloadPPTX() {
  console.log('[PPTX] start, _slideData:', !!window._slideData);
  if (!window._slideData) {
    console.log('[PPTX] no slideData, bailing');
    showToast('Click Present first to generate slides, then Download Slides');
    return;
  }

  var btn = document.querySelector('[onclick="downloadPPTX()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating PPTX...'; }

  var sd = window._slideData.sd;
  var topic = window._slideData.topic || 'Lesson';
  var subject = window._slideData.subject || '';
  var gradeStr = window._slideData.gradeStr || '';
  var slideImgs = window._slideData.slideImgs || [];
  var mindsonImg = window._slideData.mindsonImg || null;

  // Pre-render any missing SVGs
  (sd.content_slides || []).slice(0,4).forEach(function(cs) {
    if (!cs.svg_html && cs.visual_type && cs.visual_params) {
      var r = renderHardcoded(cs.visual_type, cs.visual_params);
      if (r) cs.svg_html = r;
    }
  });

  var NAVY   = '1D3461';
  var TEAL   = '3BBFAD';
  var YELLOW = 'F5C842';
  var GREY   = 'F4F3EF';
  var WHITE  = 'FFFFFF';
  var MUTED  = '888780';
  var ORANGE = 'E07B39';
  var PURPLE = '6B63D4';

  function hdr(slide, title, bg) {
    bg = bg || TEAL;
    slide.addShape(pptx.ShapeType.rect, {x:0, y:0, w:'100%', h:0.7, fill:{color:bg}});
    slide.addText(title, {x:0.5, y:0.08, w:12, h:0.55, fontSize:20, bold:true, color:WHITE, fontFace:'Arial'});
  }

  function safe(s) {
    return String(s || '').replace(/[^\x20-\x7E]/g, '').trim();
  }

  console.log('[PPTX] creating pptx instance');
  var pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  try {
    console.log('[PPTX] inside try, building slides');
    // SLIDE 1: Title
    var s1 = pptx.addSlide();
    s1.background = {color: NAVY};
    s1.addShape(pptx.ShapeType.rect, {x:0, y:0, w:0.08, h:'100%', fill:{color:TEAL}});
    s1.addText(safe(topic), {x:0.7, y:1.8, w:12, h:1.6, fontSize:40, bold:true, color:WHITE, fontFace:'Arial Black', wrap:true, valign:'middle'});
    s1.addText(safe((gradeStr ? gradeStr + ' - ' : '') + subject), {x:0.7, y:3.5, w:10, h:0.5, fontSize:18, color:'9BB3D4', fontFace:'Arial'});
    s1.addText('teacherai.ca - Ontario Curriculum', {x:0.7, y:6.8, w:10, h:0.4, fontSize:10, color:'4A6080', fontFace:'Courier New'});

    // SLIDE 2: Learning Goals
    var s2 = pptx.addSlide();
    s2.background = {color: GREY};
    hdr(s2, 'Learning Goals');
    s2.addText('By the end of this lesson, we will...', {x:0.5, y:0.82, w:12, h:0.35, fontSize:11, bold:true, color:MUTED, fontFace:'Arial'});
    var goals = (sd.learning_goals || []).slice(0,3);
    var gColors = [YELLOW, TEAL, ORANGE];
    goals.forEach(function(g, i) {
      var y = 1.3 + i * 1.5;
      s2.addShape(pptx.ShapeType.rect, {x:0.5, y:y, w:0.55, h:0.55, fill:{color:gColors[i]}});
      s2.addText(String(i+1), {x:0.5, y:y, w:0.55, h:0.55, fontSize:20, bold:true, color:i===0?'2C2C2A':WHITE, align:'center', valign:'middle'});
      s2.addShape(pptx.ShapeType.rect, {x:1.2, y:y-0.08, w:11.5, h:0.75, fill:{color:WHITE}});
      s2.addText(safe(g), {x:1.35, y:y-0.02, w:11.2, h:0.65, fontSize:16, color:NAVY, fontFace:'Arial', wrap:true, valign:'middle'});
    });

    // SLIDE 3: Minds On
    if (sd.minds_on) {
      var s3 = pptx.addSlide();
      s3.background = {color: GREY};
      hdr(s3, 'Minds On!', ORANGE);
      var moW = mindsonImg ? 8.5 : 12.5;
      if (sd.minds_on.hook) {
        s3.addText(safe(sd.minds_on.hook), {x:0.5, y:0.85, w:moW, h:1.2, fontSize:18, color:NAVY, fontFace:'Arial', wrap:true, bold:true});
      }
      if (sd.minds_on.prompt) {
        s3.addShape(pptx.ShapeType.rect, {x:0.5, y:2.15, w:moW, h:1.8, fill:{color:NAVY}});
        s3.addText(safe(sd.minds_on.prompt), {x:0.65, y:2.25, w:moW-0.3, h:1.6, fontSize:16, color:WHITE, fontFace:'Arial', wrap:true, valign:'middle'});
      }
    }

    // SLIDE 4: Vocabulary
    var vocabWords = (sd.vocabulary || []).slice(0,4);
    if (vocabWords.length) {
      var s4 = pptx.addSlide();
      s4.background = {color: GREY};
      hdr(s4, 'Key Vocabulary');
      var vColors = [TEAL, YELLOW, ORANGE, PURPLE];
      var cols = vocabWords.length <= 2 ? 1 : 2;
      vocabWords.forEach(function(v, i) {
        var col = i % cols;
        var row = Math.floor(i / cols);
        var vx = 0.4 + col * 6.5;
        var vy = 1.0 + row * 2.6;
        var vw = cols === 1 ? 12.5 : 6.0;
        s4.addShape(pptx.ShapeType.rect, {x:vx, y:vy, w:vw, h:2.3, fill:{color:WHITE}, line:{color:'DDDDDD', width:1}});
        s4.addShape(pptx.ShapeType.rect, {x:vx, y:vy, w:vw, h:0.08, fill:{color:vColors[i%4]}});
        s4.addText(safe(v.word), {x:vx+0.15, y:vy+0.15, w:vw-0.3, h:0.55, fontSize:18, bold:true, color:NAVY, fontFace:'Arial'});
        s4.addText(safe(v.definition), {x:vx+0.15, y:vy+0.72, w:vw-0.3, h:0.8, fontSize:13, color:'5F5E5A', fontFace:'Arial', wrap:true});
        if (v.example) {
          s4.addText('"' + safe(v.example) + '"', {x:vx+0.15, y:vy+1.55, w:vw-0.3, h:0.55, fontSize:11, color:MUTED, italic:true, fontFace:'Arial', wrap:true});
        }
      });
    }

    // SLIDES 5-8: Content slides with SVG screenshots
    var cSlides = (sd.content_slides || []).slice(0,4);
    var cTotal = cSlides.length;
    for (var ci = 0; ci < cTotal; ci++) {
      var cs = cSlides[ci];
      var sc = pptx.addSlide();
      sc.background = {color: GREY};
      hdr(sc, safe(cs.title || 'Key Concept'));
      sc.addText((ci+1) + '/' + cTotal, {x:12.3, y:0.12, w:0.8, h:0.45, fontSize:10, color:WHITE, fontFace:'Courier New', align:'right'});
      sc.addShape(pptx.ShapeType.rect, {x:0.35, y:0.85, w:4.5, h:3.0, fill:{color:WHITE}, line:{color:TEAL, width:4}});
      sc.addText(safe(cs.key_point || cs.title || ''), {x:0.5, y:0.92, w:4.2, h:2.85, fontSize:15, color:NAVY, fontFace:'Arial', wrap:true, valign:'middle'});
      if (cs.teacher_note) {
        sc.addShape(pptx.ShapeType.rect, {x:0.35, y:4.0, w:4.5, h:1.4, fill:{color:'FFF8E1'}, line:{color:YELLOW, width:1}});
        sc.addText('Note: ' + safe(cs.teacher_note), {x:0.5, y:4.1, w:4.2, h:1.2, fontSize:10, color:'5F5E5A', italic:true, fontFace:'Arial', wrap:true});
      }
      var svgHtml = cs.svg_html || '';
      var pngData = null;
      if (svgHtml && svgHtml.indexOf('<svg') !== -1) {
        try { pngData = await svgToPng(svgHtml, 960, 540); } catch(ex) { console.warn('svg fail', ex); }
      }
      if (pngData) {
        sc.addImage({data: pngData, x:5.1, y:0.82, w:8.1, h:5.95});
      } else {
        var vtype = safe((cs.visual_type || 'diagram').replace(/_/g, ' '));
        sc.addShape(pptx.ShapeType.rect, {x:5.1, y:0.82, w:8.1, h:5.95, fill:{color:WHITE}, line:{color:'DDDDDD', width:1}});
        sc.addText('[' + vtype + '] - Add diagram here', {x:5.2, y:3.0, w:7.9, h:1.6, fontSize:13, color:'BBBBBB', align:'center', valign:'middle', fontFace:'Arial', italic:true, wrap:true});
      }
    }

    // SLIDE: Practice
    var pp = sd.practice_problem;
    if (pp && pp.question) {
      var sp = pptx.addSlide();
      sp.background = {color: GREY};
      hdr(sp, 'Practice', NAVY);
      sp.addShape(pptx.ShapeType.rect, {x:0.4, y:0.85, w:12.5, h:1.5, fill:{color:NAVY}});
      sp.addText('YOUR TURN', {x:0.6, y:0.9, w:3, h:0.4, fontSize:10, bold:true, color:TEAL});
      sp.addText(safe(pp.question), {x:0.6, y:1.3, w:12.1, h:0.9, fontSize:18, color:WHITE, fontFace:'Arial', wrap:true});
      (pp.solution_steps || []).slice(0,5).forEach(function(step, si) {
        var sy = 2.55 + si * 0.75;
        sp.addShape(pptx.ShapeType.ellipse, {x:0.4, y:sy, w:0.38, h:0.38, fill:{color:TEAL}});
        sp.addText(String(si+1), {x:0.4, y:sy, w:0.38, h:0.38, fontSize:12, bold:true, color:WHITE, align:'center', valign:'middle'});
        sp.addText(safe(step), {x:0.9, y:sy+0.02, w:12, h:0.38, fontSize:14, color:'2C2C2A', fontFace:'Arial', wrap:true});
      });
    }

    // SLIDE: Discussion
    var dqs = (sd.discussion_questions || []).slice(0,3);
    if (dqs.length) {
      var sdq = pptx.addSlide();
      sdq.background = {color: GREY};
      hdr(sdq, 'Discussion', PURPLE);
      var dColors = [TEAL, YELLOW, PURPLE];
      var dBg = ['E1F5EE', 'FFF8E1', 'EDE7F6'];
      var dLabels = ['Recall', 'Apply', 'Evaluate'];
      dqs.forEach(function(q, di) {
        var dy = 0.9 + di * 1.9;
        sdq.addShape(pptx.ShapeType.rect, {x:0.4, y:dy, w:12.5, h:1.7, fill:{color:dBg[di]}, line:{color:dColors[di], width:4}});
        sdq.addText(dLabels[di].toUpperCase(), {x:0.6, y:dy+0.1, w:3, h:0.35, fontSize:9, bold:true, color:dColors[di]});
        sdq.addText(safe(q), {x:0.6, y:dy+0.48, w:12.1, h:1.1, fontSize:15, color:NAVY, fontFace:'Arial', wrap:true});
      });
    }

    // SLIDE: Exit Ticket
    var etRaw = sd.exit_ticket;
    var et = (typeof etRaw === 'object' && etRaw) ? etRaw : {question: String(etRaw || ''), answer_hint: ''};
    if (et.question) {
      var se = pptx.addSlide();
      se.background = {color: NAVY};
      se.addShape(pptx.ShapeType.rect, {x:0, y:0, w:0.08, h:'100%', fill:{color:TEAL}});
      se.addShape(pptx.ShapeType.rect, {x:2.5, y:0.7, w:8.4, h:0.5, fill:{color:TEAL}});
      se.addText('SHOW WHAT YOU KNOW', {x:2.5, y:0.72, w:8.4, h:0.45, fontSize:11, bold:true, color:WHITE, align:'center'});
      se.addShape(pptx.ShapeType.rect, {x:1.5, y:1.45, w:10.4, h:2.8, fill:{color:'1A2E50'}, line:{color:'3A5A80', width:1}});
      se.addText(safe(et.question), {x:1.7, y:1.6, w:10.0, h:2.5, fontSize:22, color:WHITE, fontFace:'Arial', wrap:true, align:'center', valign:'middle'});
      if (et.answer_hint) {
        se.addText('Hint: ' + safe(et.answer_hint), {x:1.5, y:4.4, w:10.4, h:0.5, fontSize:12, color:'6080A0', italic:true, align:'center'});
      }
      var lbls = ['Name:', 'Date:', 'Class:'];
      lbls.forEach(function(lbl, li) {
        var lx = 1.5 + li * 3.8;
        se.addShape(pptx.ShapeType.line, {x:lx, y:6.5, w:3.2, h:0, line:{color:'3A5A80', width:1}});
        se.addText(lbl, {x:lx, y:6.55, w:3.2, h:0.4, fontSize:11, color:'4A6080', align:'center'});
      });
    }

    // SLIDE: Google Slides instructions
    var sg = pptx.addSlide();
    sg.background = {color: WHITE};
    sg.addShape(pptx.ShapeType.rect, {x:0, y:0, w:'100%', h:0.5, fill:{color:TEAL}});
    sg.addText('Opening in Google Slides', {x:0.5, y:0.08, w:12, h:0.35, fontSize:16, bold:true, color:WHITE});
    sg.addText('How to open in Google Slides:', {x:0.8, y:0.8, w:12, h:0.5, fontSize:18, bold:true, color:NAVY});
    var gSteps = [
      '1.  Go to drive.google.com',
      '2.  Drag and drop this .pptx file into Google Drive',
      '3.  Right-click the file > Open with > Google Slides',
      '4.  The presentation will open fully editable',
      '5.  Edit text, swap images, and customize to your class'
    ];
    gSteps.forEach(function(step, gi) {
      sg.addText(step, {x:0.8, y:1.55 + gi * 0.82, w:12, h:0.7, fontSize:15, color:'2C2C2A', fontFace:'Arial'});
    });
    sg.addText('Generated by TeacherAI - teacherai.ca', {x:0.5, y:6.9, w:12.5, h:0.4, fontSize:10, color:MUTED, align:'center', italic:true});

    var fname = (topic || 'lesson').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-').toLowerCase();
    var fname2 = 'teacherai-' + fname + '.pptx';
    console.log('[PPTX] writing base64...');
    var pptxBase64 = await pptx.write({outputType: 'base64'});
    console.log('[PPTX] base64 length:', pptxBase64.length);
    var dataUri = 'data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,' + pptxBase64;
    var a = document.createElement('a');
    a.href = dataUri;
    a.download = fname2;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Downloaded! Drag into Google Drive and open with Google Slides', 5000);

  } catch(err) {
    console.error('[PPTX] ERROR:', err);
    alert('Could not create PPTX: ' + err.message);
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Download Slides'; }
}
