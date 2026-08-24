// STORY-3 test — parse the real Card_1.psd in Node (ag-psd + napi canvas) and
// assert document dimensions, the flattened leaf-layer count (spike inventory: 29),
// document order, and that the `Name text` layer exposes text-engine data.
import { describe, it, expect, beforeAll } from 'vitest';
import { readPsdBuffer, flattenLayers } from '../src/psd/loadPsd';
import { setupNapiCanvas, readCardPsdBuffer } from './helpers/napiCanvas';

beforeAll(() => setupNapiCanvas());

describe('loadPsd', () => {
  it('parses Card_1.psd to a 690×1020 document', () => {
    const psd = readPsdBuffer(readCardPsdBuffer());
    expect(psd.width).toBe(690);
    expect(psd.height).toBe(1020);
  });

  it('flattenLayers returns the 29 leaf layers in document order', () => {
    const psd = readPsdBuffer(readCardPsdBuffer());
    const flat = flattenLayers(psd);
    expect(flat).toHaveLength(29);
    // Document order: Background is first (bottom), the icons are last (top).
    expect(flat[0].name).toBe('Background');
    expect(flat[flat.length - 1].name).toBe('1 Icon');
  });

  it('exposes text-engine data on the Name text layer and a bitmap on drawn layers', () => {
    const psd = readPsdBuffer(readCardPsdBuffer());
    const flat = flattenLayers(psd);
    const title = flat.find((l) => l.name === 'Name text');
    expect(title).toBeDefined();
    expect(title!.text).toBeDefined();
    expect(title!.text!.text).toContain('IRONFIST');
    // A visible drawn layer exposes its rasterized canvas.
    const frame = flat.find((l) => l.name === 'Frame 1');
    expect(frame!.canvas).toBeDefined();
  });
});
