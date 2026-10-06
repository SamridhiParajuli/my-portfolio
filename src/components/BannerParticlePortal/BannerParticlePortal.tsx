"use client";

import { useEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  buildJourneyWorld,
  clearJourneyWake,
  makeCamera,
  renderJourney,
  sampleCamera,
  setGalaxyClaim,
  setJourneyDolly,
  setJourneyWake,
  type JourneyWorld,
} from "./blackHoleJourney";
import {
  attachDirector,
  createDirector,
  updateDirector,
  type ScrollHooks,
} from "./journeyDirector";
import {
  createGuide,
  drawGuide,
  guideHandoff,
  guideWake,
  layoutGuide,
  resetGuide,
  solveGuide,
} from "./guideParticle";
import {
  applyStationFrames,
  buildStations,
  drawStationFlares,
  drawStationSpace,
  hideStations,
  makeFrames,
  resetStationCues,
  setStationWidths,
  solveStations,
  type Station,
  type StationFrame,
} from "./projectStations";
import {
  createEduBook,
  disposeEduBook,
  drawEduBook,
  drawEduVeil,
  layoutEduBook,
} from "./educationBook";
import {
  OPEN_DOLLY,
  bookHitRect,
  contactLinks,
  createBookOpening,
  disposeBookOpening,
  drawBookOpeningBack,
  drawBookOpeningFront,
  frameBookOpening,
  layoutBookOpening,
  openingDolly,
  openingVeil,
  renderBookOpening,
  requestBookOpen,
  resetBookOpening,
  tickBookOpening,
} from "./bookOpening";
import { PAGES } from "./bookSpread";
import { CONTACT } from "./contactPage";
import ProjectStations from "@/components/ProjectStations/ProjectStations";
import styles from "./BannerParticlePortal.module.css";

gsap.registerPlugin(ScrollTrigger);

const BANNER_SRC = "/images/intro/banner.png";

// Scroll-progress checkpoints: 0..HOME_END is the banner cracking apart in
// place (mosaic gaps opening, no travel yet); HOME_END..1 is travel, split
// between the drift/galaxy leg and the final approach into the portal.
const HOME_END = 0.2;
const DRIFT_PORTION = 0.55; // fraction of the travel range spent drifting before converging on the portal
// Per-particle timing spread during travel, as a fraction of the travel
// range -- what makes pieces arrive at different moments instead of all
// moving in lockstep.
const STAGGER = 0.28;

const GRID = {
  desktop: { cols: 46, maxRows: 30 },
  mobile: { cols: 26, maxRows: 20 },
};

// Radians of extra rotation applied to a portal particle per unit of its
// *original* normalized distance from center (0 at the banner's center,
// 1 at its farthest corner) -- the differential-rotation shear that curls
// the field into spiral arms winding around the void instead of a
// uniform ring.
const SPIRAL_STRENGTH = 3.0;

// How much extra scroll distance to pin through, expressed relative to the
// pinned hero's own height (GSAP resolves "%" against the trigger element's
// natural size) -- keeps the scrub distance proportional to viewport height
// without needing a separate spacer element in the DOM.
//
// The pin is split into two legs that share one continuous scroll range
// and one canvas. The first is the original banner -> galaxy transform, and
// it still occupies exactly the 220% of scroll distance it always did -- so
// every pixel of that sequence lands on the same scroll position as before.
// The second is the journey into the black hole, through the five worlds
// inside it, and down to where the Education book is made. It is not
// scrubbed: it is a row of stops the journey director flies the camera
// between, one scroll each (see journeyDirector), and its scroll distance
// is only what gives each stop a place on the page -- one screen apiece,
// so the scrollbar still means something. The last stop is the end of the
// page: the book is made there, opened and read, with no more scrolling.
const LEGACY_PERCENT = 220;
const STOP_PERCENT = 100;
const STOP_COUNT = createDirector().stops.length;
const GUIDE_PERCENT = STOP_PERCENT * (STOP_COUNT - 1);
const TOTAL_PERCENT = LEGACY_PERCENT + GUIDE_PERCENT;
const PIN_DISTANCE = `+=${TOTAL_PERCENT}%`;
// Where the first leg ends within the combined trigger's 0..1 progress --
// which is the gateway, the journey's first stop.
const LEGACY_SPAN = LEGACY_PERCENT / TOTAL_PERCENT;
// ...and how far apart the stops are.
const STOP_SPAN = STOP_PERCENT / TOTAL_PERCENT;
// The book (see educationBook) is not scrolled into being: once the camera
// is at rest at the last stop it forms on its own clock, start to finish,
// at the pace it was always let form at -- seconds for the whole formation
// forward, and for undoing it once the journey is sent back...
const EDU_MIN_FORWARD_S = 6.5;
const EDU_MIN_BACK_S = 2.4;
// ...and how gently, per second, it eases into its final rest.
const EDU_FOLLOW = 3.2;

type Props = {
  revealed: boolean;
  pinRef: RefObject<HTMLElement | null>;
  /** Told when the journey comes to rest at the gateway -- the galaxy
   *  formed round its opening, waiting for the scroll that starts it -- and
   *  when it leaves. */
  onGateway?: (resting: boolean) => void;
};

type Particle = {
  homeX: number;
  homeY: number;
  w: number;
  h: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  driftX: number;
  driftY: number;
  portalX: number;
  portalY: number;
  curveCtrlX: number;
  curveCtrlY: number;
  portalDepthScale: number;
  portalDepthAlpha: number;
  idlePhase: number;
  idleSpeed: number;
  idleAmpX: number;
  idleAmpY: number;
  idleSpin: number;
  dotColor: string;
  dotRadius: number;
  seed: number;
  rotSign: number;
  // Depth this particle occupies once the camera starts moving (see
  // blackHoleJourney). Purely additive: the journey render un-projects the
  // particle's own 2D position through this depth, so at the camera's start
  // position the projection is the identity and nothing about the settled
  // galaxy changes.
  zWorld: number;
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// Deterministic 0..1 pseudo-random from an integer index -- reproducible
// per particle across rebuilds, no seeded-RNG state to carry around.
function hash(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Angle -> radius multiplier for the void's boundary: a few irregular sine
// harmonics so the opening bulges and pinches per direction instead of
// tracing a smooth ellipse (let alone a rectangle) -- the organic silhouette
// the portal's particle density gathers around.
function voidRadiusMult(angle: number) {
  return (
    1 +
    0.1 * Math.sin(angle * 1 + 1.8) +
    0.18 * Math.sin(angle * 3 + 0.4) +
    0.11 * Math.sin(angle * 5 + 3.1) +
    0.07 * Math.sin(angle * 8 + 5.2)
  );
}

export default function BannerParticlePortal({
  revealed,
  pinRef,
  onGateway,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Carries only the dust that is genuinely in front of a project screen,
  // which is the one thing that cannot be drawn on the canvas underneath.
  const dustCanvasRef = useRef<HTMLCanvasElement>(null);
  // The Education book once it is opened: drawn live (WebGL), between the
  // universe and the dust in front of it. And what catches the click that
  // opens it.
  const bookCanvasRef = useRef<HTMLCanvasElement>(null);
  const bookHitRef = useRef<HTMLButtonElement>(null);
  // Over each address on the scroll's last page, once it has been written
  // there: what follows it. Nothing to see -- the ink is the thing to click.
  const contactLinkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  // The project screens' own DOM, filled in by ProjectStations. Written to
  // imperatively on the same frame loop as the canvas so the screens and
  // the universe around them can never disagree about where the camera is.
  const stationNodesRef = useRef<(HTMLDivElement | null)[]>([]);
  // ...and each distant world's title card, in a layer over everything.
  const cardNodesRef = useRef<(HTMLDivElement | null)[]>([]);
  const revealedRef = useRef(revealed);
  const onGatewayRef = useRef(onGateway);
  const renderRef = useRef<(progress: number) => void>(() => {});
  const lastProgressRef = useRef(0);
  const triggerRef = useRef<ScrollTrigger | null>(null);
  // Seconds elapsed since this effect mounted -- read inside render() to
  // drive the idle orbit/spin so drifted particles keep moving between
  // scroll events instead of freezing the instant scroll stops.
  const timeRef = useRef(0);

  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);

  useEffect(() => {
    onGatewayRef.current = onGateway;
  }, [onGateway]);

  // Reveals the canvas the instant the real fold/unfold animation settles.
  // At progress 0 every particle sits at its exact home cell with no gap,
  // rotation or shrink, so the canvas's first frame reconstructs the
  // banner pixel-for-pixel -- this opacity flip is invisible, never two
  // different-looking banners on screen, just a handoff between two that
  // already match exactly.
  useEffect(() => {
    if (!revealed) return;
    renderRef.current(lastProgressRef.current);
    triggerRef.current?.refresh();
  }, [revealed]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    const dustCanvas = dustCanvasRef.current;
    const bookCanvas = bookCanvasRef.current;
    const bookHit = bookHitRef.current;
    const pinTarget = pinRef.current;
    if (
      !wrapper ||
      !canvas ||
      !dustCanvas ||
      !bookCanvas ||
      !bookHit ||
      !pinTarget
    ) {
      return;
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    // Reduced motion skips the scroll-jacked transform entirely -- no pin,
    // no extra scroll distance, the settled banner is simply left alone.
    // data-active gates the wrapper's opaque backdrop (see the CSS): it
    // must stay off here, otherwise the wrapper would still paint over the
    // real banner once revealed with nothing drawn on the canvas to show
    // in its place -- a plain dark rectangle instead of the banner.
    if (reduceMotion) return;
    wrapper.dataset.active = "true";

    const ctx = canvas.getContext("2d");
    const dustCtx = dustCanvas.getContext("2d");
    if (!ctx || !dustCtx) return;

    const img = new window.Image();
    img.src = BANNER_SRC;
    let imgReady = false;

    let cssW = 0;
    let cssH = 0;
    let particles: Particle[] = [];
    // Focal length of the journey camera, and the unit its world is built
    // in. Tied to viewport height so the environment scales with the screen.
    let focal = 0;
    let journey: JourneyWorld | null = null;
    let stations: Station[] = [];
    let frames: StationFrame[] = [];
    // The Education book, whether it is wanted (the journey is at rest at
    // its last stop), and how far it has formed (eased toward that on every
    // frame of the loop below).
    const edu = createEduBook();
    let eduWanted = 0;
    let eduE = 0;
    // ...and its opening, once it is clicked (see bookOpening).
    const opening = createBookOpening();
    // What flies the camera past the galaxy, one scroll per stop, and the
    // mote of the galaxy it follows there.
    const director = createDirector();
    const guide = createGuide();
    const guideCam = makeCamera();
    let hitKey = "";
    const placeBookHit = (rect: [number, number, number, number] | null) => {
      const key = rect ? rect.map((v) => Math.round(v)).join(",") : "";
      if (key === hitKey) return;
      hitKey = key;
      if (!rect) {
        bookHit.style.display = "none";
        bookHit.tabIndex = -1;
        opening.hovering = false;
        return;
      }
      const [x, y, w, h] = rect;
      bookHit.style.display = "block";
      bookHit.style.left = `${Math.round(x)}px`;
      bookHit.style.top = `${Math.round(y)}px`;
      bookHit.style.width = `${Math.round(w)}px`;
      bookHit.style.height = `${Math.round(h)}px`;
      bookHit.tabIndex = 0;
    };
    const linkKeys = CONTACT.entries.map(() => "");
    const placeContactLinks = (
      rects: ReadonlyArray<[number, number, number, number] | null> | null
    ) => {
      contactLinkRefs.current.forEach((a, i) => {
        if (!a) return;
        const r = rects?.[i] ?? null;
        const key = r ? r.map((v) => Math.round(v)).join(",") : "";
        if (key === linkKeys[i]) return;
        linkKeys[i] = key;
        if (!r) {
          a.style.display = "none";
          a.tabIndex = -1;
          return;
        }
        a.style.display = "block";
        a.style.left = `${Math.round(r[0])}px`;
        a.style.top = `${Math.round(r[1])}px`;
        a.style.width = `${Math.round(r[2])}px`;
        a.style.height = `${Math.round(r[3])}px`;
        a.tabIndex = 0;
      });
    };
    const onBookClick = () => {
      requestBookOpen(opening);
      bookHit.blur();
      placeBookHit(null);
    };
    const onBookEnter = () => {
      opening.hovering = true;
    };
    const onBookLeave = () => {
      opening.hovering = false;
    };
    bookHit.addEventListener("click", onBookClick);
    bookHit.addEventListener("pointerenter", onBookEnter);
    bookHit.addEventListener("pointerleave", onBookLeave);
    bookHit.addEventListener("focus", onBookEnter);
    bookHit.addEventListener("blur", onBookLeave);

    const easeTravel = gsap.parseEase("power2.inOut");
    const easeFrag = gsap.parseEase("power1.out");

    const buildParticles = () => {
      if (!imgReady || cssW === 0 || cssH === 0) return;

      const small = window.innerWidth < 700;
      const { cols: baseCols, maxRows } = small ? GRID.mobile : GRID.desktop;

      const aspect = cssW / cssH;
      let cols = baseCols;
      let rows = Math.max(1, Math.round(cols / aspect));
      if (rows > maxRows) {
        rows = maxRows;
        cols = Math.max(1, Math.round(rows * aspect));
      }

      const blockW = cssW / cols;
      const blockH = cssH / rows;

      // Cover-fit mapping between the displayed canvas and the source
      // image's own natural pixel space -- same math CSS background-size:
      // cover would use -- so each cell's destination rect can be inverted
      // back into an exact source crop.
      const scale = Math.max(
        cssW / img.naturalWidth,
        cssH / img.naturalHeight
      );
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const offsetX = (cssW - drawW) / 2;
      const offsetY = (cssH - drawH) / 2;

      const cx = cssW / 2;
      const cy = cssH / 2;
      // Distance from center to the grid's farthest corner -- used to
      // normalize each particle's original distance from center to 0..1
      // for the spiral twist below, independent of screen size.
      const maxGridRadius = Math.hypot(cssW / 2, cssH / 2);
      // Half-extents of the central void the portal particles gather
      // around -- the closest a particle's target can be to center before
      // the organic bulge/pinch, spiral twist, and per-particle scatter
      // below push it outward. Nothing is ever targeted inside this
      // boundary, which is what keeps the center dark and empty without
      // drawing anything there. Roughly circular (a whirlpool/wormhole
      // opening, not a vertical doorway slit) -- the organic harmonics
      // still rough up the edge so it's not a perfect circle.
      const voidBase = clamp(Math.min(cssW, cssH) * 0.34, 60, 340);
      const voidHalfW = voidBase;
      const voidHalfH = voidBase * 0.94;

      // One averaged color per tile, sampled up front -- a single
      // downscaled drawImage (banner -> a cols x rows canvas, one pixel
      // per tile) plus one getImageData, instead of sampling each tile's
      // crop individually. This is what a tile's glow-dot particle renders
      // as once it transforms (see render()); lightened slightly so it
      // still reads brightly against black even where the source photo is
      // dark or muted.
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = cols;
      sampleCanvas.height = rows;
      const sampleCtx = sampleCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      let sampleData: Uint8ClampedArray | null = null;
      if (sampleCtx) {
        sampleCtx.drawImage(
          img,
          offsetX / blockW,
          offsetY / blockH,
          drawW / blockW,
          drawH / blockH
        );
        sampleData = sampleCtx.getImageData(0, 0, cols, rows).data;
      }

      const list: Particle[] = [];
      let idx = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const homeX = col * blockW + blockW / 2;
          const homeY = row * blockH + blockH / 2;

          const sx = clamp(
            (col * blockW - offsetX) / scale,
            0,
            img.naturalWidth
          );
          const sy = clamp(
            (row * blockH - offsetY) / scale,
            0,
            img.naturalHeight
          );
          const sw = clamp(blockW / scale, 1, img.naturalWidth - sx);
          const sh = clamp(blockH / scale, 1, img.naturalHeight - sy);

          const seed = hash(idx);
          const seed2 = hash(idx * 7.31 + 1);
          const seed3 = hash(idx * 3.17 + 2);
          const seed4 = hash(idx * 5.77 + 9);
          const seed5 = hash(idx * 2.13 + 5);
          const rotSign = seed2 > 0.5 ? 1 : -1;

          const dx = homeX - cx;
          const dy = homeY - cy;
          const baseAngle = Math.atan2(dy, dx);
          const baseRadius = Math.hypot(dx, dy);

          // Galaxy/drift target: pushed outward well past its home radius,
          // with a per-particle swirl offset added to its angle (rather
          // than a pure radial expansion) so the field reads as orbiting
          // rather than simply exploding outward, and squashed vertically
          // into a looser disc for a galaxy-plane feel.
          const swirl = (seed - 0.5) * 1.6;
          const driftAngle = baseAngle + swirl;
          const driftRadius = baseRadius * lerp(1.35, 2.3, seed2) + 40;
          const driftX = cx + Math.cos(driftAngle) * driftRadius;
          const driftY = cy + Math.sin(driftAngle) * driftRadius * 0.68;

          // Portal target: no rectangle, no drawn outline. Radial placement
          // (how far outside the void a particle lands) is decided first,
          // independent of angle -- most land close to the rim (denser
          // immediately around the opening), fewer scatter further out.
          // Each particle is also reassigned to its own angle around
          // center (a swirl offset decorrelated from the drift swirl
          // above), so the drift->portal paths cross rather than mapping
          // 1:1.
          const density = Math.pow(seed2, 2.4); // biased toward 0 -> most particles land near the rim
          const scatter =
            lerp(0.04, 2.0, density) + (seed4 - 0.5) * (0.15 + density * 0.6);
          const radiusMult = clamp(1 + scatter, 0.8, 3.2);

          // Spiral twist: the further a particle's *original* position sat
          // from center in the intact banner, the further it gets rotated
          // around center for the portal -- a differential-rotation shear
          // (the same mechanism that winds real spiral galaxies) that
          // curls the whole field into arms winding around the void,
          // instead of a uniform ring. Tied to baseRadius rather than the
          // final scatter distance so it varies smoothly across virtually
          // every particle, not just the sparse outer scatter. Every
          // particle twists the same direction (SPIRAL_STRENGTH is a
          // constant, not per-particle) so the arms read as one coherent
          // vortex rather than noise.
          const normRadius = clamp(baseRadius / maxGridRadius, 0, 1);
          const spiralTwist = normRadius * SPIRAL_STRENGTH;
          const portalAngle = baseAngle + (seed3 - 0.5) * 0.8 + spiralTwist;

          // The void's boundary still bulges and pinches per angle
          // (voidRadiusMult) instead of tracing a perfect circle, and
          // per-particle jitter (folded into `scatter` above) keeps the
          // arms from lining up into a clean, hard-edged spiral.
          const shapeMult = clamp(voidRadiusMult(portalAngle), 0.65, 1.4);
          const rimX = voidHalfW * shapeMult;
          const rimY = voidHalfH * shapeMult;
          const portalX = cx + Math.cos(portalAngle) * rimX * radiusMult;
          const portalY = cy + Math.sin(portalAngle) * rimY * radiusMult;

          // Bends the drift->portal leg into an arc (quadratic Bezier via a
          // perpendicular control point) instead of a straight slide, so
          // the final approach still reads as curved, orbit-like motion.
          const segX = portalX - driftX;
          const segY = portalY - driftY;
          const segLen = Math.hypot(segX, segY) || 1;
          const curveStrength = segLen * lerp(0.12, 0.42, seed);
          const curveCtrlX =
            (driftX + portalX) / 2 +
            (-segY / segLen) * curveStrength * rotSign;
          const curveCtrlY =
            (driftY + portalY) / 2 +
            (segX / segLen) * curveStrength * rotSign;

          // Depth: closer particles land bigger and more opaque and draw
          // on top (see the sort below); farther ones shrink, dim, and sit
          // behind -- so the formation has real front-to-back depth instead
          // of every particle living on one flat plane.
          const portalDepthScale = lerp(0.55, 1.55, seed5);
          const portalDepthAlpha = lerp(0.4, 1, seed5);

          // Idle drift: once a particle has left its home cell it keeps
          // gently orbiting/spinning using real elapsed time (see the
          // render loop's timeRef) instead of sitting frozen whenever
          // scroll stops -- the "still floating in space" motion for the
          // drifted/portal state. Amplitude is tied to the particle's own
          // cell size so it scales naturally across grid density/screens.
          const seed6 = hash(idx * 4.43 + 13);
          const seed7 = hash(idx * 6.19 + 17);
          const seed8 = hash(idx * 8.87 + 23);
          const idlePhase = seed6 * Math.PI * 2;
          const idleSpeed = lerp(0.4, 1.0, seed7);
          const idleAmpX = blockW * lerp(0.15, 0.55, seed);
          const idleAmpY = blockH * lerp(0.15, 0.55, seed3);
          const idleSpin = (seed8 - 0.5) * 1.2;

          const sampleIdx = (row * cols + col) * 4;
          const rawR = sampleData ? sampleData[sampleIdx] : 200;
          const rawG = sampleData ? sampleData[sampleIdx + 1] : 200;
          const rawB = sampleData ? sampleData[sampleIdx + 2] : 200;
          const dotColor = `${Math.round(lerp(rawR, 255, 0.15))},${Math.round(
            lerp(rawG, 255, 0.15)
          )},${Math.round(lerp(rawB, 255, 0.15))}`;
          const dotRadius = Math.min(blockW, blockH) * lerp(0.09, 0.18, seed4);

          // Depth in the journey's world, correlated with the depth cue the
          // portal formation already encodes (seed5 drives portalDepthScale,
          // so the particles that already *look* closest really are), then
          // spread so the field streams past the camera over a long stretch
          // of travel rather than all at once.
          const zWorld =
            lerp(9.5, 1.1, seed5) * focal * lerp(0.85, 1.3, hash(idx * 9.13 + 31));

          list.push({
            homeX,
            homeY,
            w: blockW,
            h: blockH,
            sx,
            sy,
            sw,
            sh,
            driftX,
            driftY,
            portalX,
            portalY,
            curveCtrlX,
            curveCtrlY,
            portalDepthScale,
            portalDepthAlpha,
            idlePhase,
            idleSpeed,
            idleAmpX,
            idleAmpY,
            idleSpin,
            dotColor,
            dotRadius,
            seed,
            rotSign,
            zWorld,
          });
          idx++;
        }
      }
      // Farther (smaller/dimmer) particles first, closer ones last, so
      // closer particles naturally overlap on top of farther ones once the
      // portal formation's paths start crossing.
      list.sort((a, b) => a.portalDepthScale - b.portalDepthScale);
      particles = list;

      journey = buildJourneyWorld(cssW, cssH, focal, small);
      // The project screens are placed in that same world, against that
      // same camera path -- not in a layout of their own.
      stations = buildStations(journey, focal, cssW, cssH, small);
      // Kept across rebuilds: they remember which entrances have played,
      // and a phone's toolbar resizing the page mid-scroll must not replay
      // one.
      if (frames.length !== stations.length) {
        frames = makeFrames(stations.length);
      }
      setStationWidths(stationNodesRef.current, cardNodesRef.current, stations);
      // The guide is one of these particles, and rests beside those worlds.
      layoutGuide(
        guide,
        particles,
        journey,
        stations,
        focal,
        cssW,
        cssH,
        director.pos === 0
      );
      // ...and so is the book, which is painted in idle time from here on,
      // long before the camera gets to where it is needed.
      layoutEduBook(edu, journey, cssW, cssH, small);
      layoutBookOpening(opening, bookCanvas, cssW, cssH, small);
    };

    const render = (rawProgress: number) => {
      if (!imgReady || cssW === 0 || cssH === 0) return;

      // One scroll range, and the banner's own leg is untouched: it still
      // runs 0..1 over exactly the scroll distance it always did. From the
      // gateway on, the frame is the journey's -- flown by the director, not
      // the scroll -- and its first frame, at rest at the gateway, is a pixel
      // match for the banner leg's last, so the handoff has no boundary.
      const journeyOn =
        rawProgress >= LEGACY_SPAN || director.pos > 0 || director.target > 0;
      if (journeyOn && journey) {
        const t = director.t;
        const time = timeRef.current;
        // Zero until the book is opened; then the camera goes on in.
        const dolly = openingDolly(opening) * OPEN_DOLLY * journey.unit;
        setJourneyDolly(dolly);
        // The guide, worked out against the camera this frame is about to
        // be drawn from -- first, so the field it passes through can part
        // round it. Once the book is being made of it, it is the book's.
        sampleCamera(guideCam, journey, focal, t);
        guideCam.z += dolly;
        solveGuide(guide, director, guideCam, journey, focal, time);
        // Until the book has begun, it is told where the guide is resting,
        // so that when it does begin, the guide is its seed.
        if (!edu.cued) {
          edu.handoff =
            director.pos === director.last ? guideHandoff(guide) : null;
        }
        if (eduE > 0) guide.on = false;
        setGalaxyClaim(guide.claimed ? guide.p : null);
        const wake = guide.on ? guideWake(guide, director) : null;
        if (wake) setJourneyWake(...wake);
        else clearJourneyWake();
        renderJourney(
          ctx,
          journey,
          particles,
          t,
          time,
          cssW,
          cssH,
          focal,
          { prevT: director.prevT, presence: director.presence }
        );
        // Solved against the camera the frame was just drawn from, so a
        // screen's size and place in frame are the same fact as everything
        // else on screen rather than a parallel animation of their own.
        solveStations(stations, journey, focal, t, timeRef.current, frames);
        applyStationFrames(
          stationNodesRef.current,
          cardNodesRef.current,
          stations,
          frames
        );
        // Each place is split across the screen's own plane: the far half
        // of its cloud and the light at its centre go on the universe's
        // canvas, under the screen; the near half on the canvas above it.
        drawStationSpace(
          ctx,
          stations,
          journey,
          focal,
          timeRef.current,
          frames,
          true
        );
        dustCtx.clearRect(0, 0, cssW, cssH);
        drawStationSpace(
          dustCtx,
          stations,
          journey,
          focal,
          timeRef.current,
          frames,
          false
        );
        // The guide, over everything else out there -- and past it, nothing
        // is disturbed by it any more.
        drawGuide(ctx, guide, journey, time);
        clearJourneyWake();
        // Any entrance's flare and letterbox, over all of it.
        drawStationFlares(dustCtx, stations, frames, cssW, cssH);
        // Past the last project: the universe dims a little behind the book
        // it is gathering itself into (and a little more while its page is
        // read), and the book is drawn over it. Both are nothing at all
        // until it has begun.
        drawEduVeil(ctx, eduE, cssW, cssH, openingVeil(opening));
        // Once it is clicked, the book opens: the painted one hands over
        // to a live one drawn between the universe and the dust, lit by a
        // light laid under it and shedding dust over it.
        const ov = frameBookOpening(opening, edu, time);
        drawBookOpeningBack(ctx, opening, edu, journey, focal, time);
        drawEduBook(dustCtx, edu, journey, focal, eduE, time, ov);
        renderBookOpening(opening, edu, time);
        drawBookOpeningFront(dustCtx, opening, edu, journey, time);
        placeBookHit(
          bookHitRect(
            opening,
            edu,
            time,
            eduE,
            eduWanted
          )
        );
        placeContactLinks(contactLinks(opening));
        return;
      }

      // Still in the banner's own leg: the projects do not exist yet, and
      // each will make its entrance again once the journey reaches it --
      // nor does the book, which hands back what it took.
      hideStations(stationNodesRef.current, cardNodesRef.current);
      resetStationCues(frames);
      eduE = 0;
      resetBookOpening(opening, journey);
      setJourneyDolly(0);
      placeBookHit(null);
      placeContactLinks(null);
      // ...and the guide is one of the galaxy's motes again.
      resetGuide(guide);
      setGalaxyClaim(null);
      clearJourneyWake();
      if (journey) drawEduBook(dustCtx, edu, journey, focal, 0, timeRef.current);
      dustCtx.clearRect(0, 0, cssW, cssH);

      const progress = clamp(rawProgress / LEGACY_SPAN, 0, 1);
      ctx.clearRect(0, 0, cssW, cssH);

      for (const p of particles) {
        const fragT = clamp(progress / HOME_END, 0, 1);
        const fragEase = easeFrag(fragT);

        let x = p.homeX;
        let y = p.homeY;
        // 0 = still home, 0.5 = fully drifted, 1 = fully at the portal --
        // continuous across both travel legs, used to drive scale/rotation
        // so nothing jumps at the drift/portal handoff.
        let travelT = 0;
        // 0 until the second leg starts, ramping to 1 as the particle
        // reaches its portal target -- blends the depth scale/alpha in
        // only during the final approach, leaving the explosion/drift legs
        // untouched.
        let depthWeight = 0;

        if (progress > HOME_END) {
          const travel = clamp((progress - HOME_END) / (1 - HOME_END), 0, 1);
          // Shifts each particle's own start of travel by up to STAGGER,
          // guaranteed to still reach 1 exactly when travel does -- the
          // "different pieces move at different times" organic stagger.
          const effTravel = clamp(
            (travel - p.seed * STAGGER) / (1 - STAGGER),
            0,
            1
          );

          if (effTravel <= DRIFT_PORTION) {
            const dt = easeTravel(effTravel / DRIFT_PORTION);
            x = lerp(p.homeX, p.driftX, dt);
            y = lerp(p.homeY, p.driftY, dt);
            travelT = dt * 0.5;
          } else {
            const dt = easeTravel(
              (effTravel - DRIFT_PORTION) / (1 - DRIFT_PORTION)
            );
            // Quadratic Bezier through the precomputed control point --
            // curves the final approach into the portal instead of
            // sliding straight across the gap.
            const it = 1 - dt;
            x =
              it * it * p.driftX +
              2 * it * dt * p.curveCtrlX +
              dt * dt * p.portalX;
            y =
              it * it * p.driftY +
              2 * it * dt * p.curveCtrlY +
              dt * dt * p.portalY;
            travelT = 0.5 + dt * 0.5;
            depthWeight = dt;
          }
        }

        // Idle orbit: only once a particle has actually left its home cell
        // (travelT > 0) -- fades in smoothly alongside the same travel
        // progress, so the still-intact banner at progress 0 is never
        // disturbed, but everything adrift keeps gently circling in place.
        if (travelT > 0) {
          const idleAngle = timeRef.current * p.idleSpeed + p.idlePhase;
          x += Math.cos(idleAngle) * p.idleAmpX * travelT;
          y += Math.sin(idleAngle * 1.15 + p.seed * 6.28) * p.idleAmpY * travelT;
        }

        const gapShrink = lerp(1, 0.78, fragEase);
        const travelShrink = lerp(1, 0.55, travelT);
        const depthScale = lerp(1, p.portalDepthScale, depthWeight);
        const depthAlpha = lerp(1, p.portalDepthAlpha, depthWeight);
        const scale = gapShrink * travelShrink * depthScale;
        const rotation =
          p.rotSign * (fragEase * 6 + travelT * 26) * (Math.PI / 180) +
          p.idleSpin * timeRef.current * travelT;

        // +1px regardless of scale: at rest (scale~1) this is a tiny
        // neighbor-overlap that hides the sub-pixel seams floating-point
        // tile edges otherwise leave under canvas antialiasing (the same
        // fix PaperBallAnimation's fragments use); it stays negligible
        // once gapShrink/travelShrink actually pull tiles apart on
        // purpose, so the intentional gaps still read clearly.
        const w = p.w * scale + 1;
        const h = p.h * scale + 1;

        // Photo tile -> glow-dot cross-fade: 0 (still a little photo
        // fragment) through most of the crack/explosion, easing up to 1
        // (a small glowing point, nothing photographic left) by the time a
        // particle finishes its journey. Smoothstepped so the transform
        // itself reads as gradual rather than a hard swap partway through.
        const particleT = travelT * travelT * (3 - 2 * travelT);

        if (particleT < 0.999) {
          ctx.save();
          ctx.globalAlpha = depthAlpha * (1 - particleT);
          ctx.translate(x, y);
          ctx.rotate(rotation);
          ctx.drawImage(img, p.sx, p.sy, p.sw, p.sh, -w / 2, -h / 2, w, h);
          ctx.restore();
        }

        if (particleT > 0.001) {
          // Gentle brightness pulse (reusing the idle orbit's own
          // speed/phase so it stays in sync with that particle's motion)
          // so the settled dust field reads as alive rather than static.
          const twinkle =
            0.82 +
            0.18 * Math.sin(timeRef.current * p.idleSpeed * 2.3 + p.idlePhase * 1.7);
          const dotR = p.dotRadius * depthScale * twinkle;
          const alpha = depthAlpha * particleT;

          // Three concentric, additively-blended circles fake a soft glow
          // falloff cheaply (no per-particle gradients) -- a dim wide
          // halo, a brighter mid ring, and a bright core, which is what
          // gives the dust its bloom against the black backdrop and lets
          // overlapping particles naturally brighten each other.
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = `rgb(${p.dotColor})`;

          ctx.globalAlpha = alpha * 0.1;
          ctx.beginPath();
          ctx.arc(x, y, dotR * 2.0, 0, Math.PI * 2);
          ctx.fill();

          ctx.globalAlpha = alpha * 0.22;
          ctx.beginPath();
          ctx.arc(x, y, dotR * 1.3, 0, Math.PI * 2);
          ctx.fill();

          ctx.globalAlpha = alpha * 0.9;
          ctx.beginPath();
          ctx.arc(x, y, dotR, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    };
    renderRef.current = render;

    let trigger: ScrollTrigger | null = null;

    const resize = () => {
      const rect = pinTarget.getBoundingClientRect();
      cssW = rect.width;
      cssH = rect.height;
      focal = cssH;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const [el, c] of [
        [canvas, ctx],
        [dustCanvas, dustCtx],
      ] as const) {
        el.width = Math.round(cssW * dpr);
        el.height = Math.round(cssH * dpr);
        el.style.width = `${cssW}px`;
        el.style.height = `${cssH}px`;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      buildParticles();
      render(lastProgressRef.current);
      trigger?.refresh();
    };

    let resizeFrame = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(resize);
    };

    const handleLoad = () => {
      imgReady = true;
      resize();
    };

    if (img.complete && img.naturalWidth > 0) {
      handleLoad();
    } else {
      img.addEventListener("load", handleLoad);
    }

    trigger = ScrollTrigger.create({
      trigger: pinTarget,
      start: "top top",
      end: PIN_DISTANCE,
      pin: pinTarget,
      // The hero's parent (<body>) is a flex container (Tailwind's "flex
      // flex-col" in layout.tsx). GSAP's default pinSpacing heuristic
      // silently disables itself for flex-parented pins unless told
      // otherwise, which left zero scroll distance actually reserved even
      // though the trigger's own math was correct -- this forces it on.
      pinSpacing: true,
      scrub: true,
      // Rendering itself happens on the rAF loop below (so idle motion
      // keeps animating between scroll events) -- this only needs to hand
      // it the latest scroll-driven progress.
      onUpdate: (self) => {
        lastProgressRef.current = self.progress;
      },
    });
    triggerRef.current = trigger;

    // How the director reads and moves the page: each stop is a scroll
    // position of its own, and it puts the page there as it sets off, so
    // the page is always where the journey is going.
    const scrollHooks: ScrollHooks = {
      raw: () => lastProgressRef.current,
      rawOf: (k) => LEGACY_SPAN + k * STOP_SPAN,
      px: () => {
        const st = triggerRef.current;
        const len = st ? st.end - st.start : 0;
        return len > 0 ? 1 / len : 1e-4;
      },
      scrollTo: (raw) => {
        const st = triggerRef.current;
        if (!st) return raw;
        const len = st.end - st.start;
        const y = Math.round(st.start + raw * len);
        window.scrollTo({ top: y, behavior: "instant" });
        return len > 0 ? (y - st.start) / len : raw;
      },
    };
    const detachDirector = attachDirector(
      director,
      scrollHooks,
      () => timeRef.current
    );

    window.addEventListener("resize", onResize);

    // Keeps rendering every frame (not just on scroll) so idle orbit/spin
    // motion plays continuously once particles are adrift, rather than
    // freezing the instant the user stops scrolling. Gated on actually
    // being on screen -- revealed never goes back to false once the intro
    // settles, so without this the loop would otherwise keep redrawing
    // forever after the user scrolls past the hero entirely.
    let isVisible = false;
    let atGateway = false;
    const startTime = performance.now();
    let rafId = 0;
    let lastNow = startTime;
    const tick = (now: number) => {
      timeRef.current = (now - startTime) / 1000;
      const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
      lastNow = now;
      // The book is made once the journey has come to rest at its last
      // stop, and unmade once the journey is sent back from it -- on its own
      // clock either way, eased, and never faster than it can be believed
      // to be forming.
      eduWanted =
        director.pos === director.last && director.target === director.last
          ? 1
          : 0;
      // An open book has to shut before the universe can take it apart,
      // so while it is open (or opening, or shutting) it is held formed.
      const held = tickBookOpening(opening, edu, dt, eduE, eduWanted);
      const target = held ? 1 : eduWanted;
      const step = (target - eduE) * (1 - Math.exp(-dt * EDU_FOLLOW));
      eduE = clamp(
        eduE + clamp(step, -dt / EDU_MIN_BACK_S, dt / EDU_MIN_FORWARD_S),
        0,
        1
      );
      if (Math.abs(target - eduE) < 1e-4) eduE = target;
      // The journey, on its own clock. It may not leave the book's stop
      // until the book has been unmade, and no scroll is its own while the
      // book is being made.
      director.canLeaveLast = eduE <= 0.0005 && !held;
      director.bookFormed = eduE >= 1;
      updateDirector(director, dt, timeRef.current, scrollHooks);
      // Resting at the gateway, with the page there too (not scrolled back
      // up into the galaxy): the journey is waiting for its first scroll.
      const resting =
        director.pos === 0 &&
        director.target === 0 &&
        lastProgressRef.current >= LEGACY_SPAN - scrollHooks.px() * 3;
      if (resting !== atGateway) {
        atGateway = resting;
        onGatewayRef.current?.(resting);
      }
      if (revealedRef.current && isVisible) render(lastProgressRef.current);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0]?.isIntersecting ?? false;
      },
      { threshold: 0 }
    );
    visibilityObserver.observe(wrapper);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(resizeFrame);
      cancelAnimationFrame(rafId);
      visibilityObserver.disconnect();
      img.removeEventListener("load", handleLoad);
      disposeEduBook(edu);
      disposeBookOpening(opening);
      setJourneyDolly(0);
      detachDirector();
      if (atGateway) onGatewayRef.current?.(false);
      setGalaxyClaim(null);
      clearJourneyWake();
      bookHit.removeEventListener("click", onBookClick);
      bookHit.removeEventListener("pointerenter", onBookEnter);
      bookHit.removeEventListener("pointerleave", onBookLeave);
      bookHit.removeEventListener("focus", onBookEnter);
      bookHit.removeEventListener("blur", onBookLeave);
      trigger?.kill();
      triggerRef.current = null;
    };
  }, [pinRef]);

  return (
    <div ref={wrapperRef} className={styles.wrapper} data-revealed={revealed}>
      {/* Layers, in depth order. Any distant world first, since everything
          the universe draws is nearer than it; the universe; then the
          project screens standing in it -- which have to be solid, or the
          field behind them shows straight through and they read as windows
          rather than objects -- then the handful of motes that genuinely
          are in front of a screen, so nothing ever looks pasted on (and,
          on that same canvas, each entrance's flare and letterbox). Last,
          the title cards: titles, so on top of the picture. */}
      <ProjectStations nodesRef={stationNodesRef} depth="far" />
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      <ProjectStations nodesRef={stationNodesRef} depth="near" />
      <canvas ref={bookCanvasRef} className={styles.book} aria-hidden="true" />
      <canvas ref={dustCanvasRef} className={styles.canvas} aria-hidden="true" />
      <ProjectStations nodesRef={cardNodesRef} depth="titles" />
      <button
        ref={bookHitRef}
        type="button"
        className={styles.bookHit}
        aria-label="Open the book"
        tabIndex={-1}
      />
      {CONTACT.entries.map((e, i) => (
        <a
          key={e.label}
          ref={(el) => {
            contactLinkRefs.current[i] = el;
          }}
          className={styles.contactLink}
          href={e.href}
          aria-label={`${e.label}: ${e.value}`}
          tabIndex={-1}
          {...(e.href.startsWith("http")
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
        />
      ))}
      {/* What the book's open pages say, for anything that cannot see them
          written: on the page it is ink in the paper, not text. */}
      {PAGES.map((page) => (
        <section key={page.heading} className={styles.srOnly} aria-label={page.heading}>
          <h2>{page.heading}</h2>
          <ul>
            {page.entries.map((e) => (
              <li key={e.title}>
                {e.title.replace(/\n/g, " ")}
                {e.place ? `, ${e.place}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className={styles.srOnly} aria-label={CONTACT.heading}>
        <h2>{CONTACT.heading}</h2>
        <ul>
          {CONTACT.entries.map((e) => (
            <li key={e.label}>
              {e.label}: {e.value}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
