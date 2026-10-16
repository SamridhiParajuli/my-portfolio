"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
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

export type StationNodes = { current: (HTMLElement | null)[] };

type Props = {
  nodesRef: StationNodes;
  /** "far": only the distant worlds, under the universe. "near": the rest.
   *  "titles": the distant worlds' title cards, over everything. "info":
   *  what each one is, in the sky opposite it. */
  depth: "far" | "near" | "titles" | "info";
};

export default function ProjectStations({ nodesRef, depth }: Props) {
  if (depth === "titles") return <TitleCards nodesRef={nodesRef} />;
  if (depth === "info") return <InfoPanels nodesRef={nodesRef} />;
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
                  ) : project.image ? (
                    // Eager: it is far down the journey, but must already
                    // have painted by the time its screen fades up.
                    <Image
                      src={project.image.src}
                      alt={project.image.alt}
                      fill
                      sizes="(max-width: 768px) 90vw, 44vw"
                      loading="eager"
                      style={{ objectPosition: project.image.position }}
                    />
                  ) : (
                    <div className={styles.placeholder}>
                      <span className={styles.scan} />
                      <span className={styles.sheen} />
                      <span className={styles.horizon} />
                    </div>
                  )}
                  <span className={styles.vignette} />
                </div>
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
        return (
          <div
            key={project.id}
            ref={(node) => {
              nodesRef.current[i] = node;
            }}
            className={styles.card}
            style={{ "--ps-accent": project.accent } as CSSProperties}
          >
            <span className={styles.cardRule} />
            <span className={styles.cardTitle}>{project.title}</span>
            <span className={styles.cardRule} data-end="trail" />
          </div>
        );
      })}
    </div>
  );
}

/**
 * What each distant world is, set in the empty sky on the far side of the
 * frame from its screen while the camera rests in front of it. Flat to the
 * lens and over everything, like its title. Placed and faded by
 * projectStations, which also staggers its lines in on the entrance's own
 * clock (--ps-info).
 */
function InfoPanels({ nodesRef }: { nodesRef: StationNodes }) {
  return (
    <div className={styles.layer}>
      {PROJECTS.map((project, i) => {
        if (!project.distant) return null;
        const { about } = project;
        return (
          <article
            key={project.id}
            ref={(node) => {
              nodesRef.current[i] = node;
            }}
            className={styles.info}
            style={{ "--ps-accent": project.accent } as CSSProperties}
          >
            {/* Its name is the credit under its screen; said here too for
                anyone not seeing either. */}
            <h3 className={styles.srOnly}>{project.title}</h3>
            <p className={styles.infoKind} style={{ "--line": 0 } as CSSProperties}>
              {about.kind}
            </p>
            <p className={styles.infoTagline} style={{ "--line": 1 } as CSSProperties}>
              {about.tagline}
            </p>
            <p className={styles.infoSummary} style={{ "--line": 2 } as CSSProperties}>
              {about.summary}
            </p>
            <dl className={styles.infoFacts} style={{ "--line": 3 } as CSSProperties}>
              {about.facts.map((fact) => (
                <div key={fact.label} className={styles.infoFact}>
                  <dt>{fact.label}</dt>
                  <dd>
                    {fact.href ? (
                      <a href={fact.href} target="_blank" rel="noreferrer">
                        {fact.value}
                      </a>
                    ) : (
                      fact.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        );
      })}
    </div>
  );
}
