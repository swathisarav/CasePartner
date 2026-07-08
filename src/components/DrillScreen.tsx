import { useEffect, useState } from "react";
import type { AppSettings } from "../lib/settings";
import { CaseOpening, shuffledOpenings } from "../data/caseOpenings";
import { speak, stop as stopSpeaking } from "../lib/tts";

interface Props {
  settings: AppSettings;
}

/**
 * Case-opening capture drill: hear an opening read aloud, note the key facts on
 * paper, then reveal the text to check yourself. Fully offline — draws from the
 * 50 bundled openings, shuffled. "Fresh batch" reshuffles.
 */
export function DrillScreen({ settings }: Props) {
  const [deck, setDeck] = useState<CaseOpening[]>(() => shuffledOpenings());
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const current = deck[pos];
  const exhausted = !current;

  function play(opening: CaseOpening | undefined) {
    if (!opening) return;
    stopSpeaking();
    speak(opening.prompt, {
      engine: settings.ttsEngine,
      voiceUri: settings.ttsVoice,
      kokoroVoice: settings.kokoroVoice,
      rate: settings.ttsRate,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
  }

  // Auto-play the first opening on mount; stop any speech on unmount.
  useEffect(() => {
    play(deck[0]);
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goNext() {
    stopSpeaking();
    const np = pos + 1;
    setPos(np);
    setRevealed(false);
    play(deck[np]);
  }

  function freshBatch() {
    stopSpeaking();
    const d = shuffledOpenings();
    setDeck(d);
    setPos(0);
    setRevealed(false);
    play(d[0]);
  }

  return (
    <div className="drill-screen">
      <div className="section-head">
        <div>
          <h2>Case-opening drills</h2>
          <p className="section-sub">
            Hear each opening once, note the key facts on paper, then reveal to check what
            you captured. Aim for 5–15 in a sitting.
          </p>
        </div>
        <button className="secondary" onClick={freshBatch}>
          Fresh batch
        </button>
      </div>

      {exhausted ? (
        <div className="drill-card drill-done">
          <p>
            You've been through all {deck.length} openings in this batch. Nice work.
          </p>
          <button onClick={freshBatch}>Start a fresh batch</button>
        </div>
      ) : (
        <>
          <div className="drill-progress">
            Opening {pos + 1} of {deck.length}
          </div>

          <div className="drill-card">
            {!revealed ? (
              <div className="drill-listen">
                <div className={`drill-audio-icon ${speaking ? "speaking" : ""}`}>
                  {speaking ? "🔊" : "🎧"}
                </div>
                <p className="drill-listen-text">
                  {speaking
                    ? "Listen and note what you hear…"
                    : "Note the key facts on paper: the client, the objective, and every number."}
                </p>
                <div className="drill-actions">
                  <button className="secondary" onClick={() => play(current)}>
                    {speaking ? "🔊 Playing…" : "🔊 Replay"}
                  </button>
                  <button onClick={() => setRevealed(true)}>Reveal text</button>
                </div>
              </div>
            ) : (
              <div className="drill-reveal">
                <span className="badge archetype">{current.topic}</span>
                <p className="drill-opening-text">{current.prompt}</p>
                <div className="drill-actions">
                  <button className="secondary" onClick={() => play(current)}>
                    🔊 Replay
                  </button>
                  <button onClick={goNext}>Next opening →</button>
                </div>
              </div>
            )}
          </div>

          <p className="drill-hint">
            Tip: this trains you to capture the prompt in one listen. Reveal only after
            you've written down everything you think you heard.
          </p>
        </>
      )}
    </div>
  );
}
