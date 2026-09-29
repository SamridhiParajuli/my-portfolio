/**
 * projectStations
 * ---------------
 * Puts the five projects *in* the journey's world -- and, which is the whole
 * point of this file, lets that world be the thing that reveals them.
 *
 * A project is not something that appears. It is a place: a screen standing
 * at a fixed depth beside the camera's existing path, at the middle of a
 * cloud of matter several UNIT across that the camera flies straight
 * through. So an encounter runs the way passing anything in space runs, and
 * for the same reason --
 *
 *   far out   a faint knot of light off beside the way ahead. No edges, no
 *             rectangle, nothing to recognise;
 *   closer    the knot resolves into matter, its near motes beginning to
 *             drift across the lens;
 *   closer    a surface at the middle of it stops being haze and starts
 *             being flat;
 *   near      that surface is a screen: lit, sharp, throwing light into the
 *             dust around it;
 *   past      it sweeps out of frame, the rest of its cloud still streaming
 *             by, while the next knot is already forming deeper ahead.
 *
 * Nothing here has a timeline of its own. Every number a station writes to
 * the DOM is a function of one quantity -- how far the journey's own camera
 * currently is from it -- so the camera never pauses for a project, two
 * encounters overlap freely, and scrolling back up un-discovers them in
 * reverse for free. There is no moment, anywhere, that a project is switched
 * on at: the screen's opacity, its sharpness and the light around it come up
 * over three long, different, overlapping stretches of distance, and the
 * cloud is already there before any of them start.
 *
 * Except for one thing, on purpose: a distant world (all five, now) makes
 * an entrance. The camera still decides when, but the entrance itself runs
 * on a clock -- see BEAT_END.
 *
 * Three layers, in depth order, because a place has to have matter on both
 * sides of its screen:
 *   - the far half of each cloud, and the light at its centre, are drawn on
 *     the journey's own canvas *under* the screens, so a screen occludes
 *     what is behind it;
 *   - the screens themselves are real DOM (see ProjectStations), so the
 *     placeholder can become a <video> later without a number changing;
 *   - the near half of each cloud is drawn on a second canvas above them, so
 *     dust genuinely in front of a screen drifts across it rather than
 *     stopping at its edge.
 */

import {
  HORIZON_Z,
  NEAR_CLIP,
  SPRITE_SPREAD,
  blitGlow,
  journeyCamera,
  journeyCameraPrev,
  makeCamera,
  projectWorld,
  sampleCamera,
  tAtDepth,
  type JourneyWorld,
} from "./blackHoleJourney";
import {
  PROJECTS,
  type ProjectStationDef,
} from "@/components/ProjectStations/projects";

/** Camera distance (UNIT) at which a screen renders at its layout size --
 *  i.e. where the DOM node's scale is exactly 1. Sits inside the window
 *  where a screen is the subject of the shot, so text and edges are crisp
 *  exactly when they are being looked at. */
const REF_DZ = 3;
/** How wide a screen reads at that distance, as a fraction of each viewport
 *  axis. Deliberately well short of the frame: the camera stays inside the
 *  universe, and a screen becomes prominent by being close, never by
 *  filling the shot. Five things that each fill the frame in turn are
 *  slides, whatever they are drawn with. */
const REF_W_FRAC = 0.66;
const REF_H_FRAC = 1.12;

/** Exponent on the screen's own fade. Everything about not popping in is in
 *  here: at 2.2 the first two thirds of the fade range are worth a few
 *  percent of opacity, so the surface spends most of its approach as a
 *  smear and none of it as a card being turned up. */
const FADE_POW = 2.2;
/** Blur applied while a screen is still unresolved, as a fraction of its own
 *  layout width -- so it is the same softness at every distance and on every
 *  viewport. This is what stops a distant screen from ever being a crisp
 *  rectangle: it is out of focus until the camera is close enough for it to
 *  be in focus, which is the only reveal here. */
const HAZE_K = 0.085;
/** Camera distances (UNIT) over which a screen being passed goes back out of
 *  focus -- too close to hold, exactly as it was too far to hold on the way
 *  in. It is what makes the pass a pass: the surface swells toward the edge
 *  of frame as a soft sheet of light, rather than a sharp card being faded
 *  out while it is still being looked at. */
const PASS_BLUR = [2.4, 0.9] as const;
/** ...and how soft it gets by the end of that, in its own layout width. The
 *  scale is already large by then, so this is a lot of blur on screen. */
const PASS_HAZE_K = 0.032;

/** Distances (UNIT) between which the title and the screen's own bloom come
 *  up, and then between which they retire again: not a reveal of their own,
 *  just "this is the one being looked at". They go before the screen does,
 *  because by then it is sweeping off the edge of frame and a caption
 *  chasing it off the side is the one thing that would read as a caption
 *  rather than as part of the object. */
const NEAR_UP = [7.5, 4.2] as const;
const NEAR_DOWN = [2.4, 3.4] as const;
/** Distances over which a place's cloud is around at all. Far longer than
 *  anything the screen does, at both ends -- it is up before there is
 *  anything to see, and still streaming past after the screen has gone. */
const SPACE_FAR = 30;
const SPACE_NEAR = 17;
/** ...and over which the light at its centre comes up: the first thing in
 *  the universe that says something is out there. */
const EMBER_FAR = 24;
const EMBER_NEAR = 12.5;
/** What is left of that light once there is a real surface in front of it.
 *  It never leaves, it just stops being the thing you are looking at and
 *  becomes the light the screen is standing in. */
const EMBER_RESOLVED = 0.34;
/** Radius of the glow, in the screen's own half-widths, before and after it
 *  resolves -- wide and nebulous while it is a place, tight and lamp-like
 *  once it is a screen. */
const EMBER_R_FAR = 3;
const EMBER_R_NEAR = 1.45;

/** Nothing is drawn once the screen is this close -- by then the camera is
 *  at its plane and it has thinned to nothing around the lens. */
const CULL_DZ = 0.6;
/** Camera distance (UNIT) whose point on the path a station anchors its
 *  offsets against: the moment it is actually being looked at. The camera
 *  swings a long way while closing the last stretch, and on a tall narrow
 *  viewport that swing is enormous next to a screen's own width -- anchoring
 *  at the pass would let a screen swim clean out of frame on a phone while
 *  sitting dead centre on a monitor. Anchoring here makes the framing the
 *  same on both, and leaves the swing to do what it should: parallax on
 *  either side of it. */
const ANCHOR_DZ = 3.6;

/* --- a distant world (see `distant` on its def) --- */

/** Its haze, held as a constant softness *on screen* -- a fraction of its
 *  layout width at scale 1, whatever its scale is now -- the dust between
 *  it and the camera rather than a property of the thing itself. */
const DISTANT_HAZE_K = 0.024;
/** The light it gives off, in its own half-widths, while it is only a light
 *  and once it has surfaced. Tighter than EMBER_R_FAR -- a light somewhere
 *  out there, not a nebula filling that corner of the sky. */
const DISTANT_EMBER_R_FAR = 1.9;
const DISTANT_EMBER_R_NEAR = 1.6;
/** ...and how much of that light is left once its surface shows. The
 *  universe canvas is drawn over a distant world, so this glow lies across
 *  its face as well as around it: it is the haze its light is scattered in,
 *  and it thins as the haze does. Its own light around it from then on is
 *  the screen's bloom, which is behind it. */
const DISTANT_EMBER_RESOLVED = 0.22;
/** Height of that glow against its width. Light off a wide surface, spread
 *  through the dust around it: stretched the way the thing throwing it is,
 *  so even a distant smudge is already not a star. */
const DISTANT_EMBER_ASPECT = 0.66;
/** How much of the stretch its surface climbs out over (`fadeIn`) its light
 *  takes to come up: the first part of it, so there is a light out there
 *  before there is a shape in it. The first world's stretch starts before
 *  the journey does, so its light is there from the first frame. */
const DISTANT_EMBER_LEAD = 0.2;

/* --- a distant world's entrance --- */
/*
 * The one thing here that is *not* a function of distance. The camera still
 * decides when (the moment it reaches the start of `resolve`), but what
 * follows is a beat with a clock of its own -- the hero shot of an opening
 * title sequence, which scroll speed has no business stretching or
 * squashing. In order, in seconds from the cue:
 *
 *   0.00  the frame goes widescreen, and the light that has been out there
 *         all along ignites -- a hot core throwing an anamorphic streak;
 *   0.20  the streak becomes a slit of light the width of the screen...
 *   0.44  ...which tears open top and bottom into the screen, white-hot,
 *         while god-rays burst out from behind it;
 *   0.50  the exposure falls back, focus racks in, and a slow push-in
 *         carries it the last few percent to where it rests;
 *   0.95  its name lands under it, one letter igniting after another,
 *         tracking slowly in;
 *   1.05  a glint sweeps across the screen's face, and later a sheen
 *         across the name;
 *   3.30  and the frame goes back to full height.
 *
 * Once it has played, every value is exactly the approved resting look, so
 * the hold and the fade away (`lost`, still scroll) are untouched.
 */
/** Seconds the entrance runs for. */
const BEAT_END = 4.4;
/** The scroll has to back off this far past the cue (UNIT) before the
 *  entrance is taken back, so hovering around the cue can't retrigger it. */
const CUE_REARM = 0.8;
/** Seconds the taking-back takes. */
const UNDO_S = 0.5;
/** How visible a world has to be for its entrance to play -- so a world
 *  already faded away behind the camera is not introduced to nobody. */
const CUE_GATE = 0.05;
/** How far short of its resting size the push-in starts from. */
const PUSH_FROM = 0.92;
/** Title tracking, in em: where it starts, and the site's own title
 *  tracking it settles at. */
const TRACK_FROM = 1.3;
const TRACK_REST = 0.44;
/** Degrees per second the god-rays turn while they are up. */
const RAY_SPIN = 7;
/** Letterbox bar height, as a fraction of the frame's height, and at most
 *  this many CSS px -- so it ends above the MENU trigger rather than
 *  cutting across it, and no world's screen or name is ever behind one. */
const BAR_FRAC = 0.06;
const BAR_MAX = 50;
/** Title size against the size the screen is seen at, and its bounds in
 *  CSS px, so it is a credit on a phone rather than a speck. */
const CARD_K = 0.052;
const CARD_MIN = 12;
const CARD_MAX = 24;
/** The anamorphic blue the streak cools to at its ends. */
const FLARE_COOL = [132, 176, 255] as const;

const CLOUD_N = 168;
const CLOUD_N_SMALL = 92;
/** Below this a mote is not worth projecting. */
const MIN_A = 0.014;

export type Station = {
  def: ProjectStationDef;
  /** World position of the screen's centre. */
  wx: number;
  wy: number;
  wz: number;
  /** Half-extents of the screen in world units. */
  halfW: number;
  halfH: number;
  /** Width the DOM node is laid out at, in CSS px. */
  basePx: number;
  /** Camera distance, in world units, at which the node renders at exactly
   *  that width -- so its scale on any frame is this over the distance. */
  refDz: number;
  /** Font size of its title card, in CSS px at the size it rests at. */
  cardPx: number;
  /** The accent, unpacked once, for the glow at this place's centre. */
  rgb: [number, number, number];
  /** The cloud, split by which side of the screen's plane it is on, because
   *  the two halves are drawn on different canvases. */
  back: CloudMote[];
  front: CloudMote[];
};

type CloudMote = {
  ox: number;
  oy: number;
  /** Signed depth offset from the screen's plane: negative is in front. */
  oz: number;
  amp: number;
  sp: number;
  ph: number;
  size: number;
  lum: number;
  spr: number;
};

export type StationFrame = {
  /* --- the screen --- */
  visible: boolean;
  x: number;
  y: number;
  scale: number;
  alpha: number;
  yaw: number;
  tilt: number;
  /** 0 far off, 1 once this screen is the subject of the shot. */
  near: number;
  /** 0 haze, 1 a real surface. Drives every piece of detail it has. */
  res: number;
  /** Blur while it is still unresolved, in its own layout px. */
  haze: number;
  /* --- the place it stands in, which outlives the screen at both ends --- */
  space: number;
  ember: number;
  /** Camera distance in world units; negative once it is behind the lens. */
  dz: number;

  /* --- a distant world's entrance (see BEAT_END) --- */
  /** Clock time (s) its entrance was cued at, or -1 while it has not been.
   *  Kept across rebuilds, so a resize never replays it. */
  cueAt: number;
  /** Clock time it started being taken back, or -1. */
  undoneAt: number;
  /** True while the entrance is still running. */
  intro: boolean;
  /** The screen: slit open across and then top-to-bottom, white-out, how
   *  far the glint has crossed it, push-in scale. */
  slitX: number;
  slitY: number;
  flash: number;
  glint: number;
  push: number;
  /** God-rays behind it: strength, scale, turn (deg). */
  rays: number;
  raysScale: number;
  spin: number;
  /** Its title: presence, letters landed, tracking (em), rules, sheen. */
  card: number;
  type: number;
  track: number;
  rule: number;
  sheen: number;
  /** Lens flare strength and streak length; letterbox. Lens effects, so
   *  drawn over everything. */
  flare: number;
  streak: number;
  bars: number;
};

/* ------------------------------------------------------------------ */

const TAU = Math.PI * 2;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 0..1 across [a, b] of the entrance's clock. */
function span(x: number, a: number, b: number) {
  return clamp((x - a) / (b - a), 0, 1);
}

function easeOutCubic(x: number) {
  return 1 - (1 - x) ** 3;
}

function easeOutQuart(x: number) {
  return 1 - (1 - x) ** 4;
}

function easeOutExpo(x: number) {
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
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

function parseAccent(accent: string): [number, number, number] {
  const parts = accent.split(",").map((n) => Number(n.trim()));
  return [parts[0] ?? 255, parts[1] ?? 220, parts[2] ?? 190];
}

const PR = new Float64Array(5);
const PR2 = new Float64Array(5);
const probe = makeCamera();

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

export function buildStations(
  w: JourneyWorld,
  focal: number,
  cssW: number,
  cssH: number,
  small: boolean
): Station[] {
  const unit = w.unit;
  // Bounded by both viewport axes, so a screen is large enough to be the
  // subject of the shot on any aspect ratio without ever becoming a panel
  // laid over the frame.
  const refPx = Math.min(cssW * REF_W_FRAC, cssH * REF_H_FRAC);

  return PROJECTS.map((def, i) => {
    const basePx = refPx * def.width;
    const wz = def.z * unit;
    const distant = def.distant;
    // The camera distance this screen's detail is drawn to be read from. A
    // distant world is read from where the camera is once it has surfaced,
    // at the scale it hangs in frame there -- so it is vast, which is what
    // lets it stay the size it is for the whole rest of the flight.
    const holdDz = distant ? def.fadeIn[1] * unit : 0;
    const refDz = distant ? holdDz * distant.scale : REF_DZ * unit;
    // Width in world units such that the projection gives exactly basePx
    // back at refDz -- which is what makes the DOM scale a pure ratio of
    // distances, with no second source of truth about size.
    const worldW = (refDz * basePx) / focal;
    const halfW = worldW / 2;
    const halfH = (halfW * 9) / 16;

    let wx: number;
    let wy: number;
    if (distant) {
      // Placed by where in frame it hangs, seen from the camera at that
      // moment. It is so far beyond everything else that the rest of the
      // flight moves it only by a little parallax: this is where it *is*,
      // not one moment of a pass. As fractions of the viewport rather than
      // of its own size, so it keeps its corner of the sky -- well clear of
      // the hole -- on a phone as much as on a monitor.
      sampleCamera(probe, w, focal, tAtDepth(wz - holdDz, w.bhZ, unit));
      wx = probe.x + (distant.frame[0] * cssW - w.cx) * (holdDz / focal);
      wy = probe.y + (distant.frame[1] * cssH - w.cy) * (holdDz / focal);
    } else {
      // Anchored to where the camera is at the distance this screen is
      // meant to be read from, so the offsets below frame it identically on
      // every viewport however the path happens to be swinging at the time.
      sampleCamera(
        probe,
        w,
        focal,
        tAtDepth(wz - ANCHOR_DZ * unit, w.bhZ, unit)
      );
      // How far off-axis a screen can sit and still be whole in frame at
      // that distance. A narrow viewport simply has less room beside the
      // axis, so the encounter moves closer to centre there instead of the
      // screen sliding out of shot -- the composition holds either way.
      const halfAtAnchor = halfW / ANCHOR_DZ;
      const maxOffX = Math.max(0.3, cssW / (2 * halfAtAnchor) - 1.04);
      const maxOffY = Math.max(
        0.3,
        cssH / (2 * halfAtAnchor * (9 / 16)) - 1.04
      );
      wx = probe.x + clamp(def.offX, -maxOffX, maxOffX) * halfW;
      wy = probe.y + clamp(def.offY, -maxOffY, maxOffY) * halfH;
    }

    const rng = makeRng(0x51ed270b + i * 977);
    const rgb = parseAccent(def.accent);
    const world = def.world;
    const back: CloudMote[] = [];
    const front: CloudMote[] = [];
    const n = Math.round((small ? CLOUD_N_SMALL : CLOUD_N) * world.density);
    for (let d = 0; d < n; d++) {
      // Depth first, and signed. The cloud thickens toward the screen's own
      // plane, so the place has a middle, and reaches far enough either side
      // of it that the camera is inside this world for a long stretch before
      // and after the screen is the thing in front of it.
      const ahead = rng() < 0.46;
      const depth = Math.pow(rng(), 1.45);
      const oz = ahead
        ? -depth * world.ahead * unit
        : depth * world.behind * unit;
      // Laterally a shell rather than a filled blob, biased out past the
      // screen's own edges: a handful of motes crossing its face is what
      // proves they are in front of it, but a field of them spread evenly
      // over it would read as the screen being see-through, which is the one
      // thing it must never look like.
      const ang = rng() * TAU;
      const rr = Math.pow(rng(), 0.45) * world.spread;
      // A minority are broad and very faint -- the nebulosity that gives the
      // volume between the bright motes something to be made of. The rest
      // are points of light, and a third of those are plain cold dust rather
      // than accent-lit, so the cloud reads as the space this place happens
      // to be lighting rather than as its own aura.
      const cloud = rng() < 0.16;
      const lit = rng() < 0.66;
      const mote: CloudMote = {
        ox: Math.cos(ang) * rr * halfW,
        oy: Math.sin(ang) * rr * halfH * 1.45,
        oz,
        amp: halfH * lerp(0.05, 0.17, rng()),
        sp: lerp(0.14, 0.5, rng()),
        ph: rng() * TAU,
        size: unit * (cloud ? lerp(0.014, 0.036, rng()) : lerp(0.002, 0.007, rng())),
        lum: cloud
          ? lerp(0.05, 0.12, rng())
          : lerp(0.16, 0.78, Math.pow(rng(), 1.3)),
        spr: lit
          ? w.bank.index(rgb[0], rgb[1], rgb[2])
          : w.bank.index(206, 218, 246),
      };
      (ahead ? front : back).push(mote);
    }

    const cardPx = clamp(
      basePx * (distant ? distant.scale : 1) * CARD_K,
      CARD_MIN,
      CARD_MAX
    );

    return {
      def,
      wx,
      wy,
      wz,
      halfW,
      halfH,
      basePx,
      refDz,
      cardPx,
      rgb,
      back,
      front,
    };
  });
}

export function makeFrames(count: number): StationFrame[] {
  return Array.from({ length: count }, () => ({
    visible: false,
    x: 0,
    y: 0,
    scale: 1,
    alpha: 0,
    yaw: 0,
    tilt: 0,
    near: 0,
    res: 0,
    haze: 0,
    space: 0,
    ember: 0,
    dz: 0,
    cueAt: -1,
    undoneAt: -1,
    intro: false,
    slitX: 1,
    slitY: 1,
    flash: 0,
    glint: 1,
    push: 1,
    rays: 0,
    raysScale: 1,
    spin: 0,
    card: 0,
    type: 1,
    track: TRACK_REST,
    rule: 1,
    sheen: 1,
    flare: 0,
    streak: 0,
    bars: 0,
  }));
}

/** Forgets every entrance, so each plays again the next time it is cued. */
export function resetStationCues(frames: StationFrame[]) {
  for (const f of frames) {
    f.cueAt = -1;
    f.undoneAt = -1;
  }
}

/**
 * Where a distant world's entrance is, `b` seconds after its cue. Past
 * BEAT_END every value is the resting one, so this is also the rest state.
 */
function playBeat(f: StationFrame, b: number, clarity: number) {
  f.intro = b < BEAT_END;
  // Ignition: builds (ease-in) rather than switching on, holds a moment at
  // full, then dies back slowly as the screen takes over from it.
  const ignite = span(b, 0, 0.34);
  f.flare = ignite * ignite * (1 - easeInOutCubic(span(b, 0.55, 2.2)));
  f.streak = easeOutExpo(span(b, 0.04, 0.6));
  f.slitX = easeOutExpo(span(b, 0.2, 0.62));
  f.slitY = easeOutExpo(span(b, 0.44, 1.3));
  // A flash frame: brief, then gone -- the picture takes over from it.
  f.flash = easeOutCubic(span(b, 0.26, 0.46)) * (1 - span(b, 0.48, 1.3)) ** 2;
  // Focus racks in from short of its resting softness.
  f.res = clarity * lerp(0.55, 1, easeOutCubic(span(b, 0.45, 1.6)));
  f.push = lerp(PUSH_FROM, 1, easeOutCubic(span(b, 0.3, 3.6)));
  f.rays =
    easeOutCubic(span(b, 0.36, 0.8)) * (1 - easeInOutCubic(span(b, 0.9, 3.1)));
  f.raysScale = lerp(0.7, 1.12, easeOutCubic(span(b, 0.36, 3.1)));
  f.spin = b * RAY_SPIN;
  f.glint = easeInOutCubic(span(b, 1.05, 2));
  f.card = easeOutCubic(span(b, 0.9, 1.5));
  f.type = span(b, 0.95, 2.05);
  f.track = lerp(TRACK_FROM, TRACK_REST, easeOutQuart(span(b, 0.95, 3.9)));
  f.rule = easeOutExpo(span(b, 1.3, 2.4));
  f.sheen = easeInOutCubic(span(b, 2.1, 3.1));
  f.bars =
    easeInOutCubic(span(b, 0, 0.75)) * (1 - easeInOutCubic(span(b, 3.3, 4.4)));
}

/* ------------------------------------------------------------------ *
 * Solve -- where each place is, and how much of it has surfaced, this frame
 * ------------------------------------------------------------------ */

export function solveStations(
  stations: Station[],
  w: JourneyWorld,
  focal: number,
  t: number,
  /** Clock in seconds, for the entrances -- the only thing that reads it. */
  time: number,
  out: StationFrame[]
) {
  const cam = journeyCamera();
  const unit = w.unit;
  const cssW = w.cx * 2;
  const cssH = w.cy * 2;
  // The same ramp everything else in this world fades up on, so the very
  // first journey frame is still a pixel match for the settled galaxy.
  const presence = smoothstep(0, 0.05, t);
  // Nothing inside the hole can be seen from outside it. Opened over a wide
  // enough band that the first world inside is already faintly out there
  // while the camera is still crossing: it surfaces inside the crossing's
  // own haze, which is the only way in with no first frame.
  const crossed = smoothstep(
    (HORIZON_Z - 1) * unit,
    (HORIZON_Z + 2.2) * unit,
    cam.z
  );

  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    const f = out[i];
    const def = s.def;
    const dz = s.wz - cam.z;
    f.dz = dz;
    f.visible = false;
    f.space = 0;
    f.ember = 0;

    const distant = def.distant;
    // Where it is seen from: a distant world from wherever the camera is
    // once it has surfaced, anything else from where it stands.
    const seenFrom = distant ? def.z - def.fadeIn[1] : def.z;
    let gate = seenFrom > HORIZON_Z ? presence * crossed : presence;
    // A distant world simply thins away again as the camera carries on --
    // the first one before the hole's lens would start pushing it toward
    // the edge of frame.
    if (distant) {
      gate *= smoothstep(distant.lost[1] * unit, distant.lost[0] * unit, dz);
    }

    // The entrance. Cued by the camera reaching the start of `resolve`,
    // played on the clock from there, and taken back if the scroll backs
    // off past the cue again -- so it plays again on the way back down.
    f.intro = false;
    f.flare = 0;
    f.bars = 0;
    f.card = 0;
    f.push = 1;
    let undo = 1;
    if (distant) {
      const cueDz = def.resolve[0] * unit;
      if (dz <= cueDz) {
        if ((f.cueAt < 0 || f.undoneAt >= 0) && gate > CUE_GATE) {
          f.cueAt = time;
          f.undoneAt = -1;
        }
      } else if (
        f.cueAt >= 0 &&
        f.undoneAt < 0 &&
        dz > cueDz + CUE_REARM * unit
      ) {
        f.undoneAt = time;
      }
      if (f.undoneAt >= 0) {
        undo = 1 - span(time - f.undoneAt, 0, UNDO_S);
        if (undo <= 0) {
          f.cueAt = -1;
          f.undoneAt = -1;
        }
      }
    }

    if (gate <= 0.002) continue;

    f.space = gate * smoothstep(SPACE_FAR * unit, SPACE_NEAR * unit, dz);
    // Behind the lens: the screen is gone, but the far half of its cloud is
    // still ahead and still streaming past, which is what carries the camera
    // out of one world and on toward the next.
    if (dz <= NEAR_CLIP * unit) continue;

    const k = focal / dz;
    if (distant) {
      // Seen past the hole, so through its lens like everything else back
      // there: bent outward, away from the silhouette, as the camera closes.
      projectWorld(PR, cam, w, focal, s.wx, s.wy, s.wz);
      f.x = PR[0];
      f.y = PR[1];
    } else {
      f.x = w.cx + (s.wx - cam.x) * k;
      f.y = w.cy + (s.wy - cam.y) * k;
    }
    f.scale = s.refDz / dz;
    let surfaced: number;
    let alpha: number;
    if (distant) {
      // Nothing of the screen is out there until its entrance: only its
      // light. After it, it is simply there, as solid as it was ever going
      // to get from this far off (`clarity`), for as long as `gate` says.
      if (f.cueAt >= 0) {
        playBeat(f, time - f.cueAt, distant.clarity);
        alpha = gate * undo;
        f.flare *= alpha;
        f.bars *= alpha;
      } else {
        f.res = 0;
        alpha = 0;
      }
      surfaced = f.res / distant.clarity;
    } else {
      // How far it has come out of the haze.
      surfaced = smoothstep(def.resolve[0] * unit, def.resolve[1] * unit, dz);
      f.res = surfaced;
      alpha =
        gate *
        Math.pow(
          smoothstep(def.fadeIn[0] * unit, def.fadeIn[1] * unit, dz),
          FADE_POW
        );
    }
    // A distant world's light is out there ahead of its shape -- there is
    // no nearing it to be done -- and thins only as the haze does.
    let ember = distant
      ? gate *
        smoothstep(
          def.fadeIn[0] * unit,
          lerp(def.fadeIn[0], def.fadeIn[1], DISTANT_EMBER_LEAD) * unit,
          dz
        )
      : gate * smoothstep(EMBER_FAR * unit, EMBER_NEAR * unit, dz);
    if (def.fadeOut) {
      const going = smoothstep(
        def.fadeOut[1] * unit,
        def.fadeOut[0] * unit,
        dz
      );
      alpha *= going;
      ember *= going;
    }
    f.ember =
      ember *
      lerp(1, distant ? DISTANT_EMBER_RESOLVED : EMBER_RESOLVED, surfaced);

    if (alpha <= 0.002 || dz <= CULL_DZ * unit) continue;

    // Off frame entirely -- most of the journey, for most of them.
    const halfPx = s.halfW * k;
    if (
      Math.abs(f.x - w.cx) - halfPx * 1.3 > cssW * 0.5 ||
      Math.abs(f.y - w.cy) - halfPx * 0.75 > cssH * 0.5
    ) {
      continue;
    }

    const offX = (f.x - w.cx) / (cssW * 0.5);
    const offY = (w.cy - f.y) / (cssH * 0.5);
    f.visible = true;
    f.alpha = alpha;
    // Out of focus until the camera is near enough for it to be in focus.
    // Written in the node's own layout px, so the blur scales with the
    // screen exactly as everything else about it does.
    // And out of focus again once it is too close to be, on the way past.
    // A distant world's haze is held constant on screen instead (the
    // division by scale): it is the dust in front of it, not its own edge.
    const far =
      f.res > 0.995
        ? 0
        : distant
          ? (Math.pow(1 - f.res, 1.2) * DISTANT_HAZE_K) / f.scale
          : Math.pow(1 - f.res, 1.35) * HAZE_K;
    const past = def.fadeOut
      ? Math.pow(smoothstep(PASS_BLUR[0] * unit, PASS_BLUR[1] * unit, dz), 1.2) *
        PASS_HAZE_K
      : 0;
    f.haze = Math.max(far, past) * s.basePx;
    // Turns to keep half-facing the camera as it slides off toward the edge
    // of frame -- a panel standing in space, not a decal on the lens.
    f.yaw = clamp(def.yaw - clamp(offX, -1.6, 1.6) * 7, -24, 24);
    f.tilt = clamp(clamp(offY, -1.6, 1.6) * 5, -12, 12);
    f.near = smoothstep(NEAR_UP[0] * unit, NEAR_UP[1] * unit, dz);
    // The retire belongs to being swept past, so it applies only to the
    // screens that are. The journey ends in front of the last one, and it
    // should still be fully lit when it does.
    if (def.fadeOut) {
      f.near *= smoothstep(NEAR_DOWN[0] * unit, NEAR_DOWN[1] * unit, dz);
    }
  }
}

/* ------------------------------------------------------------------ *
 * The places themselves
 * ------------------------------------------------------------------ */

/**
 * One half of every cloud, plus -- on the far pass -- the light at each
 * place's centre.
 *
 * `behind` picks which canvas this is: the journey's own, under the screens,
 * or the one above them. A mote is only ever drawn on the side of the
 * screen's plane it actually sits on, so nothing is ever painted where it
 * could not be seen from.
 */
export function drawStationSpace(
  ctx: CanvasRenderingContext2D,
  stations: Station[],
  w: JourneyWorld,
  focal: number,
  time: number,
  frames: StationFrame[],
  behind: boolean
) {
  const cam = journeyCamera();
  const camPrev = journeyCameraPrev();
  const unit = w.unit;
  const sprites = w.bank.sprites;
  const limX = w.cx * 2;
  const limY = w.cy * 2;
  const ref = 8 * unit;
  const fog = 22 * unit;

  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < stations.length; i++) {
    const f = frames[i];
    const s = stations[i];

    if (behind && f.ember > 0.004 && f.dz > NEAR_CLIP * unit) {
      drawEmber(ctx, s, f, focal, limX, limY);
    }
    if (f.space <= MIN_A) continue;

    for (const m of behind ? s.back : s.front) {
      const a0 = m.lum * f.space;
      if (a0 <= MIN_A) continue;
      const wz = s.wz + m.oz;
      const dz = wz - cam.z;
      if (dz <= NEAR_CLIP * unit) continue;
      const wx = s.wx + m.ox + Math.cos(time * m.sp + m.ph) * m.amp;
      const wy =
        s.wy + m.oy + Math.sin(time * m.sp * 0.86 + m.ph * 1.7) * m.amp * 0.7;

      // Depth does all the parallax here: a mote three UNIT in front of a
      // screen crosses the frame many times faster than one nine UNIT behind
      // it, because it is many times closer, and that spread is the only
      // reason a cloud reads as a volume being flown through rather than as
      // a texture being scaled.
      const rad = clamp(m.size * Math.pow(ref / dz, 0.6), 0.35, 28);
      const near = smoothstep(0.05 * unit, 0.6 * unit, dz);
      const tw = 0.78 + 0.22 * Math.sin(time * m.sp * 2.4 + m.ph);
      const a = a0 * Math.exp(-dz / fog) * near * tw;
      if (a <= MIN_A) continue;

      projectWorld(PR, cam, w, focal, wx, wy, wz);
      if (!PR[4]) continue;
      const x = PR[0];
      const y = PR[1];
      const pad = rad * SPRITE_SPREAD;
      if (x < -pad || y < -pad || x > limX + pad || y > limY + pad) continue;
      projectWorld(PR2, camPrev, w, focal, wx, wy, wz);
      blitGlow(
        ctx,
        sprites[m.spr],
        x,
        y,
        PR2[4] ? PR2[0] : x,
        PR2[4] ? PR2[1] : y,
        rad,
        a
      );
    }
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

/**
 * The light a place gives off before there is anything there to recognise --
 * and the light its screen stands in afterwards. It is one glow doing both
 * jobs, at the screen's own centre and behind its plane, so there is never a
 * moment where a distant smudge has to be swapped for a lit panel: the panel
 * resolves in front of the smudge, and the smudge becomes its halo.
 */
function drawEmber(
  ctx: CanvasRenderingContext2D,
  s: Station,
  f: StationFrame,
  focal: number,
  limX: number,
  limY: number
) {
  // Scales on exactly the ratio of distances the screen itself does, so the
  // two can never disagree about how far away this place is.
  const distant = s.def.distant;
  const r =
    ((s.halfW * focal) / f.dz) *
    (distant
      ? lerp(DISTANT_EMBER_R_FAR, DISTANT_EMBER_R_NEAR, f.res / distant.clarity)
      : lerp(EMBER_R_FAR, EMBER_R_NEAR, f.res));
  if (r < 2) return;
  const ry = distant ? r * DISTANT_EMBER_ASPECT : r;
  const x0 = Math.max(0, f.x - r);
  const y0 = Math.max(0, f.y - ry);
  const x1 = Math.min(limX, f.x + r);
  const y1 = Math.min(limY, f.y + ry);
  if (x1 <= x0 || y1 <= y0) return;

  const [cr, cg, cb] = s.rgb;
  const a = f.ember;
  // Built round about the origin and squashed into place, so a stretched
  // glow costs exactly what a round one does.
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, `rgba(${cr},${cg},${cb},${(a * 0.42).toFixed(4)})`);
  g.addColorStop(0.14, `rgba(${cr},${cg},${cb},${(a * 0.24).toFixed(4)})`);
  g.addColorStop(0.46, `rgba(${cr},${cg},${cb},${(a * 0.075).toFixed(4)})`);
  g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  const k = ry / r;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(1, k);
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(x0 - f.x, (y0 - f.y) / k, x1 - x0, (y1 - y0) / k);
  ctx.restore();
}

/**
 * What the entrances do to the lens rather than to the world: each one's
 * flare, and the letterbox. Drawn on the canvas above everything else --
 * a flare is in the glass, not out there, so the hole's matter and the
 * dust never cover it.
 */
export function drawStationFlares(
  ctx: CanvasRenderingContext2D,
  stations: Station[],
  frames: StationFrame[],
  cssW: number,
  cssH: number
) {
  let bars = 0;
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < stations.length; i++) {
    const f = frames[i];
    if (f.flare > 0.004) drawFlare(ctx, stations[i], f, cssW, cssH);
    bars = Math.max(bars, f.bars);
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  // Every entrance asks for widescreen, so overlapping ones share one set
  // of bars rather than stacking.
  if (bars > 0.002) {
    const h = bars * Math.min(BAR_FRAC * cssH, BAR_MAX);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cssW, h);
    ctx.fillRect(0, cssH - h, cssW, h);
  }
}

/** Ghost reflections a bright source throws along the line through the
 *  middle of the lens: where along it (1 = mirrored across the centre),
 *  size against the frame's height, strength, and whether it is a ring. */
const GHOSTS = [
  { k: 0.46, r: 0.03, a: 0.16, ring: false },
  { k: 0.9, r: 0.075, a: 0.07, ring: true },
  { k: 1.28, r: 0.022, a: 0.2, ring: false },
  { k: 1.62, r: 0.11, a: 0.05, ring: false },
] as const;

function rgba(c: readonly number[], a: number) {
  return `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, a).toFixed(4)})`;
}

function drawFlare(
  ctx: CanvasRenderingContext2D,
  s: Station,
  f: StationFrame,
  cssW: number,
  cssH: number
) {
  const a = f.flare;
  const x = f.x;
  const y = f.y;
  const warm = s.rgb;
  // Sized against the screen as it is seen, so the flare belongs to it on
  // any viewport.
  const size = s.basePx * f.scale;

  // The whole frame takes a little of the light as it peaks.
  ctx.globalAlpha = 1;
  ctx.fillStyle = rgba(warm, a * 0.05);
  ctx.fillRect(0, 0, cssW, cssH);

  // Anamorphic streak: a hairline, then a soft wash around it. One radial
  // gradient squashed flat, so it is thickest at the source and needles
  // out to nothing, and it cools from white through the world's own light
  // to lens blue along its length.
  const len = cssW * lerp(0.1, 0.6, f.streak);
  for (const [half, k] of [
    [2.2, 1],
    [size * 0.07, 0.28],
  ] as const) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
    g.addColorStop(0, `rgba(255,255,255,${(a * k).toFixed(4)})`);
    g.addColorStop(0.06, rgba(warm, a * k * 0.8));
    g.addColorStop(0.3, rgba(FLARE_COOL, a * k * 0.36));
    g.addColorStop(0.65, rgba(FLARE_COOL, a * k * 0.1));
    g.addColorStop(1, rgba(FLARE_COOL, 0));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, half / len);
    ctx.fillStyle = g;
    ctx.fillRect(-len, -len, len * 2, len * 2);
    ctx.restore();
  }

  // The hot core it all comes out of.
  const core = size * lerp(0.08, 0.3, a);
  const cg = ctx.createRadialGradient(x, y, 0, x, y, core);
  cg.addColorStop(0, `rgba(255,255,255,${(a * 0.95).toFixed(4)})`);
  cg.addColorStop(0.18, rgba(warm, a * 0.55));
  cg.addColorStop(1, rgba(warm, 0));
  ctx.fillStyle = cg;
  ctx.fillRect(x - core, y - core, core * 2, core * 2);

  // Ghosts, strung along the line through the middle of the frame.
  const cx = cssW / 2;
  const cy = cssH / 2;
  for (let i = 0; i < GHOSTS.length; i++) {
    const gh = GHOSTS[i];
    const gx = x + (cx - x) * 2 * gh.k;
    const gy = y + (cy - y) * 2 * gh.k;
    const r = cssH * gh.r;
    const tint = i % 2 ? FLARE_COOL : warm;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    if (gh.ring) {
      g.addColorStop(0, rgba(tint, 0));
      g.addColorStop(0.72, rgba(tint, 0));
      g.addColorStop(0.88, rgba(tint, a * gh.a));
      g.addColorStop(1, rgba(tint, 0));
    } else {
      g.addColorStop(0, rgba(tint, a * gh.a));
      g.addColorStop(0.7, rgba(tint, a * gh.a * 0.6));
      g.addColorStop(1, rgba(tint, 0));
    }
    ctx.fillStyle = g;
    ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
  }
}

/* ------------------------------------------------------------------ *
 * DOM
 * ------------------------------------------------------------------ */

/** Layout width for each node -- scale 1 then means "at reference
 *  distance", which is the whole contract between this and the CSS -- and
 *  the size each title card is set in. */
export function setStationWidths(
  nodes: (HTMLElement | null)[],
  cards: (HTMLElement | null)[],
  stations: Station[]
) {
  for (let i = 0; i < stations.length; i++) {
    nodes[i]?.style.setProperty(
      "--ps-w",
      `${Math.round(stations[i].basePx)}px`
    );
    cards[i]?.style.setProperty(
      "--ps-card-size",
      `${stations[i].cardPx.toFixed(1)}px`
    );
  }
}

/** A demo video only runs while its screen is out there to be seen -- five
 *  of them decoding off screen for the whole journey would be paid for on
 *  every frame of it. It starts while the screen is still distant haze, so
 *  it is long since playing by the time it resolves. */
function setMediaPlaying(node: HTMLElement, on: boolean) {
  const video = node.querySelector("video");
  if (!video) return;
  if (on) video.play().catch(() => {});
  else video.pause();
}

/** What an entrance writes, on the screen and on its title. Only while it
 *  is playing: once it ends they are removed, and the CSS's registered
 *  initial values -- which are the resting look -- take over. */
const SCREEN_BEAT = [
  "--ps-slit-x",
  "--ps-slit-y",
  "--ps-flash",
  "--ps-glint",
  "--ps-rays",
  "--ps-rays-scale",
  "--ps-spin",
] as const;
const CARD_BEAT = [
  "--ps-type",
  "--ps-track",
  "--ps-rule",
  "--ps-sheen",
] as const;

/** Flags a node as mid-entrance, or settles it back to rest. Returns
 *  whether the entrance's values should be written this frame. */
function markIntro(
  node: HTMLElement,
  on: boolean,
  props: readonly string[]
) {
  const was = node.dataset.intro !== undefined;
  if (on) {
    if (!was) node.dataset.intro = "";
    return true;
  }
  if (was) {
    delete node.dataset.intro;
    for (const p of props) node.style.removeProperty(p);
  }
  return false;
}

/** A distant world's title: a credit hung under its screen, flat to the
 *  lens like any title, riding with the screen's centre and size. */
function applyCard(
  card: HTMLElement | null | undefined,
  s: Station,
  f: StationFrame
) {
  if (!card) return;
  const style = card.style;
  const o = f.visible ? f.alpha * f.card : 0;
  if (o <= 0.002) {
    if (style.visibility !== "hidden") style.visibility = "hidden";
    return;
  }
  if (style.visibility !== "visible") style.visibility = "visible";
  style.opacity = o.toFixed(3);
  // Under the screen's bottom edge as it is seen -- push-in included -- and
  // scaled only by the drift in its distance, since its type size is
  // already set for where it rests.
  const y =
    f.y + s.basePx * (9 / 32) * f.scale * f.push + s.cardPx * 0.9;
  const k = f.scale / (s.def.distant?.scale ?? 1);
  style.transform = `translate(${f.x.toFixed(1)}px, ${y.toFixed(
    1
  )}px) translate(-50%, 0) scale(${k.toFixed(4)})`;
  if (markIntro(card, f.intro, CARD_BEAT)) {
    style.setProperty("--ps-type", f.type.toFixed(3));
    style.setProperty("--ps-track", f.track.toFixed(3));
    style.setProperty("--ps-rule", f.rule.toFixed(3));
    style.setProperty("--ps-sheen", f.sheen.toFixed(3));
  }
}

export function applyStationFrames(
  nodes: (HTMLElement | null)[],
  cards: (HTMLElement | null)[],
  stations: Station[],
  frames: StationFrame[]
) {
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    applyCard(cards[i], stations[i], f);
    const node = nodes[i];
    if (!node) continue;
    if (!f.visible) {
      if (node.style.visibility !== "hidden") {
        node.style.visibility = "hidden";
        setMediaPlaying(node, false);
      }
      continue;
    }
    const style = node.style;
    if (style.visibility !== "visible") {
      style.visibility = "visible";
      setMediaPlaying(node, true);
    }
    style.opacity = f.alpha.toFixed(3);
    // Translate to the projected centre, pull back by half the node's own
    // (unscaled) box, then take the distance scale (and an entrance's
    // push-in). Transform only -- no layout is touched on any frame.
    style.transform = `translate(${f.x.toFixed(1)}px, ${f.y.toFixed(
      1
    )}px) translate(-50%, -50%) scale(${(f.scale * f.push).toFixed(4)})`;
    style.setProperty("--ps-near", f.near.toFixed(3));
    style.setProperty("--ps-res", f.res.toFixed(3));
    style.setProperty("--ps-haze", `${f.haze.toFixed(2)}px`);
    style.setProperty("--ps-yaw", `${f.yaw.toFixed(2)}deg`);
    style.setProperty("--ps-tilt", `${f.tilt.toFixed(2)}deg`);
    if (markIntro(node, f.intro, SCREEN_BEAT)) {
      style.setProperty("--ps-slit-x", f.slitX.toFixed(4));
      style.setProperty("--ps-slit-y", f.slitY.toFixed(4));
      style.setProperty("--ps-flash", f.flash.toFixed(3));
      style.setProperty("--ps-glint", f.glint.toFixed(4));
      style.setProperty("--ps-rays", f.rays.toFixed(3));
      style.setProperty("--ps-rays-scale", f.raysScale.toFixed(4));
      style.setProperty("--ps-spin", `${f.spin.toFixed(2)}deg`);
    }
  }
}

export function hideStations(
  nodes: (HTMLElement | null)[],
  cards: (HTMLElement | null)[]
) {
  for (const node of nodes) {
    if (node && node.style.visibility !== "hidden") {
      node.style.visibility = "hidden";
      setMediaPlaying(node, false);
    }
  }
  for (const card of cards) {
    if (card && card.style.visibility !== "hidden") {
      card.style.visibility = "hidden";
    }
  }
}
