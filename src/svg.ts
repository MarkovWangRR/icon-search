/**
 * SVG validation and light normalisation. We do NOT pull in a full XML parser
 * or svgo for v1: Iconify returns clean, well-formed markup, so a focused set
 * of structural checks is enough to guarantee "valid SVG out". If we later add
 * a vectorizer provider whose output is messier, this is the place to harden.
 */

export interface SvgValidation {
  valid: boolean;
  reason?: string;
}

/** Structural sanity check: is this a usable single-root <svg> document? */
export function validateSvg(svg: string): SvgValidation {
  const s = svg.trim();
  if (!s) return { valid: false, reason: "empty" };
  if (!/<svg[\s>]/i.test(s)) return { valid: false, reason: "no <svg> root element" };
  if (!/<\/svg>\s*$/i.test(s)) return { valid: false, reason: "not terminated by </svg>" };

  // Balanced <svg> open/close count (catches truncated or doubled markup).
  const opens = (s.match(/<svg[\s>]/gi) ?? []).length;
  const closes = (s.match(/<\/svg>/gi) ?? []).length;
  if (opens !== 1 || closes !== 1) {
    return { valid: false, reason: `expected one <svg> root, found ${opens}/${closes}` };
  }

  // Must be sizeable in some way the browser can render.
  if (!/viewBox\s*=/.test(s) && !/(width|height)\s*=/.test(s)) {
    return { valid: false, reason: "missing viewBox and width/height" };
  }
  return { valid: true };
}

/**
 * Ensure the markup carries an xmlns (required for standalone .svg files) and
 * normalise whitespace. Returns the normalised string unchanged in structure.
 */
export function normalizeSvg(svg: string): string {
  let s = svg.trim();
  if (!/xmlns\s*=/.test(s)) {
    s = s.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return s;
}

/** Pull the first complete <svg>…</svg> out of arbitrary model output. */
export function extractSvg(text: string): string | null {
  if (!text) return null;
  const m = /<svg[\s\S]*?<\/svg>/i.exec(text);
  return m ? m[0] : null;
}

export interface SquareResult {
  svg: string;
  /** Was the source already square (within tolerance)? */
  wasSquare: boolean;
  reason?: string;
}

/**
 * Enforce a 1:1 aspect ratio. If the viewBox isn't square, pad the shorter axis
 * symmetrically so the artwork stays centered on a square canvas, and set
 * width/height to an equal value. Returns reason !== undefined when it can't
 * (no viewBox), so the generation loop can ask the model to fix it.
 */
export function enforceSquare(svg: string, size = "1em"): SquareResult {
  const vb = /viewBox\s*=\s*"([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)"/.exec(svg);
  if (!vb) return { svg, wasSquare: false, reason: "no viewBox to square" };

  const [minX, minY, w, h] = [vb[1], vb[2], vb[3], vb[4]].map(Number);
  if (!(w > 0) || !(h > 0)) return { svg, wasSquare: false, reason: "invalid viewBox dimensions" };

  const wasSquare = Math.abs(w - h) < Math.max(w, h) * 0.001;
  let out = svg;

  if (!wasSquare) {
    const s = Math.max(w, h);
    const nx = minX - (s - w) / 2;
    const ny = minY - (s - h) / 2;
    const fmt = (n: number) => Number(n.toFixed(3)).toString();
    out = out.replace(vb[0], `viewBox="${fmt(nx)} ${fmt(ny)} ${fmt(s)} ${fmt(s)}"`);
  }

  // Force equal width/height (replace existing, else inject after <svg).
  out = out.replace(/\s(width|height)\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/<svg\b/i, `<svg width="${size}" height="${size}"`);
  return { svg: out, wasSquare };
}
