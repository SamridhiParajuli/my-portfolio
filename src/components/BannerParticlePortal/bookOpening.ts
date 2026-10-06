/**
 * bookOpening
 * -----------
 * What happens when the closed book (educationBook) is clicked: it opens,
 * slowly, like an old thing that has not been opened in a long time and
 * knows it is being watched.
 *
 * On its clock, which runs faster than real time (see paceAt), so that
 * it is open about 3.4 s after the click:
 *   0.0  it holds still -- its float stills, as if it had heard. (The
 *        painted book hands over here to the live one, pose for pose.)
 *   0.3  a warm, golden light comes up round it, and the motes nearest it
 *        -- the ring it keeps, and a few of the universe's own -- begin to
 *        drift in toward it and go into that light;
 *   0.9  it lifts a little, and tips back, and the camera begins, very
 *        slowly, to go in;
 *   2.5  the front board comes away from the pages at the fore-edge, and
 *        light from between them;
 *   3.4  it swings over on its hinge. The leaves under it follow, the ones
 *        nearest it first, each dragged a little behind by the air, and
 *        the spine rolls under as the block opens across it. The whole
 *        book turns to face the camera as it goes;
 *   6.2  the board lies open; the leaves come down onto it one on another,
 *        and the last few loose ones turn over after them on their own,
 *        slower each time, shedding dust;
 *   8.5  everything settles, open at two blank pages in the same universe
 *        it was made from, and holds quite still.
 * From there the clock runs on at the pace of real time while the spread
 * -- Education on the left, Certifications on the right -- is written in
 * (bookSpread). Held a while, its right-hand leaf is turned: it lifts from
 * the spine, its fore-edge still resting, stands all but balanced on its
 * end, and falls over onto the left-hand page, the air under it letting
 * its fore-edge down last -- throwing its shadow on the pages as it goes,
 * and laying bare the one beneath, where Experience is written. Education
 * fades from its page meanwhile, gently, a few motes rising off it, and
 * the leaf comes down blank-backed over where it was. Once Experience is
 * written, the book floats again.
 *
 * Then, once that has lain a while, the finale (bookFinale): a bird comes
 * for it out of the dark, lands on it, takes it up, and as it is carried
 * off the book gives itself up -- its leather burning back to motes, its
 * leaves pressed into one sheet of parchment that rolls itself up -- and
 * the scroll it has become is brought back, let go, and opens on the last
 * page (contactPage). The live book draws that too, the parchment as one
 * more part of it; and over it, the bird.
 *
 * All of it is a function of one clock, `t`. Scrolling back up runs that
 * clock backwards (a good deal faster) so the ink goes and the book shuts
 * before the universe takes it apart again.
 */

import {
  BOOK,
  createBookBake,
  createParchBake,
  type BookArt,
  type BookBake,
  type BookMap,
  type BookMapKey,
  type BookMaps,
  type ParchBake,
} from "./antiqueBook";
import {
  PART_KEYS,
  PL,
  T,
  YP,
  buildBookMesh,
  createBookMesh,
  slabFacePoint,
  slabPoint,
  slabSection,
  slabTip,
  type BookMesh,
  type BookShape,
  type Slab,
} from "./bookMesh";
import {
  LEAF_N,
  createBookGL,
  disposeBookGL,
  drawBookGL,
  placeBookGL,
  uploadBookInk,
  uploadBookMap,
  uploadBookMesh,
  uploadContactInk,
  type BookGL,
  type BookView,
} from "./bookGL";
import { blitGlow, viewInteriorMote, type JourneyWorld } from "./blackHoleJourney";
import { eduRestFrame, type EduBook, type EduOverride } from "./educationBook";
import {
  PAGE_CERTIFICATIONS,
  PAGE_EDUCATION,
  PAGE_EXPERIENCE,
  TURN_DUR,
  bakeSpread,
  candleAt,
  educationFade,
  loadPageFont,
  pageCalm,
  pensAt,
  spreadInkSize,
  type SpreadInk,
} from "./bookSpread";
import {
  GRIP_LOCAL,
  CONTACT_AT,
  STAGE_END,
  TAKE,
  birdHolds,
  clearFinale,
  createFinale,
  drawFinaleMotes,
  finaleAt,
  finaleCalm,
  finaleDolly,
  finaleSpan,
  finaleTakeover,
  finaleVeil,
  openHalf,
  openWidth,
  type Finale,
  type FinaleStage,
} from "./bookFinale";
import { LH_FINAL, XC, buildSheet, sheetPoint } from "./parchmentScroll";
import {
  bakeContact,
  contactCandle,
  contactInkSize,
  contactPens,
  contactToSheet,
  type ContactInk,
} from "./contactPage";
import { drawBird } from "./nightBird";

const { BW, HT, X0, YAW, PITCH, ROLL, CAM_D, KEY_DIR, FILL_DIR } = BOOK;

/* ------------------------------------------------------------------ *
 * The timeline (seconds from the click)
 * ------------------------------------------------------------------ */

/** It is fully open and settled by here. */
export const OPEN_END = 9.4;
/** Closing runs the clock back this many times faster. */
const CLOSE_RATE = 4;
/** Opening runs the clock this many times faster than real time: quickest
 *  through the stillness before the board moves, so the click is answered
 *  at once, then easing to a pace that still lets it go over with its
 *  weight. All told it opens in about 3.4 s. */
const PACE_START = 3.2;
const PACE_SWING = 2.6;
function paceAt(t: number) {
  // Once it lies open, the spread is written at the pace of real time.
  if (t >= OPEN_END) return 1;
  return lerp(PACE_START, PACE_SWING, smoothstep(1.6, 3.4, t));
}
/** Shutting runs the page's part of the clock back at least this many
 *  times faster, so its ink is gone in a moment -- and faster still if need
 *  be, so it is all undone (the leaf turned back too) within this. */
const PAGE_CLOSE_RATE = 10;
const PAGE_CLOSE_S = 2;
/** How much of its float comes back once the spread is written. */
const PAGE_FLOAT = 0.35;
/** How much further the universe behind is dimmed while it is read. */
const PAGE_VEIL = 0.3;
/** The candlelight crossing the spread: its reach, book heights, and how
 *  bright it is at most. */
const CANDLE_R = 0.3;
const CANDLE_K = 0.8;
/** The painted book gives way to the live one over this. */
const HANDOFF: [number, number] = [0.08, 0.5];
/** If the live book is somehow not ready yet, the clock waits here, before
 *  anything has visibly begun. */
const WAIT_AT = 0.05;
/** The finale (bookFinale) runs back at least this many times faster --
 *  and faster still if need be, so that it is all undone within this. */
const FIN_CLOSE_RATE = 10;
const FIN_CLOSE_S = 2.5;
/** How far from its middle anything of it can be drawn once the bird has
 *  it: further than the book ever goes. */
const FIN_DEPTH = 2.6;
/** The candle's reach over the parchment, and how bright it is at most. */
const CONTACT_CANDLE_R = 0.3;
const CONTACT_CANDLE_K = 0.5;

/** The board comes away from the pages, then goes over. */
const CRACK: [number, number] = [2.5, 3.35];
const CRACK_TO = 0.1;
const SWING0 = 3.4;
const COVER_SWING = 2.85;
/** How long a leaf takes to go over. */
const LEAF_SWING = 3.0;
/** The half of the block that goes over with the board, in so many slabs
 *  so it can fan; and the loose leaves that follow on their own. */
const NSHEAF = 14;
const NFLUTTER = 3;
/** The half that stays, in so many runs (see shapeAt); and on top of it,
 *  the one leaf of it that is turned once the spread has been read. */
const NSTACK = 10;
const NSLAB = NSTACK + NFLUTTER + NSHEAF + 1;
const TURN_LEAF = NSLAB - 1;
/** The pages that are written on: on the left the last loose leaf over,
 *  uppermost there; on the right the top of the half that stays (the leaf
 *  over it lies level with it until it is turned away). */
const LEFT_PAGE = NSTACK + NFLUTTER - 1;
const RIGHT_PAGE = NSTACK - 1;
/** One leaf's share of the block. */
const LEAF_D = 0.004;

/** Camera distance it ends at (the art's is CAM_D), in book heights. */
const CAM_END = 3.72;
/** How far the journey's camera goes on into the universe meanwhile, UNIT. */
export const OPEN_DOLLY = 0.8;

/** When each part of the block lets go and goes over. */
function sheafLag(j: number) {
  const f = (j + 0.5) / NSHEAF;
  return 0.07 + 0.12 * Math.pow(1 - f, 1.2);
}
function flutterDelay(i: number) {
  return 0.45 + 0.4 * i + 0.06 * i * i;
}
function flutterStretch(i: number) {
  return 1 + 0.07 * i;
}
/** When the last loose leaf is down: the shape changes no more after. */
const SHAPE_END =
  SWING0 +
  flutterDelay(NFLUTTER - 1) +
  LEAF_SWING * flutterStretch(NFLUTTER - 1) +
  0.05;

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
function easeInOutSine(x: number) {
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}
function easeInOutCubic(x: number) {
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}
/** Still at both ends in speed and in acceleration: how something heavy
 *  and hinged moves when nothing is hurrying it. */
function smootherstep(x: number) {
  return x * x * x * (x * (6 * x - 15) + 10);
}

function coverTurn(t: number) {
  return (
    CRACK_TO * easeInOutSine(span(t, CRACK[0], CRACK[1])) +
    (Math.PI - CRACK_TO) * smootherstep(span(t, SWING0, SWING0 + COVER_SWING))
  );
}

function leafTurn(t: number, delay: number, stretch: number) {
  return (
    Math.PI *
    smootherstep(span(t, SWING0 + delay, SWING0 + delay + LEAF_SWING * stretch))
  );
}

/** Its float, 1 as it floated shut: stilled at the click, quite still
 *  while it lies open and is written in, and some of it back after. */
function calmAt(o: BookOpening, t: number) {
  const c = finC(o, t);
  return (
    1 -
    smoothstep(0, 0.7, t) +
    PAGE_FLOAT * pageCalm(o.ink, t - OPEN_END) * (c > 0 ? finaleCalm(c) : 1)
  );
}

/** The golden light round it. */
function glowAt(t: number) {
  return smoothstep(0.25, 2.0, t) * (1 - 0.3 * smoothstep(7.5, 9.4, t));
}

/** The small start it gives when touched. */
function pulseAt(t: number) {
  return smoothstep(0.04, 0.3, t) * (1 - smoothstep(0.35, 1.0, t));
}

/** Light out of the pages: from the moment they part, easing to a glow. */
function spillAt(t: number) {
  return smoothstep(2.6, 4.2, t) * (1 - 0.55 * smoothstep(6.4, 9.4, t));
}

/* ------------------------------------------------------------------ *
 * The leaf turned, once the spread has been read (when, bookSpread says)
 * ------------------------------------------------------------------ */

/** How fast it goes over, `u` of the way through TURN_DUR: slow to lift,
 *  as a leaf does that has lain a long time; slower again as it stands on
 *  its end, all but balanced; then falling, faster; then settling on the
 *  air under it. Worked into TURN_OF once. */
function turnSpeed(u: number) {
  const going = u < 0.93 ? Math.pow(Math.sin((Math.PI * u) / 0.93), 1.25) : 0;
  const balanced = 1 - 0.5 * Math.exp(-(((u - 0.505) / 0.075) ** 2));
  const falling =
    1 + 0.5 * smoothstep(0.52, 0.64, u) * (1 - smoothstep(0.66, 0.86, u));
  const heavy = 0.55 + 0.45 * smoothstep(0, 0.3, u);
  return going * balanced * falling * heavy;
}

/** How far over it is through the turn, 0..pi, and how fast it is going
 *  then, 0..1, in so many steps. */
const TURN_STEPS = 256;
const TURN_OF = new Float64Array(TURN_STEPS + 1);
const TURN_V = new Float64Array(TURN_STEPS + 1);
{
  let sum = 0;
  let top = 0;
  for (let i = 0; i <= TURN_STEPS; i++) {
    const v = turnSpeed(i / TURN_STEPS);
    if (i) sum += (v + TURN_V[i - 1]) / 2;
    TURN_V[i] = v;
    TURN_OF[i] = sum;
    top = Math.max(top, v);
  }
  for (let i = 0; i <= TURN_STEPS; i++) {
    TURN_OF[i] *= Math.PI / sum;
    TURN_V[i] /= top;
  }
}

function turnSample(a: Float64Array, u: number) {
  const f = clamp(u, 0, 1) * TURN_STEPS;
  const k = Math.min(TURN_STEPS - 1, Math.floor(f));
  return a[k] + (a[k + 1] - a[k]) * (f - k);
}

/** How far through its turn the leaf is at clock `t`, 0..1. */
function leafTurnAt(o: BookOpening, t: number) {
  const ink = o.ink;
  if (!ink) return 0;
  return span(t - OPEN_END, ink.turnAt, ink.turnAt + TURN_DUR);
}

/** The turned leaf `u` of the way through its turn, into `s`. */
function turnLeaf(s: Slab, u: number) {
  const turn = turnSample(TURN_OF, u);
  // At first it only rises from the spine, in an arch, its fore-edge still
  // resting on the page...
  const hold = 1 - smoothstep(0.1, 0.3, u);
  // ...then hangs from the spine by its own weight, back the way it came
  // until it is over and forward after, except where it lies on the pages;
  const free =
    smoothstep(0.04, 0.7, turn) * smoothstep(0.04, 0.7, Math.PI - turn);
  const sag = -0.3 * Math.cos(turn) * free;
  // its free end trailing, the more the faster it goes;
  const drag = -0.34 * turnSample(TURN_V, u);
  // and, with the air under it the last thing to go, the fore-edge last
  // to come down.
  const land = -0.22 * smoothstep(0.72, 0.9, u) * (1 - smoothstep(0.9, 1, u));
  s.turn = turn;
  s.curl = -2.55 * turn * hold + (1 - hold) * (drag + sag + land);
  s.wave =
    0.045 * Math.sin(2 * Math.PI * 1.4 * u * TURN_DUR) * free * (1 - hold);
}

/* ------------------------------------------------------------------ */

type Mote = {
  i: number;
  delay: number;
  dur: number;
  swirl: number;
  px: number;
  py: number;
};

type Dust = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
  a: number;
  c: number;
  ph: number;
  tw: number;
  sway: number;
};

// Palette slots (bookFinale's motes use the same: and the last two).
const C_WARM = 0;
const C_GOLD = 1;
const C_PALE = 2;
const C_EMBER = 3;
const PALETTE = [
  [255, 232, 198],
  [255, 204, 140],
  [255, 243, 226],
  [232, 162, 104],
  [255, 150, 72],
  [196, 204, 255],
] as const;

type IdleWindow = Window & {
  requestIdleCallback?: (
    cb: (d: { timeRemaining: () => number }) => void,
    opts?: { timeout: number }
  ) => number;
  cancelIdleCallback?: (h: number) => void;
};

export type BookOpening = {
  canvas: HTMLCanvasElement | null;
  gl: BookGL | null;
  /** WebGL is not to be had: the book stays shut, and cannot be clicked. */
  noGL: boolean;
  bake: BookBake | null;
  worker: Worker | null;
  bakeFor: number;
  maps: BookMaps | null;
  pending: BookMapKey[];
  idle: number;
  idleKind: "idle" | "timeout" | null;
  mesh: BookMesh;
  shape: BookShape;
  /** The clock the mesh was last built at, and how far the turned leaf
   *  was through its turn. */
  builtAt: number;
  builtTurn: number;
  /** ...and the parchment's shape it was last built with. */
  builtSheet: string;
  view: BookView;
  /** The clock, and whether it is running forward. */
  t: number;
  wanted: boolean;
  /** The chapter the menu has cut to, while the clock is still being put
   *  there (see seekBookOpening); null otherwise. */
  seek: BookChapter | null;
  hovering: boolean;
  hover: number;
  cssW: number;
  cssH: number;
  small: boolean;
  /** Scale that makes the open book fit a narrow screen, and the box the
   *  live book is drawn in -- both for this viewport and this art. */
  fit: number;
  fitKey: string;
  shown: boolean;
  /** Where the book's middle is on screen this frame, and its height. */
  cx: number;
  cy: number;
  size: number;
  motes: Mote[];
  motesCued: boolean;
  dust: Dust[];
  emit: Float64Array;
  lastT: number;
  lastTime: number;
  pal: number[];
  palBank: unknown;
  lastTurn: Float64Array;
  /** The spread (bookSpread): whether its face is to be had yet; the map
   *  it is set into, and for a page how tall on screen; how tall a page is
   *  now; and where the pens are. */
  pageFont: "idle" | "loading" | "ready";
  ink: SpreadInk | null;
  inkFor: number;
  pagePx: number;
  pens: number[];
  /** The finale (bookFinale): its state; the parchment's map, baked once
   *  the book has been opened (in a worker, if one can be had); the last
   *  page, set; and whether the live book is drawn over the whole screen,
   *  as it is once the bird has it. */
  fin: Finale;
  parchMap: BookMap | null;
  parchWorker: Worker | null;
  parchBake: ParchBake | null;
  parchFailed: boolean;
  contact: ContactInk | null;
  /** The last page the GPU has been given. */
  contactUp: ContactInk | null;
  glFull: boolean;
  /** Where the last page's addresses are on screen, once written there. */
  links: Array<[number, number, number, number] | null>;
};

export function createBookOpening(): BookOpening {
  const slabs: Slab[] = [];
  for (let i = 0; i < NSLAB; i++) {
    slabs.push({
      lo: 0,
      hi: 0,
      turn: 0,
      curl: 0,
      wave: 0,
      glow: 1,
      thin: false,
      flip: 0,
      inkFront: -1,
      inkBack: -1,
      caster: false,
    });
  }
  return {
    canvas: null,
    gl: null,
    noGL: false,
    bake: null,
    worker: null,
    bakeFor: 0,
    maps: null,
    pending: [],
    idle: 0,
    idleKind: null,
    mesh: createBookMesh(),
    shape: { roll: 0, cover: 0, slabs },
    builtAt: NaN,
    builtTurn: NaN,
    builtSheet: "",
    view: {
      R: new Float32Array(9),
      pivot: [0, 0, 0],
      T: [0, 0, 0],
      D: CAM_D,
      F: 1,
      C: [0, 0],
      rotK: [1, 0],
      Q0: [0, 0],
      key: norm3(KEY_DIR),
      fill: norm3(FILL_DIR),
      pool: [-0.12, 0.2, 0.62, 0.78],
      warm: [0, 0, 0],
      glow: [0, 0, 0],
      trans: 0.9,
      rim: 1,
      inkOn: 0,
      inkT: [0, 1],
      inkT2: [0, 1],
      fade: 0,
      candle: [0, 0, 1, 0],
      leaf: new Float32Array(LEAF_N * 2),
      leafL: [0, 0, 1, 0],
      squash: 0,
      dis: [0, 0],
      fadeExp: 0,
      ember: 0,
      inkCOn: 0,
      inkCT: [0, 1],
      sheetMap: "paper",
      book: true,
      depthR: 1.9,
    },
    t: 0,
    wanted: false,
    seek: null,
    hovering: false,
    hover: 0,
    cssW: 0,
    cssH: 0,
    small: false,
    fit: 1,
    fitKey: "",
    shown: false,
    cx: 0,
    cy: 0,
    size: 0,
    motes: [],
    motesCued: false,
    dust: [],
    emit: new Float64Array(11),
    lastT: 0,
    lastTime: 0,
    pal: [],
    palBank: null,
    lastTurn: new Float64Array(NSLAB),
    pageFont: "idle",
    ink: null,
    inkFor: 0,
    pagePx: 0,
    pens: [0, 0, 0, 0, 0, 0, 0, 0],
    fin: createFinale(),
    parchMap: null,
    parchWorker: null,
    parchBake: null,
    parchFailed: false,
    contact: null,
    contactUp: null,
    glFull: false,
    links: [null, null, null, null],
  };
}

function norm3(v: readonly number[]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/* ------------------------------------------------------------------ *
 * Getting the live book ready, long before it is needed
 * ------------------------------------------------------------------ */

export function layoutBookOpening(
  o: BookOpening,
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  small: boolean
) {
  o.canvas = canvas;
  o.cssW = cssW;
  o.cssH = cssH;
  o.small = small;
  o.fitKey = "";
}

/** Bakes on the main thread in idle time -- only where no worker can be
 *  had to do it (see startBake). */
function schedule(o: BookOpening, b: EduBook) {
  if (o.idleKind) return;
  const win = window as IdleWindow;
  const run = (budget: number) => {
    o.idle = 0;
    o.idleKind = null;
    if (o.bake && !o.maps && work(o, b, budget)) schedule(o, b);
  };
  if (win.requestIdleCallback) {
    o.idleKind = "idle";
    o.idle = win.requestIdleCallback(
      (d) => run(clamp(d.timeRemaining() - 1, 6, 12)),
      { timeout: 150 }
    );
  } else {
    o.idleKind = "timeout";
    o.idle = window.setTimeout(() => run(5), 60);
  }
}

function cancelIdle(o: BookOpening) {
  const win = window as IdleWindow;
  if (o.idleKind === "idle") win.cancelIdleCallback?.(o.idle);
  else if (o.idleKind === "timeout") window.clearTimeout(o.idle);
  o.idle = 0;
  o.idleKind = null;
}

/** One slice of getting ready. True while there is more to do. */
function work(o: BookOpening, b: EduBook, budget: number) {
  if (o.noGL) return false;
  if (o.bake && !o.maps) {
    if (!o.bake.step(budget)) return true;
    o.maps = o.bake.result();
    o.pending = o.maps ? (Object.keys(o.maps) as BookMapKey[]) : [];
    return true;
  }
  if (o.maps && o.pending.length) {
    if (!o.gl) {
      if (!o.canvas) return false;
      o.gl = createBookGL(o.canvas);
      if (!o.gl) {
        o.noGL = true;
        return false;
      }
      watchContext(o);
      return true;
    }
    const key = o.pending.shift()!;
    uploadBookMap(o.gl, key, o.maps[key]);
    return o.pending.length > 0;
  }
  return false;
}

function watchContext(o: BookOpening) {
  const c = o.canvas;
  if (!c || c.dataset.watched) return;
  c.dataset.watched = "1";
  c.addEventListener("webglcontextlost", (ev) => {
    ev.preventDefault();
    if (o.gl) o.gl.lost = true;
  });
  c.addEventListener("webglcontextrestored", () => {
    // Everything is handed to the GPU again, a map a frame (see prepare).
    o.gl = null;
    o.builtAt = NaN;
    o.builtSheet = "?";
    o.contactUp = null;
    if (o.maps) o.pending = Object.keys(o.maps) as BookMapKey[];
  });
}

function ready(o: BookOpening) {
  return Boolean(o.gl && !o.gl.lost && o.maps && o.pending.length === 0);
}

/** Bakes the maps for a book `bookPx` tall: in a worker, so it costs the
 *  journey nothing and is done in a moment -- or, failing that, here in
 *  idle time. */
function startBake(o: BookOpening, bookPx: number, res: number) {
  o.bakeFor = bookPx;
  o.maps = null;
  o.pending = [];
  o.bake = null;
  if (o.gl) {
    disposeBookGL(o.gl);
    o.gl = null;
  }
  if (o.worker) {
    o.worker.terminate();
    o.worker = null;
  }
  if (typeof Worker !== "undefined") {
    try {
      const worker = new Worker(
        new URL("./bookBake.worker.ts", import.meta.url),
        { type: "module" }
      );
      worker.onmessage = (
        e: MessageEvent<{ bookPx: number; maps: BookMaps }>
      ) => {
        worker.terminate();
        if (o.worker !== worker) return;
        o.worker = null;
        if (e.data.bookPx !== o.bakeFor) return;
        o.maps = e.data.maps;
        o.pending = Object.keys(o.maps) as BookMapKey[];
      };
      worker.onerror = () => {
        worker.terminate();
        if (o.worker !== worker) return;
        o.worker = null;
        o.bake = createBookBake(bookPx, res);
      };
      worker.postMessage({ bookPx, res });
      o.worker = worker;
      return;
    } catch {
      // No worker to be had: bake here instead.
    }
  }
  o.bake = createBookBake(bookPx, res);
}

/** Starts baking once the art is there (and again only if a very
 *  different size of book is wanted before it has ever been opened), and
 *  hands what is baked to the GPU a map a frame. */
function prepare(o: BookOpening, b: EduBook) {
  if (o.noGL || !b.art) return;
  const want = b.art.bookPx;
  if (!o.bakeFor || (o.t <= 0 && Math.abs(want - o.bakeFor) / want > 0.35)) {
    startBake(o, want, b.res);
  }
  if (o.bake && !o.maps) schedule(o, b);
  if (o.maps && o.pending.length) work(o, b, 0);
  preparePage(o, b);
  prepareFinale(o, b);
}

/** The scroll the book becomes, once it has been opened: its parchment
 *  baked, and its last page set, both long before they are needed -- and
 *  handed to the GPU (again, if the GPU has had to start over). */
function prepareFinale(o: BookOpening, b: EduBook) {
  const art = b.art;
  if (!art || o.noGL || o.t <= OPEN_END) return;
  if (!o.parchMap && !o.parchWorker && !o.parchBake && !o.parchFailed) {
    startParch(o, art.bookPx, b.res);
  }
  if (o.parchBake && !o.parchMap && o.parchBake.step(4)) {
    o.parchMap = o.parchBake.result();
    o.parchBake = null;
  }
  const gl = o.gl && !o.gl.lost ? o.gl : null;
  if (gl && o.parchMap && !gl.tex.parch) uploadBookMap(gl, "parch", o.parchMap);
  // (Set again if the screen has changed so that the parchment will open to
  // another width -- so long as nothing of it has been written yet.)
  if (
    o.contact &&
    Math.abs(o.contact.half - openHalf(o.small)) > 1e-9 &&
    finC(o, o.t) < CONTACT_AT - 1
  ) {
    o.contact = null;
  }
  // (Set while the book lies still, its last page written and drying, so
  // the moment it takes is never seen.)
  if (
    !o.contact &&
    o.pageFont === "ready" &&
    o.ink &&
    o.t - OPEN_END > o.ink.written + 0.8
  ) {
    const { sheetPx } = finalFraming(o, b, art);
    const most = gl ? (gl.gl.getParameter(gl.gl.MAX_TEXTURE_SIZE) as number) : 4096;
    const [w, h] = contactInkSize(sheetPx, b.res, Math.min(4096, most));
    o.contact = bakeContact(w, h, openHalf(o.small), sheetPx);
  }
  if (gl && o.contact && (o.contactUp !== o.contact || !gl.inkC)) {
    uploadContactInk(gl, o.contact.canvas);
    o.contactUp = o.contact;
  }
}

function startParch(o: BookOpening, bookPx: number, res: number) {
  const width = 2 * LH_FINAL;
  if (typeof Worker !== "undefined") {
    try {
      const worker = new Worker(
        new URL("./bookBake.worker.ts", import.meta.url),
        { type: "module" }
      );
      worker.onmessage = (e: MessageEvent<{ bookPx: number; map: BookMap }>) => {
        worker.terminate();
        if (o.parchWorker !== worker) return;
        o.parchWorker = null;
        o.parchMap = e.data.map;
      };
      worker.onerror = () => {
        worker.terminate();
        if (o.parchWorker !== worker) return;
        o.parchWorker = null;
        o.parchBake = createParchBake(bookPx, res, width);
      };
      worker.postMessage({ bookPx, res, width });
      o.parchWorker = worker;
      return;
    } catch {
      // No worker to be had: bake here instead, a slice a frame.
    }
  }
  o.parchBake = createParchBake(bookPx, res, width);
}

/** Whether everything the finale needs has been handed over. (The
 *  parchment's own map may be missing, if it could not be baked: the
 *  leaves' stands in for it.) */
function finaleReady(o: BookOpening) {
  const gl = o.gl;
  if (!gl || gl.lost || !o.contact || o.contactUp !== o.contact || !gl.inkC) {
    return false;
  }
  return Boolean(gl.tex.parch) || o.parchFailed || (!o.parchWorker && !o.parchBake && !o.parchMap);
}

/** Where the scroll comes to rest to be read: how near (world z), so that
 *  it opens as large as the screen allows; and how tall it is then. */
function finalFraming(o: BookOpening, b: EduBook, art: BookArt) {
  const K = (b.bookPx / art.bookPx) * o.fit * STAGE_END * art.focal;
  const wo = openWidth(o.small);
  const ho = 2 * YP;
  const across = o.small ? 0.9 : 0.84;
  let d = Math.max((wo * K) / (across * o.cssW), (ho * 1.04 * K) / (0.74 * o.cssH));
  d = Math.max(d, CAM_END - FIN_DEPTH + 0.4);
  return { z: CAM_END - d, sheetPx: (ho * K) / d };
}

/** The finale's own clock at book clock `t`: negative until it begins. */
function finC(o: BookOpening, t: number) {
  return o.ink ? t - OPEN_END - o.ink.span : -1;
}

/** The spread: its face fetched early; set once the book is asked to open
 *  (again, if the screen has changed a good deal while it was shut), and
 *  handed to the GPU -- again, if the GPU has had to start over. */
function preparePage(o: BookOpening, b: EduBook) {
  if (o.pageFont === "idle") {
    o.pageFont = "loading";
    void loadPageFont().then(() => {
      o.pageFont = "ready";
    });
  }
  if (o.t <= 0 && !o.wanted) {
    if (o.ink && o.pagePx > 0 && Math.abs(o.pagePx - o.inkFor) / o.pagePx > 0.35) {
      o.ink = null;
    }
    return;
  }
  if (!o.ink && o.pageFont === "ready" && o.pagePx > 0) {
    const gl = o.gl && !o.gl.lost ? o.gl.gl : null;
    const most = gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : 4096;
    const [w, h] = spreadInkSize(o.pagePx, b.res, Math.min(4096, most));
    o.ink = bakeSpread(w, h);
    o.inkFor = o.pagePx;
    if (o.gl?.ink && o.ink) uploadBookInk(o.gl, o.ink.canvas);
  }
  if (o.ink && o.gl && !o.gl.lost && !o.gl.ink) uploadBookInk(o.gl, o.ink.canvas);
}

function pageReady(o: BookOpening) {
  return Boolean(o.ink && o.gl && o.gl.ink);
}

export function disposeBookOpening(o: BookOpening) {
  cancelIdle(o);
  o.worker?.terminate();
  o.worker = null;
  o.parchWorker?.terminate();
  o.parchWorker = null;
  o.parchBake = null;
  if (o.gl) disposeBookGL(o.gl);
  o.gl = null;
  o.bake = null;
  o.maps = null;
  o.ink = null;
}

/* ------------------------------------------------------------------ *
 * The clock
 * ------------------------------------------------------------------ */

/** The click. Only takes when the book can be opened. */
export function requestBookOpen(o: BookOpening) {
  if (o.noGL || o.wanted || o.t > 0) return;
  o.wanted = true;
}

/** What the book is showing, as the menu names it. */
export type BookChapter = "education" | "experience" | "contact";

/** Where on the clock the menu cuts to for each chapter: the spread lying
 *  open and blank, about to be written; the leaf coming down over the
 *  page Experience is written on; the scroll unrolling, a moment before
 *  Contact is written on it. Infinity until it can be known (the spread
 *  not yet set). */
function chapterAt(o: BookOpening, chapter: BookChapter) {
  if (chapter === "education") return OPEN_END;
  if (!o.ink) return Infinity;
  if (chapter === "experience") return OPEN_END + o.ink.turnEnd - 0.6;
  return OPEN_END + o.ink.span + CONTACT_AT - 2;
}

/** The chapter the book is at now (a closed book is Education's). */
export function bookChapter(o: BookOpening): BookChapter {
  if (!o.ink) return "education";
  if (finC(o, o.t) >= TAKE) return "contact";
  if (o.t - OPEN_END >= o.ink.turnAt + TURN_DUR / 2) return "experience";
  return "education";
}

/**
 * The menu: open the book (if it is not) and put the clock at `chapter`,
 * forward or back. It is put there at once, as far as what has been made
 * ready allows, and waits on the rest at the same points the clock always
 * waits at -- the cut that hides it lifts once it is there (`o.seek` null).
 */
export function seekBookOpening(o: BookOpening, chapter: BookChapter) {
  if (o.noGL) return;
  o.wanted = true;
  o.seek = chapter;
}

/**
 * Advances the clock. `eduE` is how formed the book is, `eduTarget` how
 * formed the scroll wants it. True while the book must be held formed --
 * it has to shut before it can come apart.
 */
export function tickBookOpening(
  o: BookOpening,
  b: EduBook,
  dt: number,
  eduE: number,
  eduTarget: number
) {
  prepare(o, b);
  const closed = o.t <= 0 && !o.wanted;
  const canOpen = closed && eduE >= 1 && eduTarget >= 0.999 && !o.noGL;
  o.hover +=
    ((o.hovering && canOpen ? 1 : 0) - o.hover) * (1 - Math.exp(-dt * 5));

  const forward = o.wanted && eduTarget >= 0.999;
  if (forward) {
    if (!ready(o) && o.bake && !o.maps) {
      // Clicked before a main-thread bake was done: finish it now.
      cancelIdle(o);
      work(o, b, 24);
    }
    let next = o.t + dt * paceAt(o.t);
    if (o.seek) {
      const at = chapterAt(o, o.seek);
      if (at < o.t) {
        // Back to an earlier chapter: at once, and what was let go on the
        // way here goes with it.
        o.t = at;
        o.seek = null;
        o.dust.length = 0;
        clearFinale(o.fin);
        o.links.fill(null);
        return true;
      }
      next = at;
    }
    if (!ready(o)) next = Math.min(next, WAIT_AT);
    // It lies open, still, until the spread can be written.
    if (!pageReady(o)) next = Math.min(next, OPEN_END);
    // ...and once it is written, until the finale can be had, if it is not
    // yet; then the finale, to its end.
    const pageEnd = OPEN_END + (o.ink ? o.ink.span : 0);
    const end =
      o.ink && o.contact && finaleReady(o)
        ? pageEnd + finaleSpan(o.contact.span)
        : pageEnd;
    o.t = Math.min(end, next);
    if (o.seek && o.t >= chapterAt(o, o.seek)) o.seek = null;
  } else if (o.t > 0) {
    const pageEnd = OPEN_END + (o.ink ? o.ink.span : 0);
    const rate =
      o.ink && o.t > pageEnd
        ? Math.max(
            FIN_CLOSE_RATE,
            (o.contact ? finaleSpan(o.contact.span) : 30) / FIN_CLOSE_S
          )
        : o.t > OPEN_END
          ? Math.max(PAGE_CLOSE_RATE, (o.ink ? o.ink.span : 0) / PAGE_CLOSE_S)
          : CLOSE_RATE;
    // (Never back past where the finale began in the same step as the
    // finale itself: the page part keeps its own pace.)
    const back = o.t - dt * rate;
    o.t = Math.max(0, o.ink && o.t > pageEnd ? Math.max(pageEnd, back) : back);
    if (o.t <= 0) o.wanted = false;
  } else {
    o.wanted = false;
  }
  return o.t > 0 || forward;
}

/** How much further to dim the universe behind it, 0..1. */
export function openingVeil(o: BookOpening) {
  const page = PAGE_VEIL * smoothstep(OPEN_END + 0.3, OPEN_END + 3, o.t);
  const c = finC(o, o.t);
  if (c <= 0) return page;
  return 1 - (1 - page) * (1 - finaleVeil(c));
}

/** How far the camera has gone in, 0..1 -- and on, as the scroll is
 *  carried off. */
export function openingDolly(o: BookOpening) {
  const c = finC(o, o.t);
  return easeInOutSine(span(o.t, 0.9, 8.9)) + (c > 0 ? finaleDolly(c) : 0);
}

/** Where to catch the click: over the closed book, while it can open. */
export function bookHitRect(
  o: BookOpening,
  b: EduBook,
  time: number,
  eduE: number,
  eduTarget: number
): [number, number, number, number] | null {
  const art = b.art;
  if (!art || o.noGL || o.t > 0 || o.wanted) return null;
  if (eduE < 1 || eduTarget < 0.999) return null;
  const fr = eduRestFrame(b, time, 1);
  const w = art.w * fr.k * 0.86;
  const h = art.h * fr.k * 0.9;
  return [fr.x - w / 2, fr.y - h / 2, w, h];
}

/** Shuts it at once, with no animation: the scroll has left the book. */
export function resetBookOpening(o: BookOpening, w: JourneyWorld | null) {
  o.t = 0;
  o.wanted = false;
  o.seek = null;
  o.hover = 0;
  o.dust.length = 0;
  clearFinale(o.fin);
  o.links.fill(null);
  if (w) releaseMotes(o, w);
  hide(o);
}

/* ------------------------------------------------------------------ *
 * Shape and pose at the current moment
 * ------------------------------------------------------------------ */

function shapeAt(o: BookOpening, t: number) {
  const s = o.shape.slabs;
  const split = 0.5 - NFLUTTER * LEAF_D;
  let n = 0;
  // The right half of the block, which never moves -- in a few runs, so
  // that as the gutter curls the upper leaves draw back from the fore-edge
  // further than the lower ones, in steps, as they do. Its uppermost leaf
  // is apart from it (the one that is turned), and the page under that is
  // its own sheet, not the one above it again.
  for (let i = 0; i < NSTACK; i++) {
    const top = i === RIGHT_PAGE;
    Object.assign(s[n++], {
      lo: (split * i) / NSTACK,
      hi: top ? split - LEAF_D : (split * (i + 1)) / NSTACK,
      turn: 0,
      curl: 0,
      wave: 0,
      thin: false,
      flip: top ? 2 : i & 3,
      inkFront: top ? PAGE_EXPERIENCE : -1,
      inkBack: -1,
      caster: false,
    });
  }
  // The loose leaves that follow on their own, each later and slower.
  for (let i = 0; i < NFLUTTER; i++) {
    const dl = flutterDelay(i);
    const st = flutterStretch(i);
    const turn = leafTurn(t, dl, st);
    const p = span(t, SWING0 + dl, SWING0 + dl + LEAF_SWING * st);
    Object.assign(s[n++], {
      lo: 0.5 - (i + 1) * LEAF_D,
      hi: 0.5 - i * LEAF_D,
      turn,
      // The free end trails the rest as the air takes it, and ripples.
      curl: 1.1 * (leafTurn(t - 0.2, dl, st) - turn),
      wave:
        0.07 *
        Math.sin(2 * Math.PI * 1.6 * (t - SWING0 - dl)) *
        Math.sin(Math.PI * p),
      thin: true,
      flip: i + 1,
      inkFront: -1,
      inkBack: i === NFLUTTER - 1 ? PAGE_EDUCATION : -1,
      caster: false,
    });
  }
  // The half that goes over with the board, fanning a little behind it.
  for (let j = 0; j < NSHEAF; j++) {
    const lag = sheafLag(j);
    const f = (j + 0.5) / NSHEAF;
    const tau = 0.1 + 0.1 * (1 - f);
    const turn = leafTurn(t, lag, 1);
    Object.assign(s[n++], {
      lo: 0.5 + (j * 0.5) / NSHEAF,
      hi: 0.5 + ((j + 1) * 0.5) / NSHEAF,
      turn,
      curl: 0.85 * (leafTurn(t - tau, lag, 1) - turn),
      wave: 0,
      thin: false,
      flip: j & 3,
      inkFront: -1,
      inkBack: -1,
      caster: false,
    });
  }
  // And the leaf on top of the half that stays: Certifications on its face,
  // and nothing on its back -- it comes down, once it is turned, on the
  // left-hand page Education has faded from.
  Object.assign(s[n++], {
    lo: split - LEAF_D,
    hi: split,
    thin: true,
    flip: 1,
    inkFront: PAGE_CERTIFICATIONS,
    inkBack: -1,
    caster: true,
  });
  turnLeaf(s[TURN_LEAF], leafTurnAt(o, t));
  o.shape.cover = coverTurn(t);
  // The spine rolls under as the block opens across it: half as far as
  // the middle of the half that goes over.
  o.shape.roll = 0.5 * midTurn(t);
}

/** The turn of the middle of the half that goes over: where the book's
 *  weight is, as it opens. */
function midTurn(t: number) {
  return leafTurn(t, sheafLag(NSHEAF >> 1), 1);
}

// The pose, for projecting points of the book on the CPU exactly as the
// GPU does. R is row-major, book -> world.
const PV = {
  R: new Float64Array(9),
  px: 0,
  py: 0,
  pz: 0,
  tx: 0,
  ty: 0,
  tz: 0,
  D: CAM_D as number,
  F: 1,
  cx: 0,
  cy: 0,
  rc: 1,
  rs: 0,
  q0x: 0,
  q0y: 0,
};

function poseMatrix(yaw: number, pitch: number, roll: number, out: Float64Array) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const cz = Math.cos(roll);
  const sz = Math.sin(roll);
  // Rz * Rx * Ry, as antiqueBook poses it.
  const a = [cy, 0, sy, sx * sy, cx, -sx * cy, -cx * sy, sx, cx * cy];
  out[0] = cz * a[0] - sz * a[3];
  out[1] = cz * a[1] - sz * a[4];
  out[2] = cz * a[2] - sz * a[5];
  out[3] = sz * a[0] + cz * a[3];
  out[4] = sz * a[1] + cz * a[4];
  out[5] = sz * a[2] + cz * a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
}

/** Sets PV for the book at clock `t`. `fit` overrides the narrow-screen
 *  scale (for measuring). */
function poseAt(
  o: BookOpening,
  b: EduBook,
  art: BookArt,
  t: number,
  time: number,
  fit = o.fit
) {
  const fr = eduRestFrame(b, time, calmAt(o, t));
  // Lifting and tipping back; then turning to face the camera as it opens.
  const a1 = easeInOutSine(span(t, 0.9, 3.3));
  const a2 = easeInOutSine(span(t, 3.2, 8.3));
  const push = easeInOutSine(span(t, 0.9, 8.9));
  const yaw = YAW - 0.1 * a1 - (YAW - 0.1) * a2;
  const pitch = PITCH - 0.12 * a1 - (PITCH - 0.12 + 0.16) * a2;
  const roll = ROLL + 0.03 * a1 - (ROLL + 0.03) * a2;
  poseMatrix(yaw, pitch, roll, PV.R);
  // Kept centred as its weight goes over: on the closed book at first, on
  // the gutter once it lies open -- the way a camera would hold it.
  const open = (1 - Math.cos(midTurn(t))) / 2;
  PV.px = (X0 - T) * open;
  PV.py = 0;
  PV.pz = 0;
  PV.tx = 0;
  PV.ty = 0.045 * a1 * (1 - 0.6 * a2);
  PV.tz = 0;
  PV.D = CAM_D + (CAM_END - CAM_D) * push;
  PV.F = art.focal;
  let kk = fr.k * lerp(1, fit, open);
  PV.cx = fr.x;
  PV.cy = fr.y;
  // Once the bird has it, it is held from the head of its spine, and the
  // bird says where that is, and how it hangs.
  const c = finC(o, t);
  if (c > 0) {
    const ff = o.fin.frame;
    poseMatrix(yaw + ff.dYaw, pitch + ff.dPitch, roll + ff.dRoll, PV.R);
    PV.px = GRIP_LOCAL[0];
    PV.py = GRIP_LOCAL[1];
    PV.pz = GRIP_LOCAL[2];
    PV.tx = ff.grip[0];
    PV.ty = ff.grip[1];
    PV.tz = ff.grip[2];
    PV.cy += ff.dy * o.cssH;
    kk *= ff.scale;
  }
  PV.rc = Math.cos(fr.rot) * kk;
  PV.rs = Math.sin(fr.rot) * kk;
  PV.q0x = (art.ox - art.ax) * (1 - open);
  PV.q0y = (art.oy - art.ay) * (1 - open);
  return { a2, kk, open };
}

/** A point of the book (book space) on screen, with its camera distance.
 *  out: [x, y, d]. */
function project(lx: number, ly: number, lz: number, out: number[]) {
  const x = lx - PV.px;
  const y = ly - PV.py;
  const z = lz - PV.pz;
  const R = PV.R;
  const wx = R[0] * x + R[1] * y + R[2] * z + PV.tx;
  const wy = R[3] * x + R[4] * y + R[5] * z + PV.ty;
  const wz = R[6] * x + R[7] * y + R[8] * z + PV.tz;
  projectWorld(wx, wy, wz, out);
}

/** A point of the world the book is in (after its pose) on screen, with its
 *  camera distance -- for what is in that world with it: the bird. out:
 *  [x, y, d]. */
function projectWorld(wx: number, wy: number, wz: number, out: number[]) {
  const d = PV.D - wz;
  const qx = PV.q0x + (PV.F * wx) / d;
  const qy = PV.q0y - (PV.F * wy) / d;
  out[0] = PV.cx + PV.rc * qx - PV.rs * qy;
  out[1] = PV.cy + PV.rs * qx + PV.rc * qy;
  out[2] = d;
}

/** Screen px per world unit at camera distance `d`. */
function pxAt(d: number) {
  return (Math.hypot(PV.rc, PV.rs) * PV.F) / d;
}

/** Where the book is held from as it lies open, in the world: the point
 *  the finale's pose is worked from, so that at its first moment the book
 *  is exactly where it lay. */
const GRIP_REST: [number, number, number] = [0, 0, 0];
let gripRestSet = false;
let pitchOpen = 0;
function gripRest() {
  if (!gripRestSet) {
    gripRestSet = true;
    // The open pose, as poseAt has it once both its turns are done.
    const yaw = YAW - 0.1 - (YAW - 0.1);
    const pitch = PITCH - 0.12 - (PITCH - 0.12 + 0.16);
    const roll = ROLL + 0.03 - (ROLL + 0.03);
    pitchOpen = pitch;
    const R = new Float64Array(9);
    poseMatrix(yaw, pitch, roll, R);
    const x = GRIP_LOCAL[0] - (X0 - T);
    const y = GRIP_LOCAL[1];
    const z = GRIP_LOCAL[2];
    GRIP_REST[0] = R[0] * x + R[1] * y + R[2] * z;
    GRIP_REST[1] = R[3] * x + R[4] * y + R[5] * z + 0.045 * (1 - 0.6);
    GRIP_REST[2] = R[6] * x + R[7] * y + R[8] * z;
  }
  return GRIP_REST;
}

const P3 = [0, 0, 0];

/** How small the open book must be to fit this screen, and the box the
 *  live book is drawn in. */
function ensureFit(o: BookOpening, b: EduBook, art: BookArt) {
  const key = `${o.cssW}x${o.cssH}:${b.bookPx}:${art.bookPx}:${o.glFull ? 1 : 0}`;
  if (o.fitKey === key) return;
  o.fitKey = key;
  poseAt(o, b, art, OPEN_END, 0, 1);
  PV.cx = 0;
  PV.cy = 0;
  PV.rc = b.bookPx / art.bookPx;
  PV.rs = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const x of [X0 - 2 * T - BW, X0 + BW]) {
    for (const y of [-0.5, 0.5]) {
      for (const z of [-HT, 0.02]) {
        project(x, y, z, P3);
        minX = Math.min(minX, P3[0]);
        maxX = Math.max(maxX, P3[0]);
        minY = Math.min(minY, P3[1]);
        maxY = Math.max(maxY, P3[1]);
      }
    }
  }
  const ow = maxX - minX;
  const oh = maxY - minY;
  o.fit = Math.min(1, (0.92 * o.cssW) / ow, (0.8 * o.cssH) / oh);
  // And how tall a page is on screen then, to set it at (bookSpread).
  project(X0 - T - 0.4 * PL, YP, 0.02, P3);
  const top = P3[1];
  project(X0 - T - 0.4 * PL, -YP, 0.02, P3);
  o.pagePx = Math.abs(P3[1] - top) * o.fit;
  if (o.gl && o.glFull) {
    // Carried off, it can be anywhere.
    placeBookGL(o.gl, 0, 0, Math.round(o.cssW), Math.round(o.cssH), b.res);
  } else if (o.gl) {
    const k = b.bookPx / art.bookPx;
    const w = Math.min(o.cssW, Math.round(Math.max(art.w * k * 1.35, ow * o.fit * 1.3 + 40)));
    const h = Math.min(o.cssH, Math.round(Math.max(art.h * k, oh * o.fit) * 1.8));
    placeBookGL(
      o.gl,
      Math.round((o.cssW - w) / 2),
      Math.round((o.cssH - h) / 2),
      w,
      h,
      b.res
    );
  }
}

/**
 * Works out this frame of the opening: the book's shape and pose, and
 * where it is on screen. Returns what the painted book should do meanwhile,
 * or null while nothing is happening.
 */
export function frameBookOpening(
  o: BookOpening,
  b: EduBook,
  time: number
): EduOverride | null {
  const art = b.art;
  if (!art) return null;
  if (o.t <= 0 && o.hover < 0.003) return null;
  const t = o.t;
  // The finale, worked out first: the pose is the bird's from then on.
  const c = finC(o, t);
  const fin = c > 0;
  if (fin !== o.glFull) o.glFull = fin;
  ensureFit(o, b, art);
  if (fin) {
    const g = gripRest();
    finaleAt(o.fin, c, g, finalFraming(o, b, art).z, pitchOpen, o.small);
  }
  const { open, kk } = poseAt(o, b, art, t, time);
  project(lerp(-0.03, X0 - T, open), 0.02, 0, P3);
  o.cx = P3[0];
  o.cy = P3[1];
  o.size = art.h * kk;
  // (Brought nearer, as the scroll is at the last, its light is larger.)
  if (fin) o.size *= lerp(1, PV.D / P3[2], smoothstep(0, 1, c));
  if (t <= 0) return null;
  return {
    artAlpha: 1 - smoothstep(HANDOFF[0], HANDOFF[1], t),
    calm: calmAt(o, t),
    gather: t,
    cx: o.cx,
    cy: o.cy,
  };
}

/* ------------------------------------------------------------------ *
 * The live book
 * ------------------------------------------------------------------ */

function hide(o: BookOpening) {
  if (o.shown && o.canvas) {
    o.canvas.style.visibility = "hidden";
    o.shown = false;
  }
}

export function renderBookOpening(o: BookOpening, b: EduBook, time: number) {
  const art = b.art;
  const g = o.gl;
  if (!art || !g || o.t <= 0 || !ready(o)) {
    hide(o);
    return;
  }
  const t = o.t;
  const v = o.view;
  // The shape only changes while something is moving.
  const st = clamp(t, CRACK[0], SHAPE_END);
  const tu = leafTurnAt(o, t);
  // ...and once the bird has it, as the book goes into the parchment.
  const c = finC(o, t);
  const ff = o.fin.frame;
  const sh = o.fin.sheet;
  const sheetOn = c > 0 && ff.sheetOn;
  const fkey = sheetOn
    ? `${ff.bookOn ? 1 : 0}:${sh.flat}:${sh.lh}:${sh.ell}:${sh.parch ? 1 : 0}`
    : "";
  if (st !== o.builtAt || tu !== o.builtTurn || fkey !== o.builtSheet) {
    shapeAt(o, t);
    if (!sheetOn || ff.bookOn) {
      buildBookMesh(o.mesh, o.shape);
    } else {
      for (const k of PART_KEYS) o.mesh[k].reset();
    }
    if (sheetOn) {
      buildSheet(
        o.mesh,
        sh,
        o.shape.slabs[TURN_LEAF],
        o.shape.slabs[RIGHT_PAGE],
        o.shape.roll
      );
    }
    uploadBookMesh(g, o.mesh);
    slabSection(o.shape.slabs[TURN_LEAF], o.shape.roll, LEAF_N, v.leaf);
    o.builtAt = st;
    o.builtTurn = tu;
    o.builtSheet = fkey;
  }
  const R = PV.R;
  // Column-major for GL.
  v.R[0] = R[0];
  v.R[1] = R[3];
  v.R[2] = R[6];
  v.R[3] = R[1];
  v.R[4] = R[4];
  v.R[5] = R[7];
  v.R[6] = R[2];
  v.R[7] = R[5];
  v.R[8] = R[8];
  v.pivot[0] = PV.px;
  v.pivot[1] = PV.py;
  v.pivot[2] = PV.pz;
  v.T[0] = PV.tx;
  v.T[1] = PV.ty;
  v.T[2] = PV.tz;
  v.D = PV.D;
  v.F = PV.F;
  v.C[0] = PV.cx;
  v.C[1] = PV.cy;
  v.rotK[0] = PV.rc;
  v.rotK[1] = PV.rs;
  v.Q0[0] = PV.q0x;
  v.Q0[1] = PV.q0y;
  // The pool of key light moves from high on the cover near the spine to
  // over the open pages, and widens to take them both in.
  const a2 = easeInOutSine(span(t, 3.2, 8.3));
  v.pool[0] = lerp(-0.12, X0 - T, a2);
  v.pool[1] = lerp(0.2, 0.14, a2);
  v.pool[2] = lerp(0.62, 1.05, a2);
  v.pool[3] = lerp(0.78, 0.95, a2);
  // The cold edge light is what keeps the dark closed book apart from the
  // dark it hangs in; open, its pages do that, and the leather underneath
  // is better left in its own shadow.
  v.rim = 1 - 0.65 * ((1 - Math.cos(midTurn(t))) / 2);
  const warm = 0.2 * glowAt(t) + 0.25 * pulseAt(t);
  v.warm[0] = 1.0 * warm;
  v.warm[1] = 0.64 * warm;
  v.warm[2] = 0.3 * warm;
  const spill = 0.07 * spillAt(t);
  v.glow[0] = 1.0 * spill;
  v.glow[1] = 0.74 * spill;
  v.glow[2] = 0.44 * spill;
  // The spread, written into, and the light carried over it first.
  const p = t - OPEN_END;
  const ink = o.ink;
  v.inkOn = ink && p > 0 ? 1 : 0;
  if (ink) {
    const k = ink.inkTo - ink.inkFrom;
    v.inkT[0] = (p - ink.inkFrom) / k;
    v.inkT[1] = k;
    const k2 = ink.inkTo2 - ink.inkFrom2;
    v.inkT2[0] = (p - ink.inkFrom2) / k2;
    v.inkT2[1] = k2;
  }
  v.fade = educationFade(ink, p);
  candleAt(ink, p, time, CD);
  spreadPoint(o, CD[0], CD[1], PQ);
  v.candle[0] = PQ[0];
  v.candle[1] = PQ[1];
  v.candle[2] = CANDLE_R;
  v.candle[3] = p > 0 ? CANDLE_K * CD[2] : 0;
  // The turned leaf's shadow, from the key light as the book's own frame
  // has it (R takes the book to the world, so back is its transpose) --
  // and none while it lies flat, either side, nor until the gap under its
  // fore-edge is more than a hairline.
  const key = v.key;
  v.leafL[0] = R[0] * key[0] + R[3] * key[1] + R[6] * key[2];
  v.leafL[1] = R[1] * key[0] + R[4] * key[1] + R[7] * key[2];
  v.leafL[2] = R[2] * key[0] + R[5] * key[1] + R[8] * key[2];
  v.leafL[3] = smoothstep(0.03, 0.22, tu) * (1 - smoothstep(0.9, 1, tu));
  // The finale: the book going into the parchment, and the parchment's own
  // page, and its own candle.
  const fin = c > 0;
  v.squash = fin ? ff.squash : 0;
  v.dis[0] = fin ? ff.disL : 0;
  v.dis[1] = fin ? ff.disP : 0;
  v.fadeExp = fin ? ff.fadeExp : 0;
  v.ember = fin ? ff.ember : 0;
  v.book = !fin || ff.bookOn;
  v.sheetMap = fin && sh.parch ? "parch" : "paper";
  v.depthR = fin ? FIN_DEPTH : 1.9;
  const ct = o.contact;
  const pc = fin ? ff.contactP : -1;
  v.inkCOn = ct && pc > 0 ? 1 : 0;
  if (ct) {
    const k = ct.inkTo - ct.inkFrom;
    v.inkCT[0] = (pc - ct.inkFrom) / k;
    v.inkCT[1] = k;
    if (pc > 0) {
      contactCandle(ct, pc, time, CD);
      contactToSheet(CD[0], CD[1], PQ);
      v.candle[0] = XC + PQ[0];
      v.candle[1] = PQ[1];
      v.candle[2] = CONTACT_CANDLE_R;
      v.candle[3] = CONTACT_CANDLE_K * CD[2];
    }
  }
  drawBookGL(g, v);
  if (!o.shown && o.canvas) {
    o.canvas.style.visibility = "visible";
    o.shown = true;
  }
}

const CD = [0, 0, 0];
const PQ = [0, 0, 0];
const FP = [0, 0];

/**
 * A point of the written spread -- x from 0 at the left-hand page's outer
 * edge through 1 at the gutter to 2 at the right's, y 0..1 down from the
 * head, running on flat beyond the pages -- in book space, as the pages lie
 * open (whatever leaf is being turned over them). out: [x, y, z].
 */
function spreadPoint(o: BookOpening, sx: number, py: number, out: number[]) {
  const right = sx >= 1;
  const s = o.shape.slabs[right ? RIGHT_PAGE : LEFT_PAGE];
  // The face that looks up: the front on the right, the back on the left.
  const side = right ? 1 : -1;
  const px = right ? sx - 1 : sx;
  const u = side < 0 ? 1 - px : px;
  const uc = clamp(u, 0, 1);
  slabFacePoint(s, o.shape.roll, uc, side, FP);
  out[0] = FP[0] + (u - uc) * PL * side;
  out[1] = YP - py * 2 * YP;
  out[2] = FP[1];
}

/* ------------------------------------------------------------------ *
 * Light, and the motes it draws in (under the book)
 * ------------------------------------------------------------------ */

const IV = new Float64Array(6);

function ensurePalette(o: BookOpening, w: JourneyWorld) {
  if (o.palBank === w.bank) return;
  o.palBank = w.bank;
  o.pal = PALETTE.map((c) => w.bank.index(c[0], c[1], c[2]));
}

/** A few of the universe's own motes near the book, taken to be drawn in. */
function cueMotes(o: BookOpening, w: JourneyWorld, focal: number, time: number) {
  o.motesCued = true;
  const W = o.cssW;
  const H = o.cssH;
  const diag = Math.hypot(W, H);
  const cand: Array<{ i: number; s: number }> = [];
  for (let i = 0; i < w.inner.length; i++) {
    if (w.claimed[i]) continue;
    if (!viewInteriorMote(IV, w, i, focal, time)) continue;
    const x = IV[0];
    const y = IV[1];
    if (x < 0 || y < 0 || x > W || y > H || IV[5] < 0.1) continue;
    const d = Math.hypot(x - o.cx, y - o.cy) / diag;
    if (d < 0.14 || d > 0.55) continue;
    cand.push({ i, s: Math.min(IV[5], 0.9) * Math.exp(-(((d - 0.3) / 0.16) ** 2)) });
  }
  cand.sort((p, q) => q.s - p.s);
  const n = Math.min(cand.length, o.small ? 8 : 14);
  for (let k = 0; k < n; k++) {
    const i = cand[k].i;
    w.claimed[i] = 1;
    const r1 = hash(i * 1.37);
    const r2 = hash(i * 7.91 + 3);
    o.motes.push({
      i,
      delay: 0.2 + (1.2 * k) / n + 0.3 * r1,
      dur: 2.6 + 0.9 * r2,
      swirl: 0.7 + 0.6 * r1,
      px: NaN,
      py: NaN,
    });
  }
}

function releaseMotes(o: BookOpening, w: JourneyWorld) {
  for (const m of o.motes) {
    if (m.i < w.claimed.length) w.claimed[m.i] = 0;
  }
  o.motes.length = 0;
  o.motesCued = false;
}

function hash(x: number) {
  const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Radial glow, additive. */
function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  R: number,
  stops: Array<[number, number, number, number, number]>
) {
  if (R <= 1) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, R);
  for (const [at, r, gg, bb, a] of stops) {
    g.addColorStop(at, `rgba(${r},${gg},${bb},${Math.max(0, a).toFixed(4)})`);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(x - R, y - R, R * 2, R * 2);
}

/** On the universe's canvas, under the book: the light it stands in, and
 *  the motes of the universe being drawn in behind it. */
export function drawBookOpeningBack(
  ctx: CanvasRenderingContext2D,
  o: BookOpening,
  b: EduBook,
  w: JourneyWorld,
  focal: number,
  time: number
) {
  const t = o.t;
  if (t <= 0 && o.motesCued) releaseMotes(o, w);
  if (t <= 0 && o.hover < 0.003) return;
  const art = b.art;
  if (!art) return;
  ensurePalette(o, w);
  ctx.globalCompositeOperation = "lighter";
  const cx = o.cx;
  const cy = o.cy;
  const S = o.size;
  // The finale: the universe quieter, with a cold haze through it; and the
  // light the book stands in going with it.
  const fc = finC(o, t);
  const ff = o.fin.frame;
  if (fc > 0) drawHaze(ctx, o, ff.quiet, time);
  const fg = fc > 0 ? ff.glow : 1;
  if (t > 0) {
    // The faint warm light the closed book already stood in (drawEduBook
    // hands this over while it opens).
    const a = 0.13;
    glow(ctx, cx, cy, S * 0.9, [
      [0, 150, 92, 52, a],
      [0.45, 110, 62, 40, a * 0.45],
      [1, 60, 30, 40, 0],
    ]);
  }
  // And the golden one it wakes into.
  const a2 = easeInOutSine(span(t, 3.2, 8.3));
  const g = (glowAt(t) + 0.3 * pulseAt(t) + 0.35 * o.hover) * fg;
  if (g > 0.003) {
    glow(ctx, cx, cy, S * (1.0 + 0.4 * a2 + 0.2 * g), [
      [0, 255, 190, 112, 0.16 * g],
      [0.35, 220, 140, 72, 0.075 * g],
      [0.7, 140, 72, 52, 0.028 * g],
      [1, 80, 40, 40, 0],
    ]);
  }

  if (t <= 0) {
    ctx.globalCompositeOperation = "source-over";
    return;
  }
  // What of the bird is behind the book, under it.
  if (fc > 0 && birdHolds(fc)) {
    ctx.globalCompositeOperation = "source-over";
    drawBird(ctx, o.fin.bird, projectWorld, pxAt, PV.D, Math.min(window.devicePixelRatio || 1, 2), o.fin.birdScratch, birdSplit(o, fc), true);
    ctx.globalCompositeOperation = "lighter";
  }
  if (!o.motesCued && t > 0.15) cueMotes(o, w, focal, time);
  const sprites = w.bank.sprites;
  for (const m of o.motes) {
    if (!viewInteriorMote(IV, w, m.i, focal, time)) continue;
    const p = span(t, m.delay, m.delay + m.dur);
    const e = easeInOutCubic(p);
    const rx = IV[0] - cx;
    const ry = IV[1] - cy;
    const ang = m.swirl * e;
    const s = 1 - 0.93 * e;
    const x = cx + (rx * Math.cos(ang) - ry * Math.sin(ang)) * s;
    const y = cy + (rx * Math.sin(ang) + ry * Math.cos(ang)) * s;
    const a = IV[5] * (1 + 0.9 * Math.sin(Math.PI * p)) * (1 - smoothstep(0.75, 1, p));
    const r = IV[4] * (1 + 0.25 * Math.sin(Math.PI * p));
    const heat = smoothstep(0.25, 0.85, p);
    const px = Number.isNaN(m.px) ? x : m.px;
    const py = Number.isNaN(m.py) ? y : m.py;
    if (a > 0.01) {
      if (heat < 0.999) {
        blitGlow(ctx, sprites[w.inner[m.i].spr], x, y, px, py, r, a * (1 - heat));
      }
      if (heat > 0.001) blitGlow(ctx, sprites[o.pal[C_GOLD]], x, y, px, py, r, a * heat);
    }
    m.px = x;
    m.py = y;
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

/** The haze that comes up through the universe as it quiets for the
 *  finale: a few broad, slow drifts of cold light, and the edges of the
 *  frame gone a little darker. */
function drawHaze(
  ctx: CanvasRenderingContext2D,
  o: BookOpening,
  q: number,
  time: number
) {
  if (q < 0.004) return;
  const W = o.cssW;
  const H = o.cssH;
  const R = Math.max(W, H);
  ctx.globalCompositeOperation = "source-over";
  const vg = ctx.createRadialGradient(W / 2, H / 2, R * 0.25, W / 2, H / 2, R * 0.75);
  vg.addColorStop(0, "rgba(10,7,6,0)");
  vg.addColorStop(1, `rgba(10,7,6,${(0.38 * q).toFixed(4)})`);
  ctx.globalAlpha = 1;
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 4; i++) {
    const ph = i * 1.7;
    const x = W * (0.5 + 0.36 * Math.sin(time * 0.031 + ph) * (i % 2 ? 1 : -1));
    const y = H * (0.5 + 0.3 * Math.cos(time * 0.026 + ph * 1.3));
    const r = R * (0.32 + 0.08 * i);
    const a = (0.022 + 0.008 * Math.sin(time * 0.11 + ph)) * q;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(92,84,150,${a.toFixed(4)})`);
    g.addColorStop(0.5, `rgba(70,60,120,${(a * 0.45).toFixed(4)})`);
    g.addColorStop(1, "rgba(50,40,90,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/* ------------------------------------------------------------------ *
 * Dust, and light out of the pages (over the book)
 * ------------------------------------------------------------------ */

const TIP = [0, 0, 0];
const PT = [0, 0];

function spawn(
  o: BookOpening,
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
  r: number,
  a: number,
  c: number
) {
  if (o.dust.length >= (o.small ? 90 : 170)) return;
  o.dust.push({
    x,
    y,
    vx,
    vy,
    age: 0,
    life,
    r,
    a,
    c,
    ph: Math.random() * Math.PI * 2,
    tw: 1.2 + Math.random() * 2.2,
    sway: (0.4 + Math.random() * 0.8) * (Math.random() < 0.5 ? -1 : 1),
  });
}

/** How many to let go this frame, at `rate` a second. */
function due(o: BookOpening, slot: number, rate: number, dt: number) {
  o.emit[slot] += rate * dt;
  const n = Math.floor(o.emit[slot]);
  o.emit[slot] -= n;
  return n;
}

function emitDust(o: BookOpening, dt: number) {
  const t = o.t;
  const shape = o.shape;
  const slabs = shape.slabs;
  const roll = shape.roll;
  const sc = o.size / 450;
  const rnd = Math.random;
  const cover = shape.cover;
  // The front board's hinge, wherever the spine has taken it.
  const hx = X0 - 2 * T * Math.sin(roll);
  const hz = -T + 2 * T * Math.cos(roll);
  const dx = Math.cos(cover);
  const dz = Math.sin(cover);
  // What it sheds as it opens goes by the clock, so there is as much of it
  // however quickly the clock runs.
  const dtc = dt * paceAt(t);

  // As the board comes away: dust from the gap, all along its edge.
  if (t > 2.55 && t < 3.8) {
    for (let n = due(o, 0, 10, dtc); n > 0; n--) {
      const u = BW * (0.45 + 0.55 * rnd());
      project(hx + u * dx, -0.46 + 0.92 * rnd(), hz + u * dz, P3);
      spawn(o, P3[0], P3[1], (rnd() - 0.5) * 16 * sc, -(4 + rnd() * 12) * sc, 2.4 + rnd() * 2, 0.7 + rnd() * 0.9, 0.35 + rnd() * 0.35, rnd() < 0.5 ? C_GOLD : C_WARM);
    }
  }
  // Off the board's edge as it goes over.
  if (t > SWING0 && t < SWING0 + COVER_SWING) {
    for (let n = due(o, 1, 7, dtc); n > 0; n--) {
      project(hx + BW * dx, -0.48 + 0.96 * rnd(), hz + BW * dz, P3);
      spawn(o, P3[0], P3[1], (rnd() - 0.5) * 10 * sc, -(2 + rnd() * 8) * sc, 2.2 + rnd() * 2, 0.6 + rnd() * 0.8, 0.3 + rnd() * 0.3, C_WARM);
    }
  }
  // Off the loose leaves as they turn, and wherever anything comes down.
  for (let k = NSTACK; k < NSTACK + NFLUTTER + NSHEAF; k++) {
    const s = slabs[k];
    const flutter = k < NSTACK + NFLUTTER;
    const prev = o.lastTurn[k];
    o.lastTurn[k] = s.turn;
    if (flutter && s.turn > 0.08 && s.turn < Math.PI - 0.08) {
      for (let n = due(o, 2 + ((k - NSTACK) % 3), 3.2, dtc); n > 0; n--) {
        slabTip(s, roll, TIP);
        project(TIP[0], -0.44 + 0.88 * rnd(), TIP[1], P3);
        spawn(o, P3[0], P3[1], (rnd() - 0.5) * 12 * sc, -(3 + rnd() * 9) * sc, 2 + rnd() * 1.8, 0.6 + rnd() * 0.8, 0.35 + rnd() * 0.3, rnd() < 0.6 ? C_PALE : C_GOLD);
      }
    }
    const land = Math.PI - 0.05;
    if (prev < land && s.turn >= land) {
      const count = flutter ? 6 : 2;
      for (let n = 0; n < count; n++) {
        slabPoint(s, roll, 0.45 + 0.55 * rnd(), PT);
        project(PT[0], -0.44 + 0.88 * rnd(), PT[1] + 0.01, P3);
        spawn(o, P3[0], P3[1], (rnd() - 0.5) * 18 * sc, -(6 + rnd() * 14) * sc, 2.6 + rnd() * 2.2, 0.6 + rnd() * 1, 0.35 + rnd() * 0.35, rnd() < 0.5 ? C_PALE : C_WARM);
      }
    }
  }
  // Once it lies open, the motes that rise off the pages and never stop --
  // until the bird takes it, and the finale has motes of its own.
  const fc = finC(o, t);
  const kept = fc > 0 ? 1 - finaleTakeover(fc) : 1;
  if (t > 6.6 && kept > 0.001) {
    const rate = (o.small ? 0.8 : 1.4) * smoothstep(6.6, 8.0, t) * kept;
    for (let n = due(o, 5, rate, dt); n > 0; n--) {
      const s = rnd() < 0.5 ? slabs[NSTACK - 1] : slabs[NSTACK + NFLUTTER];
      slabPoint(s, roll, 0.12 + 0.82 * rnd(), PT);
      project(PT[0], -0.42 + 0.84 * rnd(), PT[1] + 0.015, P3);
      spawn(o, P3[0], P3[1], (rnd() - 0.5) * 4 * sc, -(4 + rnd() * 8) * sc, 5 + rnd() * 3.5, 0.7 + rnd() * 1.1, 0.25 + rnd() * 0.4, rnd() < 0.55 ? C_GOLD : rnd() < 0.5 ? C_PALE : C_EMBER);
    }
  }
  // The leaf turned once the spread has been read: a breath of dust from
  // under it as it lifts away from the page, more off its free edge as it
  // goes over, and a little where it comes down.
  const leaf = slabs[TURN_LEAF];
  const tu = leafTurnAt(o, t);
  const was = o.lastTurn[TURN_LEAF];
  o.lastTurn[TURN_LEAF] = leaf.turn;
  if (tu > 0.03 && tu < 0.32) {
    for (let n = due(o, 8, o.small ? 2.5 : 4.5, dt); n > 0; n--) {
      slabPoint(leaf, roll, 0.3 + 0.65 * rnd(), PT);
      project(PT[0], -0.44 + 0.88 * rnd(), PT[1] - 0.004, P3);
      spawn(o, P3[0], P3[1], (rnd() - 0.5) * 8 * sc, -(3 + rnd() * 7) * sc, 2.6 + rnd() * 2, 0.5 + rnd() * 0.7, 0.3 + rnd() * 0.3, rnd() < 0.6 ? C_PALE : C_GOLD);
    }
  }
  if (tu > 0.2 && tu < 0.9 && leaf.turn < Math.PI - 0.06) {
    for (let n = due(o, 9, 3.4, dt); n > 0; n--) {
      slabTip(leaf, roll, TIP);
      project(TIP[0], -0.44 + 0.88 * rnd(), TIP[1], P3);
      spawn(o, P3[0], P3[1], (rnd() - 0.5) * 12 * sc, -(3 + rnd() * 9) * sc, 2 + rnd() * 1.8, 0.6 + rnd() * 0.8, 0.35 + rnd() * 0.3, rnd() < 0.6 ? C_PALE : C_GOLD);
    }
  }
  if (was < Math.PI - 0.05 && leaf.turn >= Math.PI - 0.05) {
    for (let n = 0; n < (o.small ? 5 : 9); n++) {
      slabPoint(leaf, roll, 0.35 + 0.65 * rnd(), PT);
      project(PT[0], -0.44 + 0.88 * rnd(), PT[1] + 0.01, P3);
      spawn(o, P3[0], P3[1], (rnd() - 0.5) * 18 * sc, -(6 + rnd() * 14) * sc, 2.6 + rnd() * 2.2, 0.6 + rnd() * 1, 0.35 + rnd() * 0.35, rnd() < 0.5 ? C_PALE : C_WARM);
    }
  }
  // While the pages are written: now and then a mote lifts off the wet
  // ink, or is caught in the candlelight going by. Never many.
  const ink = o.ink;
  const p = t - OPEN_END;
  // And as Education fades, a few lift off what is left of it.
  const fade = educationFade(ink, p);
  if (ink && fade > 0.02 && fade < 0.95) {
    for (let n = due(o, 10, o.small ? 1.2 : 2.4, dt); n > 0; n--) {
      // (A stroke of it: the left-hand page's, x under 1.)
      let s = ink.strokes[Math.floor(rnd() * ink.strokes.length)];
      for (let k = 0; k < 6 && s.x1 > 1; k++) {
        s = ink.strokes[Math.floor(rnd() * ink.strokes.length)];
      }
      if (s.x1 > 1) continue;
      spreadPoint(o, s.x0 + (s.x1 - s.x0) * rnd(), s.y + (rnd() - 0.5) * 0.02, PQ);
      project(PQ[0], PQ[1], PQ[2] + 0.004, P3);
      spawn(o, P3[0], P3[1], (rnd() - 0.5) * 4 * sc, -(2 + rnd() * 5) * sc, 3 + rnd() * 2.5, 0.4 + rnd() * 0.5, 0.25 + rnd() * 0.3, rnd() < 0.6 ? C_GOLD : C_PALE);
    }
  }
  // The last page, as it is written: the same pen, the same light.
  const ct = o.contact;
  const pc = fc > 0 ? o.fin.frame.contactP : -1;
  if (ct && pc > 0 && pc < ct.written + 0.5) {
    const pens = contactPens(ct, pc, o.pens);
    if (pens > 0) {
      for (let n = due(o, 6, o.small ? 1 : 1.7, dt); n > 0; n--) {
        const k = Math.floor(rnd() * pens);
        contactToSheet(o.pens[k * 2] + (rnd() - 0.6) * 0.012, o.pens[k * 2 + 1] + (rnd() - 0.5) * 0.02, PQ);
        sheetPoint(PQ[0], PQ[1], TIP);
        project(TIP[0], TIP[1], TIP[2] + 0.004, P3);
        spawn(o, P3[0], P3[1], (rnd() - 0.5) * 5 * sc, -(3 + rnd() * 6) * sc, 2.4 + rnd() * 2, 0.4 + rnd() * 0.45, 0.3 + rnd() * 0.3, rnd() < 0.6 ? C_GOLD : C_PALE);
      }
    }
    contactCandle(ct, pc, 0, CD);
    if (CD[2] > 0.15) {
      for (let n = due(o, 7, (o.small ? 0.6 : 1.1) * CD[2], dt); n > 0; n--) {
        contactToSheet(CD[0] + (rnd() - 0.5) * 0.2, CD[1] + (rnd() - 0.5) * 0.35, PQ);
        sheetPoint(PQ[0], PQ[1], TIP);
        project(TIP[0], TIP[1], TIP[2] + 0.02 + rnd() * 0.04, P3);
        spawn(o, P3[0], P3[1], (rnd() - 0.5) * 6 * sc, -(2 + rnd() * 5) * sc, 3 + rnd() * 2.5, 0.35 + rnd() * 0.45, 0.22 + rnd() * 0.25, rnd() < 0.5 ? C_WARM : C_GOLD);
      }
    }
  }
  if (ink && p > 0 && p < ink.written + 0.5) {
    const pens = pensAt(ink, p, o.pens);
    if (pens > 0) {
      for (let n = due(o, 6, o.small ? 1 : 1.7, dt); n > 0; n--) {
        const k = Math.floor(rnd() * pens);
        spreadPoint(o, o.pens[k * 2] + (rnd() - 0.6) * 0.03, o.pens[k * 2 + 1] + (rnd() - 0.5) * 0.02, PQ);
        project(PQ[0], PQ[1], PQ[2] + 0.004, P3);
        spawn(o, P3[0], P3[1], (rnd() - 0.5) * 5 * sc, -(3 + rnd() * 6) * sc, 2.4 + rnd() * 2, 0.4 + rnd() * 0.45, 0.3 + rnd() * 0.3, rnd() < 0.6 ? C_GOLD : C_PALE);
      }
    }
    candleAt(ink, p, 0, CD);
    if (CD[2] > 0.15) {
      for (let n = due(o, 7, (o.small ? 0.6 : 1.1) * CD[2], dt); n > 0; n--) {
        spreadPoint(o, CD[0] + (rnd() - 0.5) * 0.4, CD[1] + (rnd() - 0.5) * 0.35, PQ);
        project(PQ[0], PQ[1], PQ[2] + 0.02 + rnd() * 0.04, P3);
        spawn(o, P3[0], P3[1], (rnd() - 0.5) * 6 * sc, -(2 + rnd() * 5) * sc, 3 + rnd() * 2.5, 0.35 + rnd() * 0.45, 0.22 + rnd() * 0.25, rnd() < 0.5 ? C_WARM : C_GOLD);
      }
    }
  }
}

/** Over the book: light out of its pages, and its dust. */
export function drawBookOpeningFront(
  ctx: CanvasRenderingContext2D,
  o: BookOpening,
  b: EduBook,
  w: JourneyWorld,
  time: number
) {
  const dt = clamp(time - o.lastTime, 0, 0.05);
  o.lastTime = time;
  const t = o.t;
  // Going on, or come to rest -- not shutting.
  const forward = t >= o.lastT;
  o.lastT = t;
  if (t <= 0) {
    o.dust.length = 0;
    return;
  }
  const art = b.art;
  if (!art || !ready(o)) return;
  ensurePalette(o, w);
  ctx.globalCompositeOperation = "lighter";

  // Light out of the pages: first at the gap, then over the open spread.
  const spill = spillAt(t);
  if (spill > 0.003) {
    const q = easeInOutSine(span(t, 3.4, 6.6));
    project(lerp(X0 + 0.72 * BW, X0 - T, q), 0.04, lerp(T, 0.02, q), P3);
    const S = o.size;
    glow(ctx, P3[0], P3[1], S * (0.42 + 0.3 * q), [
      [0, 255, 214, 160, 0.05 * spill],
      [0.5, 255, 178, 108, 0.03 * spill],
      [1, 255, 150, 90, 0],
    ]);
  }
  // As the right-hand leaf lifts away, a little of that light comes out
  // from under it too, from the page it laid bare -- gone again by the
  // time it has gone over.
  const breath = Math.sin(Math.PI * span(leafTurnAt(o, t), 0.04, 0.62));
  if (breath > 0.003) {
    slabPoint(o.shape.slabs[TURN_LEAF], o.shape.roll, 0.6, PT);
    project(Math.max(PT[0], X0 + 0.12), 0.03, PT[1] * 0.5, P3);
    glow(ctx, P3[0], P3[1], o.size * 0.4, [
      [0, 255, 214, 160, 0.045 * breath],
      [0.5, 255, 178, 108, 0.025 * breath],
      [1, 255, 150, 90, 0],
    ]);
  }

  if (forward) emitDust(o, dt);
  const sprites = w.bank.sprites;
  const dust = o.dust;
  let n = 0;
  for (let i = 0; i < dust.length; i++) {
    const d = dust[i];
    d.age += dt;
    if (d.age >= d.life) continue;
    const drag = Math.exp(-dt * 0.9);
    d.vx *= drag;
    d.vy = d.vy * drag - 3.5 * dt * (o.size / 450);
    d.x += d.vx * dt + Math.sin(time * 0.9 + d.ph) * d.sway * dt * 6;
    d.y += d.vy * dt;
    const env = smoothstep(0, 0.4, d.age) * (1 - smoothstep(d.life * 0.5, d.life, d.age));
    const tw = 0.7 + 0.3 * Math.sin(time * d.tw + d.ph);
    const a = d.a * env * tw;
    if (a > 0.01) {
      blitGlow(ctx, sprites[o.pal[d.c]], d.x, d.y, d.x - d.vx * 0.03, d.y - d.vy * 0.03, d.r, a);
    }
    dust[n++] = d;
  }
  dust.length = n;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  // The finale: what the book gives up, and the bird.
  const fc = finC(o, t);
  if (fc > 0) {
    STAGE.size = o.size;
    STAGE.small = o.small;
    drawFinaleMotes(ctx, o.fin, w, o.pal, STAGE, forward ? dt : 0, time);
    drawBird(ctx, o.fin.bird, projectWorld, pxAt, PV.D, Math.min(window.devicePixelRatio || 1, 2), o.fin.birdScratch, birdSplit(o, fc), false);
    placeLinks(o);
  } else {
    o.fin.motes.length = 0;
    o.links.fill(null);
  }
}

/** How far off the book is where the bird stands on it or holds it: what
 *  of the bird is further than that is behind it. */
function birdSplit(o: BookOpening, c: number) {
  if (!birdHolds(c)) return Infinity;
  const g = o.fin.frame.grip;
  projectWorld(g[0], g[1], g[2], P3);
  return P3[2] + 0.02;
}

/** What the finale's motes see of the stage: the book, and the world. */
const STAGE: FinaleStage = {
  book: (x, y, z, out) => project(x, y, z, out),
  world: (x, y, z, out) => projectWorld(x, y, z, out),
  size: 450,
  small: false,
};

const LK = [0, 0, 0];
const LS = [0, 0];

/** Where each address on the last page is on screen, once it has been
 *  written and the scroll lies open and still: for the links over them. */
function placeLinks(o: BookOpening) {
  const ct = o.contact;
  const ff = o.fin.frame;
  for (let i = 0; i < o.links.length; i++) {
    const l = ct?.links[i];
    if (!ct || !l || ff.open < 0.999 || ff.contactP < l.at) {
      o.links[i] = null;
      continue;
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [u, v] of [
      [l.u0, l.v0],
      [l.u1, l.v0],
      [l.u0, l.v1],
      [l.u1, l.v1],
    ]) {
      contactToSheet(u, v, LS);
      sheetPoint(LS[0], LS[1], LK);
      project(LK[0], LK[1], LK[2], P3);
      x0 = Math.min(x0, P3[0]);
      y0 = Math.min(y0, P3[1]);
      x1 = Math.max(x1, P3[0]);
      y1 = Math.max(y1, P3[1]);
    }
    o.links[i] = [x0, y0, x1 - x0, y1 - y0];
  }
}

/** The last page's addresses on screen (null where there is none yet), and
 *  where each goes. */
export function contactLinks(o: BookOpening) {
  return o.links;
}

