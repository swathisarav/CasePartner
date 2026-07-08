# CaseSim

A local desktop app for practicing consulting-style case interviews, solo. Upload a case PDF, and a locally-run (or free-tier cloud) LLM plays the interviewer — reading the prompt aloud, answering clarifying questions, surfacing exhibits at the right moments, and holding a spoken conversation. When you finish, it generates a coached review: scored rubric, your structure vs. the expert framework, turn-by-turn coaching notes, and progress tracking across sessions.

Built with Tauri 2 + React + TypeScript. Single-user, no accounts, no server — everything runs on your machine except optional Supabase storage and the optional Gemini provider.

## Features

- **PDF → structured case**: pdf.js extracts text locally, an LLM structures it into prompt / hidden facts / expert framework / exhibits, with a review-and-edit screen before saving
- **Stage-driven interviewer**: a six-stage state machine (prompt → clarifying → framework → analysis → recommendation → wrap-up) tracked in code and injected into every LLM turn — the model never has to remember where it is
- **Exhibits** surface as inline tables when the conversation reaches their topic (code-validated, with manual override)
- **Voice**: interviewer speaks via Windows TTS; your answers transcribe locally via whisper.cpp; optional fully hands-free mode with silence detection and barge-in
- **Reviews**: 1–10 anchored rubric with quoted evidence, expert-vs-your-framework alignment (covered/partial/missed per bucket), coach notes pinned to specific transcript turns, and 3–5 concrete improvement steps
- **Progress**: each new review judges your previous improvement plan (improved / persisted / not observable) and a chart tracks rubric scores across sessions

## Prerequisites (Windows)

| What | Why | How |
|---|---|---|
| **Node.js 18+** | frontend tooling | [nodejs.org](https://nodejs.org) |
| **Rust (stable MSVC)** | Tauri backend | `winget install Rustlang.Rustup` then `rustup default stable-msvc`, or [rustup.rs](https://rustup.rs) |
| **VS 2022 Build Tools + C++ workload** | Rust's linker | `winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"` |
| **Ollama** | local LLM provider | [ollama.com](https://ollama.com), then pull models (below) |
| **Supabase project (free tier)** | case/session/review storage | [supabase.com](https://supabase.com) — free, no card |
| **Gemini API key** *(optional)* | fast cloud LLM alternative | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — free, no card |

WebView2 is required but ships with Windows 11 / modern Windows 10.

## Setup

### 1. Clone and install

```powershell
git clone <this-repo>
cd CaseInterviewPrep
npm install
```

### 2. Ollama models

Start Ollama (the desktop app, or `ollama serve`), then:

```powershell
ollama pull qwen2.5:14b-instruct   # parsing & reviews (quality)
ollama pull llama3.1:8b            # live interview turns (speed)
ollama pull llama3.2               # fallback (optional, small)
```

> **Hardware note:** on a CPU-only machine (no big GPU), expect ~30–60s per interview turn on the 8b model and ~10–20 min for a PDF parse or review on the 14b model. If that's too slow, use the Gemini provider for interviews and keep Ollama as the offline fallback.

### 3. Whisper (speech-to-text)

The app transcribes your voice locally with whisper.cpp — WebView2 has no built-in speech recognition. Put the binary and a model where the app looks for them:

```powershell
$dir = "$env:APPDATA\com.swath.casesim\whisper"
New-Item -ItemType Directory -Force $dir | Out-Null

# whisper.cpp Windows binaries (check releases for the latest version)
Invoke-WebRequest "https://github.com/ggerganov/whisper.cpp/releases/download/v1.9.1/whisper-bin-x64.zip" -OutFile "$env:TEMP\whisper.zip"
Expand-Archive "$env:TEMP\whisper.zip" -DestinationPath $dir -Force
# flatten if the zip extracted into a Release\ subfolder:
if (Test-Path "$dir\Release") { Get-ChildItem "$dir\Release" | Move-Item -Destination $dir -Force; Remove-Item "$dir\Release" -Recurse }

# English base model (~142 MB). small.en (~466 MB) is more accurate if you don't mind the size.
Invoke-WebRequest "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" -OutFile "$dir\ggml-base.en.bin"
```

The app finds `whisper-cli.exe` (or `main.exe`) plus any `ggml-*.bin` in that folder.

### 4. Kokoro natural voice (optional)

The default interviewer voice uses Windows TTS (instant but robotic). For a natural neural voice, the app can use [Kokoro-82M](https://github.com/hexgrad/kokoro) running fully locally via a small Node sidecar (`scripts/kokoro-server.mjs`, started automatically by the app — or manually with `npm run kokoro`). Nothing to install beyond `npm install`; the ~86 MB model downloads itself on first use and caches under `%APPDATA%\com.swath.casesim\kokoro-cache`.

Enable it in **Setup → Interviewer voice → Engine → Kokoro**. On a CPU-only machine expect ~4s before the interviewer starts speaking each reply (sentences are pipelined, so it keeps talking once started).

### 5. Supabase tables

In your Supabase dashboard: **SQL Editor → New query**, paste the contents of [`supabase.sql`](supabase.sql), Run. This creates `cases`, `sessions`, and `reviews` with permissive anon policies (fine for a single-user personal project — don't reuse this project for anything else).

Grab your **Project URL** and **anon key** from Project Settings → API.

### 6. Run it

```powershell
npm run tauri dev      # development (first Rust compile takes ~5 min)
npm run tauri build    # installable release build (bundle in src-tauri\target\release\bundle)
```

### 7. Configure in the app

Open the **Setup** tab:

- **LLM provider**: Ollama (local, private, slower) or Gemini (cloud, fast, free tier)
- Ollama URL + parse/interview/fallback model names, or Gemini API key + model
- Supabase URL + anon key
- Interviewer voice: engine (System / Kokoro), voice, rate, on/off

The health panel shows a check per dependency — get them green and you're set. Settings persist to `%APPDATA%\com.swath.casesim\settings.json` (outside the repo, so secrets never end up in git).

> **Gemini free-tier quota:** `gemini-2.5-flash` allows ~20 requests/day — one interview turn = one request, so it can run out mid-session. `gemini-2.5-flash-lite` has a much higher daily cap, or switch the provider back to Ollama when quota runs dry (resets midnight Pacific). Free-tier inputs may be used by Google for training; use Ollama if that matters for your material.

## Usage

1. **Cases → Upload case PDF** — review the parsed structure (fix anything in the JSON editor), Save. Or **Add from JSON** to paste a case directly (a format cheat-sheet is shown in the editor; `id`/`createdAt`/`sourceFileName` are filled in automatically). Or just click **Start** on a built-in practice case.
2. **Start interview** — speak (🎤 push-to-talk, or 🗣 Hands-free for a fully spoken loop) or type; exhibits appear when you ask for the right data; stage chips track where you are
3. **End interview → Generate review** — rubric scores, framework alignment, pinned coach notes, improvement plan
4. **History** — past sessions, transcripts with coach notes, retro review generation, and the rubric-over-time progress chart (appears after two scored reviews)
5. **Drills** — a case-opening capture drill: hear an opening read aloud, note the key facts on paper, then reveal the text to check yourself. 50 built-in openings, shuffled; fully offline (uses TTS only). Do 5–15 per sitting; **Fresh batch** reshuffles.

## Where your data lives

| Data | Location |
|---|---|
| Settings (incl. API keys) | `%APPDATA%\com.swath.casesim\settings.json` |
| Parsed cases (local copy) | `%APPDATA%\com.swath.casesim\cases\` |
| Session transcripts (local copy) | `%APPDATA%\com.swath.casesim\sessions\` |
| Whisper binary + model | `%APPDATA%\com.swath.casesim\whisper\` |
| Kokoro model cache | `%APPDATA%\com.swath.casesim\kokoro-cache\` |
| Cases / sessions / reviews (queryable) | your Supabase project |

Local files are authoritative; Supabase sync is best-effort and failures never lose data.

## Architecture notes

- `src/lib/interview.ts` — the stage state machine and per-turn prompt assembly; the model returns `{internal_note, show_exhibit, ready_to_advance, reply}` (schema-constrained) and code decides what actually happens
- `src/lib/llm.ts` — provider dispatcher (Ollama / Gemini); both use JSON-schema-constrained output
- `src/lib/review.ts` — review + rubric + annotations + progress-notes generation
- `src-tauri/src/lib.rs` — settings/case/session file persistence and the whisper.cpp transcription command
- Transcripts compact automatically past ~10 turns (older turns summarized) to keep local-model context small
