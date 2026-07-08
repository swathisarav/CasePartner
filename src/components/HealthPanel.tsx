import type { CheckResult, CheckStatus } from "../lib/health";

export interface HealthRow {
  label: string;
  result: CheckResult;
}

interface Props {
  rows: HealthRow[] | null;
  checking: boolean;
  onRecheck: () => void;
}

const ICONS: Record<CheckStatus, string> = { ok: "🟢", fail: "🔴", skipped: "⚪" };

export function HealthPanel({ rows, checking, onRecheck }: Props) {
  return (
    <section className="health-panel">
      <div className="health-header">
        <h2>Health checks</h2>
        <button onClick={onRecheck} disabled={checking}>
          {checking ? "Checking…" : "Re-run checks"}
        </button>
      </div>
      {!rows && checking && <p className="health-pending">Running checks…</p>}
      {rows && (
        <ul>
          {rows.map((r) => (
            <li key={r.label} className={`check-row ${r.result.status}`}>
              <span className="check-icon">{ICONS[r.result.status]}</span>
              <span className="check-label">{r.label}</span>
              <span className="check-detail">{r.result.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
