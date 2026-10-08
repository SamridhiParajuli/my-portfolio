/**
 * bookSpread
 * ----------
 * What the open book (bookOpening) is written with. First its opening
 * spread: Education on the left-hand page and Certifications on the right,
 * written in together, as if the book itself were remembering them.
 * Nothing is clicked and nothing is turned to get there: it is open once,
 * and both pages come.
 *
 * Then, when the reader turns the page (a click, or a scroll on), the next
 * chapter. The right-hand leaf lifts from the spine and goes over
 * (bookOpening turns it), laying bare the page it lay on, and that page is
 * written: Experience. As the leaf goes over, Education fades from the
 * left-hand page, gently, back into the paper, and the leaf comes down on it
 * blank-backed; Certifications goes face down with the leaf it is on. Turned
 * back, it all comes back the other way.
 *
 * Nothing here floats over the book. The pages are set once into a map
 * that the book's own shader reads as ink (bookGL) -- page after page
 * across it, each laid onto its own face of its own leaf (bookMesh): how
 * much ink there is at each spot, whether it is the faded red of a rubric,
 * and the moment the pen reaches it. The shader lays that into the paper
 * under the same light as the rest of the book, spreading a little while it
 * is wet and pressed faintly into the page, so the paper's grain, toning
 * and foxing all show through it.
 *
 * Seconds from the moment the book lies open (the page clock):
 *   0.0  a warm light, like a candle carried past, crosses the spread;
 *   0.25 EDUCATION is written in, in black ink, as it goes by -- and a
 *        beat later, on the right-hand page, CERTIFICATIONS;
 *   0.8  a fine rule is drawn out under each;
 *   1.2  the entries, line by line: each page's first, then its second,
 *        the right-hand page a beat behind the left all the way down, so
 *        the two fill together;
 *   ~3.5 all of it written. The ink dries, and the spread is held for as
 *        long as the reader likes.
 * Experience keeps a clock of its own, from when the leaf turned over it
 * has laid it bare: the light crosses it at once, EXPERIENCE and its rule,
 * then each position; all of it written in about two seconds.
 */

import { BOOK } from "./antiqueBook";
import { INK_PAGES, PL } from "./bookMesh";

export type SpreadEntry = { title: string; place?: string };
export type SpreadPage = { heading: string; entries: readonly SpreadEntry[] };

// Non-breaking spaces ( ) keep a phrase on one line when it is set;
// a newline always breaks it.
export const EDUCATION: SpreadPage = {
  heading: "Education",
  entries: [
    {
      title: "Bachelor of Computer Science and Engineering",
      place: "Vellore Institute of Technology, India",
    },
    {
      title:
        "Ontario Graduate Certificate in Full Stack Software Development",
      place: "Lambton College, Canada",
    },
  ],
};

export const CERTIFICATIONS: SpreadPage = {
  heading: "Certifications",
  entries: [
    { title: "Introduction to Artificial Intelligence" },
    {
      title: "Artificial Intelligence Foundations:\nNeural Networks",
    },
  ],
};

// (The dash is held to the word before it: a line never begins with one.)
export const EXPERIENCE: SpreadPage = {
  heading: "Experience",
  entries: [
    { title: "Software Engineering Intern", place: "IME Digital, Nepal" },
    {
      title: "IT & Retail Support — Co-op",
      place: "Summerhill Market, Canada",
    },
  ],
};

/** Every page the book is written with, in the order of the map (bookMesh
 *  lays each onto its face): the opening spread's left-hand page and its
 *  right, then the page found under the right-hand leaf. */
export const PAGES = [EDUCATION, CERTIFICATIONS, EXPERIENCE] as const;
export const PAGE_EDUCATION = 0;
export const PAGE_CERTIFICATIONS = 1;
export const PAGE_EXPERIENCE = 2;

/** A page's width over its height. */
const ASPECT = PL / (1 - 2 * BOOK.SQ);

/* ------------------------------------------------------------------ *
 * The page clock
 * ------------------------------------------------------------------ */

/** The light crosses the spread over this. */
const CANDLE: [number, number] = [0, 1.9];
/** EDUCATION: when the pen begins it -- straight away. */
const HEADING_AT = 0.25;
/** A heading takes this, and this much more for every page-width of it. */
const HEAD_BASE = 0.3;
const HEAD_PER_WIDTH = 0.8;
/** The right-hand page follows the left by this, row for row. */
const FACING_LAG = 0.3;
/** A line takes this, and this much more for every page-width of it. */
const LINE_BASE = 0.12;
const LINE_PER_WIDTH = 0.55;
/** The next line is begun when this much of the last is still to go. */
const LINE_OVERLAP = 0.25;
/** Between one entry and the next. */
const ROW_GAP = 0.1;
/** A rule is drawn out over this, a lozenge between entries over this, and
 *  the pen pauses this long round either. */
const RULE_DUR = 0.35;
const SEP_DUR = 0.25;
const BEAT = 0.08;
/** Experience's own clock, from when the leaf turned over it lays it bare:
 *  the light crosses it over this, from the gutter out... */
const EXP_CANDLE: [number, number] = [0, 1.6];
/** ...and EXPERIENCE is begun as it reaches it. */
const EXP_HEADING_AT = 0.2;
/** Each position is written on its own, with this between them. */
const EXP_ROW_GAP = 0.15;
/** Once it is all written: the ink dries, and the float comes back. */
const DRY = 0.6;
const FLOAT_AFTER: [number, number] = [0.2, 1.4];

/* ------------------------------------------------------------------ *
 * How it is set: page fractions, x across the page as it lies, y down
 * from its head. The gutter curls away over the fifth of each page next
 * to it, and the edges are toned, so each column sits a little off the
 * middle, out on the flat of its page -- a right-hand one the left's
 * mirror, so the two stand balanced about the gutter.
 * ------------------------------------------------------------------ */

/** The left-hand column's middle, from the page's outer edge. */
const COL_X = 0.435;
const COL_W = 0.7;
/** Sizes, and the space between, in page heights. Every heading is set at
 *  one size: this, or less if the longest would not fit the column. */
const HEAD_SIZE = 0.052;
const HEAD_TRACK = 0.18;
const TITLE_SIZE = 0.035;
const TITLE_LEAD = 0.046;
const PLACE_SIZE = 0.03;
const HEAD_TO_RULE = 0.046;
const RULE_TO_ENTRY = 0.095;
const TITLE_TO_PLACE = 0.044;
const ENTRY_GAP = 0.1;
/** Where the middle of it all sits, down the page. */
const BLOCK_Y = 0.45;

/**
 * A line, as the pen goes along it, in spread units -- x from 0 at the
 * left-hand page's outer edge through 1 at the gutter to 2 at the right's
 * outer edge (whichever right-hand page it is), y 0..1 down from the head
 * -- and seconds: of the page clock, or of Experience's own (`late`).
 */
export type Stroke = {
  x0: number;
  x1: number;
  y: number;
  t0: number;
  t1: number;
  late: boolean;
};

export type SpreadInk = {
  /** The map: R how much ink, G when the pen reaches it (see inkFrom,
   *  inkTo), B how much of it is red. A page to each third, in the order
   *  of PAGES. */
  canvas: HTMLCanvasElement;
  strokes: Stroke[];
  /** Page seconds G runs over on the opening spread's pages, and seconds
   *  of Experience's own clock on the page found under the leaf; 255 in G
   *  is never. */
  inkFrom: number;
  inkTo: number;
  inkFrom2: number;
  inkTo2: number;
  /** When the last of the opening spread has been written, and when the
   *  page clock can stop, everything settled. */
  written: number;
  span: number;
  /** When the last of Experience has been written, on its own clock, and
   *  when that clock can stop. */
  expWritten: number;
  expSpan: number;
};

type Item = {
  kind: "text" | "rule" | "lozenge";
  /** Which page of the map it is on. */
  page: number;
  text: string;
  font: string;
  /** Extra space between letters, px. */
  track: number;
  size: number;
  x: number;
  y: number;
  w: number;
  ink: number;
  red: boolean;
  t0: number;
  t1: number;
};

/** One page, set: its heading and rule, and its entries in order. */
type PageSet = {
  head: Item;
  rule: Item;
  rows: Array<{ sep: Item | null; lines: Item[]; place: Item | null }>;
};

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function span(x: number, a: number, b: number) {
  return clamp((x - a) / (b - a), 0, 1);
}

/* ------------------------------------------------------------------ *
 * The face it is set in
 * ------------------------------------------------------------------ */

function family() {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-book")
    .trim();
  return `${v ? `${v}, ` : ""}Garamond, "Times New Roman", serif`;
}

/** Fetches the faces the pages are set in. Resolves either way: if they
 *  cannot be had in good time, it is set in whatever serif there is. */
export function loadPageFont(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) {
    return Promise.resolve();
  }
  const f = family();
  const all = Promise.all([
    document.fonts.load(
      `500 48px ${f}`,
      "EDUCATION CERTIFICATIONS EXPERIENCE Bachelor & —"
    ),
    document.fonts.load(`italic 500 48px ${f}`, "Vellore"),
  ]);
  const late = new Promise((r) => window.setTimeout(r, 4000));
  return Promise.race([all, late]).then(
    () => undefined,
    () => undefined
  );
}

/** How big to make the map for pages `pagePx` CSS px tall on screen: every
 *  page side by side, and never wider than a texture can be (`most`). */
export function spreadInkSize(
  pagePx: number,
  res: number,
  most = 4096
): [number, number] {
  const tallest = Math.min(2048, Math.floor(most / (INK_PAGES * ASPECT)) - 1);
  const h = Math.round(clamp(pagePx * res * 1.2, 720, tallest));
  return [INK_PAGES * Math.round(h * ASPECT), h];
}

/* ------------------------------------------------------------------ *
 * Setting it
 * ------------------------------------------------------------------ */

function widthOf(ctx: CanvasRenderingContext2D, text: string, track: number) {
  if (!track) return ctx.measureText(text).width;
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + track;
  return w - track;
}

/** Into as few lines as fit, broken so that they are as near the same
 *  length as they can be. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return [text];
  const words = text.split(" ");
  const n = words.length;
  const widthOf = (a: number, b: number) =>
    ctx.measureText(words.slice(a, b).join(" ")).width;
  for (let lines = 2; lines <= Math.min(4, n); lines++) {
    let best: number[] | null = null;
    let bestW = Infinity;
    const breaks: number[] = [];
    const search = (from: number, left: number) => {
      if (left === 1) {
        let w = widthOf(from, n);
        let prev = 0;
        for (const b of breaks) {
          w = Math.max(w, widthOf(prev, b));
          prev = b;
        }
        if (w < bestW) {
          bestW = w;
          best = [...breaks];
        }
        return;
      }
      for (let b = from + 1; b <= n - left + 1; b++) {
        breaks.push(b);
        search(b, left - 1);
        breaks.pop();
      }
    };
    search(0, lines);
    if (best && bestW <= maxW) {
      const out: string[] = [];
      let prev = 0;
      for (const b of [...(best as number[]), n]) {
        out.push(words.slice(prev, b).join(" "));
        prev = b;
      }
      return out;
    }
  }
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** How long the pen takes over a line `w` px long, on a page `W` wide. */
function lineDur(w: number, W: number) {
  return LINE_BASE + (w / W) * LINE_PER_WIDTH;
}

/**
 * When the pen goes along each part of a page on a page `W` wide: each
 * row (heading, rule, then each entry) begun no sooner than `notBefore`
 * says, with `gap` more between one entry and the next. Where each row was
 * begun goes into `starts`.
 */
function schedule(
  pg: PageSet,
  W: number,
  notBefore: (row: number) => number,
  starts: number[],
  gap: number
) {
  const { head, rule, rows } = pg;
  head.t0 = notBefore(0);
  head.t1 = head.t0 + HEAD_BASE + (head.w / W) * HEAD_PER_WIDTH;
  rule.t0 = Math.max(head.t1 - BEAT, notBefore(1));
  rule.t1 = rule.t0 + RULE_DUR;
  starts[0] = head.t0;
  starts[1] = rule.t0;
  let c = rule.t1 + BEAT;
  rows.forEach((e, i) => {
    c = Math.max(c, notBefore(2 + i));
    starts[2 + i] = c;
    if (e.sep) {
      e.sep.t0 = c - BEAT;
      e.sep.t1 = e.sep.t0 + SEP_DUR;
      c += BEAT;
    }
    for (const l of e.lines) {
      const d = lineDur(l.w, W);
      l.t0 = c;
      l.t1 = c + d;
      c = l.t1 - d * LINE_OVERLAP;
    }
    c = e.lines[e.lines.length - 1].t1 + BEAT / 2;
    if (e.place) {
      e.place.t0 = c;
      e.place.t1 = c + lineDur(e.place.w, W);
      c = e.place.t1;
    }
    c += gap;
  });
}

/**
 * Sets every page into a map `W` x `H` (the pages side by side, in the
 * order of PAGES): where the ink is, when it is written, and what colour
 * it is. Null if there is no canvas to be had.
 */
export function bakeSpread(W: number, H: number): SpreadInk | null {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const fam = family();
  const Wp = W / INK_PAGES;
  const colW = COL_W * Wp;
  const items: Item[] = [];
  const text = (
    page: number,
    cx: number,
    s: string,
    font: string,
    size: number,
    y: number,
    ink: number,
    red: boolean,
    track = 0
  ) => {
    ctx.font = font;
    const w = widthOf(ctx, s, track);
    items.push({
      kind: "text",
      page,
      text: s,
      font,
      track,
      size,
      x: cx - w / 2,
      y,
      w,
      ink,
      red,
      t0: 0,
      t1: 0,
    });
    return items[items.length - 1];
  };
  const mark = (
    page: number,
    cx: number,
    kind: "rule" | "lozenge",
    y: number,
    w: number,
    size: number,
    ink: number,
    red: boolean
  ) => {
    items.push({ kind, page, text: "", font: "", track: 0, size, x: cx - w / 2, y, w, ink, red, t0: 0, t1: 0 });
    return items[items.length - 1];
  };

  // One size for every heading, so no page outweighs another.
  let headSize = HEAD_SIZE * H;
  for (const pg of PAGES) {
    ctx.font = `500 ${headSize}px ${fam}`;
    const w = widthOf(ctx, pg.heading.toUpperCase(), headSize * HEAD_TRACK);
    if (w > colW) headSize *= colW / w;
  }
  const headFont = `500 ${headSize}px ${fam}`;
  const titleSize = TITLE_SIZE * H;
  const placeSize = PLACE_SIZE * H;
  const titleFont = `500 ${titleSize}px ${fam}`;
  const placeFont = `italic 500 ${placeSize}px ${fam}`;

  // Each entry's title as it breaks into lines.
  ctx.font = titleFont;
  const broken = PAGES.map((pg) =>
    pg.entries.map((e) =>
      e.title.split("\n").flatMap((s) => wrap(ctx, s, colW))
    )
  );
  // Set out from the headings' baseline at 0, and moved down the page
  // after. Each entry begins level with its fellow on the facing page, as a
  // printer would set them -- and Experience's with where Education's stood,
  // so the page after keeps the same measure.
  const rowY: number[] = [];
  let y = (HEAD_TO_RULE + RULE_TO_ENTRY) * H;
  const nRows = Math.max(...PAGES.map((pg) => pg.entries.length));
  for (let i = 0; i < nRows; i++) {
    rowY.push(y);
    let h = 0;
    PAGES.forEach((pg, k) => {
      const e = pg.entries[i];
      if (!e) return;
      const lines = broken[k][i].length;
      h = Math.max(h, (lines - 1) * TITLE_LEAD * H + (e.place ? TITLE_TO_PLACE * H : 0));
    });
    y += h + ENTRY_GAP * H + TITLE_SIZE * H * 0.2;
  }

  const pages: PageSet[] = PAGES.map((pg, k) => {
    // Its column's middle, on its own part of the map: out on the flat of
    // the page, a right-hand page's the left-hand one's mirror.
    const cx = (k === PAGE_EDUCATION ? COL_X : k + 1 - COL_X) * Wp;
    const head = text(k, cx, pg.heading.toUpperCase(), headFont, headSize, 0, 0.92, true, headSize * HEAD_TRACK);
    const rule = mark(k, cx, "rule", HEAD_TO_RULE * H, 0.24 * Wp, headSize, 0.8, true);
    const rows = pg.entries.map((e, i) => {
      const y0 = rowY[i];
      const sep = i > 0 ? mark(k, cx, "lozenge", y0 - ENTRY_GAP * H * 0.5, 0.014 * Wp, titleSize, 0.62, false) : null;
      const lines = broken[k][i].map((s, j) =>
        text(k, cx, s, titleFont, titleSize, y0 + j * TITLE_LEAD * H, 1, false)
      );
      const place = e.place
        ? text(k, cx, e.place, placeFont, placeSize, y0 + (lines.length - 1) * TITLE_LEAD * H + TITLE_TO_PLACE * H, 0.9, false)
        : null;
      return { sep, lines, place };
    });
    return { head, rule, rows };
  });

  // Down the page, so the middle of the opening spread sits where it
  // should; the page after is set level with it.
  const top = -headSize * 0.7;
  let bottom = 0;
  for (const it of items) {
    if (it.kind === "text" && it.page !== PAGE_EXPERIENCE) {
      bottom = Math.max(bottom, it.y + it.size * 0.3);
    }
  }
  const dy = BLOCK_Y * H - (top + bottom) / 2;
  for (const it of items) it.y += dy;

  // When the pen goes along each: the left-hand page from HEADING_AT, and
  // the right a beat behind it, row for row...
  const left: number[] = [];
  schedule(pages[PAGE_EDUCATION], Wp, (r) => (r === 0 ? HEADING_AT : 0), left, ROW_GAP);
  schedule(pages[PAGE_CERTIFICATIONS], Wp, (r) => (left[r] ?? -Infinity) + FACING_LAG, [], ROW_GAP);
  // ...and the page under the leaf, on its own clock from when the leaf
  // lays it bare, each position on its own.
  schedule(pages[PAGE_EXPERIENCE], Wp, (r) => (r === 0 ? EXP_HEADING_AT : 0), [], EXP_ROW_GAP);
  let written = 0;
  let expWritten = 0;
  for (const it of items) {
    if (it.page === PAGE_EXPERIENCE) expWritten = Math.max(expWritten, it.t1);
    else written = Math.max(written, it.t1);
  }
  const pageSpan = written + DRY + FLOAT_AFTER[1];
  // Each clock only as long as its pages need, so G keeps its precision.
  const inkFrom = HEADING_AT - 0.5;
  const inkTo = written + 1;
  const inkFrom2 = EXP_HEADING_AT - 0.5;
  const inkTo2 = expWritten + 1;
  const byte = (page: number, t: number) => {
    const late = page === PAGE_EXPERIENCE;
    const from = late ? inkFrom2 : inkFrom;
    const to = late ? inkTo2 : inkTo;
    return Math.min(254, Math.round(clamp((t - from) / (to - from), 0, 1) * 255));
  };

  // G: never, everywhere but where there is something to write.
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgb(0,255,0)";
  ctx.fillRect(0, 0, W, H);
  const field = (it: Item, x0: number, x1: number, y0: number, y1: number) => {
    const b = it.red ? 255 : 0;
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, `rgb(0,${byte(it.page, it.t0)},${b})`);
    g.addColorStop(1, `rgb(0,${byte(it.page, it.t1)},${b})`);
    ctx.fillStyle = g;
    const l = Math.min(x0, x1);
    const r = Math.max(x0, x1);
    const pad = (r - l) * 0.02 + 6;
    ctx.fillRect(x0 < x1 ? l : l - pad, y0, r - l + pad, y1 - y0);
  };
  for (const it of items) {
    const s = it.size;
    const y0 = it.y - s * 0.95;
    const y1 = it.y + s * 0.38;
    if (it.kind === "rule") {
      // Drawn out both ways from the middle.
      const mid = it.x + it.w / 2;
      field(it, mid, it.x - s * 0.2, it.y - s * 0.4, it.y + s * 0.4);
      field(it, mid, it.x + it.w + s * 0.2, it.y - s * 0.4, it.y + s * 0.4);
    } else if (it.kind === "lozenge") {
      field(it, it.x - s * 0.3, it.x + it.w + s * 0.3, it.y - s * 0.4, it.y + s * 0.4);
    } else {
      field(it, it.x - s * 0.3, it.x + it.w + s * 0.3, y0, y1);
    }
  }

  // R: the ink itself, added over the field without touching G or B.
  ctx.globalCompositeOperation = "lighter";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  for (const it of items) {
    ctx.fillStyle = `rgb(${Math.round(255 * it.ink)},0,0)`;
    if (it.kind === "text") {
      ctx.font = it.font;
      if (!it.track) {
        ctx.fillText(it.text, it.x, it.y);
      } else {
        let x = it.x;
        for (const ch of it.text) {
          ctx.fillText(ch, x, it.y);
          x += ctx.measureText(ch).width + it.track;
        }
      }
    } else if (it.kind === "rule") {
      // A fine engraved rule, swelling to a small lozenge at its middle.
      const mid = it.x + it.w / 2;
      const th = Math.max(1, H * 0.0014);
      const lz = it.size * 0.13;
      ctx.beginPath();
      ctx.moveTo(it.x, it.y);
      ctx.quadraticCurveTo(mid - lz * 3, it.y - th, mid - lz * 1.6, it.y);
      ctx.quadraticCurveTo(mid - lz * 3, it.y + th, it.x, it.y);
      ctx.moveTo(it.x + it.w, it.y);
      ctx.quadraticCurveTo(mid + lz * 3, it.y - th, mid + lz * 1.6, it.y);
      ctx.quadraticCurveTo(mid + lz * 3, it.y + th, it.x + it.w, it.y);
      ctx.fill();
      lozenge(ctx, mid, it.y, lz);
    } else {
      lozenge(ctx, it.x + it.w / 2, it.y, it.w / 2);
    }
  }
  ctx.globalCompositeOperation = "source-over";

  const strokes: Stroke[] = [];
  for (const it of items) {
    if (it.kind === "lozenge") continue;
    // Into spread units: the left-hand page 0..1, a right-hand one 1..2.
    const off = it.page === PAGE_EDUCATION ? 0 : (it.page - 1) * Wp;
    strokes.push({
      x0: (it.x - off) / Wp,
      x1: (it.x + it.w - off) / Wp,
      y: (it.y - (it.kind === "text" ? it.size * 0.32 : 0)) / H,
      t0: it.t0,
      t1: it.t1,
      late: it.page === PAGE_EXPERIENCE,
    });
  }
  return {
    canvas,
    strokes,
    inkFrom,
    inkTo,
    inkFrom2,
    inkTo2,
    written,
    span: pageSpan,
    expWritten,
    expSpan: expWritten + DRY,
  };
}

function lozenge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x, y - r * 0.8);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r * 0.8);
  ctx.closePath();
  ctx.fill();
}

/* ------------------------------------------------------------------ *
 * Over the page clock
 * ------------------------------------------------------------------ */

/** The float the book had shut, 0..1, as it is written: none at all until
 *  the last of it is done, then some of it back. */
export function pageCalm(ink: SpreadInk | null, p: number) {
  if (!ink) return 0;
  const at = ink.written + DRY * 0.4;
  return span(p, at + FLOAT_AFTER[0], at + FLOAT_AFTER[1]);
}

/**
 * The candlelight: across the whole spread first, at page time `p`; or, if
 * `e` (Experience's own clock) is past 0, across the page the turned leaf
 * laid bare, from the gutter out. out: [x, y, how bright], x and y as for a
 * Stroke, running off the pages at both sides.
 */
export function candleAt(p: number, e: number, time: number, out: number[]) {
  const again = e > 0;
  const q = again
    ? span(e, EXP_CANDLE[0], EXP_CANDLE[1])
    : span(p, CANDLE[0], CANDLE[1]);
  const k = 0.5 - 0.5 * Math.cos(Math.PI * q);
  out[0] = again ? lerp(0.8, 2.25, k) : lerp(-0.2, 2.2, k);
  out[1] = lerp(0.26, 0.44, k) - 0.04 * Math.sin(Math.PI * k);
  const flicker =
    1 +
    0.06 * Math.sin(time * 9.3) * Math.sin(time * 5.1 + 0.7) +
    0.035 * Math.sin(time * 23.1 + 1.9);
  // Near its full warmth over the pages, not only in the middle of its way.
  out[2] = Math.pow(Math.sin(Math.PI * q), 0.8) * flicker;
}

/** Where the pens are at page time `p` and Experience's time `e`: the
 *  fronts of the lines being written, as [x, y] pairs into `out`. Returns
 *  how many. */
export function pensAt(ink: SpreadInk, p: number, e: number, out: number[]) {
  let n = 0;
  for (const s of ink.strokes) {
    const c = s.late ? e : p;
    if (c <= s.t0 || c >= s.t1) continue;
    if ((n + 1) * 2 > out.length) break;
    const f = (c - s.t0) / (s.t1 - s.t0);
    out[n * 2] = s.x0 + (s.x1 - s.x0) * f;
    out[n * 2 + 1] = s.y;
    n++;
  }
  return n;
}
