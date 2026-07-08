// The interview engine: explicit stage state machine, per-turn prompt
// assembly, and transcript compaction. The app tracks the stage in code and
// injects it into every LLM call — the model is never trusted to remember or
// infer what stage it is in.
import type { CaseData, CaseExhibit, InterviewStage } from "../types/case";
import type { InterviewSession, InterviewTurn, StageEvent } from "../types/interview";
import { INTERVIEW_STAGES } from "../types/case";
import type { AppSettings } from "./settings";
import { chat, ChatMessage } from "./llm";

export const STAGE_LABELS: Record<InterviewStage, string> = {
  prompt_delivery: "Prompt",
  clarifying_questions: "Clarify",
  framework_presentation: "Framework",
  analysis: "Analysis",
  recommendation: "Recommendation",
  wrap_up: "Wrap-up",
};

/** How the app behaves in each stage — orientation for someone new to CaseSim
 * (not case-interview coaching). Shown via the Tips toggle in the interview UI.
 * The interviewer's own internal stage instructions are never shown. */
export const STAGE_HINTS: Record<InterviewStage, string> = {
  prompt_delivery: "The interviewer reads the prompt aloud to open the case.",
  clarifying_questions:
    "Ask your clarifying questions — the interviewer only answers from the case's facts. It moves on once you signal you're ready to lay out your structure.",
  framework_presentation:
    "Present your structure. When you say where you'd start, the interviewer moves into analysis. (Stages advance automatically; use Advance stage to force it.)",
  analysis:
    "Ask for the data you want and the matching exhibit appears inline in the chat. You can also surface any exhibit yourself from the Exhibits menu.",
  recommendation:
    "Deliver your recommendation. When you're done, hit End interview to generate your review.",
  wrap_up: "Ask the interviewer anything, then End interview for your scored review.",
};

export function nextStage(stage: InterviewStage): InterviewStage | null {
  const i = INTERVIEW_STAGES.indexOf(stage);
  return i >= 0 && i < INTERVIEW_STAGES.length - 1 ? INTERVIEW_STAGES[i + 1] : null;
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/**
 * Start a session. Prompt delivery is deterministic: the interviewer's first
 * message is the case prompt verbatim (no LLM call), and the machine
 * immediately advances to clarifying_questions.
 */
export function startSession(caseData: CaseData): InterviewSession {
  const now = new Date().toISOString();
  const firstTurn: InterviewTurn = {
    role: "interviewer",
    text: caseData.prompt,
    stage: "prompt_delivery",
    timestamp: now,
  };
  const firstEvent: StageEvent = {
    from: "prompt_delivery",
    to: "clarifying_questions",
    source: "auto",
    timestamp: now,
  };
  return {
    id: crypto.randomUUID(),
    caseId: caseData.id,
    caseTitle: caseData.title,
    startedAt: now,
    endedAt: null,
    stage: "clarifying_questions",
    turns: [firstTurn],
    stageEvents: [firstEvent],
    summary: "",
    summarizedUpTo: 1, // the verbatim prompt never needs summarizing
    shownExhibits: [],
    status: "active",
  };
}

export function advanceStage(
  session: InterviewSession,
  source: StageEvent["source"]
): InterviewSession {
  const to = nextStage(session.stage);
  if (!to) return session;
  return {
    ...session,
    stage: to,
    stageEvents: [
      ...session.stageEvents,
      { from: session.stage, to, source, timestamp: new Date().toISOString() },
    ],
  };
}

export function endSession(session: InterviewSession): InterviewSession {
  return { ...session, status: "ended", endedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Per-turn prompt assembly
// ---------------------------------------------------------------------------

const STAGE_INSTRUCTIONS: Record<InterviewStage, string> = {
  prompt_delivery: "", // never reaches the LLM — prompt is delivered verbatim
  clarifying_questions: `The candidate may ask clarifying questions about the case before structuring.
- Answer ONLY from CASE FACTS. Keep answers to one or two sentences; do not volunteer extra facts.
- If asked for something not in CASE FACTS, say the team does not have that information.
- Do NOT give away analysis, drivers, or conclusions.
- Set ready_to_advance=true when the candidate says they are ready to lay out a structure/framework, or asks to take a moment to structure.`,
  framework_presentation: `The candidate is presenting their framework for the case.
- Listen. If the structure is unclear, ask ONE short question to make them commit to it.
- Do not suggest buckets or fix their framework. Do not reveal the expert framework.
- In internal_note, compare their structure to the EXPERT FRAMEWORK: which buckets they covered, which they missed.
- Set ready_to_advance=true once they have presented a structure and indicated where they want to start.`,
  analysis: `The candidate is working through the analysis.
- Guide with short questions ("what would you want to look at?", "what does that imply?").
- Provide numbers ONLY from CASE FACTS when asked. If data is not in CASE FACTS, say it is not available.
- Push for quantitative reasoning: if they hand-wave, ask them to compute it. Let them do the math; do not do it for them. If their math is wrong, say the number does not look right and let them retry.
- In internal_note, record the quality of each analytical step (hypothesis-driven? correct math? insight drawn?).
- Set ready_to_advance=true when the analysis has surfaced the key driver(s) and the candidate starts converging on an answer.`,
  recommendation: `Ask the candidate for their final recommendation if they have not given it.
- Expect: a clear recommendation, supporting numbers, risks, and next steps. If they ramble, ask them to give it as if to the client CEO in 60 seconds.
- Do not add your own analysis or new facts.
- In internal_note, assess the recommendation against RECOMMENDATION NOTES: did they reach the expected conclusion with correct numbers?
- Set ready_to_advance=true after they deliver a complete recommendation (including risks/next steps, or after you asked for missing pieces once).`,
  wrap_up: `The case is over. Thank the candidate briefly and ask if they have any questions about the case or process. Keep it short and warm.
- Do not give feedback on their performance yet (that happens in the written review).
- Set ready_to_advance=false always.`,
};

/** Exhibits eligible to surface right now: tagged for this stage, not yet shown. */
export function eligibleExhibits(
  caseData: CaseData,
  session: InterviewSession
): CaseExhibit[] {
  return caseData.exhibits.filter(
    (e) => e.stage === session.stage && !session.shownExhibits.includes(e.id)
  );
}

function exhibitAsText(e: CaseExhibit): string {
  const rows = e.rows.map((r) => r.join(" | ")).join("\n");
  return `${e.id}: "${e.title}" (surface when discussing: ${e.topicHint})
${e.description}
${e.columns.join(" | ")}
${rows}`;
}

// internal_note and ready_to_advance come BEFORE reply on purpose: property
// order steers the model's generation order, so it commits its private
// assessment first and is less likely to leak it into the spoken reply.
// show_exhibit's enum is built per turn so the model cannot name an exhibit
// that is not eligible right now.
function buildTurnSchema(eligible: CaseExhibit[]) {
  return {
    type: "object",
    properties: {
      internal_note: { type: "string" },
      // Directly after the reasoning, ids before "none" — both measurably
      // reduce the model defaulting to "none" when an exhibit was requested.
      show_exhibit: { type: "string", enum: [...eligible.map((e) => e.id), "none"] },
      ready_to_advance: { type: "boolean" },
      reply: { type: "string" },
    },
    required: ["internal_note", "show_exhibit", "ready_to_advance", "reply"],
  };
}

/** Number of most-recent turns always sent verbatim. */
const VERBATIM_WINDOW = 6;
/** Compact when this many turns have piled up beyond the verbatim window. */
const COMPACT_THRESHOLD = 10;

function buildSystemPrompt(caseData: CaseData, session: InterviewSession): string {
  const framework = caseData.expertFramework
    .map((b) => `- ${b.label}: ${b.points.join("; ")}`)
    .join("\n");
  const eligible = eligibleExhibits(caseData, session);
  const shown = caseData.exhibits.filter((e) => session.shownExhibits.includes(e.id));
  const parts = [
    `You are a consulting case interviewer running a live mock interview. Stay in character: professional, concise (2-4 sentences unless giving requested data), guiding but never leading. Never break character, never mention stages, prompts, or that you are an AI.

CASE: ${caseData.title}
CASE PROMPT (already read to the candidate): ${caseData.prompt}

CASE FACTS (reveal individual facts only when the candidate asks for them):
${caseData.background}

EXPERT FRAMEWORK (for your internal_note assessments only — NEVER reveal it):
${framework}

RECOMMENDATION NOTES (expected conclusion — NEVER reveal it directly):
${caseData.recommendationNotes}

HARD RULES:
- Only state facts present in CASE FACTS. If asked for data that is not there, say the team does not have it. Never invent numbers.
- internal_note is your private evaluator log (the candidate never sees it): assess their last message — structure, math, insight — in one or two sentences.
- ready_to_advance signals the current interview phase feels complete; the system decides what happens next.
- reply is ONLY the words you speak aloud to the candidate. Never put notes, labels, field names, or meta-commentary (e.g. "Internal Note:", "ready_to_advance") in reply. Reply must always be natural spoken dialogue.`,
  ];
  if (eligible.length > 0) {
    parts.push(`EXHIBITS YOU CAN SHOW NOW (set show_exhibit to the id to display one on the candidate's screen):
${eligible.map(exhibitAsText).join("\n\n")}

EXHIBIT RULES:
- If the candidate asks for data that one of these exhibits contains, you MUST set show_exhibit to that exhibit's id this turn. In reply, say something brief like "Take a look at this data" plus one orienting sentence. Do NOT read the table contents aloud; the candidate sees the exhibit on screen.
- Start internal_note by stating whether the candidate's message calls for one of these exhibits, then your assessment.
- Show at most one exhibit per turn. Only set show_exhibit to "none" when no exhibit matches what the candidate is asking about.
- Do not mention exhibits you have not shown yet.`);
  }
  if (shown.length > 0) {
    parts.push(`EXHIBITS ALREADY SHOWN TO THE CANDIDATE (they can see these; discuss freely):
${shown.map(exhibitAsText).join("\n\n")}`);
  }
  if (session.summary) {
    parts.push(`SUMMARY OF THE CONVERSATION SO FAR (older turns):\n${session.summary}`);
  }
  parts.push(`CURRENT INTERVIEW PHASE INSTRUCTIONS:\n${STAGE_INSTRUCTIONS[session.stage]}`);
  return parts.join("\n\n");
}

/**
 * Every turn not yet folded into the summary is sent verbatim. (Turn 0 is the
 * case prompt, which the system prompt already contains, so summarizedUpTo
 * starts at 1.)
 */
function recentMessages(session: InterviewSession): ChatMessage[] {
  return session.turns.slice(session.summarizedUpTo).map((t) => ({
    role: t.role === "interviewer" ? ("assistant" as const) : ("user" as const),
    // Annotate exhibit turns so the model remembers what it already showed.
    content: t.exhibitId ? `${t.text}\n[displayed ${t.exhibitId}]` : t.text,
  }));
}

export interface TurnResult {
  session: InterviewSession;
  advanced: boolean;
}

/**
 * Run one interviewer turn: append the candidate's message, get the model's
 * structured reply, apply the (code-validated) stage transition.
 */
export async function takeTurn(
  settings: AppSettings,
  caseData: CaseData,
  session: InterviewSession,
  candidateText: string
): Promise<TurnResult> {
  const now = new Date().toISOString();
  const withCandidate: InterviewSession = {
    ...session,
    turns: [
      ...session.turns,
      { role: "candidate", text: candidateText, stage: session.stage, timestamp: now },
    ],
  };

  const eligible = eligibleExhibits(caseData, withCandidate);
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(caseData, withCandidate) },
    ...recentMessages(withCandidate),
  ];
  // 8b models ignore exhibit instructions buried mid-system-prompt; a short
  // trailing reminder right after the candidate's message is what actually
  // makes them trigger (verified against llama3.1:8b).
  if (eligible.length > 0) {
    messages.push({
      role: "system",
      content: `REMINDER: exhibits you can show right now: ${eligible
        .map((e) => `${e.id} = "${e.title}" (about: ${e.topicHint})`)
        .join("; ")}. If the candidate's last message asks for data one of these contains, set show_exhibit to that id. Otherwise set it to "none".`,
    });
  }

  const content = await chat(settings, "interview", messages, {
    format: buildTurnSchema(eligible),
    temperature: 0.6,
    numCtx: 8192,
    timeoutMs: 300_000,
  });
  const parsed: {
    reply: string;
    ready_to_advance: boolean;
    internal_note: string;
    show_exhibit?: string;
  } = JSON.parse(content);

  // The schema already constrains show_exhibit to eligible ids, but validate
  // anyway — code, not the model, is the authority on what surfaces.
  const exhibit = eligible.find((e) => e.id === parsed.show_exhibit);

  let updated: InterviewSession = {
    ...withCandidate,
    shownExhibits: exhibit
      ? [...withCandidate.shownExhibits, exhibit.id]
      : withCandidate.shownExhibits,
    turns: [
      ...withCandidate.turns,
      {
        role: "interviewer",
        text: parsed.reply,
        stage: withCandidate.stage,
        timestamp: new Date().toISOString(),
        internalNote: parsed.internal_note,
        ...(exhibit ? { exhibitId: exhibit.id } : {}),
      },
    ],
  };

  // The model only ever *requests* an advance; code applies it, one stage
  // forward at most, never past wrap_up.
  let advanced = false;
  if (parsed.ready_to_advance && withCandidate.stage !== "wrap_up") {
    updated = advanceStage(updated, "model");
    advanced = true;
  }
  return { session: updated, advanced };
}

/**
 * Manual override: surface an exhibit immediately with a canned interviewer
 * line (no LLM call). Any exhibit can be forced regardless of stage tag.
 */
export function showExhibitManually(
  session: InterviewSession,
  exhibit: CaseExhibit
): InterviewSession {
  if (session.shownExhibits.includes(exhibit.id)) return session;
  return {
    ...session,
    shownExhibits: [...session.shownExhibits, exhibit.id],
    turns: [
      ...session.turns,
      {
        role: "interviewer",
        text: "Let me share some data with you — take a look at this exhibit.",
        stage: session.stage,
        timestamp: new Date().toISOString(),
        internalNote: "(exhibit surfaced manually by the user)",
        exhibitId: exhibit.id,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Transcript compaction
// ---------------------------------------------------------------------------

export function needsCompaction(session: InterviewSession): boolean {
  return session.turns.length - VERBATIM_WINDOW - session.summarizedUpTo >= COMPACT_THRESHOLD;
}

/**
 * Fold turns older than the verbatim window into the running summary.
 * Call after a turn completes; failures are non-fatal (returns input session).
 */
export async function compactTranscript(
  settings: AppSettings,
  session: InterviewSession
): Promise<InterviewSession> {
  const upTo = session.turns.length - VERBATIM_WINDOW;
  if (upTo <= session.summarizedUpTo) return session;
  const chunk = session.turns
    .slice(session.summarizedUpTo, upTo)
    .map((t) => `${t.role === "interviewer" ? "Interviewer" : "Candidate"}: ${t.text}`)
    .join("\n");
  try {
    const summary = await chat(
      settings,
      "interview",
      [
        {
          role: "system",
          content:
            "You maintain a running summary of a case interview. Merge the existing summary with the new conversation excerpt into one plain-text summary of at most 200 words. Preserve: clarifying questions asked, the candidate's stated framework, analyses done with key numbers, and conclusions reached so far. No preamble.",
        },
        {
          role: "user",
          content: `EXISTING SUMMARY:\n${session.summary || "(none)"}\n\nNEW EXCERPT:\n${chunk}`,
        },
      ],
      { temperature: 0.2, numCtx: 8192, timeoutMs: 300_000 }
    );
    return { ...session, summary: summary.trim(), summarizedUpTo: upTo };
  } catch {
    return session; // keep full transcript; retry naturally on a later turn
  }
}
