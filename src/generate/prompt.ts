import type { GenerateOptions } from "./types.js";

/**
 * System prompt that constrains the model to emit ONE valid, square SVG icon.
 * The hard constraints here are also re-checked in code (extract + validate +
 * enforceSquare); the prompt just maximises first-try success.
 */
export function systemPrompt(opts: GenerateOptions): string {
  const colorRule = opts.color
    ? "- You MAY use multiple colors, but keep a small, harmonious palette."
    : '- Monochrome: paint with fill="currentColor" (or stroke="currentColor" with fill="none") so the icon is themeable. Do NOT hardcode colors.';

  return [
    "You are an expert icon designer that outputs Scalable Vector Graphics.",
    "Return ONLY a single <svg>…</svg> element — no markdown fences, no comments, no explanation.",
    "Hard requirements:",
    '- Exactly one root <svg> with an xmlns and a SQUARE viewBox (width === height), e.g. viewBox="0 0 24 24".',
    "- The artwork must be visually centered with slight inner padding.",
    "- Use clean, minimal vector shapes (path, circle, rect, line, polygon).",
    "- Never use <image>, <foreignObject>, <script>, external URLs, or embedded raster/base64 data.",
    colorRule,
    opts.style ? `- Style: ${opts.style}.` : "- Style: modern, simple, recognizable at small sizes.",
  ].join("\n");
}

export function userPrompt(description: string): string {
  return `Design an icon that clearly represents: ${description}`;
}

/** Feedback turn appended when a candidate fails validation, so the model fixes it. */
export function repairPrompt(reason: string): string {
  return (
    `That response was rejected: ${reason}. ` +
    "Return ONLY one corrected <svg>…</svg> element with a square viewBox (width === height) and nothing else."
  );
}
