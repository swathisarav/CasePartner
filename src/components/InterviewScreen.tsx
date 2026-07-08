import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "../lib/settings";
import type { CaseData, InterviewStage } from "../types/case";
import { INTERVIEW_STAGES } from "../types/case";
import type { InterviewSession } from "../types/interview";
import {
  STAGE_HINTS,
  STAGE_LABELS,
  advanceStage,
  compactTranscript,
  endSession,
  needsCompaction,
  nextStage,
  showExhibitManually,
  startSession,
  takeTurn,
} from "../lib/interview";
import { generateReview } from "../lib/review";
import { VadMonitor } from "../lib/audio";
import { MicRecorder, transcribeBlob } from "../lib/stt";
import { speak, stop as stopSpeaking } from "../lib/tts";
import {
  getLatestReview,
  supabaseConfigured,
  upsertReview,
  upsertSession,
} from "../lib/supabase";
import type { ReviewData } from "../types/review";
import { ExhibitTable } from "./CasePreview";
import { ReviewView } from "./ReviewView";

interface Props {
  settings: AppSettings;
  caseData: CaseData;
  onExit: () => void;
}

async function persist(session: InterviewSession) {
  try {
    await invoke("save_session", { id: session.id, json: JSON.stringify(session, null, 2) });
  } catch (e) {
    console.error("session autosave failed", e);
  }
}

export function InterviewScreen({ settings, caseData, onExit }: Props) {
  const [session, setSession] = useState<InterviewSession>(() => startSession(caseData));
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<ReviewData | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [syncNote, setSyncNote] = useState("");
  const [voiceOn, setVoiceOn] = useState(settings.ttsEnabled);
  const [speaking, setSpeaking] = useState(false);
  const [micState, setMicState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [handsFree, setHandsFree] = useState(false);
  const [tipsOn, setTipsOn] = useState(
    () => localStorage.getItem("casepartner.tipsOff") !== "1"
  );
  const recorder = useRef(new MicRecorder());
  const vad = useRef(new VadMonitor());
  const chatEnd = useRef<HTMLDivElement>(null);
  // Compaction runs in the background; don't let a stale result clobber newer turns.
  const compacting = useRef(false);
  // Async callbacks (TTS onEnd, VAD onStop) fire long after the closure was
  // created — refs mirror the volatile state they need to read fresh.
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;
  const micStateRef = useRef(micState);
  micStateRef.current = micState;
  const statusRef = useRef(session.status);
  statusRef.current = session.status;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;

  /** Speak if voice is on; run `after` when done either way (drives the loop). */
  function say(text: string, after?: () => void) {
    if (!voiceOnRef.current) {
      after?.();
      return;
    }
    speak(text, {
      engine: settings.ttsEngine,
      voiceUri: settings.ttsVoice,
      kokoroVoice: settings.kokoroVoice,
      rate: settings.ttsRate,
      onStart: () => setSpeaking(true),
      onEnd: () => {
        setSpeaking(false);
        after?.();
      },
    });
  }

  function autoListen() {
    if (handsFreeRef.current && statusRef.current === "active" && !pendingRef.current) {
      startListening();
    }
  }

  // Read the case prompt aloud once at the start; stop speech + mic on unmount.
  useEffect(() => {
    say(caseData.prompt, autoListen);
    const rec = recorder.current;
    const v = vad.current;
    return () => {
      stopSpeaking();
      v.stop();
      rec.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startListening() {
    if (micStateRef.current !== "idle" || statusRef.current !== "active") return;
    setError("");
    try {
      await recorder.current.start();
      setMicState("recording");
      if (handsFreeRef.current) {
        const stream = recorder.current.getStream();
        if (stream) vad.current.start(stream, { onStop: () => finishListening() });
      }
    } catch (e) {
      setError(`Microphone unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function finishListening() {
    vad.current.stop();
    if (micStateRef.current !== "recording") return;
    setMicState("transcribing");
    try {
      const blob = await recorder.current.stop();
      const text = await transcribeBlob(blob);
      setMicState("idle");
      if (handsFreeRef.current) {
        if (text) await sendText(text);
        else autoListen(); // silence — keep listening rather than dying quietly
      } else if (text) {
        setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
      } else {
        setError("Didn't catch any speech — try again closer to the mic.");
      }
    } catch (e) {
      setMicState("idle");
      setError(`Transcription failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function toggleMic() {
    if (micState === "transcribing") return;
    if (micState === "idle") startListening();
    else finishListening();
  }

  function toggleHandsFree() {
    const next = !handsFree;
    setHandsFree(next);
    handsFreeRef.current = next;
    if (next) {
      if (micStateRef.current === "idle" && !pendingRef.current && !speakingRef.current) {
        startListening();
      }
    } else {
      vad.current.stop(); // manual ⏹ still works; loop just stops driving itself
    }
  }

  function interrupt() {
    stopSpeaking();
    setSpeaking(false);
    if (handsFreeRef.current) startListening();
  }

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.turns.length, pending]);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendText(text);
  }

  async function sendText(text: string) {
    if (!text || pendingRef.current || statusRef.current === "ended") return;
    setError("");
    setPending(true);
    pendingRef.current = true;
    try {
      const result = await takeTurn(settings, caseData, session, text);
      setSession(result.session);
      persist(result.session);
      const lastTurn = result.session.turns[result.session.turns.length - 1];
      if (lastTurn.role === "interviewer") {
        setPending(false);
        pendingRef.current = false;
        say(lastTurn.text, autoListen);
      }
      if (!compacting.current && needsCompaction(result.session)) {
        compacting.current = true;
        compactTranscript(settings, result.session).then((compacted) => {
          compacting.current = false;
          // Merge only the summary fields; turns may have moved on meanwhile.
          setSession((current) => ({
            ...current,
            summary: compacted.summary,
            summarizedUpTo: compacted.summarizedUpTo,
          }));
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setInput(text); // give the message back for retry
    } finally {
      setPending(false);
    }
  }

  function handleAdvance() {
    if (session.status === "ended" || !nextStage(session.stage)) return;
    const updated = advanceStage(session, "manual");
    setSession(updated);
    persist(updated);
  }

  function handleEnd() {
    if (!window.confirm("End this interview?")) return;
    stopSpeaking();
    setSpeaking(false);
    setHandsFree(false);
    handsFreeRef.current = false;
    vad.current.stop();
    recorder.current.cancel();
    setMicState("idle");
    const ended = endSession(session);
    setSession(ended);
    persist(ended);
    if (supabaseConfigured(settings)) {
      upsertSession(settings, caseData, ended)
        .then(() => setSyncNote("Session synced to Supabase."))
        .catch((e) => setSyncNote(`Supabase sync failed (kept locally): ${e.message ?? e}`));
    }
  }

  async function handleGenerateReview() {
    setReviewing(true);
    setError("");
    try {
      const prior = supabaseConfigured(settings)
        ? await getLatestReview(settings, session.id).catch(() => null)
        : null;
      const r = await generateReview(settings, caseData, session, prior);
      setReview(r);
      // Keep a local copy alongside the session file.
      try {
        await invoke("save_session", { id: `${r.sessionId}-review`, json: JSON.stringify(r, null, 2) });
      } catch (e) {
        console.error("local review save failed", e);
      }
      if (supabaseConfigured(settings)) {
        upsertReview(settings, r)
          .then(() => setSyncNote("Review synced to Supabase."))
          .catch((e) => setSyncNote(`Supabase sync failed (kept locally): ${e.message ?? e}`));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReviewing(false);
    }
  }

  function handleShowExhibit(exhibitId: string) {
    const exhibit = caseData.exhibits.find((e) => e.id === exhibitId);
    if (!exhibit) return;
    const updated = showExhibitManually(session, exhibit);
    setSession(updated);
    persist(updated);
    const lastTurn = updated.turns[updated.turns.length - 1];
    if (lastTurn.role === "interviewer") say(lastTurn.text, autoListen);
  }

  function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    if (!next) {
      stopSpeaking();
      setSpeaking(false);
    }
  }

  const stageIndex = INTERVIEW_STAGES.indexOf(session.stage);
  const callState = pending
    ? "thinking"
    : speaking
      ? "speaking"
      : micState === "recording"
        ? "listening"
        : micState === "transcribing"
          ? "transcribing"
          : "idle";

  return (
    <div className="interview-screen">
      <div className="interview-header">
        <div>
          <h2>{caseData.title}</h2>
          <div className="stage-track">
            {INTERVIEW_STAGES.map((s: InterviewStage, i) => (
              <span
                key={s}
                className={
                  "stage-chip" +
                  (i < stageIndex ? " done" : "") +
                  (s === session.stage ? " current" : "")
                }
              >
                {STAGE_LABELS[s]}
              </span>
            ))}
            {speaking && <span className="stage-chip speaking">🔊 Speaking…</span>}
          </div>
        </div>
        <div className="interview-actions">
          {session.status === "active" && caseData.exhibits.length > 0 && (
            <details className="exhibit-menu">
              <summary>Exhibits</summary>
              <ul>
                {caseData.exhibits.map((e) => (
                  <li key={e.id}>
                    <span>
                      {e.title}{" "}
                      <em className="exhibit-menu-meta">
                        ({e.stage}
                        {session.shownExhibits.includes(e.id) ? ", shown" : ""})
                      </em>
                    </span>
                    <button
                      className="secondary"
                      disabled={session.shownExhibits.includes(e.id) || pending}
                      onClick={() => handleShowExhibit(e.id)}
                    >
                      Show now
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {session.status === "active" ? (
            <>
              <button
                className={handsFree ? "secondary handsfree-on" : "secondary"}
                onClick={toggleHandsFree}
                title="Hands-free: mic opens automatically after the interviewer speaks; pausing auto-sends"
              >
                {handsFree ? "🗣 Hands-free on" : "🗣 Hands-free"}
              </button>
              <button
                className="secondary"
                onClick={toggleVoice}
                title={voiceOn ? "Mute interviewer voice" : "Unmute interviewer voice"}
              >
                {voiceOn ? "🔊 Voice on" : "🔇 Muted"}
              </button>
              <button
                className={tipsOn ? "secondary handsfree-on" : "secondary"}
                onClick={() => {
                  const next = !tipsOn;
                  setTipsOn(next);
                  localStorage.setItem("casepartner.tipsOff", next ? "0" : "1");
                }}
                title="Show or hide beginner guidance for the current stage"
              >
                💡 Tips
              </button>
              <button
                className="secondary"
                onClick={handleAdvance}
                disabled={pending || !nextStage(session.stage)}
                title="Manually move to the next stage"
              >
                Advance stage
              </button>
              <button className="secondary" onClick={handleEnd} disabled={pending}>
                End interview
              </button>
            </>
          ) : (
            <button onClick={onExit}>Back to cases</button>
          )}
        </div>
      </div>

      {session.status === "active" && tipsOn && (
        <div className="stage-hint">
          <span className="stage-hint-label">{STAGE_LABELS[session.stage]}</span>
          <span>{STAGE_HINTS[session.stage]}</span>
        </div>
      )}

      <div className="chat">
        {session.turns.map((t, i) => {
          const exhibit = t.exhibitId
            ? caseData.exhibits.find((e) => e.id === t.exhibitId)
            : undefined;
          const notes = (review?.annotations ?? []).filter((a) => a.turnIndex === i);
          return (
            <div key={i} className={`bubble ${t.role}`}>
              <div className="bubble-role">
                {t.role === "interviewer" ? "Interviewer" : "You"}
              </div>
              <div className="bubble-text">{t.text}</div>
              {exhibit && (
                <div className="bubble-exhibit">
                  <ExhibitTable exhibit={exhibit} showMeta={false} />
                </div>
              )}
              {notes.map((a, j) => (
                <div key={j} className="coach-note">
                  📌 <strong>Coach:</strong> {a.note}
                </div>
              ))}
            </div>
          );
        })}
        {pending && (
          <div className="bubble interviewer thinking">
            <div className="bubble-role">Interviewer</div>
            <div className="bubble-text">Thinking…</div>
          </div>
        )}
        {session.status === "ended" && (
          <div className="ended-banner">
            Interview ended. Transcript saved ({session.turns.length} turns).
          </div>
        )}
        <div ref={chatEnd} />
      </div>

      {error && <p className="status-note error">{error}</p>}
      {syncNote && <p className="status-note">{syncNote}</p>}

      {session.status === "active" && (
        <div className={`call-state ${callState}`}>
          {callState === "listening" && "🎤 Listening — pause when you're done and I'll send it"}
          {callState === "transcribing" && "✍️ Transcribing…"}
          {callState === "thinking" && "💭 Interviewer is thinking…"}
          {callState === "speaking" && (
            <>
              🔊 Interviewer is speaking
              <button className="secondary" onClick={interrupt}>
                Interrupt
              </button>
            </>
          )}
          {callState === "idle" &&
            (handsFree ? "Ready — say something or type" : "Type below, or hit 🎤 to talk")}
        </div>
      )}

      {session.status === "ended" && !review && (
        <div className="review-cta">
          <button onClick={handleGenerateReview} disabled={reviewing}>
            {reviewing ? "Generating review…" : "Generate review"}
          </button>
          {reviewing && (
            <span className="review-cta-note">
              Running on the parse model — this takes several minutes on CPU. Leave it
              working.
            </span>
          )}
        </div>
      )}
      {review && <ReviewView review={review} />}

      {session.status === "active" && (
        <div className="composer">
          <textarea
            value={input}
            placeholder={
              micState === "recording"
                ? "Recording — click ⏹ when you finish speaking…"
                : "Speak as the candidate… (🎤 to talk, Enter to send)"
            }
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={pending}
            rows={3}
          />
          <button
            className={micState === "recording" ? "mic recording" : "mic"}
            onClick={toggleMic}
            disabled={pending || micState === "transcribing"}
            title={
              micState === "recording"
                ? "Stop recording and transcribe"
                : "Record your answer"
            }
          >
            {micState === "idle" && "🎤"}
            {micState === "recording" && "⏹"}
            {micState === "transcribing" && "…"}
          </button>
          <button onClick={send} disabled={pending || !input.trim()}>
            {pending ? "…" : "Send"}
          </button>
        </div>
      )}

      <details className="debug-panel">
        <summary>Debug: internal notes & stage events</summary>
        <div className="debug-body">
          <h4>Stage events</h4>
          <ul>
            {session.stageEvents.map((e, i) => (
              <li key={i}>
                {e.from} → {e.to} <em>({e.source})</em>
              </li>
            ))}
          </ul>
          <h4>Internal notes</h4>
          <ul>
            {session.turns
              .filter((t) => t.internalNote)
              .map((t, i) => (
                <li key={i}>
                  <em>[{t.stage}]</em> {t.internalNote}
                </li>
              ))}
          </ul>
          {session.summary && (
            <>
              <h4>Running summary (compacted {session.summarizedUpTo} turns)</h4>
              <p>{session.summary}</p>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
