// Speech-to-text via the local whisper.cpp CLI (invoked in Rust). WebView2
// has no SpeechRecognition API, so this replaces "browser STT".
import { invoke } from "@tauri-apps/api/core";
import { MicRecorder, blobToWav16k } from "./audio";

export interface WhisperStatus {
  ok: boolean;
  detail: string;
}

export async function whisperStatus(): Promise<WhisperStatus> {
  return invoke<WhisperStatus>("whisper_status");
}

export async function transcribeBlob(blob: Blob): Promise<string> {
  const wav = await blobToWav16k(blob);
  const text = await invoke<string>("transcribe_audio", { wav: Array.from(wav) });
  // Whisper marks non-speech as bracketed annotations, e.g. [BLANK_AUDIO].
  return text
    .replace(/\[[^\]]*\]|\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export { MicRecorder };
