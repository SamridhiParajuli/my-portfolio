"use client";

import { Fragment, type CSSProperties } from "react";
import styles from "./GatewayCue.module.css";

const KICKER = "The work lies beyond";
// What happens next, said before it does: one scroll, and a single mote of
// the galaxy comes loose and leads the way in (see guideParticle).
const LINE = "Scroll, and follow the light";

// The line's words as their letters, each with its place in the whole line
// -- what staggers their lighting, one after another.
const WORDS = (() => {
  let i = 0;
  return LINE.split(" ").map((word) => [...word].map((ch) => ({ ch, i: i++ })));
})();

type GatewayCueProps = {
  // The journey is resting at the galaxy's opening, waiting for the scroll
  // that starts it (see BannerParticlePortal).
  shown: boolean;
};

export default function GatewayCue({ shown }: GatewayCueProps) {
  // Written in the dark of the opening itself, in the worlds' own title
  // type: a small line of tracked caps, and under it the invitation, its
  // letters lighting one after another out of a soft blur. While it waits,
  // a light keeps passing along it, the way the guide will go. The scroll
  // that starts the journey draws it on into the hole.
  return (
    <div className={styles.cue} data-shown={shown} aria-hidden="true">
      <span className={styles.kicker}>{KICKER}</span>
      <span className={styles.line}>
        {WORDS.map((letters, w) => (
          <Fragment key={w}>
            {w > 0 && " "}
            <span className={styles.word}>
              {letters.map(({ ch, i }) => (
                <span
                  key={i}
                  className={styles.letter}
                  style={{ "--i": i } as CSSProperties}
                >
                  {ch}
                </span>
              ))}
            </span>
          </Fragment>
        ))}
      </span>
    </div>
  );
}
