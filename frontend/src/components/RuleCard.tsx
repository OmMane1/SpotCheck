import type { RecommendationResult } from "../types/parking";
import { scoreToColor, scoreToLabel, rankLabel } from "../utils/colors";

interface RuleCardProps {
  result: RecommendationResult;
  rank: number;
  onClose: () => void;
  onBack: () => void;
}

export default function RuleCard({
  result,
  rank,
  onClose,
  onBack,
}: RuleCardProps) {
  const color = scoreToColor(result.score);
  const label = scoreToLabel(result.score);

  return (
    <div className="rule-card">
      <div className="rule-card-header" style={{ borderLeftColor: color }}>
        <div className="rule-card-header-top">
          <button className="back-btn" onClick={onBack}>
            Back
          </button>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            X
          </button>
        </div>
        <h2 className="rule-card-street">{result.street_name}</h2>
        <p className="rule-card-cross-streets">
          {result.from_street} - {result.to_street}
        </p>
        <div className="rule-card-badge-row">
          <ScoreBar score={result.score} color={color} />
          <span className="rule-card-badge" style={{ backgroundColor: color }}>
            {rankLabel(rank)} - {label}
          </span>
        </div>
      </div>

      <div className="rule-card-section">
        <div className="rule-card-meta">
          <MetaItem label="Walk" value={`~${result.walk_minutes} min`} />
          <MetaItem label="Distance" value={`${Math.round(result.distance_meters)}m`} />
          <MetaItem label="Cost" value={result.pricing} />
        </div>
        <RuleBullets result={result} />
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

function ScoreBar({ score, color }: { score: number; color: string }) {
  const filled = score <= 0.35 ? 3 : score <= 0.6 ? 2 : 1;
  return (
    <div className="score-bar">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="score-bar-segment"
          style={{ background: i <= filled ? color : "#e2e8f0" }}
        />
      ))}
    </div>
  );
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${minutes} min`;
  if (m === 0) return `${h}h (${minutes} min)`;
  return `${h}h ${m}m (${minutes} min)`;
}

function RuleBullets({ result }: { result: RecommendationResult }) {
  const isMetered = result.pricing !== "Free";
  const bullets = [
    isMetered ? `Metered - ${result.pricing}` : "Free parking",
    `Max stay: ${formatDuration(result.max_duration_minutes)}`,
    result.permit_required ? "Resident permit required" : "No permit required",
  ];

  return (
    <ul className="rule-bullets">
      {bullets.map((b, i) => (
        <li key={i}>{b}</li>
      ))}
    </ul>
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
