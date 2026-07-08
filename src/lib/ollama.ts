// Thin client for the local Ollama HTTP API. Uses the Tauri HTTP plugin
// (see health.ts for why webview fetch is avoided).
import { fetch } from "@tauri-apps/plugin-http";
import type { AppSettings } from "./settings";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ModelPurpose = "parse" | "interview";

interface ChatOptions {
  /** JSON schema for constrained output; Ollama guarantees conforming JSON. */
  format?: object;
  temperature?: number;
  numCtx?: number;
  timeoutMs?: number;
}

/**
 * Pick the configured model for the given purpose if installed, else the
 * fallback. Throws if neither is available.
 */
export async function pickModel(
  settings: AppSettings,
  purpose: ModelPurpose
): Promise<string> {
  const wanted =
    purpose === "parse" ? settings.ollamaParseModel : settings.ollamaInterviewModel;
  const base = settings.ollamaUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Ollama not reachable (HTTP ${res.status})`);
  const tags: { models?: { name: string }[] } = await res.json();
  const available = (tags.models ?? []).map((m) => m.name);
  const has = (want: string) =>
    available.some((n) => n === want || n.split(":")[0] === want);
  if (has(wanted)) return wanted;
  if (settings.ollamaFallbackModel && has(settings.ollamaFallbackModel)) {
    return settings.ollamaFallbackModel;
  }
  throw new Error(`Neither ${wanted} nor the fallback model is installed in Ollama`);
}

export async function ollamaChat(
  settings: AppSettings,
  purpose: ModelPurpose,
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<string> {
  const base = settings.ollamaUrl.replace(/\/+$/, "");
  const model = await pickModel(settings, purpose);
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      format: opts.format,
      options: {
        temperature: opts.temperature ?? 0.3,
        num_ctx: opts.numCtx ?? 8192,
      },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama chat failed (HTTP ${res.status}): ${body.slice(0, 300)}`);
  }
  const data: { message?: { content?: string } } = await res.json();
  const content = data.message?.content;
  if (!content) throw new Error("Ollama returned an empty response");
  return content;
}
