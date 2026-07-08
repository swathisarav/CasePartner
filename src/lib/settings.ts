import { invoke } from "@tauri-apps/api/core";

export type LlmProvider = "ollama" | "gemini";

export interface AppSettings {
  /** Which brain runs the interviewer, parsing, and reviews. */
  llmProvider: LlmProvider;
  ollamaUrl: string;
  /** Model for one-time PDF → structured case parsing (quality over speed). */
  ollamaParseModel: string;
  /** Model for live interview turns (speed matters on CPU-only hardware). */
  ollamaInterviewModel: string;
  /** Used when the model for a task isn't installed. */
  ollamaFallbackModel: string;
  /** Google AI Studio key (free tier works). */
  geminiApiKey: string;
  /** One Gemini model handles parse + interview + review. */
  geminiModel: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Speak interviewer replies aloud by default. */
  ttsEnabled: boolean;
  /** "system" = instant Windows voices; "kokoro" = local neural sidecar. */
  ttsEngine: "system" | "kokoro";
  /** SpeechSynthesis voiceURI; empty = system default. */
  ttsVoice: string;
  /** Kokoro voice id. */
  kokoroVoice: string;
  /** Speaking rate, 0.5–2 (1 = normal). */
  ttsRate: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  llmProvider: "ollama",
  ollamaUrl: "http://localhost:11434",
  ollamaParseModel: "qwen2.5:14b-instruct",
  ollamaInterviewModel: "llama3.1:8b",
  ollamaFallbackModel: "llama3.2:latest",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
  supabaseUrl: "",
  supabaseAnonKey: "",
  ttsEnabled: true,
  ttsEngine: "system",
  ttsVoice: "",
  kokoroVoice: "af_heart",
  ttsRate: 1,
};

export async function loadSettings(): Promise<AppSettings> {
  const raw = await invoke<string | null>("load_settings");
  if (!raw) return { ...DEFAULT_SETTINGS };
  const stored = JSON.parse(raw);
  // Migrate from the pre-split schema where one model did everything.
  if (stored.ollamaModel && !stored.ollamaParseModel) {
    stored.ollamaParseModel = stored.ollamaModel;
  }
  // Merge over defaults so newly added fields get a value on old settings files.
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await invoke("save_settings", { json: JSON.stringify(settings, null, 2) });
}
