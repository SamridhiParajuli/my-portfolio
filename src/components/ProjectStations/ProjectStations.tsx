"use client";

import type { CSSProperties } from "react";
import { PROJECTS } from "./projects";
import styles from "./ProjectStations.module.css";

/**
 * The five project screens, as DOM standing inside the journey's world.
 *
 * This component only declares them; where each one is, how large it reads
 * and whether it can be seen at all are written onto these nodes every
 * frame by projectStations, from the journey's own camera. Nothing here
 * knows about scroll.
 *
 * DOM rather than canvas for one reason: the media slot below has to become
 * a real <video> later without a single number around it changing. It sits
 * over the journey canvas so a screen occludes what is behind it, and under
 * a second canvas carrying the motes that are in front of it -- so the dust
 * still drifts across a screen rather than stopping at its edge.
 *
 * A distant world is the exception, and is rendered as a layer of its own
 * *under* the journey canvas: everything that canvas draws is nearer than
 * it, so stars cross its face and the hole's matter and shadow cover it,
 * exactly as they would. Each screen keeps its index in PROJECTS whichever
 * layer it is in, so the nodes line up with the stations either way.
 */

export type StationNodes = { current: (HTMLDivElement | null)[] };

type Props = {
  nodesRef: StationNodes;
  /** "far": only the distant worlds, under the universe. "near": the rest.
   *  "titles": the distant worlds' title cards, over everything. */
  depth: "far" | "near" | "titles";
};

export default function ProjectStations({ nodesRef, depth }: Props) {
  if (depth === "titles") return <TitleCards nodesRef={nodesRef} />;
  return (
    <div className={styles.layer}>
      {PROJECTS.map((project, i) => {
        if ((depth === "far") !== Boolean(project.distant)) return null;
        return (
          <div
            key={project.id}
            ref={(node) => {
              nodesRef.current[i] = node;
            }}
            className={styles.station}
            // Which side of frame this one stands on, so its title can hang
            // off the edge facing the middle. A screen goes by toward the
            // outside, and a title on its outer corner would be the first
            // thing off screen -- exactly while it is meant to be read.
            data-side={project.offX < 0 ? "left" : "right"}
            data-distant={project.distant ? "" : undefined}
            style={{ "--ps-accent": project.accent } as CSSProperties}
          >
            {/* God-rays, bursting out from behind the screen as it makes
                its entrance. */}
            <span className={styles.rays} />
            {/* Everything below turns with the panel, title included: it is
                one object in space, not a card with a caption under it. */}
            <div className={styles.frame}>
              <div className={styles.panel}>
                {/* THE MEDIA SLOT. A <video> dropped in here inherits the
                    box, the perspective and the timing untouched. */}
                <div className={styles.media}>
                  {project.media ? (
                    <video
                      src={project.media}
                      poster={project.poster ?? undefined}
                      muted
                      loop
                      playsInline
                      preload="none"
                    />
                  ) : (
                    <div className={styles.placeholder}>
                      <span className={styles.scan} />
                      <span className={styles.sheen} />
                      <span className={styles.horizon} />
                    </div>
                  )}
                  <span className={styles.vignette} />
                  <span className={styles.glint} />
                </div>
                {/* The white-out it opens in, over whatever is playing. */}
                <span className={styles.flash} />
                <span className={styles.edge} />
                <span className={styles.corners} />
                <span className={styles.bloom} />
              </div>
              <div className={styles.label}>
                <span className={styles.rule} />
                <span className={styles.title}>{project.title}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Letters of a title, spaces made to hold their width. */
function glyphs(title: string) {
  return title.replace(/ /g, " ");
}

/**
 * Each distant world's name, as the credit its entrance ends on. Flat to the
 * lens, like any title, and in a layer of its own over the picture, so
 * nothing out there crosses it. Placed and faded by projectStations, along
 * with the screen it belongs to.
 */
function TitleCards({ nodesRef }: { nodesRef: StationNodes }) {
  return (
    <div className={styles.layer}>
      {PROJECTS.map((project, i) => {
        if (!project.distant) return null;
        const text = glyphs(project.title);
        return (
          <div
            key={project.id}
            ref={(node) => {
              nodesRef.current[i] = node;
            }}
            className={styles.card}
            style={
              {
                "--ps-accent": project.accent,
                "--n": text.length,
              } as CSSProperties
            }
          >
            <span className={styles.cardRule} />
            <span className={styles.cardTitle}>
              <span className={styles.srOnly}>{project.title}</span>
              <span className={styles.cardLetters} aria-hidden="true">
                {[...text].map((ch, j) => (
                  <span
                    key={j}
                    className={styles.letter}
                    style={{ "--i": j } as CSSProperties}
                  >
                    {ch}
                  </span>
                ))}
              </span>
              {/* The same line again, as nothing but the light running
                  across it. */}
              <span className={styles.cardSheen} aria-hidden="true">
                {text}
              </span>
            </span>
            <span className={styles.cardRule} data-end="trail" />
          </div>
        );
      })}
    </div>
  );
}
