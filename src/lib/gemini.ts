// Google Gemini client (generateContent REST API). Free-tier AI Studio keys
// work; structured output uses responseSchema, same JSON-schema shapes as the
// Ollama path.
import { fetch } from "@tauri-apps/plugin-http";
import type { AppSettings } from "./settings";
import type { ChatMessage } from "./ollama";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiOptions {
  format?: object;
  temperature?: number;
  timeoutMs?: number;
}

interface Content {
  role: "user" | "model";
  parts: { text: string }[];
}

/**
 * Map our messages onto Gemini's shape: the leading system message becomes
 * systemInstruction; any later system message (e.g. the exhibit reminder)
 * is folded into the user stream as a bracketed note, merging with an
 * adjacent user message so roles stay sane.
 */
function toGemini(messages: ChatMessage[]): { system: string; contents: Content[] } {
  let system = "";
  const contents: Content[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      if (contents.length === 0 && !system) {
        system = m.content;
        continue;
      }
      const note = `[System note: ${m.content}]`;
      const last = contents[contents.length - 1];
      if (last && last.role === "user") last.parts[0].text += `\n\n${note}`;
      else contents.push({ role: "user", parts: [{ text: note }] });
      continue;
    }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
  return { system, contents };
}

export async function geminiChat(
  settings: AppSettings,
  messages: ChatMessage[],
  opts: GeminiOptions = {}
): Promise<string> {
  if (!settings.geminiApiKey.trim()) {
    throw new Error("Gemini API key is not set (Setup tab)");
  }
  const { system, contents } = toGemini(messages);
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.6,
      ...(opts.format
        ? { responseMimeType: "application/json", responseSchema: opts.format }
        : {}),
    },
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
  };
  const model = settings.geminiModel.trim() || "gemini-2.5-flash";
  const res = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": settings.geminiApiKey.trim(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) {
      throw new Error(
        "Gemini rate limit hit (free tier) — wait a minute and retry, or switch provider to Ollama."
      );
    }
    throw new Error(`Gemini request failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  const data: {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  } = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) {
    const reason = data.candidates?.[0]?.finishReason ?? "no candidates";
    throw new Error(`Gemini returned an empty response (${reason})`);
  }
  return text;
}

/** Health check: verify the key by asking whether the configured model exists. */
export async function checkGemini(
  settings: AppSettings
): Promise<{ ok: boolean; detail: string }> {
  const model = settings.geminiModel.trim() || "gemini-2.5-flash";
  try {
    const res = await fetch(`${BASE}/models/${model}`, {
      headers: { "x-goog-api-key": settings.geminiApiKey.trim() },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true, detail: `Gemini key valid, ${model} available` };
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { ok: false, detail: "Gemini API key was rejected" };
    }
    if (res.status === 404) {
      return { ok: false, detail: `Model "${model}" not found — check the model name` };
    }
    return { ok: false, detail: `Gemini responded with HTTP ${res.status}` };
  } catch (e) {
    return {
      ok: false,
      detail: `Cannot reach Gemini (${e instanceof Error ? e.message : String(e)})`,
    };
  }
}
