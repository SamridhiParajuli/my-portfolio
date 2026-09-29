/**
 * blackHoleJourney
 * ----------------
 * The second half of the portal's scroll timeline: the settled galaxy stops
 * being a flat 2D formation and becomes the near dust of a real 3D volume
 * the camera flies through, toward a black hole that has been sitting far
 * ahead in that same volume the whole time.
 *
 * The one hard rule this module exists to protect: at journey progress 0 it
 * must draw *exactly* what the existing 2D galaxy render draws. That is
 * guaranteed structurally rather than by tuning --
 *
 *   - every galaxy particle's world position is derived by un-projecting its
 *     own 2D screen position through its assigned depth, so at the camera's
 *     origin the perspective divide cancels out to the identity;
 *   - the per-particle size factor is `z / (z - camZ)`, which is exactly 1
 *     when camZ is 0;
 *   - the camera path, its lateral pan and its motion-streak length all
 *     start at literal zero;
 *   - everything that is *new* (black hole, disc, jets, star fields) is
 *     multiplied by a `presence` ramp that is 0 at progress 0.
 *
 * So the handoff between the two render paths is a frame-for-frame match --
 * there is no boundary, no second background and no section change, just the
 * same universe with the camera finally allowed to move.
 *
 * World units are multiples of UNIT (the projection's focal length, itself
 * tied to viewport height), so the whole environment scales with the screen.
 */

/** Matches the wrapper's CSS backdrop -- what "empty space" already looks
 *  like, so occluding with it is indistinguishable from drawing nothing. */
const BG = [16, 11, 7] as const;

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ *
 * Camera path
 * ------------------------------------------------------------------ */

/** Journey progress at which the camera reaches the event horizon. */
export const CROSS_T = 0.87;
/** Exponent on the approach: the fall accelerates, as a fall should. */
const CAM_POW = 2.3;
/** How much further the camera cruises past the horizon, in UNIT. */
const DEEP_TRAVEL = 5.5;
/** Peak height above the disc plane mid-approach, in UNIT -- the camera
 *  rises over the disc, then settles back down through it on arrival. */
const SWOOP_Y = 3.2;
/** Matching lateral drift, so the approach reads as flown, not railed. */
const SWAY_X = 1.6;
/** Journey-progress lookback used to derive motion streaks. */
const STREAK_DT = 0.0014;

/* --- the interior leg --------------------------------------------- *
 * Scroll distance appended *past* where this journey used to end, so every
 * t in 0..1 still resolves to exactly the scroll position, camera and frame
 * it always did -- the original curve below is reproduced literally and the
 * continuation only picks up where it stopped. It exists because the fall
 * previously came to rest a few UNIT inside the hole, which is nowhere near
 * enough room to travel meaningfully deeper.
 */
/** Extra journey-t the interior adds past the original end at t = 1. */
export const DEEP_SPAN = 0.85;
/** How much further the camera falls through it, in UNIT. */
const INNER_TRAVEL = 26;
/** How much of that motion is flat cruise rather than the ease that shapes
 *  it. The original curve has already decelerated to a standstill by t = 1,
 *  so a pure ease-in on top of that would leave a long stretch of scroll
 *  where nothing moves at all; this keeps the fall picking straight back up
 *  and still lets it settle at the very bottom. */
const INNER_LINEAR = 0.4;
/** Drift across and above the axis through the interior, in UNIT. Both are
 *  ramped from nothing, value *and* slope, so the camera can never lurch
 *  sideways at the handover. */
const INNER_SWAY = 1.15;
const INNER_RISE = 0.8;

/* --- coming to rest ------------------------------------------------ *
 * The fall above still has speed at its last frame (its linear share), and
 * until there was anything past it that never showed: the scroll simply ran
 * out. Now the Education leg carries on from there, and a camera that
 * stopped dead at the join would read as a hitch. So past the end it glides
 * to a halt instead, carrying the exact velocity *and* deceleration the fall
 * ends on (which is what fixes the glide's length) down to nothing.
 */
/** Journey-t over which the glide happens. */
export const SETTLE_SPAN =
  (INNER_LINEAR * DEEP_SPAN) / (3 * (1 - INNER_LINEAR));
/** Depth speed (UNIT per journey-t) the fall ends on. */
const SETTLE_V = (INNER_TRAVEL * INNER_LINEAR) / DEEP_SPAN;
/** Distance covered by a glide from speed 1 that falls away as (1 - s)^2,
 *  s the share of the glide done -- smooth to rest in value, speed and
 *  deceleration alike. */
function glide(t: number) {
  const s = clamp((t - 1 - DEEP_SPAN) / SETTLE_SPAN, 0, 1);
  return (SETTLE_SPAN * (1 - (1 - s) ** 3)) / 3;
}

/* ------------------------------------------------------------------ *
 * Black hole geometry (all in UNIT)
 * ------------------------------------------------------------------ */

const BH_Z = 32;
/** Where the event horizon sits along the journey's axis, in UNIT -- what
 *  anything placed inside the hole measures its own depth against. */
export const HORIZON_Z = BH_Z;
/** Shadow radius -- also the Einstein radius the lensing uses, so nothing
 *  behind the hole can ever be imaged inside its silhouette. */
const R_SH = 0.85;
// Inner edge stands clear of the silhouette, so the darkness reads as a
// void the material orbits rather than a hole punched in a bright disc.
const R_IN = R_SH * 1.95;
const R_OUT = R_SH * 6.1;
/** Disc inclination away from perfectly edge-on, and a roll so the whole
 *  system sits at a natural angle rather than axis-aligned. */
const TILT = 0.3;
const ROLL = -0.16;
const COS_T = Math.cos(TILT);
const SIN_T = Math.sin(TILT);
const COS_R = Math.cos(ROLL);
const SIN_R = Math.sin(ROLL);
/** Orbital speed at the inner edge (rad/s); everything outside follows
 *  Kepler's r^-3/2, which is what makes the disc shear into filaments. */
const OMEGA_IN = 0.26;
/** Doppler beaming strength -- the approaching limb outshining the
 *  receding one is the single most recognisable thing about a real
 *  accretion disc. */
const BEAM_BETA = 0.42;

const NEAR_CLIP = 0.05;

/* ------------------------------------------------------------------ *
 * Interior medium (all in UNIT, relative to the horizon)
 * ------------------------------------------------------------------ */

// Past the horizon the ordinary field thins to almost nothing -- it was
// built to be seen from outside, and by the time the camera is this deep
// only a handful of its motes are still ahead and on screen. So the
// interior has a medium of its own: a slowly turning column of matter the
// camera falls down the middle of, warm at the mouth and colder and
// stranger with depth.
const INNER_Z0 = 2.6;
const INNER_Z1 = 46;
/** Hollow core -- nothing is placed inside this radius, so the way ahead
 *  stays dark and anything standing in it is never buried in dust. */
const INNER_R_IN = 1.2;
const INNER_R_OUT = 7.4;
/** Radians of twist per UNIT of depth: the column winds, so falling
 *  through it reads as a descent rather than a slide down a pipe. */
const INNER_TWIST = 0.17;
/** Depth (UNIT past the horizon) between which the medium fades up. It
 *  begins just short of the horizon, so the inside is already forming ahead
 *  of the camera as it crosses: the environment has to *become* the interior
 *  rather than be swapped for it, and a medium that only started several
 *  UNIT in would leave a stretch of nothing to cross first. It is still far
 *  too faint at the crossing itself to collide with the lensing releasing
 *  there -- by the time it carries the frame, the hole has let go. */
const INNER_FADE_0 = -0.8;
const INNER_FADE_1 = 5.5;

/* ------------------------------------------------------------------ *
 * The approach medium (all in UNIT)
 * ------------------------------------------------------------------ */

// The run in to the hole used to be the emptiest stretch of the whole
// journey: ordinary field matter is held clear of the hole's neighbourhood,
// so over the last several UNIT there was nothing left beside the camera and
// the approach could only read as the silhouette scaling up. This is the
// matter that fills it. Two things make it travel rather than decoration:
// it stands beside the camera's *own path*, so it genuinely sweeps past the
// lens, and no mote is visible until the camera is close to it, so what
// changes on the way in is how much matter is near enough to see -- which is
// what moving through a volume actually looks like.
const FLUX_Z0 = 2.5;
const FLUX_Z1 = BH_Z + 1.5;
/** Radii off the path. The inner one is what keeps the way ahead clear. */
const FLUX_R_IN = 0.34;
const FLUX_R_OUT = 3.4;
/** How far the corridor narrows by the time it reaches the hole -- the same
 *  matter, funnelled, so it is densest and fastest where the fall is. */
const FLUX_FUNNEL = 0.44;
/** Distances (UNIT) over which a mote surfaces out of the dark as the
 *  camera closes on it. Never a global fade: there is no frame at which
 *  "the medium appeared". */
const FLUX_ACT = [8.5, 4.5] as const;
/** ...and the camera depth over which the layer exists at all, so the
 *  gateway's opening frames are exactly the ones they always were. */
const FLUX_GATE = [2, 7.5] as const;

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

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

/** mulberry32 -- deterministic build-time randomness, so the same viewport
 *  always rebuilds the same universe. */
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

/** Sum of three uniforms -- a cheap bell curve in [-1, 1], used wherever a
 *  scatter should cluster around zero instead of filling its range flatly. */
function bell(rng: () => number) {
  return (rng() + rng() + rng() - 1.5) / 1.5;
}

/* ------------------------------------------------------------------ *
 * Glow sprite bank
 * ------------------------------------------------------------------ */

const SPRITE_PX = 96;
/** Half-width the sprite is drawn at, per unit of requested core radius. The
 *  gradient's bright core sits inside the middle third and the rest is the
 *  bloom that lets overlapping particles brighten each other. Kept as tight
 *  as the profile allows: blits are the whole cost of this render, and every
 *  particle pays for the full square, most of which is near-transparent
 *  tail. */
const SPRITE_SPREAD = 3.2;
/** Below this a blit is not worth its fill -- on a dark field it is already
 *  indistinguishable from nothing. */
const MIN_ALPHA = 0.012;

/**
 * Level of detail. Every particle carries a stable `lod` rank in 0..1, and
 * each pass works out what fraction of its population is worth drawing at
 * the current distance; anything ranked above that fraction is dropped,
 * with a fade band at the cut so nothing blinks. What survives is brightened
 * to make up for what did not, which keeps the integrated glow of a distant
 * structure the same while spending a fraction of the draw calls on it.
 *
 * This is the whole performance story of this render: cost here is one draw
 * call per visible particle, so drawing two thousand sub-pixel points into a
 * hundred-pixel smudge is the one thing that must never happen.
 */
/** Distance (in UNIT) beyond which field matter starts thinning out. */
const LOD_FIELD_REF = 10;
const LOD_FIELD_MIN = 0.16;
/** Apparent radius (px) below which the disc starts thinning out. */
const LOD_DISC_REF = 420;
const LOD_DISC_MIN = 0.2;

function lodFade(lod: number, f: number) {
  if (lod > f) return 0;
  return 1 - smoothstep(f * 0.82, f, lod);
}

function makeSprite(r: number, g: number, b: number) {
  const c = document.createElement("canvas");
  c.width = SPRITE_PX;
  c.height = SPRITE_PX;
  const sctx = c.getContext("2d");
  if (!sctx) return c;
  const h = SPRITE_PX / 2;
  const grad = sctx.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.156, `rgba(${r},${g},${b},0.82)`);
  grad.addColorStop(0.344, `rgba(${r},${g},${b},0.3)`);
  grad.addColorStop(0.7, `rgba(${r},${g},${b},0.055)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  return c;
}

/**
 * Thousands of additive glow points per frame are far too many to draw as
 * per-particle gradients (or even as the legacy three-arc stack), so every
 * distinct colour is baked once into a small radial-gradient sprite and
 * blitted afterwards. Colours are quantised so a few dozen sprites cover
 * the whole environment.
 */
class SpriteBank {
  private map = new Map<number, number>();
  readonly sprites: HTMLCanvasElement[] = [];

  index(r: number, g: number, b: number) {
    const qr = Math.round(clamp(r, 0, 255) / 8);
    const qg = Math.round(clamp(g, 0, 255) / 8);
    const qb = Math.round(clamp(b, 0, 255) / 8);
    const key = (qr << 12) | (qg << 6) | qb;
    const hit = this.map.get(key);
    if (hit !== undefined) return hit;
    const idx = this.sprites.length;
    this.sprites.push(makeSprite(qr * 8, qg * 8, qb * 8));
    this.map.set(key, idx);
    return idx;
  }
}

/* ------------------------------------------------------------------ *
 * Particle kinds
 * ------------------------------------------------------------------ */

/** Disc material -- orbits, so its world position is recomputed per frame. */
type DiscP = {
  r0: number;
  th0: number;
  hy: number;
  om: number;
  spr: number;
  lum: number;
  size: number;
  turb: number;
  tph: number;
  /** 0 at the inner edge, 1 at the outer -- drives colour and brightness. */
  u: number;
  lod: number;
};

/** Everything that just sits in space: star fields, jets. */
type FieldP = {
  wx: number;
  wy: number;
  wz: number;
  spr: number;
  lum: number;
  size: number;
  tw: number;
  tph: number;
  lod: number;
};

/** Plasma bound to the hole on randomly-inclined orbits -- the cloud the
 *  camera actually ploughs through on the way in, at every depth rather
 *  than confined to the disc plane. */
type ShellP = {
  ux: number;
  uy: number;
  uz: number;
  vx: number;
  vy: number;
  vz: number;
  rad: number;
  ph: number;
  om: number;
  spr: number;
  lum: number;
  size: number;
};

/** Approach medium -- swirls around the point of the camera's path it
 *  stands beside, so recomputed per frame. */
type FluxP = {
  /** The path point this mote keeps station on. */
  px: number;
  py: number;
  wz: number;
  rad: number;
  ang: number;
  om: number;
  /** Radial breathing, so the corridor churns instead of turning rigidly. */
  br: number;
  spr: number;
  lum: number;
  size: number;
  lod: number;
};

/** Interior medium -- turns around the axis, so recomputed per frame. */
type InnerP = {
  rad: number;
  ang: number;
  wz: number;
  om: number;
  /** Radial breathing, so the column churns instead of spinning rigidly. */
  br: number;
  bph: number;
  spr: number;
  lum: number;
  size: number;
  tw: number;
  tph: number;
  lod: number;
};

export type JourneyWorld = {
  unit: number;
  cx: number;
  cy: number;
  bhX: number;
  bhY: number;
  bhZ: number;
  rSh: number;
  rIn: number;
  /** Screen direction of the disc's approaching limb, for the photon ring's
   *  angular brightness. */
  beamAngle: number;
  disc: DiscP[];
  shell: ShellP[];
  mid: FieldP[];
  deep: FieldP[];
  jet: FieldP[];
  inner: InnerP[];
  /** Interior motes something else has taken out of the medium and is now
   *  drawing itself (1) -- the ones the Education book is made from. All 0
   *  until then, so the medium draws exactly as it always has. */
  claimed: Uint8Array;
  flux: FluxP[];
  bank: SpriteBank;
};

/* ------------------------------------------------------------------ *
 * Colour ramps
 * ------------------------------------------------------------------ */

/** Inner disc runs white-hot and cools outward -- the temperature gradient
 *  is what stops the disc reading as one flat orange band. */
function discColor(u: number): [number, number, number] {
  const stops: Array<[number, number, number, number]> = [
    [0, 255, 248, 232],
    [0.18, 255, 226, 172],
    [0.42, 255, 178, 94],
    [0.68, 240, 120, 50],
    [1, 178, 62, 30],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (u <= stops[i][0] || i === stops.length - 1) {
      const a = stops[i - 1];
      const b = stops[i];
      const k = clamp((u - a[0]) / (b[0] - a[0]), 0, 1);
      return [lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];
    }
  }
  return [255, 255, 255];
}

const STAR_TONES: Array<[number, number, number]> = [
  [198, 214, 255],
  [226, 234, 255],
  [255, 250, 238],
  [255, 226, 186],
  [255, 192, 146],
  [176, 196, 236],
];

/* ------------------------------------------------------------------ *
 * World construction
 * ------------------------------------------------------------------ */

export function buildJourneyWorld(
  cssW: number,
  cssH: number,
  focal: number,
  small: boolean
): JourneyWorld {
  const unit = focal;
  const rng = makeRng(0x9e3779b9);
  const bank = new SpriteBank();
  const dens = small ? 0.45 : 1;

  const bhZ = BH_Z * unit;
  // Placed a little off the viewing axis so the approach has to steer onto
  // it -- but well inside the galaxy's own dark central void, so when it
  // fades up it appears *in* the hollow the spiral already winds around
  // rather than on top of the arms.
  const minSide = Math.min(cssW, cssH);
  const bhX = 0.1 * minSide * (bhZ / focal);
  const bhY = -0.05 * minSide * (bhZ / focal);

  const rSh = R_SH * unit;
  const rIn = R_IN * unit;
  const rOut = R_OUT * unit;

  /* ---- accretion disc ---- */
  const disc: DiscP[] = [];
  const discN = Math.round(1700 * dens);
  for (let i = 0; i < discN; i++) {
    // Log-uniform radius: density falls off as 1/r, so the bright inner
    // annulus is genuinely crowded and the outskirts thin out.
    const r0 = rIn * Math.pow(rOut / rIn, rng());
    const u = clamp((r0 - rIn) / (rOut - rIn), 0, 1);
    const [cr, cg, cb] = discColor(u);
    // Puffier inside, flattening outward -- an inner torus bleeding into a
    // thin outer disc, the shape the ESA/EHT renderings show.
    const thick = r0 * lerp(0.115, 0.05, u);
    disc.push({
      r0,
      th0: rng() * TAU,
      hy: bell(rng) * thick,
      om: OMEGA_IN / Math.pow(r0 / rIn, 1.5),
      spr: bank.index(cr, cg, cb),
      lum: Math.pow(rIn / r0, 0.95) * lerp(0.55, 1.35, rng()),
      size: unit * lerp(0.0055, 0.014, rng()) * lerp(1.25, 0.8, u),
      turb: lerp(0.018, 0.058, rng()),
      tph: rng() * TAU,
      u,
      lod: rng(),
    });
  }

  /* ---- infalling shell ---- */
  const shell: ShellP[] = [];
  const shellN = Math.round(600 * dens);
  for (let i = 0; i < shellN; i++) {
    // Two orthonormal vectors define one randomly-inclined circular orbit,
    // so the swarm has no preferred plane and reads as a cloud at many
    // depths instead of a second ring.
    const a1 = rng() * TAU;
    const a2 = Math.acos(2 * rng() - 1);
    const ux = Math.sin(a2) * Math.cos(a1);
    const uy = Math.sin(a2) * Math.sin(a1);
    const uz = Math.cos(a2);
    let hx = 0;
    const hy2 = 0;
    let hz = 1;
    if (Math.abs(uz) > 0.9) {
      hx = 1;
      hz = 0;
    }
    let vx = uy * hz - uz * hy2;
    let vy = uz * hx - ux * hz;
    let vz = ux * hy2 - uy * hx;
    const vl = Math.hypot(vx, vy, vz) || 1;
    vx /= vl;
    vy /= vl;
    vz /= vl;
    const rad = rSh * lerp(1.15, 4.4, Math.pow(rng(), 0.7));
    const tone = lerp(0.15, 0.95, rng());
    shell.push({
      ux,
      uy,
      uz,
      vx,
      vy,
      vz,
      rad,
      ph: rng() * TAU,
      om:
        ((rng() > 0.5 ? 1 : -1) * (OMEGA_IN * 0.8)) /
        Math.pow(rad / rSh, 1.5),
      spr: bank.index(255, lerp(150, 216, tone), lerp(78, 172, tone)),
      lum: lerp(0.18, 0.62, rng()),
      size: unit * lerp(0.004, 0.011, rng()),
    });
  }

  /* ---- interstellar medium ---- */
  // One continuous field of matter spanning the entire journey: the space
  // the galaxy sits in, the space the hole sits in, and the space beyond it
  // are the same medium sampled at different depths -- never three separate
  // backdrops. Uniform angular density at every depth, spread wider than the
  // frustum so material keeps sweeping in from the edges rather than only
  // growing out of the centre. It is only split into two lists at the end
  // because anything behind the hole has to be drawn, and lensed, before the
  // silhouette is laid down over it.
  const field: FieldP[] = [];
  const fieldN = Math.round(5000 * dens);
  const zNear = 3.2 * unit;
  const zFar = bhZ + 30 * unit;
  // The hole's own neighbourhood belongs to the disc and shell, so ordinary
  // field matter is kept clear of it.
  const clear = 7 * rSh;
  for (let i = 0; i < fieldN; i++) {
    const wz = lerp(zNear, zFar, rng());
    const margin = 1.6;
    const wx =
      bhX * (wz / bhZ) + (rng() * 2 - 1) * (cssW / 2) * (wz / focal) * margin;
    const wy =
      bhY * (wz / bhZ) + (rng() * 2 - 1) * (cssH / 2) * (wz / focal) * margin;
    if (Math.hypot(wx - bhX, wy - bhY, wz - bhZ) < clear) continue;
    const tone = STAR_TONES[(rng() * STAR_TONES.length) | 0];
    // A minority of the medium is nebulosity rather than point sources:
    // broad and very faint, it gives the volume between the bright things
    // something to be made of, at every depth of the journey.
    const cloud = rng() < 0.07;
    field.push({
      wx,
      wy,
      wz,
      spr: cloud
        ? bank.index(tone[0] * 0.82, tone[1] * 0.74, tone[2] * 0.7)
        : bank.index(tone[0], tone[1], tone[2]),
      lum: cloud
        ? lerp(0.05, 0.13, rng())
        : lerp(0.28, 1.1, Math.pow(rng(), 1.6)),
      size:
        unit * (cloud ? lerp(0.012, 0.03, rng()) : lerp(0.0018, 0.0075, rng())),
      tw: lerp(0.3, 1.1, rng()),
      tph: rng() * TAU,
      lod: rng(),
    });
  }
  const mid = field.filter((p) => p.wz <= bhZ);
  const deep = field.filter((p) => p.wz > bhZ);

  /* ---- polar outflow ---- */
  // Faint, and only a hint -- it exists to give the hole a scale and an
  // axis, not to become a feature of its own.
  const jet: FieldP[] = [];
  const jetN = Math.round(220 * dens);
  const axX = -SIN_R * COS_T;
  const axY = COS_R * COS_T;
  const axZ = SIN_T;
  // Any two vectors spanning the plane normal to the jet axis.
  const p1x = COS_R;
  const p1y = SIN_R;
  const p1z = 0;
  const p2x = axY * p1z - axZ * p1y;
  const p2y = axZ * p1x - axX * p1z;
  const p2z = axX * p1y - axY * p1x;
  for (let i = 0; i < jetN; i++) {
    const side = rng() > 0.5 ? 1 : -1;
    const along = lerp(1.2, 9, Math.pow(rng(), 0.8)) * rSh;
    const flare = rSh * (0.1 + 0.2 * (along / (9 * rSh)));
    const ang = rng() * TAU + along * 0.0016;
    const rad = flare * Math.sqrt(rng());
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const fade = 1 - along / (9.6 * rSh);
    jet.push({
      wx: bhX + axX * along * side + (p1x * ca + p2x * sa) * rad,
      wy: bhY + axY * along * side + (p1y * ca + p2y * sa) * rad,
      wz: bhZ + axZ * along * side + (p1z * ca + p2z * sa) * rad,
      spr: bank.index(196, 220, 255),
      lum: 0.24 * fade * lerp(0.4, 1, rng()),
      size: unit * lerp(0.004, 0.009, rng()),
      tw: lerp(0.5, 1.4, rng()),
      tph: rng() * TAU,
      lod: rng(),
    });
  }

  /* ---- interior medium ---- */
  const inner: InnerP[] = [];
  const innerN = Math.round(1500 * dens);
  for (let i = 0; i < innerN; i++) {
    // Uniform in depth, so the column's density stays even however far
    // down the camera gets.
    const u = rng();
    const depth = lerp(INNER_Z0, INNER_Z1, u);
    const wz = bhZ + depth * unit;
    // Biased outward off the hollow core, so the walls are what carries
    // the sense of speed and the centre of frame stays readable.
    const rad = lerp(INNER_R_IN, INNER_R_OUT, Math.pow(rng(), 0.62)) * unit;
    // Ember at the mouth, cooling into something colder and less natural
    // with depth -- the existing palette carried further in, rather than a
    // second one.
    const cool = u * u;
    inner.push({
      rad,
      ang: rng() * TAU + depth * INNER_TWIST,
      wz,
      om: (rng() > 0.5 ? 1 : -1) * lerp(0.05, 0.16, rng()),
      br: lerp(0.05, 0.17, rng()),
      bph: rng() * TAU,
      spr: bank.index(
        lerp(255, 152, cool),
        lerp(170, 142, cool),
        lerp(104, 240, cool)
      ),
      lum: lerp(0.2, 0.85, Math.pow(rng(), 1.4)),
      size: unit * lerp(0.0025, 0.0095, rng()),
      tw: lerp(0.4, 1.3, rng()),
      tph: rng() * TAU,
      lod: rng(),
    });
  }

  /* ---- the approach medium ---- */
  // Built last and off an rng of its own, so every structure above it comes
  // out of exactly the same stream of numbers it always did.
  const flux: FluxP[] = [];
  const fluxN = Math.round(560 * dens);
  const frng = makeRng(0x2f6ab3c1);
  const pl = { x: 0, y: 0 };
  for (let i = 0; i < fluxN; i++) {
    // Biased toward the hole, so the medium thickens the whole way in -- the
    // one cue that says the camera is closing rather than magnifying.
    const u = Math.pow(frng(), 0.62);
    const wz = lerp(FLUX_Z0, FLUX_Z1, u) * unit;
    // Beside the camera's path rather than beside the axis: the path swings
    // a long way out and back on the way in, and matter placed off the axis
    // would sit wide of the lens for exactly the stretch it is meant to be
    // sweeping across it.
    pathLateral(pl, unit, bhX, bhY, tAtDepth(wz, bhZ, unit));
    const funnel = lerp(1, FLUX_FUNNEL, u);
    const rad =
      lerp(FLUX_R_IN, FLUX_R_OUT, Math.pow(frng(), 0.55)) * unit * funnel;
    // Ember close in, ordinary cold dust further out -- the palette the
    // environment already runs on, carried into the corridor.
    const warm = Math.pow(u, 0.8) * lerp(0.7, 1, frng());
    flux.push({
      px: pl.x,
      py: pl.y,
      wz,
      rad,
      ang: frng() * TAU,
      om: (frng() > 0.5 ? 1 : -1) * lerp(0.03, 0.12, frng()),
      br: lerp(0.04, 0.15, frng()),
      spr: bank.index(
        lerp(206, 255, warm),
        lerp(216, 176, warm),
        lerp(246, 112, warm)
      ),
      lum: lerp(0.14, 0.72, Math.pow(frng(), 1.5)) * lerp(0.7, 1.35, u),
      size: unit * lerp(0.0022, 0.0085, frng()),
      lod: frng(),
    });
  }

  // Screen direction of the limb rotating toward the viewer (disc angle pi),
  // carried through the same tilt/roll the geometry uses.
  const by1 = 0 * COS_T - 0 * SIN_T;
  const bx2 = -1 * COS_R - by1 * SIN_R;
  const by2 = -1 * SIN_R + by1 * COS_R;
  const beamAngle = Math.atan2(by2, bx2);

  return {
    unit,
    cx: cssW / 2,
    cy: cssH / 2,
    bhX,
    bhY,
    bhZ,
    rSh,
    rIn,
    beamAngle,
    disc,
    shell,
    mid,
    deep,
    jet,
    inner,
    claimed: new Uint8Array(inner.length),
    flux,
    bank,
  };
}

/* ------------------------------------------------------------------ *
 * Camera
 * ------------------------------------------------------------------ */

type Cam = {
  x: number;
  y: number;
  z: number;
  /** Black hole's projected centre and shadow radius for this camera. */
  bx: number;
  by: number;
  te: number;
  lens: boolean;
  /** How firmly the hole still stands between the camera and what is behind
   *  it: 1 out in open space, easing to 0 as the camera arrives. Once the
   *  camera is down among that material there is no longer a silhouette in
   *  front of it to bend light around or to hide it, so both the lensing and
   *  the darkness release together and the surroundings surface through. */
  grip: number;
};

export function camZAt(t: number, bhZ: number, unit: number) {
  if (t <= CROSS_T) return bhZ * Math.pow(t / CROSS_T, CAM_POW);
  const k = (t - CROSS_T) / (1 - CROSS_T);
  // Eases out past the horizon so the plunge settles into a cruise instead
  // of accelerating off to nothing.
  if (k <= 1) return bhZ + unit * DEEP_TRAVEL * (1 - Math.pow(1 - k, 1.7));
  // Past the original end of the journey, and only ever reached on scroll
  // distance that did not exist before: the fall resumes from exactly where
  // (and at exactly the speed) the curve above left it, carries on down,
  // and settles again at the bottom.
  const d = clamp((t - 1) / DEEP_SPAN, 0, 1);
  const ease = INNER_LINEAR * d + (1 - INNER_LINEAR) * d * d * (3 - 2 * d);
  const z = bhZ + unit * (DEEP_TRAVEL + INNER_TRAVEL * ease);
  // ...and past even that, only on the Education leg's own scroll: the
  // glide to rest.
  return t > 1 + DEEP_SPAN ? z + unit * SETTLE_V * glide(t) : z;
}

/**
 * The camera's lateral position at a given point on the journey. Written
 * down here, once, because everything placed *beside* the path -- the medium
 * the approach is made of, the project screens -- has to be built from the
 * same sway and rise the camera itself flies, or it will not be where the
 * shot needs it. The camera below is its only other caller, and reads
 * exactly what it always did.
 */
function pathLateral(
  out: { x: number; y: number },
  unit: number,
  bhX: number,
  bhY: number,
  t: number
) {
  const s = clamp(t / CROSS_T, 0, 1);
  // Alignment, swoop and sway are all exactly zero at t = 0 and the swoop
  // returns to zero right as the horizon is reached, so the camera arrives
  // dead on axis, in the disc's own plane.
  const align = smoothstep(0.04, 0.9, t);
  const swoop = -SWOOP_Y * unit * Math.sin(Math.PI * Math.pow(s, 1.6));
  const sway = SWAY_X * unit * Math.sin(Math.PI * Math.pow(s, 1.25));
  out.x = bhX * align + sway;
  out.y = bhY * align + swoop;
  if (t > 1) {
    // Interior drift, so the fall down the column still reads as flown.
    // The ramp is zero in both value and slope at t = 1, which is what
    // stops it from showing up as a sideways lurch the instant the new
    // scroll distance begins.
    const d = clamp((t - 1) / DEEP_SPAN, 0, 1);
    const ramp = smoothstep(0, 0.16, d);
    out.x += INNER_SWAY * unit * ramp * Math.sin(TAU * 0.78 * d);
    out.y += INNER_RISE * unit * ramp * Math.sin(TAU * 0.5 * d);
  }
  if (t > 1 + DEEP_SPAN) {
    // The drift glides to rest with the fall: the slope each sine above
    // ends on (the ramp is flat by then), per journey-t, carried out.
    const g = glide(t) / DEEP_SPAN;
    out.x += INNER_SWAY * unit * TAU * 0.78 * Math.cos(TAU * 0.78) * g;
    out.y += INNER_RISE * unit * TAU * 0.5 * Math.cos(TAU * 0.5) * g;
  }
}

/**
 * The journey-t at which the camera reaches a given depth -- camZAt run
 * backwards, by bisection. Anything standing beside the path needs it, to
 * know where the path is at its own depth.
 */
export function tAtDepth(targetZ: number, bhZ: number, unit: number) {
  let lo = 0;
  let hi = 1 + DEEP_SPAN;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (camZAt(mid, bhZ, unit) < targetZ) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const PATH = { x: 0, y: 0 };

function fillCam(cam: Cam, w: JourneyWorld, focal: number, t: number) {
  pathLateral(PATH, w.unit, w.bhX, w.bhY, t);
  cam.x = PATH.x;
  cam.y = PATH.y;
  cam.z = camZAt(t, w.bhZ, w.unit);
  const dz = w.bhZ - cam.z;
  cam.lens = dz > 0;
  // Released over a long enough stretch that the silhouette thins while the
  // camera is still crossing the material around it, rather than holding
  // absolute right up to a hard arrival. There is no frame at which the hole
  // opens: it has been opening for several UNIT beforehand.
  cam.grip = clamp(dz / (2.4 * w.unit), 0, 1);
  if (cam.lens) {
    const k = focal / dz;
    cam.bx = w.cx + (w.bhX - cam.x) * k;
    cam.by = w.cy + (w.bhY - cam.y) * k;
    cam.te = w.rSh * k;
  } else {
    cam.bx = w.cx;
    cam.by = w.cy;
    cam.te = 0;
  }
}

/* ------------------------------------------------------------------ *
 * Projection + gravitational lensing
 * ------------------------------------------------------------------ */

// Scratch slots, reused every call so the hot loop never allocates.
// [0]=x [1]=y [2]=perspective k [3]=magnification [4]=ok
const PR = new Float64Array(5);
const PR2 = new Float64Array(5);

function project(
  out: Float64Array,
  cam: Cam,
  w: JourneyWorld,
  focal: number,
  wx: number,
  wy: number,
  wz: number
) {
  const dz = wz - cam.z;
  if (dz <= NEAR_CLIP * w.unit) {
    out[4] = 0;
    return;
  }
  const k = focal / dz;
  let sx = w.cx + (wx - cam.x) * k;
  let sy = w.cy + (wy - cam.y) * k;
  let mag = 1;

  // Light from behind the hole does not travel in a straight line: solve the
  // point-lens equation for the primary image, which pushes every source
  // outward and -- because the solution is never smaller than the Einstein
  // radius -- carves the shadow out of the background for free. Weighted in
  // over a short depth so material level with the hole bends gradually
  // rather than snapping at the midplane.
  if (cam.lens && wz > w.bhZ) {
    const lw = smoothstep(0, w.rSh * 1.2, wz - w.bhZ) * cam.grip;
    if (lw > 0.001) {
      const ddx = sx - cam.bx;
      const ddy = sy - cam.by;
      const r = Math.hypot(ddx, ddy);
      const te = cam.te;
      if (r > 1e-3) {
        const rp = 0.5 * (r + Math.sqrt(r * r + 4 * te * te));
        const nr = lerp(r, rp, lw);
        const inv = nr / r;
        sx = cam.bx + ddx * inv;
        sy = cam.by + ddy * inv;
        // Point-lens magnification of the primary image -- this is what
        // lights up the ring of background material hugging the silhouette.
        const uu = r / te;
        const mu = (uu * uu + 2) / (uu * Math.sqrt(uu * uu + 4));
        mag = lerp(1, clamp(0.5 * (mu + 1), 0.35, 5), lw);
      } else {
        sx = cam.bx + te;
        sy = cam.by;
        mag = lerp(1, 5, lw);
      }
    }
  }

  out[0] = sx;
  out[1] = sy;
  out[2] = k;
  out[3] = mag;
  out[4] = 1;
}

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */

type Ctx = CanvasRenderingContext2D;

/** One additive glow blit -- stretched along its own motion when the camera
 *  is moving fast enough for the displacement to read as a streak. */
function blit(
  ctx: Ctx,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  px: number,
  py: number,
  rad: number,
  alpha: number
) {
  if (alpha <= MIN_ALPHA || rad <= 0.05) return;
  const h = rad * SPRITE_SPREAD;
  const dx = x - px;
  const dy = y - py;
  const len = Math.hypot(dx, dy);
  if (len > h * 0.6 && len > 2) {
    ctx.save();
    ctx.translate((x + px) / 2, (y + py) / 2);
    ctx.rotate(Math.atan2(dy, dx));
    // A long smear is dimmed so fast material does not also read as
    // brighter material.
    ctx.globalAlpha =
      Math.min(1, alpha) * clamp(1 - len / (len + h * 4), 0.3, 1);
    ctx.drawImage(sprite, -h - len / 2, -h, 2 * h + len, 2 * h);
    ctx.restore();
    return;
  }
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.drawImage(sprite, x - h, y - h, 2 * h, 2 * h);
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

/** The subset of the existing banner particle this module reads. */
export type GalaxyParticle = {
  portalX: number;
  portalY: number;
  idlePhase: number;
  idleSpeed: number;
  idleAmpX: number;
  idleAmpY: number;
  seed: number;
  portalDepthScale: number;
  portalDepthAlpha: number;
  dotColor: string;
  dotRadius: number;
  zWorld: number;
};

const camNow: Cam = {
  x: 0,
  y: 0,
  z: 0,
  bx: 0,
  by: 0,
  te: 0,
  lens: true,
  grip: 1,
};
const camPrev: Cam = {
  x: 0,
  y: 0,
  z: 0,
  bx: 0,
  by: 0,
  te: 0,
  lens: true,
  grip: 1,
};

/** Extra distance the camera has gone on along its axis, world px. Zero
 *  everywhere on the journey itself; see setJourneyDolly. */
let dollyZ = 0;

/**
 * Carries the camera the frame is drawn from a little further on, past
 * where the journey leaves it -- the push-in as the Education book opens.
 * It touches nothing else: the path, and everything sampled from it at
 * build time, stay exactly as they are.
 */
export function setJourneyDolly(z: number) {
  dollyZ = z;
}

export function renderJourney(
  ctx: Ctx,
  w: JourneyWorld,
  galaxy: GalaxyParticle[],
  t: number,
  time: number,
  cssW: number,
  cssH: number,
  focal: number
) {
  ctx.clearRect(0, 0, cssW, cssH);

  fillCam(camNow, w, focal, t);
  fillCam(camPrev, w, focal, Math.max(0, t - STREAK_DT));
  // Only ever nonzero while the Education book opens: the camera goes in
  // toward it, slowly enough that nothing streaks.
  camNow.z += dollyZ;
  camPrev.z += dollyZ;

  // Everything this module adds fades up from literally nothing across the
  // first sliver of the journey, which is what makes the handoff from the
  // 2D galaxy render a frame-for-frame match at t = 0.
  const presence = smoothstep(0, 0.08, t);
  const sprites = w.bank.sprites;
  const unit = w.unit;

  ctx.globalCompositeOperation = "lighter";

  /* ---------------- far side: lensed ---------------- */
  if (presence > 0.002) {
    drawDeep(ctx, w, sprites, presence, focal, time, true);
    drawDisc(ctx, w, sprites, presence, focal, time, true);
    drawShell(ctx, w, sprites, presence, focal, time, true);
    drawFlux(ctx, w, sprites, presence, focal, time, true);
    drawJet(ctx, w, sprites, presence, focal, time, true);
  }

  /* ---------------- the shadow itself ---------------- */
  // Not a drawn disc: the lensing above already refuses to image anything
  // inside the silhouette, so this only has to stop the surrounding glow's
  // bloom from bleeding across it -- which is what gives the edge its
  // definition without ever stroking an outline.
  // Releases on the same schedule as the lensing: out in open space it is
  // absolute, and over the last stretch of the fall it thins away, so the
  // material the camera is descending into surfaces through the darkness
  // instead of the frame going flat at the moment of arrival.
  const occl = presence * camNow.grip;
  if (occl > 0.004) {
    ctx.globalCompositeOperation = "source-over";
    const c = `${BG[0]},${BG[1]},${BG[2]}`;
    const diag = Math.hypot(cssW, cssH);
    if (camNow.te < diag * 1.2) {
      const te = camNow.te * 1.02;
      const g = ctx.createRadialGradient(
        camNow.bx,
        camNow.by,
        0,
        camNow.bx,
        camNow.by,
        te
      );
      g.addColorStop(0, `rgba(${c},${occl})`);
      g.addColorStop(0.93, `rgba(${c},${occl})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(camNow.bx, camNow.by, te, 0, TAU);
      ctx.fill();
    } else {
      // The silhouette is now wider than the viewport -- the same darkness,
      // simply filling the frame.
      ctx.globalAlpha = occl;
      ctx.fillStyle = `rgb(${c})`;
      ctx.fillRect(0, 0, cssW, cssH);
    }
    ctx.globalCompositeOperation = "lighter";
  }

  /* ---------------- rim: photon ring + gravitational halo ---------------- */
  if (presence > 0.002 && camNow.lens && camNow.te > 1.5) {
    drawRim(ctx, w, presence, time, cssW, cssH);
  }

  /* ---------------- near side ---------------- */
  drawGalaxy(ctx, w, galaxy, focal, time);
  if (presence > 0.002) {
    drawField(ctx, w, w.mid, sprites, presence, focal, time, 13 * unit);
    drawDisc(ctx, w, sprites, presence, focal, time, false);
    drawShell(ctx, w, sprites, presence, focal, time, false);
    drawFlux(ctx, w, sprites, presence, focal, time, false);
    drawJet(ctx, w, sprites, presence, focal, time, false);
    drawDeep(ctx, w, sprites, presence, focal, time, false);
    drawInner(ctx, w, sprites, focal, time);
  }

  /* ---------------- horizon crossing ---------------- */
  // Light piling up as the camera crosses, rather than a blank frame. Wide
  // and shallow, and wider still on the way out than on the way in: spread
  // over several UNIT either side there is no frame at which it arrives, and
  // by the time it has built, the surroundings have already started behaving
  // like the inside. A brief bright flash here would be the one thing that
  // turned an inevitable crossing into a cut.
  const crossD = (camNow.z - w.bhZ) / unit;
  const cross = 1 - clamp(crossD < 0 ? -crossD / 4.6 : crossD / 6.2, 0, 1);
  if (cross > 0.002) {
    const g = ctx.createRadialGradient(
      w.cx,
      w.cy,
      0,
      w.cx,
      w.cy,
      Math.hypot(cssW, cssH) * 0.6
    );
    const a = Math.pow(cross, 2.6) * 0.13 * presence;
    g.addColorStop(0, `rgba(255,236,208,${a})`);
    g.addColorStop(0.45, `rgba(255,178,116,${a * 0.42})`);
    g.addColorStop(1, "rgba(120,70,150,0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

/* ---- the existing galaxy, now with a camera in front of it ---- */

function drawGalaxy(
  ctx: Ctx,
  w: JourneyWorld,
  galaxy: GalaxyParticle[],
  focal: number,
  time: number
) {
  const unit = w.unit;
  const limX = w.cx * 2;
  const limY = w.cy * 2;
  for (const p of galaxy) {
    // Exactly the position the 2D render settles on at full progress: the
    // portal target plus its idle orbit, at travel weight 1.
    const ia = time * p.idleSpeed + p.idlePhase;
    const gx = p.portalX + Math.cos(ia) * p.idleAmpX;
    const gy = p.portalY + Math.sin(ia * 1.15 + p.seed * 6.28) * p.idleAmpY;

    // Un-project through this particle's own depth, so the camera's
    // perspective divide gives the identity back at the origin.
    const kz = p.zWorld / focal;
    const wx = (gx - w.cx) * kz;
    const wy = (gy - w.cy) * kz;

    project(PR, camNow, w, focal, wx, wy, p.zWorld);
    if (!PR[4]) continue;
    const dz = p.zWorld - camNow.z;

    // 1 at the camera origin, growing as the camera closes in: the same
    // perspective factor the projection applies to position. Applied
    // sub-linearly to the glow, and paid for with a matching loss of
    // brightness, so a mote sweeping past the lens dissolves the way dust
    // going out of focus does instead of swelling into a flat disc. Both
    // exponents evaluate to exactly 1 at the camera's start position, so the
    // settled galaxy is untouched.
    const sizeK = p.zWorld / dz;
    // Only bites once a mote is nearly on top of the lens.
    const near = smoothstep(0.05 * unit, 0.6 * unit, dz);
    const twinkle =
      0.82 + 0.18 * Math.sin(time * p.idleSpeed * 2.3 + p.idlePhase * 1.7);
    const dotR =
      p.dotRadius * p.portalDepthScale * twinkle * Math.pow(sizeK, 0.62);
    const alpha = p.portalDepthAlpha * near * Math.pow(sizeK, -0.45);
    if (alpha <= MIN_ALPHA) continue;

    const x = PR[0];
    const y = PR[1];
    const pad = dotR * 3;
    if (x < -pad || y < -pad || x > limX + pad || y > limY + pad) continue;

    project(PR2, camPrev, w, focal, wx, wy, p.zWorld);
    const px = PR2[4] ? PR2[0] : x;
    const py = PR2[4] ? PR2[1] : y;
    const sdx = x - px;
    const sdy = y - py;
    const len = Math.hypot(sdx, sdy);

    // The identical three-concentric-circle glow the 2D render draws -- kept
    // literally, not approximated, so the handoff frame matches.
    ctx.fillStyle = `rgb(${p.dotColor})`;
    // Smeared along its own travel only once the motion clearly outruns the
    // mote's own size, and never past a handful of its own widths -- enough
    // to read as speed, not enough to turn the field into streaks. Only this
    // branch needs a transform, so the overwhelming majority of motes skip
    // the save/restore pair entirely.
    if (len > dotR * 2 && len > 3) {
      const stretch = Math.min((len + dotR * 2) / (dotR * 2), 4);
      ctx.save();
      ctx.translate((x + px) / 2, (y + py) / 2);
      ctx.rotate(Math.atan2(sdy, sdx));
      ctx.scale(stretch, 1);
      drawTriGlow(ctx, 0, 0, dotR, alpha);
      ctx.restore();
    } else {
      drawTriGlow(ctx, x, y, dotR, alpha);
    }
  }
}

function drawTriGlow(ctx: Ctx, x: number, y: number, r: number, a: number) {
  // The outer two rings are the widest fills here and the faintest thing on
  // screen, so each is skipped once its own contribution drops below what a
  // dark field can show. At the camera's start position a mote's alpha is
  // 0.4 at the very dimmest, leaving both far above the floor -- the settled
  // galaxy draws all three exactly as it always has.
  if (a * 0.1 > MIN_ALPHA) {
    ctx.globalAlpha = a * 0.1;
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, TAU);
    ctx.fill();
  }
  if (a * 0.22 > MIN_ALPHA) {
    ctx.globalAlpha = a * 0.22;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.3, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = a * 0.9;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/* ---- star fields ---- */

function drawField(
  ctx: Ctx,
  w: JourneyWorld,
  list: FieldP[],
  sprites: HTMLCanvasElement[],
  presence: number,
  focal: number,
  time: number,
  fog: number
) {
  const unit = w.unit;
  const ref = 8 * unit;
  const limX = w.cx * 2;
  const limY = w.cy * 2;
  const lodRef = LOD_FIELD_REF * unit;
  for (const p of list) {
    const dz = p.wz - camNow.z;
    if (dz <= NEAR_CLIP * unit) continue;
    // Thins with distance: at arm's length the whole population draws, far
    // out only the highest-ranked few do, standing in for the rest.
    const f = clamp(lodRef / dz, LOD_FIELD_MIN, 1);
    const keep = lodFade(p.lod, f);
    if (keep <= 0) continue;
    project(PR, camNow, w, focal, p.wx, p.wy, p.wz);
    if (!PR[4]) continue;
    // Points of light, not discs: apparent size grows only sub-linearly with
    // proximity while brightness carries the depth.
    const rad = clamp(p.size * Math.pow(ref / dz, 0.5), 0.35, 26);
    const near = smoothstep(0.06 * unit, 0.7 * unit, dz);
    const tw = 0.84 + 0.16 * Math.sin(time * p.tw + p.tph);
    const a =
      p.lum *
      Math.exp(-dz / fog) *
      near *
      tw *
      presence *
      PR[3] *
      keep *
      Math.pow(f, -0.5);
    if (a <= MIN_ALPHA) continue;
    const x = PR[0];
    const y = PR[1];
    const pad = rad * SPRITE_SPREAD;
    if (x < -pad || y < -pad || x > limX + pad || y > limY + pad) continue;
    project(PR2, camPrev, w, focal, p.wx, p.wy, p.wz);
    blit(
      ctx,
      sprites[p.spr],
      x,
      y,
      PR2[4] ? PR2[0] : x,
      PR2[4] ? PR2[1] : y,
      rad,
      a
    );
  }
}

function drawDeep(
  ctx: Ctx,
  w: JourneyWorld,
  sprites: HTMLCanvasElement[],
  presence: number,
  focal: number,
  time: number,
  far: boolean
) {
  // The deep field is entirely beyond the hole, so it belongs to the lensed
  // pass right up until the camera is through the horizon.
  if (far !== camNow.lens) return;
  drawField(ctx, w, w.deep, sprites, presence, focal, time, 22 * w.unit);
}

/* ---- interior medium ---- */

/** How much of the interior medium there is for the current camera. */
function innerPresence(w: JourneyWorld) {
  // Nothing at all until the camera is past where the journey used to end,
  // so every frame of the original experience is untouched by this.
  return smoothstep(
    w.bhZ + INNER_FADE_0 * w.unit,
    w.bhZ + INNER_FADE_1 * w.unit,
    camNow.z
  );
}

// One interior mote as seen this frame: [x, y, prevX, prevY, radius, alpha].
const IV = new Float64Array(6);

/**
 * Where one interior mote is on screen and how it is drawn, from the camera
 * this frame was rendered with. False when there is nothing of it to draw.
 * With `cull`, also false when it is off screen -- checked before the
 * streak's second projection is paid for.
 */
function viewInner(
  out: Float64Array,
  w: JourneyWorld,
  p: InnerP,
  focal: number,
  time: number,
  presence: number,
  cull: boolean
) {
  const unit = w.unit;
  const dz = p.wz - camNow.z;
  if (dz <= NEAR_CLIP * unit) return false;
  const f = clamp((LOD_FIELD_REF * unit) / dz, LOD_FIELD_MIN, 1);
  const keep = lodFade(p.lod, f);
  if (keep <= 0) return false;

  const ang = p.ang + p.om * time;
  const rr = p.rad * (1 + p.br * Math.sin(ang * 1.7 + p.bph + time * 0.22));
  const wx = w.bhX + Math.cos(ang) * rr;
  // Squashed a little, echoing the disc's own plane rather than boxing
  // the camera into a perfectly round tube.
  const wy = w.bhY + Math.sin(ang) * rr * 0.88;

  project(PR, camNow, w, focal, wx, wy, p.wz);
  if (!PR[4]) return false;
  const rad = clamp(p.size * Math.pow((8 * unit) / dz, 0.6), 0.35, 30);
  const near = smoothstep(0.06 * unit, 0.7 * unit, dz);
  const tw = 0.8 + 0.2 * Math.sin(time * p.tw + p.tph);
  // The fog is short, so the column ahead falls away into real darkness
  // rather than receding evenly forever.
  const a =
    p.lum *
    Math.exp(-dz / (16 * unit)) *
    near *
    tw *
    presence *
    keep *
    Math.pow(f, -0.5);
  if (a <= MIN_ALPHA) return false;
  const x = PR[0];
  const y = PR[1];
  if (cull) {
    const pad = rad * SPRITE_SPREAD;
    if (x < -pad || y < -pad || x > w.cx * 2 + pad || y > w.cy * 2 + pad) {
      return false;
    }
  }
  project(PR2, camPrev, w, focal, wx, wy, p.wz);
  out[0] = x;
  out[1] = y;
  out[2] = PR2[4] ? PR2[0] : x;
  out[3] = PR2[4] ? PR2[1] : y;
  out[4] = rad;
  out[5] = a;
  return true;
}

function drawInner(
  ctx: Ctx,
  w: JourneyWorld,
  sprites: HTMLCanvasElement[],
  focal: number,
  time: number
) {
  const presence = innerPresence(w);
  if (presence <= 0.002) return;

  const inner = w.inner;
  for (let i = 0; i < inner.length; i++) {
    // Taken out of the medium: whatever took it draws it now.
    if (w.claimed[i]) continue;
    const p = inner[i];
    if (!viewInner(IV, w, p, focal, time, presence, true)) continue;
    blit(ctx, sprites[p.spr], IV[0], IV[1], IV[2], IV[3], IV[4], IV[5]);
  }
}

/* ---- the approach medium ---- */

function drawFlux(
  ctx: Ctx,
  w: JourneyWorld,
  sprites: HTMLCanvasElement[],
  presence: number,
  focal: number,
  time: number,
  far: boolean
) {
  const unit = w.unit;
  // Nothing whatsoever over the opening stretch, so the gateway's first
  // frames are exactly the ones they were.
  const gate = smoothstep(FLUX_GATE[0] * unit, FLUX_GATE[1] * unit, camNow.z);
  if (gate <= 0.003) return;
  const ref = 8 * unit;
  const fog = 20 * unit;
  const limX = w.cx * 2;
  const limY = w.cy * 2;
  const lodRef = LOD_FIELD_REF * unit;
  const actFar = FLUX_ACT[0] * unit;
  const actNear = FLUX_ACT[1] * unit;

  for (const p of w.flux) {
    const isFar = p.wz > w.bhZ && camNow.lens;
    if (isFar !== far) continue;
    const dz = p.wz - camNow.z;
    if (dz <= NEAR_CLIP * unit) continue;
    const act = smoothstep(actFar, actNear, dz);
    if (act <= 0.004) continue;
    const f = clamp(lodRef / dz, LOD_FIELD_MIN, 1);
    const keep = lodFade(p.lod, f);
    if (keep <= 0) continue;

    const ang = p.ang + p.om * time;
    const rr = p.rad * (1 + p.br * Math.sin(ang * 1.6 + time * 0.3));
    const wx = p.px + Math.cos(ang) * rr;
    const wy = p.py + Math.sin(ang) * rr * 0.9;

    project(PR, camNow, w, focal, wx, wy, p.wz);
    if (!PR[4]) continue;
    const rad = clamp(p.size * Math.pow(ref / dz, 0.62), 0.35, 24);
    // Held together almost all the way to the lens. This is the layer whose
    // whole job is to whip past the camera, and matter that dims as it
    // arrives cannot do that -- the streak in blit() is the point of it.
    const near = smoothstep(0.03 * unit, 0.26 * unit, dz);
    const a =
      p.lum *
      Math.exp(-dz / fog) *
      near *
      act *
      gate *
      presence *
      PR[3] *
      keep *
      Math.pow(f, -0.5);
    if (a <= MIN_ALPHA) continue;
    const x = PR[0];
    const y = PR[1];
    const pad = rad * SPRITE_SPREAD;
    if (x < -pad || y < -pad || x > limX + pad || y > limY + pad) continue;
    project(PR2, camPrev, w, focal, wx, wy, p.wz);
    blit(
      ctx,
      sprites[p.spr],
      x,
      y,
      PR2[4] ? PR2[0] : x,
      PR2[4] ? PR2[1] : y,
      rad,
      a
    );
  }
}

/* ---- accretion disc ---- */

function drawDisc(
  ctx: Ctx,
  w: JourneyWorld,
  sprites: HTMLCanvasElement[],
  presence: number,
  focal: number,
  time: number,
  far: boolean
) {
  const unit = w.unit;
  const ref = 8 * unit;
  const fog = 40 * unit;
  const limX = w.cx * 2;
  const limY = w.cy * 2;
  const te = camNow.te;
  // How much of the disc's population is worth drawing, from how large it
  // currently reads on screen. Seen from far enough away the whole structure
  // is a smudge a couple of hundred pixels wide, and a few hundred points
  // render it just as faithfully as two thousand.
  const bhDz = Math.max(w.bhZ - camNow.z, 0.2 * unit);
  const f = clamp((R_OUT * unit * focal) / bhDz / LOD_DISC_REF, LOD_DISC_MIN, 1);
  const lodGain = Math.pow(f, -0.5);

  for (const p of w.disc) {
    const keep = lodFade(p.lod, f);
    if (keep <= 0) continue;
    const th = p.th0 + p.om * time;
    // Spiral density waves plus a shorter-wavelength ripple: the disc shears
    // into filaments and knots instead of glowing evenly all the way round.
    const phase = 2 * th - Math.log(p.r0 / w.rIn) * 3.4 - 0.1 * time;
    let wave =
      0.55 +
      0.3 * Math.sin(phase) +
      0.18 * Math.sin(1.7 * phase + 2.1) +
      0.12 * Math.sin(3.1 * th - 0.23 * time + p.tph);
    if (wave < 0.15) wave = 0.15;

    const rr =
      p.r0 *
      (1 +
        p.turb * Math.sin(3 * th + p.tph - 0.7 * time) +
        p.turb * 0.6 * Math.sin(7 * th - 1.3 * time + p.tph * 2));
    const ct = Math.cos(th);
    const st = Math.sin(th);
    const lx = ct * rr;
    const lz = st * rr;
    const ly = p.hy * (1 + 0.25 * Math.sin(2 * th + p.tph));

    const y1 = ly * COS_T - lz * SIN_T;
    const z1 = ly * SIN_T + lz * COS_T;
    const wx = w.bhX + (lx * COS_R - y1 * SIN_R);
    const wy = w.bhY + (lx * SIN_R + y1 * COS_R);
    const wz = w.bhZ + z1;

    const isFar = wz > w.bhZ && camNow.lens;
    if (isFar !== far) continue;

    project(PR, camNow, w, focal, wx, wy, wz);
    if (!PR[4]) continue;
    const dz = wz - camNow.z;
    // Relativistic beaming: the limb sweeping toward the camera outshines
    // the one sweeping away, by the Doppler factor cubed.
    const beam = clamp(Math.pow(1 + BEAM_BETA * ct * COS_T, -3), 0.22, 4.5);
    const rad = clamp(p.size * Math.pow(ref / dz, 0.85), 0.4, 110);
    const near = smoothstep(0.04 * unit, 0.5 * unit, dz);
    const a =
      p.lum *
      wave *
      beam *
      Math.exp(-dz / fog) *
      near *
      presence *
      PR[3] *
      keep *
      lodGain *
      0.6;
    if (a <= MIN_ALPHA) continue;

    const x = PR[0];
    const y = PR[1];
    const pad = rad * SPRITE_SPREAD;
    if (x < -pad || y < -pad || x > limX + pad || y > limY + pad) continue;

    project(PR2, camPrev, w, focal, wx, wy, wz);
    const sprite = sprites[p.spr];
    blit(
      ctx,
      sprite,
      x,
      y,
      PR2[4] ? PR2[0] : x,
      PR2[4] ? PR2[1] : y,
      rad,
      a
    );

    // Higher-order image: light from the far side that wrapped the other way
    // round the hole, piling up just outside the silhouette as the thin
    // counter-arc that hugs the shadow.
    if (far && te > 2 && wz > w.bhZ + w.rSh) {
      const ddx = x - camNow.bx;
      const ddy = y - camNow.by;
      const r = Math.hypot(ddx, ddy);
      if (r > 1e-3 && r < te * 7) {
        const rs = Math.abs(0.5 * (r - Math.sqrt(r * r + 4 * te * te)));
        const nr = te * (1 + 0.1 * clamp(rs / te, 0, 1));
        const sx2 = camNow.bx - (ddx / r) * nr;
        const sy2 = camNow.by - (ddy / r) * nr;
        blit(ctx, sprite, sx2, sy2, sx2, sy2, rad * 0.7, a * 0.3);
      }
    }
  }
}

/* ---- infalling shell ---- */

function drawShell(
  ctx: Ctx,
  w: JourneyWorld,
  sprites: HTMLCanvasElement[],
  presence: number,
  focal: number,
  time: number,
  far: boolean
) {
  const unit = w.unit;
  const ref = 8 * unit;
  const fog = 40 * unit;
  const limX = w.cx * 2;
  const limY = w.cy * 2;
  for (const p of w.shell) {
    const ph = p.ph + p.om * time;
    const c = Math.cos(ph);
    const s = Math.sin(ph);
    // Slow radial breathing, so the swarm churns rather than tracing fixed
    // circles.
    const rr = p.rad * (1 + 0.12 * Math.sin(ph * 2.3 + p.ph));
    const wx = w.bhX + (p.ux * c + p.vx * s) * rr;
    const wy = w.bhY + (p.uy * c + p.vy * s) * rr;
    const wz = w.bhZ + (p.uz * c + p.vz * s) * rr;

    const isFar = wz > w.bhZ && camNow.lens;
    if (isFar !== far) continue;

    project(PR, camNow, w, focal, wx, wy, wz);
    if (!PR[4]) continue;
    const dz = wz - camNow.z;
    const rad = clamp(p.size * Math.pow(ref / dz, 0.85), 0.4, 90);
    const near = smoothstep(0.04 * unit, 0.5 * unit, dz);
    const a = p.lum * Math.exp(-dz / fog) * near * presence * PR[3];
    if (a <= MIN_ALPHA) continue;
    const x = PR[0];
    const y = PR[1];
    const pad = rad * SPRITE_SPREAD;
    if (x < -pad || y < -pad || x > limX + pad || y > limY + pad) continue;
    project(PR2, camPrev, w, focal, wx, wy, wz);
    blit(
      ctx,
      sprites[p.spr],
      x,
      y,
      PR2[4] ? PR2[0] : x,
      PR2[4] ? PR2[1] : y,
      rad,
      a
    );
  }
}

/* ---- polar outflow ---- */

function drawJet(
  ctx: Ctx,
  w: JourneyWorld,
  sprites: HTMLCanvasElement[],
  presence: number,
  focal: number,
  time: number,
  far: boolean
) {
  const unit = w.unit;
  const ref = 8 * unit;
  const fog = 34 * unit;
  const limX = w.cx * 2;
  const limY = w.cy * 2;
  for (const p of w.jet) {
    const isFar = p.wz > w.bhZ && camNow.lens;
    if (isFar !== far) continue;
    project(PR, camNow, w, focal, p.wx, p.wy, p.wz);
    if (!PR[4]) continue;
    const dz = p.wz - camNow.z;
    const rad = clamp(p.size * Math.pow(ref / dz, 0.8), 0.4, 70);
    const near = smoothstep(0.04 * unit, 0.5 * unit, dz);
    const flick = 0.7 + 0.3 * Math.sin(time * p.tw * 1.6 + p.tph);
    const a = p.lum * Math.exp(-dz / fog) * near * flick * presence * PR[3];
    if (a <= MIN_ALPHA) continue;
    const x = PR[0];
    const y = PR[1];
    const pad = rad * SPRITE_SPREAD;
    if (x < -pad || y < -pad || x > limX + pad || y > limY + pad) continue;
    project(PR2, camPrev, w, focal, p.wx, p.wy, p.wz);
    blit(
      ctx,
      sprites[p.spr],
      x,
      y,
      PR2[4] ? PR2[0] : x,
      PR2[4] ? PR2[1] : y,
      rad,
      a
    );
  }
}

/* ---- photon ring + gravitational halo ---- */

function drawRim(
  ctx: Ctx,
  w: JourneyWorld,
  presence: number,
  time: number,
  cssW: number,
  cssH: number
) {
  const te = camNow.te;
  const bx = camNow.bx;
  const by = camNow.by;
  const diag = Math.hypot(cssW, cssH);
  // Retires as the silhouette grows toward the viewport: by then the disc's
  // own material fills the frame and carries the rim far better than any
  // drawn arc could.
  const onScreen = 1 - smoothstep(diag * 0.08, diag * 0.32, te);
  if (onScreen <= 0.002) return;

  // Warm halo of light that grazed the hole without falling in -- soft and
  // wide, so the silhouette sits inside a glow rather than on a background.
  // Strictly an annulus: a radial gradient paints its first stop across
  // everything inside its inner radius, so the interior has to be spelled
  // out as transparent or the halo floods the shadow it is meant to frame.
  const outer = te * 3.6;
  const inner = 1 / 3.6;
  const ha = 0.3 * presence * onScreen;
  const halo = ctx.createRadialGradient(bx, by, 0, bx, by, outer);
  halo.addColorStop(0, "rgba(255,190,126,0)");
  halo.addColorStop(inner * 0.99, "rgba(255,190,126,0)");
  halo.addColorStop(inner, `rgba(255,190,126,${ha})`);
  halo.addColorStop(inner + (1 - inner) * 0.3, `rgba(255,138,70,${ha * 0.34})`);
  halo.addColorStop(1, "rgba(122,64,148,0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = halo;
  // Only the square the halo actually reaches, clipped to the canvas. For
  // most of the journey the hole is a few dozen pixels across, and filling
  // the whole viewport with a gradient every frame to paint it costs more
  // than everything else in this render put together.
  const hx0 = Math.max(0, bx - outer);
  const hy0 = Math.max(0, by - outer);
  const hx1 = Math.min(cssW, bx + outer);
  const hy1 = Math.min(cssH, by + outer);
  if (hx1 > hx0 && hy1 > hy0) {
    ctx.fillRect(hx0, hy0, hx1 - hx0, hy1 - hy0);
  }

  // The ring itself: brightness varies round the circumference with the
  // disc's own beaming and a slow churn, so it never reads as a stroked
  // outline.
  const conic = ctx as unknown as {
    createConicGradient?: (a: number, x: number, y: number) => CanvasGradient;
  };
  let stroke: string | CanvasGradient = "rgba(255,214,168,0.55)";
  if (typeof conic.createConicGradient === "function") {
    const cg = conic.createConicGradient(w.beamAngle, bx, by);
    const STOPS = 14;
    for (let i = 0; i <= STOPS; i++) {
      const f = i / STOPS;
      const ang = f * TAU;
      const beam = Math.pow(0.5 + 0.5 * Math.cos(ang), 1.7);
      const churn =
        0.5 +
        0.28 * Math.sin(ang * 3 + time * 0.35) +
        0.18 * Math.sin(ang * 5 - time * 0.21);
      const v = clamp(0.06 + beam * 1.15 + churn * 0.34, 0, 1.35);
      const vv = Math.min(v, 1);
      cg.addColorStop(
        f,
        `rgba(255,${Math.round(lerp(196, 238, vv))},${Math.round(
          lerp(120, 206, vv)
        )},${clamp(v * 0.62, 0, 0.92)})`
      );
    }
    stroke = cg;
  }
  // Laid down as a stack of thin concentric passes on a bell-shaped profile
  // rather than one wide stroke: a stroke has two hard edges and reads as a
  // drawn outline, whereas the stack falls off smoothly outward the way
  // piled-up light actually does. Widths stay proportional to the silhouette,
  // so it holds as a fine rim at every distance instead of thickening into
  // a band as the hole grows.
  ctx.strokeStyle = stroke;
  const BANDS = 14;
  for (let i = 0; i < BANDS; i++) {
    const f = i / (BANDS - 1);
    const prof = Math.exp(-Math.pow((f - 0.06) / 0.34, 2));
    ctx.globalAlpha = presence * onScreen * 0.14 * prof;
    // Each pass is several times wider than the gap to the next, so the
    // stack reads as one continuous falloff rather than as a set of
    // concentric circles.
    ctx.lineWidth = Math.max(1.6, te * (0.075 + f * 0.05));
    ctx.beginPath();
    ctx.arc(bx, by, te * (0.998 + f * 0.33), 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ *
 * Hooks for things placed in this world from outside
 * ------------------------------------------------------------------ */

/**
 * Everything below exists so the project stations can stand in *this*
 * world, on this camera, rather than in a parallel one of their own: they
 * read the very camera the frame was just drawn with, and project through
 * the identical lens. Nothing here changes what this module draws.
 */

export type JourneyCam = Cam;

/** The camera the frame currently on screen was rendered from. */
export function journeyCamera(): Cam {
  return camNow;
}

/** ...and the same camera one motion-streak step earlier. */
export function journeyCameraPrev(): Cam {
  return camPrev;
}

/** A camera of one's own, to sample the path into at build time. */
export function makeCamera(): Cam {
  return { x: 0, y: 0, z: 0, bx: 0, by: 0, te: 0, lens: true, grip: 1 };
}

/** Where the camera is at an arbitrary point on the journey. */
export function sampleCamera(
  cam: Cam,
  w: JourneyWorld,
  focal: number,
  t: number
) {
  fillCam(cam, w, focal, t);
}

/** The journey's own projection. out: [x, y, k, magnification, ok]. */
export function projectWorld(
  out: Float64Array,
  cam: Cam,
  w: JourneyWorld,
  focal: number,
  wx: number,
  wy: number,
  wz: number
) {
  project(out, cam, w, focal, wx, wy, wz);
}

/**
 * One mote of the interior medium, exactly as drawInner would draw it on the
 * frame just rendered -- on screen or not. out: [x, y, prevX, prevY, radius,
 * alpha]. False when there is nothing of it to draw at all. Its sprite is
 * `w.bank.sprites[w.inner[i].spr]`.
 */
export function viewInteriorMote(
  out: Float64Array,
  w: JourneyWorld,
  i: number,
  focal: number,
  time: number
) {
  const presence = innerPresence(w);
  if (presence <= 0.002) return false;
  // A world rebuilt for a narrower screen has fewer motes than one that
  // was holding on to an index.
  const p = w.inner[i];
  if (!p) return false;
  return viewInner(out, w, p, focal, time, presence, false);
}

/** The journey's own additive glow blit, streaks and all. */
export function blitGlow(
  ctx: Ctx,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  px: number,
  py: number,
  rad: number,
  alpha: number
) {
  blit(ctx, sprite, x, y, px, py, rad, alpha);
}

export { SPRITE_SPREAD, NEAR_CLIP, BG as SPACE_BG };
