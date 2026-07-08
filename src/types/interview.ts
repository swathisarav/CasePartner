import type { InterviewStage } from "./case";

export interface InterviewTurn {
  role: "interviewer" | "candidate";
  text: string;
  /** Stage the interview was in when this turn happened. */
  stage: InterviewStage;
  timestamp: string;
  /** Interviewer's private per-turn assessment (feeds the Phase 3 rubric). */
  internalNote?: string;
  /** Exhibit surfaced with this turn, if any. */
  exhibitId?: string;
}

export interface StageEvent {
  from: InterviewStage;
  to: InterviewStage;
  /** What caused the transition. */
  source: "auto" | "model" | "manual";
  timestamp: string;
}

export interface InterviewSession {
  id: string;
  caseId: string;
  caseTitle: string;
  startedAt: string;
  endedAt: string | null;
  stage: InterviewStage;
  turns: InterviewTurn[];
  stageEvents: StageEvent[];
  /** Compact summary of turns older than the verbatim window. */
  summary: string;
  /** Number of turns (from the start) already folded into `summary`. */
  summarizedUpTo: number;
  /** Exhibit ids already surfaced to the candidate. */
  shownExhibits: string[];
  status: "active" | "ended";
}
