// api/svg-to-png.js v6 — debug font paths

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { svg, imageUrl, width, height, debugFonts } = req.body;
    const w = parseInt(width) || 960;
    const h = parseInt(height) || 540;

    // Debug: list available fonts on this machine
    if (debugFonts) {
      const fs = require('fs');
      const { execSync } = require('child_process');
      let fontInfo = {};
      try { fontInfo.fcList = execSync('fc-list | head -20').toString(); } catch(e) { fontInfo.fcList = e.message; }
      try { fontInfo.bundledFont = fs.existsSync('/var/task/fonts/Poppins-Regular.ttf'); } catch(e) {}
      try { fontInfo.bundledFontTff = fs.existsSync('/var/task/fonts/Poppins-Regular.tff'); } catch(e) {}
      try { fontInfo.varTaskFonts = fs.readdirSync('/var/task/fonts').join(','); } catch(e) { fontInfo.varTaskFonts = e.message; }
      try { fontInfo.varTask = fs.readdirSync('/var/task').join(','); } catch(e) { fontInfo.varTask = e.message; }
      return res.status(200).json(fontInfo);
    }

    // Mode 1: fetch external image URL
    if (imageUrl) {
      const fetch = require('node-fetch');
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) return res.status(200).json({ png: null, error: 'image fetch failed' });
      const buf = await imgRes.buffer();
      const base64 = buf.toString('base64');
      const mime = imgRes.headers.get('content-type') || 'image/jpeg';
      return res.status(200).json({ png: base64, mime });
    }

    if (!svg) return res.status(400).json({ error: 'svg or imageUrl required' });

    let svgStr = svg.trim();

    // Convert foreignObject to SVG text
    svgStr = svgStr.replace(
      /<foreignObject\s+([^>]*)>([\s\S]*?)<\/foreignObject>/gi,
      function(match, attrStr, inner) {
        const getAttr = function(name) {
          const m = attrStr.match(new RegExp(name + '=["\']([^"\']+)["\']'));
          return m ? parseFloat(m[1]) : 0;
        };
        const fx = getAttr('x'), fy = getAttr('y');
        const fw = getAttr('width') || 100, fh = getAttr('height') || 20;

        const rawText = inner.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&')
          .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
          .replace(/\s+/g,' ').trim();
        if (!rawText) return '';

        const colorMatch = inner.match(/color:\s*([#\w]+)/);
        const color = colorMatch ? colorMatch[1] : '#333';
        const boldMatch = inner.match(/font-weight:\s*(\w+)/);
        const isBold = boldMatch && (boldMatch[1]==='bold'||parseInt(boldMatch[1])>=600);
        const sizeMatch = inner.match(/font-size:\s*(\d+)px/);
        const fontSize = sizeMatch ? parseInt(sizeMatch[1]) : 12;

        const esc = function(t){ return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
        const charsPerLine = Math.max(1, Math.floor(fw/(fontSize*0.58)));
        const words = rawText.split(' ');
        const lines = []; let line = '';
        words.forEach(function(word){
          if(line.length+word.length+1>charsPerLine&&line.length>0){lines.push(line);line=word;}
          else{line=line?line+' '+word:word;}
        });
        if(line)lines.push(line);

        const lineH = fontSize*1.35;
        const totalH = lines.length*lineH;
        const startY = fy+(fh-totalH)/2+fontSize*0.85;
        const cx = fx+fw/2;

        return lines.map(function(l,i){
          return '<text x="'+cx+'" y="'+(startY+i*lineH)+'" text-anchor="middle" font-size="'+fontSize+'"'+(isBold?' font-weight="bold"':'')+' fill="'+esc(color)+'">'+esc(l)+'</text>';
        }).join('\n');
      }
    );

    svgStr = svgStr.replace(/xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g,'');
    if(!svgStr.includes('xmlns="http://www.w3.org/2000/svg"')){
      svgStr = svgStr.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"');
    }
    svgStr = svgStr.replace(/<svg([^>]*)>/,function(match,attrs){
      const a = attrs.replace(/\bwidth="[^"]*"/,'').replace(/\bheight="[^"]*"/,'')
        .replace(/\bwidth='[^']*'/,'').replace(/\bheight='[^']*'/,'');
      return '<svg'+a+' width="'+w+'" height="'+h+'">';
    });

    // Try to load a font from disk
    const fs = require('fs');
    const fontCandidates = [
      '/var/task/fonts/Poppins-Regular.ttf',
      '/var/task/fonts/Poppins-Regular.tff',
      '/usr/share/fonts/truetype/google-fonts/Poppins-Regular.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ];
    let fontB64 = null;
    for(var i=0;i<fontCandidates.length;i++){
      try{
        if(fs.existsSync(fontCandidates[i])){
          fontB64 = fs.readFileSync(fontCandidates[i]).toString('base64');
          console.log('Loaded font:', fontCandidates[i]);
          break;
        }
      }catch(e){}
    }

    if(fontB64){
      const defs = '<defs><style>@font-face{font-family:"F";src:url("data:font/truetype;base64,'+fontB64+'")}</style></defs>';
      svgStr = svgStr.replace(/<svg([^>]*)>/,'<svg$1>'+defs);
      svgStr = svgStr.replace(/font-family="[^"]*"/g,'font-family="F"');
      svgStr = svgStr.replace(/font-family='[^']*'/g,"font-family='F'");
    } else {
      console.log('No font found on disk');
    }

    const sharp = require('sharp');
    const pngBuffer = await sharp(Buffer.from(svgStr))
      .resize(w, h, {fit:'contain', background:{r:255,g:255,b:255,alpha:1}})
      .png().toBuffer();

    return res.status(200).json({ png: pngBuffer.toString('base64') });

  } catch(err) {
    console.error('svg-to-png error:', err.message);
    return res.status(200).json({ png: null, error: err.message });
  }
};
