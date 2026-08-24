// STORY-15 — Dynamic armor-bar config (single source of truth for its geometry,
// colours and the static-bake cover patch). The armor bar is an AUTHORED numeric
// control (`armorBars`, 0–8), NOT a PSD text layer — it is drawn dynamically over the
// baked background, replacing the PSD's fixed 8-segment art. All constants are in
// 690×1020 card coordinates and were MEASURED from `assets/Card_1.psd` (the Senior's
// spike `.project/architecture-log/2026-08-24-dynamic-armor-bar-spike.md`, refined by
// sampling the composite: the baked green occupies x599–628, y351–524).

/** Axis-aligned rectangle in card (690×1020) pixel coordinates. */
export interface ArmorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The bar HOUSING/track (the recessed channel that holds the segments). Height H=174.
 * The empty (N=0) recess and the olive inter-segment base are painted across this.
 */
export const ARMOR_BAR_TRACK: ArmorRect = { left: 599, top: 351, right: 629, bottom: 525 };

/**
 * The green FILL rect: 1px inset from the track's left so x=599 stays as a thin edge
 * rim, matching the baked art (sampled x599=(84,89,46) edge, x600=(200,239,98) bright).
 * The pure layout helper divides this vertically into N segments.
 */
export const ARMOR_BAR_FILL: ArmorRect = { left: 600, top: 351, right: 629, bottom: 525 };

/** Dark gap (px) between adjacent green segments (0 is used when N===1). */
export const ARMOR_BAR_GAP_PX = 2;

/** Product-approved maximum number of segments (user-locked). */
export const ARMOR_BARS_MAX = 8;

/** Default value — matches the current template's baked 8-segment art. */
export const ARMOR_BARS_DEFAULT = 8;

/**
 * Segment + track colours (CSS strings), sampled from the PSD composite. The green is
 * top-lit and left-beveled: a bright top edge → mid body → slightly darker bottom, plus
 * a bright left highlight column. Empty track is a dark recess with a subtle olive rim.
 */
export const ARMOR_BAR_COLORS = {
  /** Bright top highlight of a segment (sampled ~(194–202,233–242,95–99)). */
  segTop: 'rgb(202,242,99)',
  /** Mid body green (sampled ~(131–136,162–167,64–66)). */
  segMid: 'rgb(136,167,66)',
  /** Darker bottom edge/shadow of a segment. */
  segBottom: 'rgb(108,133,56)',
  /** Bright left-bevel highlight column (sampled x600=(200,239,98)). */
  segLeftHighlight: 'rgb(200,239,98)',
  /** Olive divider seen in the 2px gaps between segments (sampled (82,79,48)). */
  divider: 'rgb(82,79,48)',
  /** Empty-track outer recess (deepest). */
  emptyOuter: 'rgb(13,14,13)',
  /** Empty-track inner channel. */
  emptyInner: 'rgb(24,25,22)',
} as const;

/**
 * Static-bake cover for the PSD's baked green (measured bbox x599–628, y351–524). During
 * the one-time bake the fill channel is repainted with the empty-recess colour so no old
 * green survives; `drawArmorBar` then repaints the track on every live render (so this
 * patch is a belt-and-suspenders cover, and it is disabled for the fidelity baseline).
 * Kept strictly inside the track so the surrounding metallic housing/frame is untouched.
 */
export const ARMOR_BAR_PATCH: ArmorRect = { left: 599, top: 351, right: 629, bottom: 525 };
