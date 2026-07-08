// Kokoro TTS sidecar: a tiny localhost HTTP server the app talks to for
// natural interviewer speech. Fully local — the model (~86 MB, q8) downloads
// from HuggingFace once and is cached under %APPDATA%\com.casepartner.app.
// Run manually with `npm run kokoro`, or let the app auto-start it.
import http from "node:http";
import path from "node:path";
import { env } from "@huggingface/transformers";
import { KokoroTTS } from "kokoro-js";

const PORT = 8722;
const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

env.cacheDir = path.join(
  process.env.APPDATA ?? ".",
  "com.casepartner.app",
  "kokoro-cache"
);

let tts = null;
let loadError = null;
const ttsPromise = KokoroTTS.from_pretrained(MODEL, { dtype: "q8" })
  .then((t) => {
    tts = t;
    console.log("kokoro ready");
  })
  .catch((e) => {
    loadError = String(e);
    console.error("kokoro load failed:", e);
  });

function json(res, code, body) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { ok: !loadError, ready: tts !== null, error: loadError });
  }

  if (req.method === "POST" && req.url === "/speak") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { text, voice = "af_heart", speed = 1 } = JSON.parse(body);
        if (!text?.trim()) return json(res, 400, { error: "text required" });
        await ttsPromise;
        if (!tts) return json(res, 500, { error: loadError ?? "model not loaded" });
        const t0 = Date.now();
        const audio = await tts.generate(text, { voice, speed });
        const wav = audio.toWav();
        console.log(`synth ${text.length} chars in ${Date.now() - t0}ms (${voice})`);
        res.writeHead(200, {
          "Content-Type": "audio/wav",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(Buffer.from(wav));
      } catch (e) {
        json(res, 500, { error: String(e) });
      }
    });
    return;
  }

  json(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`kokoro sidecar listening on http://127.0.0.1:${PORT} (loading model…)`);
});
