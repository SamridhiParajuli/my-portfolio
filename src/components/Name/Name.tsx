"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import styles from "./Name.module.css";

gsap.registerPlugin(Flip);

type NameProps = {
  // Flips true once banner.png has fully unfolded to fill the hero — the
  // name then shrinks into a permanent top-left corner mark.
  compact?: boolean;
};

export default function Name({ compact = false }: NameProps) {
  const nameRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = nameRef.current;
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
      { opacity: 0, y: 28, filter: "blur(10px)" },
      {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 1.8,
        delay: 1,
        ease: "power3.out",
      }
    );

    return () => {
      tween.kill();
    };
  }, []);

  // Hero-position title -> permanent top-left corner mark. Captured via Flip
  // so the move is measured from wherever the title actually is (centered,
  // large, dark) to wherever the .compact class actually puts it (small,
  // cream, fixed corner) — a single interpolated transform rather than two
  // animations fighting over position.
  useEffect(() => {
    const el = nameRef.current;
    if (!el || !compact) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reduceMotion) {
      el.classList.add(styles.compact);
      return;
    }

    const state = Flip.getState(el, { props: "color" });
    el.classList.add(styles.compact);
    const flip = Flip.from(state, {
      duration: 1.3,
      ease: "power3.inOut",
      scale: true,
      absolute: true,
      props: "color",
    });

    return () => {
      flip.kill();
    };
  }, [compact]);

  return (
    <h1 ref={nameRef} className={styles.name}>
      Samridhi Parajuli
    </h1>
  );
}
