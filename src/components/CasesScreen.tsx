import { useEffect, useRef, useState } from "react";
import type { AppSettings } from "../lib/settings";
import type { CaseData } from "../types/case";
import { deleteCase, listCases, saveCase } from "../lib/cases";
import { supabaseConfigured, upsertCase } from "../lib/supabase";
import { extractPdfText } from "../lib/pdf";
import { parseCaseFromText } from "../lib/parse";
import { SAMPLE_CASES, SAMPLE_CASE_IDS, SampleCase } from "../data/sampleCases";
import { CaseReview } from "./CaseReview";

interface Props {
  settings: AppSettings;
  onStartInterview: (caseData: CaseData) => void;
}

type Mode =
  | { kind: "list" }
  | { kind: "extracting"; fileName: string }
  | { kind: "parsing"; fileName: string }
  | { kind: "review"; parsed: CaseData; rawText: string }
  | { kind: "addJson" }
  | { kind: "error"; message: string };

const WELCOME_KEY = "casesim.welcomeDismissed";

export function CasesScreen({ settings, onStartInterview }: Props) {
  const [cases, setCases] = useState<CaseData[]>([]);
  const [listError, setListError] = useState("");
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [showWelcome, setShowWelcome] = useState(
    () => localStorage.getItem(WELCOME_KEY) !== "1"
  );
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      setCases(await listCases());
      setListError("");
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function dismissWelcome() {
    localStorage.setItem(WELCOME_KEY, "1");
    setShowWelcome(false);
  }

  async function startSample(sample: SampleCase) {
    // Persist first (idempotent by id) so the case exists for History's
    // retro review generation, then jump straight into the interview.
    try {
      await saveCase(sample.case);
      if (supabaseConfigured(settings)) {
        upsertCase(settings, sample.case).catch((e) => console.error("case sync failed", e));
      }
    } catch (e) {
      console.error("saving sample failed", e);
    }
    onStartInterview(sample.case);
  }

  async function handleFile(file: File) {
    setMode({ kind: "extracting", fileName: file.name });
    try {
      const rawText = await extractPdfText(file);
      if (rawText.trim().length < 100) {
        throw new Error(
          "Almost no text could be extracted — this PDF may be scanned images rather than text."
        );
      }
      setMode({ kind: "parsing", fileName: file.name });
      const parsed = await parseCaseFromText(settings, rawText, file.name);
      setMode({ kind: "review", parsed, rawText });
    } catch (e) {
      setMode({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleSave(caseData: CaseData) {
    await saveCase(caseData);
    if (supabaseConfigured(settings)) {
      // Local save is authoritative; Supabase sync is best-effort.
      upsertCase(settings, caseData).catch((e) => console.error("case sync failed", e));
    }
    setMode({ kind: "list" });
    await refresh();
  }

  async function handleAddFromJson(caseData: CaseData) {
    // Auto-fill housekeeping fields the user isn't expected to provide. A fresh
    // UUID keeps Supabase (uuid id column) happy regardless of what was pasted.
    const complete: CaseData = {
      ...caseData,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      sourceFileName: caseData.sourceFileName?.trim() || "Added from JSON",
    };
    await handleSave(complete);
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Delete case "${title}"?`)) return;
    await deleteCase(id);
    await refresh();
  }

  if (mode.kind === "review") {
    return (
      <CaseReview
        initialCase={mode.parsed}
        rawPdfText={mode.rawText}
        onSave={handleSave}
        onDiscard={() => setMode({ kind: "list" })}
      />
    );
  }

  if (mode.kind === "addJson") {
    return (
      <CaseReview
        mode="add"
        onSave={handleAddFromJson}
        onDiscard={() => setMode({ kind: "list" })}
      />
    );
  }

  const yourCases = cases.filter((c) => !SAMPLE_CASE_IDS.has(c.id));
  const busy = mode.kind === "extracting" || mode.kind === "parsing";

  return (
    <div className="cases-screen">
      {showWelcome && (
        <section className="welcome-card">
          <button className="welcome-dismiss" onClick={dismissWelcome} aria-label="Dismiss">
            ×
          </button>
          <h2>Welcome to CaseSim</h2>
          <p className="welcome-lead">
            Rehearse full case interviews out loud, solo, and get coached feedback. Here's
            how the app works:
          </p>
          <ol className="welcome-steps">
            <li>
              <strong>Pick a case.</strong> Jump into a built-in case below, or upload your
              own case PDF and CaseSim structures it into a playable case.
            </li>
            <li>
              <strong>Run the interview.</strong> The AI interviewer speaks and responds;
              you reply by voice or text. Ask for data and exhibits appear inline; your
              stage is tracked up top.
            </li>
            <li>
              <strong>Get your review.</strong> End the interview for a scored rubric, your
              structure vs. the expert framework, turn-by-turn notes, and progress across
              sessions.
            </li>
          </ol>
          <p className="welcome-foot">
            One-time setup: pick an interviewer model in the <strong>Setup</strong> tab —
            Gemini's free tier is the quickest to get running.
          </p>
        </section>
      )}

      <section className="cases-section">
        <div className="section-head">
          <div>
            <h2>Practice cases</h2>
            <p className="section-sub">Built in — click Start and you're interviewing.</p>
          </div>
        </div>
        <ul className="sample-grid">
          {SAMPLE_CASES.map((s) => (
            <li key={s.case.id} className="sample-card">
              <div className="sample-badges">
                <span className="badge archetype">{s.archetype}</span>
                <span className={`badge difficulty ${s.difficulty.toLowerCase()}`}>
                  {s.difficulty}
                </span>
              </div>
              <strong className="sample-title">{s.case.title}</strong>
              <p className="sample-blurb">{s.blurb}</p>
              <button onClick={() => startSample(s)}>Start interview</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="cases-section">
        <div className="section-head">
          <div>
            <h2>Your cases</h2>
            <p className="section-sub">
              Upload a case PDF, or add a case directly as JSON.
            </p>
          </div>
          <div className="head-actions">
            <button
              className="secondary"
              onClick={() => setMode({ kind: "addJson" })}
              disabled={busy}
            >
              Add from JSON
            </button>
            <button onClick={() => fileInput.current?.click()} disabled={busy}>
              Upload case PDF
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) handleFile(file);
            }}
          />
        </div>

        {mode.kind === "extracting" && (
          <p className="status-note">Extracting text from {mode.fileName}…</p>
        )}
        {mode.kind === "parsing" && (
          <p className="status-note">
            Structuring {mode.fileName} with your AI provider. On a local model this can
            take several minutes — leave it running.
          </p>
        )}
        {mode.kind === "error" && (
          <p className="status-note error">
            Parsing failed: {mode.message}{" "}
            <button className="secondary" onClick={() => setMode({ kind: "list" })}>
              Dismiss
            </button>
          </p>
        )}
        {listError && <p className="status-note error">Could not load cases: {listError}</p>}

        {yourCases.length === 0 && !busy && !listError && (
          <p className="empty-note">
            No uploaded cases yet. Practice with a built-in case above, or upload a case
            PDF and CaseSim will structure it for you.
          </p>
        )}

        <ul className="case-list">
          {yourCases.map((c) => (
            <li key={c.id} className="case-card">
              <div className="case-card-main">
                <strong>{c.title}</strong>
                <span className="case-card-meta">
                  {c.exhibits.length} exhibit{c.exhibits.length === 1 ? "" : "s"} ·{" "}
                  {c.expertFramework.length} framework buckets ·{" "}
                  {new Date(c.createdAt).toLocaleDateString()} · {c.sourceFileName}
                </span>
              </div>
              <div className="case-card-actions">
                <button onClick={() => onStartInterview(c)}>Start interview</button>
                <button className="secondary" onClick={() => handleDelete(c.id, c.title)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
