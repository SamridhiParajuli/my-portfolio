// Deterministic layout math for the photo-particle animation.
//
// Coordinate system: normalized space where x spans [-1, 1] across the full
// width of the animation container and y spans [0, 1] across its full
// height. Pixel positions are derived from these at render time by the
// component, so the same layout scales responsively with the container.
//
// Behavior (matches the stanzza.design reference): each photo starts in one
// of two loose rows, then all 20 converge into a single precise row. Every
// tile keeps roughly the same column throughout — only the row it sits in
// changes — so the motion reads as "two rows merging into one" rather than
// particles flying in from scattered, unrelated positions. A phone held
// upright gets a three-row block instead (GRID_* below).

export type RowPoint = {
  x: number;
  y: number;
  rotation: number;
  scale: number;
};

export type ScatterPoint = RowPoint & { opacity: number };

const PHOTO_COUNT = 20;

export const PHOTOS: string[] = Array.from(
  { length: PHOTO_COUNT },
  (_, i) => `/images/tiny-pictures/image${i + 1}.jpeg`
);

// Small seeded PRNG (mulberry32) so the "randomness" is reproducible instead
// of shifting on every reload.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(1337);
const range = (min: number, max: number) => min + rng() * (max - min);

// --- Final composition: a single, precise horizontal row ---
const ROW_HALF_SPAN = 0.9;
const ROW_Y = 0.66;

export const ROW_TARGETS: RowPoint[] = Array.from(
  { length: PHOTO_COUNT },
  (_, i) => ({
    x: -ROW_HALF_SPAN + (i / (PHOTO_COUNT - 1)) * (2 * ROW_HALF_SPAN),
    y: ROW_Y,
    rotation: range(-1.5, 1.5),
    scale: range(0.96, 1.04),
  })
);

// --- Initial state: the same 20 columns split into two tidy rows ---
// Kept close to the final row's own column/rotation/scale so the two rows
// read as neat and intentional (matching the reference) rather than a messy
// scatter — the only strong displacement is the vertical row offset.
const BAND_OFFSET = 0.22;

export const SCATTER_POINTS: ScatterPoint[] = ROW_TARGETS.map((target, i) => {
  const band = i % 2 === 0 ? -1 : 1;

  return {
    x: target.x + range(-0.008, 0.008),
    y: ROW_Y + band * BAND_OFFSET + range(-0.015, 0.015),
    rotation: range(-3, 3),
    scale: range(0.94, 1.06),
    opacity: range(0.88, 1),
  };
});

// --- On a phone held upright: three rows instead of one ---
// Twenty photos in one row across a phone leaves each a few px wide, so
// there they settle into a block of three rows (7, 6, 7), the middle one set
// half a column in like courses of brick. Generated after everything above
// so the shared PRNG gives the desktop row exactly the values it always had.

/** Kept in step with the media query in PhotoLaptopAnimation.module.css. */
export const PHONE_QUERY = "(max-width: 767px) and (orientation: portrait)";

const GRID_ROWS = [7, 6, 7];
// In tile widths, matching the CSS: a tile's height, and the gap between
// neighbors. On a phone the wrapper is exactly the block's own box.
const GRID_TILE_H = 1.4;
const GRID_GAP = 0.2;
const GRID_COLS = Math.max(...GRID_ROWS);
const GRID_W = GRID_COLS * (1 + GRID_GAP) - GRID_GAP;
const GRID_H = GRID_ROWS.length * (GRID_TILE_H + GRID_GAP) - GRID_GAP;

export const GRID_TARGETS: RowPoint[] = GRID_ROWS.flatMap((count, row) => {
  const inset = ((GRID_COLS - count) / 2) * (1 + GRID_GAP);
  const y = (row * (GRID_TILE_H + GRID_GAP) + GRID_TILE_H / 2) / GRID_H;
  return Array.from({ length: count }, (_, col) => ({
    x: (2 * (inset + col * (1 + GRID_GAP) + 0.5)) / GRID_W - 1,
    y,
    rotation: range(-1.5, 1.5),
    scale: range(0.97, 1.03),
  }));
});

// Same idea as the desktop start: each row begins as two loose half-rows
// (alternate photos lifted and dropped) that merge into one.
const GRID_BAND_OFFSET = (0.2 * GRID_TILE_H) / GRID_H;

export const GRID_SCATTER: ScatterPoint[] = GRID_TARGETS.map((target, i) => {
  const band = i % 2 === 0 ? -1 : 1;

  return {
    x: target.x + range(-0.008, 0.008),
    y: target.y + band * GRID_BAND_OFFSET + range(-0.01, 0.01),
    rotation: range(-3, 3),
    scale: range(0.94, 1.06),
    opacity: range(0.88, 1),
  };
});
