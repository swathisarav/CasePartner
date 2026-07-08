import type { FrameworkBucket } from "../types/case";
import {
  BucketCoverage,
  FrameworkMapping,
  RUBRIC_LABELS,
  ReviewData,
  Rubric,
  RubricScore,
} from "../types/review";

const COVERAGE_BADGE: Record<BucketCoverage, { icon: string; label: string }> = {
  full: { icon: "✓", label: "Covered" },
  partial: { icon: "◐", label: "Partial" },
  missed: { icon: "✗", label: "Missed" },
};

function BucketCell({ bucket, fallback }: { bucket?: FrameworkBucket; fallback: string }) {
  if (!bucket) return <div className="bucket-cell empty">{fallback}</div>;
  return (
    <div className="bucket-cell">
      <strong>{bucket.label}</strong>
      <ul>
        {bucket.points.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

/** Aligned expert-vs-candidate rows, one per expert bucket, plus extras. */
function FrameworkAlignment({ review }: { review: ReviewData }) {
  const mapping = review.frameworkAssessment.mapping ?? [];
  const mappedCandidateLabels = new Set(mapping.map((m) => m.candidateBucket));
  const extras = review.candidateFramework.filter((b) => !mappedCandidateLabels.has(b.label));
  return (
    <div className="alignment">
      <div className="alignment-head">
        <span>Expert framework</span>
        <span />
        <span>Your structure</span>
      </div>
      {mapping.map((m: FrameworkMapping, i) => {
        const badge = COVERAGE_BADGE[m.coverage];
        return (
          <div key={i} className={`alignment-row ${m.coverage}`}>
            <BucketCell
              bucket={review.expertFramework.find((b) => b.label === m.expertBucket)}
              fallback={m.expertBucket}
            />
            <span className={`coverage-badge ${m.coverage}`}>
              {badge.icon} {badge.label}
            </span>
            <BucketCell
              bucket={review.candidateFramework.find((b) => b.label === m.candidateBucket)}
              fallback={m.candidateBucket || "—"}
            />
            <p className="alignment-note">{m.note}</p>
          </div>
        );
      })}
      {extras.length > 0 && (
        <div className="alignment-extras">
          <span>You also raised (not in the expert framework):</span>{" "}
          {extras.map((b) => b.label).join(", ")}
        </div>
      )}
    </div>
  );
}

/** Meter severity band: fill color + a lighter track from the same ramp. */
function meterColors(score: number): { fill: string; track: string } {
  if (score >= 7) return { fill: "#4d7cfe", track: "#dce4fb" };
  if (score >= 4) return { fill: "#b45309", track: "#f7e8d2" };
  return { fill: "#d92d20", track: "#fbdcd9" };
}

function ScoreTile({ label, result }: { label: string; result: RubricScore }) {
  const { fill, track } = meterColors(result.score);
  return (
    <div className="score-tile">
      <div className="score-label">{label}</div>
      <div className="score-value">
        {result.score}
        <span className="score-denom">/10</span>
      </div>
      <div className="score-meter" style={{ background: track }}>
        <div
          className="score-meter-fill"
          style={{ width: `${result.score * 10}%`, background: fill }}
        />
      </div>
      <p className="score-evidence">{result.evidence}</p>
    </div>
  );
}

function RubricRow({ rubric }: { rubric: Rubric }) {
  return (
    <div className="rubric-row">
      {(Object.keys(RUBRIC_LABELS) as (keyof Rubric)[]).map((key) => (
        <ScoreTile key={key} label={RUBRIC_LABELS[key]} result={rubric[key]} />
      ))}
    </div>
  );
}

function FrameworkList({ buckets, empty }: { buckets: FrameworkBucket[]; empty: string }) {
  if (buckets.length === 0) return <p className="empty-note">{empty}</p>;
  return (
    <ul className="framework">
      {buckets.map((b, i) => (
        <li key={i}>
          <strong>{b.label}</strong>
          <ul>
            {b.points.map((p, j) => (
              <li key={j}>{p}</li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function ReviewView({ review }: { review: ReviewData }) {
  return (
    <div className="review-view">
      <h3>Review — {review.caseTitle}</h3>
      <p className="review-summary">{review.overallSummary}</p>

      {review.rubric && <RubricRow rubric={review.rubric} />}

      <h4>Structure: yours vs expert</h4>
      {review.frameworkAssessment.mapping?.length ? (
        <FrameworkAlignment review={review} />
      ) : (
        <>
          <div className="framework-compare">
            <div>
              <h5>Your structure</h5>
              <FrameworkList
                buckets={review.candidateFramework}
                empty="No framework was presented during the interview."
              />
            </div>
            <div>
              <h5>Expert framework</h5>
              <FrameworkList
                buckets={review.expertFramework}
                empty="Case has no expert framework."
              />
            </div>
          </div>
          <div className="coverage-pills">
            {review.frameworkAssessment.covered.map((c, i) => (
              <span key={`c${i}`} className="pill covered">✓ {c}</span>
            ))}
            {review.frameworkAssessment.missed.map((m, i) => (
              <span key={`m${i}`} className="pill missed">✗ {m}</span>
            ))}
          </div>
        </>
      )}
      <p>{review.frameworkAssessment.comparison}</p>

      <h4>Quantitative reasoning</h4>
      <p>{review.quantitativeAssessment}</p>

      <h4>Communication</h4>
      <p>{review.communicationAssessment}</p>

      {review.progressNotes && review.progressNotes.length > 0 && (
        <>
          <h4>Progress since last session</h4>
          <ul className="progress-notes">
            {review.progressNotes.map((p, i) => (
              <li key={i} className={`progress-note ${p.status}`}>
                <span className={`progress-badge ${p.status}`}>
                  {p.status === "improved" && "▲ Improved"}
                  {p.status === "persisted" && "● Persisted"}
                  {p.status === "not_observable" && "○ Not observable"}
                </span>
                <div>
                  <div className="progress-step">{p.priorStep}</div>
                  <div className="progress-comment">{p.comment}</div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>Improvement plan</h4>
      <ol className="improvement-steps">
        {review.improvementSteps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
