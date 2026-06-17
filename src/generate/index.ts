import { AnthropicBackend } from "./anthropic.js";
import { OpenAIBackend } from "./openai.js";
import { repairPrompt, systemPrompt, userPrompt } from "./prompt.js";
import type { ChatBackend, GenerateOptions, GenMessage } from "./types.js";
import { enforceSquare, extractSvg, normalizeSvg, validateSvg } from "../svg.js";

export type { GenerateOptions } from "./types.js";

const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

/**
 * Build a chat backend from environment, honouring an optional forced provider.
 * Autodetect order: explicit ICON_GEN_PROVIDER → MiniMax (Anthropic-style) →
 * OpenAI-compatible. Returns null with a hint when nothing is configured.
 */
export function createBackend(opts: GenerateOptions = {}): { backend: ChatBackend } | { error: string } {
  const want = opts.provider ?? env("ICON_GEN_PROVIDER");

  const anthKey = env("MINIMAX_ANTHROPIC_API_KEY") ?? env("ANTHROPIC_API_KEY");
  const anthBase = env("MINIMAX_ANTHROPIC_BASE_URL") ?? env("ANTHROPIC_BASE_URL");
  const anthModel = opts.model ?? env("ICON_GEN_MODEL") ?? env("MINIMAX_ANTHROPIC_MODEL");

  const oaKey = env("ICON_GEN_API_KEY") ?? env("OPENAI_API_KEY");
  const oaBase = env("ICON_GEN_BASE_URL") ?? env("OPENAI_BASE_URL");
  const oaModel = opts.model ?? env("ICON_GEN_MODEL") ?? env("OPENAI_MODEL");

  const useAnthropic = want === "minimax" || want === "anthropic" || (!want && !!anthKey);
  const useOpenAI = want === "openai" || (!want && !anthKey && !!oaKey);

  if (useAnthropic) {
    if (!anthKey || !anthBase) return { error: "MiniMax/Anthropic backend needs MINIMAX_ANTHROPIC_API_KEY + _BASE_URL" };
    if (!anthModel) return { error: "set MINIMAX_ANTHROPIC_MODEL or --gen-model" };
    return { backend: new AnthropicBackend(anthBase, anthKey, anthModel) };
  }
  if (useOpenAI) {
    if (!oaKey || !oaBase) return { error: "OpenAI backend needs OPENAI_API_KEY/ICON_GEN_API_KEY + base URL" };
    if (!oaModel) return { error: "set OPENAI_MODEL or --gen-model (no default for OpenAI-compatible gateways)" };
    return { backend: new OpenAIBackend(oaBase, oaKey, oaModel) };
  }
  return { error: "no generation backend configured (set MINIMAX_ANTHROPIC_* or OPENAI_* env vars)" };
}

export interface GenerateResult {
  svg: string;
  backend: string;
  attempts: number;
}

/**
 * Agent loop: generate an SVG icon, validate it (well-formed + square), and on
 * failure feed the reason back to the model to repair — up to maxAttempts.
 * Stateless: returns the SVG string; never writes anything.
 */
export async function generateIcon(
  description: string,
  opts: GenerateOptions = {},
): Promise<GenerateResult | { error: string }> {
  const built = createBackend(opts);
  if ("error" in built) return built;
  const backend = built.backend;

  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const messages: GenMessage[] = [{ role: "user", content: userPrompt(description) }];
  const system = systemPrompt(opts);

  let lastReason = "no response";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reply = await backend.complete(system, messages);
    if (!reply) {
      lastReason = "backend returned no content";
      continue;
    }

    const raw = extractSvg(reply);
    if (!raw) {
      lastReason = "response contained no <svg> element";
    } else {
      const squared = enforceSquare(normalizeSvg(raw));
      const check = validateSvg(squared.svg);
      if (check.valid && !squared.reason) {
        return { svg: squared.svg, backend: backend.label, attempts: attempt };
      }
      lastReason = check.reason ?? squared.reason ?? "invalid SVG";
    }

    // Append the failed turn + repair instruction for the next iteration.
    messages.push({ role: "assistant", content: reply });
    messages.push({ role: "user", content: repairPrompt(lastReason) });
  }

  return { error: `generation failed after ${maxAttempts} attempts (${lastReason})` };
}
