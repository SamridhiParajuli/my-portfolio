/**
 * bookGL
 * ------
 * Draws the live book (bookMesh) from its baked maps (antiqueBook), lit
 * exactly as antiqueBook's ray caster lights it: the same key, fill and
 * cold rim, the same pool of key light, the same soft shoulder on the
 * highlights, through the same long lens. In the pose the art was cast in,
 * the two agree to the pixel, so one can take over from the other.
 *
 * The camera is the art's own: projected in art pixels about the book's
 * origin, then set on screen by the same translate / rotate / scale the
 * painted book is drawn with. On top of that it can do what the art never
 * could -- turn the book, move it, and go in closer.
 *
 * And once it lies open, it can be written in: the spread (bookSpread)
 * is ink laid into the paper here, under the same light, not anything
 * drawn over it. When a leaf of it is turned, the leaf throws its shadow
 * on the pages under it, from the same key light.
 */

import {
  BOOK,
  SLOPE_RANGE,
  type BookMap,
  type BookMapKey,
} from "./antiqueBook";
import {
  INK_PAGES,
  PART_KEYS,
  STRIDE,
  YP,
  type BookMesh,
  type PartKey,
} from "./bookMesh";

type GL = WebGLRenderingContext | WebGL2RenderingContext;

/** Which baked map each part is drawn with. */
const MAP_OF: Record<PartKey, BookMapKey> = {
  cover: "cover",
  inner: "inner",
  edgeFront: "edgeFront",
  edgeBack: "edgeBack",
  spine: "spine",
  cap: "cap",
  paper: "paper",
  head: "head",
  fore: "fore",
};

/** How deep the ink is pressed into the page, as a slope at its edges. */
const INK_PRESS = 0.16;

/** Points along the turned leaf's line, for its shadow. */
export const LEAF_N = 9;
/** Half the angle the key light is seen across (it is soft, not a point),
 *  how much of it the leaf can keep from a page, and how much of the rest
 *  of the light it takes as it stands over one. */
const LIGHT_R = 0.14;
const SHADE_K = 0.72;
const SKY_K = 0.4;
/** The light the open pages throw back up, warm, onto the leaf being turned
 *  over them -- on whichever of its faces looks down at them. */
const BOUNCE = [1.3, 0.95, 0.55] as const;

const VERT = `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute vec3 aTu;
attribute vec3 aTv;
attribute vec2 aUv;
attribute vec3 aAux;
attribute vec4 aPg;
uniform mat3 uR;
uniform vec3 uPivot;
uniform vec3 uT;
uniform float uD;
uniform float uF;
uniform vec2 uC;
uniform vec2 uRot;
uniform vec2 uQ0;
uniform vec4 uBox;
uniform vec2 uDepth;
varying vec3 vW;
varying vec3 vN;
varying vec3 vTu;
varying vec3 vTv;
varying vec2 vUv;
varying vec3 vAux;
varying vec3 vL;
varying vec4 vPg;
varying float vDown;
void main() {
  vec3 W = uR * (aPos - uPivot) + uT;
  float d = uD - W.z;
  vec2 q = uQ0 + uF * vec2(W.x, -W.y) / d;
  vec2 S = uC + vec2(uRot.x * q.x - uRot.y * q.y, uRot.y * q.x + uRot.x * q.y);
  vec2 ndc = vec2((S.x - uBox.x) / uBox.z * 2.0 - 1.0, 1.0 - (S.y - uBox.y) / uBox.w * 2.0);
  gl_Position = vec4(ndc * d, uDepth.x * d + uDepth.y, d);
  vW = W;
  vN = uR * aNrm;
  vTu = uR * aTu;
  vTv = uR * aTv;
  vUv = aUv;
  vAux = aAux;
  vL = aPos;
  vPg = aPg;
  // How much of what it faces is the open pages below (the book's z is
  // their up): the leaf being turned only.
  vDown = aPg.w * 0.5 * (1.0 - aNrm.z);
}
`;

const FRAG = `
precision highp float;
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uM;
uniform vec3 uKey;
uniform vec3 uFill;
uniform float uD;
uniform vec4 uPool;
uniform vec3 uWarm;
uniform vec3 uGlow;
uniform float uTrans;
uniform float uRim;
uniform sampler2D uInk;
uniform float uInkOn;
uniform vec2 uInkT;
uniform vec2 uInkT2;
uniform vec2 uInkPx;
uniform float uFade;
uniform vec4 uCandle;
uniform vec2 uLeaf[${LEAF_N}];
uniform vec4 uLeafL;
varying vec3 vW;
varying vec3 vN;
varying vec3 vTu;
varying vec3 vTv;
varying vec2 vUv;
varying vec3 vAux;
varying vec3 vL;
varying vec4 vPg;
varying float vDown;
const vec3 KEY_COL = vec3(${BOOK.KEY_COL.map(f).join(",")});
const vec3 FILL_COL = vec3(${BOOK.FILL_COL.map(f).join(",")});
const vec3 AMB = vec3(${BOOK.AMB.map(f).join(",")});
const vec3 RIM = vec3(${BOOK.RIM_COL.map(f).join(",")});
const vec3 SPEC0 = vec3(0.34, 0.3, 0.26);
// Iron-gall ink gone brown, and the faded red of a rubric: both multiply
// the paper, so its grain and toning stay in them.
const vec3 INK_DARK = vec3(0.2, 0.15, 0.12);
const vec3 INK_RED = vec3(0.6, 0.25, 0.17);
const vec3 CANDLE = vec3(1.0, 0.6, 0.28);
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float inkAt(vec2 p) {
  return texture2D(uInk, p).r;
}
float tone(float c) {
  float x = max(c, 0.0);
  return x < 0.8 ? x : 0.8 + 0.2 * (x - 0.8) / (0.2 + (x - 0.8));
}
// The leaf being turned, standing over a point of the book (uLeaf is its
// line through the section, uLeafL the key light in the book's frame): how
// much of the key it keeps from the point, and how much of the sky above.
// The leaf runs the book's height, so seen from the point it spans a range
// of angles in the section; the key, soft rather than a point, is a range
// of its own, and the shadow is how much of one covers the other -- sharp
// where the leaf is near, softer the further off it stands.
vec2 leafShade(vec3 P) {
  float lh = max(length(uLeafL.xz), 1e-3);
  vec2 l = uLeafL.xz / lh;
  float lo = 9.0;
  float hi = -9.0;
  float skyLo = 9.0;
  float skyHi = -9.0;
  // How far off, toward the light, the leaf is met: where the light's own
  // line crosses it, or failing that, its nearest point to that line.
  float near = 9.0;
  float nearDist = 0.0;
  float dist = -1.0;
  float prevA = 0.0;
  vec2 prevD = vec2(0.0);
  for (int i = 0; i < ${LEAF_N}; i++) {
    vec2 d = uLeaf[i] - P.xz;
    float a = atan(l.x * d.y - l.y * d.x, dot(l, d));
    lo = min(lo, a);
    hi = max(hi, a);
    if (abs(a) < near) {
      near = abs(a);
      nearDist = length(d);
    }
    if (i > 0 && dist < 0.0 && prevA * a <= 0.0 && abs(prevA - a) < 3.0) {
      float f = abs(prevA - a) > 1e-5 ? prevA / (prevA - a) : 0.0;
      dist = length(mix(prevD, d, f));
    }
    prevA = a;
    prevD = d;
    // Only what stands above it takes any of its sky.
    if (d.y > 0.0) {
      skyLo = min(skyLo, a);
      skyHi = max(skyHi, a);
    }
  }
  if (dist < 0.0) dist = nearDist;
  float r = ${f(LIGHT_R)};
  float cover = clamp((min(hi, r) - max(lo, -r)) / (2.0 * r), 0.0, 1.0);
  // ...and only between its head and its tail.
  float y = P.y + dist / lh * uLeafL.y;
  float pen = 0.01 + dist * r;
  cover *= 1.0 - smoothstep(${f(YP)} - pen, ${f(YP)} + pen, abs(y));
  float sky = clamp((skyHi - skyLo) / 3.14159, 0.0, 1.0);
  return vec2(cover, sky) * uLeafL.w;
}
void main() {
  vec4 A = texture2D(uA, vUv);
  vec4 B = texture2D(uB, vUv);
  vec4 M = texture2D(uM, vUv);
  vec3 alb = A.rgb;
  float occ = A.a * vAux.x;
  float du = (B.r * 2.0 - 1.0) * ${f(SLOPE_RANGE)};
  float dv = (B.g * 2.0 - 1.0) * ${f(SLOPE_RANGE)};
  float specK = B.b;
  float specPow = max(B.a * 40.0, 1.0);
  float metal = M.r;
  float sheen = M.a * 0.1;
  // The written pages: only on the faces that are pages (vPg.x >= 0; the
  // map holds them side by side, a page to each part of it), and only where
  // the pen has been. G is when it got there, so every spot takes its ink
  // on its own clock -- a ragged front, as ink takes to paper.
  float onPage = step(0.0, vPg.x) * uInkOn;
  vec4 I = texture2D(uInk, vPg.xy);
  // In the pages' own measure, so each takes its ink the same way.
  vec2 pp = vPg.xy * vec2(${f(INK_PAGES)}, 1.0);
  float rag = vnoise(pp * vec2(64.0, 88.0)) - 0.5;
  // The last page, found under a turned leaf, keeps a clock of its own.
  vec2 inkT = vPg.x > ${f((INK_PAGES - 1) / INK_PAGES)} ? uInkT2 : uInkT;
  float age = (inkT.x - I.g) * inkT.y + rag * 0.4;
  float shown = smoothstep(0.0, 0.6, age);
  float wet = 1.0 - smoothstep(0.1, 1.6, age);
  // Wet, it spreads a little into the fibres before it sinks in.
  vec2 r = uInkPx * (1.0 + 2.2 * wet);
  float spread = 0.25 * (inkAt(vPg.xy + r) + inkAt(vPg.xy - r) +
    inkAt(vPg.xy + vec2(r.x, -r.y)) + inkAt(vPg.xy + vec2(-r.x, r.y)));
  // (Its hairlines taken in full: a press lays ink down, it does not tint.)
  float cover = pow(mix(I.r, max(I.r, spread * 0.9), wet * 0.85), 0.7);
  // Never quite even: the paper took more in some places than others.
  float took = 0.84 + 0.16 * vnoise(pp * vec2(380.0, 520.0));
  // The first page (the map's first part) fading as the next chapter
  // begins: back into the paper, all of it together, only drifting a
  // little sooner across some of the page than the rest.
  float gone = uFade * step(vPg.x, ${f(1 / INK_PAGES)});
  float keep = 1.0 - smoothstep(0.0, 1.0, gone * 1.28 - 0.28 * vnoise(pp * vec2(4.0, 3.0)));
  float ink = onPage * cover * shown * took * keep;
  vec3 inkCol = mix(INK_DARK, INK_RED, I.b);
  alb = mix(alb, alb * mix(inkCol, inkCol * 1.35 + 0.04, wet), ink);
  // Pressed into the page: its edges catch the light like an impression.
  // The map's x runs against the leaf's u on a page's back face and with
  // it on the front (vPg.z); its y always against v (bookMesh).
  float gx = inkAt(vPg.xy + vec2(uInkPx.x, 0.0)) - inkAt(vPg.xy - vec2(uInkPx.x, 0.0));
  float gy = inkAt(vPg.xy + vec2(0.0, uInkPx.y)) - inkAt(vPg.xy - vec2(0.0, uInkPx.y));
  float press = onPage * shown * keep * ${f(INK_PRESS)};
  du -= press * gx * vPg.z;
  dv += press * gy;
  // Wet, it shines a little.
  specK += 0.18 * wet * ink;
  vec3 n = normalize(vN);
  vec3 N = normalize(n - du * normalize(vTu) - dv * normalize(vTv));
  vec3 V = normalize(vec3(0.0, 0.0, uD) - vW);
  vec2 pd = (vL.xy - uPool.xy) / uPool.zw;
  float pool = 0.55 + 0.55 * exp(-dot(pd, pd));
  // In the shadow of a leaf being turned over it (never its own).
  vec2 sh = vec2(0.0);
  if (uLeafL.w > 0.0 && vPg.w < 0.5) sh = leafShade(vL);
  float lit = 1.0 - ${f(SHADE_K)} * sh.x;
  float sky = 1.0 - ${f(SKY_K)} * sh.y;
  float d1 = max(0.0, dot(N, uKey)) * pool * lit;
  float d2 = max(0.0, dot(N, uFill)) * sky;
  vec3 col = alb * (AMB * sky + (KEY_COL * d1 + FILL_COL * d2) * occ);
  // A candle carried past, low over the page.
  vec2 cd = (vL.xy - uCandle.xy) / uCandle.z;
  col += CANDLE * uCandle.w * exp(-dot(cd, cd)) * (alb + 0.03) * occ;
  vec3 h = normalize(uKey + V);
  float nh = max(0.0, dot(N, h));
  float sp = (specK * pow(nh, specPow) + sheen * pow(nh, 4.0)) * occ * lit;
  col += sp * KEY_COL * (SPEC0 + (alb * 2.2 - SPEC0) * metal);
  float nv = clamp(dot(N, V), 0.0, 1.0);
  // The universe's cold edge light. Paper, pale as it is, would turn lilac
  // under all of it; the pages (vAux.y) take only a little.
  col += RIM * pow(1.0 - nv, 3.2) * 0.55 * (0.3 + alb) * (1.0 - 0.75 * vAux.y) * uRim;
  // Golden light the book is lit by as it opens, round its edges...
  col += uWarm * pow(1.0 - nv, 2.0) * (0.25 + alb);
  // ...and in its pages, and through any leaf thin enough to let it.
  col += uGlow * vAux.y * (0.35 + alb) * sky;
  // A leaf being turned is lit from below as well, by the open pages.
  col += alb * vec3(${BOUNCE.map(f).join(", ")}) * vDown;
  col += alb * KEY_COL * max(0.0, -dot(n, uKey)) * uTrans * vAux.z * pool;
  gl_FragColor = vec4(tone(col.r), tone(col.g), tone(col.b), 1.0);
}
`;

function f(x: number) {
  const s = String(x);
  return s.includes(".") || s.includes("e") ? s : s + ".0";
}

export type BookView = {
  /** Book -> world rotation, column-major. */
  R: Float32Array;
  pivot: [number, number, number];
  T: [number, number, number];
  /** Camera distance and focal length (art px per unit at distance 1). */
  D: number;
  F: number;
  /** Where the book is drawn on screen, CSS px, and its 2D turn and scale. */
  C: [number, number];
  rotK: [number, number];
  /** Offset of the book's origin from the art's centre, art px. */
  Q0: [number, number];
  key: [number, number, number];
  fill: [number, number, number];
  pool: [number, number, number, number];
  warm: [number, number, number];
  glow: [number, number, number];
  trans: number;
  /** How much of the cold edge light it takes (1 as the art has it). */
  rim: number;
  /** The written pages: whether they are there at all; and the page clock
   *  in the map's own units, and seconds per unit -- for the first spread,
   *  and for the page found under the turned leaf. */
  inkOn: number;
  inkT: [number, number];
  inkT2: [number, number];
  /** How far the first page (Education) has faded from the paper, 0..1. */
  fade: number;
  /** Candlelight over the pages: book x, y, reach, and strength. */
  candle: [number, number, number, number];
  /** The leaf being turned, for its shadow: its line through the section
   *  (LEAF_N x, z pairs, spine to free end); and the key light's direction
   *  in the book's frame, with how much of the shadow there is (0: none). */
  leaf: Float32Array;
  leafL: [number, number, number, number];
};

type Tex = { a: WebGLTexture; b: WebGLTexture; m: WebGLTexture };

export type BookGL = {
  canvas: HTMLCanvasElement;
  gl: GL;
  gl2: boolean;
  prog: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
  tex: Partial<Record<BookMapKey, Tex>>;
  vb: Record<PartKey, WebGLBuffer>;
  ib: Record<PartKey, WebGLBuffer>;
  counts: Record<PartKey, number>;
  aniso: number;
  anisoExt: EXT_texture_filter_anisotropic | null;
  /** CSS box the canvas covers, and its resolution. */
  box: [number, number, number, number];
  res: number;
  lost: boolean;
  /** The written spread's map, once it is handed over, and one texel of it. */
  ink: WebGLTexture | null;
  inkPx: [number, number];
};

const ATTRS: Array<[string, number, number]> = [
  ["aPos", 3, 0],
  ["aNrm", 3, 3],
  ["aTu", 3, 6],
  ["aTv", 3, 9],
  ["aUv", 2, 12],
  ["aAux", 3, 14],
  ["aPg", 4, 17],
];

const UNIFORMS = [
  "uR",
  "uPivot",
  "uT",
  "uD",
  "uF",
  "uC",
  "uRot",
  "uQ0",
  "uBox",
  "uDepth",
  "uA",
  "uB",
  "uM",
  "uKey",
  "uFill",
  "uPool",
  "uWarm",
  "uGlow",
  "uTrans",
  "uRim",
  "uInk",
  "uInkOn",
  "uInkT",
  "uInkT2",
  "uInkPx",
  "uFade",
  "uCandle",
  "uLeaf",
  "uLeafL",
];

function compile(gl: GL, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn("bookGL shader:", gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

/** Sets up the context, program and buffers. Null if WebGL is not to be
 *  had, in which case the book simply stays shut. */
export function createBookGL(canvas: HTMLCanvasElement): BookGL | null {
  const opts: WebGLContextAttributes = {
    alpha: true,
    antialias: true,
    depth: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  };
  let gl: GL | null = canvas.getContext("webgl2", opts);
  const gl2 = Boolean(gl);
  if (!gl) gl = canvas.getContext("webgl", opts);
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  ATTRS.forEach(([name], i) => gl!.bindAttribLocation(prog, i, name));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("bookGL link:", gl.getProgramInfoLog(prog));
    return null;
  }
  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const name of UNIFORMS) u[name] = gl.getUniformLocation(prog, name);
  const vb = {} as Record<PartKey, WebGLBuffer>;
  const ib = {} as Record<PartKey, WebGLBuffer>;
  const counts = {} as Record<PartKey, number>;
  for (const k of PART_KEYS) {
    vb[k] = gl.createBuffer()!;
    ib[k] = gl.createBuffer()!;
    counts[k] = 0;
  }
  const anisoExt = gl.getExtension("EXT_texture_filter_anisotropic");
  const aniso = anisoExt
    ? Math.min(4, gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT))
    : 0;
  return {
    canvas,
    gl,
    gl2,
    prog,
    u,
    tex: {},
    vb,
    ib,
    counts,
    aniso,
    anisoExt,
    box: [0, 0, 1, 1],
    res: 1,
    lost: false,
    ink: null,
    inkPx: [1, 1],
  };
}

function isPow2(n: number) {
  return (n & (n - 1)) === 0;
}

function texture(
  g: BookGL,
  w: number,
  h: number,
  data: Uint8Array,
  format: number
) {
  const gl = g.gl;
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, format, w, h, 0, format, gl.UNSIGNED_BYTE, data);
  filtering(g, w, h);
  return t;
}

/** Mipmaps where they can be had, and the same filtering as every map. */
function filtering(g: BookGL, w: number, h: number) {
  const gl = g.gl;
  const mip = g.gl2 || (isPow2(w) && isPow2(h));
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (g.anisoExt && g.aniso > 1) {
    gl.texParameterf(
      gl.TEXTURE_2D,
      g.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT,
      g.aniso
    );
  }
}

/** Hands one baked map to the GPU. */
export function uploadBookMap(g: BookGL, key: BookMapKey, m: BookMap) {
  const gl = g.gl;
  g.tex[key] = {
    a: texture(g, m.w, m.h, m.a, gl.RGBA),
    b: texture(g, m.w, m.h, m.b, gl.RGBA),
    m: texture(g, m.w, m.h, m.c, gl.LUMINANCE_ALPHA),
  };
}

/** Hands the written spread's map (bookSpread) to the GPU as it is: its
 *  channels are data, not colour. */
export function uploadBookInk(g: BookGL, src: HTMLCanvasElement) {
  const gl = g.gl;
  if (g.ink) gl.deleteTexture(g.ink);
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
  filtering(g, src.width, src.height);
  g.ink = t;
  g.inkPx = [1 / src.width, 1 / src.height];
}

/** Places the canvas over the part of the page the book can reach. */
export function placeBookGL(
  g: BookGL,
  x: number,
  y: number,
  w: number,
  h: number,
  res: number
) {
  const cw = Math.max(1, Math.round(w * res));
  const ch = Math.max(1, Math.round(h * res));
  if (g.canvas.width !== cw) g.canvas.width = cw;
  if (g.canvas.height !== ch) g.canvas.height = ch;
  const s = g.canvas.style;
  s.left = `${x}px`;
  s.top = `${y}px`;
  s.width = `${w}px`;
  s.height = `${h}px`;
  g.box = [x, y, w, h];
  g.res = res;
}

/** Hands the rebuilt mesh to the GPU. */
export function uploadBookMesh(g: BookGL, mesh: BookMesh) {
  const gl = g.gl;
  for (const k of PART_KEYS) {
    const p = mesh[k];
    gl.bindBuffer(gl.ARRAY_BUFFER, g.vb[k]);
    gl.bufferData(gl.ARRAY_BUFFER, p.v.subarray(0, p.nv * STRIDE), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib[k]);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, p.i.subarray(0, p.ni), gl.DYNAMIC_DRAW);
    g.counts[k] = p.ni;
  }
}

export function drawBookGL(g: BookGL, v: BookView) {
  const gl = g.gl;
  if (g.lost || gl.isContextLost()) return;
  gl.viewport(0, 0, g.canvas.width, g.canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
  gl.useProgram(g.prog);
  const u = g.u;
  gl.uniformMatrix3fv(u.uR, false, v.R);
  gl.uniform3fv(u.uPivot, v.pivot);
  gl.uniform3fv(u.uT, v.T);
  gl.uniform1f(u.uD, v.D);
  gl.uniform1f(u.uF, v.F);
  gl.uniform2fv(u.uC, v.C);
  gl.uniform2fv(u.uRot, v.rotK);
  gl.uniform2fv(u.uQ0, v.Q0);
  gl.uniform4fv(u.uBox, g.box);
  // The book never reaches further than this from its own middle.
  const near = v.D - 1.9;
  const far = v.D + 1.9;
  gl.uniform2f(u.uDepth, (near + far) / (far - near), (2 * near * far) / (near - far));
  gl.uniform3fv(u.uKey, v.key);
  gl.uniform3fv(u.uFill, v.fill);
  gl.uniform4fv(u.uPool, v.pool);
  gl.uniform3fv(u.uWarm, v.warm);
  gl.uniform3fv(u.uGlow, v.glow);
  gl.uniform1f(u.uTrans, v.trans);
  gl.uniform1f(u.uRim, v.rim);
  gl.uniform1i(u.uA, 0);
  gl.uniform1i(u.uB, 1);
  gl.uniform1i(u.uM, 2);
  gl.uniform1i(u.uInk, 3);
  gl.uniform1f(u.uInkOn, g.ink ? v.inkOn : 0);
  gl.uniform2fv(u.uInkT, v.inkT);
  gl.uniform2fv(u.uInkT2, v.inkT2);
  gl.uniform2fv(u.uInkPx, g.inkPx);
  gl.uniform1f(u.uFade, v.fade);
  gl.uniform4fv(u.uCandle, v.candle);
  gl.uniform2fv(u.uLeaf, v.leaf);
  gl.uniform4fv(u.uLeafL, v.leafL);
  if (g.ink) {
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, g.ink);
  }

  for (let i = 0; i < ATTRS.length; i++) gl.enableVertexAttribArray(i);
  for (const k of PART_KEYS) {
    const n = g.counts[k];
    const t = g.tex[MAP_OF[k]];
    if (!n || !t) continue;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t.a);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, t.b);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, t.m);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.vb[k]);
    ATTRS.forEach(([, size, off], i) =>
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, STRIDE * 4, off * 4)
    );
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib[k]);
    gl.drawElements(gl.TRIANGLES, n, gl.UNSIGNED_SHORT, 0);
  }
}

/** Frees the GPU side. */
export function disposeBookGL(g: BookGL) {
  const gl = g.gl;
  for (const t of Object.values(g.tex)) {
    if (!t) continue;
    gl.deleteTexture(t.a);
    gl.deleteTexture(t.b);
    gl.deleteTexture(t.m);
  }
  for (const k of PART_KEYS) {
    gl.deleteBuffer(g.vb[k]);
    gl.deleteBuffer(g.ib[k]);
  }
  if (g.ink) gl.deleteTexture(g.ink);
  gl.deleteProgram(g.prog);
  g.tex = {};
  g.ink = null;
}
