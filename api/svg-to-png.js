// api/svg-to-png.js — SVG to PNG + image URL to base64

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

    // Mode 1: fetch external image URL and return as base64
    if (imageUrl) {
      const fetch = require('node-fetch');
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) return res.status(200).json({ png: null, error: 'image fetch failed' });
      const buf = await imgRes.buffer();
      const base64 = buf.toString('base64');
      const mime = imgRes.headers.get('content-type') || 'image/jpeg';
      return res.status(200).json({ png: base64, mime });
    }

    // Mode 2: SVG string to PNG
    if (!svg || typeof svg !== 'string') {
      return res.status(400).json({ error: 'svg or imageUrl required' });
    }

    let svgStr = svg.trim();

    // Replace foreignObject elements with SVG text equivalents
    // Pattern: <foreignObject x="N" y="N" width="N" height="N">...<div...>TEXT</div>...</foreignObject>
    svgStr = svgStr.replace(
      /<foreignObject\s+([^>]*)>([\s\S]*?)<\/foreignObject>/gi,
      function(match, attrStr, inner) {
        // Parse x, y, width, height from attributes
        const getAttr = (name) => {
          const m = attrStr.match(new RegExp(name + '=["\']([^"\']+)["\']'));
          return m ? parseFloat(m[1]) : 0;
        };
        const fx = getAttr('x');
        const fy = getAttr('y');
        const fw = getAttr('width') || 100;
        const fh = getAttr('height') || 20;

        // Extract text from inner HTML — strip all tags
        const rawText = inner
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (!rawText) return '';

        // Extract color from div style if present
        const colorMatch = inner.match(/color:\s*([#\w]+)/);
        const color = colorMatch ? colorMatch[1] : '#333333';

        // Extract font-weight
        const boldMatch = inner.match(/font-weight:\s*(\w+)/);
        const fontWeight = (boldMatch && (boldMatch[1] === 'bold' || parseInt(boldMatch[1]) >= 600)) ? 'bold' : 'normal';

        // Extract font-size
        const sizeMatch = inner.match(/font-size:\s*(\d+)px/);
        const fontSize = sizeMatch ? parseInt(sizeMatch[1]) : 12;

        // Wrap text into lines based on available width
        const charsPerLine = Math.max(1, Math.floor(fw / (fontSize * 0.6)));
        const words = rawText.split(' ');
        const lines = [];
        let line = '';
        words.forEach(function(word) {
          if (line.length + word.length + 1 > charsPerLine && line.length > 0) {
            lines.push(line);
            line = word;
          } else {
            line = line ? line + ' ' + word : word;
          }
        });
        if (line) lines.push(line);

        // Total text height
        const lineH = fontSize * 1.3;
        const totalTextH = lines.length * lineH;
        // Vertically center text in the foreignObject box
        const startY = fy + (fh - totalTextH) / 2 + fontSize;

        const escaped = (t) => t
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

        return lines.map(function(l, i) {
          return '<text' +
            ' x="' + (fx + fw / 2) + '"' +
            ' y="' + (startY + i * lineH) + '"' +
            ' text-anchor="middle"' +
            ' font-family="Arial,Helvetica,sans-serif"' +
            ' font-size="' + fontSize + '"' +
            ' font-weight="' + fontWeight + '"' +
            ' fill="' + escaped(color) + '"' +
            '>' + escaped(l) + '</text>';
        }).join('\n');
      }
    );

    // Ensure xmlns
    if (!svgStr.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    // Remove any remaining xhtml xmlns declarations that confuse resvg
    svgStr = svgStr.replace(/xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');

    // Force dimensions
    svgStr = svgStr.replace(/<svg([^>]*)>/, function(match, attrs) {
      const a = attrs
        .replace(/\bwidth="[^"]*"/, '')
        .replace(/\bheight="[^"]*"/, '')
        .replace(/\bwidth='[^']*'/, '')
        .replace(/\bheight='[^']*'/, '');
      return '<svg' + a + ' width="' + w + '" height="' + h + '">';
    });

    const { Resvg } = require('@resvg/resvg-js');
    const resvg = new Resvg(svgStr, {
      fitTo: { mode: 'width', value: w },
      background: 'white',
    });
    const pngData = resvg.render();
    const base64 = pngData.asPng().toString('base64');

    return res.status(200).json({ png: base64 });

  } catch (err) {
    console.error('svg-to-png error:', err.message);
    return res.status(200).json({ png: null, error: err.message });
  }
};
