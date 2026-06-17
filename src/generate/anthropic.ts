import type { ChatBackend, GenMessage } from "./types.js";

const TIMEOUT_MS = 60_000;

/**
 * Anthropic Messages API backend (POST {base}/v1/messages). Used for MiniMax,
 * which exposes an Anthropic-compatible endpoint, and works for real Claude too.
 */
export class AnthropicBackend implements ChatBackend {
  readonly label: string;
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.label = `anthropic (${model})`;
  }

  async complete(system: string, messages: GenMessage[]): Promise<string | null> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/v1/messages`;
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model: this.model, max_tokens: 2048, system, messages }),
      });
      if (!res.ok) {
        console.error(`generate: anthropic backend HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      return (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("") || null;
    } catch (err) {
      console.error("generate: anthropic backend error:", err instanceof Error ? err.message : err);
      return null;
    }
  }
}
