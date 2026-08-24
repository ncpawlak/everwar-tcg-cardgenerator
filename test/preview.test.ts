// FIX-3 test (@vitest-environment jsdom) — smoke test for the preview shell builder:
// buildLayout must assemble the app shell and a native 690×1020 canvas exposing a 2D
// context. jsdom has no real canvas backend, so getContext is stubbed to return a
// minimal 2D-context stand-in (this test only asserts wiring + dimensions).
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildLayout } from '../src/ui/preview';

let getContextSpy: ReturnType<typeof vi.spyOn> | undefined;

beforeEach(() => {
  // Return a truthy fake 2D context so buildLayout succeeds under jsdom.
  getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue({ fake2d: true } as unknown as CanvasRenderingContext2D) as unknown as ReturnType<
    typeof vi.spyOn
  >;
});

afterEach(() => {
  getContextSpy?.mockRestore();
});

describe('buildLayout', () => {
  it('builds the shell + a 690×1020 canvas with a 2D context', () => {
    const root = document.createElement('div');
    const panel = document.createElement('div');
    panel.className = 'field-panel';

    const layout = buildLayout(root, 690, 1020, panel);

    // Shell + two columns present.
    expect(root.querySelector('.app-shell')).toBeTruthy();
    expect(root.querySelector('.preview-col')).toBeTruthy();
    expect(root.querySelector('.panel-col')).toBeTruthy();
    // The panel is mounted into the right column.
    expect(root.querySelector('.panel-col .field-panel')).toBe(panel);

    // Native card resolution.
    expect(layout.canvas.width).toBe(690);
    expect(layout.canvas.height).toBe(1020);
    // A 2D context and the export controls are returned.
    expect(layout.ctx).toBeTruthy();
    expect(getContextSpy).toHaveBeenCalledWith('2d', { alpha: true });
    expect(layout.exportButton.tagName).toBe('BUTTON');
    expect(layout.statusEl).toBeTruthy();
  });
});
