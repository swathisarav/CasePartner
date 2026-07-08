// The structured case format every parsed PDF is converted into.
// This schema is the contract between parsing (sub-build 2), the interview
// state machine (sub-build 3), exhibit triggering (sub-build 4), and review
// generation (sub-build 5).

export const INTERVIEW_STAGES = [
  "prompt_delivery",
  "clarifying_questions",
  "framework_presentation",
  "analysis",
  "recommendation",
  "wrap_up",
] as const;

export type InterviewStage = (typeof INTERVIEW_STAGES)[number];

/** Stages during which an exhibit is allowed to surface. */
export const EXHIBIT_STAGES = [
  "clarifying_questions",
  "framework_presentation",
  "analysis",
  "recommendation",
] as const;

export type ExhibitStage = (typeof EXHIBIT_STAGES)[number];

export interface FrameworkBucket {
  label: string;
  points: string[];
}

export interface CaseExhibit {
  id: string;
  title: string;
  /** What the exhibit shows and what insight it should drive. */
  description: string;
  columns: string[];
  rows: string[][];
  /**
   * Trigger metadata: the app (not the model's memory) uses this to decide
   * when the exhibit is eligible to surface.
   */
  stage: ExhibitStage;
  /** Topic that should be under discussion when this exhibit appears. */
  topicHint: string;
}

export interface CaseData {
  id: string;
  title: string;
  /** The opening prompt the interviewer reads to the candidate. */
  prompt: string;
  /**
   * Facts the interviewer holds back and reveals only when asked
   * (clarifying answers, additional data points).
   */
  background: string;
  expertFramework: FrameworkBucket[];
  exhibits: CaseExhibit[];
  /** The expected conclusion / recommendation, for the post-interview review. */
  recommendationNotes: string;
  createdAt: string;
  sourceFileName: string;
}

export function validateCaseData(value: unknown): string[] {
  const errors: string[] = [];
  const c = value as Partial<CaseData>;
  if (typeof c !== "object" || c === null) return ["Case must be a JSON object"];
  if (!c.title?.trim()) errors.push("title is required");
  if (!c.prompt?.trim()) errors.push("prompt is required");
  if (!Array.isArray(c.expertFramework) || c.expertFramework.length === 0) {
    errors.push("expertFramework must be a non-empty array of { label, points }");
  } else {
    c.expertFramework.forEach((b, i) => {
      if (!b?.label?.trim()) errors.push(`expertFramework[${i}].label is required`);
      if (!Array.isArray(b?.points)) errors.push(`expertFramework[${i}].points must be an array`);
    });
  }
  if (!Array.isArray(c.exhibits)) {
    errors.push("exhibits must be an array (can be empty)");
  } else {
    c.exhibits.forEach((e, i) => {
      if (!e?.title?.trim()) errors.push(`exhibits[${i}].title is required`);
      if (!Array.isArray(e?.columns)) errors.push(`exhibits[${i}].columns must be an array`);
      if (!Array.isArray(e?.rows)) errors.push(`exhibits[${i}].rows must be an array`);
      if (!EXHIBIT_STAGES.includes(e?.stage as ExhibitStage)) {
        errors.push(`exhibits[${i}].stage must be one of: ${EXHIBIT_STAGES.join(", ")}`);
      }
    });
  }
  return errors;
}
