// STORY-17 — Batch CLI: PURE output-filename helpers. Deriving a safe, deterministic PNG
// name from a card Name, and de-duplicating collisions with a numeric suffix. No fs here
// (the CLI does the writing); these are unit-tested in isolation.

/**
 * Sanitize a card Name into a filesystem-safe slug (no extension):
 *   - lowercase
 *   - every run of non-alphanumeric characters collapses to a single '-'
 *   - leading/trailing '-' trimmed
 * e.g. "Echo 2: Kodiak" → "echo-2-kodiak". A name that sanitizes to empty (e.g. all
 * punctuation) falls back to "card" so we never emit a nameless file.
 */
export function sanitizeCardName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric runs → single '-'
    .replace(/^-+|-+$/g, ''); // trim leading/trailing '-'
  return slug === '' ? 'card' : slug;
}

/**
 * Return a collision-free "<slug>.png" given the set of filenames already used, and RECORD
 * the chosen name in that set. The first use of a slug is bare ("goliath.png"); subsequent
 * collisions get "-2", "-3", … before the extension ("goliath-2.png"). Mutating the set as
 * we go keeps the whole batch deterministic in row order.
 */
export function uniqueFilename(slug: string, used: Set<string>): string {
  let candidate = `${slug}.png`;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${slug}-${n}.png`;
    n++;
  }
  used.add(candidate);
  return candidate;
}
