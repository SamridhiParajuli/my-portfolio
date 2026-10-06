"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import Name from "@/components/Name/Name";
import Tagline from "@/components/Tagline/Tagline";
import Navigation from "@/components/Navigation/Navigation";
import ScrollCue from "@/components/ScrollCue/ScrollCue";
import GatewayCue from "@/components/GatewayCue/GatewayCue";
import PhotoLaptopAnimation from "@/components/PhotoLaptopAnimation/PhotoLaptopAnimation";
import PaperBallAnimation, {
  type PhotoHandoff,
} from "@/components/PaperBallAnimation/PaperBallAnimation";
import Caption from "@/components/Caption/Caption";
import BannerParticlePortal, {
  type PortalHandle,
} from "@/components/BannerParticlePortal/BannerParticlePortal";
import type { Section } from "@/components/Navigation/sections";
import styles from "./Intro.module.css";

const SKETCH_OPACITY = 0.8;

export default function Intro() {
  const sketchRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  // The hero section itself is what BannerParticlePortal pins for the
  // particle-portal scroll stage -- GSAP's own pin-spacer reserves the
  // extra scroll distance, so no wrapper/spacer markup is needed here.
  const introRef = useRef<HTMLElement>(null);
  const [handoff, setHandoff] = useState<PhotoHandoff | null>(null);
  // Flips true once banner.png has fully unfolded to fill the hero — the
  // signal the rest of the intro chrome (tagline, name) retires on.
  const [bannerRevealed, setBannerRevealed] = useState(false);
  // True while the journey rests at the galaxy's opening, waiting for the
  // scroll that starts it -- when GatewayCue says what to do there.
  const [atGateway, setAtGateway] = useState(false);
  // Which part of the journey it is in (the banner, the worlds, the book's
  // chapters) -- what the menu marks, and whether it is the corner one or
  // the bar across the top -- and how the menu sends it somewhere else.
  const [section, setSection] = useState<Section>("home");
  const portalRef = useRef<PortalHandle>(null);

  // Scrolling only makes sense once the banner has actually settled into
  // its final, flat form -- the particle portal below assumes that settled
  // state as its own starting point. Locking the page here means a fast
  // scroll can never land the user mid fold/unfold or mid scroll-jack.
  useEffect(() => {
    if (bannerRevealed) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [bannerRevealed]);

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
    <section ref={introRef} className={styles.intro}>
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
      <PaperBallAnimation
        handoff={handoff}
        captionRef={captionRef}
        onBannerRevealed={() => setBannerRevealed(true)}
      />
      <BannerParticlePortal
        ref={portalRef}
        revealed={bannerRevealed}
        pinRef={introRef}
        onGateway={setAtGateway}
        onSection={setSection}
      />
      <div className={styles.content}>
        <Name compact={bannerRevealed} />
        <Tagline hide={bannerRevealed} />
      </div>
      <ScrollCue revealed={bannerRevealed} />
      <GatewayCue shown={atGateway} />
      <Navigation
        revealed={bannerRevealed}
        section={section}
        onNavigate={(to) => portalRef.current?.navigate(to)}
      />
    </section>
  );
}
