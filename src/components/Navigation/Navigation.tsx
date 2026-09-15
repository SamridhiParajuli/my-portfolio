"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import styles from "./Navigation.module.css";

type MenuItem = { label: string; href: string };

const MENU_ITEMS: MenuItem[] = [
  { label: "Home", href: "#home" },
  { label: "Projects", href: "#projects" },
  { label: "Education & Certificates", href: "#education" },
  { label: "Experience", href: "#experience" },
  { label: "Contact", href: "#contact" },
];

type NavigationProps = {
  // Gates this on the same "banner has taken over the hero" signal Name and
  // Tagline use, so the corner nav settles in as part of that same moment
  // rather than sitting there — unusably, mid-intro — the whole time.
  revealed: boolean;
};

export default function Navigation({ revealed }: NavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const didInteractRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const frameRefs = useRef<(HTMLLIElement | null)[]>([]);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  // Builds the film-roll reveal once, paused, and drives it via play()/
  // reverse() on toggle (rather than rebuilding per click) so an interrupted
  // close — the menu reopened mid-retraction — resumes smoothly instead of
  // snapping to a new start state.
  useEffect(() => {
    const rail = railRef.current;
    const frames = frameRefs.current.filter(
      (el): el is HTMLLIElement => el !== null
    );
    if (!rail || frames.length === 0) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduceMotion) return;

    gsap.set(frames, { transformPerspective: 800 });

    const tl = gsap.timeline({ paused: true });

    // The leader unspools first — a thin strip of film being pulled out —
    // before any frame appears.
    tl.fromTo(
      rail,
      { scaleY: 0 },
      { scaleY: 1, duration: 0.45, ease: "power2.out" }
    );

    // Each frame is folded back almost edge-on at its own top hinge, then
    // swings down to flat with a slight overshoot (back.out) — the physical
    // "click" of a film frame dropping into the gate — staggered so the
    // release visibly ripples down the strip rather than arriving at once.
    tl.fromTo(
      frames,
      { opacity: 0, rotationX: -100, y: -18 },
      {
        opacity: 1,
        rotationX: 0,
        y: 0,
        duration: 0.6,
        ease: "back.out(1.5)",
        stagger: 0.14,
      },
      "-=0.15"
    );

    timelineRef.current = tl;
    return () => {
      tl.kill();
      timelineRef.current = null;
    };
  }, []);

  // Drives the panel/backdrop's [data-open] directly on the DOM (rather than
  // through React state) because it needs to stay "open" through the whole
  // closing animation and only flip back once GSAP's reverse-play actually
  // finishes — a timing that lives with the imperative animation, not with
  // React's render state.
  useEffect(() => {
    const tl = timelineRef.current;
    const panel = panelRef.current;
    const backdrop = backdropRef.current;

    if (isOpen) {
      panel?.setAttribute("data-open", "true");
      backdrop?.setAttribute("data-open", "true");
      if (tl) {
        tl.eventCallback("onReverseComplete", null);
        tl.timeScale(1).play();
      }
      return;
    }

    backdrop?.setAttribute("data-open", "false");

    if (!tl) {
      // Reduced motion — nothing to animate, hide immediately.
      panel?.setAttribute("data-open", "false");
      return;
    }

    // A touch faster on the way back in, like rewinding.
    tl.timeScale(1.3);
    tl.eventCallback("onReverseComplete", () => {
      panel?.setAttribute("data-open", "false");
    });
    tl.reverse();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      didInteractRef.current = true;
      frameRefs.current[0]?.querySelector("a")?.focus();
    } else if (didInteractRef.current) {
      buttonRef.current?.focus({ preventScroll: true });
    }
  }, [isOpen]);

  return (
    <div className={styles.root} data-revealed={revealed}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="site-nav-panel"
      >
        <span className={styles.corner} data-corner="tl" aria-hidden="true" />
        <span className={styles.corner} data-corner="tr" aria-hidden="true" />
        <span className={styles.corner} data-corner="br" aria-hidden="true" />
        <span className={styles.corner} data-corner="bl" aria-hidden="true" />
        <span className={styles.buttonIndex} aria-hidden="true">
          00
        </span>
        <span className={styles.buttonLabel}>{isOpen ? "Close" : "Menu"}</span>
      </button>

      <div
        ref={backdropRef}
        className={styles.backdrop}
        data-open="false"
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      <nav
        ref={panelRef}
        id="site-nav-panel"
        className={styles.panel}
        data-open="false"
        aria-hidden={!isOpen}
        aria-label="Primary"
      >
        <div ref={railRef} className={styles.rail} aria-hidden="true" />
        <ul className={styles.frameList}>
          {MENU_ITEMS.map((item, i) => (
            <li
              key={item.href}
              ref={(el) => {
                frameRefs.current[i] = el;
              }}
              className={styles.frame}
            >
              <a
                href={item.href}
                className={styles.frameLink}
                tabIndex={isOpen ? 0 : -1}
                onClick={() => setIsOpen(false)}
              >
                <span className={styles.frameIndex}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={styles.frameLabel}>{item.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
