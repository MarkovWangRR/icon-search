import type { ChatBackend, GenMessage } from "./types.js";

const TIMEOUT_MS = 60_000;

/**
 * OpenAI Chat Completions backend (POST {base}/chat/completions). Works with
 * OpenAI and any OpenAI-compatible gateway (SiliconFlow, Together, vLLM, …).
 * This is the "OAI protocol" path requested for future multimodal providers.
 */
export class OpenAIBackend implements ChatBackend {
  readonly label: string;
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.label = `openai (${model})`;
  }

  async complete(system: string, messages: GenMessage[]): Promise<string | null> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/chat/completions`;
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 2048,
          messages: [{ role: "system", content: system }, ...messages],
        }),
      });
      if (!res.ok) {
        console.error(`generate: openai backend HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return data.choices?.[0]?.message?.content ?? null;
    } catch (err) {
      console.error("generate: openai backend error:", err instanceof Error ? err.message : err);
      return null;
    }
  }
}
