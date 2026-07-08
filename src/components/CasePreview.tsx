import type { CaseData, CaseExhibit } from "../types/case";

interface ExhibitTableProps {
  exhibit: CaseExhibit;
  /**
   * The description/trigger metadata reveals the exhibit's intended insight —
   * show it in the case editor, never to the candidate mid-interview.
   */
  showMeta?: boolean;
}

export function ExhibitTable({ exhibit, showMeta = true }: ExhibitTableProps) {
  return (
    <div className="exhibit">
      <div className="exhibit-title">{exhibit.title}</div>
      <table>
        <thead>
          <tr>
            {exhibit.columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {exhibit.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {showMeta && (
        <>
          <div className="exhibit-meta">
            <span className="pill">{exhibit.stage}</span>
            <span className="pill">topic: {exhibit.topicHint}</span>
          </div>
          <p className="exhibit-desc">{exhibit.description}</p>
        </>
      )}
    </div>
  );
}

export function CasePreview({ caseData }: { caseData: CaseData }) {
  return (
    <div className="case-preview">
      <h3>{caseData.title}</h3>

      <h4>Prompt</h4>
      <p className="case-prompt">{caseData.prompt}</p>

      <h4>Background (revealed on request)</h4>
      <p className="case-background">{caseData.background}</p>

      <h4>Expert framework</h4>
      <ul className="framework">
        {caseData.expertFramework.map((bucket, i) => (
          <li key={i}>
            <strong>{bucket.label}</strong>
            <ul>
              {bucket.points.map((p, j) => (
                <li key={j}>{p}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <h4>Exhibits ({caseData.exhibits.length})</h4>
      {caseData.exhibits.map((e) => (
        <ExhibitTable key={e.id} exhibit={e} />
      ))}

      <h4>Expected recommendation</h4>
      <p>{caseData.recommendationNotes}</p>
    </div>
  );
}
