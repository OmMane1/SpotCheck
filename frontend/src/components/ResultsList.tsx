import type { RecommendationResult } from "../types/parking";
import { scoreToColor, scoreToLabel, rankLabel } from "../utils/colors";

interface ResultsListProps {
  results: RecommendationResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function ResultsList({ results, selectedId, onSelect }: ResultsListProps) {
  if (results.length === 0) {
    return (
      <div className="results-empty">
        <p>No legal parking found for this time and duration.</p>
        <p className="muted">Try adjusting your arrival time or duration.</p>
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
  onClick: () => void;
}

function ResultCard({ result, rank, isSelected, onClick }: ResultCardProps) {
  const color = scoreToColor(result.score);
  const label = scoreToLabel(result.score);

  return (
    <button
      className={`result-card ${isSelected ? "result-card--selected" : ""}`}
      onClick={onClick}
      style={{ borderLeftColor: color }}
    >
      <div className="result-card-top">
        <div className="result-card-rank" style={{ color }}>
          {rankLabel(rank)}
        </div>
        <ScoreBar score={result.score} color={color} />
        <span className="result-card-label" style={{ color }}>
          {label}
        </span>
      </div>

      <div className="result-card-street">{result.street_name}</div>
      <div className="result-card-cross">{result.from_street} → {result.to_street}</div>

      <div className="result-card-meta">
        <span>🚶 {result.walk_minutes} min</span>
        <span>💰 {result.pricing}</span>
        {result.risk_warnings.length > 0 && (
          <span className="result-card-warning-badge">⚠ {result.risk_warnings.length}</span>
        )}
      </div>
    </button>
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
