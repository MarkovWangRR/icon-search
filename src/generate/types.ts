/** A minimal chat message exchanged with a generation backend. */
export interface GenMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * A pluggable LLM backend that completes a chat. Two implementations exist:
 * Anthropic Messages protocol (MiniMax) and OpenAI chat protocol (SiliconFlow,
 * OpenAI, …). Adding another provider = one more class implementing this.
 */
export interface ChatBackend {
  /** Human-readable label, e.g. "minimax (MiniMax-M3)". */
  readonly label: string;
  /** Run one completion; return assistant text, or null on failure. */
  complete(system: string, messages: GenMessage[]): Promise<string | null>;
}

export interface GenerateOptions {
  /** Max generate→validate→repair attempts (the agent loop). */
  maxAttempts?: number;
  /** Force a backend regardless of env autodetection. */
  provider?: "minimax" | "anthropic" | "openai";
  /** Override the model id. */
  model?: string;
  /** Style hint woven into the prompt (e.g. "outline", "duotone"). */
  style?: string;
  /** Allow multi-color output (default monochrome currentColor). */
  color?: boolean;
}
