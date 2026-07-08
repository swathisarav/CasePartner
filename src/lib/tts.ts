// Interviewer speech with two engines:
// - "system": SpeechSynthesis (instant, robotic; WebView2 ships Windows voices)
// - "kokoro": local neural TTS via the sidecar (natural; ~4s to first audio on
//   CPU, so replies are synthesized sentence-by-sentence and pipelined —
//   sentence N plays while N+1 renders)
import { synthesize } from "./kokoro";

/** Voices load asynchronously; poll + listen until they arrive. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const existing = synth.getVoices();
    if (existing.length > 0) return resolve(existing);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", finish, { once: true });
    setTimeout(finish, 2000); // give up gracefully; empty list = default voice
  });
}

export interface SpeakOptions {
  engine?: "system" | "kokoro";
  /** SpeechSynthesis voiceURI (system engine). */
  voiceUri?: string;
  /** Kokoro voice id (kokoro engine). */
  kokoroVoice?: string;
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

let keepalive: number | null = null;
let currentAudio: HTMLAudioElement | null = null;
/** Bumped by stop(); in-flight kokoro pipelines check it and bail. */
let generation = 0;

export function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  stop();
  if (opts.engine === "kokoro") return speakKokoro(text, opts);
  return speakSystem(text, opts);
}

export function stop(): void {
  generation++;
  if (keepalive !== null) {
    clearInterval(keepalive);
    keepalive = null;
  }
  window.speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

// ---------------------------------------------------------------------------
// System engine (SpeechSynthesis)
// ---------------------------------------------------------------------------

function speakSystem(text: string, opts: SpeakOptions): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    if (opts.voiceUri) {
      const voice = synth.getVoices().find((v) => v.voiceURI === opts.voiceUri);
      if (voice) utterance.voice = voice;
    }
    utterance.rate = opts.rate ?? 1;
    utterance.onstart = () => {
      opts.onStart?.();
      // Chromium pauses long utterances after ~15s; keepalive works around it.
      keepalive = window.setInterval(() => {
        if (synth.speaking) {
          synth.pause();
          synth.resume();
        }
      }, 10_000);
    };
    const done = () => {
      if (keepalive !== null) {
        clearInterval(keepalive);
        keepalive = null;
      }
      opts.onEnd?.();
      resolve();
    };
    utterance.onend = done;
    utterance.onerror = done;
    synth.speak(utterance);
  });
}

// ---------------------------------------------------------------------------
// Kokoro engine (sentence-pipelined)
// ---------------------------------------------------------------------------

/** Split into sentences, merging fragments too short to be worth a round trip. */
function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const merged: string[] = [];
  for (const p of parts) {
    if (merged.length > 0 && (p.length < 25 || merged[merged.length - 1].length < 25)) {
      merged[merged.length - 1] += " " + p;
    } else {
      merged.push(p);
    }
  }
  return merged.length > 0 ? merged : [text];
}

function playBlob(blob: Blob, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (gen !== generation) return resolve();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    const done = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.onpause = () => {
      // stop() pauses us mid-play; treat as finished
      if (gen !== generation) done();
    };
    audio.play().catch(done);
  });
}

async function speakKokoro(text: string, opts: SpeakOptions): Promise<void> {
  const gen = generation;
  const voice = opts.kokoroVoice || "af_heart";
  const speed = opts.rate ?? 1;
  const sentences = splitSentences(text);
  let started = false;
  try {
    // Pipeline: keep one synthesis in flight ahead of playback.
    let next: Promise<Blob> = synthesize(sentences[0], voice, speed);
    for (let i = 0; i < sentences.length; i++) {
      const blob = await next;
      if (gen !== generation) return;
      if (i + 1 < sentences.length) next = synthesize(sentences[i + 1], voice, speed);
      if (!started) {
        started = true;
        opts.onStart?.();
      }
      await playBlob(blob, gen);
      if (gen !== generation) return;
    }
  } catch (e) {
    console.error("kokoro speech failed", e);
  } finally {
    if (started || gen === generation) opts.onEnd?.();
  }
}
