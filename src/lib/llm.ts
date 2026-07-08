// Provider dispatcher: everything above this layer (interview engine, review,
// parsing) calls chat() and doesn't care whether Ollama or Gemini answers.
import type { AppSettings } from "./settings";
import { ChatMessage, ModelPurpose, ollamaChat } from "./ollama";
import { geminiChat } from "./gemini";

export interface LlmOptions {
  /** JSON schema for constrained output (both providers support it). */
  format?: object;
  temperature?: number;
  /** Ollama-only: context window size. */
  numCtx?: number;
  timeoutMs?: number;
}

export async function chat(
  settings: AppSettings,
  purpose: ModelPurpose,
  messages: ChatMessage[],
  opts: LlmOptions = {}
): Promise<string> {
  if (settings.llmProvider === "gemini") {
    // Cloud latency is seconds, not minutes — cap timeouts accordingly.
    return geminiChat(settings, messages, {
      format: opts.format,
      temperature: opts.temperature,
      timeoutMs: Math.min(opts.timeoutMs ?? 120_000, 120_000),
    });
  }
  return ollamaChat(settings, purpose, messages, opts);
}

export type { ChatMessage, ModelPurpose };
