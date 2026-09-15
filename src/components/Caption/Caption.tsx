"use client";

import { useEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import styles from "./Caption.module.css";

const CAPTION_TEXT =
  "A collection of what I've learned, built, and loved along the way.";

// The photo row settles around ~7.1s (see PhotoLaptopAnimation.tsx). This
// caption should reveal shortly after that — before the photos compress
// into the paper ball (see PaperBallAnimation.tsx, which itself waits for
// this reveal to finish before it starts compressing).
const CAPTION_DELAY = 7.4;

type CaptionProps = {
  // Lets a sibling (PaperBallAnimation) measure where this text sits, so it
  // can keep the ball's resting position clear of it. Optional — Caption
  // still works standalone if no ref is passed.
  measureRef?: RefObject<HTMLParagraphElement | null>;
};

export default function Caption({ measureRef }: CaptionProps = {}) {
  const localRef = useRef<HTMLParagraphElement>(null);
  const captionRef = measureRef ?? localRef;

  useEffect(() => {
    const el = captionRef.current;
    if (!el) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reduceMotion) {
      gsap.set(el, { opacity: 1, y: 0, filter: "blur(0px)" });
      return;
    }

    const tween = gsap.fromTo(
      el,
      { opacity: 0, y: 16, filter: "blur(6px)" },
      {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 1.6,
        delay: CAPTION_DELAY,
        ease: "power2.out",
      }
    );

    return () => {
      tween.kill();
    };
  }, [captionRef]);

  return (
    <p ref={captionRef} className={styles.caption}>
      {CAPTION_TEXT}
    </p>
  );
}
