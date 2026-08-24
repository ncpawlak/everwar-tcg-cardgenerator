// FIX-2 — Live-preview wiring extracted from the composition root so it can be
// integration-tested (edit → debounce → one text-only re-render) with a stubbed
// renderer and fake timers. This owns the edit loop: build the field panel, push edits
// into app state, and (on start) subscribe a debounced redraw. It never re-parses the
// PSD or re-bakes the background — only the render step re-runs (spec §4.3, §5).
import { renderCard as defaultRenderCard } from '../render/renderCard';
import { createAppState, type AppState, type Values } from '../state/appState';
import { createFieldPanel } from '../ui/fieldPanel';
import type { Ctx2D } from '../render/drawText';
import type { BackgroundSource } from '../render/renderCard';
import type { CardModel } from '../psd/types';
import type { EditableField } from '../config/editableLayers';

/** Renderer signature — the real `renderCard`, or a spy in tests. */
export type RenderFn = (
  ctx: Ctx2D,
  background: BackgroundSource,
  model: CardModel,
  values: Values,
) => void;

/** Inputs for wiring the live-preview edit loop. */
export interface LivePreviewDeps {
  /** Ordered editable field definitions (the allow-list). */
  fields: EditableField[];
  /** Initial value per field id (seeded from the model). */
  seed: Values;
  /** The card model (passed through to the renderer). */
  model: CardModel;
  /** The pre-baked static background (passed through to the renderer). */
  background: BackgroundSource;
  /** Debounce window for coalescing keystrokes (ms). */
  debounceMs?: number;
  /** Injectable renderer (defaults to renderCard) for testing the wiring. */
  render?: RenderFn;
}

/** The wired pieces the composition root needs. */
export interface LivePreview {
  /** The field panel element to mount into the layout. */
  panel: HTMLElement;
  /** The underlying app state (exposed for completeness / testing). */
  state: AppState;
  /** Perform the first render and subscribe debounced updates, given the 2D context. */
  start(ctx: Ctx2D): void;
}

/**
 * Wire the edit loop. The panel is built immediately (so the caller can mount it into
 * the layout), but rendering is deferred to `start(ctx)` because the 2D context only
 * exists after the layout is mounted.
 */
export function createLivePreview(deps: LivePreviewDeps): LivePreview {
  const render = deps.render ?? defaultRenderCard;
  const state = createAppState(deps.seed, { debounceMs: deps.debounceMs });

  // Edits flow straight into state; debounce lives in state, not the UI.
  const panel = createFieldPanel({
    fields: deps.fields,
    seed: deps.seed,
    onInput: (id, value) => state.set(id, value),
  });

  return {
    panel,
    state,
    start(ctx: Ctx2D): void {
      // The ONLY thing that re-runs on an edit: redraw editable text over the cache.
      const draw = (values: Values): void => render(ctx, deps.background, deps.model, values);
      draw(state.getAll()); // first render
      state.subscribe(draw); // debounced live updates
    },
  };
}
