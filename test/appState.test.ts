// STORY-10 test — app state seeds from the model, debounces rapid `set` calls into a
// single notification, delivers the latest values, and supports unsubscribe.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAppState } from '../src/state/appState';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('appState', () => {
  it('initial state equals the seed values', () => {
    const state = createAppState({ name: 'IRONFIST COMMANDER', level: '4' });
    expect(state.get('name')).toBe('IRONFIST COMMANDER');
    expect(state.getAll()).toEqual({ name: 'IRONFIST COMMANDER', level: '4' });
  });

  it('collapses rapid sets into a single debounced notification with latest value', () => {
    const state = createAppState({ level: '4' }, { debounceMs: 120 });
    const cb = vi.fn();
    state.subscribe(cb);

    state.set('level', '5');
    state.set('level', '6');
    state.set('level', '7');
    // Before the debounce window elapses: no notification yet.
    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(120);
    expect(cb).toHaveBeenCalledTimes(1);
    // The single callback carries the latest value.
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ level: '7' }));
    // The synchronous getter reflects the latest value immediately.
    expect(state.get('level')).toBe('7');
  });

  it('unsubscribe stops further notifications', () => {
    const state = createAppState({ hp: '40' }, { debounceMs: 100 });
    const cb = vi.fn();
    const unsub = state.subscribe(cb);
    state.set('hp', '41');
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();
    state.set('hp', '42');
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledTimes(1); // no further calls
  });
});
