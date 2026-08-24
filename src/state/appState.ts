// STORY-10 — App state: the current text value per field id, seeded from the
// extracted model. `set` updates the value synchronously and notifies subscribers on
// a DEBOUNCED schedule (~120 ms) so a burst of keystrokes triggers a single redraw.
// Debounce lives here (not in the UI) so the UI stays dumb and only stage-3 render
// re-runs on edits (spec §5) — never a re-parse or re-bake.

/** Read-only snapshot of all field values. */
export type Values = Record<string, string>;

/** Subscriber callback receiving the latest values. */
export type Subscriber = (values: Values) => void;

/** The app state API. */
export interface AppState {
  get(id: string): string | undefined;
  getAll(): Values;
  set(id: string, value: string): void;
  subscribe(cb: Subscriber): () => void;
}

/** Options (debounce window is injectable for tests / tuning). */
export interface AppStateOptions {
  debounceMs?: number;
}

/**
 * Create an app-state store seeded with `initial` values.
 */
export function createAppState(initial: Values, opts: AppStateOptions = {}): AppState {
  const debounceMs = opts.debounceMs ?? 120;
  // Clone the seed so external mutation of the input can't leak in.
  const values: Values = { ...initial };
  const subscribers = new Set<Subscriber>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** Fire all subscribers with a fresh snapshot. */
  function notify(): void {
    const snapshot = { ...values };
    for (const cb of subscribers) cb(snapshot);
  }

  /** (Re)start the debounce timer so bursts collapse into one notification. */
  function scheduleNotify(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      notify();
    }, debounceMs);
  }

  return {
    get: (id) => values[id],
    getAll: () => ({ ...values }),
    set(id, value) {
      // Update synchronously so `get` is always current; notify debounced.
      values[id] = value;
      scheduleNotify();
    },
    subscribe(cb) {
      subscribers.add(cb);
      // Return an unsubscribe handle.
      return () => {
        subscribers.delete(cb);
      };
    },
  };
}
