/**
 * guideParticle
 * -------------
 * The one mote of the galaxy that leads the camera through the project
 * universe.
 *
 * It is a real particle of the galaxy, not something added to it: until the
 * scroll that starts the journey it is simply one of the field, drawn by the
 * galaxy like any other. Then, over the first leg (timings in
 * journeyDirector) --
 *
 *   it gathers itself where it is: its drift steadies, it warms and
 *   brightens, and the motes nearest it lean in toward it;
 *   it comes loose and comes toward the viewer, growing as it nears;
 *   it turns for the opening in the galaxy and goes, and the camera follows
 *   -- along the camera's own path, a little ahead, further ahead the faster
 *   they go, so it is always the thing being followed;
 *   it reaches the horizon first and goes through, dimming as it does;
 *   the camera follows it in, and it comes to rest beside the first world.
 *
 * From there every leg is the same: it moves off, the camera follows, and it
 * settles beside the next world as the camera comes to rest there. At the
 * last stop it rests where the Education book's seed is looked for, and is
 * handed over to be that seed -- one particle, the whole way.
 *
 * Everything here is a pure function of the director's position and the
 * camera, so the whole thing plays backwards when the journey does, and the
 * guide is in the same place on every frame the camera is.
 *
 * Its passage disturbs the field: see the wake in blackHoleJourney.
 */

import {
  blitGlowRaw,
  drawGalaxyGlow,
  pathAtDepth,
  projectWorld,
  type GalaxyParticle,
  type JourneyCam,
  type JourneyWorld,
} from "./blackHoleJourney";
import {
  LEG0_FORWARD,
  LEG0_IGNITE,
  LEG0_LEAD,
  LEG0_STEADY,
  legDuration,
  type Director,
} from "./journeyDirector";
import { SEED_AT } from "./educationBook";
import type { Station } from "./projectStations";

/* ------------------------------------------------------------------ *
 * Tuning
 * ------------------------------------------------------------------ */

/** Where in frame the mote it will be is looked for: the lower left of the
 *  galaxy's ring, so its way to the opening crosses the frame. */
const PICK_AT = [0.34, 0.7] as const;
/** ...one that reads clearly, but is not one of the largest. Core radius
 *  (px at 900 tall) and depth (UNIT) it may have. */
const PICK_R = [2.2, 5.5] as const;
const PICK_Z = [2, 6.5] as const;

/** Its distance from the camera (UNIT) in front of the viewer, and resting
 *  beside a world. */
const DZ_FRONT = 0.85;
const DZ_HOVER = 1.3;
/** Where in front of the viewer it comes: this far from where it was
 *  toward the opening, and a little below the line between them. */
const FRONT_K = 0.38;
const FRONT_DROP = 0.035;
/** How far its way toward the viewer bows, in frame heights. */
const FRONT_BOW = 0.05;

/** How far ahead of the camera it leads (UNIT): at rest, and more with the
 *  square root of the camera's speed. */
const LEAD_MIN = 1.3;
const LEAD_GAIN = 0.4;
const LEAD_MAX = 3.2;

/** Once lit, its size goes as its depth to this power -- milder than the
 *  galaxy's own 0.62, so it grows as it nears without swelling into a
 *  disc -- from the size it had as one of the galaxy's motes. */
const SIZE_POW = 0.5;
/** Its light, over the soft point the book's seed is drawn as: a hot white
 *  core (against its radius) and a wide, faint glow round it -- what makes
 *  it the brightest thing in the field, the one to follow. */
const CORE_K = 0.5;
const GLOW_K = 8;
const GLOW_A = 0.055;
const HOT = "255,246,232";
/** Resting with a world: its gap from the world (in frame heights), how
 *  much room its name takes under it (in the name's own size), and its
 *  slow drift there (px at 900 tall). */
const HOVER_GAP = 0.035;
const TITLE_CLEAR = 2.6;
const IDLE = 4;
/** Between worlds: how far ahead of the camera it draws at the middle of
 *  the way (UNIT), and how far its way bows toward the middle of frame
 *  (frame heights). It gets there this many seconds before the camera
 *  comes to rest, so it is waiting as the camera arrives. */
const DZ_AHEAD = 2.7;
const WAY_BOW = 0.12;
const BOW_TO = [0.5, 0.58] as const;
const WAIT_S = 0.45;
/** The dive: over this stretch of the camera's distance from the horizon
 *  (UNIT) it goes on ahead, into the hole, to this far past the horizon;
 *  and it is caught up with over this far past it. */
const DIVE_FAR = 10;
const DIVE_NEAR = 5;
const DIVE_PAST = 2.5;
const DIVE_OUT = 4;
/** Seconds the first leg's end it has to make for the first world, from
 *  where it is waiting just inside -- once the camera is through. */
const ARRIVE_LEG0 = [1.25, 0.1] as const;
/** At the bottom it rests further off, the size the book's seed is. */
const DZ_REST = 2.2;

/** Seconds of trail it leaves, and how often a point of it is laid. */
const TRAIL_S = 0.3;
const TRAIL_N = 24;

/** The wake: its reach (frame heights at DZ_HOVER), how far it parts and
 *  turns the motes it passes (px at 900 tall), how much it lights them, and
 *  how far the motes nearest lean in while it gathers itself. */
const WAKE_R = 0.13;
const WAKE_PUSH = 7;
const WAKE_SWIRL = 5;
const WAKE_GLOW = 0.45;
const GATHER_PULL = 3.5;

/** Its colour: the same warm light as the book's seed. */
const WARM = [255, 232, 198] as const;

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

/** Between two distances, evenly in how large the thing at them reads. */
function lerpDepth(a: number, b: number, t: number) {
  return a * Math.pow(b / a, t);
}

export type Guide = {
  /** The galaxy mote it is, by index into the galaxy's list. */
  idx: number;
  p: GalaxyParticle | null;
  /** True while it is out of the field and drawing itself. */
  claimed: boolean;
  W: number;
  H: number;
  /** Where it rests at each stop (px); stop 0 is the galaxy itself. */
  hoverX: number[];
  hoverY: number[];
  /** The opening's centre on screen, from the gateway. */
  holeX: number;
  holeY: number;
  spr: number;

  /* --- this frame --- */
  on: boolean;
  x: number;
  y: number;
  /** Its distance ahead of the camera, UNIT. */
  dz: number;
  r: number;
  a: number;
  /** 0 still the galaxy's own mote, 1 its own warm light. */
  lit: number;
  /** How much of its light beyond the plain point there is: all of it on
   *  the way, none once it rests where the book's seed will be. */
  boost: number;
  px: number;
  py: number;
  tx: Float32Array;
  ty: Float32Array;
  tt: Float32Array;
  head: number;
  count: number;
  laidAt: number;
};

export function createGuide(): Guide {
  return {
    idx: -1,
    p: null,
    claimed: false,
    W: 0,
    H: 0,
    hoverX: [],
    hoverY: [],
    holeX: 0,
    holeY: 0,
    spr: 0,
    on: false,
    x: 0,
    y: 0,
    dz: 1,
    r: 0,
    a: 0,
    lit: 0,
    boost: 1,
    px: 0,
    py: 0,
    tx: new Float32Array(TRAIL_N),
    ty: new Float32Array(TRAIL_N),
    tt: new Float32Array(TRAIL_N),
    head: 0,
    count: 0,
    laidAt: -1e9,
  };
}

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

/**
 * Called whenever the galaxy and the world are rebuilt. Chooses the mote --
 * unless one is already out leading, which a resize must not swap from under
 * it -- and works out where it rests at every stop.
 */
export function layoutGuide(
  g: Guide,
  galaxy: GalaxyParticle[],
  w: JourneyWorld,
  stations: Station[],
  focal: number,
  cssW: number,
  cssH: number,
  attached: boolean
) {
  g.W = cssW;
  g.H = cssH;
  g.spr = w.bank.index(WARM[0], WARM[1], WARM[2]);
  if (attached || g.idx < 0 || g.idx >= galaxy.length) {
    g.idx = pickGuide(galaxy, focal, cssW, cssH);
  }
  g.p = galaxy[g.idx] ?? null;

  g.holeX = w.cx + (w.bhX * focal) / w.bhZ;
  g.holeY = w.cy + (w.bhY * focal) / w.bhZ;

  // With each world, on the side of it toward the middle of frame: under
  // its name for one high in the sky, just over its screen for one low --
  // keeping it company, never in front of it. Centred on it, so the way
  // from one world to the next crosses the frame.
  g.hoverX = [0];
  g.hoverY = [0];
  for (const s of stations) {
    const dist = s.def.distant;
    if (!dist) continue;
    const fx = dist.frame[0] * cssW;
    const fy = dist.frame[1] * cssH;
    const halfH = ((s.basePx * dist.scale) / 2) * (9 / 16);
    g.hoverX.push(fx);
    g.hoverY.push(
      fy < 0.5 * cssH
        ? fy + halfH + s.cardPx * TITLE_CLEAR + HOVER_GAP * cssH
        : fy - halfH - HOVER_GAP * cssH
    );
  }
  // ...and at the bottom, where the book's seed is looked for.
  g.hoverX.push(SEED_AT[0] * cssW);
  g.hoverY.push(SEED_AT[1] * cssH);
}

function pickGuide(
  galaxy: GalaxyParticle[],
  focal: number,
  cssW: number,
  cssH: number
) {
  const k = cssH / 900;
  const tx = PICK_AT[0] * cssW;
  const ty = PICK_AT[1] * cssH;
  let best = -1;
  let bestScore = -1;
  for (let pass = 0; pass < 2 && best < 0; pass++) {
    for (let i = 0; i < galaxy.length; i++) {
      const p = galaxy[i];
      const r = (p.dotRadius * p.portalDepthScale) / k;
      const z = p.zWorld / focal;
      // The second pass takes anything, if nothing fits the first.
      if (pass === 0 && (r < PICK_R[0] || r > PICK_R[1])) continue;
      if (pass === 0 && (z < PICK_Z[0] || z > PICK_Z[1])) continue;
      if (p.portalX < 0 || p.portalY < 0 || p.portalX > cssW || p.portalY > cssH) {
        continue;
      }
      const dx = (p.portalX - tx) / (0.16 * cssW);
      const dy = (p.portalY - ty) / (0.16 * cssH);
      const score = p.portalDepthAlpha * Math.exp(-(dx * dx + dy * dy));
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
  }
  return Math.max(0, best);
}

/* ------------------------------------------------------------------ *
 * Where it is
 * ------------------------------------------------------------------ */

const PR = new Float64Array(5);
const PT = { x: 0, y: 0 };
// One place it can be: [x, y, dz].
const A = new Float64Array(3);
const B = new Float64Array(3);

/** Its galaxy mote as the galaxy would draw it now, its drift scaled by
 *  `drift` -- into A. */
function galaxyAnchor(
  g: Guide,
  cam: JourneyCam,
  w: JourneyWorld,
  focal: number,
  time: number,
  drift: number
) {
  const p = g.p!;
  const ia = time * p.idleSpeed + p.idlePhase;
  const gx = p.portalX + Math.cos(ia) * p.idleAmpX * drift;
  const gy = p.portalY + Math.sin(ia * 1.15 + p.seed * 6.28) * p.idleAmpY * drift;
  const kz = p.zWorld / focal;
  projectWorld(PR, cam, w, focal, (gx - w.cx) * kz, (gy - w.cy) * kz, p.zWorld);
  A[0] = PR[4] ? PR[0] : gx;
  A[1] = PR[4] ? PR[1] : gy;
  A[2] = Math.max(0.05, (p.zWorld - cam.z) / w.unit);
}

/** Resting at stop k, drifting slowly -- into out. */
function hoverAnchor(g: Guide, k: number, time: number, out: Float64Array) {
  const s = g.H / 900;
  out[0] = g.hoverX[k] + Math.sin(time * 0.61 + k * 1.7) * IDLE * s;
  out[1] = g.hoverY[k] + Math.sin(time * 0.47 + k * 2.3 + 1.1) * IDLE * 0.7 * s;
  out[2] = k === g.hoverX.length - 1 ? DZ_REST : DZ_HOVER;
}

/** A point on the camera's own path, `L` UNIT ahead of it -- into out.
 *  While the hole is still ahead, on the line to the hole instead: the
 *  camera swings over the disc on its way in, but the guide makes straight
 *  for the heart of the opening -- a light against the black, never lost in
 *  the glare of the disc round it -- and the two meet at the horizon. */
function leadAnchor(
  cam: JourneyCam,
  w: JourneyWorld,
  focal: number,
  L: number,
  out: Float64Array
) {
  const d = L * w.unit;
  pathAtDepth(PT, w, cam.z + d);
  out[0] = w.cx + ((PT.x - cam.x) * focal) / d;
  out[1] = w.cy + ((PT.y - cam.y) * focal) / d;
  out[2] = L;
  // The dive: as the camera closes on the hole the guide goes on ahead of
  // it, through the horizon and down into the dark, straight for the middle
  // -- and is caught up with once the camera is through after it.
  const toHole = (w.bhZ - cam.z) / w.unit;
  const dive =
    toHole > 0
      ? smoothstep(DIVE_FAR, DIVE_NEAR, toHole)
      : 1 - smoothstep(0, DIVE_OUT, -toHole);
  if (dive > 0) out[2] = lerpDepth(L, Math.max(L, toHole + DIVE_PAST), dive);
  if (cam.lens) {
    // Let go of just short of the horizon, where the hole's centre on
    // screen is a division by almost nothing -- and where the path is on
    // it anyway.
    const bias = smoothstep(0.4, 1.5, toHole);
    out[0] = lerp(out[0], cam.bx, bias);
    out[1] = lerp(out[1], cam.by, bias);
  }
}

/** Moves A toward B by t, bowed sideways by `bow` px at the middle. */
function blendInto(t: number, bow = 0) {
  if (t <= 0) return;
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  let ox = 0;
  let oy = 0;
  if (bow !== 0) {
    const len = Math.hypot(dx, dy) || 1;
    const b = bow * Math.sin(Math.PI * t);
    ox = (-dy / len) * b;
    oy = (dx / len) * b;
  }
  A[0] += dx * t + ox;
  A[1] += dy * t + oy;
  A[2] = lerpDepth(A[2], B[2], t);
}

/** The camera the frame is drawn from, and the director that flew it
 *  there. Works out where the guide is, how it looks, and its wake. */
export function solveGuide(
  g: Guide,
  d: Director,
  cam: JourneyCam,
  w: JourneyWorld,
  focal: number,
  time: number
) {
  g.on = false;
  g.claimed = false;
  if (!g.p || d.pos <= 0 || g.hoverX.length < d.stops.length) {
    g.count = 0;
    return;
  }
  const leg = d.leg;
  const tau = d.tau;
  const dur = legDuration(d, leg);
  const L = clamp(
    LEAD_MIN + LEAD_GAIN * Math.sqrt(Math.max(0, d.camV)),
    LEAD_MIN,
    LEAD_MAX
  );

  let lit = 1;
  if (leg === 0) {
    // Its own mote, steadying where it is and gathering itself...
    const steady = smoothstep(LEG0_STEADY[0], LEG0_STEADY[1], tau);
    lit = smoothstep(LEG0_IGNITE[0], LEG0_IGNITE[1], tau);
    galaxyAnchor(g, cam, w, focal, time, 1 - steady);
    // ...coming toward the viewer, a little way toward the opening...
    const p = g.p;
    B[0] = lerp(p.portalX, g.holeX, FRONT_K);
    B[1] = lerp(p.portalY, g.holeY, FRONT_K) + FRONT_DROP * g.H;
    B[2] = DZ_FRONT;
    const side = p.portalX < g.W / 2 ? -1 : 1;
    blendInto(
      smoothstep(LEG0_FORWARD[0], LEG0_FORWARD[1], tau),
      FRONT_BOW * g.H * side
    );
    // ...then off for the opening, the camera behind it, and on in...
    leadAnchor(cam, w, focal, L, B);
    blendInto(smoothstep(LEG0_LEAD[0], LEG0_LEAD[1], tau));
    // ...and, once the camera is through after it, to the first world.
    hoverAnchor(g, 1, time, B);
    blendInto(smoothstep(dur - ARRIVE_LEG0[0], dur - ARRIVE_LEG0[1], tau));
  } else {
    // From one world to the next, on a way that bows gently toward the
    // middle of frame, drawing on ahead of the camera as it goes and
    // waiting there as the camera arrives.
    hoverAnchor(g, leg, time, A);
    hoverAnchor(g, leg + 1, time, B);
    const way = smoothstep(0, dur - WAIT_S, tau);
    // Toward the middle of frame -- a little below it, so a way that runs
    // straight across bows under the worlds high in the sky, never over
    // one's face -- whichever side of the way that is on.
    const mx = (A[0] + B[0]) / 2 - g.W * BOW_TO[0];
    const my = (A[1] + B[1]) / 2 - g.H * BOW_TO[1];
    const toward = (B[1] - A[1]) * mx - (B[0] - A[0]) * my > 0 ? 1 : -1;
    const from = A[2];
    const to = B[2];
    blendInto(way, WAY_BOW * g.H * toward);
    const ahead = Math.sin(Math.PI * way);
    A[2] = lerpDepth(lerpDepth(from, to, way), DZ_AHEAD, ahead * ahead);
  }

  const x = A[0];
  const y = A[1];
  const dz = A[2];

  // Its size: a galaxy mote's own, by its depth, handing over to its own
  // light's as it is lit.
  const p = g.p;
  const k = g.H / 900;
  const z0 = p.zWorld / w.unit;
  const twinkle =
    0.82 + 0.18 * Math.sin(time * p.idleSpeed * 2.3 + p.idlePhase * 1.7);
  const r0 = p.dotRadius * p.portalDepthScale;
  const own = r0 * twinkle * Math.pow(z0 / dz, 0.62);
  const mine = r0 * Math.pow(z0 / dz, SIZE_POW);
  let r = Math.max(lerp(own, mine, lit), 1.2 * k);
  let a = lerp(p.portalDepthAlpha, 1, lit);

  // Through the horizon ahead of the camera: while the hole still stands
  // between them, it is down in the dark, and dims.
  const gz = cam.z + dz * w.unit;
  if (cam.lens) {
    const inside = smoothstep(0, 0.6 * w.unit, gz - w.bhZ) * cam.grip;
    a *= 1 - 0.5 * inside;
    r *= 1 - 0.22 * inside;
  }

  // A jump (the scrollbar, a resize) is not a movement: no trail across it.
  if (g.count === 0) {
    g.px = x;
    g.py = y;
  } else if (Math.hypot(x - g.x, y - g.y) > 0.25 * g.W) {
    g.count = 0;
    g.px = x;
    g.py = y;
  } else {
    g.px = g.x;
    g.py = g.y;
  }
  g.on = true;
  g.claimed = true;
  g.x = x;
  g.y = y;
  g.dz = dz;
  g.r = r;
  g.a = a;
  g.lit = lit;
  // Calming, over the last of the way down to where the book is made.
  g.boost = 1 - smoothstep(0.35, 1, d.pos - (d.last - 1));

  // The trail: a point laid every so often, so how long it is says how
  // fast it is going.
  if (time - g.laidAt >= TRAIL_S / TRAIL_N || g.count === 0) {
    g.head = (g.head + 1) % TRAIL_N;
    g.tx[g.head] = x;
    g.ty[g.head] = y;
    g.tt[g.head] = time;
    g.count = Math.min(TRAIL_N, g.count + 1);
    g.laidAt = time;
  }
}

/** Forgets it was ever out: back in the galaxy. */
export function resetGuide(g: Guide) {
  g.on = false;
  g.claimed = false;
  g.count = 0;
}

/**
 * The wake it leaves in the field this frame, for blackHoleJourney:
 * [x, y, reach, push, swirl, glow], or null for none.
 */
export function guideWake(
  g: Guide,
  d: Director
): [number, number, number, number, number, number] | null {
  if (!g.on) return null;
  const tau = d.tau;
  const dur = legDuration(d, d.leg);
  const k = g.H / 900;
  // Only while it is actually going somewhere -- nothing at a stop.
  let motion: number;
  let gather = 0;
  if (d.leg === 0) {
    motion =
      smoothstep(LEG0_FORWARD[0], LEG0_FORWARD[0] + 0.6, tau) *
      (1 - smoothstep(dur - 1.3, dur, tau));
    gather = Math.sin(Math.PI * clamp((tau - 0.05) / 1.25, 0, 1));
  } else {
    motion = smoothstep(0, 0.6, tau) * (1 - smoothstep(dur - 1.1, dur, tau));
  }
  // And more of it the faster the camera is carried along behind it.
  motion *= 0.65 + 0.35 * clamp(Math.abs(d.camV) / 8, 0, 1);
  if (motion < 0.004 && gather < 0.004) return null;
  const reach = WAKE_R * g.H * Math.pow(DZ_HOVER / g.dz, 0.35);
  return [
    g.x,
    g.y,
    reach,
    (WAKE_PUSH * motion - GATHER_PULL * gather) * k,
    WAKE_SWIRL * motion * k,
    WAKE_GLOW * Math.max(motion, 0.5 * gather),
  ];
}

/** What the Education book needs to take it over as its seed: where it is,
 *  and how it looks there. */
export function guideHandoff(g: Guide) {
  if (!g.on) return null;
  // The book draws its seed at 1.8x the radius it is given.
  return { x: g.x, y: g.y, a: g.a, r: g.r / 1.8 };
}

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */

/**
 * The guide, on the journey's canvas over everything else out there: while
 * it is still the galaxy's own mote, exactly as the galaxy draws one; lit,
 * the same warm point in its own soft light the book's seed is.
 */
export function drawGuide(
  ctx: CanvasRenderingContext2D,
  g: Guide,
  w: JourneyWorld,
  time: number
) {
  if (!g.on || !g.p) return;
  const sprite = w.bank.sprites[g.spr];
  ctx.globalCompositeOperation = "lighter";

  const unlit = 1 - g.lit;
  if (unlit > 0.002) {
    ctx.fillStyle = `rgb(${g.p.dotColor})`;
    drawGalaxyGlow(ctx, g.x, g.y, g.r, g.a * unlit);
  }

  if (g.lit > 0.002) {
    const a = g.a * g.lit;
    // What it leaves behind it, newest first.
    for (let n = 1; n < g.count; n++) {
      const i = (g.head - n + TRAIL_N) % TRAIL_N;
      const age = time - g.tt[i];
      if (age > TRAIL_S) break;
      const tx = g.tx[i];
      const ty = g.ty[i];
      if (Math.hypot(tx - g.x, ty - g.y) < 1.5) continue;
      const f = 1 - age / TRAIL_S;
      blitGlowRaw(ctx, sprite, tx, ty, tx, ty, g.r * (0.5 + 0.5 * f), a * 0.26 * f * f);
    }
    // The light it throws, wide and faint...
    const boost = g.boost;
    if (boost > 0.002) {
      blitGlowRaw(ctx, sprite, g.x, g.y, g.x, g.y, g.r * GLOW_K, a * GLOW_A * boost);
    }
    // ...its own light round it, and itself -- exactly as the book's seed
    // is drawn, since in the end that is what it becomes...
    blitGlowRaw(ctx, sprite, g.x, g.y, g.x, g.y, g.r * 3.4, a * 0.1);
    blitGlowRaw(ctx, sprite, g.x, g.y, g.px, g.py, g.r, a);
    // ...and the white-hot heart of it.
    if (boost > 0.002) {
      ctx.fillStyle = `rgb(${HOT})`;
      drawGalaxyGlow(ctx, g.x, g.y, g.r * CORE_K, a * boost);
    }
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}
