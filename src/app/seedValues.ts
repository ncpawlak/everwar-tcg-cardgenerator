// STORY-14 — Seed the flat value map from the extracted model. Layer-backed fields
// seed from their captured PSD text; the abilities block seeds SIX keys (name + body
// per slot) from the model's ordered abilities list. Shared by the composition root and
// tests so the value shape stays in one place.
import type { CardModel } from '../psd/types';
import { isAbilities } from '../psd/types';
import { ABILITY_SLOTS } from '../config/editableLayers';
import type { Values } from '../state/appState';

/** Build the initial value map (field id → text) from the model. */
export function seedValues(model: CardModel): Values {
  const values: Values = {};
  // Authored armor-bar count (STORY-15) rides the flat string store like every other
  // value; the draw path parses it back to an int. Seeded from the model default (8).
  values['armorBars'] = String(model.armorBars);
  for (const id of model.order) {
    const field = model.fields[id];
    if (isAbilities(field)) {
      // Fan the ordered abilities out into their two-key-per-slot representation.
      field.abilities.forEach((ability, i) => {
        const slot = ABILITY_SLOTS[i];
        if (!slot) return; // ignore any abilities beyond the 3 UI slots
        values[slot.nameKey] = ability.name;
        values[slot.bodyKey] = ability.body;
      });
      continue;
    }
    values[id] = field.text;
  }
  return values;
}
