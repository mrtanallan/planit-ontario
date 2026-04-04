// api/svg-to-png.js v5 — uses sharp (pre-installed on Vercel via Next.js)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { svg, imageUrl, width, height } = req.body;
    const w = parseInt(width) || 960;
    const h = parseInt(height) || 540;

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

    // Mode 2: SVG to PNG via sharp
    if (!svg || typeof svg !== 'string') {
      return res.status(400).json({ error: 'svg or imageUrl required' });
    }

    let svgStr = svg.trim();

    // Convert foreignObject to native SVG text elements
    svgStr = svgStr.replace(
      /<foreignObject\s+([^>]*)>([\s\S]*?)<\/foreignObject>/gi,
      function(match, attrStr, inner) {
        const getAttr = function(name) {
          const m = attrStr.match(new RegExp(name + '=["\']([^"\']+)["\']'));
          return m ? parseFloat(m[1]) : 0;
        };
        const fx = getAttr('x');
        const fy = getAttr('y');
        const fw = getAttr('width') || 100;
        const fh = getAttr('height') || 20;

        const rawText = inner
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

        if (!rawText) return '';

        const colorMatch = inner.match(/color:\s*([#\w]+)/);
        const color = colorMatch ? colorMatch[1] : '#333333';
        const boldMatch = inner.match(/font-weight:\s*(\w+)/);
        const isBold = boldMatch && (boldMatch[1] === 'bold' || parseInt(boldMatch[1]) >= 600);
        const sizeMatch = inner.match(/font-size:\s*(\d+)px/);
        const fontSize = sizeMatch ? parseInt(sizeMatch[1]) : 12;

        const escaped = function(t) {
          return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        };

        const charsPerLine = Math.max(1, Math.floor(fw / (fontSize * 0.58)));
        const words = rawText.split(' ');
        const lines = [];
        let line = '';
        words.forEach(function(word) {
          if (line.length + word.length + 1 > charsPerLine && line.length > 0) {
            lines.push(line); line = word;
          } else {
            line = line ? line + ' ' + word : word;
          }
        });
        if (line) lines.push(line);

        const lineH = fontSize * 1.35;
        const totalH = lines.length * lineH;
        const startY = fy + (fh - totalH) / 2 + fontSize * 0.85;
        const cx = fx + fw / 2;

        return lines.map(function(l, i) {
          return '<text x="' + cx + '" y="' + (startY + i * lineH) + '"' +
            ' text-anchor="middle"' +
            ' font-family="sans-serif"' +
            ' font-size="' + fontSize + '"' +
            (isBold ? ' font-weight="bold"' : '') +
            ' fill="' + escaped(color) + '">' +
            escaped(l) + '</text>';
        }).join('\n');
      }
    );

    // Remove xhtml namespace
    svgStr = svgStr.replace(/xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');

    // Ensure SVG namespace
    if (!svgStr.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    // Force dimensions
    svgStr = svgStr.replace(/<svg([^>]*)>/, function(match, attrs) {
      const a = attrs
        .replace(/\bwidth="[^"]*"/, '').replace(/\bheight="[^"]*"/, '')
        .replace(/\bwidth='[^']*'/, '').replace(/\bheight='[^']*'/, '');
      return '<svg' + a + ' width="' + w + '" height="' + h + '">';
    });

    const sharp = require('sharp');
    // Embed Poppins font for text rendering
    const fs = require('fs');
    const fontPaths = {
      regular: '/usr/share/fonts/truetype/google-fonts/Poppins-Regular.ttf',
      bold: '/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf'
    };
    let fontDefs = '';
    try {
      const reg = fs.readFileSync(fontPaths.regular).toString('base64');
      const bold = fs.readFileSync(fontPaths.bold).toString('base64');
      fontDefs = '<defs><style>' +
        '@font-face{font-family:"AppFont";font-weight:normal;src:url("data:font/truetype;base64,' + reg + '")}' +
        '@font-face{font-family:"AppFont";font-weight:bold;src:url("data:font/truetype;base64,' + bold + '")}' +
        '</style></defs>';
    } catch(fe) {
      console.log('font load failed:', fe.message);
    }
    if (fontDefs) {
      svgStr = svgStr.replace(/<svg([^>]*)>/, '<svg$1>' + fontDefs);
      svgStr = svgStr.replace(/font-family="[^"]*"/g, 'font-family="AppFont"');
      svgStr = svgStr.replace(/font-family='[^']*'/g, "font-family='AppFont'");
    }

    const pngBuffer = await sharp(Buffer.from(svgStr))
      .resize(w, h, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();

    const base64 = pngBuffer.toString('base64');
    return res.status(200).json({ png: base64 });

  } catch (err) {
    console.error('svg-to-png error:', err.message);
    return res.status(200).json({ png: null, error: err.message });
  }
};
