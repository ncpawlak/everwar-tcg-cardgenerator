// STORY-11 test (@vitest-environment jsdom) — the field panel is a pure function of
// the field config + seed values. Assert inputs are pre-filled, the abilities control
// is a textarea, an input event calls back with the right id/value, and wired through
// app state a burst of edits yields exactly one debounced redraw.
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createFieldPanel } from '../src/ui/fieldPanel';
import { createAppState } from '../src/state/appState';
import { EDITABLE_FIELDS } from '../src/config/editableLayers';

function seedValues(): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of EDITABLE_FIELDS) v[f.id] = f.id === 'abilities' ? 'Body text' : f.label;
  v['level'] = '4';
  return v;
}

describe('fieldPanel', () => {
  it('pre-fills every field control from the seed values', () => {
    const panel = createFieldPanel({
      fields: EDITABLE_FIELDS,
      seed: seedValues(),
      onInput: () => {},
    });
    document.body.appendChild(panel);
    // One control per field.
    for (const f of EDITABLE_FIELDS) {
      const ctrl = panel.querySelector(`[data-field-id="${f.id}"]`) as HTMLInputElement;
      expect(ctrl).toBeTruthy();
    }
    const level = panel.querySelector('[data-field-id="level"]') as HTMLInputElement;
    expect(level.value).toBe('4');
    // Abilities uses a textarea (multi-line).
    const abilities = panel.querySelector('[data-field-id="abilities"]') as HTMLTextAreaElement;
    expect(abilities.tagName).toBe('TEXTAREA');
    expect(abilities.value).toBe('Body text');
  });

  it('calls onInput with the field id and new value on input', () => {
    const onInput = vi.fn();
    const panel = createFieldPanel({ fields: EDITABLE_FIELDS, seed: seedValues(), onInput });
    document.body.appendChild(panel);
    const level = panel.querySelector('[data-field-id="level"]') as HTMLInputElement;
    level.value = '9';
    level.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).toHaveBeenCalledWith('level', '9');
  });

  it('wired to app state, a burst of edits triggers one debounced redraw', () => {
    vi.useFakeTimers();
    try {
      const state = createAppState(seedValues(), { debounceMs: 120 });
      const redraw = vi.fn();
      state.subscribe(redraw);
      const panel = createFieldPanel({
        fields: EDITABLE_FIELDS,
        seed: state.getAll(),
        onInput: (id, value) => state.set(id, value),
      });
      document.body.appendChild(panel);
      const level = panel.querySelector('[data-field-id="level"]') as HTMLInputElement;
      for (const val of ['5', '6', '7']) {
        level.value = val;
        level.dispatchEvent(new Event('input', { bubbles: true }));
      }
      expect(redraw).not.toHaveBeenCalled();
      vi.advanceTimersByTime(120);
      expect(redraw).toHaveBeenCalledTimes(1);
      expect(redraw).toHaveBeenCalledWith(expect.objectContaining({ level: '7' }));
    } finally {
      vi.useRealTimers();
    }
  });
});
