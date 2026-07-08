// Client for the Kokoro TTS sidecar (scripts/kokoro-server.mjs).
import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";

const BASE = "http://127.0.0.1:8722";

export const KOKORO_VOICES = [
  { id: "af_heart", label: "Heart (US female)" },
  { id: "af_bella", label: "Bella (US female)" },
  { id: "af_nicole", label: "Nicole (US female, soft)" },
  { id: "af_sarah", label: "Sarah (US female)" },
  { id: "am_adam", label: "Adam (US male)" },
  { id: "am_michael", label: "Michael (US male)" },
  { id: "bf_emma", label: "Emma (UK female)" },
  { id: "bm_george", label: "George (UK male)" },
  { id: "bm_lewis", label: "Lewis (UK male)" },
];

export type KokoroState = "ready" | "loading" | "down" | "error";

export async function checkKokoro(): Promise<{ state: KokoroState; detail: string }> {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
    const h: { ok: boolean; ready: boolean; error: string | null } = await res.json();
    if (h.error) return { state: "error", detail: `Kokoro failed to load: ${h.error}` };
    if (h.ready) return { state: "ready", detail: "Kokoro voice ready" };
    return { state: "loading", detail: "Kokoro is loading the model (first run downloads ~86 MB)…" };
  } catch {
    return { state: "down", detail: "Kokoro sidecar not running" };
  }
}

/** Start the sidecar if it's down. Model load continues in the background. */
export async function ensureKokoroStarted(): Promise<void> {
  const { state } = await checkKokoro();
  if (state !== "down") return;
  await invoke("start_kokoro");
}

export async function synthesize(
  text: string,
  voice: string,
  speed: number
): Promise<Blob> {
  const res = await fetch(`${BASE}/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, speed }),
    // Slow CPU + long sentence can take a while; generous but bounded.
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Kokoro synthesis failed (HTTP ${res.status}): ${err.slice(0, 200)}`);
  }
  return new Blob([await res.arrayBuffer()], { type: "audio/wav" });
}
