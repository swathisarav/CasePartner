import { useEffect, useState } from "react";
import type { AppSettings } from "../lib/settings";
import { KOKORO_VOICES, ensureKokoroStarted } from "../lib/kokoro";
import { loadVoices, speak, stop } from "../lib/tts";

interface Props {
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void>;
}

export function SettingsForm({ settings, onSave }: Props) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    loadVoices().then(setVoices);
    return stop; // don't leave a preview speaking after leaving the tab
  }, []);

  function field<K extends keyof AppSettings>(key: K) {
    return {
      value: draft[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        setDraft({ ...draft, [key]: e.target.value });
        setSaveState("idle");
      },
    };
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveState("saving");
    try {
      await onSave(draft);
      setSaveState("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaveState("error");
    }
  }

  return (
    <form className="settings-form" onSubmit={handleSave}>
      <h2>Settings</h2>
      <p className="field-help">
        Only one thing is required to practice: an interviewer brain. Everything below it
        is optional — add it whenever you want.
      </p>

      <fieldset>
        <legend>Interviewer brain (required)</legend>
        <p className="field-help">
          The interviewer is powered by an AI model. <strong>Gemini</strong> is the
          easiest way to start — a free API key, fast responses, needs internet.{" "}
          <strong>Ollama</strong> runs fully offline on your machine if you install it,
          but is slower without a strong GPU.
        </p>
        <label>
          Provider
          <select
            value={draft.llmProvider}
            onChange={(e) => {
              setDraft({ ...draft, llmProvider: e.target.value as AppSettings["llmProvider"] });
              setSaveState("idle");
            }}
          >
            <option value="gemini">Gemini — cloud, free tier, fast (recommended)</option>
            <option value="ollama">Ollama — local, private, needs install</option>
          </select>
        </label>

        {draft.llmProvider === "gemini" ? (
          <>
            <label>
              API key <span className="label-hint">(get one free at aistudio.google.com/apikey)</span>
              <input type="password" placeholder="AIza…" {...field("geminiApiKey")} />
            </label>
            <label>
              Model
              <input type="text" placeholder="gemini-2.5-flash" {...field("geminiModel")} />
            </label>
            <p className="field-help subtle">
              Free tier is ~20 requests/day. If you run out mid-session, switch to{" "}
              <code>gemini-2.5-flash-lite</code> (higher limit) or Ollama.
            </p>
          </>
        ) : (
          <>
            <label>
              Server URL
              <input type="text" placeholder="http://localhost:11434" {...field("ollamaUrl")} />
            </label>
            <label>
              Parse model <span className="label-hint">(PDF → case; quality first)</span>
              <input type="text" placeholder="qwen2.5:14b-instruct" {...field("ollamaParseModel")} />
            </label>
            <label>
              Interview model <span className="label-hint">(live turns; speed first)</span>
              <input type="text" placeholder="llama3.1:8b" {...field("ollamaInterviewModel")} />
            </label>
            <label>
              Fallback model
              <input type="text" placeholder="llama3.2:latest" {...field("ollamaFallbackModel")} />
            </label>
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>Interviewer voice (optional)</legend>
        <p className="field-help">
          Have the interviewer speak its questions aloud. You can still read replies as
          text with this off. (Voice input — answering by speaking — also needs the
          Whisper files; see the README.)
        </p>
        <label>
          Speak replies aloud
          <select
            value={draft.ttsEnabled ? "on" : "off"}
            onChange={(e) => {
              setDraft({ ...draft, ttsEnabled: e.target.value === "on" });
              setSaveState("idle");
            }}
          >
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </label>
        <label>
          Engine
          <select
            value={draft.ttsEngine}
            onChange={(e) => {
              const engine = e.target.value as AppSettings["ttsEngine"];
              setDraft({ ...draft, ttsEngine: engine });
              setSaveState("idle");
              if (engine === "kokoro") ensureKokoroStarted().catch(console.error);
            }}
          >
            <option value="system">System voices (instant, robotic)</option>
            <option value="kokoro">Kokoro — local neural (natural, ~4s delay)</option>
          </select>
        </label>
        {draft.ttsEngine === "system" ? (
          <label>
            Voice
            <select
              value={draft.ttsVoice}
              onChange={(e) => {
                setDraft({ ...draft, ttsVoice: e.target.value });
                setSaveState("idle");
              }}
            >
              <option value="">System default</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Voice
            <select
              value={draft.kokoroVoice}
              onChange={(e) => {
                setDraft({ ...draft, kokoroVoice: e.target.value });
                setSaveState("idle");
              }}
            >
              {KOKORO_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Rate ({draft.ttsRate.toFixed(1)}×)
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={draft.ttsRate}
            onChange={(e) => {
              setDraft({ ...draft, ttsRate: Number(e.target.value) });
              setSaveState("idle");
            }}
          />
        </label>
        <div className="settings-actions" style={{ marginTop: "0.6rem" }}>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              speak(
                "Our client is a coffee chain whose profits have declined thirty percent. Shall we begin?",
                {
                  engine: draft.ttsEngine,
                  voiceUri: draft.ttsVoice,
                  kokoroVoice: draft.kokoroVoice,
                  rate: draft.ttsRate,
                }
              )
            }
          >
            Preview voice
          </button>
          {draft.ttsEngine === "kokoro" && (
            <span className="save-note">
              First preview after startup can take a minute while the model loads.
            </span>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>Session history (optional)</legend>
        <p className="field-help">
          Add a free Supabase project to save your interviews and reviews across
          sessions and see your progress over time. Leave blank to just practice — your
          current interview and its review still work without it.
        </p>
        <label>
          Supabase project URL
          <input type="text" placeholder="https://xxxx.supabase.co" {...field("supabaseUrl")} />
        </label>
        <label>
          Supabase anon key
          <input type="password" placeholder="eyJ..." {...field("supabaseAnonKey")} />
        </label>
      </fieldset>

      <div className="settings-actions">
        <button type="submit" disabled={saveState === "saving"}>
          {saveState === "saving" ? "Saving…" : "Save settings"}
        </button>
        {saveState === "saved" && <span className="save-note ok">Saved ✓</span>}
        {saveState === "error" && <span className="save-note fail">{error}</span>}
      </div>
    </form>
  );
}
