import type { RecommendationResult } from "../types/parking";
import { scoreToColor, scoreToLabel, rankLabel } from "../utils/colors";

interface ResultsListProps {
  results: RecommendationResult[];
  rejectionReasons: string[];
  selectedId: string | null;
  arrivalTime: string | null;
  onSelect: (id: string) => void;
}

export default function ResultsList({ results, rejectionReasons, selectedId, arrivalTime, onSelect }: ResultsListProps) {
  if (results.length === 0) {
    return (
      <div className="results-empty">
        <p className="results-empty-title">No legal parking found</p>
        <p className="muted">Here's why all spots are blocked right now:</p>
        {rejectionReasons.length > 0 && (
          <ul className="rejection-list">
            {rejectionReasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        )}
        <p className="muted results-empty-hint">Try adjusting your arrival time or shortening your duration.</p>
      </div>
    );
  }

  return (
    <div className="results-list">
      <p className="results-list-header">
        {results.length} legal spot{results.length !== 1 ? "s" : ""} found
        <span className="muted"> · click to see details</span>
      </p>
      {results.map((result, index) => (
        <ResultCard
          key={result.segment_id}
          result={result}
          rank={index}
          isSelected={result.segment_id === selectedId}
          arrivalTime={arrivalTime}
          onClick={() => onSelect(result.segment_id)}
        />
      ))}
    </div>
  );
}

interface ResultCardProps {
  result: RecommendationResult;
  rank: number;
  isSelected: boolean;
  arrivalTime: string | null;
  onClick: () => void;
}

function computeDestArrival(parkISO: string, walkMinutes: number): string {
  const d = new Date(parkISO);
  d.setMinutes(d.getMinutes() + walkMinutes);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function ResultCard({ result, rank, isSelected, arrivalTime, onClick }: ResultCardProps) {
  const color = scoreToColor(result.score);
  const label = scoreToLabel(result.score);

  const navigateUrl = result.center
    ? `https://www.google.com/maps/dir/?api=1&destination=${result.center.lat},${result.center.lng}&travelmode=walking`
    : null;

  return (
    <div className={`result-card ${isSelected ? "result-card--selected" : ""}`} style={{ borderLeftColor: color }}>
      <button className="result-card-body" onClick={onClick}>
        <div className="result-card-top">
          <div className="result-card-rank" style={{ color }}>{rankLabel(rank)}</div>
          <ScoreBar score={result.score} color={color} />
          <span className="result-card-label" style={{ color }}>{label}</span>
        </div>
        <div className="result-card-street">{result.street_name}</div>
        <div className="result-card-cross">{result.from_street} → {result.to_street}</div>
        <div className="result-card-meta">
          <span>🚶 {result.walk_minutes} min</span>
          <span>💰 {result.pricing}</span>
          {arrivalTime && (
            <span className="result-card-arrival">→ {computeDestArrival(arrivalTime, result.walk_minutes)}</span>
          )}
          {result.risk_warnings.length > 0 && (
            <span className="result-card-warning-badge">⚠ {result.risk_warnings.length}</span>
          )}
        </div>
      </button>
      {navigateUrl && (
        <a
          href={navigateUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="result-card-navigate"
          onClick={(e) => e.stopPropagation()}
        >
          Navigate →
        </a>
      )}
    </div>
  );
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  // lower score = better, so filled bars = inverted
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
