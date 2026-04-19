import { useState } from "react";
import type { RecommendationResult } from "../types/parking";
import { scoreToColor, scoreToLabel, rankLabel } from "../utils/colors";

interface RuleCardProps {
  result: RecommendationResult;
  rank: number;
  arrivalTime: string | null;
  onClose: () => void;
  onBack: () => void;
}

function computeDestArrival(parkISO: string, walkMinutes: number): string {
  const d = new Date(parkISO);
  d.setMinutes(d.getMinutes() + walkMinutes);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function buildAddress(result: RecommendationResult): string {
  return `${result.street_name} between ${result.from_street} and ${result.to_street}, Boston, MA`;
}

export default function RuleCard({ result, rank, arrivalTime, onClose, onBack }: RuleCardProps) {
  const color = scoreToColor(result.score);
  const label = scoreToLabel(result.score);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(buildAddress(result)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const navigateUrl = result.center
    ? `https://www.google.com/maps/dir/?api=1&destination=${result.center.lat},${result.center.lng}&travelmode=walking`
    : null;

  return (
    <div className="rule-card">
      <div className="rule-card-header" style={{ borderLeftColor: color }}>
        <div className="rule-card-header-top">
          <button className="back-btn" onClick={onBack}>← Back</button>
          <button className="close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <h2 className="rule-card-street">{result.street_name}</h2>
        <p className="rule-card-cross-streets">
          {result.from_street} → {result.to_street}
        </p>
        <div className="rule-card-badge-row">
          <ScoreBar score={result.score} color={color} />
          <span className="rule-card-badge" style={{ backgroundColor: color }}>
            {rankLabel(rank)} · {label}
          </span>
        </div>
        <div className="rule-card-actions">
          {navigateUrl && (
            <a href={navigateUrl} target="_blank" rel="noopener noreferrer" className="action-btn action-btn--navigate">
              Navigate →
            </a>
          )}
          <button className="action-btn action-btn--copy" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy address"}
          </button>
        </div>
      </div>

      <div className="rule-card-section">
        <div className="rule-card-meta">
          <MetaItem label="Walk" value={`~${result.walk_minutes} min`} />
          <MetaItem label="Distance" value={`${Math.round(result.distance_meters)}m`} />
          <MetaItem label="Cost" value={result.pricing} />
        </div>
        {arrivalTime && (
          <p className="rule-card-arrival">
            Reach destination by <strong>{computeDestArrival(arrivalTime, result.walk_minutes)}</strong>
          </p>
        )}
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
  const filled = score <= 0.35 ? 3 : score <= 0.60 ? 2 : 1;
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
    isMetered ? `Metered · ${result.pricing}` : "Free parking",
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
