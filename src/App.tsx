import { useCallback, useEffect, useState } from "react";
import { AppSettings, loadSettings, saveSettings } from "./lib/settings";
import { checkOllama, checkSupabase } from "./lib/health";
import { checkGemini } from "./lib/gemini";
import { whisperStatus } from "./lib/stt";
import { checkKokoro, ensureKokoroStarted } from "./lib/kokoro";
import { SettingsForm } from "./components/SettingsForm";
import { HealthPanel, HealthRow } from "./components/HealthPanel";
import { CasesScreen } from "./components/CasesScreen";
import { InterviewScreen } from "./components/InterviewScreen";
import { HistoryScreen } from "./components/HistoryScreen";
import { DrillScreen } from "./components/DrillScreen";
import type { CaseData } from "./types/case";
import "./App.css";

type Tab = "cases" | "drills" | "history" | "setup";

function App() {
  const [tab, setTab] = useState<Tab>("cases");
  const [interviewCase, setInterviewCase] = useState<CaseData | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loadError, setLoadError] = useState("");
  const [report, setReport] = useState<HealthRow[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("casepartner.theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("casepartner.theme", theme);
  }, [theme]);

  const runChecks = useCallback(async (s: AppSettings) => {
    setChecking(true);
    try {
      const rows: HealthRow[] = [];
      const whisper = whisperStatus().catch(() => ({ ok: false, detail: "check failed" }));
      if (s.llmProvider === "gemini") {
        const [gemini, supabase] = await Promise.all([checkGemini(s), checkSupabase(s)]);
        rows.push({
          label: "Gemini",
          result: { status: gemini.ok ? "ok" : "fail", detail: gemini.detail },
        });
        rows.push({ label: "Supabase", result: supabase });
      } else {
        const [ollama, supabase] = await Promise.all([checkOllama(s), checkSupabase(s)]);
        rows.push({ label: "Ollama server", result: ollama.server });
        rows.push({ label: "Parse model", result: ollama.parseModel });
        rows.push({ label: "Interview model", result: ollama.interviewModel });
        rows.push({ label: "Supabase", result: supabase });
      }
      const w = await whisper;
      rows.push({
        label: "Whisper STT",
        result: { status: w.ok ? "ok" : "fail", detail: w.detail },
      });
      if (s.ttsEngine === "kokoro") {
        const k = await checkKokoro();
        rows.push({
          label: "Kokoro TTS",
          result: {
            status: k.state === "ready" ? "ok" : k.state === "loading" ? "skipped" : "fail",
            detail: k.detail,
          },
        });
      }
      setReport(rows);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    loadSettings()
      .then((s) => {
        setSettings(s);
        // Warm the Kokoro sidecar early so the model is loaded before the
        // first interview reply needs it.
        if (s.ttsEnabled && s.ttsEngine === "kokoro") {
          ensureKokoroStarted().catch(console.error);
        }
        runChecks(s);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [runChecks]);

  async function handleSave(next: AppSettings) {
    await saveSettings(next);
    setSettings(next);
    await runChecks(next);
  }

  if (loadError) {
    return <main className="container">Failed to load settings: {loadError}</main>;
  }
  if (!settings) {
    return <main className="container">Loading…</main>;
  }

  if (interviewCase) {
    return (
      <main className="container">
        <InterviewScreen
          settings={settings}
          caseData={interviewCase}
          onExit={() => setInterviewCase(null)}
        />
      </main>
    );
  }

  return (
    <main className="container">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            CP
          </span>
          <div>
            <h1>CasePartner</h1>
            <p className="tagline">Practice case interviews out loud</p>
          </div>
        </div>
        <div className="header-right">
          <nav className="tabs">
            <button
              className={tab === "cases" ? "tab active" : "tab"}
              onClick={() => setTab("cases")}
            >
              Cases
            </button>
            <button
              className={tab === "drills" ? "tab active" : "tab"}
              onClick={() => setTab("drills")}
            >
              Drills
            </button>
            <button
              className={tab === "history" ? "tab active" : "tab"}
              onClick={() => setTab("history")}
            >
              History
            </button>
            <button
              className={tab === "setup" ? "tab active" : "tab"}
              onClick={() => setTab("setup")}
            >
              Setup
            </button>
          </nav>
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "Switch to light mode" : "Switch to night mode"}
            aria-label="Toggle night mode"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {tab === "cases" && (
        <CasesScreen settings={settings} onStartInterview={setInterviewCase} />
      )}
      {tab === "drills" && <DrillScreen settings={settings} />}
      {tab === "history" && <HistoryScreen settings={settings} />}
      {tab === "setup" && (
        <>
          <HealthPanel rows={report} checking={checking} onRecheck={() => runChecks(settings)} />
          <SettingsForm
            key={JSON.stringify(settings)}
            settings={settings}
            onSave={handleSave}
          />
        </>
      )}
    </main>
  );
}

export default App;
