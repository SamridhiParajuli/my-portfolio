"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import styles from "./Name.module.css";

export default function Name() {
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

  return (
    <h1 ref={nameRef} className={styles.name}>
      Samridhi Parajuli
    </h1>
  );
}
