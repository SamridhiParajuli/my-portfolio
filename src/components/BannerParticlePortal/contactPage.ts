/**
 * contactPage
 * -----------
 * What the parchment is written with once it lies open (bookFinale): the
 * last thing the book has to say. CONTACT, in the faded red of a rubric,
 * its rule drawn out under it, and then, one by one, the ways to write --
 * each named in red italic, as an old printer would rubricate a heading,
 * with the address under it in the brown of iron-gall ink.
 *
 * Nothing here floats over the parchment: it is set once into a map the
 * book's own shader lays into the parchment as ink (bookGL), exactly as
 * the book's pages were (bookSpread) -- how much ink there is at each spot,
 * whether it is red, and the moment the pen reaches it.
 *
 * Seconds from the moment the parchment lies open (its page clock):
 *   0.3  a warm light, like a candle carried past, crosses it;
 *   0.9  CONTACT is written as it goes by, and its rule under it;
 *   2.2  the entries: each name, then its address, one after another --
 *        on a wide screen two to a row, the right one a beat behind;
 *  ~7.5  all of it written. The ink dries, and there it stays.
 */

import { YP } from "./bookMesh";
import { LH_FINAL } from "./parchmentScroll";

export type ContactEntry = {
  label: string;
  value: string;
  href: string;
};

export const CONTACT = {
  heading: "Contact",
  entries: [
    {
      label: "Email",
      value: "samridhiii.parajuli@gmail.com",
      href: "mailto:samridhiii.parajuli@gmail.com",
    },
    { label: "Phone", value: "647 674 5490", href: "tel:+16476745490" },
    {
      label: "LinkedIn",
      value: "linkedin.com/in/SamridhiParajuli",
      href: "https://www.linkedin.com/in/SamridhiParajuli",
    },
    {
      label: "GitHub",
      value: "github.com/SamridhiParajuli",
      href: "https://github.com/SamridhiParajuli",
    },
  ] as readonly ContactEntry[],
};

/** The map covers the whole sheet: u across it, v down it. Its width over
 *  its height. */
const ASPECT = (2 * LH_FINAL) / (2 * YP);

/* ------------------------------------------------------------------ *
 * The page clock
 * ------------------------------------------------------------------ */

/** The light crosses the parchment over this. */
const CANDLE: [number, number] = [0.3, 3.5];
const HEADING_AT = 0.9;
/** A heading takes this, and this much more for every sheet-height of it;
 *  a line likewise -- so the pen keeps one pace however wide the parchment
 *  opens. */
const HEAD_BASE = 0.6;
const HEAD_PER_HEIGHT = 1.22;
const LINE_BASE = 0.3;
const LINE_PER_HEIGHT = 1.15;
/** Between an entry's name and its address, and between entries; and how
 *  far a right-hand entry follows its fellow on the left. */
const LABEL_GAP = 0.05;
const ENTRY_GAP = 0.35;
const FACING_LAG = 0.6;
/** Once it is written, the ink dries; and the clock runs on this long. */
const DRY = 2;

/* ------------------------------------------------------------------ *
 * How it is set, in fractions of the sheet's height
 * ------------------------------------------------------------------ */

const HEAD_SIZE = 0.064;
const HEAD_TRACK = 0.2;
const LABEL_SIZE = 0.036;
const VALUE_SIZE = 0.046;
/** Where the middle of it all sits, down the sheet. */
const BLOCK_Y = 0.48;

export type ContactStroke = {
  /** Map units: u across, v down. */
  u0: number;
  u1: number;
  v: number;
  t0: number;
  t1: number;
};

export type ContactLink = {
  href: string;
  label: string;
  /** The address as it lies on the map, and when it has been written. */
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  at: number;
};

export type ContactInk = {
  /** R how much ink, G when the pen reaches it (see inkFrom, inkTo), B how
   *  much of it is red. */
  canvas: HTMLCanvasElement;
  strokes: ContactStroke[];
  links: ContactLink[];
  inkFrom: number;
  inkTo: number;
  written: number;
  span: number;
  /** What it was set for: how much of the sheet shows between the rolls
   *  (map units, from its middle), and how tall it is on screen. */
  half: number;
  forPx: number;
};

type Item = {
  kind: "text" | "rule" | "lozenge";
  text: string;
  font: string;
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

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function span(x: number, a: number, b: number) {
  return clamp((x - a) / (b - a), 0, 1);
}

function family() {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-book")
    .trim();
  return `${v ? `${v}, ` : ""}Garamond, "Times New Roman", serif`;
}

function widthOf(ctx: CanvasRenderingContext2D, text: string, track: number) {
  if (!track) return ctx.measureText(text).width;
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + track;
  return w - track;
}

/** How big to make the map for a sheet `sheetPx` CSS px tall on screen,
 *  never wider than a texture can be (`most`). */
export function contactInkSize(
  sheetPx: number,
  res: number,
  most = 4096
): [number, number] {
  const tallest = Math.min(2048, Math.floor(most / ASPECT) - 1);
  const h = Math.round(clamp(sheetPx * res * 1.2, 720, tallest));
  return [Math.round(h * ASPECT), h];
}

/**
 * Sets the page into a map `W` x `H`, for a parchment that shows `half` of
 * its width either side of its middle (map units) once it lies open. Two
 * entries to a row when there is room for them; one under another when
 * there is not. Null if there is no canvas to be had.
 */
export function bakeContact(
  W: number,
  H: number,
  half: number,
  forPx: number
): ContactInk | null {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const fam = family();
  const items: Item[] = [];
  const text = (
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
    const it: Item = {
      kind: "text",
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
    };
    items.push(it);
    return it;
  };
  const mark = (
    cx: number,
    kind: "rule" | "lozenge",
    y: number,
    w: number,
    size: number,
    ink: number,
    red: boolean
  ) => {
    const it: Item = { kind, text: "", font: "", track: 0, size, x: cx - w / 2, y, w, ink, red, t0: 0, t1: 0 };
    items.push(it);
    return it;
  };

  // What shows, in px of the map, and whether two entries go to a row.
  const mid = W / 2;
  const showW = 2 * half * W;
  const pairs = showW / H > 1.25;
  const colW = pairs ? showW * 0.44 : showW * 0.92;
  const colX = pairs ? [mid - showW * 0.245, mid + showW * 0.245] : [mid];

  const headSize = HEAD_SIZE * H;
  const headFont = `500 ${headSize}px ${fam}`;
  const labelSize = LABEL_SIZE * H;
  const labelFont = `italic 500 ${labelSize}px ${fam}`;
  // Every address at one size: this, or less if the longest would not
  // fit its column.
  let valueSize = VALUE_SIZE * H;
  ctx.font = `500 ${valueSize}px ${fam}`;
  for (const e of CONTACT.entries) {
    const w = ctx.measureText(e.value).width;
    if (w > colW) valueSize *= colW / w;
  }
  const valueFont = `500 ${valueSize}px ${fam}`;

  // Set out from the heading's baseline at 0, and moved down after.
  const head = text(mid, CONTACT.heading.toUpperCase(), headFont, headSize, 0, 0.92, true, headSize * HEAD_TRACK);
  const rule = mark(mid, "rule", 0.05 * H, Math.min(showW * 0.3, 0.42 * H), headSize, 0.8, true);
  type Row = { label: Item; value: Item; sep: Item | null; link: ContactEntry };
  const rows: Row[] = [];
  const firstY = 0.17 * H;
  const rowStep = pairs ? 0.2 * H : 0.152 * H;
  const labelToValue = pairs ? 0.068 * H : 0.062 * H;
  CONTACT.entries.forEach((e, i) => {
    const r = pairs ? Math.floor(i / 2) : i;
    const cx = colX[pairs ? i % 2 : 0];
    const y = firstY + r * rowStep;
    const sep =
      r > 0 && (!pairs || i % 2 === 0)
        ? mark(mid, "lozenge", y - rowStep * 0.42, 0.012 * H, labelSize, 0.6, false)
        : null;
    const label = text(cx, e.label, labelFont, labelSize, y, 0.86, true);
    const value = text(cx, e.value, valueFont, valueSize, y + labelToValue, 1, false);
    rows.push({ label, value, sep, link: e });
  });

  // Down the sheet, so the middle of it sits where it should.
  const top = -headSize * 0.75;
  let bottom = 0;
  for (const it of items) bottom = Math.max(bottom, it.y + it.size * 0.3);
  const dy = BLOCK_Y * H - (top + bottom) / 2;
  for (const it of items) it.y += dy;

  // When the pen goes along each.
  const lineDur = (w: number) => LINE_BASE + (w / H) * LINE_PER_HEIGHT;
  head.t0 = HEADING_AT;
  head.t1 = head.t0 + HEAD_BASE + (head.w / H) * HEAD_PER_HEIGHT;
  rule.t0 = head.t1 - 0.2;
  rule.t1 = rule.t0 + 0.7;
  const place = (row: Row, at: number) => {
    if (row.sep) {
      row.sep.t0 = at - 0.2;
      row.sep.t1 = row.sep.t0 + 0.4;
    }
    row.label.t0 = at;
    row.label.t1 = at + lineDur(row.label.w);
    row.value.t0 = row.label.t1 + LABEL_GAP;
    row.value.t1 = row.value.t0 + lineDur(row.value.w);
  };
  // Row by row; two to a row, the right-hand one a beat behind the left.
  let c = rule.t1 + 0.25;
  const perRow = pairs ? 2 : 1;
  for (let r = 0; r * perRow < rows.length; r++) {
    let end = c;
    for (let k = 0; k < perRow; k++) {
      const row = rows[r * perRow + k];
      if (!row) continue;
      place(row, c + k * FACING_LAG);
      end = Math.max(end, row.value.t1);
    }
    c = end + ENTRY_GAP;
  }

  const written = Math.max(...items.map((it) => it.t1));
  const inkFrom = HEADING_AT - 0.5;
  const inkTo = written + 1;
  const byte = (t: number) =>
    Math.min(254, Math.round(clamp((t - inkFrom) / (inkTo - inkFrom), 0, 1) * 255));

  // G: never, everywhere but where there is something to write.
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgb(0,255,0)";
  ctx.fillRect(0, 0, W, H);
  const field = (it: Item, x0: number, x1: number, y0: number, y1: number) => {
    const b = it.red ? 255 : 0;
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, `rgb(0,${byte(it.t0)},${b})`);
    g.addColorStop(1, `rgb(0,${byte(it.t1)},${b})`);
    ctx.fillStyle = g;
    const l = Math.min(x0, x1);
    const r = Math.max(x0, x1);
    const pad = (r - l) * 0.02 + 6;
    ctx.fillRect(x0 < x1 ? l : l - pad, y0, r - l + pad, y1 - y0);
  };
  for (const it of items) {
    const s = it.size;
    if (it.kind === "rule") {
      const m = it.x + it.w / 2;
      field(it, m, it.x - s * 0.2, it.y - s * 0.4, it.y + s * 0.4);
      field(it, m, it.x + it.w + s * 0.2, it.y - s * 0.4, it.y + s * 0.4);
    } else if (it.kind === "lozenge") {
      field(it, it.x - s * 0.3, it.x + it.w + s * 0.3, it.y - s * 0.4, it.y + s * 0.4);
    } else {
      field(it, it.x - s * 0.3, it.x + it.w + s * 0.3, it.y - s * 0.95, it.y + s * 0.38);
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
      const m = it.x + it.w / 2;
      const th = Math.max(1, H * 0.0014);
      const lz = it.size * 0.13;
      ctx.beginPath();
      ctx.moveTo(it.x, it.y);
      ctx.quadraticCurveTo(m - lz * 3, it.y - th, m - lz * 1.6, it.y);
      ctx.quadraticCurveTo(m - lz * 3, it.y + th, it.x, it.y);
      ctx.moveTo(it.x + it.w, it.y);
      ctx.quadraticCurveTo(m + lz * 3, it.y - th, m + lz * 1.6, it.y);
      ctx.quadraticCurveTo(m + lz * 3, it.y + th, it.x + it.w, it.y);
      ctx.fill();
      lozenge(ctx, m, it.y, lz);
    } else {
      lozenge(ctx, it.x + it.w / 2, it.y, it.w / 2);
    }
  }
  ctx.globalCompositeOperation = "source-over";

  const strokes: ContactStroke[] = [];
  for (const it of items) {
    if (it.kind === "lozenge") continue;
    strokes.push({
      u0: it.x / W,
      u1: (it.x + it.w) / W,
      v: (it.y - (it.kind === "text" ? it.size * 0.32 : 0)) / H,
      t0: it.t0,
      t1: it.t1,
    });
  }
  const links: ContactLink[] = rows.map((row) => {
    const v = row.value;
    const padX = v.size * 0.25;
    return {
      href: row.link.href,
      label: `${row.link.label}: ${row.link.value}`,
      u0: (v.x - padX) / W,
      u1: (v.x + v.w + padX) / W,
      v0: (v.y - v.size * 0.95) / H,
      v1: (v.y + v.size * 0.4) / H,
      at: v.t1,
    };
  });
  return {
    canvas,
    strokes,
    links,
    inkFrom,
    inkTo,
    written,
    span: written + DRY,
    half,
    forPx,
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

/**
 * The candlelight at page time `p`, carried across what shows of the
 * parchment from left to right. out: [u, v, how bright], map units.
 */
export function contactCandle(
  ink: ContactInk,
  p: number,
  time: number,
  out: number[]
) {
  const q = span(p, CANDLE[0], CANDLE[1]);
  const e = 0.5 - 0.5 * Math.cos(Math.PI * q);
  out[0] = 0.5 + lerp(-1.15, 1.15, e) * ink.half;
  out[1] = lerp(0.3, 0.5, e) - 0.05 * Math.sin(Math.PI * e);
  const flicker =
    1 +
    0.06 * Math.sin(time * 9.3) * Math.sin(time * 5.1 + 0.7) +
    0.035 * Math.sin(time * 23.1 + 1.9);
  out[2] = Math.pow(Math.sin(Math.PI * q), 0.8) * flicker;
}

/** Where the pens are at page time `p`, as [u, v] pairs into `out`.
 *  Returns how many. */
export function contactPens(ink: ContactInk, p: number, out: number[]) {
  let n = 0;
  for (const s of ink.strokes) {
    if (p <= s.t0 || p >= s.t1) continue;
    if ((n + 1) * 2 > out.length) break;
    const f = (p - s.t0) / (s.t1 - s.t0);
    out[n * 2] = s.u0 + (s.u1 - s.u0) * f;
    out[n * 2 + 1] = s.v;
    n++;
  }
  return n;
}

/** A point of the map (u across, v down) as the sheet's own coordinates:
 *  across it from its middle, and up it. out: [s, y]. */
export function contactToSheet(u: number, v: number, out: number[]) {
  out[0] = (u - 0.5) * 2 * LH_FINAL;
  out[1] = YP - v * 2 * YP;
}
