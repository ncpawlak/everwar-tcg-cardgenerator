// Frame-patch constants for the baked background.
//
// The card's PSD ships a baked "ABILITIES" banner (tab + chevron + the word
// "ABILITIES") that we DON'T want in the generator, because the abilities body is an
// authored, editable field. The Senior's spike (spike/patch3.js) proved the banner
// sits ENTIRELY inside the black abilities-box interior — below the gold top border
// (y≈768–770) and right of the box left border (x≈30–32) — so removing it is just a
// flat opaque-black fillRect over its footprint. No donor sampling, no border
// reconstruction, and it cannot touch the INFANTRY/IRONWARD/HUMAN tag row (which sits
// ABOVE that border), so there is no visible seam (black-on-black).

/** An axis-aligned rectangle in card (690×1020) pixel coordinates. */
export interface PatchRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Footprint of the baked ABILITIES banner (tab + chevron + "ABILITIES" label),
 * measured from the PSD in the spike (spike/patch3.js). Interior-only: kept strictly
 * below the box top border (y≥771) and right of the left border (x≥33) so the gold
 * frame and the tag row above it are never overpainted.
 */
export const ABILITIES_BADGE_PATCH: PatchRect = {
  left: 33,
  top: 771,
  right: 254,
  bottom: 816,
};
