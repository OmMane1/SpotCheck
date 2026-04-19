import type { RecommendationResult } from "../types/parking";
import { scoreToColor, scoreToLabel, rankLabel } from "../utils/colors";

interface RuleCardProps {
  result: RecommendationResult;
  rank: number; // 0-indexed position in results array
  onClose: () => void;
}

export default function RuleCard({ result, rank, onClose }: RuleCardProps) {
  const color = scoreToColor(result.score);
  const label = scoreToLabel(result.score);

  return (
    <div className="rule-card">
      <div className="rule-card-header" style={{ borderLeftColor: color }}>
        <div>
          <h2 className="rule-card-street">{result.street_name}</h2>
          <p className="rule-card-cross-streets">
            {result.from_street} → {result.to_street}
          </p>
          <span className="rule-card-badge" style={{ backgroundColor: color }}>
            {rankLabel(rank)} · {label}
          </span>
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="rule-card-section">
        <div className="rule-card-meta">
          <MetaItem label="Walk" value={`~${result.walk_minutes} min`} />
          <MetaItem label="Distance" value={`${Math.round(result.distance_meters)}m`} />
          <MetaItem label="Cost" value={result.pricing} />
        </div>
        <p className="rule-card-rule-summary">{result.rule_summary}</p>
      </div>

      {result.why_good.length > 0 && (
        <div className="rule-card-section rule-card-good">
          <h3>Why it works</h3>
          <ul className="rule-list">
            {result.why_good.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {result.risk_warnings.length > 0 && (
        <div className="rule-card-section rule-card-warning">
          <h3>Watch out</h3>
          <ul className="rule-list">
            {result.risk_warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-item">
      <span className="meta-label">{label}</span>
      <span className="meta-value">{value}</span>
    </div>
  );
}
