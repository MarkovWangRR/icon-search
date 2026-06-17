/**
 * Optional recolouring of SVG output. Pure string transform — fits the
 * stateless model (we never persist anything, just reshape what goes to stdout).
 *
 * Three modes:
 *  - theme (default): swap `currentColor` for the chosen colour. Perfectly
 *    recolours monochrome icons (mdi, material-symbols, simple-icons, lucide, …)
 *    via fill or stroke; leaves multi-colour brand logos untouched.
 *  - flatten: force every explicit fill/stroke/gradient colour to the chosen
 *    colour, collapsing a multi-colour icon into a single flat glyph.
 *  - retint: re-hue every colour (gradient stops included) to the chosen colour
 *    while PRESERVING each colour's original lightness — so a gradient icon keeps
 *    its depth/shading but in a new primary colour.
 *
 * `none` is always preserved so cut-outs and unfilled strokes stay intact.
 */

export type RecolorMode = "theme" | "flatten" | "retint";

export interface RecolorOptions {
  color: string;
  mode?: RecolorMode;
}

/** Does this markup rely on currentColor (i.e. is it cleanly themeable)? */
export function usesCurrentColor(svg: string): boolean {
  return /currentColor/i.test(svg);
}

/** Does this markup contain a gradient definition? */
export function hasGradient(svg: string): boolean {
  return /<(linear|radial)Gradient/i.test(svg);
}

// --- colour parsing -------------------------------------------------------

const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000",
  blue: "#0000ff", yellow: "#ffff00", orange: "#ffa500", purple: "#800080",
  pink: "#ffc0cb", gray: "#808080", grey: "#808080", cyan: "#00ffff",
  magenta: "#ff00ff", teal: "#008080", indigo: "#4b0082", violet: "#ee82ee",
  brown: "#a52a2a", navy: "#000080", lime: "#00ff00", silver: "#c0c0c0",
};

type RGB = [number, number, number];

/** Parse #rgb, #rrggbb, rgb()/rgba(), or a common colour name. */
export function parseColor(input: string): RGB | null {
  let c = input.trim().toLowerCase();
  if (NAMED[c]) c = NAMED[c];

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (short) return [parseInt(short[1] + short[1], 16), parseInt(short[2] + short[2], 16), parseInt(short[3] + short[3], 16)];

  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  if (long) return [parseInt(long[1], 16), parseInt(long[2], 16), parseInt(long[3], 16)];

  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];

  return null;
}

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Re-hue one colour to the base hue/saturation, keeping its own lightness. */
function retintOne(original: string, baseH: number, baseS: number): string | null {
  const rgb = parseColor(original);
  if (!rgb) return null;
  const [, , l] = rgbToHsl(rgb);
  return hslToHex(baseH, baseS, l);
}

// --- main transform -------------------------------------------------------

const COLOR_ATTR = /\b(fill|stroke|stop-color)="(?!none")([^"]*)"/gi;
const COLOR_STYLE = /\b(fill|stroke|stop-color)\s*:\s*(?!none)([^;"']+)/gi;

export function recolor(svg: string, { color, mode = "theme" }: RecolorOptions): string {
  let s = svg.replace(/currentColor/gi, color);
  if (mode === "theme") return s;

  if (mode === "flatten") {
    s = s.replace(COLOR_ATTR, (_m, attr) => `${attr}="${color}"`);
    s = s.replace(COLOR_STYLE, (_m, attr) => `${attr}:${color}`);
    return s;
  }

  // retint: keep each colour's lightness, swap to the base hue/saturation.
  const base = parseColor(color);
  if (!base) {
    // Unparseable colour → fall back to flatten so we still honour the request.
    return recolor(svg, { color, mode: "flatten" });
  }
  const [bh, bs] = rgbToHsl(base);
  s = s.replace(COLOR_ATTR, (m, attr, val) => {
    const tinted = retintOne(val, bh, bs);
    return tinted ? `${attr}="${tinted}"` : m;
  });
  s = s.replace(COLOR_STYLE, (m, attr, val) => {
    const tinted = retintOne(val.trim(), bh, bs);
    return tinted ? `${attr}:${tinted}` : m;
  });
  return s;
}
