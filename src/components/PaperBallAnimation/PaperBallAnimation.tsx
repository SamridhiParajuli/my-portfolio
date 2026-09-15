"use client";

import { useEffect, useRef, type RefObject } from "react";
import Image from "next/image";
import gsap from "gsap";
import styles from "./PaperBallAnimation.module.css";

export type PhotoHandoff = {
  tiles: HTMLDivElement[];
  container: HTMLDivElement;
};

type Props = {
  // Null until PhotoLaptopAnimation's line finishes and hands off its real
  // tile elements — this component does nothing until then.
  handoff: PhotoHandoff | null;
  // Caption sits directly below the photo row. The ball needs to rest
  // below it (not on top of it), so this measures where it is.
  captionRef?: RefObject<HTMLParagraphElement | null>;
  // Fired once banner.png's fragments have fully unfolded flat (or, under
  // reduced motion, once the plain fallback fade finishes) — the signal the
  // rest of the hero chrome (tagline, name) uses to retire out of the way.
  onBannerRevealed?: () => void;
};

// Small seeded PRNG so the crumple/cluster/blob shapes are reproducible
// rather than reshuffling on every load (same pattern as laptopLayout.ts,
// kept local here since this is a self-contained, isolated effect).
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type ClusterPoint = { ox: number; oy: number; rotation: number; scale: number };

// Where each photo lands once it's gathered toward the center — an organic,
// irregular huddle rather than a neat grid, used both for the real tiles'
// compress positions and for where each photo gets drawn onto the ball's
// canvas texture.
function makeCluster(count: number): ClusterPoint[] {
  const rand = mulberry32(4242);
  const points: ClusterPoint[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.9;
    const radius = 0.22 + rand() * 0.72;
    points.push({
      ox: Math.cos(angle) * radius,
      oy: Math.sin(angle) * radius * 0.88,
      rotation: (rand() - 0.5) * 110,
      scale: 0.7 + rand() * 0.36,
    });
  }
  return points;
}

type ClipPoint = { x: number; y: number };

// A deterministic, irregular blob outline (not a perfect circle) so the
// ball reads as crumpled paper rather than a smooth sphere.
function blobClipPoints(points: number, seed: number, jitter: number): ClipPoint[] {
  const rand = mulberry32(seed);
  const pts: ClipPoint[] = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = 50 * (1 - jitter / 2 + rand() * jitter);
    pts.push({ x: 50 + Math.cos(angle) * r, y: 50 + Math.sin(angle) * r });
  }
  return pts;
}

function formatClipPath(points: ClipPoint[]): string {
  return `polygon(${points
    .map((p) => `${p.x.toFixed(1)}% ${p.y.toFixed(1)}%`)
    .join(", ")})`;
}

const BLOB_CLIP = formatClipPath(blobClipPoints(14, 99, 0.24));
// Same point count/layout as BLOB_CLIP but with zero jitter, i.e. a plain
// circle — what the canvas starts as right when it takes over from the
// tiles (which have just converged into a round cluster themselves), so
// GSAP can morph clip-path from this straight to BLOB_CLIP afterward
// instead of the jagged outline appearing all at once.
const CIRCLE_CLIP = formatClipPath(blobClipPoints(14, 99, 0));
const CANVAS_RES = 220;

function coverRect(
  imgW: number,
  imgH: number,
  targetW: number,
  targetH: number
) {
  const scale = Math.max(targetW / imgW, targetH / imgH);
  const sw = targetW / scale;
  const sh = targetH / scale;
  return { sx: (imgW - sw) / 2, sy: (imgH - sh) / 2, sw, sh };
}

// The banner-reveal fragments -- pieces of the same photograph, folded
// together. An irregular (not uniform) grid so pieces read as differently
// sized fold-flaps rather than a mechanical mosaic, while still tiling the
// full image with zero gaps once flat: each column/row fraction is random
// but they're normalized to sum to exactly 1.
const FRAG_COLS = 4;
const FRAG_ROWS = 3;
const FRAG_COUNT = FRAG_COLS * FRAG_ROWS;

function fragmentFractions(count: number, seed: number): number[] {
  const rand = mulberry32(seed);
  const raw = Array.from({ length: count }, () => 0.7 + rand() * 0.6);
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => v / total);
}

export default function PaperBallAnimation({
  handoff,
  captionRef,
  onBannerRevealed,
}: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const finalBannerRef = useRef<HTMLDivElement>(null);
  const fragmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Kicked off at mount so banner.png is long since decoded by the time the
  // reveal needs its natural size, several seconds into the intro sequence.
  const bannerPreloadRef = useRef<HTMLImageElement | null>(null);
  // Kept current via a ref (rather than an effect dependency) so the timeline
  // effects below never need to re-run when this callback identity changes.
  const onBannerRevealedRef = useRef(onBannerRevealed);
  useEffect(() => {
    onBannerRevealedRef.current = onBannerRevealed;
  });

  useEffect(() => {
    const img = new window.Image();
    img.src = "/images/intro/banner.png";
    bannerPreloadRef.current = img;
  }, []);

  useEffect(() => {
    if (!handoff) return;

    const layer = layerRef.current;
    const canvas = canvasRef.current;
    const shadow = shadowRef.current;
    if (!layer || !canvas || !shadow) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    // Respect the same reduced-motion contract as the line animation: do
    // nothing further, leaving the settled straight line as the end state.
    if (reduceMotion) return;

    const { tiles, container } = handoff;
    if (!container.clientWidth || !container.clientHeight) return;

    const cluster = makeCluster(tiles.length);
    // Captured before compression scales the tiles down, so the ball's
    // canvas texture is drawn from each photo's original (row) size
    // regardless of how far the DOM tiles have shrunk by the time
    // drawBall() runs.
    const originalTileSize = tiles[0]?.getBoundingClientRect().width || 40;

    const containerRect = container.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();

    const ballSize = Math.min(
      130,
      Math.max(64, layerRect.width * 0.09, container.clientHeight * 0.5)
    );

    const compressCenterX = container.clientWidth / 2;
    const compressCenterY = container.clientHeight / 2;
    // Tight — sized off the ball itself — so the tiles visibly shrink down
    // into roughly the ball's own footprint as they converge, rather than
    // piling up at near-full size and only shrinking once the canvas ball
    // takes over.
    const domClusterRadius = Math.max(18, ballSize * 0.38);
    // How much smaller each tile gets as it converges (on top of the
    // cluster's own per-tile scale variance) — the shrink IS the
    // ball-forming motion, instead of a separate step after.
    const COMPRESS_SHRINK = 0.34;

    // Ball position, expressed in the full-hero layer's own coordinate
    // space (the layer spans the whole hero so the drop has real room).
    const ballCenterX =
      containerRect.left + containerRect.width / 2 - layerRect.left;
    const ballCenterY =
      containerRect.top + containerRect.height / 2 - layerRect.top;

    const maxGroundY = layerRect.height - ballSize / 2 - 16;

    // Caption sits directly beneath the photo row, so the natural fall
    // distance would land the ball right on top of it. Rest below the
    // caption's own bottom edge instead, clamped to stay inside the hero.
    const captionRect = captionRef?.current?.getBoundingClientRect();
    const captionClearanceY = captionRect
      ? captionRect.bottom - layerRect.top + ballSize / 2 + 20
      : null;

    const fallbackDropDistance = Math.max(
      70,
      Math.min(layerRect.height * 0.3, maxGroundY - ballCenterY)
    );
    const desiredGroundY =
      captionClearanceY !== null
        ? Math.max(ballCenterY + 70, captionClearanceY)
        : ballCenterY + fallbackDropDistance;

    const groundY = Math.min(desiredGroundY, maxGroundY);
    const realDrop = Math.max(40, groundY - ballCenterY);

    canvas.width = CANVAS_RES;
    canvas.height = CANVAS_RES;
    canvas.style.width = `${ballSize}px`;
    canvas.style.height = `${ballSize}px`;
    canvas.style.clipPath = CIRCLE_CLIP;

    const shadowWidth = ballSize * 0.85;
    const shadowHeight = ballSize * 0.24;
    shadow.style.width = `${shadowWidth}px`;
    shadow.style.height = `${shadowHeight}px`;

    gsap.set(canvas, {
      xPercent: -50,
      yPercent: -50,
      x: ballCenterX,
      y: ballCenterY,
      opacity: 0,
      scale: 1,
    });
    gsap.set(shadow, {
      xPercent: -50,
      yPercent: -50,
      x: ballCenterX,
      y: groundY + ballSize * 0.42,
      opacity: 0,
      scaleX: 0.6,
    });

    // Composite the actual photographs (at their compressed positions)
    // into the ball's canvas texture — the ball is made of the photos,
    // not a stand-in image.
    const drawBall = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, CANVAS_RES, CANVAS_RES);
      // Each photo is drawn larger on the canvas than its tile's own DOM
      // size (see the 1.3x below), so without this the browser's default
      // (often lower-quality) resampling visibly softens them.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const baseTileSize = originalTileSize;
      const canvasClusterRadius = CANVAS_RES * 0.36;

      tiles.forEach((tile, i) => {
        const img = tile.querySelector("img");
        if (!(img instanceof HTMLImageElement)) return;
        if (!img.complete || img.naturalWidth === 0) return;

        const point = cluster[i];
        const drawSize = baseTileSize * point.scale * 1.3;
        const { sx, sy, sw, sh } = coverRect(
          img.naturalWidth,
          img.naturalHeight,
          drawSize,
          drawSize
        );

        ctx.save();
        ctx.translate(
          CANVAS_RES / 2 + point.ox * canvasClusterRadius,
          CANVAS_RES / 2 + point.oy * canvasClusterRadius
        );
        ctx.rotate((point.rotation * Math.PI) / 180);
        ctx.drawImage(
          img,
          sx,
          sy,
          sw,
          sh,
          -drawSize / 2,
          -drawSize / 2,
          drawSize,
          drawSize
        );
        ctx.restore();
      });

      // Shading for volume — darker toward the edges, a soft highlight
      // off-center — so it reads as a crumpled mass, not a flat collage.
      const shade = ctx.createRadialGradient(
        CANVAS_RES * 0.4,
        CANVAS_RES * 0.38,
        CANVAS_RES * 0.08,
        CANVAS_RES * 0.5,
        CANVAS_RES * 0.5,
        CANVAS_RES * 0.62
      );
      shade.addColorStop(0, "rgba(255,255,255,0.2)");
      shade.addColorStop(0.55, "rgba(60,45,35,0.05)");
      shade.addColorStop(1, "rgba(30,20,15,0.6)");
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, CANVAS_RES, CANVAS_RES);
      ctx.globalCompositeOperation = "source-over";

      // A handful of crease lines for a crumpled-paper feel.
      const creaseRand = mulberry32(777);
      ctx.strokeStyle = "rgba(35,25,20,0.28)";
      ctx.lineCap = "round";
      for (let i = 0; i < 6; i++) {
        ctx.lineWidth = 1 + creaseRand() * 2;
        ctx.beginPath();
        const x1 = creaseRand() * CANVAS_RES;
        const y1 = creaseRand() * CANVAS_RES;
        const x2 = creaseRand() * CANVAS_RES;
        const y2 = creaseRand() * CANVAS_RES;
        const cx = (x1 + x2) / 2 + (creaseRand() - 0.5) * 40;
        const cy = (y1 + y2) / 2 + (creaseRand() - 0.5) * 40;
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(cx, cy, x2, y2);
        ctx.stroke();
      }
    };

    // Phase 1 — hold. The line settles right as this effect runs (t=0 here),
    // and Caption.tsx reveals shortly after that, finishing its fade-in
    // around 1.9s later. Compression should only begin once that caption
    // is fully on screen, so this delay covers the caption's own reveal
    // plus a small buffer, rather than just a brief pause on the line.
    const tl = gsap.timeline({ delay: 2.2 });

    // The ball's texture is composited from the static cluster math and
    // each photo's pre-captured original size — not from tiles' live,
    // still-animating positions — so it can be drawn up front, before the
    // shrink even starts.
    tl.call(drawBall);

    // Phase 2 — the ball is formed BY the tiles, not handed off to a
    // stand-in. The same 20 photo elements move inward, overlap, shrink and
    // rotate toward the cluster in one slow, continuous tween — including
    // rounding their corners off toward circular as they go, so the group
    // itself visibly crumples into a round mass rather than a grid of
    // rectangles suddenly being replaced. Long duration + a wide stagger
    // spread (~1s across the 20 tiles) is what makes it read as organic
    // gathering rather than a mechanical snap.
    const COMPRESS_DURATION = 2.6;
    tl.to(tiles, {
      x: (i: number) => compressCenterX + cluster[i].ox * domClusterRadius,
      y: (i: number) => compressCenterY + cluster[i].oy * domClusterRadius,
      rotation: (i: number) => cluster[i].rotation,
      scale: (i: number) => cluster[i].scale * COMPRESS_SHRINK,
      borderRadius: "50%",
      duration: COMPRESS_DURATION,
      stagger: { each: 0.04, from: "random" },
      ease: "power2.inOut",
    });

    // Phase 3 — only once every tile has actually come to rest in its final
    // compressed, overlapping, rounded position does the canvas ball take
    // over (needed from here on for the drop/bounce physics and the later
    // fragment unfold). Nothing is moving or changing size at this instant
    // — tiles and canvas occupy the exact same spot at the exact same
    // size/shape — so the cut isn't a visible pop, just a texture handoff
    // between two things that already look identical.
    tl.set(tiles, { opacity: 0 });
    tl.set(canvas, { opacity: 1 });

    // The jagged, crumpled-paper outline only appears now, easing in as a
    // continuation of the same crumple motion rather than snapping in
    // alongside the handoff above.
    tl.to(canvas, {
      clipPath: BLOB_CLIP,
      duration: 0.5,
      ease: "power1.inOut",
    });

    // Phase 4 — drop, with gravity-like acceleration.
    tl.to(shadow, { opacity: 0.35, duration: 0.05 }, "+=0.15");
    tl.to(
      canvas,
      {
        y: groundY,
        scaleX: 0.92,
        scaleY: 1.12,
        duration: 0.6,
        ease: "power2.in",
      },
      "<"
    ).to(
      shadow,
      { scaleX: 1.1, opacity: 0.5, duration: 0.6, ease: "power2.in" },
      "<"
    );

    // Impact 1 — squash on landing. This is the first of exactly two
    // ground touches; after the second (below), the ball stays down and
    // moves straight into the unfold instead of bouncing again.
    tl.to(canvas, {
      scaleX: 1.35,
      scaleY: 0.62,
      duration: 0.1,
      ease: "power1.out",
    }).to(shadow, { scaleX: 1.3, opacity: 0.55, duration: 0.1 }, "<");

    // Phase 5, bounce 1 — up to ~35% of the drop height, then back down.
    // This landing is the SECOND (and last) drop.
    const bounce1Height = realDrop * 0.35;
    tl.to(canvas, {
      y: groundY - bounce1Height,
      scaleX: 1,
      scaleY: 1,
      duration: 0.32,
      ease: "power2.out",
    }).to(shadow, { scaleX: 0.7, opacity: 0.28, duration: 0.32 }, "<");

    tl.to(canvas, {
      y: groundY,
      scaleX: 0.95,
      scaleY: 1.08,
      duration: 0.28,
      ease: "power2.in",
    }).to(shadow, { scaleX: 1.15, opacity: 0.52, duration: 0.28 }, "<");

    // Impact 2 — the second drop's landing squash.
    tl.to(canvas, {
      scaleX: 1.22,
      scaleY: 0.78,
      duration: 0.08,
      ease: "power1.out",
    }).to(shadow, { scaleX: 1.2, opacity: 0.54, duration: 0.08 }, "<");

    // Final settle — one very subtle squash-recover right after the second
    // drop's landing, then everything stops for good. No third bounce: from
    // here the ball stays in place and moves into the unfold.
    tl.to(canvas, {
      scaleX: 1.08,
      scaleY: 0.94,
      duration: 0.06,
      ease: "power1.out",
    })
      .to(canvas, { scaleX: 1, scaleY: 1, duration: 0.2, ease: "power1.out" })
      .to(shadow, { scaleX: 1, opacity: 0.45, duration: 0.2 }, "<");

    // ============================================================
    // NEW — the ball unfolds into banner.png as a set of paper fragments
    // opening out from it, not as a single object growing or fading.
    // Everything above this line, through the final settle, is the
    // existing animation and is untouched; this is appended to the same
    // timeline so it always starts from the ball's exact settled state.
    //
    // Each fragment is a piece of banner.png, already sized and positioned
    // at its correct FINAL spot in the image (so once every fragment's
    // transform returns to identity, the pieces tile back into one exact,
    // seamless photograph). To start, every fragment is pulled in and
    // scaled down so it sits compressed at the ball's own (settled,
    // post-drop) position and size -- and its growth is pinned to
    // whichever of its own corners sits nearest the ball (via
    // transformOrigin), so it visibly unfurls FROM that hinge rather than
    // inflating from its own middle while also flying in sideways, which
    // is what reads as scattering. Release order isn't random either: it's
    // driven by each fragment's straight-line distance from the ball, so
    // the piece nearest the ball opens first and the release visibly
    // ripples outward to the far corners -- the way unfolding a real sheet
    // starts at the part in your hand and spreads outward from there.
    // Durations are long, so the whole thing reads as one slow, continuous
    // wave rather than pieces popping open independently.
    // ============================================================

    const naturalW = bannerPreloadRef.current?.naturalWidth || 1536;
    const naturalH = bannerPreloadRef.current?.naturalHeight || 1024;
    const bannerCoverScale = Math.max(
      layerRect.width / naturalW,
      layerRect.height / naturalH
    );
    const bannerDisplayW = naturalW * bannerCoverScale;
    const bannerDisplayH = naturalH * bannerCoverScale;
    const bannerOffsetX = (layerRect.width - bannerDisplayW) / 2;
    const bannerOffsetY = (layerRect.height - bannerDisplayH) / 2;

    // Boundaries are rounded to whole pixels ONCE, up front, and each
    // cell's size is the gap between two consecutive rounded boundaries --
    // so a shared edge between neighbors is always the exact same number
    // on both sides. Rounding each cell's own width independently (e.g.
    // width = round(fraction * total)) would let neighboring cells round
    // in opposite directions and leave a hairline gap or overlap between
    // them, which is exactly what showed up as faint seams before this.
    function fractionsToBoundaries(fracs: number[], total: number): number[] {
      let cumulative = 0;
      const boundaries = [0];
      for (const f of fracs) {
        cumulative += f;
        boundaries.push(Math.round(cumulative * total));
      }
      return boundaries;
    }

    const colFracs = fragmentFractions(FRAG_COLS, 501);
    const rowFracs = fragmentFractions(FRAG_ROWS, 502);
    const colBounds = fractionsToBoundaries(colFracs, layerRect.width);
    const rowBounds = fractionsToBoundaries(rowFracs, layerRect.height);
    const cols = colFracs.map((_, i) => ({
      x: colBounds[i],
      w: colBounds[i + 1] - colBounds[i],
    }));
    const rows = rowFracs.map((_, i) => ({
      y: rowBounds[i],
      h: rowBounds[i + 1] - rowBounds[i],
    }));

    // GPU-composited layers (each fragment gets its own via will-change:
    // transform) can round adjacent edges to slightly different device
    // pixels even when their CSS boxes meet exactly, leaving a hairline
    // seam once everything is at rest. Drawing each fragment a touch
    // larger than its true cell on every side -- with background-position
    // offset to match -- means the extra sliver shown is just the
    // neighboring piece's own content, covering any such gap instead of
    // exposing it.
    const SEAM_OVERLAP = 1.5;

    const fragRand = mulberry32(9911);
    const fragments: HTMLDivElement[] = [];
    const fragDurations: number[] = [];
    const fragDistances: number[] = [];

    fragmentRefs.current.forEach((frag, i) => {
      if (!frag) return;
      const col = i % FRAG_COLS;
      const row = Math.floor(i / FRAG_COLS);
      const { x: left, w: width } = cols[col];
      const { y: top, h: height } = rows[row];

      const drawLeft = left - SEAM_OVERLAP;
      const drawTop = top - SEAM_OVERLAP;
      const drawWidth = width + SEAM_OVERLAP * 2;
      const drawHeight = height + SEAM_OVERLAP * 2;

      frag.style.left = `${drawLeft}px`;
      frag.style.top = `${drawTop}px`;
      frag.style.width = `${drawWidth}px`;
      frag.style.height = `${drawHeight}px`;
      frag.style.backgroundImage = "url(/images/intro/banner.png)";
      frag.style.backgroundSize = `${bannerDisplayW}px ${bannerDisplayH}px`;
      frag.style.backgroundPosition = `${bannerOffsetX - drawLeft}px ${
        bannerOffsetY - drawTop
      }px`;
      // Real 3D rotation is about to sweep this past 90° on its way open;
      // without this the reverse of the div would flash its (mirrored)
      // background for an instant as it passes edge-on.
      frag.style.backfaceVisibility = "hidden";

      const centerX = left + width / 2;
      const centerY = top + height / 2;
      const compressedScale =
        (ballSize / Math.max(width, height)) * (0.8 + fragRand() * 0.45);
      const dx = centerX - ballCenterX;
      const dy = centerY - groundY;

      // Pin growth to whichever corner of this fragment is nearest the
      // ball, so scaling up reads as unfurling from a hinge next to the
      // ball rather than inflating from the fragment's own middle.
      const originX = dx < 0 ? "100%" : dx > 0 ? "0%" : "50%";
      const originY = dy < 0 ? "100%" : dy > 0 ? "0%" : "50%";

      // The actual fold: a hinge rotation in 3D (around whichever axis
      // that corner sits on), not a flat spin. It starts folded almost
      // edge-on -- like a page pressed shut against the ball -- and opens
      // to flat as it travels out, which is what makes this read as
      // paper unfolding instead of a flat shape flying and turning.
      const foldAngle = 55 + fragRand() * 20;
      const foldsOnYAxis = Math.abs(dx) >= Math.abs(dy);
      const startRotationY = foldsOnYAxis ? (dx >= 0 ? foldAngle : -foldAngle) : 0;
      const startRotationX = foldsOnYAxis ? 0 : dy >= 0 ? -foldAngle : foldAngle;

      gsap.set(frag, {
        opacity: 0,
        transformPerspective: 900,
        transformOrigin: `${originX} ${originY}`,
        x: ballCenterX - centerX,
        y: groundY - centerY,
        scale: compressedScale,
        rotationX: startRotationX,
        rotationY: startRotationY,
        // A little residual Z twist on top of the hinge fold, purely so
        // creases don't all read as perfectly square -- real paper isn't.
        rotation: (fragRand() - 0.5) * 10,
      });

      fragments.push(frag);
      // Long, slow durations -- this is meant to read as one unhurried
      // release, not a quick flourish.
      fragDurations.push(2 + fragRand() * 0.9);
      fragDistances.push(Math.hypot(dx, dy));
    });

    // Hold — the settled ball stays exactly where it is, briefly.
    tl.to(shadow, { opacity: 0, duration: 0.4, ease: "power1.out" }, "+=0.5");

    // A small tremble — not growth, just the ball loosening right before
    // the first fold releases.
    tl.to(
      canvas,
      {
        rotation: 3,
        scaleX: 1.03,
        scaleY: 0.98,
        duration: 0.25,
        ease: "sine.inOut",
      },
      "<"
    );

    // The substitution: the ball and the (still fully compressed, still
    // ball-sized) fragment cluster occupy the exact same position and size,
    // so this is a plain cross-dissolve rather than a cut — the crumpled
    // photo texture quietly gives way to the folded banner underneath it,
    // with no instant swap of content (which would read as a pop) and no
    // gap, size change, or separate element appearing.
    tl.addLabel("unfold");
    tl.to(canvas, { opacity: 0, duration: 0.5, ease: "sine.inOut" }, "unfold");
    tl.to(
      fragments,
      { opacity: 1, duration: 0.5, ease: "sine.inOut" },
      "unfold"
    );

    // Folds release: ordered by distance from the ball rather than
    // randomly, so the fragment nearest the ball opens first and the
    // release visibly ripples outward to the far corners as one continuous
    // wave -- overlapping the cross-dissolve above rather than waiting for
    // it, so there's no seam between "becoming the banner" and "opening
    // up" either.
    const maxFragDist = Math.max(...fragDistances, 1);
    const RIPPLE_SPAN = 1.8;
    // Tracked explicitly (rather than relying on the timeline's own
    // "current end" cursor) because these tweens are inserted out of
    // sequence order via absolute label offsets — the loop below doesn't
    // necessarily process the farthest-released fragment last, so the
    // cursor after the loop wouldn't reliably land on the true final end.
    let maxFragEnd = 0;
    fragments.forEach((frag, i) => {
      const rippleDelay =
        (fragDistances[i] / maxFragDist) * RIPPLE_SPAN + fragRand() * 0.15;
      maxFragEnd = Math.max(maxFragEnd, rippleDelay + fragDurations[i]);
      tl.to(
        frag,
        {
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          rotationX: 0,
          rotationY: 0,
          duration: fragDurations[i],
          ease: "power2.out",
        },
        `unfold+=${rippleDelay}`
      );
    });

    // The hero chrome (name, tagline) waits for this exact moment — the
    // instant the last fragment settles flat and the photograph reads as
    // one seamless whole — rather than an approximate timeout.
    tl.call(
      () => onBannerRevealedRef.current?.(),
      undefined,
      `unfold+=${maxFragEnd + 0.1}`
    );

    return () => {
      tl.kill();
    };
  }, [handoff, captionRef]);

  // Reduced motion skips the elaborate unfold entirely, but the banner is a
  // new piece of content in its own right, so it still needs to appear —
  // just as a plain, quick fade instead of the full sequence above.
  useEffect(() => {
    if (!handoff) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (!reduceMotion) return;

    const finalBanner = finalBannerRef.current;
    if (!finalBanner) return;

    const tween = gsap.to(finalBanner, {
      opacity: 1,
      duration: 0.6,
      ease: "power1.out",
      onComplete: () => onBannerRevealedRef.current?.(),
    });
    return () => {
      tween.kill();
    };
  }, [handoff]);

  return (
    <div ref={layerRef} className={styles.layer} aria-hidden="true">
      <div ref={shadowRef} className={styles.shadow} />
      <canvas ref={canvasRef} className={styles.ball} />
      {Array.from({ length: FRAG_COUNT }).map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            fragmentRefs.current[i] = el;
          }}
          className={styles.fragment}
        />
      ))}
      <div ref={finalBannerRef} className={styles.finalBanner}>
        <Image
          src="/images/intro/banner.png"
          alt=""
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover", objectPosition: "center" }}
        />
      </div>
    </div>
  );
}
