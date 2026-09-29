/**
 * antiqueBook
 * -----------
 * The closed book the universe gathers itself into after the last project:
 * an old, heavy, leather-bound volume. Dark brown calf gone dry and pale
 * wherever hands have rubbed it, bumped corners worn through to the board,
 * five raised bands across a rounded spine, blind-tooled frames on the cover
 * with the last flecks of gilt still caught in them, and a page block gone
 * the colour of weak tea, sprinkled red along its head.
 *
 * Nothing here is an image file. The book is a solid -- two boards, a page
 * block and a rounded spine -- ray-cast once per viewport size into a
 * canvas, lit warm from the front by the light it is made of and edged cold
 * from behind by the universe it is made in. The render is sliced across
 * idle time, so it costs the scroll nothing, and it is finished long before
 * the camera gets anywhere near the point where it is needed.
 *
 * Alongside the picture it hands back where the book's surface actually is
 * -- its silhouette and structural edges, and a scatter over its faces --
 * which is exactly what the particles that build it land on (see
 * educationBook). The book is never shown except by being built.
 */

/* ------------------------------------------------------------------ *
 * Geometry, in book heights. Local axes: x toward the fore-edge, y up,
 * z out of the front cover.
 * ------------------------------------------------------------------ */

/** Board width, hinge to fore-edge. */
const BW = 0.71;
/** Board thickness. */
const BT = 0.03;
/** Half the book's thickness at the spine. A heavy volume. */
const HT = 0.13;
/** How far the boards stand proud of the page block (the "squares"). */
const SQ = 0.02;
/** How far the rounded spine bulges out past the hinge. */
const SB = 0.075;
/** The hinge line, where the boards meet the spine. */
const X0 = -BW / 2;
/** Fore-edge corners, rounded by wear. */
const RC = 0.017;

/** Raised bands: centres (y), half-width, and how far they stand out. */
const BANDS = [0.305, 0.152, 0, -0.152, -0.305] as const;
const BAND_HW = 0.019;
const BAND_E = 0.012;

/* ------------------------------------------------------------------ *
 * Pose and camera
 * ------------------------------------------------------------------ */

/** Turned so the spine comes round toward the viewer, tipped so the head
 *  of the page block shows, and not quite square to the frame. */
const YAW = 0.47;
const PITCH = 0.26;
const ROLL = -0.05;
/** Camera distance, in book heights -- a long lens, so the perspective is
 *  there but gentle. */
const CAM_D = 4.4;

/* ------------------------------------------------------------------ *
 * Light (world space; turned into the book's frame once)
 * ------------------------------------------------------------------ */

const KEY_DIR = [-0.26, 0.6, 0.76] as const;
const KEY_COL = [2.05, 1.72, 1.36] as const;
const FILL_DIR = [0.78, -0.12, 0.6] as const;
const FILL_COL = [0.2, 0.21, 0.34] as const;
const AMB = [0.1, 0.085, 0.08] as const;
/** The universe behind it: a cold fresnel edge, so the dark leather still
 *  separates from the dark it hangs in. */
const RIM_COL = [0.42, 0.36, 0.78] as const;

/* ------------------------------------------------------------------ *
 * Materials (albedo, 0..1)
 * ------------------------------------------------------------------ */

const COVER = [0.228, 0.128, 0.074] as const;
const SPINE = [0.21, 0.128, 0.084] as const;
const RUBBED = [0.34, 0.215, 0.13] as const;
const BOARD = [0.42, 0.37, 0.31] as const;
const LABEL = [0.2, 0.07, 0.048] as const;
const GILT = [0.6, 0.45, 0.22] as const;
const PAPER = [0.74, 0.64, 0.47] as const;
const SPRINKLE = [0.5, 0.2, 0.14] as const;
/** The flesh side, where the grain layer has flaked off. */
const FLESH = [0.52, 0.39, 0.29] as const;
/** Headband silk. */
const SILK_RED = [0.54, 0.16, 0.12] as const;
const SILK_CREAM = [0.78, 0.7, 0.52] as const;

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
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

/* --- value noise, on a fixed lattice so every build is the same book --- */

const LAT = 256;
const LMASK = LAT - 1;
const lattice = new Float32Array(LAT * LAT);
{
  const rng = makeRng(0x5eedb00c);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng() * 2 - 1;
}

/** Smooth value noise in [-1, 1]. */
function vn(x: number, y: number) {
  const xf = Math.floor(x);
  const yf = Math.floor(y);
  const fx = x - xf;
  const fy = y - yf;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const x0 = xf & LMASK;
  const y0 = yf & LMASK;
  const x1 = (x0 + 1) & LMASK;
  const y1 = (y0 + 1) & LMASK;
  const a = lattice[y0 * LAT + x0];
  const b = lattice[y0 * LAT + x1];
  const c = lattice[y1 * LAT + x0];
  const d = lattice[y1 * LAT + x1];
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** vn, with its slope: sets vdx, vdy. */
let vdx = 0;
let vdy = 0;
function vnD(x: number, y: number) {
  const xf = Math.floor(x);
  const yf = Math.floor(y);
  const fx = x - xf;
  const fy = y - yf;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const x0 = xf & LMASK;
  const y0 = yf & LMASK;
  const x1 = (x0 + 1) & LMASK;
  const y1 = (y0 + 1) & LMASK;
  const a = lattice[y0 * LAT + x0];
  const k1 = lattice[y0 * LAT + x1] - a;
  const k2 = lattice[y1 * LAT + x0] - a;
  const k3 = lattice[y1 * LAT + x1] - a - k1 - k2;
  vdx = 6 * fx * (1 - fx) * (k1 + k3 * uy);
  vdy = 6 * fy * (1 - fy) * (k2 + k3 * ux);
  return a + k1 * ux + k2 * uy + k3 * ux * uy;
}

function fbm2(x: number, y: number) {
  return vn(x, y) * 0.65 + vn(x * 2.03 + 17.1, y * 2.03 - 9.4) * 0.35;
}

/* --- distance fields for the tooling --- */

/** Signed distance to an axis-aligned box of half-extents (hx, hy). */
function sdBox(px: number, py: number, hx: number, hy: number) {
  const qx = Math.abs(px) - hx;
  const qy = Math.abs(py) - hy;
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0);
}

/** Signed distance to a rhombus of half-diagonals (bx, by). */
function sdRhombus(px: number, py: number, bx: number, by: number) {
  px = Math.abs(px);
  py = Math.abs(py);
  const h = clamp(
    ((bx - 2 * px) * bx - (by - 2 * py) * by) / (bx * bx + by * by),
    -1,
    1
  );
  const dx = px - 0.5 * bx * (1 - h);
  const dy = py - 0.5 * by * (1 + h);
  const d = Math.sqrt(dx * dx + dy * dy);
  return px * by + py * bx - bx * by < 0 ? -d : d;
}

/** A tooled line: the profile of a groove pressed into leather. */
function groove(d: number, w: number) {
  const q = d / w;
  return q * q > 9 ? 0 : Math.exp(-q * q);
}

/* ------------------------------------------------------------------ *
 * Pose matrix and the lights in the book's own frame
 * ------------------------------------------------------------------ */

/** Row-major M = Rz(roll) * Rx(pitch) * Ry(yaw): book -> world. */
function poseMatrix() {
  const cy = Math.cos(YAW);
  const sy = Math.sin(YAW);
  const cx = Math.cos(PITCH);
  const sx = Math.sin(PITCH);
  const cz = Math.cos(ROLL);
  const sz = Math.sin(ROLL);
  // Ry
  const ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  // Rx
  const rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  // Rz
  const rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mul3(rz, mul3(rx, ry));
}

function mul3(a: number[], b: number[]) {
  const o = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] =
        a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return o;
}

const M = poseMatrix();

/** World -> book: M transposed. */
function toLocal(x: number, y: number, z: number, out: number[]) {
  out[0] = M[0] * x + M[3] * y + M[6] * z;
  out[1] = M[1] * x + M[4] * y + M[7] * z;
  out[2] = M[2] * x + M[5] * y + M[8] * z;
}

function toWorld(x: number, y: number, z: number, out: number[]) {
  out[0] = M[0] * x + M[1] * y + M[2] * z;
  out[1] = M[3] * x + M[4] * y + M[5] * z;
  out[2] = M[6] * x + M[7] * y + M[8] * z;
}

function norm3(v: readonly number[]) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

const KEY_L = [0, 0, 0];
const FILL_L = [0, 0, 0];
{
  const k = norm3(KEY_DIR);
  const f = norm3(FILL_DIR);
  toLocal(k[0], k[1], k[2], KEY_L);
  toLocal(f[0], f[1], f[2], FILL_L);
}

/* ------------------------------------------------------------------ *
 * Ray casting
 * ------------------------------------------------------------------ */

const ID_NONE = 0;
const ID_COVER = 1;
const ID_EDGE = 2;
const ID_BACK = 3;
const ID_PAGES = 4;
const ID_SPINE = 5;
const ID_BAND = 6;
const ID_CAP = 7;

// The nearest hit so far, in the book's frame. Module scratch, so the
// per-pixel loop never allocates.
let hT = 0;
let hId = ID_NONE;
let hNx = 0;
let hNy = 0;
let hNz = 0;
let hFace = 0;

// Result of the last slab test.
let bT = 0;
let bAxis = 0;
let bSign = 0;
let bExit = 0;

function slab(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number
) {
  let tn = -Infinity;
  let tf = Infinity;
  let axis = 0;
  let sign = 0;
  // x
  if (Math.abs(dx) < 1e-12) {
    if (ox < x0 || ox > x1) return false;
  } else {
    const a = (x0 - ox) / dx;
    const b = (x1 - ox) / dx;
    const n = a < b ? a : b;
    const f = a < b ? b : a;
    if (n > tn) {
      tn = n;
      axis = 0;
      sign = dx > 0 ? -1 : 1;
    }
    if (f < tf) tf = f;
  }
  // y
  if (Math.abs(dy) < 1e-12) {
    if (oy < y0 || oy > y1) return false;
  } else {
    const a = (y0 - oy) / dy;
    const b = (y1 - oy) / dy;
    const n = a < b ? a : b;
    const f = a < b ? b : a;
    if (n > tn) {
      tn = n;
      axis = 1;
      sign = dy > 0 ? -1 : 1;
    }
    if (f < tf) tf = f;
  }
  // z
  if (Math.abs(dz) < 1e-12) {
    if (oz < z0 || oz > z1) return false;
  } else {
    const a = (z0 - oz) / dz;
    const b = (z1 - oz) / dz;
    const n = a < b ? a : b;
    const f = a < b ? b : a;
    if (n > tn) {
      tn = n;
      axis = 2;
      sign = dz > 0 ? -1 : 1;
    }
    if (f < tf) tf = f;
  }
  if (tf < tn || tf < 0) return false;
  bT = tn;
  bAxis = axis;
  bSign = sign;
  bExit = tf;
  return true;
}

/** Outside the fore-edge corners' wear. */
function cornerCut(x: number, y: number) {
  const cx = X0 + BW - RC;
  const cy = 0.5 - RC;
  const ay = Math.abs(y);
  if (x <= cx || ay <= cy) return false;
  const dx = x - cx;
  const dy = ay - cy;
  return dx * dx + dy * dy > RC * RC;
}

function board(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  z0: number,
  z1: number,
  front: boolean
) {
  if (!slab(ox, oy, oz, dx, dy, dz, X0, X0 + BW, -0.5, 0.5, z0, z1)) return;
  const t = bT;
  if (t <= 0 || t >= hT) return;
  const px = ox + dx * t;
  const py = oy + dy * t;
  if (cornerCut(px, py)) return;
  hT = t;
  hNx = bAxis === 0 ? bSign : 0;
  hNy = bAxis === 1 ? bSign : 0;
  hNz = bAxis === 2 ? bSign : 0;
  hFace = bAxis * 2 + (bSign > 0 ? 1 : 0);
  if (front) hId = bAxis === 2 && bSign > 0 ? ID_COVER : ID_EDGE;
  else hId = ID_BACK;
}

function pages(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number
) {
  if (
    !slab(
      ox,
      oy,
      oz,
      dx,
      dy,
      dz,
      X0,
      X0 + BW - SQ,
      -0.5 + SQ,
      0.5 - SQ,
      -HT + BT,
      HT - BT
    )
  ) {
    return;
  }
  const t = bT;
  if (t <= 0 || t >= hT) return;
  hT = t;
  hNx = bAxis === 0 ? bSign : 0;
  hNy = bAxis === 1 ? bSign : 0;
  hNz = bAxis === 2 ? bSign : 0;
  hFace = bAxis * 2 + (bSign > 0 ? 1 : 0);
  hId = ID_PAGES;
}

/** How far a raised band lifts the spine at height y, and its slope. */
let bandSlopeOut = 0;
function bandRaise(y: number) {
  let e = 0;
  let de = 0;
  for (let k = 0; k < BANDS.length; k++) {
    const q = (y - BANDS[k]) / BAND_HW;
    const aq = q < 0 ? -q : q;
    if (aq >= 1) continue;
    // Flat-topped, steep-sided: a cord under leather, not a soft bump.
    if (aq <= 0.5) {
      e += BAND_E;
    } else {
      const s = (aq - 0.5) / 0.5;
      e += BAND_E * (1 - s * s * (3 - 2 * s));
      const ds = (6 * s * (1 - s)) / 0.5;
      de += -BAND_E * ds * (q < 0 ? -1 : 1) / BAND_HW;
    }
  }
  bandSlopeOut = de;
  return e;
}

function spineInside(x: number, y: number, z: number) {
  if (x > X0 || y > 0.5 || y < -0.5) return false;
  const a = SB + bandRaise(y);
  const qx = (x - X0) / a;
  const qz = z / HT;
  return qx * qx + qz * qz <= 1;
}

const SPINE_STEPS = 22;

function spine(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number
) {
  if (
    !slab(ox, oy, oz, dx, dy, dz, X0 - SB - BAND_E, X0, -0.5, 0.5, -HT, HT)
  ) {
    return;
  }
  const ta = Math.max(bT, 0);
  const tb = bExit;
  if (ta >= hT) return;
  let prev = ta;
  let hit = -1;
  let cap = false;
  for (let k = 0; k <= SPINE_STEPS; k++) {
    const t = ta + ((tb - ta) * k) / SPINE_STEPS;
    if (spineInside(ox + dx * t, oy + dy * t, oz + dz * t)) {
      if (k === 0) {
        hit = t;
        cap = true;
      } else {
        let lo = prev;
        let hi = t;
        for (let i = 0; i < 9; i++) {
          const mid = (lo + hi) / 2;
          if (spineInside(ox + dx * mid, oy + dy * mid, oz + dz * mid)) hi = mid;
          else lo = mid;
        }
        hit = hi;
      }
      break;
    }
    prev = t;
  }
  if (hit < 0 || hit >= hT) return;
  hT = hit;
  const x = ox + dx * hit;
  const y = oy + dy * hit;
  const z = oz + dz * hit;
  if (cap) {
    hNx = 0;
    hNy = y > 0 ? 1 : -1;
    hNz = 0;
    hId = ID_CAP;
    return;
  }
  const e = bandRaise(y);
  const de = bandSlopeOut;
  const a = SB + e;
  const gx = (2 * (x - X0)) / (a * a);
  const gz = (2 * z) / (HT * HT);
  const gy = (-2 * (x - X0) * (x - X0) * de) / (a * a * a);
  const l = Math.hypot(gx, gy, gz) || 1;
  hNx = gx / l;
  hNy = gy / l;
  hNz = gz / l;
  hId = e > BAND_E * 0.02 ? ID_BAND : ID_SPINE;
}

function trace(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number
) {
  hT = Infinity;
  hId = ID_NONE;
  board(ox, oy, oz, dx, dy, dz, HT - BT, HT, true);
  board(ox, oy, oz, dx, dy, dz, -HT, -HT + BT, false);
  pages(ox, oy, oz, dx, dy, dz);
  spine(ox, oy, oz, dx, dy, dz);
  return hId;
}

/* ------------------------------------------------------------------ *
 * Shading
 * ------------------------------------------------------------------ */

// Output of shade(), 0..1.
let oR = 0;
let oG = 0;
let oB = 0;

// Surface being lit: albedo, normal, and how it takes the key light.
let aR = 0;
let aG = 0;
let aB = 0;
let sNx = 0;
let sNy = 0;
let sNz = 1;
let specK = 0;
let specPow = 16;
let sheenK = 0;
let metal = 0;
let occl = 1;

/** Fine grain of old calf, and its slope: a crinkled network of creases
 *  over a softer pebble. u, v in book heights. */
let grH = 0;
let grDu = 0;
let grDv = 0;
const GRAIN_F1 = 84;
const GRAIN_F2 = 190;
function grain(u: number, v: number, amt: number) {
  // Creases: the ridge of one octave -- sharp where the noise crosses zero.
  const n1 = vnD(u * GRAIN_F1, v * GRAIN_F1 * 1.13);
  const s1 = n1 < 0 ? 1 : -1;
  let du = 0.6 * s1 * vdx * GRAIN_F1;
  let dv = 0.6 * s1 * vdy * GRAIN_F1 * 1.13;
  let h = 0.6 * (1 - Math.abs(n1));
  // Pores and pebble over it.
  const n2 = vnD(u * GRAIN_F2 + 31.7, v * GRAIN_F2 - 12.2);
  const k2 = 0.4 * grainFine;
  h += k2 * n2;
  du += k2 * vdx * GRAIN_F2;
  dv += k2 * vdy * GRAIN_F2;
  grH = h;
  grDu = du * amt;
  grDv = dv * amt;
}
/** How much of the finest grain octave survives at the size the book is
 *  rendered, so it never aliases into noise. Set per build. */
let grainFine = 1;
/** Bump strength: slope of the grain, in normal-tilt per unit slope. */
const GRAIN_K = 0.001;

/** The last slopes bump() was given, for baking them out (see bakeBookMaps). */
let bDu = 0;
let bDv = 0;

/** Tilts the surface normal by a height slope along two tangents. */
function bump(
  nx: number,
  ny: number,
  nz: number,
  tux: number,
  tuy: number,
  tuz: number,
  tvx: number,
  tvy: number,
  tvz: number,
  du: number,
  dv: number
) {
  bDu = du;
  bDv = dv;
  let x = nx - du * tux - dv * tvx;
  let y = ny - du * tuy - dv * tvy;
  let z = nz - du * tuz - dv * tvz;
  const l = Math.sqrt(x * x + y * y + z * z) || 1;
  x /= l;
  y /= l;
  z /= l;
  sNx = x;
  sNy = y;
  sNz = z;
}

function setAlbedo(r: number, g: number, b: number) {
  aR = r;
  aG = g;
  aB = b;
}

function mixAlbedo(c: readonly number[], t: number) {
  aR += (c[0] - aR) * t;
  aG += (c[1] - aG) * t;
  aB += (c[2] - aB) * t;
}

/** Everything that happens to old leather, at a point on it. `wear` is how
 *  exposed that point is to hands (0..1). */
function ageLeather(u: number, v: number, wear: number, crackAmt: number) {
  // Mottling and old stains: no two hand-widths of it are the same brown.
  const m = fbm2(u * 4.2 + 3.3, v * 4.2 - 1.7);
  const k = 0.84 + 0.3 * m;
  aR *= k;
  aG *= k * (0.98 + 0.04 * m);
  aB *= k;
  const stain = smoothstep(0.28, 0.72, vn(u * 2.1 + 40, v * 2.1 + 7));
  aR *= 1 - 0.28 * stain;
  aG *= 1 - 0.3 * stain;
  aB *= 1 - 0.3 * stain;
  // Dry, rubbed, faded where it is handled -- broken up, never an even band.
  const rub = clamp(
    wear + 0.2 * vn(u * 11 + 5, v * 11 - 3) + 0.08 * vn(u * 38, v * 38),
    0,
    1
  );
  mixAlbedo(RUBBED, smoothstep(0.3, 1, rub) * 0.5);
  // Surface cracking of the grain layer.
  const c = 1 - Math.abs(vn(u * 27 + 9.1, v * 31 - 4.3));
  const crack = smoothstep(0.955, 0.99, c) * crackAmt;
  aR *= 1 - 0.5 * crack;
  aG *= 1 - 0.52 * crack;
  aB *= 1 - 0.52 * crack;
  // A few long scuffs.
  const sc = vn(u * 3 + v * 26 + 70, v * 3 - u * 8 - 20);
  const scuff = smoothstep(0.8, 0.92, sc) * 0.18;
  mixAlbedo(RUBBED, scuff);
  // Leather dulls as it wears: the gloss goes before the colour does.
  specK *= 1 - 0.75 * smoothstep(0.2, 0.9, rub);
  return rub;
}

/** The blind tooling on the front cover as a height field (negative is
 *  pressed in), and how much of it was gilt. u across from the hinge, v up
 *  from the tail, in book heights. */
let toolGilt = 0;
function coverTooling(u: number, v: number) {
  const px = u - BW / 2 - 0.006;
  const py = v - 0.5;
  let h = 0;
  let gilt = 0;
  // Double fillet round the edge, and a single one framing the panel.
  const f1 = groove(Math.abs(sdBox(px, py, BW / 2 - 0.046, 0.5 - 0.046)), 0.0032);
  const f2 = groove(Math.abs(sdBox(px, py, BW / 2 - 0.059, 0.5 - 0.059)), 0.0022);
  const f3 = groove(Math.abs(sdBox(px, py, BW / 2 - 0.118, 0.5 - 0.118)), 0.0026);
  h -= 0.9 * f1 + 0.75 * f2 + 0.8 * f3;
  gilt = Math.max(gilt, f3 * 0.8);
  // A dotted roll between the fillets.
  const between = Math.abs(sdBox(px, py, BW / 2 - 0.0525, 0.5 - 0.0525));
  if (between < 0.004) {
    const along =
      Math.abs(px) > BW / 2 - 0.0525 - 0.002 ? py : px;
    const dot = 0.5 + 0.5 * Math.cos(along * 520);
    h -= 0.45 * groove(between, 0.0022) * smoothstep(0.55, 0.9, dot);
  }
  // Corner fleurons, inside the panel frame.
  const cxp = BW / 2 - 0.118 - 0.036;
  const cyp = 0.5 - 0.118 - 0.036;
  const lx = Math.abs(px) - cxp;
  const ly = Math.abs(py) - cyp;
  const lr = Math.hypot(lx, ly);
  if (lr < 0.04) {
    const th = Math.atan2(ly, lx) - Math.PI / 4;
    const R = 0.026 * (0.42 + 0.58 * Math.pow(Math.abs(Math.cos(2 * th)), 0.7));
    const inner = 1 - smoothstep(-0.0016, 0.0016, lr - R);
    const rim = groove(Math.abs(lr - R), 0.0016);
    h -= 0.55 * inner + 0.5 * rim;
    gilt = Math.max(gilt, inner * 0.9);
  }
  // Centre-piece: a lozenge within a lozenge round a rosette.
  const d1 = sdRhombus(px, py, 0.13, 0.19);
  const d2 = sdRhombus(px, py, 0.085, 0.124);
  h -= 0.85 * groove(Math.abs(d1), 0.0028) + 0.7 * groove(Math.abs(d2), 0.0022);
  gilt = Math.max(gilt, groove(Math.abs(d2), 0.0022) * 0.9);
  const r = Math.hypot(px, py);
  if (r < 0.05) {
    const th = Math.atan2(py, px);
    const R = 0.036 * (0.6 + 0.4 * Math.abs(Math.cos(4 * th)));
    const inner = 1 - smoothstep(-0.0015, 0.0015, r - R);
    const boss = 1 - smoothstep(0.0055, 0.0075, r);
    h -= 0.6 * inner + 0.45 * groove(Math.abs(r - R), 0.0015);
    h += 1.2 * boss;
    gilt = Math.max(gilt, inner);
  }
  // Pearls at the lozenge's points.
  for (let k = 0; k < PEARLS.length; k += 2) {
    const dd = Math.hypot(px - PEARLS[k], py - PEARLS[k + 1]);
    if (dd < 0.012) {
      const p = 1 - smoothstep(0.004, 0.0065, dd);
      h -= 0.6 * p;
      gilt = Math.max(gilt, p);
    }
  }
  // The joint: where the board hinges, a groove the leather has cracked in.
  h -= 1.1 * groove(u - 0.022, 0.0048);
  toolGilt = gilt;
  return h;
}

/** Pearls at the lozenge's four points, as x, y pairs. */
const PEARLS = [0, 0.206, 0, -0.206, 0.144, 0, -0.144, 0] as const;

const TOOL_DEPTH = 0.0021;

function shadeCover(x: number, y: number) {
  const u = x - X0;
  const v = y + 0.5;
  setAlbedo(COVER[0], COVER[1], COVER[2]);
  specK = 0.2;
  specPow = 20;
  sheenK = 0.07;
  metal = 0;

  // Tooling relief, and its slope.
  const e = 0.0012;
  const h0 = coverTooling(u, v);
  const gilt0 = toolGilt;
  // Most of the cover is plain leather: no relief within reach, no slope.
  let hu = 0;
  let hv = 0;
  if (h0 !== 0) {
    hu = (coverTooling(u + e, v) - h0) / e;
    hv = (coverTooling(u, v + e) - h0) / e;
  }
  const recess = clamp(-h0, 0, 1);

  // Where hands go: the fore-edge, head and tail, and hardest of all the
  // corners -- worn through to the board there.
  const ef = BW - u;
  const edge = Math.min(ef, v, 1 - v);
  const corner = Math.hypot(Math.max(0, 0.06 - ef), Math.max(0, 0.06 - Math.min(v, 1 - v)));
  const wear = clamp(
    smoothstep(0.026, 0.0, edge + 0.005 * vn(u * 20, v * 20)) * 0.6 +
      smoothstep(0.02, 0.07, corner) * 0.6 +
      smoothstep(0.03, 0.0, u) * 0.7,
    0,
    1
  );
  const rub = ageLeather(u, v, wear, 0.3);

  // Pressed leather darkens.
  aR *= 1 - 0.34 * recess;
  aG *= 1 - 0.36 * recess;
  aB *= 1 - 0.36 * recess;

  // Board showing through at the corners.
  const through = smoothstep(
    0.035,
    0.055,
    corner + 0.012 * vn(u * 70 + 3, v * 70)
  );
  mixAlbedo(BOARD, through);

  // The last of the gilt, in patches.
  const gl =
    gilt0 *
    smoothstep(0.12, 0.4, vn(u * 48 + 12, v * 48 - 8) * 0.5 + 0.26 - rub * 0.5) *
    (0.55 + 0.45 * smoothstep(-0.3, 0.4, vn(u * 9 - 4, v * 9 + 2)));
  if (gl > 0.01) {
    mixAlbedo(GILT, gl * 0.8);
    specK = specK + (0.6 - specK) * gl;
    specPow = specPow + (30 - specPow) * gl;
    metal = gl;
  }

  grain(u, v, 1 - through * 0.6);
  bump(
    0,
    0,
    1,
    1,
    0,
    0,
    0,
    1,
    0,
    grDu * GRAIN_K + hu * TOOL_DEPTH,
    grDv * GRAIN_K + hv * TOOL_DEPTH
  );
  specK *= 0.7 + 0.6 * grH;
  occl = 1 - 0.25 * recess;
}

/** The leather edges of the boards, rubbed pale along every one of them. */
function shadeEdge(x: number, y: number, z: number, face: number, back: boolean) {
  let u: number;
  let v: number;
  if (face >> 1 === 1) {
    u = x - X0;
    v = z * 3;
  } else {
    u = y + 0.5;
    v = z * 3;
  }
  setAlbedo(COVER[0], COVER[1], COVER[2]);
  specK = 0.12;
  specPow = 14;
  sheenK = 0.05;
  metal = 0;
  ageLeather(u, v, 0.72, 0.3);
  const corner = x > X0 + BW - 0.05 ? smoothstep(X0 + BW - 0.05, X0 + BW, x) : 0;
  mixAlbedo(BOARD, corner * 0.6);
  grain(u, v, 0.8);
  if (face >> 1 === 1) {
    bump(0, face & 1 ? 1 : -1, 0, 1, 0, 0, 0, 0, 1, grDu * GRAIN_K, grDv * GRAIN_K);
  } else {
    bump(face & 1 ? 1 : -1, 0, 0, 0, 1, 0, 0, 0, 1, grDu * GRAIN_K, grDv * GRAIN_K);
  }
  occl = back ? 0.82 : 1;
}

/** The inside of the back board, above the page block: the leather turned
 *  in over its edge, and in the shadow of everything in front of it. */
function shadeTurnIn(x: number, y: number) {
  setAlbedo(COVER[0] * 0.9, COVER[1] * 0.9, COVER[2] * 0.9);
  specK = 0.08;
  specPow = 12;
  sheenK = 0.03;
  metal = 0;
  ageLeather(x - X0, y + 0.5, 0.3, 0.2);
  sNx = 0;
  sNy = 0;
  sNz = 1;
  occl = 0.45;
}

function shadePages(x: number, y: number, z: number, face: number) {
  // Only the head is ever in view; the rest is shaded the same way for the
  // silhouette's sake.
  const u = x - X0;
  const w = (z + HT - BT) / (2 * (HT - BT)); // 0 at the back board, 1 at the front
  setAlbedo(PAPER[0], PAPER[1], PAPER[2]);
  specK = 0.03;
  specPow = 8;
  sheenK = 0;
  metal = 0;
  // Leaves, one against the next, each a slightly different age.
  const leaf = vn(z * 390 + 11, u * 2.5) * 0.6 + vn(z * 1100 - 7, u * 6) * 0.4;
  const k = 0.9 + 0.1 * leaf;
  aR *= k;
  aG *= k;
  aB *= k;
  // Dust settled on the head, and the toning that comes in from the edges.
  const tone = smoothstep(0.5, 0.0, Math.min(w, 1 - w)) * 0.25 + 0.12;
  aR *= 1 - tone * 0.8;
  aG *= 1 - tone;
  aB *= 1 - tone * 1.25;
  const fox = smoothstep(0.35, 0.8, fbm2(u * 9 + 2, z * 30 - 6));
  aR *= 1 - 0.14 * fox;
  aG *= 1 - 0.2 * fox;
  aB *= 1 - 0.28 * fox;
  // Sprinkled red, the way edges were coloured when this was bound.
  const sp = vn(u * 330 + 5, z * 330 - 9);
  mixAlbedo(SPRINKLE, smoothstep(0.62, 0.8, sp) * 0.65);
  // Headband: a little striped silk cap where the leaves meet the spine.
  if (face === 3 && u < 0.017) {
    const stripe = Math.cos(z * 290) > 0 ? 1 : 0;
    const band = 1 - smoothstep(0.011, 0.017, u);
    mixAlbedo(stripe ? SILK_RED : SILK_CREAM, band);
  }
  if (face >> 1 === 1) {
    sNx = 0;
    sNy = face & 1 ? 1 : -1;
    sNz = 0;
  } else if (face >> 1 === 0) {
    sNx = face & 1 ? 1 : -1;
    sNy = 0;
    sNz = 0;
  } else {
    sNx = 0;
    sNy = 0;
    sNz = face & 1 ? 1 : -1;
  }
  // The boards hold light off the leaves nearest them.
  occl = 0.58 + 0.42 * smoothstep(0, 0.35, Math.min(w, 1 - w));
}

/** Arc length round the spine at angle phi, measured from the middle. */
const SPINE_ARC = Math.PI * Math.sqrt((SB * SB + HT * HT) / 2);

function shadeSpine(x: number, y: number, z: number, id: number) {
  const e = bandRaise(y);
  const a = SB + e;
  // -pi/2 at the back board, +pi/2 at the front.
  const phi = Math.atan2(z / HT, (X0 - x) / a);
  const s = (phi / Math.PI) * SPINE_ARC; // arc position, 0 mid-spine
  const v = y + 0.5;
  setAlbedo(SPINE[0], SPINE[1], SPINE[2]);
  specK = 0.16;
  specPow = 16;
  sheenK = 0.06;
  metal = 0;
  let gilt = 0;
  let relief = 0; // for occlusion

  const onBand = e / BAND_E;
  // Bands take the rubbing first, and the joints crack.
  const joint = smoothstep(0.82, 0.98, Math.abs(phi) / (Math.PI / 2));
  const wear = clamp(
    onBand * 0.5 + joint * 0.4 + smoothstep(0.04, 0, Math.min(v, 1 - v)) * 0.8,
    0,
    1
  );

  // Title label, second panel down: dark red morocco, its own grain.
  const labTop = BANDS[0] - BAND_HW;
  const labBot = BANDS[1] + BAND_HW;
  const inLabel =
    v - 0.5 < labTop - 0.006 &&
    v - 0.5 > labBot + 0.006 &&
    Math.abs(s) < SPINE_ARC * 0.29;
  if (inLabel) {
    setAlbedo(LABEL[0], LABEL[1], LABEL[2]);
    specK = 0.28;
    specPow = 26;
  }
  const rub = ageLeather(s + 3.1, v, wear, 0.6);

  // Flaking: where the grain layer has lifted away, the flesh side shows,
  // pale and rough.
  const flake =
    smoothstep(0.56, 0.66, fbm2(s * 13 + 2, v * 9 - 5)) * (inLabel ? 0.4 : 1);
  mixAlbedo(FLESH, flake * 0.6);
  specK *= 1 - flake * 0.8;

  // Gilt: double fillets either side of every band, a small tool in each
  // panel, rules framing the label, and rolls at head and tail.
  const yy = v - 0.5;
  for (let k = 0; k < BANDS.length; k++) {
    const d = Math.abs(yy - BANDS[k]);
    gilt = Math.max(
      gilt,
      groove(Math.abs(d - BAND_HW * 1.08), 0.0019),
      groove(Math.abs(d - BAND_HW * 1.36), 0.0014) * 0.8
    );
  }
  if (inLabel) {
    const lb = Math.min(
      Math.abs(yy - (labTop - 0.017)),
      Math.abs(yy - (labBot + 0.017))
    );
    gilt = Math.max(gilt, groove(lb, 0.0017));
    // A worn title: a line of blurred gilt where lettering once was.
    const title =
      (1 - smoothstep(0.009, 0.013, Math.abs(yy - (labTop + labBot) / 2))) *
      (1 - smoothstep(SPINE_ARC * 0.17, SPINE_ARC * 0.22, Math.abs(s))) *
      smoothstep(0.35, 0.7, vn(s * 160, yy * 140 + 3) * 0.5 + 0.5) *
      smoothstep(-0.2, 0.3, vn(s * 34 - 8, 2.5));
    gilt = Math.max(gilt, title * 0.6);
  } else {
    // Panel tool: a small lozenge with a pearl at its heart.
    for (let k = 1; k < BANDS.length; k++) {
      const mid = (BANDS[k - 1] + BANDS[k]) / 2;
      if (k === 1) continue;
      const d = sdRhombus(s, yy - mid, 0.021, 0.03);
      const p = Math.hypot(s, yy - mid);
      gilt = Math.max(
        gilt,
        groove(Math.abs(d), 0.0016),
        1 - smoothstep(0.003, 0.0045, p)
      );
    }
    const headRoll = Math.min(Math.abs(v - 0.955), Math.abs(v - 0.045));
    gilt = Math.max(gilt, groove(headRoll, 0.0016) * 0.8);
  }
  relief = gilt * 0.6;
  const gl =
    gilt *
    smoothstep(0.05, 0.32, vn(s * 60 + 3, v * 60 - 1) * 0.5 + 0.38 - rub * 0.45 - flake);
  aR *= 1 - 0.22 * gilt;
  aG *= 1 - 0.22 * gilt;
  aB *= 1 - 0.22 * gilt;
  if (gl > 0.01) {
    mixAlbedo(GILT, gl * 0.85);
    specK = specK + (0.65 - specK) * gl;
    specPow = specPow + (30 - specPow) * gl;
    metal = gl;
  }

  // Tangent round the spine, and up it.
  const tx = a * Math.sin(phi);
  const tz = HT * Math.cos(phi);
  const tl = Math.hypot(tx, tz) || 1;
  grain(s * 1.1, v, 1 - flake * 0.5);
  bump(
    hNx,
    hNy,
    hNz,
    tx / tl,
    0,
    tz / tl,
    0,
    1,
    0,
    grDu * GRAIN_K * 1.1,
    grDv * GRAIN_K * 1.1
  );
  specK *= 0.7 + 0.6 * grH;
  // The valleys between bands sit in the bands' shadow.
  let nearBand = 1;
  for (let k = 0; k < BANDS.length; k++) {
    const d = Math.abs(yy - BANDS[k]);
    nearBand = Math.min(nearBand, smoothstep(BAND_HW * 0.95, BAND_HW * 2.2, d));
  }
  occl = (id === ID_BAND ? 1 : 0.8 + 0.2 * nearBand) * (1 - relief * 0.2) * (1 - joint * 0.25);
}

function shadeCap(x: number, z: number) {
  setAlbedo(SPINE[0], SPINE[1], SPINE[2]);
  specK = 0.08;
  specPow = 12;
  sheenK = 0.03;
  metal = 0;
  ageLeather(x * 3 + 7, z * 3, 0.9, 0.4);
  grain(x * 2, z * 2, 0.6);
  bump(0, hNy, 0, 1, 0, 0, 0, 0, 1, grDu * GRAIN_K, grDv * GRAIN_K);
  occl = 0.9;
}

/** The key is a pool, not a wash: brightest high on the cover near the
 *  spine, falling away toward the tail and the fore-edge, so the book has
 *  weight at the bottom. Set per sample from the hit point. */
let pool = 1;
function lightPool(x: number, y: number) {
  const dx = (x + 0.12) / 0.62;
  const dy = (y - 0.2) / 0.78;
  pool = 0.55 + 0.55 * Math.exp(-(dx * dx + dy * dy));
}

/** Lights the surface set up by one of the shade* functions above. */
function light(vx: number, vy: number, vz: number) {
  const nx = sNx;
  const ny = sNy;
  const nz = sNz;
  const d1 =
    Math.max(0, nx * KEY_L[0] + ny * KEY_L[1] + nz * KEY_L[2]) * pool;
  const d2 = Math.max(0, nx * FILL_L[0] + ny * FILL_L[1] + nz * FILL_L[2]);
  const o = occl;
  let r = aR * (AMB[0] + (KEY_COL[0] * d1 + FILL_COL[0] * d2) * o);
  let g = aG * (AMB[1] + (KEY_COL[1] * d1 + FILL_COL[1] * d2) * o);
  let b = aB * (AMB[2] + (KEY_COL[2] * d1 + FILL_COL[2] * d2) * o);
  // Blinn highlight of the key, broad sheen under it.
  let hx = KEY_L[0] + vx;
  let hy = KEY_L[1] + vy;
  let hz = KEY_L[2] + vz;
  const hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
  hx /= hl;
  hy /= hl;
  hz /= hl;
  const nh = Math.max(0, nx * hx + ny * hy + nz * hz);
  const sp = (specK * Math.pow(nh, specPow) + sheenK * Math.pow(nh, 4)) * o;
  const mr = 0.34 + (aR * 2.2 - 0.34) * metal;
  const mg = 0.3 + (aG * 2.2 - 0.3) * metal;
  const mb = 0.26 + (aB * 2.2 - 0.26) * metal;
  r += sp * KEY_COL[0] * mr;
  g += sp * KEY_COL[1] * mg;
  b += sp * KEY_COL[2] * mb;
  // The cold of the universe round its edges.
  const nv = Math.max(0, nx * vx + ny * vy + nz * vz);
  const fr = Math.pow(1 - nv, 3.2) * 0.55;
  r += RIM_COL[0] * fr * (0.3 + aR);
  g += RIM_COL[1] * fr * (0.3 + aG);
  b += RIM_COL[2] * fr * (0.3 + aB);
  oR = r;
  oG = g;
  oB = b;
}

/** Soft shoulder on the top end, so highlights roll off rather than clip. */
function tone(c: number) {
  const x = c < 0 ? 0 : c;
  return x < 0.8 ? x : 0.8 + (0.2 * (x - 0.8)) / (0.2 + (x - 0.8));
}

const DIR = [0, 0, 0];

/** Casts one ray through the canvas point (px, py), in CSS px, and shades
 *  what it hits. Returns the material id (0: nothing). */
function sample(art: Job, px: number, py: number) {
  const F = art.focal;
  const wx = (px - art.ox) / F;
  const wy = -(py - art.oy) / F;
  toLocal(wx, wy, -1, DIR);
  const dx = DIR[0];
  const dy = DIR[1];
  const dz = DIR[2];
  const ox = art.camL[0];
  const oy = art.camL[1];
  const oz = art.camL[2];
  const id = trace(ox, oy, oz, dx, dy, dz);
  if (id === ID_NONE) return ID_NONE;
  const t = hT;
  const x = ox + dx * t;
  const y = oy + dy * t;
  const z = oz + dz * t;
  const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const vx = -dx / dl;
  const vy = -dy / dl;
  const vz = -dz / dl;
  lightPool(x, y);
  switch (id) {
    case ID_COVER:
      shadeCover(x, y);
      break;
    case ID_EDGE:
      shadeEdge(x, y, z, hFace, false);
      break;
    case ID_BACK:
      if (hFace === 5) shadeTurnIn(x, y);
      else shadeEdge(x, y, z, hFace, true);
      break;
    case ID_PAGES:
      shadePages(x, y, z, hFace);
      break;
    case ID_SPINE:
    case ID_BAND:
      shadeSpine(x, y, z, id);
      break;
    default:
      shadeCap(x, z);
  }
  light(vx, vy, vz);
  return id;
}

/* ------------------------------------------------------------------ *
 * The render job
 * ------------------------------------------------------------------ */

export type BookArt = {
  /** The finished book, at `res` device px per CSS px. */
  canvas: HTMLCanvasElement;
  /** Book height it was rendered for, CSS px. */
  bookPx: number;
  /** CSS size of the canvas. */
  w: number;
  h: number;
  res: number;
  /** Where its visual centre is in the canvas, CSS px. */
  ax: number;
  ay: number;
  /** Where the book's own origin projects to in the canvas, CSS px, and
   *  the focal length it was cast with -- the live book's camera. */
  ox: number;
  oy: number;
  focal: number;
  /** Covered area, CSS px^2. */
  area: number;
  /** Places on its surface, relative to (ax, ay) in CSS px: the structure
   *  first (silhouette and the lines where faces meet), then a scatter over
   *  its faces. rgb is the book's own colour there. */
  tx: Float32Array;
  ty: Float32Array;
  tr: Uint8Array;
  tg: Uint8Array;
  tb: Uint8Array;
  edgeCount: number;
  count: number;
};

type Job = {
  art: BookArt | null;
  bookPx: number;
  res: number;
  targets: number;
  focal: number;
  /** Where the book's origin projects to, CSS px in the canvas. */
  ox: number;
  oy: number;
  camL: number[];
  cw: number;
  ch: number;
  wCss: number;
  hCss: number;
  data: ImageData;
  ids: Uint8Array;
  row: number;
  phase: 0 | 1 | 2;
  /** grainFine for this build (module state, shared with the bake). */
  fine: number;
};

export type BookArtJob = {
  /** Renders for about `budgetMs`; true once the art is finished. */
  step: (budgetMs: number) => boolean;
  /** The finished art, or null while it is still being painted. */
  result: () => BookArt | null;
  bookPx: number;
};

/** Points the book's silhouette can reach, for sizing its canvas. */
function extentPoints() {
  const pts: Array<[number, number, number]> = [];
  for (const y of [-0.5, 0.5]) {
    for (const x of [X0, X0 + BW]) {
      for (const z of [-HT, HT]) pts.push([x, y, z]);
    }
    for (let i = 0; i <= 16; i++) {
      const phi = -Math.PI / 2 + (Math.PI * i) / 16;
      pts.push([X0 - (SB + BAND_E) * Math.cos(phi), y, HT * Math.sin(phi)]);
    }
  }
  return pts;
}

/** The finest octave of grain fades out as its cycles near a couple of
 *  device pixels, so a small book is never noisier than a large one. */
function fineFor(bookPx: number, res: number) {
  const pxPerCycle = (bookPx * res) / GRAIN_F2;
  return clamp((pxPerCycle - 1.6) / 2.4, 0, 1);
}

export function createBookArt(
  bookPx: number,
  res: number,
  targets: number
): BookArtJob {
  const focal = bookPx * CAM_D;
  const W = [0, 0, 0];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y, z] of extentPoints()) {
    toWorld(x, y, z, W);
    const k = focal / (CAM_D - W[2]);
    const sx = W[0] * k;
    const sy = -W[1] * k;
    minX = Math.min(minX, sx);
    maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy);
    maxY = Math.max(maxY, sy);
  }
  const pad = 3;
  const wCss = Math.ceil(maxX - minX + pad * 2);
  const hCss = Math.ceil(maxY - minY + pad * 2);
  const cw = Math.max(1, Math.round(wCss * res));
  const ch = Math.max(1, Math.round(hCss * res));
  const camL = [0, 0, 0];
  toLocal(0, 0, CAM_D, camL);

  const fine = fineFor(bookPx, res);

  const job: Job = {
    art: null,
    bookPx,
    res,
    targets,
    focal,
    ox: -minX + pad,
    oy: -minY + pad,
    camL,
    cw,
    ch,
    wCss,
    hCss,
    data: new ImageData(cw, ch),
    ids: new Uint8Array(cw * ch),
    row: 0,
    phase: 0,
    fine,
  };

  const step = (budgetMs: number) => {
    if (job.art) return true;
    grainFine = job.fine;
    const until = performance.now() + budgetMs;
    const px = job.data.data;
    const inv = 1 / res;
    // Pass 1: one ray through the middle of every pixel.
    while (job.phase === 0) {
      const j = job.row;
      for (let i = 0; i < cw; i++) {
        const id = sample(job, (i + 0.5) * inv, (j + 0.5) * inv);
        const o = (j * cw + i) * 4;
        job.ids[j * cw + i] = id;
        if (id !== ID_NONE) {
          px[o] = tone(oR) * 255;
          px[o + 1] = tone(oG) * 255;
          px[o + 2] = tone(oB) * 255;
          px[o + 3] = 255;
        }
      }
      job.row++;
      if (job.row >= ch) {
        job.row = 0;
        job.phase = 1;
      }
      if (performance.now() > until) return false;
    }
    // Pass 2: wherever the material changes -- the silhouette above all --
    // four rays instead of one, so no edge of it is ever stair-stepped.
    while (job.phase === 1) {
      const j = job.row;
      for (let i = 0; i < cw; i++) {
        const id = job.ids[j * cw + i];
        const r = i + 1 < cw ? job.ids[j * cw + i + 1] : ID_NONE;
        const d = j + 1 < ch ? job.ids[(j + 1) * cw + i] : ID_NONE;
        const l = i > 0 ? job.ids[j * cw + i - 1] : ID_NONE;
        const u = j > 0 ? job.ids[(j - 1) * cw + i] : ID_NONE;
        if (id === r && id === d && id === l && id === u) continue;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let sa = 0;
        for (let k = 0; k < 4; k++) {
          const ox = (k & 1 ? 0.75 : 0.25) + (k >> 1 ? 0.06 : -0.06);
          const oy = k >> 1 ? 0.75 : 0.25;
          const sid = sample(job, (i + ox) * inv, (j + oy) * inv);
          if (sid !== ID_NONE) {
            sr += tone(oR);
            sg += tone(oG);
            sb += tone(oB);
            sa += 1;
          }
        }
        const o = (j * cw + i) * 4;
        // Colour averaged over what the rays hit; alpha is how many did.
        if (sa > 0) {
          px[o] = (sr / sa) * 255;
          px[o + 1] = (sg / sa) * 255;
          px[o + 2] = (sb / sa) * 255;
        }
        px[o + 3] = (sa / 4) * 255;
      }
      job.row++;
      if (job.row >= ch) job.phase = 2;
      if (performance.now() > until) return false;
    }
    job.art = finish(job);
    return true;
  };

  return {
    step,
    result: () => job.art,
    bookPx,
  };
}

function finish(job: Job): BookArt {
  const { cw, ch, res, ids } = job;
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const cctx = canvas.getContext("2d");
  cctx?.putImageData(job.data, 0, 0);

  // Where the surface is. Edges: any pixel whose material differs from a
  // neighbour's -- the silhouette, the joint, the bands, the board edges.
  const px = job.data.data;
  const edge: number[] = [];
  const fill: number[] = [];
  let covered = 0;
  for (let j = 1; j < ch - 1; j++) {
    for (let i = 1; i < cw - 1; i++) {
      const k = j * cw + i;
      const id = ids[k];
      if (id === ID_NONE) continue;
      if (px[k * 4 + 3] > 128) covered++;
      if (
        id !== ids[k + 1] ||
        id !== ids[k - 1] ||
        id !== ids[k + cw] ||
        id !== ids[k - cw]
      ) {
        edge.push(k);
      } else {
        fill.push(k);
      }
    }
  }

  const rng = makeRng(0xb00c5eed);
  const total = job.targets;
  const edgeN = Math.min(edge.length, Math.round(total * 0.2));
  const fillN = Math.min(fill.length, total - edgeN);
  const count = edgeN + fillN;
  const tx = new Float32Array(count);
  const ty = new Float32Array(count);
  const tr = new Uint8Array(count);
  const tg = new Uint8Array(count);
  const tb = new Uint8Array(count);
  const ax = job.wCss / 2;
  const ay = job.hCss / 2;
  const put = (n: number, k: number) => {
    const i = k % cw;
    const j = (k / cw) | 0;
    tx[n] = (i + 0.5) / res - ax;
    ty[n] = (j + 0.5) / res - ay;
    tr[n] = px[k * 4];
    tg[n] = px[k * 4 + 1];
    tb[n] = px[k * 4 + 2];
  };
  // Evenly along the structure (a stride through the list, jittered), so
  // the outline arrives whole rather than in clumps.
  for (let n = 0; n < edgeN; n++) {
    const base = (n / edgeN) * edge.length;
    const k = edge[Math.min(edge.length - 1, Math.floor(base + rng() * (edge.length / edgeN)))];
    put(n, k);
  }
  // Stratified over the faces: a jittered grid, so the surface fills in
  // without holes or piles.
  for (let n = 0; n < fillN; n++) {
    const k = fill[Math.floor(((n + rng()) / fillN) * fill.length)];
    put(edgeN + n, k);
  }
  // Shuffle the fill so neighbouring targets are not neighbouring indices.
  for (let n = count - 1; n > edgeN; n--) {
    const m = edgeN + Math.floor(rng() * (n - edgeN + 1));
    swap(tx, n, m);
    swap(ty, n, m);
    swap(tr, n, m);
    swap(tg, n, m);
    swap(tb, n, m);
  }

  return {
    canvas,
    bookPx: job.bookPx,
    w: job.wCss,
    h: job.hCss,
    res,
    ax,
    ay,
    ox: job.ox,
    oy: job.oy,
    focal: job.focal,
    area: covered / (res * res),
    tx,
    ty,
    tr,
    tg,
    tb,
    edgeCount: edgeN,
    count,
  };
}

function swap(a: Float32Array | Uint8Array, i: number, j: number) {
  const t = a[i];
  a[i] = a[j];
  a[j] = t;
}

/* ------------------------------------------------------------------ *
 * The same book, laid flat, for opening it
 * ------------------------------------------------------------------ *
 * The picture above is one fixed pose. Opening the book needs it live --
 * boards that swing, leaves that bend -- so the live book (bookGL) is drawn
 * from these instead: every surface of this one, laid out flat and shaded
 * by the very functions above, stored as what it is made of (its colour,
 * the tilt of its grain and tooling, its gloss) rather than as how it looks
 * lit. Lit the same way in the same pose, it is the same book, which is
 * what lets one hand over to the other without a seam.
 *
 * Two surfaces never showed on the closed book and are new here: the faces
 * of the leaves, and the insides of the boards.
 */

/** The book's measurements and its light, for building it live. */
export const BOOK = {
  BW,
  BT,
  HT,
  SQ,
  SB,
  X0,
  RC,
  BANDS,
  BAND_HW,
  BAND_E,
  YAW,
  PITCH,
  ROLL,
  CAM_D,
  KEY_DIR,
  KEY_COL,
  FILL_DIR,
  FILL_COL,
  AMB,
  RIM_COL,
} as const;

export { bandRaise };

/** Range the baked slopes are stored over (see BookMap.b). */
export const SLOPE_RANGE = 2;

export type BookMap = {
  w: number;
  h: number;
  /** RGBA: albedo, and how much of the direct light reaches it. */
  a: Uint8Array;
  /** RGBA: height slope along u and along v (+-SLOPE_RANGE), gloss
   *  strength, gloss power / 40. */
  b: Uint8Array;
  /** Luminance-alpha: how much of it is gilt, and its sheen / 0.1. */
  c: Uint8Array;
};

export type BookMapKey =
  | "cover"
  | "inner"
  | "edgeFront"
  | "edgeBack"
  | "spine"
  | "cap"
  | "paper"
  | "head"
  | "fore";

export type BookMaps = Record<BookMapKey, BookMap>;

/* --- a board's outline: head, the worn corner, fore-edge, corner, tail --- */

const EDGE_A = BW - RC;
const EDGE_Q = (Math.PI * RC) / 2;
const EDGE_F = 1 - 2 * RC;
/** Length of a board's outer edge, from the hinge at the head round to the
 *  hinge at the tail. */
export const EDGE_LEN = 2 * EDGE_A + 2 * EDGE_Q + EDGE_F;

/** The point p along a board's outer edge. out: [u from the hinge, y, and
 *  the edge's outward normal in (u, y)]. */
export function edgePoint(p: number, out: number[]) {
  if (p <= EDGE_A) {
    out[0] = p;
    out[1] = 0.5;
    out[2] = 0;
    out[3] = 1;
    return;
  }
  p -= EDGE_A;
  if (p <= EDGE_Q) {
    const a = Math.PI / 2 - p / RC;
    out[0] = EDGE_A + RC * Math.cos(a);
    out[1] = 0.5 - RC + RC * Math.sin(a);
    out[2] = Math.cos(a);
    out[3] = Math.sin(a);
    return;
  }
  p -= EDGE_Q;
  if (p <= EDGE_F) {
    out[0] = BW;
    out[1] = 0.5 - RC - p;
    out[2] = 1;
    out[3] = 0;
    return;
  }
  p -= EDGE_F;
  if (p <= EDGE_Q) {
    const a = -p / RC;
    out[0] = EDGE_A + RC * Math.cos(a);
    out[1] = -0.5 + RC + RC * Math.sin(a);
    out[2] = Math.cos(a);
    out[3] = Math.sin(a);
    return;
  }
  p -= EDGE_Q;
  out[0] = Math.max(0, EDGE_A - p);
  out[1] = -0.5;
  out[2] = 0;
  out[3] = -1;
}

/* --- the two new surfaces --- */

const LEAF = [0.56, 0.49, 0.37] as const;
const FOX = [0.55, 0.35, 0.21] as const;

/** A leaf's face: hand-made laid paper gone the colour of old ivory, toned
 *  in from its edges and foxed in drifts. Blank. u from the spine, v up
 *  from the tail, in book heights. */
function shadePaper(u: number, v: number) {
  const pl = BW - SQ;
  const ph = 1 - 2 * SQ;
  setAlbedo(LEAF[0], LEAF[1], LEAF[2]);
  specK = 0.035;
  specPow = 9;
  sheenK = 0.02;
  metal = 0;
  // The cloudy look-through of paper formed by hand.
  let k = 0.955 + 0.05 * fbm2(u * 9 + 13, v * 9 - 4);
  // Laid lines, close together, and the chain lines across them.
  k *= 1 - 0.014 * (0.5 + 0.5 * Math.cos(v * 590));
  const cu = ((u + 0.011) % 0.056) - 0.028;
  k *= 1 - 0.035 * groove(cu, 0.0016);
  aR *= k;
  aG *= k;
  aB *= k;
  // Toning, in from the edges that were exposed.
  const edge = Math.min(pl - u, v, ph - v) + 0.012 * vn(u * 16 + 3, v * 16);
  const toned =
    smoothstep(0.075, 0, edge) * 0.3 +
    0.07 * (0.5 + 0.5 * fbm2(u * 2.2 + 8, v * 2.2));
  aR *= 1 - toned * 0.55;
  aG *= 1 - toned * 0.8;
  aB *= 1 - toned * 1.2;
  // Foxing: small rust spots, gathered in drifts.
  const drift = smoothstep(0.05, 0.55, fbm2(u * 2.6 - 5, v * 2.6 + 1));
  mixAlbedo(
    FOX,
    smoothstep(0.62, 0.8, vn(u * 46 + 2, v * 46 - 7)) * drift * 0.4
  );
  // Fibre, barely there.
  vnD(u * 260 + 7, v * 260 - 3);
  bDu = vdx * 260 * 0.00005;
  bDv = vdy * 260 * 0.00005;
  occl = 1;
}

/** Marbled endpaper, dark with age: small pools of faded indigo, oxblood
 *  and ochre, finely combed through with paler veins. */
const MARBLE = [
  [0.15, 0.15, 0.2],
  [0.27, 0.14, 0.1],
  [0.37, 0.29, 0.18],
  [0.46, 0.41, 0.32],
] as const;

function marble(u: number, v: number) {
  let x = u * 13;
  let y = v * 13;
  const wx = fbm2(x * 0.9 + 3.1, y * 0.9 - 2.3);
  const wy = fbm2(x * 0.9 - 7.7, y * 0.9 + 5.2);
  x += 1.3 * wx;
  y += 1.3 * wy;
  const n = fbm2(x * 1.4 + 11, y * 1.4 - 6);
  const t1 = smoothstep(-0.3, -0.08, n);
  const t2 = smoothstep(0.1, 0.32, n);
  let r = MARBLE[0][0] + (MARBLE[1][0] - MARBLE[0][0]) * t1;
  let g = MARBLE[0][1] + (MARBLE[1][1] - MARBLE[0][1]) * t1;
  let b = MARBLE[0][2] + (MARBLE[1][2] - MARBLE[0][2]) * t1;
  r += (MARBLE[2][0] - r) * t2;
  g += (MARBLE[2][1] - g) * t2;
  b += (MARBLE[2][2] - b) * t2;
  const vein = 1 - Math.abs(Math.sin((x * 2.1 + y * 3.3) * 2.6 + 3 * n));
  const vw = smoothstep(0.9, 0.985, vein) * 0.4;
  r += (MARBLE[3][0] - r) * vw;
  g += (MARBLE[3][1] - g) * vw;
  b += (MARBLE[3][2] - b) * vw;
  // Faded and yellowed: a good part of the colour has gone to brown.
  const grey = (r + g + b) / 3;
  r = grey + (r - grey) * 0.6 + 0.03;
  g = grey + (g - grey) * 0.6 + 0.01;
  b = grey + (b - grey) * 0.6 - 0.02;
  setAlbedo(r * 0.8, g * 0.8, b * 0.8);
}

/** Depth of the leather turned in over the head, tail and fore-edge of a
 *  board's inside, in book heights. */
const TURN_IN = 0.052;

/** The inside of a board: the cover's leather turned in round three edges,
 *  and the marbled endpaper pasted down over the rest, running into the
 *  joint at the hinge. u from the hinge, v up from the tail. */
function shadeInner(u: number, v: number) {
  const d = Math.min(BW - u, v, 1 - v) + 0.003 * vn(u * 50 + 1, v * 50 - 2);
  const onLeather = smoothstep(TURN_IN + 0.0015, TURN_IN - 0.0015, d);
  // The leather.
  setAlbedo(COVER[0] * 0.95, COVER[1] * 0.95, COVER[2] * 0.95);
  specK = 0.1;
  specPow = 14;
  sheenK = 0.05;
  metal = 0;
  ageLeather(u + 2.7, v - 1.3, 0.35, 0.2);
  grain(u, v, 0.8);
  const lr = aR;
  const lg = aG;
  const lb = aB;
  const lk = specK * (0.7 + 0.6 * grH);
  const ldu = grDu * GRAIN_K;
  const ldv = grDv * GRAIN_K;
  // The paper.
  marble(u, v);
  // The endpaper's own edge casts the least line of shadow on the leather,
  // and it darkens into the joint.
  const lip = groove(d - TURN_IN, 0.002);
  const joint = smoothstep(0.035, 0, u) * 0.4;
  const k = (1 - joint) * (1 - 0.3 * lip);
  const pr = aR * k;
  const pg = aG * k;
  const pb = aB * k;
  const t = onLeather;
  setAlbedo(pr + (lr - pr) * t, pg + (lg - pg) * t, pb + (lb - pb) * t);
  specK = 0.03 + (lk - 0.03) * t;
  specPow = 10 + 4 * t;
  sheenK = 0.02 + 0.03 * t;
  metal = 0;
  bDu = ldu * t;
  bDv = ldv * t;
  occl = 1;
}

/* --- the existing surfaces, at a point of their flattened maps --- */

function spineTexel(mu: number, y: number) {
  const z = -HT + 2 * HT * mu;
  const e = bandRaise(y);
  const a = SB + e;
  const q = z / HT;
  const x = X0 - a * Math.sqrt(Math.max(0, 1 - q * q));
  hNx = -1;
  hNy = 0;
  hNz = 0;
  shadeSpine(x, y, z, e > BAND_E * 0.02 ? ID_BAND : ID_SPINE);
}

function capTexel(mu: number, f: number) {
  const z = -HT + 2 * HT * mu;
  const q = z / HT;
  hNy = 1;
  shadeCap(X0 - f * SB * Math.sqrt(Math.max(0, 1 - q * q)), z);
}

const EP = [0, 0, 0, 0];
function edgeTexel(s: number, t: number, back: boolean) {
  edgePoint(s * EDGE_LEN, EP);
  const face = Math.abs(EP[3]) > Math.abs(EP[2]) ? (EP[3] > 0 ? 3 : 2) : 1;
  const z = (back ? -HT : HT - BT) + t * BT;
  shadeEdge(X0 + EP[0], EP[1], z, face, back);
}

function byte(v: number) {
  return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
}

function writeTexel(m: BookMap, k: number) {
  const o = k * 4;
  m.a[o] = byte(aR);
  m.a[o + 1] = byte(aG);
  m.a[o + 2] = byte(aB);
  m.a[o + 3] = byte(occl);
  m.b[o] = byte(0.5 + (0.5 * bDu) / SLOPE_RANGE);
  m.b[o + 1] = byte(0.5 + (0.5 * bDv) / SLOPE_RANGE);
  m.b[o + 2] = byte(specK);
  m.b[o + 3] = byte(specPow / 40);
  m.c[k * 2] = byte(metal);
  m.c[k * 2 + 1] = byte(sheenK / 0.1);
}

export type BookBake = {
  /** Bakes for about `budgetMs`; true once every map is done. */
  step: (budgetMs: number) => boolean;
  result: () => BookMaps | null;
  bookPx: number;
};

type BakeDef = {
  key: BookMapKey;
  w: number;
  h: number;
  texel: (s: number, t: number) => void;
};

/**
 * Bakes the maps for a book shown `bookPx` CSS px tall at `res` device px
 * per CSS px -- a little finer than that, since the camera goes in closer
 * as it opens. Sliced like the art, for idle time; the cover first.
 */
export function createBookBake(bookPx: number, res: number): BookBake {
  const R = Math.round(clamp(bookPx * res * 1.3, 360, 1100));
  const fine = fineFor(bookPx, res);
  const pl = BW - SQ;
  const ph = 1 - 2 * SQ;
  const T = HT - BT;
  const r = (x: number) => Math.max(8, Math.round(x));
  const defs: BakeDef[] = [
    {
      key: "cover",
      w: r(BW * R),
      h: R,
      texel: (s, t) => shadeCover(X0 + s * BW, t - 0.5),
    },
    {
      key: "spine",
      w: r(0.36 * R),
      h: R,
      texel: (s, t) => spineTexel(s, t - 0.5),
    },
    {
      key: "head",
      w: r(pl * R * 0.8),
      h: 320,
      texel: (s, t) => shadePages(X0 + s * pl, 0.5 - SQ, -T + 2 * T * t, 3),
    },
    {
      key: "edgeFront",
      w: r(EDGE_LEN * R * 0.7),
      h: 16,
      texel: (s, t) => edgeTexel(s, t, false),
    },
    {
      key: "edgeBack",
      w: r(EDGE_LEN * R * 0.7),
      h: 16,
      texel: (s, t) => edgeTexel(s, t, true),
    },
    {
      key: "paper",
      w: r(pl * R * 0.75),
      h: r(ph * R * 0.75),
      texel: (s, t) => shadePaper(s * pl, t * ph),
    },
    {
      key: "fore",
      w: r(ph * R * 0.8),
      h: 320,
      texel: (s, t) =>
        shadePages(X0 + s * pl, -0.5 + SQ + s * ph, -T + 2 * T * t, 1),
    },
    {
      key: "inner",
      w: r(BW * R * 0.6),
      h: r(R * 0.6),
      texel: (s, t) => shadeInner(s * BW, t),
    },
    { key: "cap", w: 64, h: 32, texel: (s, t) => capTexel(s, t) },
  ];

  const maps: Partial<BookMaps> = {};
  let done: BookMaps | null = null;
  let di = 0;
  let row = 0;
  let cur: BookMap | null = null;

  const step = (budgetMs: number) => {
    if (done) return true;
    const until = performance.now() + budgetMs;
    grainFine = fine;
    while (di < defs.length) {
      const d = defs[di];
      if (!cur) {
        cur = {
          w: d.w,
          h: d.h,
          a: new Uint8Array(d.w * d.h * 4),
          b: new Uint8Array(d.w * d.h * 4),
          c: new Uint8Array(d.w * d.h * 2),
        };
      }
      const t = (row + 0.5) / d.h;
      for (let i = 0; i < d.w; i++) {
        bDu = 0;
        bDv = 0;
        occl = 1;
        d.texel((i + 0.5) / d.w, t);
        writeTexel(cur, row * d.w + i);
      }
      row++;
      if (row >= d.h) {
        maps[d.key] = cur;
        cur = null;
        row = 0;
        di++;
      }
      if (performance.now() > until) break;
    }
    if (di < defs.length) return false;
    done = maps as BookMaps;
    return true;
  };

  return { step, result: () => done, bookPx };
}
