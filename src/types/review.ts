import type { FrameworkBucket } from "./case";

export interface RubricScore {
  /** 1-10, anchored scale (see review prompt). */
  score: number;
  /** Transcript-grounded justification. */
  evidence: string;
}

export interface Rubric {
  structuring: RubricScore;
  quantitativeReasoning: RubricScore;
  communication: RubricScore;
  synthesis: RubricScore;
}

export const RUBRIC_LABELS: Record<keyof Rubric, string> = {
  structuring: "Structuring",
  quantitativeReasoning: "Quantitative reasoning",
  communication: "Communication",
  synthesis: "Synthesis",
};

/** A coaching note pinned to one transcript turn (the no-video stand-in for
 * timestamped playback annotations). */
export interface TranscriptAnnotation {
  /** Index into the session's turns array. */
  turnIndex: number;
  note: string;
}

export type BucketCoverage = "full" | "partial" | "missed";

/** One row of the expert-vs-candidate structure comparison. */
export interface FrameworkMapping {
  expertBucket: string;
  coverage: BucketCoverage;
  /** Label of the candidate's corresponding bucket; empty when missed. */
  candidateBucket: string;
  /** One sentence on the match or the gap. */
  note: string;
}

export interface ReviewData {
  id: string;
  sessionId: string;
  caseId: string;
  caseTitle: string;
  createdAt: string;
  /** Short overall verdict paragraph. */
  overallSummary: string;
  /** The structure the candidate actually presented, extracted from transcript. */
  candidateFramework: FrameworkBucket[];
  /** Snapshot of the case's expert framework, so the review is self-contained. */
  expertFramework: FrameworkBucket[];
  frameworkAssessment: {
    /** Expert buckets the candidate covered. */
    covered: string[];
    /** Expert buckets the candidate missed or underdeveloped. */
    missed: string[];
    comparison: string;
    /** Per-bucket alignment (absent on reviews generated before stage 3-2). */
    mapping?: FrameworkMapping[];
  };
  quantitativeAssessment: string;
  communicationAssessment: string;
  /** 3-5 concrete, actionable improvement steps. */
  improvementSteps: string[];
  /** Scored rubric (absent on reviews generated before Phase 3). */
  rubric?: Rubric;
  /** Turn-pinned coaching notes (absent before stage 3-3). */
  annotations?: TranscriptAnnotation[];
  /** Follow-up on the previous session's improvement steps (absent when this
   * is the first reviewed session or no prior review was available). */
  progressNotes?: ProgressNote[];
}

export interface ProgressNote {
  /** The improvement step from the previous review, verbatim. */
  priorStep: string;
  status: "improved" | "persisted" | "not_observable";
  comment: string;
}
