import { useEffect, useState } from "react";
import type { AppSettings } from "../lib/settings";
import { generateReview } from "../lib/review";
import {
  SessionDetail,
  SessionListItem,
  deleteSession,
  getCase,
  getLatestReview,
  getSessionDetail,
  listReviews,
  listSessions,
  supabaseConfigured,
  upsertReview,
} from "../lib/supabase";
import { ReviewView } from "./ReviewView";
import { ProgressChart, ProgressPoint } from "./ProgressChart";

export function HistoryScreen({ settings }: { settings: AppSettings }) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [progress, setProgress] = useState<ProgressPoint[]>([]);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setSessions(await listSessions(settings));
      const reviews = await listReviews(settings);
      setProgress(
        reviews
          .filter((r) => r.data.rubric)
          .map((r) => ({
            date: r.created_at,
            caseTitle: r.data.caseTitle,
            rubric: r.data.rubric!,
          }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (supabaseConfigured(settings)) refresh();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openDetail(id: string) {
    setError("");
    try {
      const d = await getSessionDetail(settings, id);
      if (!d) throw new Error("Session not found in Supabase");
      setDetail(d);
      setShowTranscript(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleGenerateReview(d: SessionDetail) {
    if (!d.case_id) {
      setError("This session has no linked case, so a review can't be generated.");
      return;
    }
    setReviewing(true);
    setError("");
    try {
      const caseData = await getCase(settings, d.case_id);
      if (!caseData) throw new Error("Case not found in Supabase");
      const prior = await getLatestReview(settings, d.id).catch(() => null);
      const review = await generateReview(settings, caseData, d.data, prior);
      await upsertReview(settings, review);
      setDetail({ ...d, reviews: [{ id: review.id, data: review }] });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReviewing(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this session (and its review) from Supabase?")) return;
    try {
      await deleteSession(settings, id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!supabaseConfigured(settings)) {
    return (
      <p className="empty-note">
        Configure Supabase in the Setup tab to see session history here.
      </p>
    );
  }

  if (detail) {
    const review = detail.reviews[0]?.data;
    const notesByTurn = new Map<number, string[]>();
    for (const a of review?.annotations ?? []) {
      notesByTurn.set(a.turnIndex, [...(notesByTurn.get(a.turnIndex) ?? []), a.note]);
    }
    return (
      <div>
        <div className="cases-header">
          <h2>Session detail</h2>
          <button className="secondary" onClick={() => setDetail(null)}>
            Back to history
          </button>
        </div>
        {error && <p className="status-note error">{error}</p>}
        {review ? (
          <ReviewView review={review} />
        ) : (
          <div className="review-cta">
            <button onClick={() => handleGenerateReview(detail)} disabled={reviewing}>
              {reviewing ? "Generating review…" : "Generate review"}
            </button>
            {!reviewing && (
              <span className="review-cta-note">
                No review exists for this session yet.
              </span>
            )}
          </div>
        )}
        <button className="secondary" onClick={() => setShowTranscript(!showTranscript)}>
          {showTranscript ? "Hide transcript" : "Show transcript"}
        </button>
        {showTranscript && (
          <div className="chat history-transcript">
            {detail.data.turns.map((t, i) => (
              <div key={i} className={`bubble ${t.role}`}>
                <div className="bubble-role">
                  {t.role === "interviewer" ? "Interviewer" : "You"} · {t.stage}
                </div>
                <div className="bubble-text">{t.text}</div>
                {(notesByTurn.get(i) ?? []).map((note, j) => (
                  <div key={j} className="coach-note">
                    📌 <strong>Coach:</strong> {note}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="cases-header">
        <h2>Session history</h2>
        <button className="secondary" onClick={refresh} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error && <p className="status-note error">{error}</p>}
      {progress.length >= 2 && <ProgressChart points={progress} />}
      {progress.length === 1 && (
        <p className="empty-note">
          One scored review so far — the progress chart appears after your second.
        </p>
      )}
      {!loading && sessions.length === 0 && !error && (
        <p className="empty-note">No sessions yet — finish an interview and it lands here.</p>
      )}
      <ul className="case-list">
        {sessions.map((s) => (
          <li key={s.id} className="case-card">
            <div className="case-card-main">
              <strong>{s.case_title}</strong>
              <span className="case-card-meta">
                {new Date(s.started_at).toLocaleString()} · {s.status}
                {s.reviews.length > 0 ? " · reviewed" : " · no review"}
              </span>
            </div>
            <div className="case-card-actions">
              <button onClick={() => openDetail(s.id)}>View</button>
              <button className="secondary" onClick={() => handleDelete(s.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
