// STORY-4 — Extract a typed, serializable CardModel from a parsed PSD by matching
// flattened layers against the editable allow-list (STORY-2). The abilities field is
// synthesized from config (no PSD layer). The title's per-run sizes come from
// `text.styleRuns` — NEVER collapse to a single `style.fontSize` (spike learning).
import type { Psd } from 'ag-psd';
import { flattenLayers } from './loadPsd';
import {
  EDITABLE_FIELDS,
  ABILITIES_FIELD,
  ABILITIES_BOX,
  ABILITIES_TEXT_AREA,
  type EditableField,
  type Rgb,
} from '../config/editableLayers';
import type {
  CardModel,
  FieldModel,
  LayerFieldModel,
  AbilitiesFieldModel,
  StyleRun,
} from './types';

/** Round an ag-psd fillColor to an integer 0–255 Rgb, defaulting to white. */
function toRgb(fill: { r?: number; g?: number; b?: number } | undefined): Rgb {
  if (!fill) return { r: 255, g: 255, b: 255 };
  return {
    r: Math.round(fill.r ?? 255),
    g: Math.round(fill.g ?? 255),
    b: Math.round(fill.b ?? 255),
  };
}

/** Map ag-psd styleRuns ({length, style:{fontSize}}) to our flat StyleRun[]. */
function toStyleRuns(runs: any[] | undefined): StyleRun[] {
  if (!runs) return [];
  return runs.map((r) => ({
    length: r.length,
    // Per-run size lives under run.style.fontSize (spike render-realfont.js).
    fontSize: r.style?.fontSize ?? 0,
  }));
}

/**
 * Build the CardModel. `fields` defaults to the config allow-list but is injectable
 * so tests can exercise the missing-layer error path with a bogus name.
 *
 * A named editable layer that is absent throws LOUDLY (spec: no silent skip).
 */
export function extractModel(
  psd: Psd,
  fields: EditableField[] = EDITABLE_FIELDS,
): CardModel {
  const flat = flattenLayers(psd);
  // Index text layers by name for O(1) allow-list matching.
  const byName = new Map<string, (typeof flat)[number]>();
  for (const l of flat) if (l.name) byName.set(l.name, l);

  const modelFields: Record<string, FieldModel> = {};
  const order: string[] = [];

  for (const field of fields) {
    order.push(field.id);

    if (field.kind === 'abilities') {
      // Synthesized from config — no PSD layer backs the abilities body.
      const abilities: AbilitiesFieldModel = {
        id: 'abilities',
        kind: 'abilities',
        text: ABILITIES_FIELD.defaultText,
        font: ABILITIES_FIELD.font,
        fontSize: ABILITIES_FIELD.fontSize,
        lineHeight: ABILITIES_FIELD.lineHeight,
        color: ABILITIES_FIELD.color,
        box: { ...ABILITIES_BOX },
        textArea: { ...ABILITIES_TEXT_AREA },
      };
      modelFields[field.id] = abilities;
      continue;
    }

    // Layer-backed field: locate the exact named layer or fail loudly.
    const layer = byName.get(field.layerName);
    if (!layer || !layer.text) {
      throw new Error(
        `extractModel: editable layer "${field.layerName}" (field id "${field.id}") ` +
          `not found or is not a text layer in the PSD.`,
      );
    }

    const t = layer.text;
    // ag-psd exposes the base run under text.style; per-run sizes under styleRuns.
    const style: any = (t as any).style ?? {};
    const fontName: string = style.font?.name ?? 'sans-serif';
    const fontSize: number = style.fontSize ?? 0;
    const transform = t.transform ?? [1, 0, 0, 1, layer.left ?? 0, layer.top ?? 0];

    const layerField: LayerFieldModel = {
      id: field.id,
      layerName: field.layerName,
      kind: field.kind,
      text: t.text ?? '',
      font: fontName,
      fontSize,
      color: toRgb(style.fillColor),
      justification: style.justification ?? 'left',
      styleRuns: toStyleRuns(t.styleRuns as any[]),
      // Baseline anchor: transform matrix translate components (e, f) = [4], [5].
      anchor: { x: transform[4], y: transform[5] },
      bounds: {
        left: layer.left ?? 0,
        top: layer.top ?? 0,
        right: layer.right ?? 0,
        bottom: layer.bottom ?? 0,
      },
    };
    modelFields[field.id] = layerField;
  }

  return {
    width: psd.width,
    height: psd.height,
    fields: modelFields,
    order,
  };
}
