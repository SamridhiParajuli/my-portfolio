/**
 * nightBird
 * ---------
 * The bird that comes for the book once its last chapter has been read
 * (bookFinale): a great dark corvid out of the dark between the stars, a
 * raven longer in the wing than ravens are, its fingered primaries spread
 * like a hand.
 *
 * It is not an image. Its body, wings, tail and legs are worked out in
 * three dimensions every frame from the few things the choreography
 * decides -- where it is and which way it faces; how far its wings are
 * spread, how high they are held and where they are in their beat; its
 * tail; its legs and toes; where it looks -- projected through the book's
 * own camera, and laid down as what it is out here: a shape darker than
 * the dark, given away by what it hides and by the light along its edges.
 * The universe's cold light catches its back and the tops of its wings;
 * near the book, the book's own warm light comes up under it; and its
 * flight feathers, thin as they are, let a little of that light through.
 *
 * Bird space: x forward, y up, z to its right. One unit is its length,
 * from the tip of its beak to the end of its tail.
 */

export type V3 = [number, number, number];

export type BirdPose = {
  /** How much of it there is to see, 0..1. */
  alpha: number;
  /** Where it is (its middle, between the shoulders), world units, and the
   *  way it faces: forward, up, and its right. */
  pos: V3;
  fwd: V3;
  up: V3;
  right: V3;
  /** Its length, world units. */
  size: number;
  /** Its wingbeat: where in the beat it is (0 the top, 0.5 the bottom),
   *  and how deep the beat is, radians. */
  flap: number;
  amp: number;
  /** Its wings: 0 folded against it, 1 spread; how high they are held
   *  (radians, above level; folded, well below); brought forward (a
   *  landing's flare), radians. */
  ext: number;
  lift: number;
  sweep: number;
  /** Its tail: fanned, 0..1; and raised, radians. */
  tailFan: number;
  tailPitch: number;
  /** Its legs: 0 drawn up under it, 1 hanging; reaching forward (to land),
   *  0..1; and its toes, 0 open, 1 closed round something. While it holds
   *  on to something, `hang` is how much they hang straight down (world
   *  down, whatever way it is turned). */
  legs: number;
  reach: number;
  grip: number;
  hang: number;
  /** Where it looks, relative to its body: round, and down (radians). */
  headYaw: number;
  headPitch: number;
  /** How much of the book's warm light falls on it from below, and of the
   *  universe's cold light along its back. */
  warm: number;
  rim: number;
};

export function createBirdPose(): BirdPose {
  return {
    alpha: 0,
    pos: [0, 0, 0],
    fwd: [0, 0, -1],
    up: [0, 1, 0],
    right: [1, 0, 0],
    size: 0.56,
    flap: 0,
    amp: 0,
    ext: 1,
    lift: 0.1,
    sweep: 0,
    tailFan: 0.3,
    tailPitch: 0,
    legs: 0,
    reach: 0,
    grip: 0,
    hang: 0,
    headYaw: 0,
    headPitch: 0,
    warm: 0,
    rim: 1,
  };
}

/** World to screen: out [x, y, distance from the camera]. */
export type Projector = (x: number, y: number, z: number, out: number[]) => void;

/* ------------------------------------------------------------------ *
 * The model
 * ------------------------------------------------------------------ */

/** Down the body: x, y, radius. */
const BODY: Array<[number, number, number]> = [
  [-0.215, 0.012, 0.04],
  [-0.13, 0.008, 0.068],
  [-0.03, 0.0, 0.09],
  [0.07, 0.004, 0.097],
  [0.16, 0.022, 0.08],
];
/** The neck, which the head turns about, and the head on it. */
const NECK: V3 = [0.222, 0.04, 0];
const NECK_R = 0.064;
const HEAD: V3 = [0.282, 0.054, 0];
const HEAD_R = 0.057;
/** The beak: where it meets the head, how deep and wide it is there, and
 *  its tip -- heavy, and hooked a little at the end. */
const BEAK0: V3 = [0.322, 0.047, 0];
const BEAK_H = 0.026;
const BEAK_W = 0.018;
const BEAK_MID: V3 = [0.385, 0.05, 0];
const BEAK_TIP: V3 = [0.432, 0.024, 0];
const EYE: V3 = [0.3, 0.068, 0.037];
/** The shaggy feathers of its throat. */
const THROAT: Array<[number, number, number]> = [
  [0.205, -0.04, 0.03],
  [0.23, -0.035, 0.026],
  [0.252, -0.022, 0.022],
];

/** The shoulder (its right; the left is the mirror). */
const SH: V3 = [0.1, 0.048, 0.05];
/** Upper arm, forearm and hand. */
const HUM = 0.15;
const FORE = 0.2;
const HAND = 0.15;
/** Their angles in the wing's plane, from straight out toward forward:
 *  spread, and folded against its side. */
const SPREAD = [-0.42, 0.36, -0.16];
const FOLD = [-1.107, 1.29, -1.71];
/** How much each comes forward as the wings are brought forward. */
const SWEEP_K = [0.25, 0.35, 0.5];

/** Primaries, inner to outer: length, width. */
const PRIM_L = [0.29, 0.3, 0.32, 0.34, 0.36, 0.38, 0.39, 0.37, 0.32];
const PRIM_W = [0.05, 0.05, 0.048, 0.046, 0.042, 0.036, 0.032, 0.029, 0.026];
const NSEC = 10;
const NTER = 3;
const NTAIL = 10;

/** Hip (its right), and how long its legs are. */
const HIP: V3 = [-0.03, -0.068, 0.032];
export const LEG = 0.13;
const TOE = 0.046;

/* ------------------------------------------------------------------ *
 * Colour
 * ------------------------------------------------------------------ */

/** The key light the book is lit by (antiqueBook), world space. */
const KEY: V3 = norm([-0.26, 0.6, 0.76]);
/** Feathers in shadow, and lit; the grey of a flight feather's underside;
 *  and what shows through one against the light. */
const BASE = [7, 6, 8];
const LIT = [34, 31, 38];
const UNDER = [21, 20, 25];
const THRU = [62, 58, 72];
/** The universe's light along its edges, and the book's under it. */
const RIM = [178, 174, 214];
const WARM = [255, 186, 124];

/* ------------------------------------------------------------------ */

function norm(v: number[]): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function rgb(c: number[], a = 1) {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a.toFixed(3)})`;
}

/* ------------------------------------------------------------------ *
 * Scratch
 * ------------------------------------------------------------------ */

type Shape = { path: Path2D; fill: string | CanvasGradient; depth: number };

export type BirdScratch = {
  mask: HTMLCanvasElement | null;
  rim: HTMLCanvasElement | null;
  warm: HTMLCanvasElement | null;
  /** Where its wingtips and tail were last drawn, on screen, and how big
   *  it was: for the motes it sheds. */
  tips: number[];
  px: number;
};

export function createBirdScratch(): BirdScratch {
  return { mask: null, rim: null, warm: null, tips: [0, 0, 0, 0, 0, 0], px: 0 };
}

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */

/** Bird space to world, for the current frame. */
const M = { o: [0, 0, 0], f: [0, 0, 0], u: [0, 0, 0], r: [0, 0, 0], s: 1 };
/** The head's turn, applied about the neck. */
const HD = { cy: 1, sy: 0, cp: 1, sp: 0 };
const Q = [0, 0, 0];
const W3: V3 = [0, 0, 0];

function toWorld(x: number, y: number, z: number, out: V3) {
  const s = M.s;
  out[0] = M.o[0] + (x * M.f[0] + y * M.u[0] + z * M.r[0]) * s;
  out[1] = M.o[1] + (x * M.f[1] + y * M.u[1] + z * M.r[1]) * s;
  out[2] = M.o[2] + (x * M.f[2] + y * M.u[2] + z * M.r[2]) * s;
}

/** A point of the head (bird space as the head lies at rest), turned with
 *  it about the neck. */
function headPoint(x: number, y: number, z: number, out: V3) {
  let dx = x - NECK[0];
  let dy = y - NECK[1];
  let dz = z;
  // Down (about its right), then round (about its up).
  const px = dx * HD.cp - dy * HD.sp;
  const py = dx * HD.sp + dy * HD.cp;
  dx = px * HD.cy + dz * HD.sy;
  dz = -px * HD.sy + dz * HD.cy;
  dy = py;
  out[0] = NECK[0] + dx;
  out[1] = NECK[1] + dy;
  out[2] = dz;
}

/**
 * Draws the bird onto `ctx` (CSS px), seen through `proj` from a camera at
 * world (0, 0, camZ). `pxAt(d)` is screen px per world unit at distance d;
 * `dpr` the device px per CSS px of the canvases it works in.
 *
 * Whatever of it is further from the camera than `split` is behind what it
 * stands on or holds (the book, the scroll): that part is drawn when
 * `behind` is true, on a canvas under the book, and the rest when it is
 * false, over it. (With `split` Infinity, all of it is in front.)
 */
export function drawBird(
  ctx: CanvasRenderingContext2D,
  b: BirdPose,
  proj: Projector,
  pxAt: (d: number) => number,
  camZ: number,
  dpr: number,
  sc: BirdScratch,
  split = Infinity,
  behind = false
) {
  if (b.alpha <= 0.004) return;
  M.o[0] = b.pos[0];
  M.o[1] = b.pos[1];
  M.o[2] = b.pos[2];
  for (let i = 0; i < 3; i++) {
    M.f[i] = b.fwd[i];
    M.u[i] = b.up[i];
    M.r[i] = b.right[i];
  }
  M.s = b.size;
  HD.cy = Math.cos(b.headYaw);
  HD.sy = Math.sin(b.headYaw);
  HD.cp = Math.cos(b.headPitch);
  HD.sp = Math.sin(b.headPitch);

  // Where it is on screen, and how big.
  proj(b.pos[0], b.pos[1], b.pos[2], Q);
  const unitPx = pxAt(Q[2]) * b.size;
  sc.px = unitPx;
  if (unitPx < 1.5) return;

  const P = (x: number, y: number, z: number, out: number[]) => {
    toWorld(x, y, z, W3);
    proj(W3[0], W3[1], W3[2], out);
  };

  const shapes: Shape[] = [];
  const strokes: Array<{ path: Path2D; width: number; color: string; depth: number }> = [];

  /* --- the wings --- */
  const beat = b.amp * Math.cos(2 * Math.PI * b.flap);
  const lag = b.amp * 0.35 * Math.sin(2 * Math.PI * b.flap);
  const up = Math.max(0, -Math.sin(2 * Math.PI * b.flap));
  const extE = b.ext * (1 - 0.38 * Math.min(1, b.amp / 0.8) * up);
  const ang = [0, 0, 0];
  for (let j = 0; j < 3; j++) {
    ang[j] = lerp(FOLD[j], SPREAD[j], extE) + b.sweep * SWEEP_K[j] * extE;
  }
  // The bones, in the wing's plane: x forward, z out from the shoulder.
  const ex = HUM * Math.sin(ang[0]);
  const ez = HUM * Math.cos(ang[0]);
  const wx = ex + FORE * Math.sin(ang[1]);
  const wz = ez + FORE * Math.cos(ang[1]);
  const hx = wx + HAND * Math.sin(ang[2]);
  const hz = wz + HAND * Math.cos(ang[2]);
  const elevAt = (z: number) =>
    b.lift +
    beat * (0.8 + 0.2 * smoothstep(0.1, 0.4, z)) +
    lag * smoothstep(0.25, 0.55, z);

  for (const side of [-1, 1]) {
    // The wing's plane to bird space.
    const wp = (px: number, pz: number, out: number[]) => {
      const th = elevAt(pz);
      out[0] = SH[0] + px;
      out[1] = SH[1] + pz * Math.sin(th);
      out[2] = side * (SH[2] + pz * Math.cos(th));
    };
    const L3 = [0, 0, 0];
    const S2 = [0, 0, 0];
    const pt = (px: number, pz: number, out: number[]) => {
      wp(px, pz, L3);
      P(L3[0], L3[1], L3[2], out);
    };
    // Which side of it is toward us, and how it takes the light: by its
    // arm, and by its hand.
    const look = (pz: number) => {
      const th = elevAt(pz);
      const nl = [0, Math.cos(th), -side * Math.sin(th)];
      const n = [
        nl[0] * M.f[0] + nl[1] * M.u[0] + nl[2] * M.r[0],
        nl[0] * M.f[1] + nl[1] * M.u[1] + nl[2] * M.r[1],
        nl[0] * M.f[2] + nl[1] * M.u[2] + nl[2] * M.r[2],
      ];
      wp(0, pz, L3);
      toWorld(L3[0], L3[1], L3[2], W3);
      const v = norm([-W3[0], -W3[1], camZ - W3[2]]);
      const facing = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
      const s = facing >= 0 ? 1 : -1;
      const lam = Math.max(0, s * (n[0] * KEY[0] + n[1] * KEY[1] + n[2] * KEY[2]));
      return { under: facing < 0 ? 1 : 0, lam };
    };
    const arm = look(0.2);
    const hand = look(0.5);
    const tone = (l: { under: number; lam: number }, feather: number) => {
      const lit = l.lam * (0.35 + 0.65 * b.warm) * (0.5 + 0.5 * b.rim);
      const c = [0, 0, 0];
      for (let i = 0; i < 3; i++) {
        c[i] =
          lerp(BASE[i], LIT[i], lit) +
          (UNDER[i] - BASE[i]) * l.under * feather * 0.8;
      }
      return c;
    };

    // Where it is, for the order things are drawn in.
    wp(wx, wz, L3);
    P(L3[0], L3[1], L3[2], S2);
    const depth = S2[2];

    // Feathers as they lie in the wing's plane: base, angle, length, width.
    const feathers: Array<[number, number, number, number, number, boolean]> = [];
    // Tertials, near the body; secondaries along the forearm; primaries
    // along the hand, fanning out to the fingered tip.
    for (let k = 0; k < NTER; k++) {
      const f = 0.95 - 0.2 * k;
      const a = lerp(-1.68, -1.55, extE);
      feathers.push([ex * f, ez * f, a, 0.2 - 0.015 * k, 0.06, false]);
    }
    for (let j = NSEC - 1; j >= 0; j--) {
      const f = 1 - j / (NSEC - 1);
      const bx = ex + (wx - ex) * f;
      const bz = ez + (wz - ez) * f;
      const a = lerp(-1.66, -1.42 - 0.08 * (j / (NSEC - 1)), extE);
      feathers.push([bx, bz, a, 0.245 - 0.012 * (j / (NSEC - 1)), 0.056, false]);
    }
    for (let i = 0; i < PRIM_L.length; i++) {
      const q = i / (PRIM_L.length - 1);
      const f = 0.1 + 0.9 * q;
      const bx = wx + (hx - wx) * f;
      const bz = wz + (hz - wz) * f;
      const rel = lerp(-0.04 - 0.01 * i, lerp(-1.32, -0.1, Math.pow(q, 0.85)), extE);
      feathers.push([bx, bz, ang[2] + rel, PRIM_L[i], PRIM_W[i], true]);
    }

    // The coverts: everything ahead of the flight feathers, in one piece.
    const cov = new Path2D();
    const C0 = [0, 0, 0];
    const CE = [0, 0, 0];
    const CW = [0, 0, 0];
    pt(0, 0, C0);
    cov.moveTo(C0[0], C0[1]);
    pt(ex, ez, CE);
    pt(wx, wz, CW);
    cov.quadraticCurveTo(CE[0], CE[1], (CE[0] + CW[0]) / 2, (CE[1] + CW[1]) / 2);
    pt(hx, hz, C0);
    cov.quadraticCurveTo(CW[0], CW[1], C0[0], C0[1]);
    for (let k = feathers.length - 1; k >= 0; k--) {
      const [bx, bz, a, len, , prim] = feathers[k];
      const f = prim ? 0.3 : 0.4;
      pt(bx + Math.sin(a) * len * f, bz + Math.cos(a) * len * f, C0);
      cov.lineTo(C0[0], C0[1]);
    }
    pt(-0.07, 0.02, C0);
    cov.lineTo(C0[0], C0[1]);
    cov.closePath();
    shapes.push({ path: cov, fill: rgb(tone(arm, 0)), depth: depth - 1e-4 });

    // Each flight feather, a long blade tapering to its tip -- the outer
    // primaries narrowing sharply past their middle, so they part like
    // fingers.
    const B = [0, 0, 0];
    const T1 = [0, 0, 0];
    const A1 = [0, 0, 0];
    const A2 = [0, 0, 0];
    const C1 = [0, 0, 0];
    const C2 = [0, 0, 0];
    feathers.forEach(([bx, bz, a, len, wid, prim], k) => {
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      // Across it, in the wing's plane.
      const qx = Math.cos(a);
      const qz = -Math.sin(a);
      const finger = prim ? smoothstep(3.5, 8, k - NTER - NSEC) : 0;
      const w1 = wid * 0.5;
      const w2 = wid * 0.5 * lerp(0.8, 0.42, finger);
      pt(bx, bz, B);
      pt(bx + dx * len, bz + dz * len, T1);
      pt(bx + dx * len * 0.35 - qx * w1, bz + dz * len * 0.35 - qz * w1, A1);
      pt(bx + dx * len * 0.35 + qx * w1, bz + dz * len * 0.35 + qz * w1, A2);
      pt(bx + dx * len * 0.8 - qx * w2, bz + dz * len * 0.8 - qz * w2, C1);
      pt(bx + dx * len * 0.8 + qx * w2, bz + dz * len * 0.8 + qz * w2, C2);
      const p = new Path2D();
      p.moveTo(B[0], B[1]);
      p.quadraticCurveTo(A1[0], A1[1], (A1[0] + C1[0]) / 2, (A1[1] + C1[1]) / 2);
      p.quadraticCurveTo(C1[0], C1[1], T1[0], T1[1]);
      p.quadraticCurveTo(C2[0], C2[1], (A2[0] + C2[0]) / 2, (A2[1] + C2[1]) / 2);
      p.quadraticCurveTo(A2[0], A2[1], B[0], B[1]);
      p.closePath();
      const l = prim ? hand : arm;
      const base = tone(l, 1);
      // Thin at its tip, it lets the light behind it through.
      const tip = [0, 0, 0];
      const thru = (prim ? 0.7 : 0.45) * b.rim * (0.6 + 0.4 * l.under);
      for (let i = 0; i < 3; i++) tip[i] = lerp(base[i], THRU[i], thru * 0.55);
      const g = ctx.createLinearGradient(B[0], B[1], T1[0], T1[1]);
      g.addColorStop(0, rgb(base));
      g.addColorStop(0.55, rgb(base));
      g.addColorStop(1, rgb(tip));
      shapes.push({ path: p, fill: g, depth });
      if (prim && k === feathers.length - 2) {
        const o = side < 0 ? 0 : 2;
        sc.tips[o] = T1[0];
        sc.tips[o + 1] = T1[1];
      }
    });
  }

  /* --- the tail: a wedge of feathers, fanned as it needs to be --- */
  {
    const fan = lerp(0.2, 1.25, b.tailFan);
    const tp = b.tailPitch;
    const bk = [-Math.cos(tp), Math.sin(tp), 0];
    const tb = [-0.205, 0.012, 0];
    const B = [0, 0, 0];
    const T1 = [0, 0, 0];
    const A1 = [0, 0, 0];
    const A2 = [0, 0, 0];
    const order = [0, 9, 1, 8, 2, 7, 3, 6, 4, 5];
    let depth = 0;
    const tailShapes: Shape[] = [];
    for (const k of order) {
      const al = (k / (NTAIL - 1) - 0.5) * fan;
      const len = 0.27 + 0.075 * (1 - Math.abs(k - 4.5) / 4.5);
      const ca = Math.cos(al);
      const sa = Math.sin(al);
      const d = [bk[0] * ca, bk[1] * ca, sa];
      const q = [-bk[0] * sa, -bk[1] * sa, ca];
      const o = [tb[0], tb[1], tb[2] + sa * 0.02];
      const w = 0.03;
      P(o[0], o[1], o[2], B);
      P(o[0] + d[0] * len, o[1] + d[1] * len, o[2] + d[2] * len, T1);
      P(o[0] + d[0] * len * 0.55 - q[0] * w, o[1] + d[1] * len * 0.55 - q[1] * w, o[2] + d[2] * len * 0.55 - q[2] * w, A1);
      P(o[0] + d[0] * len * 0.55 + q[0] * w, o[1] + d[1] * len * 0.55 + q[1] * w, o[2] + d[2] * len * 0.55 + q[2] * w, A2);
      const p = new Path2D();
      p.moveTo(B[0], B[1]);
      p.quadraticCurveTo(A1[0], A1[1], T1[0], T1[1]);
      p.quadraticCurveTo(A2[0], A2[1], B[0], B[1]);
      p.closePath();
      const g = ctx.createLinearGradient(B[0], B[1], T1[0], T1[1]);
      g.addColorStop(0, rgb(BASE));
      g.addColorStop(0.6, rgb(BASE));
      g.addColorStop(1, rgb([lerp(BASE[0], THRU[0], 0.3 * b.rim), lerp(BASE[1], THRU[1], 0.3 * b.rim), lerp(BASE[2], THRU[2], 0.3 * b.rim)]));
      depth = T1[2];
      tailShapes.push({ path: p, fill: g, depth });
      if (k === 4) {
        sc.tips[4] = T1[0];
        sc.tips[5] = T1[1];
      }
    }
    for (const s of tailShapes) {
      s.depth = depth;
      shapes.push(s);
    }
  }

  /* --- the body, the head and the beak, as one shape --- */
  const body = new Path2D();
  const C = BODY.map(([x, y, r]) => {
    const o = [0, 0, 0];
    P(x, y, 0, o);
    return [o[0], o[1], r * pxAt(o[2]) * b.size, o[2]];
  });
  const hn = [0, 0, 0] as V3;
  const nk = [0, 0, 0];
  P(NECK[0], NECK[1], 0, nk);
  headPoint(HEAD[0], HEAD[1], 0, hn);
  const hd = [0, 0, 0];
  P(hn[0], hn[1], hn[2], hd);
  const chain = [
    ...C,
    [nk[0], nk[1], NECK_R * pxAt(nk[2]) * b.size, nk[2]],
    [hd[0], hd[1], HEAD_R * pxAt(hd[2]) * b.size, hd[2]],
  ];
  for (let i = 0; i + 1 < chain.length; i++) {
    capsule(body, chain[i][0], chain[i][1], chain[i][2], chain[i + 1][0], chain[i + 1][1], chain[i + 1][2]);
  }
  // The beak: the hull of its base and its tip.
  const hull: number[][] = [];
  const bp = [0, 0, 0] as V3;
  const sp = [0, 0, 0];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    headPoint(BEAK0[0], BEAK0[1] + Math.sin(a) * BEAK_H, Math.cos(a) * BEAK_W, bp);
    P(bp[0], bp[1], bp[2], sp);
    hull.push([sp[0], sp[1]]);
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    headPoint(BEAK_MID[0], BEAK_MID[1] + Math.sin(a) * BEAK_H * 0.5, Math.cos(a) * BEAK_W * 0.55, bp);
    P(bp[0], bp[1], bp[2], sp);
    hull.push([sp[0], sp[1]]);
  }
  headPoint(BEAK_TIP[0], BEAK_TIP[1], 0, bp);
  P(bp[0], bp[1], bp[2], sp);
  hull.push([sp[0], sp[1]]);
  const hp = convexHull(hull);
  const beak = new Path2D();
  hp.forEach(([x, y], i) => (i ? beak.lineTo(x, y) : beak.moveTo(x, y)));
  beak.closePath();
  // The shag of its throat.
  const throat = new Path2D();
  for (const [x, y, r] of THROAT) {
    const a = [0, 0, 0] as V3;
    headPoint(x, y, 0, a);
    const o = [0, 0, 0];
    P(a[0], a[1], a[2], o);
    const tip = [0, 0, 0];
    headPoint(x - 0.01, y - r * 1.6, 0, a);
    P(a[0], a[1], a[2], tip);
    const rr = r * pxAt(o[2]) * b.size;
    throat.moveTo(o[0] - rr, o[1]);
    throat.quadraticCurveTo(o[0] - rr * 0.4, tip[1] - (tip[1] - o[1]) * 0.3, tip[0], tip[1]);
    throat.quadraticCurveTo(o[0] + rr * 0.4, tip[1] - (tip[1] - o[1]) * 0.3, o[0] + rr, o[1]);
    throat.closePath();
  }
  const bodyDepth = C[2][3];
  shapes.push({ path: body, fill: rgb(BASE), depth: bodyDepth });
  shapes.push({ path: throat, fill: rgb(BASE), depth: bodyDepth - 1e-4 });
  shapes.push({ path: beak, fill: rgb([12, 11, 13]), depth: bodyDepth - 2e-4 });

  /* --- the legs, and the toes it holds on with --- */
  for (const side of [-1, 1]) {
    const hip = [HIP[0], HIP[1], side * HIP[2]];
    // Drawn up under it, hanging, or reaching forward to land.
    const tuck = [-0.95, -0.3, 0];
    const hangL = [0.05, -1, 0];
    const reach = [0.55, -0.83, 0];
    let d = norm([
      lerp(tuck[0], lerp(hangL[0], reach[0], b.reach), b.legs),
      lerp(tuck[1], lerp(hangL[1], reach[1], b.reach), b.legs),
      0,
    ]);
    if (b.hang > 0) {
      // Straight down the world, in bird space...
      const wd = [-M.f[1], -M.u[1], -M.r[1]];
      d = norm([lerp(d[0], wd[0], b.hang), lerp(d[1], wd[1], b.hang), lerp(d[2], wd[2], b.hang)]);
    }
    // ...and, holding on, the feet together on what they hold.
    const meet = b.grip * b.legs;
    const foot = [
      hip[0] + d[0] * LEG,
      hip[1] + d[1] * LEG,
      hip[2] * (1 - 0.5 * meet) + d[2] * LEG,
    ];
    const legP = new Path2D();
    const A = [0, 0, 0];
    const Bp = [0, 0, 0];
    P(hip[0], hip[1], hip[2], A);
    P(foot[0], foot[1], foot[2], Bp);
    legP.moveTo(A[0], A[1]);
    legP.lineTo(Bp[0], Bp[1]);
    strokes.push({ path: legP, width: 0.027 * unitPx, color: rgb([14, 12, 15]), depth: Bp[2] });
    // Three toes forward and one back, curling closed as it grips.
    const toes = new Path2D();
    for (const [ty, back] of [
      [-0.38, false],
      [0, false],
      [0.38, false],
      [0, true],
    ] as Array<[number, boolean]>) {
      // Forward (or back), in the plane square to the leg.
      let fx = back ? -1 : 1;
      let fz = ty;
      const l = Math.hypot(fx, fz);
      fx /= l;
      fz /= l;
      let x = foot[0];
      let y = foot[1];
      let z = foot[2];
      P(x, y, z, A);
      toes.moveTo(A[0], A[1]);
      for (let seg = 0; seg < 3; seg++) {
        const bend = (0.25 + seg * 0.55) * b.grip + 0.1 * seg;
        const len = seg === 2 ? TOE * 0.5 : TOE;
        // Bent down toward the leg's line as it closes.
        const hx2 = fx * Math.cos(bend);
        const hy2 = -Math.sin(bend);
        const hz2 = fz * Math.cos(bend);
        x += (hx2 + d[0] * 0.2) * len;
        y += (hy2 + d[1] * 0.2) * len;
        z += (hz2 + d[2] * 0.2) * len;
        P(x, y, z, A);
        toes.lineTo(A[0], A[1]);
      }
    }
    strokes.push({ path: toes, width: 0.014 * unitPx, color: rgb([16, 14, 17]), depth: Bp[2] });
  }

  /* --- laying it down: furthest first, and only this side of the split --- */
  shapes.sort((p, q) => q.depth - p.depth);
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (shapes[i].depth > split !== behind) shapes.splice(i, 1);
  }
  if (behind) strokes.length = 0;
  if (!shapes.length && !strokes.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = b.alpha;
  // The legs go under the body.
  for (const s of strokes) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = Math.max(0.6, s.width);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(s.path);
  }
  for (const s of shapes) {
    ctx.fillStyle = s.fill;
    ctx.fill(s.path);
  }
  // Some shape to the body: the key light's side of it a shade less dark,
  // with the blue-black gloss a raven's feathers have.
  const bodyHere = bodyDepth <= split !== behind;
  const keyS = [0, 0, 0];
  toWorld(0.04, 0.01, 0, W3);
  proj(
    W3[0] + KEY[0] * 0.07 * b.size,
    W3[1] + KEY[1] * 0.07 * b.size,
    W3[2] + KEY[2] * 0.07 * b.size,
    keyS
  );
  if (bodyHere) {
    ctx.save();
    ctx.clip(body);
    const gl = ctx.createRadialGradient(keyS[0], keyS[1] - 0.04 * unitPx, 0, keyS[0], keyS[1], 0.22 * unitPx);
    const k = (0.3 + 0.7 * b.warm) * b.rim;
    gl.addColorStop(0, `rgba(52,54,74,${(0.24 * k).toFixed(3)})`);
    gl.addColorStop(1, "rgba(52,54,74,0)");
    ctx.fillStyle = gl;
    ctx.fillRect(keyS[0] - 0.3 * unitPx, keyS[1] - 0.3 * unitPx, 0.6 * unitPx, 0.6 * unitPx);
    ctx.restore();
  }

  /* --- the light along its edges --- */
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (x: number, y: number) => {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  };
  grow(Q[0] - 1.15 * unitPx, Q[1] - 1.15 * unitPx);
  grow(Q[0] + 1.15 * unitPx, Q[1] + 1.15 * unitPx);
  x0 = Math.floor(x0);
  y0 = Math.floor(y0);
  const bw = Math.ceil(x1 - x0);
  const bh = Math.ceil(y1 - y0);
  const res = Math.min(dpr, 2);
  const cw = Math.max(1, Math.min(2400, Math.ceil(bw * res)));
  const ch = Math.max(1, Math.min(2400, Math.ceil(bh * res)));
  const mask = ensure(sc, "mask", cw, ch);
  const rim = ensure(sc, "rim", cw, ch);
  const warm = ensure(sc, "warm", cw, ch);
  const mctx = mask.getContext("2d");
  const rctx = rim.getContext("2d");
  const wctx = warm.getContext("2d");
  if (mctx && rctx && wctx) {
    const kx = cw / bw;
    const ky = ch / bh;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, cw, ch);
    mctx.setTransform(kx, 0, 0, ky, -x0 * kx, -y0 * ky);
    mctx.fillStyle = "#fff";
    mctx.strokeStyle = "#fff";
    mctx.lineCap = "round";
    for (const s of strokes) {
      mctx.lineWidth = Math.max(0.6, s.width);
      mctx.stroke(s.path);
    }
    for (const s of shapes) mctx.fill(s.path);
    const band = Math.max(1, 0.014 * unitPx);
    const edge = (
      c2: CanvasRenderingContext2D,
      dx: number,
      dy: number,
      col: number[],
      a: number
    ) => {
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.globalCompositeOperation = "source-over";
      c2.clearRect(0, 0, cw, ch);
      c2.drawImage(mask, 0, 0);
      c2.globalCompositeOperation = "destination-out";
      c2.drawImage(mask, dx * kx, dy * ky);
      c2.globalCompositeOperation = "source-in";
      c2.fillStyle = rgb(col, a);
      c2.fillRect(0, 0, cw, ch);
      c2.globalCompositeOperation = "source-over";
    };
    // The universe's light, from above and behind; the book's, from below.
    const ra = clamp(0.5 * b.rim, 0, 1);
    const wa = clamp(0.75 * b.warm, 0, 1);
    edge(rctx, band * 0.3, band * 0.85, RIM, 1);
    edge(wctx, -band * 0.2, -band * 1.1, WARM, 1);
    ctx.globalCompositeOperation = "lighter";
    if (ra > 0.01) {
      ctx.globalAlpha = b.alpha * ra * 0.4;
      ctx.filter = `blur(${Math.max(0.8, band * 0.7).toFixed(1)}px)`;
      ctx.drawImage(rim, x0, y0, bw, bh);
      ctx.filter = "none";
      ctx.globalAlpha = b.alpha * ra * 0.6;
      ctx.drawImage(rim, x0, y0, bw, bh);
    }
    if (wa > 0.01) {
      ctx.globalAlpha = b.alpha * wa * 0.75;
      ctx.filter = `blur(${Math.max(1, band * 1.4).toFixed(1)}px)`;
      ctx.drawImage(warm, x0, y0, bw, bh);
      ctx.filter = "none";
      ctx.globalAlpha = b.alpha * wa * 0.45;
      ctx.drawImage(warm, x0, y0, bw, bh);
    }
  }

  /* --- its eye, which has the book's light in it --- */
  const eye = [0, 0, 0] as V3;
  const ep = [0, 0, 0];
  for (const side of bodyHere ? [-1, 1] : []) {
    headPoint(EYE[0], EYE[1], side * EYE[2], eye);
    // Turned toward us at all?
    const n = [0, 0, 0] as V3;
    headPoint(EYE[0], EYE[1], side * (EYE[2] + 0.05), n);
    const a = [0, 0, 0] as V3;
    toWorld(eye[0], eye[1], eye[2], a);
    const bb = [0, 0, 0] as V3;
    toWorld(n[0], n[1], n[2], bb);
    const facing = bb[2] - a[2];
    if (facing <= 0.002 * b.size) continue;
    P(eye[0], eye[1], eye[2], ep);
    const r = 0.0085 * unitPx;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = b.alpha;
    ctx.fillStyle = "rgb(6,5,6)";
    ctx.beginPath();
    ctx.arc(ep[0], ep[1], Math.max(0.6, r), 0, Math.PI * 2);
    ctx.fill();
    const glint = clamp((facing / (0.05 * b.size)) * (0.35 + 0.65 * b.warm), 0, 1);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = b.alpha * glint * 0.9;
    ctx.fillStyle = "rgb(255,214,160)";
    ctx.beginPath();
    ctx.arc(ep[0] - r * 0.3, ep[1] - r * 0.35, Math.max(0.5, r * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function ensure(sc: BirdScratch, key: "mask" | "rim" | "warm", w: number, h: number) {
  let c = sc[key];
  if (!c) {
    c = document.createElement("canvas");
    sc[key] = c;
  }
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return c;
}

/** The outline round two circles and everything between them, wound the
 *  same way as a circle drawn with arc(). */
function capsule(
  p: Path2D,
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (d <= Math.abs(r1 - r2) + 1e-6) {
    const big = r1 >= r2;
    p.moveTo((big ? x1 : x2) + (big ? r1 : r2), big ? y1 : y2);
    p.arc(big ? x1 : x2, big ? y1 : y2, big ? r1 : r2, 0, Math.PI * 2);
    return;
  }
  const a = Math.atan2(dy, dx);
  const bta = Math.acos(clamp((r1 - r2) / d, -1, 1));
  p.moveTo(x1 + r1 * Math.cos(a + bta), y1 + r1 * Math.sin(a + bta));
  p.arc(x1, y1, r1, a + bta, a - bta + Math.PI * 2);
  p.lineTo(x2 + r2 * Math.cos(a - bta), y2 + r2 * Math.sin(a - bta));
  p.arc(x2, y2, r2, a - bta, a + bta);
  p.closePath();
}

function convexHull(pts: number[][]) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: number[][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: number[][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Where its feet are, bird space, as its legs are now -- the point it
 *  stands or holds on by. out: [x, y, z]. */
export function birdFoot(b: BirdPose, out: number[]) {
  const tuck = [-0.95, -0.3, 0];
  const hangL = [0.05, -1, 0];
  const reach = [0.55, -0.83, 0];
  let d = norm([
    lerp(tuck[0], lerp(hangL[0], reach[0], b.reach), b.legs),
    lerp(tuck[1], lerp(hangL[1], reach[1], b.reach), b.legs),
    0,
  ]);
  if (b.hang > 0) {
    const wd = [-b.fwd[1], -b.up[1], -b.right[1]];
    d = norm([lerp(d[0], wd[0], b.hang), lerp(d[1], wd[1], b.hang), lerp(d[2], wd[2], b.hang)]);
  }
  out[0] = HIP[0] + d[0] * LEG;
  out[1] = HIP[1] + d[1] * LEG;
  out[2] = d[2] * LEG;
}
