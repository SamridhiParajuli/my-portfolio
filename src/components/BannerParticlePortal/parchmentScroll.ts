/**
 * parchmentScroll
 * ---------------
 * The sheet of parchment the open book becomes once the bird has it
 * (bookFinale): what it rolls itself up into, and unrolls from at the last.
 *
 * Like the book's leaves (bookMesh), it is worked out in the book's own
 * cross-section and stood up along y: one line through the section from
 * its left edge to its right, with a face (the side written on) and a
 * back. At first that line is exactly the two pages lying open -- the
 * left-hand page's face as it curls down into the gutter, and the
 * right-hand page's coming up out of it -- laid with the same paper, in the
 * same place, with the same ink, so it takes their place without a seam.
 * Then the gutter comes up flat, and each half's outer edge curls up off
 * the sheet toward the face and rolls in on itself: an Archimedean spiral
 * that keeps the sheet's length, each turn one thickness inside the last,
 * until the two rolls meet in the middle. Unrolling is the same thing run
 * backwards.
 *
 * At each roll's core, once there is a turn and more of it round there, a
 * roller: old turned wood, its ends coming out past the parchment's head
 * and tail in a brass collar and a turned knob, as an ancient scroll's
 * rollers do. (They are built whole; the shader grows them out, bookGL.)
 */

import { BOOK } from "./antiqueBook";
import { PL, T, YP, slabFacePoint, type BookMesh, type Slab } from "./bookMesh";

/** The sheet's middle, in the book's section: where the gutter was. */
export const XC = BOOK.X0 - T;
/** Half its length once the covers have gone into it. While it is still
 *  the two pages, each half is one page long (PL). */
export const LH_FINAL = 0.86;
/** How far its face stands over the page it takes the place of, and its
 *  back under it. */
export const FACE_LIFT = 0.0016;
const BACK_SINK = 0.0005;
/** Its rolls: the core each is begun round, and how far apart the turns
 *  of it lie. */
const R0 = 0.03;
const DELTA = 0.0065;
/** Samples along each half. */
const NH = 200;
/** A roller: its radius, inside the roll's core; and how it is turned past
 *  the parchment's edge -- [how far past, radius, brass (1) or wood (0)],
 *  out to the tip of its knob. */
const ROD_R = 0.024;
const ROD_END: ReadonlyArray<readonly [number, number, number]> = [
  [0, ROD_R, 0],
  [0.006, ROD_R, 0],
  [0.0075, 0.03, 1],
  [0.019, 0.03, 1],
  [0.0205, 0.018, 0],
  [0.031, 0.019, 0],
  [0.041, 0.03, 0],
  [0.051, 0.036, 0],
  [0.061, 0.033, 0],
  [0.069, 0.022, 0],
  [0.0715, 0.016, 1],
  [0.0745, 0.021, 1],
  [0.0805, 0.014, 1],
  [0.0845, 0.0, 1],
];
/** How far past the parchment's edge a roller reaches. */
export const ROD_EXT = ROD_END[ROD_END.length - 1][0];
/** Segments round a roller. */
const NR = 18;

export type Sheet = {
  /** 0: the open spread's two pages, as they lie. 1: one flat sheet. */
  flat: number;
  /** Half its length. */
  lh: number;
  /** How much of each half is rolled up, from its outer edge in. */
  ell: number;
  /** Its face laid as the parchment it now is, rather than as the two
   *  pages it was. (Only ever changed while the face is rolled away out of
   *  sight.) */
  parch: boolean;
  /** How much of the gutter's shadow is left on it, 0..1. */
  gutter: number;
  /** Whether its rollers are there (grown, or growing) to be built. */
  rods: boolean;
};

export function createSheet(): Sheet {
  return { flat: 0, lh: PL, ell: 0, parch: false, gutter: 1, rods: false };
}

/** The radius of a roll that has `ell` of the sheet in it. */
export function rollRadius(ell: number) {
  return Math.sqrt(R0 * R0 + (Math.max(0, ell) * DELTA) / Math.PI);
}

/** How much of each half is rolled up once the two rolls meet. */
export function closedEll(lh: number) {
  let ell = lh - 0.05;
  for (let i = 0; i < 10; i++) ell = lh - rollRadius(ell);
  return Math.max(0, ell);
}

/** The point of the section `a` along one half from the middle (side -1
 *  left, 1 right). out: [x, z, how far round into its roll it is]. */
function sectionAt(
  sh: Sheet,
  side: number,
  a: number,
  left: Slab,
  right: Slab,
  roll: number,
  out: number[]
) {
  const F = sh.lh - sh.ell;
  let x: number;
  let z: number;
  let wrap = 0;
  if (a <= F) {
    x = XC + side * a;
    z = 0;
  } else {
    // Into the roll: wound from its outermost turn, where it leaves the
    // flat, in toward its edge at the core.
    const R = rollRadius(sh.ell);
    const sig = a - F;
    const r = Math.sqrt(Math.max(R0 * R0, R * R - (sig * DELTA) / Math.PI));
    const th = (2 * Math.PI * (R - r)) / DELTA;
    x = XC + side * (F + r * Math.sin(th));
    z = R - r * Math.cos(th);
    wrap = th;
  }
  if (sh.flat < 1 && a <= PL) {
    // The page this half was, as it lies open.
    slabFacePoint(side > 0 ? right : left, roll, a / PL, side, SF);
    x = SF[0] + (x - SF[0]) * sh.flat;
    z = SF[1] + (z - SF[1]) * sh.flat;
  }
  out[0] = x;
  out[1] = z;
  out[2] = wrap;
}

const SF = [0, 0];
const SA = [0, 0, 0];
const XS = new Float64Array(NH + 1);
const ZS = new Float64Array(NH + 1);
const WS = new Float64Array(NH + 1);

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Builds the sheet into the mesh's two parchment parts (the rest of the
 * mesh is the book's, and left alone). `left` and `right` are the open
 * spread's two uppermost leaves, whose faces it lies on at first.
 */
export function buildSheet(
  m: BookMesh,
  sh: Sheet,
  left: Slab,
  right: Slab,
  roll: number
) {
  const face = m.sheet;
  const back = m.sheetBack;
  face.reset();
  back.reset();
  const lhF = LH_FINAL;
  for (const side of [-1, 1]) {
    for (let k = 0; k <= NH; k++) {
      sectionAt(sh, side, (sh.lh * k) / NH, left, right, roll, SA);
      XS[k] = SA[0];
      ZS[k] = SA[1];
      WS[k] = SA[2];
    }
    const fb = face.nv;
    const bb = back.nv;
    for (let k = 0; k <= NH; k++) {
      const a = (sh.lh * k) / NH;
      // Outward along it, from the middle.
      const k0 = Math.max(0, k - 1);
      const k1 = Math.min(NH, k + 1);
      let tx = XS[k1] - XS[k0];
      let tz = ZS[k1] - ZS[k0];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      // Left to right, and the face's side of it.
      const sx = side * tx;
      const sz = side * tz;
      const nx = -sz;
      const nz = sx;
      const s = side * a;
      const wrap = WS[k];
      // As the two pages: each laid out from the spine, as the book lays
      // them (bookMesh), the right-hand one upside down; past a page's
      // length -- only ever inside a roll -- the map mirrored back.
      let u0 = a / PL;
      if (u0 > 1) u0 = Math.max(0, 2 - u0);
      const pu = side > 0 ? u0 : 0.03 + u0 * 0.97;
      // As itself: across it, left to right.
      const qu = (s + lhF) / (2 * lhF);
      // The gutter's shadow; and, curled over into its roll, the face is
      // in the roll's own.
      let occ =
        1 - sh.gutter * 0.5 * (1 - smoothstep(0, 0.14, a)) ** 1.4;
      occ *= 1 - 0.5 * smoothstep(0.4, 2.2, wrap);
      const backOcc =
        1 - 0.45 * smoothstep(2 * Math.PI - 0.8, 2 * Math.PI + 0.6, wrap);
      const onExp = !sh.parch && side > 0 && a <= PL;
      for (const y of [-YP, YP]) {
        const v0 = (y + YP) / (2 * YP);
        face.vert(
          XS[k] + nx * FACE_LIFT,
          y,
          ZS[k] + nz * FACE_LIFT,
          nx,
          0,
          nz,
          sh.parch ? sx : tx,
          0,
          sh.parch ? sz : tz,
          0,
          1,
          0,
          sh.parch ? qu : pu,
          sh.parch || side < 0 ? v0 : 1 - v0,
          occ,
          1,
          1,
          onExp ? (2 + a / PL) / 3 : -1,
          onExp ? 1 - v0 : -1,
          onExp ? 1 : 0,
          0,
          qu,
          1 - v0,
          sh.parch ? 1 : 0
        );
        back.vert(
          XS[k] - nx * BACK_SINK,
          y,
          ZS[k] - nz * BACK_SINK,
          -nx,
          0,
          -nz,
          sx,
          0,
          sz,
          0,
          1,
          0,
          qu,
          v0,
          backOcc,
          0.2,
          1,
          -1,
          -1,
          0,
          0,
          qu,
          1 - v0,
          0
        );
      }
    }
    for (let k = 0; k < NH; k++) {
      const i = fb + k * 2;
      face.quad(i, i + 1, i + 3, i + 2);
      const j = bb + k * 2;
      back.quad(j, j + 1, j + 3, j + 2);
    }
  }
  buildRods(m, sh);
}

/** The roller's profile, tip to tip: [y, radius, brass], book space. */
const PROF: Array<[number, number, number]> = [];
for (let i = ROD_END.length - 1; i >= 0; i--) {
  const [e, r, b] = ROD_END[i];
  PROF.push([-YP - e, r, b]);
}
for (const [e, r, b] of ROD_END) PROF.push([YP + e, r, b]);
/** Each ring's normal in the profile's own plane: [out, up]. */
const PNRM = PROF.map((_, i) => {
  const a = PROF[Math.max(0, i - 1)];
  const b = PROF[Math.min(PROF.length - 1, i + 1)];
  const dy = b[0] - a[0];
  const dr = b[1] - a[1];
  const l = Math.hypot(dy, dr) || 1;
  return [dy / l, -dr / l] as const;
});

/** Where a roller's axis is: at the core of its roll. out: [x, z]. */
function rodAxis(sh: Sheet, side: number, out: number[]) {
  out[0] = XC + side * (sh.lh - sh.ell);
  out[1] = rollRadius(sh.ell);
}

const AX = [0, 0];

/** The two rollers, into the mesh's own part for them -- once there is a
 *  roll for each to be the core of. */
function buildRods(m: BookMesh, sh: Sheet) {
  const rod = m.rod;
  rod.reset();
  if (!sh.rods || sh.ell <= 0) return;
  for (const side of [-1, 1]) {
    rodAxis(sh, side, AX);
    const base = rod.nv;
    for (let i = 0; i < PROF.length; i++) {
      const [y, r, brass] = PROF[i];
      const [no, nu] = PNRM[i];
      for (let j = 0; j <= NR; j++) {
        const a = (2 * Math.PI * j) / NR;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        rod.vert(
          AX[0] + r * ca,
          y,
          AX[1] + r * sa,
          no * ca,
          nu,
          no * sa,
          -sa,
          0,
          ca,
          0,
          1,
          0,
          j / NR,
          brass,
          1,
          0,
          0
        );
      }
    }
    for (let i = 0; i < PROF.length - 1; i++) {
      for (let j = 0; j < NR; j++) {
        const a = base + i * (NR + 1) + j;
        rod.quad(a, a + 1, a + NR + 2, a + NR + 1);
      }
    }
  }
}

/** Where a roller's end has grown to, `grow` of the way out past the
 *  parchment's edge (end -1 the tail, 1 the head), book space. out:
 *  [x, y, z]. */
export function rodTip(sh: Sheet, side: number, end: number, grow: number, out: number[]) {
  rodAxis(sh, side, AX);
  out[0] = AX[0];
  out[1] = end * (YP + ROD_EXT * Math.min(1, Math.max(0, grow)));
  out[2] = AX[1];
}

/** Where one of its rolls is, `hf` of the way up it (0 tail, 1 head), in
 *  book space -- on its axis, or, before it has begun, at the sheet's
 *  outer edge. out: [x, y, z]. */
export function rollPoint(sh: Sheet, side: number, hf: number, out: number[]) {
  const R = rollRadius(sh.ell);
  const roll = Math.min(1, sh.ell / 0.02);
  out[0] = XC + side * (sh.lh - sh.ell);
  out[1] = -YP + 2 * YP * hf;
  out[2] = R * roll;
}

/** A point of the face as it lies open and flat: `s` across it from the
 *  middle, `y` up it. out: [x, y, z]. */
export function sheetPoint(s: number, y: number, out: number[]) {
  out[0] = XC + s;
  out[1] = y;
  out[2] = FACE_LIFT;
}
