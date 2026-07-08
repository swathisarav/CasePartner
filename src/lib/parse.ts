// PDF text → structured case, via whichever LLM provider is configured.
import type { AppSettings } from "./settings";
import { CaseData, CaseExhibit, EXHIBIT_STAGES, FrameworkBucket } from "../types/case";
import { chat } from "./llm";

/** What the model is asked to produce (camelCase mapping happens after). */
const CASE_PARSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    prompt: { type: "string" },
    background: { type: "string" },
    expert_framework: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          points: { type: "array", items: { type: "string" } },
        },
        required: ["label", "points"],
      },
    },
    exhibits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          columns: { type: "array", items: { type: "string" } },
          rows: {
            type: "array",
            items: { type: "array", items: { type: "string" } },
          },
          stage: { type: "string", enum: [...EXHIBIT_STAGES] },
          topic_hint: { type: "string" },
        },
        required: ["title", "description", "columns", "rows", "stage", "topic_hint"],
      },
    },
    recommendation_notes: { type: "string" },
  },
  required: [
    "title",
    "prompt",
    "background",
    "expert_framework",
    "exhibits",
    "recommendation_notes",
  ],
} as const;

const PARSE_SYSTEM_PROMPT = `You convert raw text extracted from a consulting case interview PDF into a structured JSON case.

Field meanings:
- title: short case name.
- prompt: the opening prompt the interviewer reads aloud to the candidate, verbatim from the document where possible. Include the client, industry, and the core question.
- background: every additional fact the document gives that the interviewer should hold back and reveal only when the candidate asks (market data, client details, constraints). Write as compact bullet-like lines.
- expert_framework: the case's suggested/expert structure as buckets, each with a label and 2-6 concrete points. If the document has no explicit framework, derive a sensible one from the case solution.
- exhibits: every table, chart, or data block in the document. Reconstruct data as columns + rows of strings. For each exhibit set:
  - stage: when it should be shown — "analysis" for most data exhibits, "clarifying_questions" only for basic context data, "framework_presentation" or "recommendation" if clearly meant for those moments.
  - topic_hint: a short phrase describing what the candidate should be discussing when this exhibit is surfaced (e.g. "market sizing", "cost breakdown").
  - description: what the exhibit shows and the key insight it should drive.
- recommendation_notes: the expected conclusion / answer of the case, including key numbers, per the document.

Rules:
- Use only information from the document; do not invent data.
- All numbers in exhibits stay as strings exactly as written (keep units, %, $).
- The extracted text is messy (broken lines, page markers); reconstruct sensibly.`;

interface RawParsedCase {
  title: string;
  prompt: string;
  background: string;
  expert_framework: FrameworkBucket[];
  exhibits: Array<{
    title: string;
    description: string;
    columns: string[];
    rows: string[][];
    stage: CaseExhibit["stage"];
    topic_hint: string;
  }>;
  recommendation_notes: string;
}

export async function parseCaseFromText(
  settings: AppSettings,
  pdfText: string,
  sourceFileName: string
): Promise<CaseData> {
  const content = await chat(
    settings,
    "parse",
    [
      { role: "system", content: PARSE_SYSTEM_PROMPT },
      { role: "user", content: `Case document text:\n\n${pdfText}` },
    ],
    {
      format: CASE_PARSE_SCHEMA,
      temperature: 0.2,
      numCtx: 16384,
      // Local 14b models on modest hardware can take a while on long documents.
      timeoutMs: 600_000,
    }
  );
  const raw: RawParsedCase = JSON.parse(content);
  return {
    id: crypto.randomUUID(),
    title: raw.title,
    prompt: raw.prompt,
    background: raw.background,
    expertFramework: raw.expert_framework ?? [],
    exhibits: (raw.exhibits ?? []).map((e, i) => ({
      id: `exhibit-${i + 1}`,
      title: e.title,
      description: e.description,
      columns: e.columns ?? [],
      rows: e.rows ?? [],
      stage: e.stage,
      topicHint: e.topic_hint,
    })),
    recommendationNotes: raw.recommendation_notes ?? "",
    createdAt: new Date().toISOString(),
    sourceFileName,
  };
}
