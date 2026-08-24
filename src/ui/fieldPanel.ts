// STORY-11 — Field panel UI (plain DOM, no framework). Builds a labelled control per
// editable field from the config + seed values: single-line fields (and the title)
// get a text `<input>`; the abilities body gets a `<textarea>`. Input events call
// back with `(id, value)`; wiring to app state (debounce → redraw) is done by the
// composition root, keeping this component dumb.
import type { EditableField } from '../config/editableLayers';

/** Panel construction inputs. */
export interface FieldPanelDeps {
  /** Ordered editable field definitions (the allow-list). */
  fields: EditableField[];
  /** Initial value per field id. */
  seed: Record<string, string>;
  /** Called on every input event with the field id and its new value. */
  onInput: (id: string, value: string) => void;
}

/**
 * Build the field panel element. Each control carries `data-field-id` so the panel
 * can be queried deterministically (used by tests and the composition root).
 */
export function createFieldPanel(deps: FieldPanelDeps): HTMLElement {
  const { fields, seed, onInput } = deps;

  const panel = document.createElement('div');
  panel.className = 'field-panel';

  const heading = document.createElement('h2');
  heading.textContent = 'Card Fields';
  panel.appendChild(heading);

  for (const field of fields) {
    // Row wrapper with a label + control.
    const row = document.createElement('div');
    row.className = 'field-row';

    const label = document.createElement('label');
    label.textContent = field.label;
    label.htmlFor = `field-${field.id}`;
    row.appendChild(label);

    // Abilities is multi-line → textarea; everything else is a single-line input.
    const control: HTMLInputElement | HTMLTextAreaElement =
      field.kind === 'abilities'
        ? document.createElement('textarea')
        : document.createElement('input');
    if (control instanceof HTMLInputElement) control.type = 'text';
    if (control instanceof HTMLTextAreaElement) control.rows = 4;

    control.id = `field-${field.id}`;
    control.setAttribute('data-field-id', field.id);
    control.value = seed[field.id] ?? '';

    // Forward every edit up to the caller (no debounce here — that lives in state).
    control.addEventListener('input', () => onInput(field.id, control.value));

    row.appendChild(control);
    panel.appendChild(row);
  }

  return panel;
}
