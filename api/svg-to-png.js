// api/svg-to-png.js — SVG to PNG + image URL to PNG

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

    // Mode 1: convert external image URL to base64 PNG
    if (imageUrl) {
      const fetch = require('node-fetch');
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) return res.status(200).json({ png: null, error: 'image fetch failed' });
      const buf = await imgRes.buffer();
      const base64 = buf.toString('base64');
      const mime = imgRes.headers.get('content-type') || 'image/jpeg';
      return res.status(200).json({ png: base64, mime });
    }

    // Mode 2: SVG to PNG
    if (!svg || typeof svg !== 'string') {
      return res.status(400).json({ error: 'svg or imageUrl required' });
    }

    let svgStr = svg.trim();

    // Convert foreignObject text content to SVG text elements
    // This preserves text that was inside HTML divs
    svgStr = svgStr.replace(
      /<foreignObject([^>]*)>([\s\S]*?)<\/foreignObject>/gi,
      function(match, attrs, inner) {
        // Extract x,y,width from foreignObject attrs
        const xm = attrs.match(/x="([^"]+)"/);
        const ym = attrs.match(/y="([^"]+)"/);
        const wm = attrs.match(/width="([^"]+)"/);
        const x = xm ? parseFloat(xm[1]) + 4 : 0;
        const y = ym ? parseFloat(ym[1]) + 16 : 16;
        const fw = wm ? parseFloat(wm[1]) - 8 : 200;

        // Extract plain text from inner HTML
        const text = inner
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (!text) return '';

        // Split into lines of ~40 chars
        const words = text.split(' ');
        const lines = [];
        let line = '';
        const charsPerLine = Math.floor(fw / 7);
        words.forEach(function(word) {
          if ((line + ' ' + word).trim().length > charsPerLine) {
            if (line) lines.push(line.trim());
            line = word;
          } else {
            line = (line + ' ' + word).trim();
          }
        });
        if (line) lines.push(line.trim());

        return lines.map(function(l, i) {
          return '<text x="' + x + '" y="' + (y + i * 16) + '" font-family="Arial,sans-serif" font-size="12" fill="#333">' +
            l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
            '</text>';
        }).join('\n');
      }
    );

    // Ensure xmlns
    if (!svgStr.includes('xmlns')) {
      svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    // Force dimensions
    svgStr = svgStr.replace(/<svg([^>]*)>/, function(match, attrs) {
      const a = attrs
        .replace(/width="[^"]*"/, '').replace(/height="[^"]*"/, '')
        .replace(/width='[^']*'/, '').replace(/height='[^']*'/, '');
      return '<svg' + a + ' width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">';
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
