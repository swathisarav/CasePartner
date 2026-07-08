import { useState } from "react";
import { RUBRIC_LABELS, Rubric } from "../types/review";

// Categorical slots 1-4 from the validated reference palette (worst adjacent
// CVD ΔE 24.2 on white). Aqua/yellow sit below 3:1 contrast, so the chart
// always ships direct end-labels and a table view (the relief rule).
const SERIES: { key: keyof Rubric; color: string }[] = [
  { key: "structuring", color: "#2a78d6" },
  { key: "quantitativeReasoning", color: "#1baf7a" },
  { key: "communication", color: "#eda100" },
  { key: "synthesis", color: "#008300" },
];

export interface ProgressPoint {
  date: string;
  caseTitle: string;
  rubric: Rubric;
}

const W = 680;
const H = 240;
const M = { top: 12, right: 150, bottom: 26, left: 30 };

export function ProgressChart({ points }: { points: ProgressPoint[] }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const n = points.length;
  const x = (i: number) => M.left + (i * (W - M.left - M.right)) / Math.max(n - 1, 1);
  const y = (v: number) => M.top + ((10 - v) * (H - M.top - M.bottom)) / 10;

  // Direct end-labels, dodged apart when final scores collide.
  const labels = SERIES.map((s) => ({
    ...s,
    label: RUBRIC_LABELS[s.key],
    finalY: y(points[n - 1].rubric[s.key].score),
  })).sort((a, b) => a.finalY - b.finalY);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].finalY - labels[i - 1].finalY < 14) {
      labels[i].finalY = labels[i - 1].finalY + 14;
    }
  }

  return (
    <div className="progress-chart">
      <div className="progress-chart-head">
        <h3>Rubric scores over sessions</h3>
        <button className="secondary" onClick={() => setView(view === "chart" ? "table" : "chart")}>
          {view === "chart" ? "Table view" : "Chart view"}
        </button>
      </div>

      {view === "table" ? (
        <table className="progress-table">
          <thead>
            <tr>
              <th>Session</th>
              {SERIES.map((s) => (
                <th key={s.key}>{RUBRIC_LABELS[s.key]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i}>
                <td>
                  {new Date(p.date).toLocaleDateString()} · {p.caseTitle}
                </td>
                {SERIES.map((s) => (
                  <td key={s.key}>{p.rubric[s.key].score}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rubric scores across sessions">
          {/* hairline gridlines at clean ticks */}
          {[0, 2, 4, 6, 8, 10].map((v) => (
            <g key={v}>
              <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="#e1e0d9" strokeWidth="1" />
              <text x={M.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#898781">
                {v}
              </text>
            </g>
          ))}
          {/* x labels: session dates */}
          {points.map((p, i) =>
            n <= 8 || i % 2 === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#898781">
                {new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </text>
            ) : null
          )}
          {/* series lines + markers (2px surface ring via white stroke) */}
          {SERIES.map((s) => (
            <g key={s.key}>
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points.map((p, i) => `${x(i)},${y(p.rubric[s.key].score)}`).join(" ")}
              />
              {points.map((p, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(p.rubric[s.key].score)}
                  r="4"
                  fill={s.color}
                  stroke="#fff"
                  strokeWidth="2"
                >
                  <title>
                    {`${RUBRIC_LABELS[s.key]} — ${p.rubric[s.key].score}/10 (${new Date(p.date).toLocaleDateString()}, ${p.caseTitle})`}
                  </title>
                </circle>
              ))}
            </g>
          ))}
          {/* direct end-labels: colored key dot + label in ink (text never wears the data color) */}
          {labels.map((l) => (
            <g key={l.key}>
              <circle cx={W - M.right + 10} cy={l.finalY} r="4" fill={l.color} />
              <text x={W - M.right + 18} y={l.finalY + 3.5} fontSize="11" fill="#52514e">
                {l.label}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
