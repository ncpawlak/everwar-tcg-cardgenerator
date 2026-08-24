// SPIKE v2: real fonts registered, faux small-caps via per-run sizing, wrapped abilities body.
const fs = require('fs');
const path = require('path');
const { readPsd, initializeCanvas } = require('ag-psd');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

initializeCanvas((w, h) => createCanvas(w, h));

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const BOLD = path.join(FONT_DIR, 'Square721BT-BoldCondensed.otf');
const ROMAN = path.join(FONT_DIR, 'Square721BT-RomanCondensed.otf');
// Register under the exact PostScript names the PSD references.
GlobalFonts.registerFromPath(BOLD, 'Square721BT-BoldCondensed');
GlobalFonts.registerFromPath(ROMAN, 'Square721BT-RomanCondensed');
console.log('Registered. Bold present:', GlobalFonts.has('Square721BT-BoldCondensed'),
  ' Roman present:', GlobalFonts.has('Square721BT-RomanCondensed'));

const SESS = 'C:\\Users\\NoahPawlak\\.copilot\\session-state\\7a783953-edce-422a-b099-c63d178dd06b\\files\\';
const OUT = path.join(__dirname, 'output');

const buf = fs.readFileSync(path.join(__dirname, '..', 'assets', 'Card_1.psd'));
const psd = readPsd(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const flat = [];
(function walk(ls) { for (const l of ls) { flat.push(l); if (l.children) walk(l.children); } })(psd.children || []);

function composeMinus(skip) {
  const c = createCanvas(psd.width, psd.height);
  const ctx = c.getContext('2d');
  for (const l of flat) {
    if (l.children || l.hidden || l === skip || !l.canvas) continue;
    if ((l.right - l.left) <= 0 || (l.bottom - l.top) <= 0) continue;
    ctx.globalAlpha = (l.opacity == null ? 1 : l.opacity);
    ctx.drawImage(l.canvas, l.left, l.top);
  }
  ctx.globalAlpha = 1;
  return c;
}

// Draw a string with per-run font sizes (reproduces faux small-caps).
// runs: [{text, size}], baseline anchor at (x0, yBaseline), left-justified. Returns end x.
function drawRuns(ctx, runs, x0, yBaseline, fontName, color) {
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  let x = x0;
  for (const r of runs) {
    ctx.font = `${r.size}px "${fontName}"`;
    ctx.fillText(r.text, x, yBaseline);
    x += ctx.measureText(r.text).width;
  }
  return x;
}

// Build styleRuns for a string given the PSD run lengths/sizes pattern of the title.
function runsFromPsdText(t) {
  const out = [];
  let i = 0;
  for (const sr of t.styleRuns) {
    out.push({ text: t.text.substr(i, sr.length), size: sr.style.fontSize });
    i += sr.length;
  }
  return out;
}

const title = flat.find(l => l.name === 'Name text');
const tt = title.text;
const titleFont = tt.style.font.name;           // Square721BT-BoldCondensed
const titleColor = `rgb(${Math.round(tt.style.fillColor.r)},${Math.round(tt.style.fillColor.g)},${Math.round(tt.style.fillColor.b)})`;
const baseX = tt.transform[4], baseY = tt.transform[5]; // engine baseline anchor

// ---------- 1) fidelity comparison: original bitmap vs re-render of SAME text ----------
const origRuns = runsFromPsdText(tt); // "I"(45.83) "RONFIST "(37.5) "C"(45.83) "OMMANDER"(37.5)
const tw = title.right - title.left, th = title.bottom - title.top;
const pad = 24, cmpW = 640, cmpH = th * 2 + 150;
const cmp = createCanvas(cmpW, cmpH);
const c = cmp.getContext('2d');
c.fillStyle = '#181818'; c.fillRect(0, 0, cmpW, cmpH);
c.fillStyle = '#bbb'; c.font = '15px sans-serif'; c.textBaseline = 'top';
c.fillText('ORIGINAL (PSD-baked bitmap):', pad, 8);
if (title.canvas) c.drawImage(title.canvas, pad, 30);
c.fillStyle = '#bbb';
c.fillText('RE-RENDERED (Square721BT-BoldCondensed, per-run small-caps):', pad, 30 + th + 26);
// baseline for re-render: place so cap-top aligns near same y as original bitmap row
const reBaseY = 30 + th + 26 + 30 + (baseY - title.top);
drawRuns(c, origRuns, pad, reBaseY, titleFont, titleColor);
fs.writeFileSync(path.join(OUT, 'text-layer-original-vs-rerendered.png'), cmp.toBuffer('image/png'));
fs.writeFileSync(SESS + 'text-layer-original-vs-rerendered.png', cmp.toBuffer('image/png'));
console.log('Wrote comparison.');

// ---------- 2) edited full card with real font + wrapped abilities body ----------
const card = composeMinus(title);
const cx = card.getContext('2d');
// Edited title (same small-caps pattern, new words). New string: "IRONFIST WARLORD"
const editedStr = 'IRONFIST WARLORD';
// rebuild runs: initial cap of each word big, rest small (mirror PSD pattern)
function smallCapsRuns(str, bigSize, smallSize) {
  const runs = [];
  const words = str.split(/(\s+)/); // keep spaces
  for (const w of words) {
    if (/^\s+$/.test(w)) { runs.push({ text: w, size: smallSize }); continue; }
    if (w.length === 0) continue;
    runs.push({ text: w[0], size: bigSize });
    if (w.length > 1) runs.push({ text: w.slice(1), size: smallSize });
  }
  return runs;
}
drawRuns(cx, smallCapsRuns(editedStr, 45.83333, 37.5), baseX, baseY, titleFont, titleColor);

// ---- wrapped ABILITIES body text ----
// Detected inner black box ~ (37,808)-(664,968). Use padded text region inside it.
const BOX = { left: 37, top: 808, right: 664, bottom: 968 };
const TEXT_AREA = { x: BOX.left + 22, y: BOX.top + 16, w: (BOX.right - BOX.left) - 44 };
const romanName = 'Square721BT-RomanCondensed';
const bodySize = 21, lineH = 25;
const paragraph = 'Rallying Cry: At the start of your turn, all friendly INFANTRY units gain +5 ATTACK and +5 ACCURACY until end of turn. Ironfist Commander cannot be targeted by enemy abilities while at least two allied units remain on the field.';

function wrapText(ctx, text, maxW, fontName, size) {
  ctx.font = `${size}px "${fontName}"`;
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
cx.fillStyle = 'rgb(255,255,255)';
cx.textBaseline = 'top';
cx.font = `${bodySize}px "${romanName}"`;
const lines = wrapText(cx, paragraph, TEXT_AREA.w, romanName, bodySize);
let yy = TEXT_AREA.y;
for (const ln of lines) {
  if (yy + lineH > BOX.bottom - 6) break; // clip to box
  cx.fillText(ln, TEXT_AREA.x, yy);
  yy += lineH;
}
console.log(`Abilities box used: (${BOX.left},${BOX.top})-(${BOX.right},${BOX.bottom}); text area x=${TEXT_AREA.x} y=${TEXT_AREA.y} w=${TEXT_AREA.w}; ${lines.length} lines wrapped.`);

fs.writeFileSync(path.join(OUT, 'edited-realfont.png'), card.toBuffer('image/png'));
fs.writeFileSync(SESS + 'edited-realfont.png', card.toBuffer('image/png'));
// also a focused abilities-demo crop
const crop = createCanvas(psd.width, 260);
const cc = crop.getContext('2d');
cc.drawImage(card, 0, 720, psd.width, 300, 0, 0, psd.width, 300);
fs.writeFileSync(SESS + 'abilities-demo.png', crop.toBuffer('image/png'));
console.log('Wrote edited-realfont.png + abilities-demo.png');
