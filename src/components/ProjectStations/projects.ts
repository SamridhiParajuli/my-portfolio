/**
 * The five projects, as places in the universe.
 * ---------------------------------------------
 * These are not sections, slides or cards. Each entry below is a distant
 * world seen along the existing camera journey (galaxy -> gateway -> black
 * hole -> deeper): a screen so far beyond everything else that the camera
 * never nears it -- it hangs in its own part of the sky, the size it is,
 * while the camera travels on (see `distant`). The first is seen on the way
 * to the hole, the other four inside it.
 *
 * Every world runs on the same overlapping stretches of the journey:
 *
 *   fadeIn    the light it gives off, climbing out of nothing over a long
 *             stretch -- something is out there before anything is seen;
 *   resolve   where it starts is the cue for its entrance: a timed hero
 *             shot, like the cast credits of an opening title sequence
 *             (flare, widescreen, the screen tearing open out of the light,
 *             its name landing under it -- see BEAT_END in
 *             projectStations), which settles on it exactly as soft as it
 *             is from this far off;
 *   lost      and, after a while holding, simply thinning away again.
 *
 * Each one makes its entrance while the one before is still there, so one
 * is always still holding or thinning away as the next one arrives.
 *
 * (A def without `distant` is a place the camera flies past instead: a
 * screen inside a cloud of matter, growing as it nears and swept behind.
 * None use that now.)
 *
 * This file is the only place any of that is decided, and the only file that
 * has to change when the real demo videos arrive: set `media` and the
 * position, scale, perspective, timing and the dust around each screen all
 * stay exactly as they are.
 */

import { HORIZON_Z } from "@/components/BannerParticlePortal/blackHoleJourney";

export type ProjectStationDef = {
  id: string;
  /** Only ever on screen while the camera is actually near this place. */
  title: string;
  /** "r,g,b" -- the light this place throws into the space around it.
   *  Warms near the galaxy, cools and turns stranger with depth. */
  accent: string;
  /**
   * THE MEDIA SLOT. null renders the placeholder; a path renders that file
   * in the identical box, at the identical size and perspective, resolving
   * on the identical curve. Nothing else about the journey reads this field.
   */
  media: string | null;
  /** Optional still shown until the video can paint. */
  poster: string | null;

  /* --- where it is --- */

  /** Depth along the journey's own axis, in UNIT (the projection's focal
   *  length). The camera starts at 0 and the event horizon is at HORIZON_Z,
   *  so anything larger than that is inside the hole. */
  z: number;
  /** Offset from the camera's path at that depth, measured in the screen's
   *  own half-width / half-height -- so the framing of each encounter is
   *  identical on a phone and on a 34" monitor. Positive x is the side of
   *  frame the camera's own swing is heading toward. */
  offX: number;
  offY: number;
  /** Screen size, relative to the layer's reference width. */
  width: number;
  /** Resting yaw, in degrees: these are panels standing in space, not
   *  billboards glued to the lens. Negative turns a screen on the right of
   *  frame to half-face the camera; positive does the same on the left. A
   *  little more is added from how far off-axis it currently sits, so it
   *  keeps facing the viewer as it goes by. */
  yaw: number;
  /** Camera distances (UNIT) between which the screen itself climbs out of
   *  nothing. Long, and weighted to the end, so there is no distance at
   *  which it "appears". For a distant world: its light, and the end of
   *  this is where it is placed from. */
  fadeIn: readonly [number, number];
  /** ...and between which it stops being haze and becomes a surface. For a
   *  distant world only the start counts: its entrance is cued there. */
  resolve: readonly [number, number];
  /** ...and between which it thins away as the camera reaches its plane.
   *  Deliberately close: the screen stays solid while it is being looked at
   *  and while it swells past, out of focus, toward the edge of frame -- it
   *  only goes once the camera is actually through it. null for the last
   *  one: the journey ends on it. */
  fadeOut: readonly [number, number] | null;
  /**
   * A world far beyond everything else in the journey, rather than one the
   * camera flies past. It is so distant that the flight toward the hole
   * barely changes it -- it stays where it is, the size it is, drifting
   * only by a little parallax -- and it is drawn *under* the universe, since
   * every other thing out there is nearer: stars and matter drift across
   * it. Its light comes up out of the haze (`fadeIn`), it makes its
   * entrance when the camera reaches the start of `resolve`, holds, and
   * simply fades away again as the camera carries on (`lost`). `offX`/`offY` then only say which side of frame it
   * is on; `fadeOut` does not apply, as it is never reached.
   */
  distant?: {
    /** Where in frame it hangs once it has surfaced, as fractions of the
     *  viewport's width and height. */
    frame: readonly [number, number];
    /** How large it reads there, against its layout width -- so its detail
     *  is drawn at the scale it is actually seen at. */
    scale: number;
    /** How far out of the haze it ever comes, 0..1. From this far off it
     *  is a shape with a little detail, never a crisp screen. */
    clarity: number;
    /** Camera distances (UNIT) between which it fades away. */
    lost: readonly [number, number];
  };

  /* --- the space it stands in --- */

  /** The cloud of matter this place is made of. The camera flies through all
   *  of it, so these are what actually carry the discovery: the screen is
   *  only ever the thing at the middle of them. */
  world: {
    /** Lateral reach, in the screen's own half-widths. */
    spread: number;
    /** How far the cloud reaches toward the camera from the screen's plane,
     *  and how far past it, in UNIT. Chosen so consecutive clouds overlap:
     *  the camera is never between worlds, only deeper into one. */
    ahead: number;
    behind: number;
    /** Relative density -- each world should feel like its own place. */
    density: number;
  };
};

/** Depth of the first world, in UNIT: far enough beyond the hole that the
 *  whole flight to it changes how large the world reads by only about a
 *  sixth, and moves it by only a few pixels of parallax. */
const WORLD_01_Z = HORIZON_Z + 140;
/** How far beyond the camera each world inside the hole stands once it has
 *  surfaced, in UNIT -- far enough that the rest of its time in view changes
 *  how large it reads by under a tenth: it never grows toward the camera. */
const INSIDE_BEYOND = 150;
/** Where the camera is along the journey once each world inside the hole
 *  has fully surfaced, in UNIT past the horizon. The fall ends 31.5 past. */
const HOLD_02 = 8.6;
const HOLD_03 = 14.8;
const HOLD_04 = 21.8;
const HOLD_05 = 28.1;
const WORLD_02_Z = HORIZON_Z + HOLD_02 + INSIDE_BEYOND;
const WORLD_03_Z = HORIZON_Z + HOLD_03 + INSIDE_BEYOND;
const WORLD_04_Z = HORIZON_Z + HOLD_04 + INSIDE_BEYOND;
const WORLD_05_Z = HORIZON_Z + HOLD_05 + INSIDE_BEYOND;

/**
 * A distant world's timings are really about where the camera is along the
 * journey, so they are written as the camera depths (UNIT) it passes
 * between, and turned here into the camera distances every def is read in.
 */
function seen(worldZ: number, from: number, to: number) {
  return [worldZ - from, worldZ - to] as const;
}

export const PROJECTS: readonly ProjectStationDef[] = [
  {
    // The first world: distant, high in the upper right of the sky, well
    // clear of the hole. It is out there, faint, from the journey's first
    // frame; it surfaces as the camera clears the galaxy's dust; and then
    // it simply stays where it is while the camera carries on toward the
    // hole, fading away as the hole grows.
    id: "project-01",
    title: "Project 01",
    accent: "255, 198, 146",
    media: null,
    poster: null,
    z: WORLD_01_Z,
    offX: 1,
    offY: -1,
    width: 0.98,
    yaw: -6,
    // Its light is already out there before the journey starts, its shape
    // shows from about 3 UNIT into the flight, and it has fully surfaced by
    // about 9 -- the whole way out of the galaxy, rather than any one short
    // stretch of it.
    fadeIn: seen(WORLD_01_Z, -2.3, 9),
    resolve: seen(WORLD_01_Z, 3, 7.8),
    fadeOut: null,
    // Starts fading 20 UNIT out from the hole (about 12 into the flight)
    // and is gone by 7, where the hole reads nearly three times as large
    // and its lens has not yet started moving it.
    distant: {
      frame: [0.69, 0.25],
      scale: 0.46,
      clarity: 0.62,
      lost: seen(WORLD_01_Z, HORIZON_Z - 20, HORIZON_Z - 7),
    },
    // Never near enough for its cloud to show; every place has one.
    world: { spread: 3.2, ahead: 7, behind: 8.5, density: 1 },
  },
  /*
   * The four worlds inside the hole are distant worlds exactly as the first
   * is: the same size, softness and fade, each hanging in its own part of
   * the sky. Each surfaces while the one before is still holding, so the
   * next is always already forming as the last thins away.
   */
  {
    // Surfaces out of the crossing's own haze, upper left.
    id: "project-02",
    title: "Project 02",
    accent: "255, 176, 118",
    media: null,
    poster: null,
    z: WORLD_02_Z,
    offX: -1,
    offY: -1,
    width: 0.98,
    yaw: 6,
    fadeIn: seen(WORLD_02_Z, HORIZON_Z, HORIZON_Z + HOLD_02),
    resolve: seen(WORLD_02_Z, HORIZON_Z + 3.5, HORIZON_Z + 7.5),
    fadeOut: null,
    distant: {
      frame: [0.31, 0.28],
      scale: 0.46,
      clarity: 0.62,
      lost: seen(WORLD_02_Z, HORIZON_Z + 9.8, HORIZON_Z + 14.8),
    },
    world: { spread: 3.6, ahead: 8, behind: 9, density: 1.1 },
  },
  {
    // Lower right.
    id: "project-03",
    title: "Project 03",
    accent: "244, 148, 126",
    media: null,
    poster: null,
    z: WORLD_03_Z,
    offX: 1,
    offY: 1,
    width: 0.98,
    yaw: -6,
    fadeIn: seen(WORLD_03_Z, HORIZON_Z + 9.2, HORIZON_Z + HOLD_03),
    resolve: seen(WORLD_03_Z, HORIZON_Z + 10.8, HORIZON_Z + 14.4),
    fadeOut: null,
    distant: {
      frame: [0.69, 0.7],
      scale: 0.46,
      clarity: 0.62,
      lost: seen(WORLD_03_Z, HORIZON_Z + 16.3, HORIZON_Z + 21.8),
    },
    world: { spread: 2.8, ahead: 6.5, behind: 8, density: 0.9 },
  },
  {
    // Lower left.
    id: "project-04",
    title: "Project 04",
    accent: "212, 134, 168",
    media: null,
    poster: null,
    z: WORLD_04_Z,
    offX: -1,
    offY: 1,
    width: 0.98,
    yaw: 6,
    fadeIn: seen(WORLD_04_Z, HORIZON_Z + 15.5, HORIZON_Z + HOLD_04),
    resolve: seen(WORLD_04_Z, HORIZON_Z + 17.1, HORIZON_Z + 21.4),
    fadeOut: null,
    distant: {
      frame: [0.31, 0.7],
      scale: 0.46,
      clarity: 0.62,
      lost: seen(WORLD_04_Z, HORIZON_Z + 23.4, HORIZON_Z + 28.1),
    },
    world: { spread: 3.4, ahead: 7.5, behind: 9, density: 1.05 },
  },
  {
    // Upper right, and gone just as the fall runs out of scroll.
    id: "project-05",
    title: "Project 05",
    accent: "176, 148, 228",
    media: null,
    poster: null,
    z: WORLD_05_Z,
    offX: 1,
    offY: -1,
    width: 0.98,
    yaw: -6,
    fadeIn: seen(WORLD_05_Z, HORIZON_Z + 22.6, HORIZON_Z + HOLD_05),
    resolve: seen(WORLD_05_Z, HORIZON_Z + 24.1, HORIZON_Z + 27.8),
    fadeOut: null,
    distant: {
      frame: [0.69, 0.28],
      scale: 0.46,
      clarity: 0.62,
      lost: seen(WORLD_05_Z, HORIZON_Z + 28.9, HORIZON_Z + 31.4),
    },
    world: { spread: 3, ahead: 7, behind: 10, density: 1.2 },
  },
] as const;
