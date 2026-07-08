// Post-interview review generation. Runs on the parse model (quality over
// speed — this is a one-time artifact per session, fine to leave running).
import type { CaseData } from "../types/case";
import type { InterviewSession } from "../types/interview";
import type { ProgressNote, ReviewData } from "../types/review";
import type { AppSettings } from "./settings";
import { chat } from "./llm";

const PROGRESS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      prior_step: { type: "string" },
      status: { type: "string", enum: ["improved", "persisted", "not_observable"] },
      comment: { type: "string" },
    },
    required: ["prior_step", "status", "comment"],
  },
} as const;

const SCORE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 1, maximum: 10 },
    evidence: { type: "string" },
  },
  required: ["score", "evidence"],
} as const;

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    rubric: {
      type: "object",
      properties: {
        structuring: SCORE_SCHEMA,
        quantitative_reasoning: SCORE_SCHEMA,
        communication: SCORE_SCHEMA,
        synthesis: SCORE_SCHEMA,
      },
      required: ["structuring", "quantitative_reasoning", "communication", "synthesis"],
    },
    candidate_framework: {
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
    framework_covered: { type: "array", items: { type: "string" } },
    framework_missed: { type: "array", items: { type: "string" } },
    framework_mapping: {
      type: "array",
      items: {
        type: "object",
        properties: {
          expert_bucket: { type: "string" },
          coverage: { type: "string", enum: ["full", "partial", "missed"] },
          candidate_bucket: { type: "string" },
          note: { type: "string" },
        },
        required: ["expert_bucket", "coverage", "candidate_bucket", "note"],
      },
    },
    framework_comparison: { type: "string" },
    quantitative_assessment: { type: "string" },
    communication_assessment: { type: "string" },
    overall_summary: { type: "string" },
    improvement_steps: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 5,
    },
    transcript_annotations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          turn_index: { type: "integer" },
          note: { type: "string" },
        },
        required: ["turn_index", "note"],
      },
      minItems: 5,
      maxItems: 10,
    },
  },
  required: [
    "rubric",
    "candidate_framework",
    "framework_covered",
    "framework_missed",
    "framework_mapping",
    "framework_comparison",
    "quantitative_assessment",
    "communication_assessment",
    "overall_summary",
    "improvement_steps",
    "transcript_annotations",
  ],
} as const;

/** progress_notes only exists when a prior review was supplied. */
function buildReviewSchema(withProgress: boolean) {
  if (!withProgress) return REVIEW_SCHEMA;
  return {
    ...REVIEW_SCHEMA,
    properties: { ...REVIEW_SCHEMA.properties, progress_notes: PROGRESS_SCHEMA },
    required: [...REVIEW_SCHEMA.required, "progress_notes"],
  };
}

const REVIEW_SYSTEM_PROMPT = `You are an experienced consulting interview coach reviewing the transcript of a completed mock case interview. Be specific and honest — vague praise helps nobody. Quote or paraphrase actual moments from the transcript as evidence.

Produce:
- rubric: score each dimension 1-10 (integers) with transcript-grounded evidence. Anchors:
  9-10 = flawless, offer-ready; 7-8 = strong with minor gaps; 5-6 = adequate but with clear gaps a real interviewer would note; 3-4 = weak, fundamental practice needed; 1-2 = missing or off-track entirely. Most real performances land 4-8; reserve 9+ for genuinely exceptional moments. Score strictly — inflated scores make practice useless.
  - structuring: framework quality — MECE, case-specific (not a memorized generic list), clearly communicated, actually used to drive the case.
  - quantitative_reasoning: did they request the right data, drive their own calculations, get them right, and extract the insight (the "so what")?
  - communication: top-down delivery, concision, signposting, confident recovery when corrected.
  - synthesis: connecting analysis into a final recommendation — clear answer first, supporting numbers, risks, next steps.
  Each evidence field cites the specific moment(s) that earned the score.
- candidate_framework: the structure the candidate actually presented, reconstructed from the transcript (their words, organized into buckets with points). Empty array if they never presented one.
- framework_covered / framework_missed: which EXPERT FRAMEWORK buckets the candidate's structure covered vs missed or underdeveloped (use the expert bucket labels).
- framework_mapping: exactly one entry per TOP-LEVEL expert bucket — the label before the colon on each EXPERT FRAMEWORK line — in that order. Never create entries for individual sub-points; a 3-bucket framework yields exactly 3 entries. expert_bucket = the top-level label only. coverage = "full" when the candidate's structure addressed the bucket's substance, "partial" when mentioned but thin, late, or missing key sub-points, "missed" when absent. candidate_bucket = the label from candidate_framework that best corresponds (empty string if none — never invent one). note = one specific sentence on the match or the gap, naming missed sub-points where relevant.
- framework_comparison: 2-4 sentences comparing their structure to the expert one — depth, MECE-ness, case-specificity.
- quantitative_assessment: how they handled numbers — did they drive calculations themselves, get them right, and draw the insight? Reference specific moments.
- communication_assessment: top-down communication, concision, hypothesis-driven habits.
- overall_summary: 3-4 sentence verdict, including whether they reached the expected recommendation.
- improvement_steps: 3-5 concrete actions phrased as practice instructions (e.g. "When given an exhibit, state the 'so what' within 30 seconds before diving into details"), each tied to something observable in this transcript. Never generic advice.
- transcript_annotations: 5-10 coaching notes pinned to specific turns using the [N] numbers in the transcript. Pin mostly to candidate turns — the moments that most shaped the outcome, good and bad ("strong recovery here", "this is where the exhibit's implication was missed"). Each note: what happened and what a stronger candidate would have done, in 1-2 sentences. turn_index must be one of the [N] numbers shown.

The INTERVIEWER'S PRIVATE NOTES were logged live during the interview; weigh them as evidence.`;

interface RawScore {
  score: number;
  evidence: string;
}

interface RawReview {
  rubric: {
    structuring: RawScore;
    quantitative_reasoning: RawScore;
    communication: RawScore;
    synthesis: RawScore;
  };
  candidate_framework: { label: string; points: string[] }[];
  framework_covered: string[];
  framework_missed: string[];
  framework_mapping: {
    expert_bucket: string;
    coverage: "full" | "partial" | "missed";
    candidate_bucket: string;
    note: string;
  }[];
  framework_comparison: string;
  quantitative_assessment: string;
  communication_assessment: string;
  overall_summary: string;
  improvement_steps: string[];
  transcript_annotations: { turn_index: number; note: string }[];
  progress_notes?: {
    prior_step: string;
    status: ProgressNote["status"];
    comment: string;
  }[];
}

function transcriptText(session: InterviewSession): string {
  return session.turns
    .map((t, i) => {
      const who = t.role === "interviewer" ? "Interviewer" : "Candidate";
      const exhibit = t.exhibitId ? ` [shows ${t.exhibitId}]` : "";
      // [N] gives the model stable ids for transcript_annotations.
      return `[${i}] [${t.stage}] ${who}${exhibit}: ${t.text}`;
    })
    .join("\n");
}

function notesText(session: InterviewSession): string {
  const notes = session.turns
    .filter((t) => t.internalNote)
    .map((t) => `[${t.stage}] ${t.internalNote}`);
  return notes.length > 0 ? notes.join("\n") : "(none)";
}

export async function generateReview(
  settings: AppSettings,
  caseData: CaseData,
  session: InterviewSession,
  priorReview?: ReviewData | null
): Promise<ReviewData> {
  const framework = caseData.expertFramework
    .map((b) => `- ${b.label}: ${b.points.join("; ")}`)
    .join("\n");
  const priorSection = priorReview
    ? `\n\nPREVIOUS SESSION'S IMPROVEMENT PLAN (case "${priorReview.caseTitle}", ${priorReview.createdAt.slice(0, 10)}):
${priorReview.improvementSteps.map((s) => `- ${s}`).join("\n")}

For progress_notes: judge each step above against THIS transcript — "improved" (visible progress), "persisted" (same weakness showed again; cite where), or "not_observable" (this case never exercised it). Quote this transcript as evidence in comment.`
    : "";
  const user = `CASE: ${caseData.title}
CASE PROMPT: ${caseData.prompt}

EXPERT FRAMEWORK:
${framework}

EXPECTED RECOMMENDATION:
${caseData.recommendationNotes}

INTERVIEWER'S PRIVATE NOTES (logged live during the interview):
${notesText(session)}

FULL TRANSCRIPT:
${transcriptText(session)}${priorSection}`;

  const content = await chat(
    settings,
    "parse",
    [
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    {
      format: buildReviewSchema(Boolean(priorReview)),
      temperature: 0.3,
      numCtx: 16384,
      timeoutMs: 1_800_000,
    }
  );
  const raw: RawReview = JSON.parse(content);
  return {
    id: crypto.randomUUID(),
    sessionId: session.id,
    caseId: caseData.id,
    caseTitle: caseData.title,
    createdAt: new Date().toISOString(),
    overallSummary: raw.overall_summary,
    candidateFramework: raw.candidate_framework ?? [],
    expertFramework: caseData.expertFramework,
    frameworkAssessment: {
      covered: raw.framework_covered ?? [],
      missed: raw.framework_missed ?? [],
      comparison: raw.framework_comparison,
      mapping: (raw.framework_mapping ?? []).map((m) => ({
        expertBucket: m.expert_bucket,
        coverage: m.coverage,
        candidateBucket: m.candidate_bucket ?? "",
        note: m.note,
      })),
    },
    quantitativeAssessment: raw.quantitative_assessment,
    communicationAssessment: raw.communication_assessment,
    improvementSteps: raw.improvement_steps ?? [],
    progressNotes: priorReview
      ? (raw.progress_notes ?? []).map((p) => ({
          priorStep: p.prior_step,
          status: p.status,
          comment: p.comment,
        }))
      : undefined,
    annotations: (raw.transcript_annotations ?? [])
      .filter(
        (a) =>
          Number.isInteger(a.turn_index) &&
          a.turn_index >= 0 &&
          a.turn_index < session.turns.length
      )
      .map((a) => ({ turnIndex: a.turn_index, note: a.note })),
    rubric: raw.rubric
      ? {
          structuring: clampScore(raw.rubric.structuring),
          quantitativeReasoning: clampScore(raw.rubric.quantitative_reasoning),
          communication: clampScore(raw.rubric.communication),
          synthesis: clampScore(raw.rubric.synthesis),
        }
      : undefined,
  };
}

/** Schema minimum/maximum isn't enforced by every provider; clamp defensively. */
function clampScore(s: RawScore): RawScore {
  return { score: Math.min(10, Math.max(1, Math.round(s.score))), evidence: s.evidence };
}
