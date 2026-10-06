/**
 * journeyDirector
 * ---------------
 * Flies the camera through the project universe, so the scroll does not
 * have to.
 *
 * Past the galaxy the journey is no longer scrubbed. It is a handful of
 * places the camera comes to rest at -- the gateway (the galaxy, fully
 * formed round its opening), each of the five worlds inside the hole, and
 * the bottom of the fall where the Education book is made -- and ONE scroll
 * (a wheel gesture, a swipe, an arrow key) sends it on to the next one. What
 * happens between two of them runs on a clock of its own: the scroll only
 * says where to go, never how fast to get there -- nor how far. However hard
 * or long the scroll, it is one stop: what is still coming in when the
 * camera gets there was the scroll that sent it, and it takes a fresh one to
 * go on.
 *
 *   stop 0   the gateway. One scroll, and a single mote of the galaxy comes
 *            loose, comes toward the viewer, and leads the camera off after
 *            it, in through the horizon (see guideParticle);
 *   1 .. 5   the worlds, one per stop (HOLDS in projects);
 *   6        the rest at the bottom of the fall, where the guide becomes the
 *            seed of the Education book. The scroll that sends it here is
 *            all it takes: once the camera is at rest the book makes itself,
 *            start to finish, and until it stands formed no scroll moves
 *            anything (see bookFormed).
 *
 * All the motion is a function of one number, `pos` -- how far along the
 * stops the journey is, 2.5 being halfway from the second world to the
 * third -- advanced at the pace of the leg it is on. So going back is the
 * same flight in reverse, and a change of mind halfway turns the camera
 * round without a jolt: `pos`'s rate is eased, never switched.
 *
 * Within a leg, the camera's depth is keyed as positions *and speeds* at
 * moments of the leg (quintic Hermite, with no acceleration at any key), so
 * every flight sets off and comes to rest with no jerk at all, and a leg can
 * slow for a moment partway -- the first does, on the threshold of the hole.
 */

import { HORIZON_Z, T_REST, camZAt, tAtDepth } from "./blackHoleJourney";
import { HOLDS } from "@/components/ProjectStations/projects";

/* ------------------------------------------------------------------ *
 * The first leg: galaxy -> into the hole -> the first world
 * ------------------------------------------------------------------ */
/*
 * In seconds from the scroll that starts it. The guide's own beats are
 * here too (it reads them), so the two can never drift apart:
 *
 *   0.00  the mote gathers itself where it is: steadies, warms, brightens;
 *   0.45  it comes loose and comes toward the viewer, and the opening in
 *         the galaxy wakes -- the hole, its disc, the stars beyond;
 *   1.40  it turns for the opening and goes, and a moment later...
 *   1.60  ...the camera follows. It gathers speed through the galaxy's own
 *         dust and the matter beyond it,
 *   4.30  slows on the threshold, with the hole still a way off, while the
 *         guide goes on in ahead of it;
 *   6.70  and follows it through, and comes to rest in front of the first
 *         world.
 */
export const LEG0_STEADY = [0, 0.7] as const;
export const LEG0_IGNITE = [0.05, 0.85] as const;
export const LEG0_FORWARD = [0.45, 1.65] as const;
export const LEG0_LEAD = [1.4, 2.5] as const;
const LEG0_PRESENCE = [0.35, 1.8] as const;
const LEG0_PULL = 1.6;
const LEG0_EDGE = 4.3;
const LEG0_END = 6.7;
/** Where it slows on the threshold (UNIT short of the horizon), and how
 *  fast it is still going there (UNIT/s). */
const EDGE_BEFORE = 6.5;
const EDGE_SPEED = 3.4;

/* ------------------------------------------------------------------ *
 * The legs inside: one world -> the next
 * ------------------------------------------------------------------ */
/** Seconds the guide has to itself before the camera follows it. */
export const DEPART = 0.3;
/** Seconds of flight: a base, and more for a longer way. Six UNIT (one
 *  world to the next) is a little over three seconds -- unhurried, but
 *  plainly going somewhere. */
const TRAVEL_BASE = 1.6;
const TRAVEL_PER_UNIT = 0.27;

/* ------------------------------------------------------------------ *
 * Pace
 * ------------------------------------------------------------------ */
/** Going back runs this much faster than coming. */
const REVERSE = 1.35;
/** Seconds over which `pos`'s rate eases to a new one: setting off, and
 *  turning round -- a change of mind mid-flight is taken slower, so the
 *  camera is brought about rather than whipped back. */
const VEL_TAU = 0.2;
const TURN_TAU = 0.5;
/** Seconds after coming to rest before a scroll can send it on again. A
 *  gesture begun before then -- the tail of the one that brought it here,
 *  or one begun in flight -- belongs to this stop, and is spent. */
const ARRIVE_LOCK = 0.45;
/** Seconds the input must have been still before a gesture that sends it
 *  on. Gestures are told apart by a far shorter gap (GESTURE_GAP), so a
 *  hard scroll on a wheel -- flick after flick -- is many of them; this
 *  keeps it the one scroll it is meant as. */
const REARM = 0.7;
/** The motion streaks' shutter, in seconds: how far back along its own
 *  motion the camera the streaks are drawn from was. */
const SHUTTER = 1 / 140;

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */
/** Milliseconds without a wheel event that end one gesture. A trackpad's
 *  momentum arrives far more often than this, so a flick and everything it
 *  coasts on afterwards is one gesture -- one step. */
const GESTURE_GAP = 170;
/** Px of swipe before a touch counts as a scroll. */
const SWIPE_MIN = 28;

/* ------------------------------------------------------------------ */

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** [seconds into the leg, camera depth (UNIT), speed (UNIT/s)]. */
type Key = readonly [number, number, number];

type Leg = { dur: number; keys: Key[] };

export type Director = {
  /** Camera depth at each stop, UNIT. */
  stops: number[];
  legs: Leg[];
  last: number;
  pos: number;
  /** Rate of `pos`, stops per second. */
  vel: number;
  target: number;
  /** Clock time (s) it last came to rest. */
  arrivedAt: number;
  inited: boolean;
  lastRaw: number;
  /** Scroll positions it has put the page at itself, lately -- so it does
   *  not mistake its own scrolling for the reader's. */
  own: number[];
  /** False while it may not leave the last stop (the book is still there). */
  canLeaveLast: boolean;
  /** True once the book stands fully formed at the last stop. Until then,
   *  from the moment the journey is sent there, it is the book's time: no
   *  input moves anything, nor is kept to move anything later. */
  bookFormed: boolean;

  /* --- this frame --- */
  /** The leg `pos` is on, and seconds into it. */
  leg: number;
  tau: number;
  /** Camera depth (UNIT) and speed (UNIT/s, negative going back). */
  camZ: number;
  camV: number;
  /** Journey-t to draw from, and to draw the streaks from. */
  t: number;
  prevT: number;
  /** How much of what the journey adds to the galaxy there is yet. */
  presence: number;
};

export function createDirector(): Director {
  const stops = [0, ...HOLDS.map((h) => HORIZON_Z + h), camZAt(T_REST, HORIZON_Z, 1)];
  const legs: Leg[] = [];
  const edge = HORIZON_Z - EDGE_BEFORE;
  legs.push({
    dur: LEG0_END,
    keys: [
      [0, 0, 0],
      [LEG0_PULL, 0, 0],
      [LEG0_EDGE, edge, EDGE_SPEED],
      [LEG0_END, stops[1], 0],
    ],
  });
  for (let k = 1; k < stops.length - 1; k++) {
    const travel = TRAVEL_BASE + TRAVEL_PER_UNIT * (stops[k + 1] - stops[k]);
    legs.push({
      dur: DEPART + travel,
      keys: [
        [0, stops[k], 0],
        [DEPART, stops[k], 0],
        [DEPART + travel, stops[k + 1], 0],
      ],
    });
  }
  return {
    stops,
    legs,
    last: stops.length - 1,
    pos: 0,
    vel: 0,
    target: 0,
    arrivedAt: -1e9,
    inited: false,
    lastRaw: 0,
    own: [],
    canLeaveLast: true,
    bookFormed: false,
    leg: 0,
    tau: 0,
    camZ: 0,
    camV: 0,
    t: 0,
    prevT: 0,
    presence: 0,
  };
}

/** Duration of leg `k`, seconds. */
export function legDuration(d: Director, k: number) {
  return d.legs[clamp(k, 0, d.legs.length - 1)].dur;
}

/* ------------------------------------------------------------------ *
 * The camera along a leg
 * ------------------------------------------------------------------ */

const PV = { z: 0, v: 0 };

/** Camera depth and speed `tau` seconds into a leg, into PV. */
function evalLeg(leg: Leg, tau: number) {
  const keys = leg.keys;
  if (tau <= keys[0][0]) {
    PV.z = keys[0][1];
    PV.v = 0;
    return;
  }
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, z0, v0] = keys[i];
    const [t1, z1, v1] = keys[i + 1];
    if (tau > t1 && i < keys.length - 2) continue;
    const T = t1 - t0;
    const s = clamp((tau - t0) / T, 0, 1);
    const s2 = s * s;
    const s3 = s2 * s;
    const s4 = s3 * s;
    const s5 = s4 * s;
    // Quintic Hermite, with no acceleration at either key.
    PV.z =
      (1 - 10 * s3 + 15 * s4 - 6 * s5) * z0 +
      (s - 6 * s3 + 8 * s4 - 3 * s5) * T * v0 +
      (-4 * s3 + 7 * s4 - 3 * s5) * T * v1 +
      (10 * s3 - 15 * s4 + 6 * s5) * z1;
    PV.v =
      ((-30 * s2 + 60 * s3 - 30 * s4) * z0 +
        (1 - 18 * s2 + 32 * s3 - 15 * s4) * T * v0 +
        (-12 * s2 + 28 * s3 - 15 * s4) * T * v1 +
        (30 * s2 - 60 * s3 + 30 * s4) * z1) /
      T;
    return;
  }
}

/* ------------------------------------------------------------------ *
 * The clock
 * ------------------------------------------------------------------ */

export type ScrollHooks = {
  /** The page's scroll progress through the pin, 0..1. */
  raw: () => number;
  /** ...at stop k. */
  rawOf: (k: number) => number;
  /** One CSS px of it. */
  px: () => number;
  /** Puts the page at a scroll progress, at once; returns where it landed. */
  scrollTo: (raw: number) => number;
};

function rememberOwn(d: Director, raw: number) {
  d.own.push(raw);
  if (d.own.length > 4) d.own.shift();
}

function isOwn(d: Director, raw: number, eps: number) {
  for (const r of d.own) if (Math.abs(r - raw) <= eps) return true;
  return false;
}

/** On its way to the book, or there with the book still being made. */
function makingBook(d: Director) {
  return d.target === d.last && !d.bookFormed;
}

/** Sends it to stop `k`, and puts the page there. */
function goTo(d: Director, k: number, hooks: ScrollHooks) {
  const next = clamp(k, 0, d.last);
  if (next === d.target) return false;
  d.target = next;
  rememberOwn(d, hooks.scrollTo(hooks.rawOf(next)));
  return true;
}

/** The page was scrolled by something other than a gesture this handles
 *  (the galaxy's own scroll running on past its end, a Home key, the
 *  browser restoring a position). */
function external(
  d: Director,
  prev: number,
  raw: number,
  now: number,
  hooks: ScrollHooks
) {
  // While the book is being made, nothing takes the journey anywhere: the
  // page goes back to it.
  if (makingBook(d)) {
    rememberOwn(d, hooks.scrollTo(hooks.rawOf(d.target)));
    return;
  }
  const r0 = hooks.rawOf(0);
  const span = hooks.rawOf(1) - r0;
  const s = (raw - r0) / span;
  const sp = (prev - r0) / span;
  const tiny = hooks.px() / span;
  if (s < -tiny) {
    // Back above the gateway: the galaxy's own scroll again.
    d.pos = 0;
    d.target = 0;
    d.vel = 0;
    return;
  }
  if (s > d.last + tiny) {
    d.pos = d.last;
    d.target = d.last;
    d.vel = 0;
    return;
  }
  // Among the stops, nothing but a gesture moves the journey. A hard flick
  // through the galaxy can carry the page screens past its end before its
  // wheel events are turned away (the browser runs them out smoothly); that
  // is the scroll that reached the gateway, not one past it. So whatever
  // brought the page here, the journey stays at the stop it is at or going
  // to -- coming to rest there, if it came in from either end -- and the
  // page goes back to it.
  if (sp < -tiny || sp > d.last + tiny) d.arrivedAt = now;
  rememberOwn(d, hooks.scrollTo(hooks.rawOf(d.target)));
}

/**
 * Advances the journey by dt seconds and works out this frame's camera.
 * `now` is the clock in seconds; `raw` the page's scroll progress.
 */
export function updateDirector(
  d: Director,
  dt: number,
  now: number,
  hooks: ScrollHooks
) {
  const raw = hooks.raw();
  const eps = hooks.px() * 3;
  if (!d.inited) {
    // Wherever the page opened, at the nearest stop, already there.
    const r0 = hooks.rawOf(0);
    const s = (raw - r0) / (hooks.rawOf(1) - r0);
    d.pos = d.target = clamp(Math.round(s), 0, d.last);
    d.lastRaw = raw;
    d.inited = true;
  } else if (raw !== d.lastRaw) {
    const prev = d.lastRaw;
    d.lastRaw = raw;
    if (!isOwn(d, raw, eps)) external(d, prev, raw, now, hooks);
  }

  const want = Math.sign(d.target - d.pos);
  const held = want < 0 && d.pos >= d.last && !d.canLeaveLast;
  if (want !== 0 && !held) {
    const leg =
      want > 0
        ? Math.min(Math.floor(d.pos), d.last - 1)
        : Math.max(Math.ceil(d.pos) - 1, 0);
    const rate = (want > 0 ? 1 : REVERSE) / d.legs[leg].dur;
    const tau = d.vel * want < 0 ? TURN_TAU : VEL_TAU;
    d.vel += (want * rate - d.vel) * (1 - Math.exp(-dt / tau));
    d.pos = clamp(d.pos + d.vel * dt, 0, d.last);
    if ((want > 0 && d.pos >= d.target) || (want < 0 && d.pos <= d.target)) {
      d.pos = d.target;
      d.vel = 0;
      d.arrivedAt = now;
    }
  } else {
    d.vel = 0;
  }

  /* --- this frame's camera --- */
  let leg: number;
  let u: number;
  if (d.pos >= d.last) {
    leg = d.last - 1;
    u = 1;
  } else {
    leg = Math.floor(d.pos);
    u = d.pos - leg;
  }
  const L = d.legs[leg];
  d.leg = leg;
  d.tau = u * L.dur;
  evalLeg(L, d.tau);
  d.camZ = PV.z;
  d.camV = PV.v * d.vel * L.dur;
  d.t = tAtDepth(d.camZ, HORIZON_Z, 1);
  d.prevT =
    d.camV === 0
      ? d.t
      : tAtDepth(Math.max(0, d.camZ - d.camV * SHUTTER), HORIZON_Z, 1);
  d.presence =
    d.pos >= 1 ? 1 : smoothstep(LEG0_PRESENCE[0], LEG0_PRESENCE[1], d.tau);
}

/* ------------------------------------------------------------------ *
 * Gestures
 * ------------------------------------------------------------------ */

type Gesture = {
  dir: number;
  /** Clock time (s) it began, and how long all input had been still
   *  before it did (s). */
  began: number;
  quiet: number;
  /** It has sent the camera somewhere, or was the scroll that brought it
   *  to a stop; the rest of it is spent. */
  spent: boolean;
  /** It was scrolling the page natively when it arrived at a stop (it
   *  came from the galaxy) -- so it stops there. */
  native: boolean;
  /** It was let through at an end stop to scroll on past it. */
  release: boolean;
};

function gesture(dir: number, began: number, quiet: number): Gesture {
  return { dir, began, quiet, spent: false, native: false, release: false };
}

/**
 * What one gesture does, here and now: true when the page must not scroll
 * for it (the journey has it), false when it is the page's.
 */
function route(
  d: Director,
  g: Gesture,
  now: number,
  hooks: ScrollHooks,
  fire: boolean
) {
  const raw = hooks.raw();
  const eps = hooks.px() * 2;
  const idle = d.pos === d.target;
  // From the scroll that sent it to the book until the book stands formed,
  // every scroll is the book's: it neither hurries it, nor turns it back,
  // nor carries on past it once it is made.
  if (makingBook(d)) {
    g.spent = true;
    return true;
  }
  // Above the gateway, or past the last stop: the page's own scroll.
  if (
    (idle && d.target === 0 && raw < hooks.rawOf(0) - eps) ||
    (idle && d.target === d.last && raw > hooks.rawOf(d.last) + eps)
  ) {
    if (!g.release) g.native = true;
    return false;
  }
  if (g.release) return false;
  // Arrived here scrolling the page: it stops at the stop.
  if (g.native || g.spent) return true;
  if (!idle) {
    // A change of mind: turn round.
    if (g.dir !== Math.sign(d.target - d.pos)) {
      if (fire && goTo(d, d.target + g.dir, hooks)) g.spent = true;
    }
    return true;
  }
  // At rest at a stop. Whatever was already under way when it got here, or
  // follows hard on the heels of more input, is the scroll that brought it
  // here: it goes no further -- not on, nor out past either end.
  if (g.began < d.arrivedAt + ARRIVE_LOCK || g.quiet < REARM) {
    g.spent = true;
    return true;
  }
  // At either end, a scroll outward is the page's again.
  if ((g.dir > 0 && d.target === d.last) || (g.dir < 0 && d.target === 0)) {
    g.release = true;
    return false;
  }
  if (fire && goTo(d, d.target + g.dir, hooks)) g.spent = true;
  return true;
}

/** Takes over the wheel, touch and keys for the journey. Returns the undo. */
export function attachDirector(
  d: Director,
  hooks: ScrollHooks,
  clock: () => number
) {
  // When the last scroll input of any kind came (ms), so that a gesture
  // knows how long everything had been still before it.
  let inputAt = -1e9;
  const begin = (dir: number, ms: number) =>
    gesture(dir, clock(), (ms - inputAt) / 1000);

  let wheelG: Gesture | null = null;
  let wheelAt = -1e9;

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) return;
    const dy =
      e.deltaMode === 1
        ? e.deltaY * 16
        : e.deltaMode === 2
          ? e.deltaY * window.innerHeight
          : e.deltaY;
    if (dy === 0 || Math.abs(dy) < Math.abs(e.deltaX)) return;
    const dir = dy > 0 ? 1 : -1;
    const ms = performance.now();
    if (!wheelG || ms - wheelAt > GESTURE_GAP || dir !== wheelG.dir) {
      wheelG = begin(dir, ms);
    }
    wheelAt = inputAt = ms;
    if (route(d, wheelG, clock(), hooks, true)) e.preventDefault();
  };

  let touchG: Gesture | null = null;
  let touchY = 0;
  let touchX = 0;
  let touchOwned = false;
  const onTouchStart = (e: TouchEvent) => {
    touchG = null;
    if (e.touches.length !== 1) return;
    touchY = e.touches[0].clientY;
    touchX = e.touches[0].clientX;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const dy = touchY - e.touches[0].clientY;
    const dx = touchX - e.touches[0].clientX;
    const ms = performance.now();
    if (!touchG) {
      if (dy === 0 || Math.abs(dy) < Math.abs(dx)) return;
      // Decided on its first move, since that is when the browser decides
      // whether it is a scroll.
      touchG = begin(dy > 0 ? 1 : -1, ms);
      touchOwned = route(d, touchG, clock(), hooks, false);
    }
    inputAt = ms;
    if (!touchOwned) return;
    e.preventDefault();
    if (!touchG.spent && Math.abs(dy) >= SWIPE_MIN) {
      route(d, touchG, clock(), hooks, true);
    }
  };

  let keyG: Gesture | null = null;
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target as HTMLElement | null;
    if (
      el &&
      (el.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
        (el.tagName === "BUTTON" && e.key === " "))
    ) {
      return;
    }
    let dir = 0;
    if (e.key === "ArrowDown" || e.key === "PageDown") dir = 1;
    else if (e.key === "ArrowUp" || e.key === "PageUp") dir = -1;
    else if (e.key === " ") dir = e.shiftKey ? -1 : 1;
    if (!dir) return;
    const ms = performance.now();
    if (!e.repeat || !keyG || keyG.dir !== dir) keyG = begin(dir, ms);
    inputAt = ms;
    if (route(d, keyG, clock(), hooks, true)) e.preventDefault();
  };

  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("keydown", onKey);
  return () => {
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("keydown", onKey);
  };
}
