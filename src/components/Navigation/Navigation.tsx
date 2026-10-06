"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import gsap from "gsap";
import { SECTIONS, type Section } from "./sections";
import styles from "./Navigation.module.css";

type NavigationProps = {
  // Gates this on the same "banner has taken over the hero" signal Name and
  // Tagline use, so the corner nav settles in as part of that same moment
  // rather than sitting there — unusably, mid-intro — the whole time.
  revealed: boolean;
  // Where the journey is. On the banner the menu is the corner one; past
  // it, everywhere else, it is a strip of frames across the top, with the
  // frame for where you are lit.
  section: Section;
  // Sends the journey somewhere (see BannerParticlePortal's navigate).
  onNavigate: (to: Section) => void;
};

export default function Navigation({
  revealed,
  section,
  onNavigate,
}: NavigationProps) {
  const onBanner = section === "home";
  const cornerShown = revealed && onBanner;
  const barShown = revealed && !onBanner;
  const [isOpen, setIsOpen] = useState(false);
  // Leaving the banner shuts the corner menu, so it is not found still open
  // on coming back.
  const [wasCornerShown, setWasCornerShown] = useState(cornerShown);
  if (cornerShown !== wasCornerShown) {
    setWasCornerShown(cornerShown);
    if (!cornerShown) setIsOpen(false);
  }
  const barListRef = useRef<HTMLUListElement>(null);
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

  // On a narrow screen the strip scrolls sideways: keeps the lit frame in
  // the middle of it -- as it changes, and as the screen does. (Scrolled by
  // hand rather than scrollIntoView, which could also move the page -- and
  // the page is the journey.)
  useEffect(() => {
    const list = barListRef.current;
    if (!list || !barShown) return;
    const center = (behavior: ScrollBehavior) => {
      const current = list.querySelector<HTMLElement>('[data-current="true"]');
      if (!current || list.scrollWidth <= list.clientWidth) return;
      list.scrollTo({
        left: current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2,
        behavior,
      });
    };
    center("smooth");
    const onResize = () => center("auto");
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [section, barShown]);

  const go = (event: MouseEvent, to: Section) => {
    event.preventDefault();
    onNavigate(to);
  };

  return (
    <>
      <div
        className={styles.root}
        data-revealed={cornerShown}
        inert={!cornerShown}
      >
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
            {SECTIONS.map((item, i) => (
              <li
                key={item.id}
                ref={(el) => {
                  frameRefs.current[i] = el;
                }}
                className={styles.frame}
              >
                <a
                  href={`#${item.id}`}
                  className={styles.frameLink}
                  tabIndex={isOpen ? 0 : -1}
                  aria-current={item.id === section ? "location" : undefined}
                  onClick={(event) => {
                    setIsOpen(false);
                    go(event, item.id);
                  }}
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

      {/* Past the banner: the same strip of film, laid across the top. It
          unspools from the middle, its frames dropping into place one after
          another; the frame for where you are is lit, as if in the gate, with
          the corner button's focus brackets locked on it. */}
      <nav
        className={styles.bar}
        data-shown={barShown}
        inert={!barShown}
        aria-label="Primary"
      >
        <ul ref={barListRef} className={styles.barList}>
          {SECTIONS.map((item, i) => {
            const current = item.id === section;
            return (
              <li
                key={item.id}
                className={styles.barFrame}
                data-current={current}
                style={{ "--i": i } as CSSProperties}
              >
                <a
                  href={`#${item.id}`}
                  className={styles.barLink}
                  aria-label={item.label}
                  aria-current={current ? "location" : undefined}
                  onClick={(event) => go(event, item.id)}
                >
                  <span className={styles.barIndex} aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.barLabel} aria-hidden="true">
                    <span className={styles.barFull}>{item.label}</span>
                    <span className={styles.barShort}>
                      {item.short ?? item.label}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
