import fs from 'fs';
const d = JSON.parse(fs.readFileSync('spike/layer-inventory.json', 'utf8'));
let i = 0;
for (const l of d.layers) {
  if (l.isText) {
    i++;
    const content = (l.text && l.text.content ? l.text.content : '').replace(/\r?\n/g, ' / ');
    console.log(`${i}. layer name: "${l.name}"  |  text: "${content}"`);
  }
}
