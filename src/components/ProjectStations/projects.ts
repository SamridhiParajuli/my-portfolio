/**
 * The five projects, as places in the universe.
 * ---------------------------------------------
 * These are not sections, slides or cards. Each entry below is a distant
 * world seen along the existing camera journey (galaxy -> gateway -> black
 * hole -> deeper): a screen so far beyond everything else that the camera
 * never nears it -- it hangs in its own part of the sky, the size it is,
 * while the camera travels on (see `distant`). All five are inside the
 * hole: the guide leads the camera in first, then on from one to the next.
 *
 * The camera comes to rest at each one -- HOLDS, below, are the stops the
 * journey director flies it between (see journeyDirector) -- and every
 * world runs on the same overlapping stretches of the flight to it:
 *
 *   fadeIn    the light it gives off, climbing out of nothing over a long
 *             stretch -- something is out there before anything is seen;
 *   resolve   where it starts is the cue for its entrance: a short, quiet
 *             timed reveal (the screen fading up into focus, its name
 *             fading in under it -- see BEAT_END in projectStations), which
 *             settles on it exactly as soft as it is from this far off;
 *   lost      and, after a while holding, simply thinning away again.
 *
 * Each one makes its entrance while the one before is still there, so one
 * is always still holding or thinning away as the next one arrives.
 *
 * (A def without `distant` is a place the camera flies past instead: a
 * screen inside a cloud of matter, growing as it nears and swept behind.
 * None use that now.)
 *
 * This file is the only place any of that is decided, and the only file that
 * has to change when the real demo videos arrive: set `media` and the
 * position, scale, perspective, timing and the dust around each screen all
 * stay exactly as they are.
 *
 * What each project *is* lives here too (`about`): the panel set in the
 * empty side of the sky opposite its screen while the camera rests there.
 */

import { HORIZON_Z } from "@/components/BannerParticlePortal/blackHoleJourney";

/** One line of a project's facts: what it was built with, what it achieved,
 *  where its code is. */
export type ProjectFact = {
  label: string;
  value: string;
  href?: string;
};

export type ProjectAbout = {
  /** What kind of thing it is, in a few plain words. */
  kind: string;
  /** The line the panel opens on. */
  tagline: string;
  /** What it does and how, in a few sentences. */
  summary: string;
  facts: readonly ProjectFact[];
};

export type ProjectStationDef = {
  id: string;
  /** Only ever on screen while the camera is actually near this place. */
  title: string;
  about: ProjectAbout;
  /** "r,g,b" -- the light this place throws into the space around it.
   *  Warms near the galaxy, cools and turns stranger with depth. */
  accent: string;
  /**
   * THE MEDIA SLOT. null renders the placeholder; a path renders that file
   * in the identical box, at the identical size and perspective, resolving
   * on the identical curve. Nothing else about the journey reads this field.
   */
  media: string | null;
  /** Optional still shown until the video can paint. */
  poster: string | null;
  /** A still for the slot while there is no video: a path under /public,
   *  what it shows, and (CSS object-position) which part of it to keep when
   *  it is not the screen's shape -- the middle, if not said. */
  image: { src: string; alt: string; position?: string } | null;

  /* --- where it is --- */

  /** Depth along the journey's own axis, in UNIT (the projection's focal
   *  length). The camera starts at 0 and the event horizon is at HORIZON_Z,
   *  so anything larger than that is inside the hole. */
  z: number;
  /** Offset from the camera's path at that depth, measured in the screen's
   *  own half-width / half-height -- so the framing of each encounter is
   *  identical on a phone and on a 34" monitor. Positive x is the side of
   *  frame the camera's own swing is heading toward. */
  offX: number;
  offY: number;
  /** Screen size, relative to the layer's reference width. */
  width: number;
  /** Resting yaw, in degrees: these are panels standing in space, not
   *  billboards glued to the lens. Negative turns a screen on the right of
   *  frame to half-face the camera; positive does the same on the left. A
   *  little more is added from how far off-axis it currently sits, so it
   *  keeps facing the viewer as it goes by. */
  yaw: number;
  /** Camera distances (UNIT) between which the screen itself climbs out of
   *  nothing. Long, and weighted to the end, so there is no distance at
   *  which it "appears". For a distant world: its light, and the end of
   *  this is where it is placed from. */
  fadeIn: readonly [number, number];
  /** ...and between which it stops being haze and becomes a surface. For a
   *  distant world only the start counts: its entrance is cued there. */
  resolve: readonly [number, number];
  /** ...and between which it thins away as the camera reaches its plane.
   *  Deliberately close: the screen stays solid while it is being looked at
   *  and while it swells past, out of focus, toward the edge of frame -- it
   *  only goes once the camera is actually through it. null for the last
   *  one: the journey ends on it. */
  fadeOut: readonly [number, number] | null;
  /**
   * A world far beyond everything else in the journey, rather than one the
   * camera flies past. It is so distant that the flight toward the hole
   * barely changes it -- it stays where it is, the size it is, drifting
   * only by a little parallax -- and it is drawn *under* the universe, since
   * every other thing out there is nearer: stars and matter drift across
   * it. Its light comes up out of the haze (`fadeIn`), it makes its
   * entrance when the camera reaches the start of `resolve`, holds, and
   * simply fades away again as the camera carries on (`lost`). `offX`/`offY` then only say which side of frame it
   * is on; `fadeOut` does not apply, as it is never reached.
   */
  distant?: {
    /** Where in frame it hangs once it has surfaced, as fractions of the
     *  viewport's width and height. */
    frame: readonly [number, number];
    /** How large it reads there, against its layout width -- so its detail
     *  is drawn at the scale it is actually seen at. */
    scale: number;
    /** How far out of the haze it ever comes, 0..1. Near 1 now that each
     *  screen holds a picture of its project, which has to be made out --
     *  just short of it, so it is still a thing seen from far off. */
    clarity: number;
    /** Camera distances (UNIT) between which it fades away. */
    lost: readonly [number, number];
    /** Where its panel goes down the frame: level with it (the default) --
     *  hanging from its top, or up from the foot of its title -- or centred
     *  in the room between the header and the foot of the frame. */
    panel?: "level" | "centred";
  };

  /* --- the space it stands in --- */

  /** The cloud of matter this place is made of. The camera flies through all
   *  of it, so these are what actually carry the discovery: the screen is
   *  only ever the thing at the middle of them. */
  world: {
    /** Lateral reach, in the screen's own half-widths. */
    spread: number;
    /** How far the cloud reaches toward the camera from the screen's plane,
     *  and how far past it, in UNIT. Chosen so consecutive clouds overlap:
     *  the camera is never between worlds, only deeper into one. */
    ahead: number;
    behind: number;
    /** Relative density -- each world should feel like its own place. */
    density: number;
  };
};

/** How far beyond the camera each world inside the hole stands once it has
 *  surfaced, in UNIT -- far enough that the rest of its time in view changes
 *  how large it reads by under a tenth: it never grows toward the camera. */
const INSIDE_BEYOND = 150;
/** How large every world reads once it has surfaced (`distant.scale`):
 *  near enough that the picture on its screen can be made out. */
const WORLD_SCALE = 0.62;
/** Where the camera comes to rest in front of each world, in UNIT past the
 *  horizon -- evenly apart, so every stretch of the flight between two of
 *  them is the same length of travel. The fall ends 31.5 past. */
const HOLD_01 = 4.2;
const HOLD_02 = 10.2;
const HOLD_03 = 16.2;
const HOLD_04 = 22.2;
const HOLD_05 = 28.1;
/** The stops, in order, for the director that flies the camera to them. */
export const HOLDS = [HOLD_01, HOLD_02, HOLD_03, HOLD_04, HOLD_05] as const;
/** How far into the flight from the stop before it (0..1 of the distance)
 *  each world's entrance is cued: late enough that it is met as the camera
 *  is coming to rest in front of it, not while it is still rushing past. */
const CUE_AT = 0.6;
/** Camera depth (UNIT past the horizon) `k` of the way from one stop on to
 *  the next. */
function between(from: number, to: number, k: number) {
  return HORIZON_Z + from + (to - from) * k;
}
const WORLD_01_Z = HORIZON_Z + HOLD_01 + INSIDE_BEYOND;
const WORLD_02_Z = HORIZON_Z + HOLD_02 + INSIDE_BEYOND;
const WORLD_03_Z = HORIZON_Z + HOLD_03 + INSIDE_BEYOND;
const WORLD_04_Z = HORIZON_Z + HOLD_04 + INSIDE_BEYOND;
const WORLD_05_Z = HORIZON_Z + HOLD_05 + INSIDE_BEYOND;

/**
 * A distant world's timings are really about where the camera is along the
 * journey, so they are written as the camera depths (UNIT) it passes
 * between, and turned here into the camera distances every def is read in.
 */
function seen(worldZ: number, from: number, to: number) {
  return [worldZ - from, worldZ - to] as const;
}

export const PROJECTS: readonly ProjectStationDef[] = [
  {
    // The first world: the first thing on the other side of the horizon,
    // high in the upper right. Its light surfaces out of the crossing's own
    // haze as the camera follows the guide through, and it makes its
    // entrance as the camera comes to rest in front of it.
    id: "project-01",
    title: "Talk to Database",
    about: {
      kind: "Speech-to-SQL system",
      tagline: "Ask your database a question, out loud.",
      summary:
        "Speak a question in plain English. Whisper turns it into text, a fine-tuned text-to-SQL model writes the query, and a FastAPI service runs it against whichever database is connected. The answer comes back in a Next.js interface as a clean table, visualized in real time.",
      facts: [
        {
          label: "Built with",
          value: "Python, Whisper, Text2SQL (NSQL-350M, fine-tuned with PEFT), FastAPI, Next.js",
        },
        {
          label: "Results",
          value: "90%+ query accuracy; about 60% less time spent querying by hand",
        },
        {
          label: "Source",
          value: "github.com/SamridhiParajuli/TalkToDatabase",
          href: "https://github.com/SamridhiParajuli/TalkToDatabase",
        },
      ],
    },
    accent: "255, 198, 146",
    media: null,
    poster: null,
    image: {
      src: "/images/projects/talk-to-database.png",
      alt: "Illustration of a girl at her desk chatting with a friendly database character in front of a screen of code",
    },
    z: WORLD_01_Z,
    offX: 1,
    offY: -1,
    width: 0.98,
    yaw: -6,
    fadeIn: seen(WORLD_01_Z, HORIZON_Z - 1, HORIZON_Z + HOLD_01),
    resolve: seen(
      WORLD_01_Z,
      between(0, HOLD_01, CUE_AT),
      HORIZON_Z + HOLD_01 - 0.4
    ),
    fadeOut: null,
    distant: {
      frame: [0.69, 0.3],
      scale: WORLD_SCALE,
      clarity: 0.94,
      lost: seen(WORLD_01_Z, HORIZON_Z + HOLD_01 + 1.2, HORIZON_Z + HOLD_02),
    },
    // Never near enough for its cloud to show; every place has one.
    world: { spread: 3.2, ahead: 7, behind: 8.5, density: 1 },
  },
  /*
   * The other four are distant worlds exactly as the first is: the same
   * softness, size and fade, each hanging in its own part of the sky. Each
   * one's light rises as the camera leaves the one before, and the one
   * before thins away as the camera goes on to it.
   */
  {
    // Upper left.
    id: "project-02",
    title: "Guff – Real-Time Chat Application",
    about: {
      kind: "Messaging web app",
      tagline: "Chat that keeps up with the conversation.",
      summary:
        "Guff delivers messages the instant they are sent, and shows who is typing and when a message has been read. It runs on Next.js, with Redis handling data fast enough to stay low-latency while many people talk at once.",
      facts: [
        { label: "Built with", value: "Next.js, React, Redis" },
        {
          label: "Features",
          value: "Instant messaging, typing indicators, read receipts",
        },
        {
          label: "Designed for",
          value: "Low latency and high concurrency across many active users",
        },
      ],
    },
    accent: "255, 176, 118",
    media: null,
    poster: null,
    image: {
      src: "/images/projects/guff-chat.png",
      alt: "Illustration of a person and a robot facing each other across a conversation of chat bubbles",
      // Taller than the screen: cropped so the whole conversation shows.
      position: "50% 34%",
    },
    z: WORLD_02_Z,
    offX: -1,
    offY: -1,
    width: 0.98,
    yaw: 6,
    fadeIn: seen(WORLD_02_Z, HORIZON_Z + HOLD_01 + 0.6, HORIZON_Z + HOLD_02),
    resolve: seen(
      WORLD_02_Z,
      between(HOLD_01, HOLD_02, CUE_AT),
      HORIZON_Z + HOLD_02 - 0.4
    ),
    fadeOut: null,
    distant: {
      frame: [0.31, 0.3],
      scale: WORLD_SCALE,
      clarity: 0.94,
      lost: seen(WORLD_02_Z, HORIZON_Z + HOLD_02 + 1.2, HORIZON_Z + HOLD_03),
    },
    world: { spread: 3.6, ahead: 8, behind: 9, density: 1.1 },
  },
  {
    // Lower right.
    id: "project-03",
    title: "NFT Marketplace",
    about: {
      kind: "Digital artwork gallery",
      tagline: "A gallery where the art is owned on-chain.",
      summary:
        "Art lovers mint, buy and sell NFTs in a decentralized marketplace. Solidity smart contracts settle every sale securely on the blockchain, MetaMask sign-in proves who owns what and handles payment, and a gallery-style interface keeps the artwork at the centre.",
      facts: [
        { label: "Built with", value: "Next.js, React, Solidity, MetaMask" },
        {
          label: "Features",
          value: "Minting, buying and selling; wallet sign-in; ownership verification",
        },
      ],
    },
    accent: "244, 148, 126",
    media: null,
    poster: null,
    image: {
      src: "/images/projects/nft-marketplace.png",
      alt: "Illustration of an NFT marketplace on a computer screen, linked to artworks and Ethereum coins",
    },
    z: WORLD_03_Z,
    offX: 1,
    offY: 1,
    width: 0.98,
    yaw: -6,
    fadeIn: seen(WORLD_03_Z, HORIZON_Z + HOLD_02 + 0.6, HORIZON_Z + HOLD_03),
    resolve: seen(
      WORLD_03_Z,
      between(HOLD_02, HOLD_03, CUE_AT),
      HORIZON_Z + HOLD_03 - 0.4
    ),
    fadeOut: null,
    distant: {
      frame: [0.69, 0.6],
      scale: WORLD_SCALE,
      clarity: 0.94,
      lost: seen(WORLD_03_Z, HORIZON_Z + HOLD_03 + 1.2, HORIZON_Z + HOLD_04),
    },
    world: { spread: 2.8, ahead: 6.5, behind: 8, density: 0.9 },
  },
  {
    // Lower left.
    id: "project-04",
    title: "Virtual Voice Assistant",
    about: {
      kind: "Desktop voice assistant",
      tagline: "A desktop you can talk to.",
      summary:
        "A Python desktop app that runs on voice commands: open applications, search the web or check system information without touching the keyboard. Each user signs in to their own assistant, and their data is kept encrypted.",
      facts: [
        {
          label: "Built with",
          value: "Python, speech recognition, task automation",
        },
        { label: "Results", value: "92% speech recognition accuracy" },
        {
          label: "Security",
          value: "User authentication and data encryption",
        },
      ],
    },
    accent: "212, 134, 168",
    media: null,
    poster: null,
    image: {
      src: "/images/projects/voice-assistant.png",
      alt: "A person speaking to a voice assistant on a phone showing a microphone and a glowing sound wave",
    },
    z: WORLD_04_Z,
    offX: -1,
    offY: 1,
    width: 0.98,
    yaw: 6,
    fadeIn: seen(WORLD_04_Z, HORIZON_Z + HOLD_03 + 0.6, HORIZON_Z + HOLD_04),
    resolve: seen(
      WORLD_04_Z,
      between(HOLD_03, HOLD_04, CUE_AT),
      HORIZON_Z + HOLD_04 - 0.4
    ),
    fadeOut: null,
    distant: {
      frame: [0.31, 0.6],
      scale: WORLD_SCALE,
      clarity: 0.94,
      lost: seen(WORLD_04_Z, HORIZON_Z + HOLD_04 + 1.2, HORIZON_Z + HOLD_05),
      panel: "centred",
    },
    world: { spread: 3.4, ahead: 7.5, behind: 9, density: 1.05 },
  },
  {
    // Upper right, and gone just before the camera comes to rest at the
    // bottom of the fall, where the Education book is made.
    id: "project-05",
    title: "Online Fashion Jewelry Store",
    about: {
      kind: "E-commerce website",
      tagline: "A jewelry store built for browsing.",
      summary:
        "An optimized online store with more than 100 products. React keeps browsing quick and responsive, MongoDB manages products and orders, and search, filters and a cart lead to a secure checkout.",
      facts: [
        { label: "Built with", value: "React, MongoDB" },
        {
          label: "Features",
          value: "Product search and filtering, cart management, secure checkout",
        },
      ],
    },
    accent: "176, 148, 228",
    media: null,
    poster: null,
    image: {
      src: "/images/projects/jewelry-store.png",
      alt: "Two people browsing an online jewelry shop on a laptop",
    },
    z: WORLD_05_Z,
    offX: 1,
    offY: -1,
    width: 0.98,
    yaw: -6,
    fadeIn: seen(WORLD_05_Z, HORIZON_Z + HOLD_04 + 0.6, HORIZON_Z + HOLD_05),
    resolve: seen(
      WORLD_05_Z,
      between(HOLD_04, HOLD_05, CUE_AT),
      HORIZON_Z + HOLD_05 - 0.4
    ),
    fadeOut: null,
    distant: {
      frame: [0.69, 0.3],
      scale: WORLD_SCALE,
      clarity: 0.94,
      lost: seen(WORLD_05_Z, HORIZON_Z + 28.9, HORIZON_Z + 31.4),
    },
    world: { spread: 3, ahead: 7, behind: 10, density: 1.2 },
  },
] as const;
