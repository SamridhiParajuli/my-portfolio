/**
 * bookFinale
 * ----------
 * What becomes of the book once its last chapter has been read: a bird
 * comes for it out of the dark, takes it up, and as it is carried off the
 * book gives itself up and becomes a scroll -- which the bird brings back
 * and lets go, and which opens, in the same universe it was all made of,
 * on the last page there is: Contact.
 *
 * Seconds on the finale clock (c), which starts once Experience has been
 * written and has lain a while in the book's light:
 *   0.0  the universe round it goes quieter, dimmer, a cold haze coming up
 *        through it, and the book settles a little lower, as if to make
 *        room;
 *   0.6  far off and high, out of the dark, something is coming -- a shape
 *        darker than the dark, given away only by the edges the light
 *        catches. It comes down in a long slow curve, beating and then
 *        gliding, banks, and comes in toward the book;
 *   5.4  it flares -- wings spread and brought forward, tail fanned, feet
 *        reaching -- and
 *   6.4  lands on the head of the book's spine. The book dips under it and
 *        steadies. It folds its wings; looks at us; looks down at the page;
 *   9.3  opens its wings, slowly, all the way up, and
 *  10.2  takes the book up by its spine, beating hard and slow. As it
 *        rises, the book gives itself up: the leather burns back from
 *        where it is held, front by front, to motes; the leaves are pressed
 *        flat into the page on top, Experience fading from it; the gutter
 *        comes up flat; and the sheet -- parchment now, the same paper --
 *        curls up from both its outer edges and rolls in on itself, the
 *        motes of the leather streaming into the rolls, until
 *  15.9  the two rolls meet, and it hangs from the bird's feet a scroll.
 *  15.6  It is carried off a little way through the universe, which streams
 *        by as the camera goes along; the bird banks, comes back, and
 *  20.5  lets it go. The scroll hangs on in the air by itself. The bird
 *        climbs away into the dark it came from, and is gone by 25.
 *  21.5  The scroll comes to the middle, turns square to us, nearer, and
 *  23.4  unrolls, slowly, its rolls drawing apart, until it lies open
 *        between them;
 *  27.6  a light crosses it, and the last page is written (contactPage).
 *
 * Everything here is a function of c alone, as the book's own opening is
 * of its clock -- so it plays backwards, fast, if the scroll leaves it --
 * except the motes, which are let go only while it plays forward.
 */

import { blitGlow, type JourneyWorld } from "./blackHoleJourney";
import { BOOK } from "./antiqueBook";
import { PL, T, YP } from "./bookMesh";
import {
  LH_FINAL,
  XC,
  closedEll,
  createSheet,
  rollPoint,
  rollRadius,
  type Sheet,
} from "./parchmentScroll";
import {
  createBirdPose,
  createBirdScratch,
  birdFoot,
  type BirdPose,
  type BirdScratch,
  type V3,
} from "./nightBird";

const { BW, BT, SB, X0 } = BOOK;

/* ------------------------------------------------------------------ *
 * The timeline
 * ------------------------------------------------------------------ */

const LAND = 6.4;
/** The bird takes the book up: from here on it is becoming the last page. */
export const TAKE = 10.2;
const RELEASE = 20.5;
/** The sheet takes the place of the pages (unseen: it is them, exactly). */
const SHEET_ON = 9.9;
const FLATTEN: [number, number] = [11.0, 12.7];
const FADE_EXP: [number, number] = [10.5, 12.3];
const DIS_LEATHER: [number, number] = [10.6, 14.3];
const DIS_PAGES: [number, number] = [11.3, 13.1];
const GROW: [number, number] = [12.7, 15.3];
const ROLL: [number, number] = [12.5, 15.9];
/** Rolled up and out of sight, its face is laid as the parchment. */
const SWAP = 16.6;
/** Nothing of the book itself is left. */
const BOOK_GONE = 14.45;
const UNROLL: [number, number] = [23.4, 28.2];
/** When the last page begins to be written. */
export const CONTACT_AT = 27.6;
/** How much of each half is still rolled once it lies open: on a narrow
 *  screen, more -- so it stands nearer square, and can come closer. */
const ELL_OPEN = 0.135;
const ELL_OPEN_SMALL = 0.42;
/** How much further the universe is dimmed, and how much further the
 *  camera goes on as the scroll is carried (OPEN_DOLLY units). */
const FIN_VEIL = 0.32;
const FIN_DOLLY = 1.0;
/** The bird's length, world units (book heights). */
const BIRD_SIZE = 0.66;
/** How big the stage is drawn once the bird has carried the book off --
 *  and stays, to the end. */
export const STAGE_END = 0.86;

/* ------------------------------------------------------------------ */

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function span(x: number, a: number, b: number) {
  return clamp((x - a) / (b - a), 0, 1);
}
function smoothstep(e0: number, e1: number, x: number) {
  const t = span(x, e0, e1);
  return t * t * (3 - 2 * t);
}
function smootherstep(x: number) {
  const t = clamp(x, 0, 1);
  return t * t * t * (t * (6 * t - 15) + 10);
}
function easeInOutSine(x: number) {
  return 0.5 - 0.5 * Math.cos(Math.PI * clamp(x, 0, 1));
}
function wrapAngle(a: number) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
function lerpAngle(a: number, b: number, t: number) {
  return a + wrapAngle(b - a) * t;
}

/** A value over the clock, eased into and out of every key. */
type Key = readonly [number, number];
function track(keys: readonly Key[], c: number) {
  if (c <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [c1, v1] = keys[i];
    if (c <= c1) {
      const [c0, v0] = keys[i - 1];
      return v0 + (v1 - v0) * smootherstep((c - c0) / (c1 - c0));
    }
  }
  return keys[keys.length - 1][1];
}

/** A path over the clock: through each key, smoothly, at the speed the
 *  keys either side of it ask for (or at the speed given). */
type PKey = { c: number; p: V3; v?: V3 };
function path(keys: readonly PKey[], c: number, out: number[]) {
  const n = keys.length;
  if (n === 0) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return;
  }
  if (c <= keys[0].c) {
    out[0] = keys[0].p[0];
    out[1] = keys[0].p[1];
    out[2] = keys[0].p[2];
    return;
  }
  if (c >= keys[n - 1].c) {
    out[0] = keys[n - 1].p[0];
    out[1] = keys[n - 1].p[1];
    out[2] = keys[n - 1].p[2];
    return;
  }
  let i = 0;
  while (i < n - 2 && c > keys[i + 1].c) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const h = b.c - a.c;
  const t = (c - a.c) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  for (let k = 0; k < 3; k++) {
    const ma = tangent(keys, i, k);
    const mb = tangent(keys, i + 1, k);
    out[k] = h00 * a.p[k] + h10 * h * ma + h01 * b.p[k] + h11 * h * mb;
  }
}
function tangent(keys: readonly PKey[], i: number, k: number) {
  const key = keys[i];
  if (key.v) return key.v[k];
  const p = keys[Math.max(0, i - 1)];
  const q = keys[Math.min(keys.length - 1, i + 1)];
  return (q.p[k] - p.p[k]) / Math.max(1e-6, q.c - p.c);
}

/* ------------------------------------------------------------------ *
 * The bird: how it holds itself, over the clock
 * ------------------------------------------------------------------ */

const FREQ: Key[] = [
  [0, 1.0],
  [5.2, 1.0],
  [5.6, 1.5],
  [6.4, 1.5],
  [9.8, 1.3],
  [15.6, 1.3],
  [18.8, 1.2],
  [20.4, 1.5],
  [22, 1.25],
  [26, 1.1],
];
const AMP: Key[] = [
  [0.6, 0.62],
  [2.0, 0.62],
  [2.6, 0.05],
  [4.1, 0.05],
  [4.5, 0.5],
  [5.2, 0.42],
  [5.6, 0.82],
  [6.3, 0.55],
  [6.5, 0],
  [10.0, 0],
  [10.25, 0.85],
  [15.6, 0.85],
  [17.4, 0.75],
  [17.8, 0.12],
  [18.6, 0.12],
  [19.1, 0.75],
  [20.4, 0.9],
  [21.6, 0.9],
  [22.6, 0.55],
  [23.2, 0.12],
];
const EXT: Key[] = [
  [0, 1],
  [6.4, 1],
  [7.3, 0],
  [9.35, 0],
  [10.1, 1],
];
const LIFT: Key[] = [
  [0, 0.06],
  [2.0, 0.06],
  [2.6, 0.16],
  [4.1, 0.16],
  [4.5, 0.06],
  [5.4, 0.1],
  [6.0, 0.35],
  [6.4, 0.3],
  [7.3, -1.35],
  [9.35, -1.35],
  [10.0, 0.95],
  [10.25, 0.15],
  [15.6, 0.12],
  [17.8, 0.16],
  [18.6, 0.16],
  [19.1, 0.1],
  [21.6, 0.1],
  [23.2, 0.15],
];
const SWEEP: Key[] = [
  [5.4, 0],
  [6.0, 0.45],
  [6.4, 0.3],
  [6.9, 0],
  [20.2, 0],
  [20.6, 0.3],
  [21.2, 0],
];
const TAIL_FAN: Key[] = [
  [0.6, 0.25],
  [5.2, 0.3],
  [5.9, 1.0],
  [6.6, 0.8],
  [7.4, 0.1],
  [9.3, 0.1],
  [10.2, 0.75],
  [15.6, 0.55],
  [20.3, 0.9],
  [21.4, 0.4],
];
const TAIL_PITCH: Key[] = [
  [0.6, 0.05],
  [5.4, 0.05],
  [6.0, -0.4],
  [6.6, -0.2],
  [7.4, 0.02],
  [9.3, 0.02],
  [10.2, -0.3],
  [15.6, -0.1],
  [20.3, -0.35],
  [21.4, 0],
];
const LEGS: Key[] = [
  [0.6, 0],
  [4.9, 0],
  [5.6, 1],
  [20.7, 1],
  [21.7, 0],
];
const REACH: Key[] = [
  [5.3, 0],
  [5.9, 0.9],
  [6.35, 0.2],
  [6.6, 0],
  [20.4, 0],
  [20.65, 0.35],
  [21.2, 0],
];
const GRIP: Key[] = [
  [0, 0.25],
  [4.9, 0.25],
  [5.5, 0],
  [6.4, 0],
  [6.6, 1],
  [20.45, 1],
  [20.62, 0],
  [21.6, 0.35],
];
const HANG: Key[] = [
  [6.2, 0],
  [6.5, 1],
  [20.55, 1],
  [20.9, 0],
];
const HEAD_YAW: Key[] = [
  [7.2, 0],
  [7.45, 0.92],
  [8.3, 0.92],
  [8.55, 0.55],
  [9.0, 0.55],
  [9.25, 0],
];
const HEAD_PITCH: Key[] = [
  [7.2, 0],
  [7.45, -0.05],
  [8.3, -0.05],
  [8.55, -0.7],
  [9.0, -0.7],
  [9.25, 0],
  [10.2, -0.3],
  [15.6, -0.15],
  [20.2, -0.4],
  [20.9, 0],
];
/** Its heading, held as it is scripted (where it is not simply flying the
 *  way it is going): on the book, facing out to our left; turning to face
 *  us as it takes it up; and as it lets go. */
const PSI: Key[] = [
  [5.3, -1.9],
  [6.4, -2.25],
  [9.3, -2.25],
  [10.25, -Math.PI],
  [15.0, -Math.PI],
  [19.9, -2.95],
];
const THETA: Key[] = [
  [5.3, 0.3],
  [5.9, 0.95],
  [6.4, 0.42],
  [9.3, 0.42],
  [9.8, 0.62],
  [10.3, 0.8],
  [15.0, 0.7],
  [19.9, 0.6],
  [20.7, 0.66],
];
/** How much it simply flies the way it is going, rather than as scripted. */
const FREE: Key[] = [
  [0, 1],
  [5.3, 1],
  [6.4, 0],
  [15.0, 0],
  [16.2, 1],
  [19.9, 1],
  [20.4, 0],
  [20.7, 0],
  [21.6, 1],
];

/** Its wingbeat, as a phase: the integral of how fast it beats, so that it
 *  is at the top of a beat just as it takes the book up. */
const PH_DT = 1 / 120;
const PH_END = 40;
const PHASE = new Float64Array(Math.ceil(PH_END / PH_DT) + 2);
{
  let acc = 0;
  for (let i = 0; i < PHASE.length; i++) {
    PHASE[i] = acc;
    acc += track(FREQ, i * PH_DT) * PH_DT;
  }
  const at = PHASE[Math.round(TAKE / PH_DT)];
  for (let i = 0; i < PHASE.length; i++) PHASE[i] -= at;
}
function flapAt(c: number) {
  const f = clamp(c, 0, PH_END) / PH_DT;
  const k = Math.min(PHASE.length - 2, Math.floor(f));
  const p = PHASE[k] + (PHASE[k + 1] - PHASE[k]) * (f - k);
  return p - Math.floor(p);
}

/* ------------------------------------------------------------------ */

export type FinaleFrame = {
  /** The finale clock this was worked out for. */
  c: number;
  /** How much quieter the universe is, 0..1, and how much further it is
   *  dimmed for it; how far the camera has gone on (OPEN_DOLLY units). */
  quiet: number;
  veil: number;
  dolly: number;
  /** The stage on screen: everything the book is drawn with scaled by
   *  this, and moved down by this much of the screen's height. */
  scale: number;
  dy: number;
  /** The book's pose: added to the open book's angles; and where the
   *  point it is held by (GRIP_LOCAL) is, world units. */
  dYaw: number;
  dPitch: number;
  dRoll: number;
  grip: V3;
  /** How much of the book's float is left to it. */
  calm: number;
  /** The book going into the parchment. */
  sheetOn: boolean;
  squash: number;
  disL: number;
  disP: number;
  fadeExp: number;
  ember: number;
  bookOn: boolean;
  /** How much of the warm light it stands in. */
  glow: number;
  /** The last page's clock (seconds since it began), negative before. */
  contactP: number;
  /** The scroll is open, still. */
  open: number;
};

export type Finale = {
  frame: FinaleFrame;
  sheet: Sheet;
  bird: BirdPose;
  birdScratch: BirdScratch;
  motes: FMote[];
  emit: Float64Array;
  lastC: number;
  lastPhase: number;
  /** The world points it was worked out against: where the book is held
   *  from, as it lies open; and where the scroll comes to, nearer. */
  gripRest: V3;
  zFinal: number;
  small: boolean;
  /** Its path in, ending where it stands on the book. */
  approach: PKey[];
  depart: PKey[];
  carry: PKey[];
  keysFor: string;
};

/** Where the book is held, book space: the head of its spine, between the
 *  two pages -- which, once it is a scroll, is the top of it, between the
 *  two rolls. */
export const GRIP_LOCAL: V3 = [XC, YP, 0];

export function createFinale(): Finale {
  return {
    frame: {
      c: 0,
      quiet: 0,
      veil: 0,
      dolly: 0,
      scale: 1,
      dy: 0,
      dYaw: 0,
      dPitch: 0,
      dRoll: 0,
      grip: [0, 0, 0],
      calm: 1,
      sheetOn: false,
      squash: 0,
      disL: 0,
      disP: 0,
      fadeExp: 0,
      ember: 0,
      bookOn: true,
      glow: 1,
      contactP: -1,
      open: 0,
    },
    sheet: createSheet(),
    bird: createBirdPose(),
    birdScratch: createBirdScratch(),
    motes: [],
    emit: new Float64Array(10),
    lastC: 0,
    lastPhase: 0,
    gripRest: [0, 0, 0],
    zFinal: 0,
    small: false,
    approach: [],
    depart: [],
    carry: [],
    keysFor: "",
  };
}

/** How much of each half is still rolled once it lies open. */
export function ellOpen(small: boolean) {
  return small ? ELL_OPEN_SMALL : ELL_OPEN;
}

/** How much of the parchment shows between its rolls once it lies open,
 *  either side of its middle, in units of its whole width (for setting the
 *  last page: contactPage). */
export function openHalf(small: boolean) {
  const ell = ellOpen(small);
  const shown = LH_FINAL - ell - rollRadius(ell) - (small ? 0.045 : 0.06);
  return shown / (2 * LH_FINAL);
}

/** How wide it is once it lies open, rolls and all, world units. */
export function openWidth(small: boolean) {
  const ell = ellOpen(small);
  return 2 * (LH_FINAL - ell + rollRadius(ell));
}

/* ------------------------------------------------------------------ */

const PT = [0, 0, 0];
const PV3 = [0, 0, 0];

/** Where the book is held at c, world units: where it lies, dipping as
 *  the bird lands on it; then carried; then let go, and coming to rest. */
function gripAt(f: Finale, c: number, out: number[]) {
  if (c < TAKE) {
    out[0] = f.gripRest[0];
    out[1] = f.gripRest[1];
    out[2] = f.gripRest[2];
    if (c > LAND) {
      const s = c - LAND;
      out[1] += -0.016 * Math.exp(-3.4 * s) * Math.sin(8 * s);
    }
    return;
  }
  path(f.carry, c, out);
}

/** The bird's own way through it, where it is not holding on to the book:
 *  in, and away. */
function flightAt(f: Finale, c: number, out: number[]) {
  if (c <= LAND) path(f.approach, c, out);
  else path(f.depart, c, out);
}

/** The way it is flying at c, as heading, pitch and bank. */
function flightFrame(f: Finale, c: number, out: number[]) {
  const h = 0.06;
  const v = [0, 0, 0];
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  const along = (cc: number, o: number[]) => {
    if (cc > LAND + 0.2 && cc < RELEASE + 0.2) gripAt(f, cc, o);
    else flightAt(f, cc, o);
  };
  along(c - h, a);
  along(c + h, b);
  for (let k = 0; k < 3; k++) v[k] = (b[k] - a[k]) / (2 * h);
  const vh = Math.hypot(v[0], v[2]);
  const psi = Math.atan2(v[0], -v[2]);
  // How fast it is turning.
  const a2 = [0, 0, 0];
  const b2 = [0, 0, 0];
  along(c - 0.25, a2);
  along(c - 0.25 + 2 * h, b2);
  const psiBefore = Math.atan2(b2[0] - a2[0], -(b2[2] - a2[2]));
  const turn = wrapAngle(psi - psiBefore) / 0.25;
  out[0] = psi;
  out[1] = clamp(Math.atan2(v[1], Math.max(0.05, vh)) * 0.5 + 0.1, -0.5, 0.6);
  out[2] = clamp(-0.5 * turn * Math.min(1, vh), -0.7, 0.7);
}

const FR = [0, 0, 0];
const FOOT = [0, 0, 0];

/** The bird's frame from heading, pitch and bank. */
function orient(b: BirdPose, psi: number, theta: number, phi: number) {
  const cp = Math.cos(theta);
  const f: V3 = [Math.sin(psi) * cp, Math.sin(theta), -Math.cos(psi) * cp];
  const r0: V3 = [Math.cos(psi), 0, Math.sin(psi)];
  // up = r0 x f
  const u0: V3 = [
    r0[1] * f[2] - r0[2] * f[1],
    r0[2] * f[0] - r0[0] * f[2],
    r0[0] * f[1] - r0[1] * f[0],
  ];
  const cb = Math.cos(phi);
  const sb = Math.sin(phi);
  for (let k = 0; k < 3; k++) {
    b.fwd[k] = f[k];
    b.right[k] = r0[k] * cb + u0[k] * sb;
    b.up[k] = u0[k] * cb - r0[k] * sb;
  }
}

/** Where the bird is when it stands on or holds on to `grip`. */
function attachedPos(b: BirdPose, grip: number[], out: number[]) {
  birdFoot(b, FOOT);
  const s = b.size;
  for (let k = 0; k < 3; k++) {
    out[k] =
      grip[k] -
      s * (FOOT[0] * b.fwd[k] + FOOT[1] * b.up[k] + FOOT[2] * b.right[k]);
  }
}

/** Everything the bird does at c but where it is. */
function poseBird(f: Finale, c: number) {
  const b = f.bird;
  b.size = BIRD_SIZE;
  b.flap = flapAt(c);
  b.amp = track(AMP, c);
  b.ext = track(EXT, c);
  b.lift = track(LIFT, c);
  b.sweep = track(SWEEP, c);
  b.tailFan = track(TAIL_FAN, c);
  b.tailPitch = track(TAIL_PITCH, c);
  b.legs = track(LEGS, c);
  b.reach = track(REACH, c);
  b.grip = track(GRIP, c);
  b.hang = track(HANG, c);
  b.headYaw = track(HEAD_YAW, c);
  b.headPitch = track(HEAD_PITCH, c);
  const free = track(FREE, c);
  flightFrame(f, c, FR);
  const psi = lerpAngle(track(PSI, c), FR[0], free);
  const theta = lerp(track(THETA, c), FR[1], free);
  const phi = FR[2] * free;
  orient(b, psi, theta, phi);
}

/** Lays out the paths for this screen (they end and begin where the book
 *  is, and the scroll's comes to where it can be read). */
function ensureKeys(f: Finale) {
  const g = f.gripRest;
  const key = `${g.map((v) => v.toFixed(4)).join(",")}:${f.zFinal.toFixed(4)}`;
  if (f.keysFor === key) return;
  f.keysFor = key;
  // Carried, and let go, and coming to rest.
  f.carry = [
    { c: TAKE, p: [g[0], g[1], g[2]], v: [0, 0, 0] },
    { c: 11.8, p: [g[0], g[1] + 0.08, g[2] + 0.08] },
    { c: 13.6, p: [g[0] + 0.05, g[1] + 0.15, g[2] + 0.12] },
    { c: 15.6, p: [0.17, g[1] + 0.2, 0.0] },
    { c: 17.3, p: [0.86, g[1] + 0.25, -0.75] },
    { c: 18.9, p: [0.44, g[1] + 0.3, -1.12] },
    { c: RELEASE, p: [-0.12, g[1] + 0.18, -0.72] },
    { c: 22.0, p: [-0.03, YP + 0.07, f.zFinal * 0.45 - 0.2] },
    { c: UNROLL[0], p: [0, YP, f.zFinal], v: [0, 0, 0] },
  ];
  // In: from far off and high, round, and down onto the book.
  const b = f.bird;
  poseBird(f, LAND);
  gripAt(f, LAND, PT);
  attachedPos(b, PT, PV3);
  f.approach = [
    { c: 0.6, p: [-1.7, 3.3, -8.4] },
    { c: 2.3, p: [-0.45, 2.3, -5.2] },
    { c: 3.9, p: [1.25, 1.5, -2.4] },
    { c: 5.2, p: [0.95, 1.02, -0.6] },
    { c: LAND, p: [PV3[0], PV3[1], PV3[2]], v: [0, 0, 0] },
  ];
  // Away: from where it lets go, up into the dark.
  const at = RELEASE + 0.12;
  const p0 = [0, 0, 0];
  const p1 = [0, 0, 0];
  poseBird(f, at - 0.05);
  gripAt(f, at - 0.05, PT);
  attachedPos(b, PT, p0);
  poseBird(f, at + 0.05);
  gripAt(f, at + 0.05, PT);
  attachedPos(b, PT, p1);
  f.depart = [
    {
      c: at,
      p: [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2],
      v: [(p1[0] - p0[0]) / 0.1, (p1[1] - p0[1]) / 0.1 + 0.4, (p1[2] - p0[2]) / 0.1],
    },
    { c: 21.7, p: [-0.55, g[1] + 1.0, -1.8] },
    { c: 23.2, p: [-1.3, g[1] + 2.0, -4.8] },
    { c: 25.0, p: [-2.1, g[1] + 3.1, -8.6] },
  ];
}

/* ------------------------------------------------------------------ */

const ACC = [0, 0, 0];
const A0 = [0, 0, 0];
const A1 = [0, 0, 0];
const A2 = [0, 0, 0];

/** How the scroll swings under the bird: the way its load would, lagging
 *  the way it is carried. */
function swingAt(f: Finale, c: number, out: number[]) {
  const h = 0.14;
  const cc = c - 0.3;
  gripAt(f, cc - h, A0);
  gripAt(f, cc, A1);
  gripAt(f, cc + h, A2);
  for (let k = 0; k < 3; k++) out[k] = (A0[k] - 2 * A1[k] + A2[k]) / (h * h);
}

/**
 * Works out the finale at clock `c`: everything but the motes. `gripRest`
 * is where the book is held from as it lies open (world); `zFinal` how
 * near the scroll comes to be read; `pitchOpen` the open book's pitch.
 */
export function finaleAt(
  f: Finale,
  c: number,
  gripRest: V3,
  zFinal: number,
  pitchOpen: number,
  small: boolean
) {
  f.gripRest = gripRest;
  f.zFinal = zFinal;
  f.small = small;
  ensureKeys(f);
  const fr = f.frame;
  fr.c = c;

  /* the universe, and the stage */
  fr.quiet = smoothstep(0, 3.2, c);
  fr.veil = finaleVeil(c);
  fr.dolly = finaleDolly(c);
  fr.scale = track(
    [
      [0, 1],
      [3.4, 0.9],
      [15.6, 0.9],
      [18.0, STAGE_END],
    ],
    c
  );
  // (Lower as the bird climbs with it, so neither ever leaves the frame.)
  fr.dy = track(
    [
      [0, 0],
      [3.4, 0.065],
      [TAKE, 0.065],
      [13.6, 0.13],
      [15.6, 0.15],
      [RELEASE, 0.12],
      [24.5, 0],
    ],
    c
  );

  /* the book, held and carried */
  gripAt(f, c, PT);
  const carried = smoothstep(TAKE, TAKE + 0.8, c) * (1 - smoothstep(RELEASE, RELEASE + 2.4, c));
  // Each beat jolts it a little.
  const beat = Math.sin(2 * Math.PI * flapAt(c) + 0.6) * track(AMP, c);
  PT[1] += 0.009 * beat * smoothstep(TAKE, TAKE + 0.5, c) * (1 - smoothstep(RELEASE - 0.1, RELEASE + 0.1, c));
  fr.grip[0] = PT[0];
  fr.grip[1] = PT[1];
  fr.grip[2] = PT[2];
  swingAt(f, c, ACC);
  const settle = 1 - smoothstep(RELEASE, UNROLL[0], c);
  fr.dRoll = clamp(-0.12 * ACC[0], -0.3, 0.3) * carried;
  // Hanging from its feet it comes upright, though never quite (we see the
  // tops of its rolls); let go, square to us.
  fr.dPitch =
    (-pitchOpen - 0.12) * smoothstep(10.4, 12.4, c) +
    0.12 * smoothstep(RELEASE, UNROLL[0], c) +
    clamp(0.1 * ACC[2], -0.22, 0.22) * carried;
  fr.dYaw =
    (0.36 * Math.sin(Math.PI * span(c, 10.8, 15.4)) +
      0.22 * Math.sin(Math.PI * span(c, 15.6, 20.9))) *
    settle;
  fr.calm = finaleCalm(c);

  /* the book, going into the parchment */
  const sh = f.sheet;
  fr.sheetOn = c >= SHEET_ON;
  const flat = smootherstep(span(c, FLATTEN[0], FLATTEN[1]));
  fr.squash = flat;
  fr.fadeExp = smoothstep(FADE_EXP[0], FADE_EXP[1], c);
  fr.disL = 1.04 * easeInOutSine(span(c, DIS_LEATHER[0], DIS_LEATHER[1]));
  fr.disP = 1.04 * easeInOutSine(span(c, DIS_PAGES[0], DIS_PAGES[1]));
  fr.ember = 1 - smoothstep(BOOK_GONE - 0.4, BOOK_GONE, c);
  fr.bookOn = c < BOOK_GONE;
  sh.flat = flat;
  sh.gutter = lerp(1, 0.12, flat);
  sh.lh = lerp(PL, LH_FINAL, smootherstep(span(c, GROW[0], GROW[1])));
  const shut = closedEll(sh.lh);
  const rolled = smootherstep(span(c, ROLL[0], ROLL[1]));
  const opened = smootherstep(span(c, UNROLL[0], UNROLL[1]));
  sh.ell = c < UNROLL[0] ? rolled * shut : lerp(shut, ellOpen(small), opened);
  sh.parch = c >= SWAP;
  fr.open = opened;
  fr.glow = 1 - 0.3 * smoothstep(ROLL[0], ROLL[1], c) * (1 - opened) + 0.12 * opened;
  fr.contactP = c - CONTACT_AT;

  /* the bird */
  const b = f.bird;
  poseBird(f, c);
  if (c <= LAND) {
    flightAt(f, c, PV3);
  } else if (c <= RELEASE + 0.12) {
    attachedPos(b, PT, PV3);
  } else {
    flightAt(f, c, PV3);
  }
  // A flying bird's body rises and falls against its beat.
  const free = c <= LAND || c > RELEASE + 0.12;
  if (free) {
    const bob = 0.022 * b.amp * Math.sin(2 * Math.PI * b.flap + 0.6) * b.size;
    for (let k = 0; k < 3; k++) PV3[k] += b.up[k] * bob;
  }
  b.pos[0] = PV3[0];
  b.pos[1] = PV3[1];
  b.pos[2] = PV3[2];
  b.alpha = smoothstep(0.6, 2.8, c) * (1 - smoothstep(23.0, 25.0, c));
  // The universe's light along its edges is there, faintly, from the
  // first; the book's warm light only near it.
  const dx = PV3[0];
  const dy = PV3[1] - 0.2;
  const dz = PV3[2];
  const near = Math.exp(-((dx * dx + dy * dy + dz * dz) / (2.4 * 2.4)));
  b.rim = 0.3 + 0.7 * near;
  const sx = PV3[0] - PT[0];
  const sy = PV3[1] - (PT[1] - YP);
  const sz = PV3[2] - PT[2];
  b.warm = Math.exp(-((sx * sx + sy * sy + sz * sz) / (0.95 * 0.95))) * fr.glow;
  return fr;
}

/** How much further the universe is dimmed at c (for the veil, which is
 *  laid before the frame is worked out). */
export function finaleVeil(c: number) {
  return FIN_VEIL * smoothstep(0, 3.2, c);
}

/** How much further the camera has gone on at c, OPEN_DOLLY units. */
export function finaleDolly(c: number) {
  return FIN_DOLLY * easeInOutSine(span(c, 15.0, 21.6));
}

/** How much of the open book's float is left to it at c. */
export function finaleCalm(c: number) {
  return track(
    [
      [0, 1],
      [LAND, 1],
      [7.6, 0],
      [21.5, 0],
      [24, 1.15],
    ],
    c
  );
}

/** How much the page's dust has given way to the finale's at c. */
export function finaleTakeover(c: number) {
  return smoothstep(SHEET_ON - 0.3, SHEET_ON + 0.5, c);
}

/** Whether, at c, what of the bird is further off than the book (or the
 *  scroll) is hidden by it: all the while it is there to be hidden -- on
 *  its way in, standing on it, holding it, and away. */
export function birdHolds(c: number) {
  return c > 0;
}

/** The finale lasts this long, given how long its last page takes. */
export function finaleSpan(contactSpan: number) {
  return CONTACT_AT + contactSpan;
}

/* ------------------------------------------------------------------ *
 * The motes: what the book gives up, and what the bird brings with it
 * ------------------------------------------------------------------ */

type FMote = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
  a: number;
  /** Palette slots it cools from and to, over `cool` seconds. */
  c0: number;
  c1: number;
  cool: number;
  /** Drawn in to one of the rolls (-1 left, 1 right), how far up it, and
   *  from when; 0 for a mote left to drift. */
  side: number;
  hf: number;
  pull: number;
  ph: number;
  px: number;
  py: number;
};

/** Palette slots (bookOpening's): warm, gold, pale, ember, hot, cold. */
export const M_WARM = 0;
export const M_GOLD = 1;
export const M_PALE = 2;
export const M_EMBER = 3;
export const M_HOT = 4;
export const M_COLD = 5;

/** What the motes need of the stage this frame. */
export type FinaleStage = {
  /** Book space to screen (with the book pressed flat as it is now). */
  book: (x: number, y: number, z: number, out: number[]) => void;
  /** World to screen. */
  world: (x: number, y: number, z: number, out: number[]) => void;
  /** The book's height on screen, for scaling what moves. */
  size: number;
  small: boolean;
};

// The same fields the shader burns the book back along (bookGL).
function n3(x: number, y: number, z: number) {
  return (
    0.5 +
    0.25 * Math.sin(9.1 * x + 4.3 * y + 2.1) * Math.sin(7.7 * y - 3.9 * z + 5.3 * x + 0.7) +
    0.25 * Math.sin(13.7 * y + 11.3 * z - 6.1 * x + 4.1) * Math.sin(10.3 * x - 8.9 * y + 1.3)
  );
}
function leatherField(x: number, y: number, z: number) {
  return 0.62 * (1 - clamp(Math.abs(x - XC) / 0.95, 0, 1)) + 0.38 * n3(x, y, z);
}
function pagesField(x: number, y: number, z: number) {
  return (
    0.7 * (1 - clamp(Math.abs(x - XC) / 0.8, 0, 1)) +
    0.3 * n3(x * 1.7 + 3, y * 1.7 + 3, z * 1.7 + 3)
  );
}

function due(f: Finale, slot: number, rate: number, dt: number) {
  f.emit[slot] += rate * dt;
  const n = Math.floor(f.emit[slot]);
  f.emit[slot] -= n;
  return n;
}

function spawn(
  f: Finale,
  small: boolean,
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
  r: number,
  a: number,
  c0: number,
  c1: number,
  cool: number,
  side = 0,
  pull = 0
) {
  if (f.motes.length >= (small ? 120 : 240)) return;
  f.motes.push({
    x,
    y,
    vx,
    vy,
    age: 0,
    life,
    r,
    a,
    c0,
    c1,
    cool,
    side,
    hf: 0.08 + 0.84 * Math.random(),
    pull,
    ph: Math.random() * Math.PI * 2,
    px: x,
    py: y,
  });
}

const S3 = [0, 0, 0];
const L3 = [0, 0, 0];

/** Lets go of whatever motes are due this frame, going forward. */
function emitMotes(f: Finale, st: FinaleStage, c: number, prevC: number, dt: number) {
  const fr = f.frame;
  const rnd = Math.random;
  const sc = st.size / 450;
  const small = st.small;
  const crossed = (at: number) => prevC < at && c >= at;

  // It lands: a breath of dust off the book's head.
  if (crossed(LAND)) {
    st.world(fr.grip[0], fr.grip[1], fr.grip[2], S3);
    for (let n = 0; n < (small ? 7 : 12); n++) {
      const a = Math.PI * (1 + rnd());
      const s = (8 + rnd() * 22) * sc;
      spawn(f, small, S3[0] + (rnd() - 0.5) * 30 * sc, S3[1], Math.cos(a) * s, Math.sin(a) * s * 0.6, 2.2 + rnd() * 1.6, 0.6 + rnd() * 0.8, 0.35 + rnd() * 0.3, M_PALE, M_GOLD, 1.5);
    }
  }
  // It takes the book up: a pulse of warm light from its feet.
  if (crossed(TAKE + 0.15)) {
    st.world(fr.grip[0], fr.grip[1], fr.grip[2], S3);
    for (let n = 0; n < (small ? 8 : 14); n++) {
      const a = rnd() * Math.PI * 2;
      const s = (10 + rnd() * 26) * sc;
      spawn(f, small, S3[0], S3[1], Math.cos(a) * s, Math.sin(a) * s, 1.8 + rnd() * 1.4, 0.6 + rnd() * 0.7, 0.4 + rnd() * 0.3, M_HOT, M_GOLD, 1.0);
    }
  }
  // The leather, as it burns back: off the front, hot, cooling as they
  // go, and drawn into the rolls.
  const thr = fr.disL;
  if (thr > 0 && thr < 1.03 && fr.bookOn) {
    for (let n = due(f, 0, small ? 16 : 30, dt); n > 0; n--) {
      for (let tries = 0; tries < 24; tries++) {
        const pick = rnd();
        let x: number;
        let y: number;
        let z: number;
        if (pick < 0.75) {
          // A board: mostly its edges, which are what show.
          const left = rnd() < 0.5;
          const edge = rnd() < 0.7;
          let u = rnd();
          y = -0.5 + rnd();
          if (edge) {
            const e = rnd();
            if (e < 0.4) y = rnd() < 0.5 ? -0.5 : 0.5;
            else if (e < 0.7) u = 1;
          }
          x = left ? X0 - 2 * T - u * BW : X0 + u * BW;
          z = -T - BT * rnd();
        } else {
          x = XC + (rnd() - 0.5) * 2 * T;
          y = -0.5 + rnd();
          z = -T - SB * rnd();
        }
        const fld = leatherField(x, y, z);
        if (fld < thr || fld > thr + 0.045) continue;
        st.book(x, y, lerp(z, -0.006, fr.squash), S3);
        const side = x < XC ? -1 : 1;
        spawn(f, small, S3[0], S3[1], (rnd() - 0.5) * 18 * sc, -(8 + rnd() * 16) * sc, 3.6 + rnd() * 1.5, 0.8 + rnd() * 0.9, 0.5 + rnd() * 0.35, M_HOT, rnd() < 0.5 ? M_GOLD : M_PALE, 0.9 + rnd() * 0.6, side, 0.5 + rnd() * 0.8);
        break;
      }
    }
  }
  // The leaves, pressed out of the block's edges as it is pressed flat.
  const pressing = fr.squash > 0.02 && fr.squash < 0.98;
  if ((pressing || (fr.disP > 0 && fr.disP < 1.03)) && fr.bookOn) {
    for (let n = due(f, 1, small ? 7 : 14, dt); n > 0; n--) {
      const side = rnd() < 0.5 ? -1 : 1;
      const u = 0.1 + 0.88 * rnd();
      const x = XC + side * (T + u * (PL - T));
      const y = rnd() < 0.5 ? (rnd() < 0.5 ? -YP : YP) : -YP + 2 * YP * rnd();
      const z = -T * rnd();
      if (!pressing && Math.abs(pagesField(x, y, z) - fr.disP) > 0.06) continue;
      st.book(x, y, lerp(z, -0.006, fr.squash), S3);
      spawn(f, small, S3[0], S3[1], (rnd() - 0.5) * 10 * sc, -(4 + rnd() * 9) * sc, 3.2 + rnd() * 1.5, 0.65 + rnd() * 0.7, 0.38 + rnd() * 0.3, M_PALE, M_GOLD, 1.6, side, 0.3 + rnd() * 0.6);
    }
  }
  // Off the lips of the rolls as they turn, rolling up and unrolling.
  const sh = f.sheet;
  const turning =
    (c > ROLL[0] + 0.3 && c < ROLL[1] - 0.2) ||
    (c > UNROLL[0] + 0.2 && c < UNROLL[1] - 0.3);
  if (turning) {
    for (let n = due(f, 2, small ? 3 : 6, dt); n > 0; n--) {
      const side = rnd() < 0.5 ? -1 : 1;
      rollPoint(sh, side, 0.05 + 0.9 * rnd(), L3);
      st.book(L3[0], L3[1], L3[2] + rollRadius(sh.ell), S3);
      spawn(f, small, S3[0], S3[1], (rnd() - 0.5) * 8 * sc, -(5 + rnd() * 9) * sc, 2.6 + rnd() * 1.8, 0.45 + rnd() * 0.6, 0.3 + rnd() * 0.3, rnd() < 0.5 ? M_PALE : M_GOLD, M_GOLD, 2);
    }
  }
  // It lets go: a few from its feet.
  if (crossed(RELEASE + 0.05)) {
    st.world(fr.grip[0], fr.grip[1], fr.grip[2], S3);
    for (let n = 0; n < (small ? 6 : 10); n++) {
      const a = rnd() * Math.PI * 2;
      const s = (8 + rnd() * 18) * sc;
      spawn(f, small, S3[0], S3[1], Math.cos(a) * s, Math.sin(a) * s, 2 + rnd() * 1.5, 0.5 + rnd() * 0.6, 0.35 + rnd() * 0.3, M_GOLD, M_PALE, 1.5);
    }
  }
  // And the bird: at the bottom of a hard beat, a little of the universe's
  // dust shaken off its wingtips.
  const b = f.bird;
  const ph = b.flap;
  const bottom = f.lastPhase < 0.5 && ph >= 0.5;
  f.lastPhase = ph;
  if (bottom && b.amp > 0.3 && b.alpha > 0.2) {
    const t = f.birdScratch.tips;
    for (const o of [0, 2]) {
      if (rnd() < 0.35) continue;
      spawn(f, small, t[o], t[o + 1], (rnd() - 0.5) * 6 * sc, (2 + rnd() * 6) * sc, 2.2 + rnd() * 1.6, 0.45 + rnd() * 0.5, 0.25 + rnd() * 0.25 * b.alpha, M_COLD, M_PALE, 2);
    }
  }
}

/**
 * Lets go of, moves and draws the finale's motes (forward only lets any
 * go), on the canvas over the book.
 */
export function drawFinaleMotes(
  ctx: CanvasRenderingContext2D,
  f: Finale,
  w: JourneyWorld,
  pal: number[],
  st: FinaleStage,
  dt: number,
  time: number
) {
  const c = f.frame.c;
  // Shutting, they are simply gone: it all runs back too fast for them.
  if (c <= 0 || c < f.lastC - 1e-6) {
    f.motes.length = 0;
    f.lastC = c;
    return;
  }
  // (A clock that leaps -- never in play -- lets nothing go on the way.)
  if (dt > 0 && c - f.lastC < 0.5) emitMotes(f, st, c, f.lastC, dt);
  f.lastC = c;
  const sprites = w.bank.sprites;
  const sc = st.size / 450;
  const sh = f.sheet;
  const motes = f.motes;
  let n = 0;
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < motes.length; i++) {
    const m = motes[i];
    m.age += dt;
    if (m.age >= m.life) continue;
    const drag = Math.exp(-dt * 0.9);
    if (m.side && m.age > m.pull) {
      // Drawn in to its roll, where it goes into the parchment.
      rollPoint(sh, m.side, m.hf, L3);
      st.book(L3[0], L3[1], L3[2], S3);
      const k = smoothstep(m.pull, m.pull + 0.9, m.age);
      const dx = S3[0] - m.x;
      const dy = S3[1] - m.y;
      m.vx += (dx * 7 * k - m.vx * 3.2 * k) * dt;
      m.vy += (dy * 7 * k - m.vy * 3.2 * k) * dt;
      if (dx * dx + dy * dy < 36 && k > 0.6 && m.life > m.age + 0.3) {
        m.life = m.age + 0.3;
      }
    } else {
      m.vx *= drag;
      m.vy = m.vy * drag - 3 * dt * sc;
    }
    m.x += m.vx * dt + Math.sin(time * 0.9 + m.ph) * dt * 4 * sc;
    m.y += m.vy * dt;
    const env =
      smoothstep(0, 0.3, m.age) * (1 - smoothstep(m.life * 0.55, m.life, m.age));
    const tw = 0.75 + 0.25 * Math.sin(time * 2.3 + m.ph * 3);
    const a = m.a * env * tw;
    const heat = smoothstep(0, m.cool, m.age);
    if (a > 0.01) {
      if (heat < 0.999) {
        blitGlow(ctx, sprites[pal[m.c0]], m.x, m.y, m.px, m.py, m.r, a * (1 - heat));
      }
      if (heat > 0.001) {
        blitGlow(ctx, sprites[pal[m.c1]], m.x, m.y, m.px, m.py, m.r, a * heat);
      }
    }
    m.px = m.x;
    m.py = m.y;
    motes[n++] = m;
  }
  motes.length = n;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

/** Forgets every mote at once (the book is gone). */
export function clearFinale(f: Finale) {
  f.motes.length = 0;
  f.lastC = 0;
  f.emit.fill(0);
}
