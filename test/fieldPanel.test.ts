// STORY-11 / STORY-14 test (@vitest-environment jsdom) — the field panel is a pure
// function of the field config + seed values. Assert single-line inputs are pre-filled,
// the abilities block expands into THREE ability rows (name input + body textarea each)
// pre-filled from the six slot keys, an input event calls back with the right id/value,
// and wiring through app state yields exactly one debounced redraw.
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createFieldPanel } from '../src/ui/fieldPanel';
import { createAppState } from '../src/state/appState';
import { EDITABLE_FIELDS, ABILITY_SLOTS } from '../src/config/editableLayers';

function seedValues(): Record<string, string> {
  const v: Record<string, string> = {};
  // Seed the 9 layer-backed fields by id.
  for (const f of EDITABLE_FIELDS) if (f.kind !== 'abilities') v[f.id] = f.label;
  v['level'] = '4';
  // Seed the six ability slot keys (first slot filled, rest blank).
  v['ability1-name'] = 'Rallying Cry';
  v['ability1-body'] = 'Body text one';
  return v;
}

describe('fieldPanel', () => {
  it('pre-fills every single-line control from the seed values', () => {
    const panel = createFieldPanel({
      fields: EDITABLE_FIELDS,
      seed: seedValues(),
      onInput: () => {},
    });
    document.body.appendChild(panel);
    // One control per non-abilities field.
    for (const f of EDITABLE_FIELDS) {
      if (f.kind === 'abilities') continue;
      const ctrl = panel.querySelector(`[data-field-id="${f.id}"]`) as HTMLInputElement;
      expect(ctrl).toBeTruthy();
    }
    const level = panel.querySelector('[data-field-id="level"]') as HTMLInputElement;
    expect(level.value).toBe('4');
  });

  it('renders three ability rows: a NAME input + BODY textarea per slot', () => {
    const panel = createFieldPanel({
      fields: EDITABLE_FIELDS,
      seed: seedValues(),
      onInput: () => {},
    });
    document.body.appendChild(panel);
    // There must be exactly three ability slots wired.
    expect(ABILITY_SLOTS).toHaveLength(3);
    for (const slot of ABILITY_SLOTS) {
      const name = panel.querySelector(`[data-field-id="${slot.nameKey}"]`) as HTMLInputElement;
      const body = panel.querySelector(`[data-field-id="${slot.bodyKey}"]`) as HTMLTextAreaElement;
      expect(name).toBeTruthy();
      expect(name.tagName).toBe('INPUT');
      expect(body).toBeTruthy();
      expect(body.tagName).toBe('TEXTAREA');
    }
    // First slot is pre-filled from the seed.
    const n1 = panel.querySelector('[data-field-id="ability1-name"]') as HTMLInputElement;
    const b1 = panel.querySelector('[data-field-id="ability1-body"]') as HTMLTextAreaElement;
    expect(n1.value).toBe('Rallying Cry');
    expect(b1.value).toBe('Body text one');
    // Empty slots render blank.
    const n2 = panel.querySelector('[data-field-id="ability2-name"]') as HTMLInputElement;
    expect(n2.value).toBe('');
    // No single "abilities" control remains.
    expect(panel.querySelector('[data-field-id="abilities"]')).toBeNull();
  });

  it('renders an armor-bars number input (0–8) that clamps out-of-range input (STORY-15)', () => {
    const onInput = vi.fn();
    const panel = createFieldPanel({ fields: EDITABLE_FIELDS, seed: seedValues(), onInput });
    document.body.appendChild(panel);
    const bars = panel.querySelector('[data-field-id="armorBars"]') as HTMLInputElement;
    expect(bars).toBeTruthy();
    expect(bars.tagName).toBe('INPUT');
    expect(bars.type).toBe('number');
    expect(bars.min).toBe('0');
    expect(bars.max).toBe('8');
    // Over-range input is clamped to the max before it reaches state.
    bars.value = '99';
    bars.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).toHaveBeenCalledWith('armorBars', '8');
    // Non-integer is floored; negative clamps to 0.
    bars.value = '3.9';
    bars.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).toHaveBeenCalledWith('armorBars', '3');
    bars.value = '-5';
    bars.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).toHaveBeenCalledWith('armorBars', '0');
  });

  it('calls onInput with the field id and new value on input (layer field + ability)', () => {
    const onInput = vi.fn();
    const panel = createFieldPanel({ fields: EDITABLE_FIELDS, seed: seedValues(), onInput });
    document.body.appendChild(panel);
    const level = panel.querySelector('[data-field-id="level"]') as HTMLInputElement;
    level.value = '9';
    level.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).toHaveBeenCalledWith('level', '9');

    const body = panel.querySelector('[data-field-id="ability2-body"]') as HTMLTextAreaElement;
    body.value = 'Last Stand text';
    body.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).toHaveBeenCalledWith('ability2-body', 'Last Stand text');
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
