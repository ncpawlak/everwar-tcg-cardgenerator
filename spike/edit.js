// SPIKE: bake background minus one text layer, re-render edited text, export. Disposable.
const fs = require('fs');
const path = require('path');
const { readPsd, initializeCanvas } = require('ag-psd');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

initializeCanvas((w, h) => createCanvas(w, h));

const PSD_PATH = path.join(__dirname, '..', 'assets', 'Card_1.psd');
const OUT = path.join(__dirname, 'output');

const buf = fs.readFileSync(PSD_PATH);
const psd = readPsd(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

// Flatten layer tree to a list (document order = bottom to top in ag-psd children)
const flat = [];
(function walk(ls) { for (const l of ls) { flat.push(l); if (l.children) walk(l.children); } })(psd.children || []);

const TARGET_NAME = 'Name text'; // the card title "IRONFIST COMMANDER"
const target = flat.find(l => l.name === TARGET_NAME && l.text);
if (!target) throw new Error('target text layer not found');

const t = target.text;
const style = t.style || (t.styleRuns && t.styleRuns[0] && t.styleRuns[0].style) || {};
const fontName = (style.font && style.font.name) || 'sans-serif';
const fontSizePx = style.fontSize || 46;
const fc = style.fillColor || { r: 255, g: 255, b: 255 };
const color = `rgb(${Math.round(fc.r)},${Math.round(fc.g)},${Math.round(fc.b)})`;

console.log(`Target: "${t.text}" font=${fontName} size=${fontSizePx} color=${color} bounds=(${target.left},${target.top})-(${target.right},${target.bottom})`);
console.log('Registered font families available:', GlobalFonts.families.length, '(exact PSD font present:',
  GlobalFonts.families.some(f => f.family && f.family.toLowerCase().includes('square 721')), ')');

// Compose the card MINUS the target layer, by drawing every visible pixel/text layer's
// stored bitmap in document order. This reconstructs "card minus that text".
function composeMinus(skipLayer) {
  const canvas = createCanvas(psd.width, psd.height);
  const ctx = canvas.getContext('2d');
  for (const l of flat) {
    if (l.children) continue;          // groups: children drawn individually
    if (l.hidden) continue;
    if (l === skipLayer) continue;     // omit the target text layer
    if (!l.canvas) continue;
    const w = (l.right - l.left), h = (l.bottom - l.top);
    if (w <= 0 || h <= 0) continue;
    ctx.globalAlpha = (l.opacity == null ? 1 : l.opacity);
    ctx.drawImage(l.canvas, l.left, l.top);
  }
  ctx.globalAlpha = 1;
  return canvas;
}

// --- edited.png : background-minus-title + our re-rendered EDITED title ---
const edited = composeMinus(target);
const ectx = edited.getContext('2d');
const newText = 'IRONFIST EDITED';
ectx.fillStyle = color;
ectx.textBaseline = 'top';
ectx.font = `${fontSizePx}px "${fontName}", "Eurostile", "Bahnschrift", sans-serif`;
ectx.fillText(newText, target.left, target.top);
fs.writeFileSync(path.join(OUT, 'edited.png'), edited.toBuffer('image/png'));
console.log('Wrote edited.png');

// --- fidelity comparison: original bitmap vs our re-render of the SAME text ---
const pad = 20;
const tw = target.right - target.left, th = target.bottom - target.top;
const cmpW = Math.max(tw, 500) + pad * 2;
const cmpH = th * 2 + pad * 4 + 60;
const cmp = createCanvas(cmpW, cmpH);
const c = cmp.getContext('2d');
c.fillStyle = '#222'; c.fillRect(0, 0, cmpW, cmpH);
c.fillStyle = '#fff'; c.font = '16px sans-serif';
c.textBaseline = 'top';
c.fillText('ORIGINAL (PSD-baked bitmap):', pad, 8);
if (target.canvas) c.drawImage(target.canvas, pad, 34);
c.fillText('RE-RENDERED (our canvas, same text, fallback font):', pad, 34 + th + pad);
c.fillStyle = color;
c.font = `${fontSizePx}px "${fontName}", "Eurostile", "Bahnschrift", sans-serif`;
c.fillText(t.text, pad, 34 + th + pad + 24);
fs.writeFileSync(path.join(OUT, 'text-layer-original-vs-rerendered.png'), cmp.toBuffer('image/png'));
console.log('Wrote text-layer-original-vs-rerendered.png');
