/**
 * bookMesh
 * --------
 * The antique book (antiqueBook) as a thing that can open: two rigid
 * boards, a leather spine that rolls, and between them the text block as a
 * stack of leaves sewn along the spine.
 *
 * Everything is worked out in the book's cross-section (x toward the
 * fore-edge, z out of the front cover) and stood up along y. Each leaf is
 * one line in that section, fixed at its end to the text block's spine --
 * a straight edge, upright while the book is shut, which rolls over through
 * a quarter turn about the back board's hinge as the book lies open, the
 * way a real spine turns under an opened book. From there each leaf curls
 * round one of two centres -- the back board's hinge when it lies to the
 * right, the front board's when it has gone over to the left -- and runs
 * on straight, bent a little further toward its free end by however the
 * air is dragging at it. Leaves round the same centre are concentric, so
 * however they fan they never pass through one another, and a stack of
 * them keeps its thickness through the curl of the gutter.
 *
 * `lambda` is where a leaf lies in the block: 0 against the back board, 1
 * against the front. A slab is a run of it, drawn as one: the whole right
 * half of the block that never moves, a handful of pages together, or a
 * single leaf.
 *
 * Shut, every leaf lies flat and square, so the book this builds is
 * exactly the closed book the art was ray-cast from.
 */

import { BOOK, EDGE_LEN, bandRaise, edgePoint } from "./antiqueBook";

const { BW, BT, HT, SQ, SB, X0, BANDS, BAND_HW } = BOOK;

/** Half the text block's thickness. */
export const T = HT - BT;
/** A leaf's width, spine to fore-edge. */
export const PL = BW - SQ;
/** Half a leaf's height. */
export const YP = 0.5 - SQ;

/** Floats per vertex: position, normal, the two texture tangents, uv, aux
 *  (occlusion, how much page light it catches, how thin it is), and where
 *  it is on the written pages, if it is on one (bookSpread; x -1 if not):
 *  x and y on the map, which way the map runs across it, and whether it is
 *  the leaf being turned (which casts the shadow, and so takes none). */
export const STRIDE = 21;

/** The written pages' map holds this many pages side by side (bookSpread). */
export const INK_PAGES = 3;

export type Slab = {
  /** Its run of the block: 0 is the back board, 1 the front. */
  lo: number;
  hi: number;
  /** 0 lying to the right, as it lies shut; pi gone over to the left. */
  turn: number;
  /** Radians the free end is bent on past the turn (drag makes it < 0). */
  curl: number;
  /** A ripple along it, radians. */
  wave: number;
  /** How much of the light in the pages its faces carry, 0..1. */
  glow: number;
  /** One leaf: light comes through it. */
  thin: boolean;
  /** Which way round the paper map is laid, so no two leaves are alike. */
  flip: number;
  /** Which written page is printed on its face toward the front board, and
   *  on its face toward the back (a page of the map, -1 for none). The
   *  front face looks up while it lies to the right; the back, once it has
   *  gone over to the left. */
  inkFront: number;
  inkBack: number;
  /** The leaf being turned: it throws its shadow on the rest (bookGL). */
  caster: boolean;
};

export type BookShape = {
  /** How far the spine has rolled: 0 shut, pi/2 lying open. */
  roll: number;
  /** The front board's turn, 0..pi. */
  cover: number;
  slabs: Slab[];
};

export type PartKey =
  | "cover"
  | "inner"
  | "edgeFront"
  | "edgeBack"
  | "spine"
  | "cap"
  | "paper"
  | "head"
  | "fore";

export const PART_KEYS: PartKey[] = [
  "cover",
  "inner",
  "edgeFront",
  "edgeBack",
  "spine",
  "cap",
  "paper",
  "head",
  "fore",
];

/** One material's triangles, rebuilt in place whenever the book moves. */
export class Part {
  v = new Float32Array(STRIDE * 256);
  i = new Uint16Array(512);
  nv = 0;
  ni = 0;

  reset() {
    this.nv = 0;
    this.ni = 0;
  }

  vert(
    px: number,
    py: number,
    pz: number,
    nx: number,
    ny: number,
    nz: number,
    ux: number,
    uy: number,
    uz: number,
    vx: number,
    vy: number,
    vz: number,
    u: number,
    v: number,
    occ: number,
    glow: number,
    thin: number,
    pgx = -1,
    pgy = -1,
    pgd = 0,
    cast = 0
  ) {
    if ((this.nv + 1) * STRIDE > this.v.length) {
      const n = new Float32Array(this.v.length * 2);
      n.set(this.v);
      this.v = n;
    }
    const o = this.nv * STRIDE;
    const a = this.v;
    a[o] = px;
    a[o + 1] = py;
    a[o + 2] = pz;
    a[o + 3] = nx;
    a[o + 4] = ny;
    a[o + 5] = nz;
    a[o + 6] = ux;
    a[o + 7] = uy;
    a[o + 8] = uz;
    a[o + 9] = vx;
    a[o + 10] = vy;
    a[o + 11] = vz;
    a[o + 12] = u;
    a[o + 13] = v;
    a[o + 14] = occ;
    a[o + 15] = glow;
    a[o + 16] = thin;
    a[o + 17] = pgx;
    a[o + 18] = pgy;
    a[o + 19] = pgd;
    a[o + 20] = cast;
    return this.nv++;
  }

  tri(a: number, b: number, c: number) {
    if (this.ni + 3 > this.i.length) {
      const n = new Uint16Array(this.i.length * 2);
      n.set(this.i);
      this.i = n;
    }
    this.i[this.ni++] = a;
    this.i[this.ni++] = b;
    this.i[this.ni++] = c;
  }

  quad(a: number, b: number, c: number, d: number) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }
}

export type BookMesh = Record<PartKey, Part>;

export function createBookMesh(): BookMesh {
  const m = {} as BookMesh;
  for (const k of PART_KEYS) m[k] = new Part();
  return m;
}

/* ------------------------------------------------------------------ *
 * A leaf's line through the section
 * ------------------------------------------------------------------ */

/** Samples round the curl, then along the straight. */
const NA = 8;
const NS = 22;
const NC = NA + NS + 1;
const CX = new Float64Array(NC);
const CZ = new Float64Array(NC);
const CA = new Float64Array(NC);
const CS = new Float64Array(NC);

function bend(q: number, curl: number, wave: number) {
  return curl * Math.pow(q, 1.7) + wave * Math.sin(2 * Math.PI * q) * q;
}

/**
 * The leaf at `lc` in the block, turned `turn`, with the spine rolled
 * `roll`: into CX/CZ (position), CA (direction) and CS (distance along it
 * from the spine).
 */
function leafLine(
  lc: number,
  turn: number,
  curl: number,
  wave: number,
  roll: number
) {
  const sr = Math.sin(roll);
  const cr = Math.cos(roll);
  let cx: number;
  let cz: number;
  let r: number;
  let beta: number;
  let sign: number;
  if (turn <= roll) {
    // Still lying to the right: round the back board's hinge.
    cx = X0;
    cz = -T;
    r = 2 * T * lc;
    beta = roll - turn;
    sign = -1;
  } else {
    // Gone over: round the front board's hinge, wherever the spine has
    // carried it.
    cx = X0 - 2 * T * sr;
    cz = -T + 2 * T * cr;
    r = 2 * T * (1 - lc);
    beta = turn - roll;
    sign = 1;
  }
  if (r < 0) r = 0;
  for (let k = 0; k <= NA; k++) {
    const f = k / NA;
    const a = roll + sign * beta * f;
    const s = Math.sin(a);
    const c = Math.cos(a);
    if (sign < 0) {
      CX[k] = cx - r * s;
      CZ[k] = cz + r * c;
    } else {
      CX[k] = cx + r * s;
      CZ[k] = cz - r * c;
    }
    CA[k] = a;
    CS[k] = r * beta * f;
  }
  const arc = r * beta;
  const ls = Math.max(0, PL - arc);
  const ds = ls / NS;
  let x = CX[NA];
  let z = CZ[NA];
  for (let k = 1; k <= NS; k++) {
    const am = turn + bend((k - 0.5) / NS, curl, wave);
    x += ds * Math.cos(am);
    z += ds * Math.sin(am);
    CX[NA + k] = x;
    CZ[NA + k] = z;
    CA[NA + k] = turn + bend(k / NS, curl, wave);
    CS[NA + k] = arc + ds * k;
  }
}

/** Where a slab's free end is, in the section, and which way it points --
 *  for the dust it sheds. out: [x, z, angle]. */
export function slabTip(s: Slab, roll: number, out: number[]) {
  leafLine((s.lo + s.hi) / 2, s.turn, s.curl, s.wave, roll);
  out[0] = CX[NC - 1];
  out[1] = CZ[NC - 1];
  out[2] = CA[NC - 1];
}

/** A point on a slab's face: `u` of the way from the spine to the free end.
 *  out: [x, z]. */
export function slabPoint(s: Slab, roll: number, u: number, out: number[]) {
  leafLine((s.lo + s.hi) / 2, s.turn, s.curl, s.wave, roll);
  const f = Math.min(NC - 1.001, Math.max(0, u * (NC - 1)));
  const k = Math.floor(f);
  const t = f - k;
  out[0] = CX[k] + (CX[k + 1] - CX[k]) * t;
  out[1] = CZ[k] + (CZ[k + 1] - CZ[k]) * t;
}

/**
 * A point on one face of a slab, `u` of the way from the spine to the free
 * end as the leaf's own length goes (as the paper map is laid), on the
 * side toward the front board (1) or the back (-1). out: [x, z].
 */
export function slabFacePoint(
  s: Slab,
  roll: number,
  u: number,
  side: number,
  out: number[]
) {
  leafLine((s.lo + s.hi) / 2, s.turn, s.curl, s.wave, roll);
  const h = (s.hi - s.lo) * T;
  const d = Math.min(1, Math.max(0, u)) * PL;
  let k = 0;
  while (k < NC - 2 && CS[k + 1] < d) k++;
  const len = CS[k + 1] - CS[k];
  const f = len > 0 ? Math.min(1, (d - CS[k]) / len) : 0;
  const a = CA[k] + (CA[k + 1] - CA[k]) * f;
  out[0] = CX[k] + (CX[k + 1] - CX[k]) * f - side * h * Math.sin(a);
  out[1] = CZ[k] + (CZ[k + 1] - CZ[k]) * f + side * h * Math.cos(a);
}

/**
 * The line of a slab through the section, `n` points from the spine to the
 * free end, evenly along its length -- for the shadow it throws. out: x, z
 * pairs.
 */
export function slabSection(
  s: Slab,
  roll: number,
  n: number,
  out: Float32Array
) {
  leafLine((s.lo + s.hi) / 2, s.turn, s.curl, s.wave, roll);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const d = (CS[NC - 1] * i) / (n - 1);
    while (k < NC - 2 && CS[k + 1] < d) k++;
    const len = CS[k + 1] - CS[k];
    const f = len > 0 ? Math.min(1, (d - CS[k]) / len) : 0;
    out[i * 2] = CX[k] + (CX[k + 1] - CX[k]) * f;
    out[i * 2 + 1] = CZ[k] + (CZ[k + 1] - CZ[k]) * f;
  }
}

/* ------------------------------------------------------------------ *
 * Slabs of leaves
 * ------------------------------------------------------------------ */

function slab(m: BookMesh, s: Slab, roll: number, gutter: number) {
  const lc = (s.lo + s.hi) / 2;
  const h = (s.hi - s.lo) * T;
  leafLine(lc, s.turn, s.curl, s.wave, roll);
  const thin = s.thin ? 1 : 0;
  const flipU = s.flip & 1;
  const flipV = s.flip & 2;
  // The edges of the pages at the split carry some of its light out.
  const edgeGlow = s.glow * 0.6 * Math.exp(-(((lc - 0.5) / 0.08) ** 2));
  // The written pages are one map, page after page across it, each reading
  // across its face as that lies once it looks up: the back face over on
  // the left, in toward the gutter (against the leaf's own u, which runs
  // out from the spine); the front face on the right, out from it. bookGL
  // counts on that.
  const cast = s.caster ? 1 : 0;

  /* faces: +h is the side toward the front board, -h toward the back */
  const paper = m.paper;
  for (const side of [1, -1]) {
    const base = paper.nv;
    const page = side > 0 ? s.inkFront : s.inkBack;
    for (let k = 0; k < NC; k++) {
      const a = CA[k];
      const nx = -Math.sin(a);
      const nz = Math.cos(a);
      const tx = Math.cos(a);
      const tz = Math.sin(a);
      const px = CX[k] + side * h * nx;
      const pz = CZ[k] + side * h * nz;
      const u0 = CS[k] / PL;
      const u = flipU ? 0.03 + u0 * 0.97 : u0;
      // Down in the gutter the pages are in each other's shadow.
      const occ =
        1 - gutter * 0.5 * (1 - smoothstep(0, 0.14, CS[k])) ** 1.4;
      const pgx =
        page < 0 ? -1 : (page + (side > 0 ? u0 : 1 - u0)) / INK_PAGES;
      for (const y of [-YP, YP]) {
        const v0 = (y + YP) / (2 * YP);
        paper.vert(
          px,
          y,
          pz,
          side * nx,
          0,
          side * nz,
          tx,
          0,
          tz,
          0,
          1,
          0,
          u,
          flipV ? 1 - v0 : v0,
          occ,
          s.glow,
          thin,
          pgx,
          page < 0 ? -1 : 1 - v0,
          side,
          cast
        );
      }
    }
    for (let k = 0; k < NC - 1; k++) {
      const i = base + k * 2;
      paper.quad(i, i + 1, i + 3, i + 2);
    }
  }

  /* head and tail: the leaves' edges, between the two faces */
  const head = m.head;
  for (const ys of [1, -1]) {
    const base = head.nv;
    for (let k = 0; k < NC; k++) {
      const a = CA[k];
      const nx = -Math.sin(a);
      const nz = Math.cos(a);
      const tx = Math.cos(a);
      const tz = Math.sin(a);
      for (const side of [-1, 1]) {
        head.vert(
          CX[k] + side * h * nx,
          ys * YP,
          CZ[k] + side * h * nz,
          0,
          ys,
          0,
          tx,
          0,
          tz,
          nx,
          0,
          nz,
          CS[k] / PL,
          side < 0 ? s.lo : s.hi,
          1,
          edgeGlow,
          0,
          -1,
          -1,
          0,
          cast
        );
      }
    }
    for (let k = 0; k < NC - 1; k++) {
      const i = base + k * 2;
      head.quad(i, i + 1, i + 3, i + 2);
    }
  }

  /* the fore-edge */
  const fore = m.fore;
  const k = NC - 1;
  const a = CA[k];
  const nx = -Math.sin(a);
  const nz = Math.cos(a);
  const fx = Math.cos(a);
  const fz = Math.sin(a);
  const base = fore.nv;
  for (const side of [-1, 1]) {
    for (const y of [-YP, YP]) {
      fore.vert(
        CX[k] + side * h * nx,
        y,
        CZ[k] + side * h * nz,
        fx,
        0,
        fz,
        0,
        1,
        0,
        nx,
        0,
        nz,
        (y + YP) / (2 * YP),
        side < 0 ? s.lo : s.hi,
        1,
        edgeGlow,
        0,
        -1,
        -1,
        0,
        cast
      );
    }
  }
  fore.quad(base, base + 1, base + 3, base + 2);
}

/* ------------------------------------------------------------------ *
 * The boards
 * ------------------------------------------------------------------ */

/** Stops along a board's outline: the straights need only their ends, the
 *  worn corners a few more. */
const OUTLINE: number[] = (() => {
  const a = BW - BOOK.RC;
  const q = (Math.PI * BOOK.RC) / 2;
  const f = 1 - 2 * BOOK.RC;
  const stops = [0, a, a + q, a + q + f, a + 2 * q + f, EDGE_LEN];
  const div = [2, 6, 2, 6, 2];
  const out: number[] = [];
  for (let s = 0; s < 5; s++) {
    for (let j = 0; j < div[s]; j++) {
      out.push(stops[s] + ((stops[s + 1] - stops[s]) * j) / div[s]);
    }
  }
  out.push(EDGE_LEN);
  return out;
})();

const EPT = [0, 0, 0, 0];

/**
 * A board, hinged at (bx, bz) and turned `a`. The front board sits on the
 * front of the leaf beneath it, the back board behind the back of its own.
 */
function board(m: BookMesh, front: boolean, bx: number, bz: number, a: number) {
  const dx = Math.cos(a);
  const dz = Math.sin(a);
  const nx = -Math.sin(a);
  const nz = Math.cos(a);
  const o0 = front ? 0 : -BT;
  const o1 = front ? BT : 0;
  const oOut = front ? o1 : o0;
  const oIn = front ? o0 : o1;
  const sOut = front ? 1 : -1;
  const px = (u: number, o: number) => bx + u * dx + o * nx;
  const pz = (u: number, o: number) => bz + u * dz + o * nz;

  // The outside, and the inside -- each a fan round the middle.
  for (const [part, o, sn, occ] of [
    [m.cover, oOut, sOut, 1],
    [m.inner, oIn, -sOut, front ? 0.8 : 0.45],
  ] as const) {
    const c = part.vert(
      px(BW / 2, o),
      0,
      pz(BW / 2, o),
      sn * nx,
      0,
      sn * nz,
      dx,
      0,
      dz,
      0,
      1,
      0,
      0.5,
      0.5,
      occ,
      0,
      0
    );
    const first = part.nv;
    const ring = (u: number, y: number) =>
      part.vert(
        px(u, o),
        y,
        pz(u, o),
        sn * nx,
        0,
        sn * nz,
        dx,
        0,
        dz,
        0,
        1,
        0,
        u / BW,
        y + 0.5,
        occ,
        0,
        0
      );
    for (const p of OUTLINE) {
      edgePoint(p, EPT);
      ring(EPT[0], EPT[1]);
    }
    const last = part.nv - 1;
    for (let i = first; i < last; i++) part.tri(c, i, i + 1);
    // ...closed across the hinge.
    part.tri(c, last, first);
  }

  // Round the outside edge, head to fore-edge to tail.
  const edge = front ? m.edgeFront : m.edgeBack;
  const base = edge.nv;
  for (const p of OUTLINE) {
    edgePoint(p, EPT);
    const u = EPT[0];
    const y = EPT[1];
    const enu = EPT[2];
    const eny = EPT[3];
    // The map's own "along": x on the head and tail, y on the fore-edge.
    const alongY = Math.abs(enu) > Math.abs(eny);
    for (const o of [o0, o1]) {
      edge.vert(
        px(u, o),
        y,
        pz(u, o),
        enu * dx,
        eny,
        enu * dz,
        alongY ? 0 : dx,
        alongY ? 1 : 0,
        alongY ? 0 : dz,
        nx,
        0,
        nz,
        p / EDGE_LEN,
        (o - o0) / BT,
        1,
        0,
        0
      );
    }
  }
  for (let j = 0; j < OUTLINE.length - 1; j++) {
    const i = base + j * 2;
    edge.quad(i, i + 1, i + 3, i + 2);
  }
  // ...and the hinge edge itself, which shows only at the joint.
  const hb = edge.nv;
  for (const y of [0.5, -0.5]) {
    for (const o of [o0, o1]) {
      edge.vert(
        px(0, o),
        y,
        pz(0, o),
        -dx,
        0,
        -dz,
        0,
        1,
        0,
        nx,
        0,
        nz,
        0.001,
        (o - o0) / BT,
        1,
        0,
        0
      );
    }
  }
  edge.quad(hb, hb + 1, hb + 3, hb + 2);
}

/* ------------------------------------------------------------------ *
 * The spine
 * ------------------------------------------------------------------ */

/** Round the spine: dense toward the joints, where it turns fastest. */
const NM = 24;
const MU: number[] = Array.from(
  { length: NM + 1 },
  (_, i) => (1 - Math.cos((Math.PI * i) / NM)) / 2
);

/** Up the spine: even, and dense across the flanks of the raised bands so
 *  they stand up in silhouette as well as in the light. */
const YS: number[] = (() => {
  const ys = new Set<number>();
  for (let i = 0; i <= 50; i++) ys.add(-0.5 + i / 50);
  for (const c of BANDS) {
    for (const f of [0.35, 0.5, 0.58, 0.66, 0.74, 0.82, 0.9, 1, 1.15]) {
      ys.add(c - BAND_HW * f);
      ys.add(c + BAND_HW * f);
    }
  }
  return [...ys]
    .filter((y) => y >= -0.5 && y <= 0.5)
    .sort((p, q) => p - q);
})();

const SP_X = new Float64Array((NM + 1) * YS.length);
const SP_Z = new Float64Array((NM + 1) * YS.length);

function spine(m: BookMesh, roll: number, cover: number) {
  const sr = Math.sin(roll);
  const cr = Math.cos(roll);
  // The text block's spine edge runs along e; the leather bulges out along o.
  const ex = -sr;
  const ez = cr;
  const ox = -cr;
  const oz = -sr;
  // Where the joints must meet each board's outer hinge corner.
  const d0x = -BT * sr;
  const d0z = BT * (cr - 1);
  const d1x = BT * (sr - Math.sin(cover));
  const d1z = BT * (Math.cos(cover) - cr);
  const ny = YS.length;
  for (let i = 0; i <= NM; i++) {
    const mu = MU[i];
    const along = -BT + (2 * T + 2 * BT) * mu;
    const lx = X0 + along * ex;
    const lz = -T + along * ez;
    const w0 = 1 - smoothstep(0, 0.35, mu);
    const w1 = smoothstep(0.65, 1, mu);
    const round = Math.sqrt(Math.max(0, 1 - (2 * mu - 1) ** 2));
    for (let j = 0; j < ny; j++) {
      const b = (SB + bandRaise(YS[j])) * round;
      SP_X[i * ny + j] = lx + b * ox + w0 * d0x + w1 * d1x;
      SP_Z[i * ny + j] = lz + b * oz + w0 * d0z + w1 * d1z;
    }
  }

  const part = m.spine;
  const base = part.nv;
  for (let i = 0; i <= NM; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(NM, i + 1);
    for (let j = 0; j < ny; j++) {
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(ny - 1, j + 1);
      // Round the spine, and up it.
      const ax = SP_X[i1 * ny + j] - SP_X[i0 * ny + j];
      const az = SP_Z[i1 * ny + j] - SP_Z[i0 * ny + j];
      const bx = SP_X[i * ny + j1] - SP_X[i * ny + j0];
      const by = YS[j1] - YS[j0];
      const bz = SP_Z[i * ny + j1] - SP_Z[i * ny + j0];
      // n = a x b, with a = (ax, 0, az)
      let nx = -az * by;
      let nyv = az * bx - ax * bz;
      let nz = ax * by;
      const nl = Math.hypot(nx, nyv, nz) || 1;
      nx /= nl;
      nyv /= nl;
      nz /= nl;
      const al = Math.hypot(ax, az) || 1;
      const bl = Math.hypot(bx, by, bz) || 1;
      part.vert(
        SP_X[i * ny + j],
        YS[j],
        SP_Z[i * ny + j],
        nx,
        nyv,
        nz,
        ax / al,
        0,
        az / al,
        bx / bl,
        by / bl,
        bz / bl,
        MU[i],
        YS[j] + 0.5,
        1,
        0,
        0
      );
    }
  }
  for (let i = 0; i < NM; i++) {
    for (let j = 0; j < ny - 1; j++) {
      const a = base + i * ny + j;
      part.quad(a, a + ny, a + ny + 1, a + 1);
    }
  }

  // Head and tail caps: from the text block's spine edge out to the leather.
  const cap = m.cap;
  for (const [j, ys] of [
    [ny - 1, 1],
    [0, -1],
  ] as const) {
    const cb = cap.nv;
    for (let i = 0; i <= NM; i++) {
      const lam = Math.min(1, Math.max(0, (-BT + (2 * T + 2 * BT) * MU[i]) / (2 * T)));
      const ix = X0 + 2 * T * lam * ex;
      const iz = -T + 2 * T * lam * ez;
      for (const f of [0, 1]) {
        cap.vert(
          f ? SP_X[i * ny + j] : ix,
          YS[j],
          f ? SP_Z[i * ny + j] : iz,
          0,
          ys,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          MU[i],
          f,
          1,
          0,
          0
        );
      }
    }
    for (let i = 0; i < NM; i++) {
      const a = cb + i * 2;
      cap.quad(a, a + 1, a + 3, a + 2);
    }
  }
}

/* ------------------------------------------------------------------ */

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Rebuilds every part of the mesh for the book in the given shape. */
export function buildBookMesh(m: BookMesh, shape: BookShape) {
  for (const k of PART_KEYS) m[k].reset();
  const { roll, cover } = shape;
  const gutter = Math.min(1, roll / (Math.PI / 2));
  // The back board never moves; the front hinges at the text block's end
  // of the spine, wherever the roll has taken that.
  board(m, false, X0, -T, 0);
  board(
    m,
    true,
    X0 - 2 * T * Math.sin(roll),
    -T + 2 * T * Math.cos(roll),
    cover
  );
  spine(m, roll, cover);
  for (const s of shape.slabs) slab(m, s, roll, gutter);
}
