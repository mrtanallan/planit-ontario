// api/svg-to-png.js — server-side SVG to PNG conversion
// Uses @resvg/resvg-js — fast Rust-based SVG renderer, no browser needed
// Install: this uses Vercel's built-in Node runtime, resvg-js is auto-installed

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { svg, width, height } = req.body;
    if (!svg || typeof svg !== 'string') {
      return res.status(400).json({ error: 'svg string required' });
    }

    const w = parseInt(width) || 960;
    const h = parseInt(height) || 540;

    // Ensure SVG has proper dimensions
    let svgStr = svg.trim();
    if (!svgStr.includes('xmlns')) {
      svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    svgStr = svgStr.replace(/<svg([^>]*)>/, function(match, attrs) {
      const a = attrs.replace(/width="[^"]*"/, '').replace(/height="[^"]*"/, '');
      return `<svg${a} width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
    });

    const { Resvg } = require('@resvg/resvg-js');
    const resvg = new Resvg(svgStr, {
      fitTo: { mode: 'width', value: w },
      background: 'white',
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    const base64 = pngBuffer.toString('base64');

    return res.status(200).json({ png: base64 });

  } catch (err) {
    console.error('svg-to-png error:', err);
    return res.status(500).json({ error: err.message });
  }
};
