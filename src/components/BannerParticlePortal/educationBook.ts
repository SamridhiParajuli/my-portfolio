/**
 * educationBook
 * -------------
 * Where the journey turns into the Education section. The last project has
 * thinned away and the camera has glided to rest deep inside the hole; then
 * one mote of the universe comes loose and falls, and the matter around it
 * follows it down and builds -- grain by grain, out of nothing but that
 * matter -- a closed, heavy, antique leather book, which settles and floats
 * in the middle of the same space. The universe stays, dimmed, behind it.
 *
 * `e` (0..1) is how far the book has come into being. It is the scroll, but
 * eased by the caller so that it can never outrun what reads as a slow,
 * physical accretion. At e = 0 this module draws nothing and takes nothing
 * from the universe, so the frame before the Education leg is exactly the
 * frame the journey has always ended on.
 *
 * In order, in e:
 *   0.00  one real mote of the interior medium, high in frame, gathers
 *         itself: it brightens and warms where it is;
 *   0.04  it breaks away and falls, slowly, toward the middle of frame;
 *   0.07  the motes nearest it lean toward it, then orbit it, and dust too
 *         faint to have been seen is drawn in out of the dark behind them;
 *   0.20  the swirl tightens onto the book's shape, and the first grains
 *         land on its silhouette and edges -- a book drawn in light;
 *   0.30  its faces fill in wherever grains strike. Each leaves leather
 *         where it lands, hot for a moment, then cooling to brown;
 *   0.66  the seed reaches the middle, and sinks into the cover;
 *   0.92  the last grains land, the surface closes, the heat goes out;
 *   1.00  a closed book, floating. It stays closed until it is clicked;
 *         opening it is bookOpening's, which takes over from here.
 *
 * There is no frame at which the book appears. Until a grain has landed on
 * a point of its surface, that point is not there.
 */

import {
  SPACE_BG,
  blitGlow,
  viewInteriorMote,
  type JourneyWorld,
} from "./blackHoleJourney";
import { createBookArt, type BookArt, type BookArtJob } from "./antiqueBook";

/* ------------------------------------------------------------------ *
 * Tuning
 * ------------------------------------------------------------------ */

/** Book height against the viewport, bounded by its width. */
const BOOK_H_FRAC = 0.47;
const BOOK_W_FRAC = 0.6;
const BOOK_W_FRAC_SMALL = 0.74;
/** How many grains build it. */
const TARGETS = 1400;
const TARGETS_SMALL = 740;
/** Motes that are drawn in but never land -- they stay, circling it. */
const HALO = 36;
const HALO_SMALL = 18;
/** Real motes of the medium taken to build it, at most. */
const TAKEN = 90;
const TAKEN_SMALL = 48;
/** Resize tolerance before the book is repainted rather than rescaled. */
const REPAINT_AT = 0.12;

/** Where the seed is looked for (fractions of the frame), and where the
 *  book comes to rest. */
const SEED_AT = [0.5, 0.16] as const;
const REST_AT = [0.5, 0.5] as const;

/** How far the universe behind is dimmed once the book is there. It is
 *  never put out: the book is in the same space, not on a new page. */
const VEIL = 0.4;

/** Splat radius, in grain spacings, and how far splats spread as the
 *  surface closes. */
const SPLAT_K = 1.9;
const SPLAT_CLOSE = 2.1;
/** Resolution of the coverage mask, per CSS px. */
const MASK_S = 1;

/* ------------------------------------------------------------------ *
 * Colour (all through the journey's own sprite bank)
 * ------------------------------------------------------------------ */

const WARM = [255, 232, 198] as const;
const HOT = [255, 214, 176] as const;
const EMBER = [206, 138, 96] as const;
/** The medium's own colours at this depth, for the dust it gives up. */
const DUST = [
  [206, 166, 210],
  [174, 154, 234],
  [226, 180, 162],
  [190, 172, 236],
  [238, 200, 178],
  [160, 150, 226],
] as const;
// Palette slots.
const P_WARM = 0;
const P_HOT = 1;
const P_EMBER = 2;
const P_DUST = 3;

/* ------------------------------------------------------------------ */

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function span(x: number, a: number, b: number) {
  return clamp((x - a) / (b - a), 0, 1);
}

function easeInOutCubic(x: number) {
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */

type Grain = {
  /** The interior mote it was, or -1 for dust out of the dark. */
  mote: number;
  /** Where it starts from, CSS px -- for a mote, where it was last seen. */
  sx: number;
  sy: number;
  /** Its look out there (motes: as last seen). */
  a0: number;
  r0: number;
  /** Its place on the book (index into the art's targets), or -1 for one
   *  that never lands and stays circling. */
  target: number;
  /** When, in e, it is drawn in, and for how long. */
  b: number;
  d: number;
  /** Radians it winds round the seed on the way in. */
  turn: number;
  /** The orbit's flattening where it starts: a disc seen at an angle. */
  sq0: number;
  /** Halo only: its orbit round the finished book. */
  orbR: number;
  orbPh: number;
  orbW: number;
  /** Colour slot out there. */
  pal: number;
  /** Where it was last frame, for its streak. */
  px: number;
  py: number;
};

export type EduBook = {
  art: BookArt | null;
  job: BookArtJob | null;
  /** Book height wanted for this viewport, CSS px. */
  bookPx: number;
  /** Device px per CSS px the art is painted at. */
  res: number;
  cssW: number;
  cssH: number;
  small: boolean;
  /** Sprite index for each palette slot, in the current world's bank. */
  pal: number[];
  /** Taken out of the universe (the seed first), so they can be handed
   *  back -- and re-taken from a rebuilt world. */
  cued: boolean;
  taken: number[];
  seed: number;
  seedX: number;
  seedY: number;
  seedA: number;
  seedR: number;
  seedPx: number;
  seedPy: number;
  side: number;
  grains: Grain[];
  /** Per-frame scratch: each grain's position, and which are in front. */
  pos: Float32Array;
  front: Int32Array;
  /** Grain spacing on the book, CSS px. */
  spacing: number;
  mask: HTMLCanvasElement | null;
  layer: HTMLCanvasElement | null;
  splat: HTMLCanvasElement | null;
  idle: number;
  idleKind: "idle" | "timeout" | null;
};

export function createEduBook(): EduBook {
  return {
    art: null,
    job: null,
    bookPx: 0,
    res: 1,
    cssW: 0,
    cssH: 0,
    small: false,
    pal: [],
    cued: false,
    taken: [],
    seed: -1,
    seedX: 0,
    seedY: 0,
    seedA: 0,
    seedR: 0,
    seedPx: 0,
    seedPy: 0,
    side: 1,
    grains: [],
    pos: new Float32Array(0),
    front: new Int32Array(0),
    spacing: 8,
    mask: null,
    layer: null,
    splat: null,
    idle: 0,
    idleKind: null,
  };
}

/* ------------------------------------------------------------------ *
 * Layout, and painting the book in idle time
 * ------------------------------------------------------------------ */

/**
 * Called whenever the journey's world is rebuilt. Re-takes whatever the
 * book had already taken from the old world, picks the new bank's sprites,
 * and makes sure a book of the right size is (being) painted.
 */
export function layoutEduBook(
  b: EduBook,
  w: JourneyWorld,
  cssW: number,
  cssH: number,
  small: boolean
) {
  b.cssW = cssW;
  b.cssH = cssH;
  b.small = small;
  b.pal = [
    w.bank.index(WARM[0], WARM[1], WARM[2]),
    w.bank.index(HOT[0], HOT[1], HOT[2]),
    w.bank.index(EMBER[0], EMBER[1], EMBER[2]),
    ...DUST.map((c) => w.bank.index(c[0], c[1], c[2])),
  ];
  for (const i of b.taken) {
    if (i < w.claimed.length) w.claimed[i] = 1;
  }
  b.bookPx = Math.round(
    Math.min(cssH * BOOK_H_FRAC, cssW * (small ? BOOK_W_FRAC_SMALL : BOOK_W_FRAC))
  );
  b.res = Math.min(window.devicePixelRatio || 1, 1.75);

  const have = b.job?.bookPx ?? 0;
  // A book half-built keeps the art it is being built of: a phone's toolbar
  // resizing the page must not swap its grains' targets from under them.
  if (b.cued && b.art) return;
  if (have && Math.abs(have - b.bookPx) / b.bookPx < REPAINT_AT) return;
  cancelIdle(b);
  b.job = createBookArt(b.bookPx, b.res, small ? TARGETS_SMALL : TARGETS);
  b.art = null;
  scheduleArt(b);
}

type IdleWindow = Window & {
  requestIdleCallback?: (
    cb: (d: { timeRemaining: () => number }) => void,
    opts?: { timeout: number }
  ) => number;
  cancelIdleCallback?: (h: number) => void;
};

function scheduleArt(b: EduBook) {
  const win = window as IdleWindow;
  const run = (budget: number) => {
    b.idle = 0;
    b.idleKind = null;
    const job = b.job;
    if (!job) return;
    if (job.step(budget)) {
      b.art = job.result();
      return;
    }
    scheduleArt(b);
  };
  if (win.requestIdleCallback) {
    b.idleKind = "idle";
    b.idle = win.requestIdleCallback(
      (d) => run(clamp(d.timeRemaining() - 1, 2, 12)),
      { timeout: 400 }
    );
  } else {
    b.idleKind = "timeout";
    b.idle = window.setTimeout(() => run(5), 48);
  }
}

function cancelIdle(b: EduBook) {
  const win = window as IdleWindow;
  if (b.idleKind === "idle") win.cancelIdleCallback?.(b.idle);
  else if (b.idleKind === "timeout") window.clearTimeout(b.idle);
  b.idle = 0;
  b.idleKind = null;
}

export function disposeEduBook(b: EduBook) {
  cancelIdle(b);
  b.job = null;
}

/** The art, finishing it on the spot if the scroll got here first. */
function ensureArt(b: EduBook) {
  if (b.art) return b.art;
  if (!b.job) return null;
  cancelIdle(b);
  while (!b.job.step(50)) {
    /* painting */
  }
  b.art = b.job.result();
  return b.art;
}

/* ------------------------------------------------------------------ *
 * The cue: choosing what it is made of
 * ------------------------------------------------------------------ */

const IV = new Float64Array(6);

function cue(b: EduBook, w: JourneyWorld, art: BookArt, focal: number, time: number) {
  const W = b.cssW;
  const H = b.cssH;
  const rng = makeRng(0xed0cb00c);

  // Everything of the medium on screen right now.
  const seen: Array<{ i: number; x: number; y: number; a: number; r: number }> = [];
  for (let i = 0; i < w.inner.length; i++) {
    if (!viewInteriorMote(IV, w, i, focal, time)) continue;
    const x = IV[0];
    const y = IV[1];
    if (x < 0 || y < 0 || x > W || y > H) continue;
    seen.push({ i, x, y, a: IV[5], r: IV[4] });
  }

  // The seed: the clearest point of light high in the middle of frame --
  // one the eye can follow when it moves.
  const sx0 = SEED_AT[0] * W;
  const sy0 = SEED_AT[1] * H;
  let best = -1;
  let bestScore = 0;
  for (let k = 0; k < seen.length; k++) {
    const m = seen[k];
    if (m.r > 7 || m.a < 0.12) continue;
    const dx = (m.x - sx0) / (0.2 * W);
    const dy = (m.y - sy0) / (0.13 * H);
    const score = Math.min(m.a, 0.9) * Math.exp(-(dx * dx + dy * dy));
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  b.taken = [];
  if (best >= 0 && bestScore > 0.02) {
    const m = seen[best];
    b.seed = m.i;
    b.seedX = m.x;
    b.seedY = m.y;
    b.seedA = m.a;
    b.seedR = m.r;
    b.taken.push(m.i);
    w.claimed[m.i] = 1;
  } else {
    // Nothing suitable up there (the medium is sparse on some screens): the
    // seed is a mote too faint to have been seen until it gathered itself.
    b.seed = -1;
    b.seedX = sx0;
    b.seedY = sy0;
    b.seedA = 0;
    b.seedR = 1.2;
  }
  b.seedPx = b.seedX;
  b.seedPy = b.seedY;
  b.side = b.seedX < W / 2 ? -1 : 1;

  // The motes it takes with it: the brightest near where the book will be,
  // and near the way down to it.
  const restX = REST_AT[0] * W;
  const restY = REST_AT[1] * H;
  const reach = Math.max(art.h, art.w) * 0.95;
  const pick: Array<{ i: number; x: number; y: number; a: number; r: number; s: number }> = [];
  for (const m of seen) {
    if (m.i === b.seed || m.a < 0.06) continue;
    // Distance to the segment from the seed down to where it rests.
    const vx = restX - b.seedX;
    const vy = restY - b.seedY;
    const l2 = vx * vx + vy * vy || 1;
    const u = clamp(((m.x - b.seedX) * vx + (m.y - b.seedY) * vy) / l2, 0, 1);
    const dx = m.x - (b.seedX + vx * u);
    const dy = m.y - (b.seedY + vy * u);
    const d = Math.hypot(dx, dy) / reach;
    pick.push({ ...m, s: Math.min(m.a, 0.8) * Math.exp(-d * d * 1.6) });
  }
  pick.sort((p, q) => q.s - p.s);
  const takeN = Math.min(pick.length, b.small ? TAKEN_SMALL : TAKEN);

  const grains: Grain[] = [];
  const cx = restX;
  const cy = restY;
  const diag = Math.hypot(W, H);

  // The structure first: taken motes land on the silhouette and edges, each
  // on the stretch of it that faces where it came from.
  const edgeUsed = new Uint8Array(art.edgeCount);
  for (let k = 0; k < takeN; k++) {
    const m = pick[k];
    b.taken.push(m.i);
    w.claimed[m.i] = 1;
    const ang = Math.atan2(m.y - cy, m.x - cx);
    let target = -1;
    let bestD = Infinity;
    for (let t = 0; t < art.edgeCount; t++) {
      if (edgeUsed[t]) continue;
      let d = Math.abs(Math.atan2(art.ty[t], art.tx[t]) - ang);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d < bestD) {
        bestD = d;
        target = t;
      }
    }
    if (target >= 0) edgeUsed[target] = 1;
    const near = clamp(Math.hypot(m.x - b.seedX, m.y - b.seedY) / (diag * 0.6), 0, 1);
    grains.push(
      makeGrain(rng, m.i, m.x, m.y, m.a, m.r, target, lerp(0.07, 0.26, near), lerp(0.36, 0.48, rng()), 0)
    );
  }

  // Then dust, drawn out of the dark: one grain for every other place on the
  // book, starting out on the side of frame that place faces, and some way
  // off -- plenty of it beyond the edge of frame, so it streams in rather
  // than surfacing where it stands.
  // Each is placed round where the seed will be when it is drawn in, so
  // what gathers is always what is nearby.
  for (let t = 0; t < art.count; t++) {
    if (t < art.edgeCount && edgeUsed[t]) continue;
    const edge = t < art.edgeCount;
    const far = Math.pow(rng(), 0.8);
    const rank = far * 0.6 + rng() * 0.4;
    const begin = edge ? lerp(0.14, 0.36, rank) : lerp(0.2, 0.56, rank);
    const dur = edge ? lerp(0.3, 0.38, rng()) : lerp(0.3, 0.36, rng());
    seedPath(b, begin, SP);
    const ang = Math.atan2(art.ty[t], art.tx[t]) + (rng() - 0.5) * 1.6;
    const R = art.h * lerp(0.42, 1.25, far);
    grains.push(
      makeGrain(
        rng,
        -1,
        SP.x + Math.cos(ang) * R * 1.1,
        SP.y + Math.sin(ang) * R * 0.8,
        0,
        0,
        t,
        begin,
        dur,
        P_DUST + ((rng() * DUST.length) | 0)
      )
    );
  }

  // And a few that are drawn in but never land.
  const haloN = b.small ? HALO_SMALL : HALO;
  for (let k = 0; k < haloN; k++) {
    const ang = rng() * Math.PI * 2;
    const R = art.h * lerp(0.9, 2.2, rng());
    const g = makeGrain(
      rng,
      -1,
      cx + Math.cos(ang) * R * 1.15,
      cy + Math.sin(ang) * R * 0.85,
      0,
      0,
      -1,
      lerp(0.3, 0.62, rng()),
      lerp(0.3, 0.36, rng()),
      P_DUST + ((rng() * DUST.length) | 0)
    );
    g.orbR = art.h * lerp(0.56, 0.84, rng());
    g.orbPh = rng() * Math.PI * 2;
    g.orbW = lerp(0.06, 0.13, rng());
    grains.push(g);
  }

  b.grains = grains;
  b.pos = new Float32Array(grains.length * 2);
  b.front = new Int32Array(grains.length);
  b.spacing = Math.sqrt(art.area / Math.max(1, art.count - art.edgeCount));
  b.cued = true;
}

function makeGrain(
  rng: () => number,
  mote: number,
  x: number,
  y: number,
  a: number,
  r: number,
  target: number,
  begin: number,
  dur: number,
  pal: number
): Grain {
  return {
    mote,
    sx: x,
    sy: y,
    a0: mote >= 0 ? a : lerp(0.1, 0.42, Math.pow(rng(), 1.4)),
    r0: mote >= 0 ? r : lerp(0.6, 1.3, rng()),
    target,
    b: begin,
    d: dur,
    turn: Math.PI * lerp(0.35, 0.85, rng()),
    sq0: lerp(0.4, 0.62, rng()),
    orbR: 0,
    orbPh: 0,
    orbW: 0,
    pal,
    px: x,
    py: y,
  };
}

/** Hands everything back to the universe. */
function release(b: EduBook, w: JourneyWorld) {
  for (const i of b.taken) {
    if (i < w.claimed.length) w.claimed[i] = 0;
  }
  b.taken = [];
  b.grains = [];
  b.cued = false;
}

/* ------------------------------------------------------------------ *
 * The seed's way down, and the book's frame
 * ------------------------------------------------------------------ */

const SP = { x: 0, y: 0 };

/** Where the seed is at e, on its own path (before it is blended out of
 *  the medium). */
function seedPath(b: EduBook, e: number, out: { x: number; y: number }) {
  const W = b.cssW;
  const H = b.cssH;
  const fall = easeInOutCubic(span(e, 0.04, 0.66));
  out.x =
    lerp(b.seedX, REST_AT[0] * W, fall) +
    Math.sin(Math.PI * fall) * W * 0.035 * b.side;
  // ...and a gentle dip through the middle and back, as a weight settles.
  out.y =
    lerp(b.seedY, REST_AT[1] * H, fall) +
    H * 0.018 * Math.sin(Math.PI * span(e, 0.56, 0.88));
}

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */

/**
 * Where the finished book floats, and how: the same slow bob and least sway
 * drawEduBook gives it once it has come together, scaled by `calm` (1 is
 * its usual float, 0 perfectly still). CSS px, radians, and the art's scale.
 */
export function eduRestFrame(b: EduBook, time: number, calm: number) {
  const art = b.art;
  return {
    x: REST_AT[0] * b.cssW,
    y: REST_AT[1] * b.cssH + Math.sin(time * 0.62) * b.cssH * 0.0075 * calm,
    rot: Math.sin(time * 0.41 + 1.3) * 0.011 * calm,
    k: art ? b.bookPx / art.bookPx : 1,
  };
}

/**
 * While the book is opening (see bookOpening), what the painted book here
 * does to hand over to the live one.
 */
export type EduOverride = {
  /** How much of the painted book to draw; the live one is underneath. */
  artAlpha: number;
  /** Its float, 0..1 (see eduRestFrame). */
  calm: number;
  /** Seconds since it was asked to open: the halo is drawn in to it. */
  gather: number;
  /** Where the book is now, for the halo to be drawn in to. */
  cx: number;
  cy: number;
};

/** How far halo grain n has been drawn in, `s` seconds after the book was
 *  asked to open -- each on its own schedule, the whole ring within four
 *  seconds. */
function haloGather(n: number, s: number) {
  const delay = 0.25 + ((n * 0.618034) % 1) * 1.5;
  return smoothstep(delay, delay + 2.4, s);
}

/** Dims the universe behind the book -- on the journey's own canvas, under
 *  everything the book draws -- and by `more` again (0..1) on top. */
export function drawEduVeil(
  ctx: CanvasRenderingContext2D,
  e: number,
  cssW: number,
  cssH: number,
  more = 0
) {
  const a = 1 - (1 - VEIL * smoothstep(0.1, 0.75, e)) * (1 - more);
  if (a <= 0.002) return;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = a;
  ctx.fillStyle = `rgb(${SPACE_BG[0]},${SPACE_BG[1]},${SPACE_BG[2]})`;
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.globalAlpha = 1;
}

/** A grainy disc, for the coverage mask: where a grain lands, the surface
 *  is there -- and the edge of what is there is granular, never a soft
 *  wipe. */
function makeSplat() {
  const N = 96;
  const c = document.createElement("canvas");
  c.width = N;
  c.height = N;
  const sctx = c.getContext("2d");
  if (!sctx) return c;
  const h = N / 2;
  // A faint core where it struck...
  const g = sctx.createRadialGradient(h, h, 0, h, h, h * 0.5);
  g.addColorStop(0, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  sctx.fillStyle = g;
  sctx.fillRect(0, 0, N, N);
  // ...and the spray it scatters, thick in the middle and thinning out, so
  // the surface builds up like settling sand.
  const rng = makeRng(0x5b1a7);
  sctx.fillStyle = "#fff";
  for (let i = 0; i < 320; i++) {
    const r = h * 0.88 * Math.min(1, Math.abs((rng() + rng() + rng() - 1.5) / 1.5) * 1.2);
    const a = rng() * Math.PI * 2;
    const d = lerp(1.6, 3.4, rng());
    sctx.globalAlpha = lerp(0.6, 1, rng());
    sctx.beginPath();
    sctx.arc(h + Math.cos(a) * r, h + Math.sin(a) * r, d, 0, Math.PI * 2);
    sctx.fill();
  }
  sctx.globalAlpha = 1;
  return c;
}

function ensureSurfaces(b: EduBook, art: BookArt) {
  const mw = Math.max(1, Math.ceil(art.w * MASK_S));
  const mh = Math.max(1, Math.ceil(art.h * MASK_S));
  if (!b.mask || b.mask.width !== mw || b.mask.height !== mh) {
    b.mask = document.createElement("canvas");
    b.mask.width = mw;
    b.mask.height = mh;
  }
  const lw = art.canvas.width;
  const lh = art.canvas.height;
  if (!b.layer || b.layer.width !== lw || b.layer.height !== lh) {
    b.layer = document.createElement("canvas");
    b.layer.width = lw;
    b.layer.height = lh;
  }
  if (!b.splat) b.splat = makeSplat();
}

/**
 * The book, and everything it is being made of, on the canvas above the
 * universe. Cues itself the first frame e rises above 0, and hands back
 * what it took when e returns there.
 */
export function drawEduBook(
  ctx: CanvasRenderingContext2D,
  b: EduBook,
  w: JourneyWorld,
  focal: number,
  e: number,
  time: number,
  ov?: EduOverride | null
) {
  if (e <= 0) {
    if (b.cued) release(b, w);
    return;
  }
  const art = ensureArt(b);
  if (!art) return;
  if (!b.cued) cue(b, w, art, focal, time);
  ensureSurfaces(b, art);

  const sprites = w.bank.sprites;
  const pal = b.pal;
  const H = b.cssH;
  const k = b.bookPx / art.bookPx;

  /* --- the seed, and the frame the book is built in --- */
  let liveX = b.seedX;
  let liveY = b.seedY;
  let liveA = b.seedA;
  let liveR = b.seedR;
  let livePx = liveX;
  let livePy = liveY;
  if (b.seed >= 0 && viewInteriorMote(IV, w, b.seed, focal, time)) {
    liveX = IV[0];
    liveY = IV[1];
    livePx = IV[2];
    livePy = IV[3];
    liveR = IV[4];
    liveA = IV[5];
  }
  seedPath(b, e, SP);
  const away = smoothstep(0.015, 0.11, e);
  const seedX = lerp(liveX, SP.x, away);
  const seedY = lerp(liveY, SP.y, away);

  // Once it has come together it floats: a slow bob and the least sway.
  const float = smoothstep(0.55, 1, e) * (ov ? ov.calm : 1);
  const bob = Math.sin(time * 0.62) * H * 0.0075 * float;
  // It turns into its pose as it forms, like something coming to rest.
  const rot =
    (1 - smoothstep(0.22, 0.92, e)) * 0.085 * b.side +
    Math.sin(time * 0.41 + 1.3) * 0.011 * float;
  const cx = seedX;
  const cy = seedY + bob;
  const cr = Math.cos(rot) * k;
  const sr = Math.sin(rot) * k;

  const formed = smoothstep(0.3, 0.95, e);

  /* --- light it stands in: faint, warm, only as much as there is of it --- */
  ctx.globalCompositeOperation = "lighter";
  // (While it opens, bookOpening lays this light under the live book.)
  if (formed > 0.002 && !ov) {
    const R = art.h * k * 0.9;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    const a = 0.13 * formed;
    g.addColorStop(0, `rgba(150,92,52,${a.toFixed(4)})`);
    g.addColorStop(0.45, `rgba(110,62,40,${(a * 0.45).toFixed(4)})`);
    g.addColorStop(1, "rgba(60,30,40,0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  }

  /* --- the grains --- */
  const mask = b.mask!;
  const mctx = mask.getContext("2d");
  const closing = smoothstep(0.86, 0.975, e);
  const splatR = b.spacing * SPLAT_K * lerp(1, SPLAT_CLOSE, closing) * MASK_S;
  const done = e >= 0.985;
  if (mctx && !done) {
    mctx.globalCompositeOperation = "source-over";
    mctx.clearRect(0, 0, mask.width, mask.height);
    mctx.globalCompositeOperation = "lighter";
  }

  // Two passes: whatever is on the far side of the swirl goes under the book
  // (what there is of it yet), the rest over it.
  const grains = b.grains;
  const front = b.front;
  const pos = b.pos;
  let frontN = 0;
  for (let n = 0; n < grains.length; n++) {
    const g = grains[n];
    const local = span(e, g.b, g.b + g.d);

    // A taken mote goes on being exactly what it was until it is drawn in.
    let ok = true;
    if (g.mote >= 0) {
      ok = viewInteriorMote(IV, w, g.mote, focal, time);
      if (ok) {
        g.sx = IV[0];
        g.sy = IV[1];
        g.a0 = IV[5];
        g.r0 = IV[4];
      }
      if (local <= 0) {
        if (ok) {
          blitGlow(ctx, sprites[w.inner[g.mote].spr], IV[0], IV[1], IV[2], IV[3], IV[4], IV[5]);
        }
        pos[n * 2] = NaN;
        continue;
      }
    } else if (local <= 0) {
      pos[n * 2] = NaN;
      continue;
    }

    // Where it is going: its place on the book, in the book's frame as it
    // is this frame -- or, for a halo grain, its orbit round it.
    let tx: number;
    let ty: number;
    let drawn = 0;
    if (g.target >= 0) {
      const ox = art.tx[g.target];
      const oy = art.ty[g.target];
      tx = cx + ox * cr - oy * sr;
      ty = cy + ox * sr + oy * cr;
    } else if (ov) {
      // The book is opening: the ring tightens and is drawn in to it.
      drawn = haloGather(n, ov.gather);
      const ph = g.orbPh + time * g.orbW + 1.3 * drawn * drawn;
      const R = g.orbR * (1 - 0.8 * drawn);
      tx = ov.cx + Math.cos(ph) * R;
      ty = ov.cy + Math.sin(ph) * R * (0.32 + 0.3 * drawn);
    } else {
      const ph = g.orbPh + time * g.orbW;
      tx = cx + Math.cos(ph) * g.orbR;
      ty = cy + Math.sin(ph) * g.orbR * 0.32;
    }

    // Round the seed and in: it winds about it on a tilted orbit that
    // tightens and straightens out onto where it lands.
    const wind = easeInOutCubic(local);
    const attract = smoothstep(0, 0.4, local);
    const land = Math.pow(smoothstep(0.5, 1, local), 1.2);
    const rx = g.sx - cx;
    const ry = (g.sy - cy) / g.sq0;
    const r0 = Math.hypot(rx, ry);
    const th = Math.atan2(ry, rx) + g.turn * wind;
    const r = lerp(r0, Math.hypot(tx - cx, ty - cy), wind);
    const sq = lerp(g.sq0, 1, wind);
    let x = cx + Math.cos(th) * r;
    let y = cy + Math.sin(th) * r * sq;
    x = lerp(g.sx, x, attract);
    y = lerp(g.sy, y, attract);
    x = lerp(x, tx, land);
    y = lerp(y, ty, land);
    pos[n * 2] = x;
    pos[n * 2 + 1] = y;

    // Far side of the swirl: under the book.
    if (Math.sin(th) < 0 && land < 0.6) {
      drawGrain(ctx, w, g, local, x, y, pal);
    } else {
      front[frontN++] = n;
    }

    // Landed: the surface is there now, where it struck.
    if (g.target >= 0 && local > 0.86 && mctx && !done) {
      const cov = smoothstep(0.86, 1, local);
      const ox = (art.tx[g.target] + art.ax) * MASK_S;
      const oy = (art.ty[g.target] + art.ay) * MASK_S;
      // The structure lands first, as a dotted line of grains; the faces
      // fill in round it.
      const rr =
        splatR *
        lerp(0.55, 1, cov) *
        (g.target < art.edgeCount ? lerp(0.42, 1, closing) : 1);
      mctx.globalAlpha = cov;
      mctx.drawImage(b.splat!, ox - rr, oy - rr, rr * 2, rr * 2);
    }
  }

  /* --- the book: only where grains have landed --- */
  const layer = b.layer!;
  const lctx = layer.getContext("2d");
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(k, k);
  if (done) {
    // Handing over to the live book, which is drawn underneath this.
    const artAlpha = ov ? ov.artAlpha : 1;
    if (artAlpha > 0.002) {
      ctx.globalAlpha = Math.min(1, artAlpha);
      ctx.drawImage(art.canvas, -art.ax, -art.ay, art.w, art.h);
      ctx.globalAlpha = 1;
    }
  } else if (lctx) {
    lctx.globalCompositeOperation = "source-over";
    lctx.clearRect(0, 0, layer.width, layer.height);
    lctx.drawImage(art.canvas, 0, 0);
    lctx.globalCompositeOperation = "destination-in";
    lctx.drawImage(mask, 0, 0, layer.width, layer.height);
    lctx.globalCompositeOperation = "source-over";
    ctx.drawImage(layer, -art.ax, -art.ay, art.w, art.h);
    // The last pinholes close as the final grains settle.
    const close = smoothstep(0.93, 0.985, e);
    if (close > 0.002) {
      ctx.globalAlpha = close;
      ctx.drawImage(art.canvas, -art.ax, -art.ay, art.w, art.h);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  /* --- heat where grains strike, and everything in front of the book --- */
  ctx.globalCompositeOperation = "lighter";
  if (!done) {
    const heatR = b.spacing * k * 0.5;
    for (let n = 0; n < grains.length; n++) {
      const g = grains[n];
      if (g.target < 0) continue;
      const landE = g.b + g.d;
      if (e < landE - g.d * 0.12) continue;
      const cool = smoothstep(landE, landE + 0.06, e);
      const strike = smoothstep(landE - g.d * 0.12, landE, e);
      const a = strike * (1 - cool) * 0.16;
      if (a <= 0.012) continue;
      const x = pos[n * 2];
      const y = pos[n * 2 + 1];
      if (Number.isNaN(x)) continue;
      blitGlow(ctx, sprites[pal[cool < 0.5 ? P_HOT : P_EMBER]], x, y, x, y, heatR, a);
    }
  }
  for (let f = 0; f < frontN; f++) {
    const n = front[f];
    const g = grains[n];
    const drawnIn = ov && g.target < 0 ? haloGather(n, ov.gather) : 0;
    drawGrain(ctx, w, g, span(e, g.b, g.b + g.d), pos[n * 2], pos[n * 2 + 1], pal, drawnIn);
  }

  /* --- the seed, over all of it until it sinks into the cover --- */
  const ignite = smoothstep(0, 0.12, e);
  const sink = smoothstep(0.62, 0.8, e);
  const sa = lerp(liveA, 1, ignite) * (1 - sink);
  if (sa > 0.012) {
    const sRad = lerp(liveR, Math.max(liveR * 1.8, 2.3), ignite) * (1 - 0.4 * sink);
    const px = lerp(livePx, b.seedPx, away);
    const py = lerp(livePy, b.seedPy, away);
    // The trail it leaves falling -- only while it is moving.
    for (let t = 1; t <= 7; t++) {
      seedPath(b, Math.max(0, e - t * 0.011), SP);
      const tx = lerp(liveX, SP.x, away);
      const ty = lerp(liveY, SP.y, away);
      if (Math.hypot(tx - seedX, ty - seedY) < 1.5) break;
      blitGlow(ctx, sprites[pal[P_WARM]], tx, ty, tx, ty, sRad * (1 - t * 0.09), sa * 0.26 * (1 - t / 8));
    }
    // Its own light round it, so it reads as the one thing moving.
    blitGlow(ctx, sprites[pal[P_WARM]], seedX, seedY, seedX, seedY, sRad * 3.4, sa * 0.1 * ignite);
    if (b.seed >= 0 && ignite < 1 && w.inner[b.seed]) {
      blitGlow(ctx, sprites[w.inner[b.seed].spr], seedX, seedY, px, py, sRad, sa * (1 - ignite));
    }
    blitGlow(ctx, sprites[pal[P_WARM]], seedX, seedY, px, py, sRad, sa * ignite);
  }
  b.seedPx = seedX;
  b.seedPy = seedY;

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

/** One grain in flight: cold light out there, heating as it closes. */
function drawGrain(
  ctx: CanvasRenderingContext2D,
  w: JourneyWorld,
  g: Grain,
  local: number,
  x: number,
  y: number,
  pal: number[],
  drawnIn = 0
) {
  const sprites = w.bank.sprites;
  // A halo grain being drawn in to the opening book warms, brightens as it
  // closes, and goes into its light.
  const heat = g.target >= 0 ? smoothstep(0.62, 1, local) : smoothstep(0.2, 0.85, drawnIn);
  // A landed grain is part of the surface now; a halo grain keeps circling.
  const gone =
    g.target >= 0
      ? smoothstep(0.93, 1, local)
      : smoothstep(0.72, 1, drawnIn) - 0.9 * Math.sin(Math.PI * drawnIn) * (1 - smoothstep(0.72, 1, drawnIn));
  // Dust is too faint to have been seen until it is being drawn in: it
  // comes up only as it starts to move.
  const lift = g.mote >= 0 ? 1 : Math.pow(smoothstep(0, 0.3, local), 1.5);
  const a0 = g.target >= 0 ? g.a0 : g.a0 * 0.55;
  const a = a0 * lift * (1 + 0.35 * heat) * (1 - gone);
  const rad = g.r0 * lerp(1, 1.25, heat) * (1 - 0.3 * gone);
  if (a > 0.012) {
    if (heat < 0.999) {
      // A taken mote keeps its own colour until it heats.
      const cold =
        g.mote >= 0 && w.inner[g.mote] ? sprites[w.inner[g.mote].spr] : sprites[pal[g.pal]];
      blitGlow(ctx, cold, x, y, g.px, g.py, rad, a * (1 - heat));
    }
    if (heat > 0.001) {
      blitGlow(ctx, sprites[pal[P_HOT]], x, y, g.px, g.py, rad, a * heat);
    }
  }
  g.px = x;
  g.py = y;
}
