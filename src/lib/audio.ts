// Mic capture + conversion to the 16 kHz mono PCM16 WAV whisper.cpp expects.

export class MicRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
  }

  /** Stop and return the recorded audio; releases the mic. */
  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const recorder = this.recorder;
      if (!recorder) return reject(new Error("not recording"));
      recorder.onstop = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(this.chunks, { type: recorder.mimeType });
        this.stream = null;
        this.recorder = null;
        this.chunks = [];
        resolve(blob);
      };
      recorder.stop();
    });
  }

  cancel(): void {
    try {
      this.recorder?.stop();
    } catch {
      // already stopped
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }

  getStream(): MediaStream | null {
    return this.stream;
  }
}

export interface VadOptions {
  /** Sustained quiet for this long (after speech was heard) triggers onStop. */
  silenceMs?: number;
  /** RMS level counting as speech. Best-effort — mics vary. */
  threshold?: number;
  /** Hard cap so a noisy room can't record forever. */
  maxMs?: number;
  onStop: (reason: "silence" | "timeout") => void;
}

/**
 * Minimal voice-activity detection for hands-free mode: watches the mic
 * stream's RMS level and fires onStop after the speaker goes quiet.
 */
export class VadMonitor {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;

  start(stream: MediaStream, opts: VadOptions): void {
    const silenceMs = opts.silenceMs ?? 2000;
    const threshold = opts.threshold ?? 0.012;
    const maxMs = opts.maxMs ?? 90_000;
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const startedAt = Date.now();
    let sawSpeech = false;
    let lastLoudAt = Date.now();

    this.timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = Date.now();
      if (rms > threshold) {
        sawSpeech = true;
        lastLoudAt = now;
      }
      if (sawSpeech && now - lastLoudAt > silenceMs) {
        this.stop();
        opts.onStop("silence");
      } else if (now - startedAt > maxMs) {
        this.stop();
        opts.onStop("timeout");
      }
    }, 100);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

const TARGET_RATE = 16_000;

/** Decode whatever MediaRecorder produced and re-render it as 16 kHz mono WAV. */
export async function blobToWav16k(blob: Blob): Promise<Uint8Array> {
  const raw = await blob.arrayBuffer();
  const probe = new AudioContext();
  const decoded = await probe.decodeAudioData(raw);
  await probe.close();

  const frames = Math.ceil(decoded.duration * TARGET_RATE);
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return encodeWavPcm16(rendered.getChannelData(0), TARGET_RATE);
}

function encodeWavPcm16(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}
