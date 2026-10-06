"use client";

import { useSyncExternalStore } from "react";
import styles from "./ScrollCue.module.css";

type ScrollCueProps = {
  // The same "banner has taken over the hero" signal Name and Navigation
  // use: the page is locked until then, so there is nothing to cue yet.
  revealed: boolean;
};

// Read straight off the page rather than off the portal's own progress, so
// the cue knows nothing about the journey beyond "has it begun".
function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

const atStart = () => window.scrollY <= 1;
const atStartOnServer = () => true;

export default function ScrollCue({ revealed }: ScrollCueProps) {
  const resting = useSyncExternalStore(subscribe, atStart, atStartOnServer);

  // One of the galaxy's own motes, falling ahead of the rest: a thread of
  // light at the foot of the banner with a spark drifting down it into a
  // chevron that brightens as it lands. Shown only while the hero sits
  // untouched at the top; the first scroll starts the journey and it steps
  // aside, coming back if the user returns.
  return (
    <div
      className={styles.cue}
      data-shown={revealed && resting}
      aria-hidden="true"
    >
      <span className={styles.label}>Scroll</span>
      <span className={styles.track}>
        <span className={styles.thread} />
        <span className={styles.mote} />
      </span>
      <span className={styles.chevron} />
    </div>
  );
}
