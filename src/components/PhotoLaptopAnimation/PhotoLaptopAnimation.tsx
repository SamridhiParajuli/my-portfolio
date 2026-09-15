"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ROW_TARGETS, SCATTER_POINTS, PHOTOS } from "./laptopLayout";
import styles from "./PhotoLaptopAnimation.module.css";

// Name.tsx starts its reveal at delay 1s with a 1.8s power3.out tween — the
// photos should only start arriving once that has visibly settled.
const NAME_SETTLE_DELAY = 2.8;

const toPx = (
  point: { x: number; y: number },
  width: number,
  height: number
) => ({
  x: ((point.x + 1) / 2) * width,
  y: point.y * height,
});

type PhotoLaptopAnimationProps = {
  // Fired once the existing line animation has fully settled, handing the
  // real tile elements + container off to whatever wants to continue from
  // there. Never fires under prefers-reduced-motion, matching the rest of
  // this component's reduced-motion behavior (the line just stays put).
  onLineComplete?: (tiles: HTMLDivElement[], container: HTMLDivElement) => void;
};

export default function PhotoLaptopAnimation({
  onLineComplete,
}: PhotoLaptopAnimationProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Kept current via a ref (rather than an effect dependency) so the
  // mount-once effect below never needs to re-run when this prop changes.
  const onLineCompleteRef = useRef(onLineComplete);
  useEffect(() => {
    onLineCompleteRef.current = onLineComplete;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tiles = tileRefs.current.filter(
      (el): el is HTMLDivElement => el !== null
    );
    if (tiles.length === 0) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const settleToTargets = (animate: boolean) => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;

      tiles.forEach((tile, i) => {
        const target = ROW_TARGETS[i];
        const { x, y } = toPx(target, width, height);
        const vars = {
          x,
          y,
          rotation: target.rotation,
          scale: target.scale,
          opacity: 1,
        };

        if (animate) {
          gsap.to(tile, { ...vars, duration: 0.5, ease: "power2.out" });
        } else {
          gsap.set(tile, vars);
        }
      });
    };

    if (reduceMotion) {
      tiles.forEach((tile) => gsap.set(tile, { xPercent: -50, yPercent: -50 }));
      settleToTargets(false);
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    tiles.forEach((tile, i) => {
      const scatter = SCATTER_POINTS[i];
      const { x, y } = toPx(scatter, width, height);
      gsap.set(tile, {
        xPercent: -50,
        yPercent: -50,
        x,
        y,
        rotation: scatter.rotation,
        scale: scatter.scale,
        opacity: 0,
      });
    });

    const tl = gsap.timeline({ delay: NAME_SETTLE_DELAY });

    tl.to(tiles, {
      opacity: (i: number) => SCATTER_POINTS[i].opacity,
      duration: 0.8,
      stagger: { each: 0.03, from: "random" },
      ease: "power1.out",
    }).to(
      tiles,
      {
        x: (i: number) =>
          toPx(ROW_TARGETS[i], container.clientWidth, container.clientHeight).x,
        y: (i: number) =>
          toPx(ROW_TARGETS[i], container.clientWidth, container.clientHeight).y,
        rotation: (i: number) => ROW_TARGETS[i].rotation,
        scale: (i: number) => ROW_TARGETS[i].scale,
        opacity: 1,
        duration: 1.6,
        stagger: { each: 0.045, from: "random" },
        ease: "expo.out",
      },
      "+=0.5"
    );

    tl.call(() => onLineCompleteRef.current?.(tiles, container));

    let resizeTimer: number | undefined;
    const handleResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const settled = tl.progress() >= 1;
        if (!settled) tl.kill();
        settleToTargets(settled);
      }, 150);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      tl.kill();
      window.removeEventListener("resize", handleResize);
      window.clearTimeout(resizeTimer);
    };
  }, []);

  return (
    <div ref={containerRef} className={styles.wrapper} aria-hidden="true">
      {PHOTOS.map((src, i) => (
        <div
          key={src}
          ref={(el) => {
            tileRefs.current[i] = el;
          }}
          className={styles.tile}
        >
          <Image
            src={src}
            alt=""
            fill
            sizes="128px"
            quality={90}
            loading="eager"
            style={{ objectFit: "cover" }}
          />
        </div>
      ))}
      <span className={styles.srOnly}>
        A collage of small personal photographs arranging into a single row
      </span>
    </div>
  );
}
