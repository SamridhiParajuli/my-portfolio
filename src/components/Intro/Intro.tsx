"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import Name from "@/components/Name/Name";
import Tagline from "@/components/Tagline/Tagline";
import PhotoLaptopAnimation from "@/components/PhotoLaptopAnimation/PhotoLaptopAnimation";
import PaperBallAnimation, {
  type PhotoHandoff,
} from "@/components/PaperBallAnimation/PaperBallAnimation";
import Caption from "@/components/Caption/Caption";
import styles from "./Intro.module.css";

const SKETCH_OPACITY = 0.8;

export default function Intro() {
  const sketchRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const [handoff, setHandoff] = useState<PhotoHandoff | null>(null);

  useEffect(() => {
    const sketch = sketchRef.current;
    if (!sketch) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reduceMotion) {
      gsap.set(sketch, { opacity: SKETCH_OPACITY });
      return;
    }

    const tween = gsap.fromTo(
      sketch,
      { opacity: 0 },
      { opacity: SKETCH_OPACITY, duration: 4, ease: "power1.out" }
    );

    return () => {
      tween.kill();
    };
  }, []);

  return (
    <section className={styles.intro}>
      <div ref={sketchRef} className={styles.sketch}>
        <Image
          src="/images/intro/background-sketch.png"
          alt=""
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover", objectPosition: "center" }}
        />
      </div>
      <div className={styles.photoLayer}>
        <PhotoLaptopAnimation
          onLineComplete={(tiles, container) =>
            setHandoff({ tiles, container })
          }
        />
        <Caption measureRef={captionRef} />
      </div>
      <PaperBallAnimation handoff={handoff} captionRef={captionRef} />
      <div className={styles.content}>
        <Name />
        <Tagline />
      </div>
    </section>
  );
}
