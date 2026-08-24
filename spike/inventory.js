// SPIKE: enumerate PSD layers and dump text-layer properties. Disposable.
const fs = require('fs');
const path = require('path');
const { readPsd } = require('ag-psd');
const { createCanvas } = require('@napi-rs/canvas');

// ag-psd needs a canvas factory in Node to build composite bitmaps
const { initializeCanvas } = require('ag-psd');
initializeCanvas((w, h) => createCanvas(w, h));

const PSD_PATH = path.join(__dirname, '..', 'assets', 'Card_1.psd');
const OUT_DIR = path.join(__dirname, 'output');
fs.mkdirSync(OUT_DIR, { recursive: true });

const buf = fs.readFileSync(PSD_PATH);
const psd = readPsd(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), {
  skipLayerImageData: false,
  skipCompositeImageData: false,
  useImageData: false,
});

console.log(`PSD size: ${psd.width} x ${psd.height}`);

const inventory = [];
let idx = 0;

function color2str(c) {
  if (!c) return null;
  if (typeof c === 'object' && 'r' in c) return `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`;
  return JSON.stringify(c);
}

function walk(layers, depth, parentPath) {
  for (const layer of layers) {
    const id = idx++;
    const isText = !!layer.text;
    const entry = {
      id,
      name: layer.name,
      path: parentPath ? `${parentPath} / ${layer.name}` : layer.name,
      depth,
      isGroup: !!layer.children,
      isText,
      hidden: !!layer.hidden,
      opacity: layer.opacity,
      bounds: { left: layer.left, top: layer.top, right: layer.right, bottom: layer.bottom },
      hasCanvas: !!layer.canvas,
      blendMode: layer.blendMode,
      effects: layer.effects ? Object.keys(layer.effects) : null,
    };
    if (isText) {
      const t = layer.text;
      const style = (t.style) || {};
      // Font info can live in style or in style runs
      let font = style.font && style.font.name;
      let fontSize = style.fontSize;
      let fillColor = style.fillColor;
      const runs = [];
      if (t.styleRuns) {
        for (const r of t.styleRuns) {
          const s = r.style || {};
          runs.push({
            length: r.length,
            font: s.font && s.font.name,
            fontSize: s.fontSize,
            fillColor: color2str(s.fillColor),
            fauxBold: s.fauxBold, fauxItalic: s.fauxItalic,
          });
          if (!font && s.font) font = s.font.name;
          if (fontSize == null && s.fontSize != null) fontSize = s.fontSize;
          if (!fillColor && s.fillColor) fillColor = s.fillColor;
        }
      }
      entry.text = {
        content: t.text,
        font,
        fontSize,
        fillColor: color2str(fillColor),
        justification: (t.paragraphStyle && t.paragraphStyle.justification) || style.justification,
        transform: t.transform,
        styleRuns: runs,
      };
    }
    inventory.push(entry);
    if (layer.children) walk(layer.children, depth + 1, entry.path);
  }
}

walk(psd.children || [], 0, '');

fs.writeFileSync(path.join(OUT_DIR, '..', 'layer-inventory.json'),
  JSON.stringify({ width: psd.width, height: psd.height, layers: inventory }, null, 2));

console.log('\n===== LAYER INVENTORY =====');
for (const e of inventory) {
  const indent = '  '.repeat(e.depth);
  const kind = e.isGroup ? '[GROUP]' : e.isText ? '[TEXT]' : '[PIXEL]';
  console.log(`${indent}#${e.id} ${kind} "${e.name}" bounds=(${e.bounds.left},${e.bounds.top})-(${e.bounds.right},${e.bounds.bottom}) canvas=${e.hasCanvas} hidden=${e.hidden}${e.effects ? ' fx=' + e.effects.join(',') : ''}`);
  if (e.isText) {
    console.log(`${indent}    text="${e.text.content}" font=${e.text.font} size=${e.text.fontSize} color=${e.text.fillColor} just=${e.text.justification}`);
  }
}

// Collect fonts
const fonts = new Set();
for (const e of inventory) {
  if (e.isText) {
    if (e.text.font) fonts.add(e.text.font);
    for (const r of e.text.styleRuns) if (r.font) fonts.add(r.font);
  }
}
console.log('\n===== FONTS REFERENCED =====');
console.log([...fonts].join('\n') || '(none)');
fs.writeFileSync(path.join(OUT_DIR, '..', 'fonts-referenced.json'), JSON.stringify([...fonts], null, 2));

// Export baseline composite
if (psd.canvas) {
  const out = psd.canvas.toBuffer ? psd.canvas.toBuffer('image/png') : psd.canvas.encodeSync('png');
  fs.writeFileSync(path.join(OUT_DIR, 'baseline.png'), out);
  console.log('\nWrote baseline.png (' + psd.canvas.width + 'x' + psd.canvas.height + ')');
} else {
  console.log('\nNO composite canvas available on psd');
}
