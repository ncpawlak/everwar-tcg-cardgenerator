// FIX-2 test (@vitest-environment jsdom) — integration test of the composition-root
// wiring extracted into createLivePreview: a field edit must flow input → app state →
// (debounced) → exactly ONE re-render, and nothing is re-parsed or re-baked. The
// renderer is injected as a spy and the debounce is driven with fake timers.
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createLivePreview } from '../src/app/livePreview';
import { EDITABLE_FIELDS } from '../src/config/editableLayers';

function seedValues(): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of EDITABLE_FIELDS) v[f.id] = f.id === 'abilities' ? 'Body' : f.label;
  v['level'] = '4';
  return v;
}

describe('createLivePreview (composition wiring)', () => {
  it('renders once on start and once per debounced edit — text-only re-render', () => {
    vi.useFakeTimers();
    try {
      const render = vi.fn();
      const seed = seedValues();
      const model = { width: 690, height: 1020, fields: {}, order: [] } as any;
      const background = { marker: 'bg' } as any;
      const ctx = { marker: 'ctx' } as any;

      const live = createLivePreview({
        fields: EDITABLE_FIELDS,
        seed,
        model,
        background,
        debounceMs: 120,
        render,
      });
      document.body.appendChild(live.panel);

      // start() performs the first render with the injected ctx/background/model.
      live.start(ctx);
      expect(render).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenLastCalledWith(ctx, background, model, expect.objectContaining({ level: '4' }));
      render.mockClear();

      // A burst of keystrokes on one field collapses into a single debounced render.
      const level = live.panel.querySelector('[data-field-id="level"]') as HTMLInputElement;
      for (const val of ['5', '6', '7']) {
        level.value = val;
        level.dispatchEvent(new Event('input', { bubbles: true }));
      }
      expect(render).not.toHaveBeenCalled();
      vi.advanceTimersByTime(120);
      expect(render).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenLastCalledWith(ctx, background, model, expect.objectContaining({ level: '7' }));
    } finally {
      vi.useRealTimers();
    }
  });
});
