"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import styles from "./Tagline.module.css";

const TAGLINE_TEXT = "Computer Science × Software Development × AI";
const CHAR_DURATION = 0.05;
const START_DELAY = 2.6;

type TaglineProps = {
  // Flips true once banner.png has fully unfolded to fill the hero — the
  // tagline has done its job by then and fades out of the way.
  hide?: boolean;
};

export default function Tagline({ hide = false }: TaglineProps) {
  const wrapperRef = useRef<HTMLParagraphElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const textEl = textRef.current;
    const cursorEl = cursorRef.current;
    if (!textEl || !cursorEl) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reduceMotion) {
      textEl.textContent = TAGLINE_TEXT;
      gsap.set(cursorEl, { opacity: 0 });
      return;
    }

    const blink = gsap.to(cursorEl, {
      opacity: 1,
      duration: 0.5,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      delay: START_DELAY,
    });

    const progress = { chars: 0 };
    const typeTween = gsap.to(progress, {
      chars: TAGLINE_TEXT.length,
      duration: TAGLINE_TEXT.length * CHAR_DURATION,
      ease: "none",
      snap: { chars: 1 },
      delay: START_DELAY,
      onUpdate: () => {
        textEl.textContent = TAGLINE_TEXT.slice(0, progress.chars);
      },
      onComplete: () => {
        blink.kill();
        gsap.to(cursorEl, { opacity: 0, duration: 0.6, ease: "power1.out" });
      },
    });

    return () => {
      blink.kill();
      typeTween.kill();
    };
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !hide) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reduceMotion) {
      gsap.set(wrapper, { opacity: 0 });
      return;
    }

    const tween = gsap.to(wrapper, {
      opacity: 0,
      y: -10,
      filter: "blur(6px)",
      duration: 1,
      ease: "power2.inOut",
    });

    return () => {
      tween.kill();
    };
  }, [hide]);

  return (
    <p ref={wrapperRef} className={styles.wrapper}>
      <span className={styles.srOnly}>{TAGLINE_TEXT}</span>
      <span aria-hidden="true" className={styles.text} ref={textRef} />
      <span aria-hidden="true" className={styles.cursor} ref={cursorRef} />
    </p>
  );
}
