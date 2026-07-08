import { useState } from "react";
import { CaseData, EXHIBIT_STAGES, validateCaseData } from "../types/case";
import { CasePreview } from "./CasePreview";

// A complete, valid example shown in the "Add from JSON" box as a starting
// point. Content fields only — id/createdAt/sourceFileName are filled in on
// save, so they're intentionally omitted here to model what you provide.
const EXAMPLE_CASE_JSON = `{
  "title": "Example — Sunrise Bakery Profitability",
  "prompt": "Sunrise Bakery is a chain of 40 neighborhood bakeries. Profit has fallen 20% over the past year while sales stayed flat. The owner wants to know why, and what to do about it. How would you approach this?",
  "background": "- Sales are flat at about $50M per year.\\n- The profit drop is in store-level costs, not head office.\\n- Flour and butter prices rose sharply this year.\\n- No change to store count, staffing levels, or rent.",
  "expertFramework": [
    { "label": "Revenue", "points": ["Price", "Volume", "Product mix"] },
    { "label": "Costs", "points": ["Ingredients (COGS)", "Labor", "Rent", "Overhead"] },
    { "label": "External", "points": ["Competition", "Input-cost inflation"] }
  ],
  "exhibits": [
    {
      "id": "exhibit-1",
      "title": "Cost per loaf (last year vs. this year)",
      "description": "Per-loaf cost by component. The insight is that ingredient costs rose sharply while labor and rent held roughly flat.",
      "columns": ["Component", "Last year", "This year"],
      "rows": [
        ["Flour & butter", "$0.90", "$1.35"],
        ["Labor", "$0.70", "$0.72"],
        ["Rent", "$0.30", "$0.31"]
      ],
      "stage": "analysis",
      "topicHint": "cost per loaf / ingredient costs"
    }
  ],
  "recommendationNotes": "Ingredient cost per loaf rose ~50% (flour & butter) while other costs were flat — that is the profit leak. Recommend hedging or renegotiating ingredient supply, shifting the menu toward less input-sensitive items, and a modest price increase on premium products. Closing the ingredient gap restores most of the lost profit."
}`;

interface Props {
  /** "review" = after PDF parse (pre-filled); "add" = paste JSON from scratch. */
  mode?: "review" | "add";
  initialCase?: CaseData;
  rawPdfText?: string;
  onSave: (caseData: CaseData) => Promise<void>;
  onDiscard: () => void;
}

/**
 * JSON editor with a live rendered preview. Used both to review a parsed PDF
 * case and to add a case by pasting JSON. The JSON is the source of truth; the
 * preview re-renders whenever the JSON is valid, and Save is blocked until it is.
 */
export function CaseReview({
  mode = "review",
  initialCase,
  rawPdfText,
  onSave,
  onDiscard,
}: Props) {
  const [jsonText, setJsonText] = useState(() =>
    initialCase
      ? JSON.stringify(initialCase, null, 2)
      : mode === "add"
        ? EXAMPLE_CASE_JSON
        : ""
  );
  const [parsed, setParsed] = useState<CaseData | null>(() =>
    initialCase ?? (mode === "add" ? (JSON.parse(EXAMPLE_CASE_JSON) as CaseData) : null)
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function handleJsonChange(text: string) {
    setJsonText(text);
    if (text.trim() === "") {
      // Empty box is a neutral starting state, not an error.
      setParsed(null);
      setErrors([]);
      return;
    }
    try {
      const next = JSON.parse(text) as CaseData;
      const validation = validateCaseData(next);
      setErrors(validation);
      setParsed(validation.length === 0 ? next : null);
    } catch (e) {
      setErrors([`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`]);
      setParsed(null);
    }
  }

  async function handleSave() {
    if (!parsed) return;
    setSaving(true);
    setSaveError("");
    try {
      await onSave(parsed);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const canSave = !saving && errors.length === 0 && parsed !== null;

  return (
    <div className="case-review">
      <div className="review-toolbar">
        <h2>{mode === "add" ? "Add case from JSON" : "Review parsed case"}</h2>
        <div className="review-actions">
          <button className="secondary" onClick={onDiscard} disabled={saving}>
            Discard
          </button>
          <button onClick={handleSave} disabled={!canSave}>
            {saving ? "Saving…" : "Save case"}
          </button>
        </div>
      </div>
      <p className="review-hint">
        {mode === "add"
          ? "An example case is filled in below — edit it, or replace it with your own. The preview and any validation errors update as you type; Save unlocks once the case is valid."
          : "Check the preview against the original PDF. Fix mistakes by editing the JSON — the preview updates as soon as the JSON is valid."}
      </p>

      <details className="format-rules">
        <summary>Case JSON format &amp; rules</summary>
        <div className="format-rules-body">
          <ul>
            <li>
              <code>title</code> <span className="req">required</span> — the case name.
            </li>
            <li>
              <code>prompt</code> <span className="req">required</span> — the opening
              prompt, read aloud to start the interview.
            </li>
            <li>
              <code>background</code> — facts the interviewer reveals only when asked. Plain
              text; use <code>\n</code> to separate lines.
            </li>
            <li>
              <code>expertFramework</code> <span className="req">required</span> — a
              non-empty array of{" "}
              <code>{'{ "label": string, "points": string[] }'}</code>. Your structure is
              graded against this.
            </li>
            <li>
              <code>exhibits</code> — an array (may be empty <code>[]</code>). Each exhibit:
              <ul>
                <li>
                  <code>id</code>, <code>title</code>, <code>description</code>,{" "}
                  <code>topicHint</code> — strings.
                </li>
                <li>
                  <code>columns</code> — string array (header row).
                </li>
                <li>
                  <code>rows</code> — array of rows, each a string array. Keep numbers as
                  strings, e.g. <code>"$1.30"</code>.
                </li>
                <li>
                  <code>stage</code> — when the exhibit may surface. One of:{" "}
                  <code>{EXHIBIT_STAGES.join('"  "')}</code>.
                </li>
              </ul>
            </li>
            <li>
              <code>recommendationNotes</code> — the expected answer with key numbers; your
              recommendation is graded against it.
            </li>
            <li>
              <code>id</code>, <code>createdAt</code>, <code>sourceFileName</code> —{" "}
              <em>optional; added automatically</em> when you add from JSON, so you can omit
              them.
            </li>
          </ul>
        </div>
      </details>

      {errors.length > 0 && (
        <ul className="review-errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {saveError && <p className="review-errors">Save failed: {saveError}</p>}

      <div className="review-columns">
        <textarea
          className="json-editor"
          value={jsonText}
          placeholder={mode === "add" ? "Paste your case JSON here…" : undefined}
          onChange={(e) => handleJsonChange(e.target.value)}
          spellCheck={false}
        />
        <div className="preview-pane">
          {parsed ? (
            <CasePreview caseData={parsed} />
          ) : (
            <p className="empty-note">
              The rendered case preview appears here once your JSON is valid.
            </p>
          )}
        </div>
      </div>

      {rawPdfText && (
        <details className="raw-text">
          <summary>Raw extracted PDF text (for cross-checking)</summary>
          <pre>{rawPdfText}</pre>
        </details>
      )}
    </div>
  );
}
