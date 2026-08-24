// STORY-16 — Dynamic COMMANDER / UNIQUE chip config (single source of truth for the two
// hide rects + the donor strip). The chips are baked pill art in the broad raster
// `Layer 3` PLUS separate PSD text layers, so they cannot be hidden by skipping a layer.
// Instead we PATCH over each chip's rect at render time by reconstructing the rail from a
// stable no-chip donor strip on the same rows (Senior spike
// `.project/architecture-log/2026-08-24-dynamic-chips-spike.md`). All rects are in card
// (690×1020) pixel coordinates, measured from the PSD.

/** Axis-aligned rectangle in card (690×1020) pixel coordinates. */
export interface ChipRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * COMMANDER pill footprint (border + fill + text). Stops at y=728, above the INFANTRY /
 * faction tag row (which begins ~y736), so hiding it never disturbs the row below.
 */
export const COMMANDER_CHIP_RECT: ChipRect = { left: 52, top: 686, right: 222, bottom: 728 };

/** UNIQUE pill footprint. Meets the COMMANDER rect near the inter-chip seam without
 * overlapping the visible neighbour's body, so either chip hides independently. */
export const UNIQUE_CHIP_RECT: ChipRect = { left: 220, top: 687, right: 370, bottom: 728 };

/**
 * A stable no-chip donor strip on the right of the same rail. For each target row we take
 * the median RGBA of x=380..499 at that y and fill the row with it — preserving the rail's
 * horizontal bevel/gradient while avoiding copied diagonals/ornaments from neighbour caps.
 */
export const CHIP_DONOR_STRIP = { left: 380, right: 500 } as const;
