// STORY-11 / STORY-14 — Field panel UI (plain DOM, no framework). Builds a labelled
// control per editable field from the config + seed values: single-line fields (and the
// title) get a text `<input>`; the abilities block expands into THREE ability rows, each
// with a NAME `<input>` and a BODY `<textarea>` wired to its two slot keys. Input events
// call back with `(id, value)`; wiring to app state (debounce → redraw) is done by the
// composition root, keeping this component dumb.
import type { EditableField } from '../config/editableLayers';
import { ABILITY_SLOTS } from '../config/editableLayers';

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
    // Abilities expands into three ability rows (name input + body textarea each),
    // written to the six flat slot keys — not a single control keyed by field.id.
    if (field.kind === 'abilities') {
      appendAbilityRows(panel, seed, onInput);
      continue;
    }

    // Row wrapper with a label + control.
    const row = document.createElement('div');
    row.className = 'field-row';

    const label = document.createElement('label');
    label.textContent = field.label;
    label.htmlFor = `field-${field.id}`;
    row.appendChild(label);

    // Every non-abilities field is a single-line text input.
    const control = document.createElement('input');
    control.type = 'text';

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

/**
 * Append the three structured ability rows. Each slot gets a NAME `<input>` and a BODY
 * `<textarea>`, each carrying its own `data-field-id` (the slot key) and wired to the
 * caller. Labels read "Ability N name" / "Ability N text".
 */
function appendAbilityRows(
  panel: HTMLElement,
  seed: Record<string, string>,
  onInput: (id: string, value: string) => void,
): void {
  const heading = document.createElement('h3');
  heading.textContent = 'Abilities (up to 3)';
  panel.appendChild(heading);

  for (const slot of ABILITY_SLOTS) {
    // Name (bold prefix) — single-line input.
    const nameRow = document.createElement('div');
    nameRow.className = 'field-row';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = `${slot.label} name`;
    nameLabel.htmlFor = `field-${slot.nameKey}`;
    nameRow.appendChild(nameLabel);
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = `field-${slot.nameKey}`;
    nameInput.setAttribute('data-field-id', slot.nameKey);
    nameInput.value = seed[slot.nameKey] ?? '';
    nameInput.addEventListener('input', () => onInput(slot.nameKey, nameInput.value));
    nameRow.appendChild(nameInput);
    panel.appendChild(nameRow);

    // Body — multi-line textarea.
    const bodyRow = document.createElement('div');
    bodyRow.className = 'field-row';
    const bodyLabel = document.createElement('label');
    bodyLabel.textContent = `${slot.label} text`;
    bodyLabel.htmlFor = `field-${slot.bodyKey}`;
    bodyRow.appendChild(bodyLabel);
    const bodyArea = document.createElement('textarea');
    bodyArea.rows = 3;
    bodyArea.id = `field-${slot.bodyKey}`;
    bodyArea.setAttribute('data-field-id', slot.bodyKey);
    bodyArea.value = seed[slot.bodyKey] ?? '';
    bodyArea.addEventListener('input', () => onInput(slot.bodyKey, bodyArea.value));
    bodyRow.appendChild(bodyArea);
    panel.appendChild(bodyRow);
  }
}
