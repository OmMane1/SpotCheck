import type { SegmentResult, SegmentDetail } from "../types/parking";
import { scoreToColor, scoreToLabel } from "../utils/colors";

interface RuleCardProps {
  segment: SegmentResult;
  detail: SegmentDetail | null;
  detailLoading: boolean;
  onClose: () => void;
}

export default function RuleCard({ segment, detail, detailLoading, onClose }: RuleCardProps) {
  const color = scoreToColor(segment.availability_score, segment.is_legal);
  const label = scoreToLabel(segment.availability_score, segment.is_legal);

  return (
    <div className="rule-card">
      <div className="rule-card-header" style={{ borderLeftColor: color }}>
        <div>
          <h2 className="rule-card-street">{segment.street_name}</h2>
          <span className="rule-card-badge" style={{ backgroundColor: color }}>
            {label}
          </span>
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {!segment.is_legal && segment.legality_reasons.length > 0 && (
        <div className="rule-card-section rule-card-illegal">
          <h3>Why it's illegal right now</h3>
          <ul>
            {segment.legality_reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {segment.is_legal && (
        <div className="rule-card-section">
          <div className="rule-card-meta">
            <MetaItem label="Walk" value={formatDistance(segment.distance_meters)} />
            {segment.meter_rate !== null && (
              <MetaItem label="Rate" value={`$${segment.meter_rate.toFixed(2)}/hr`} />
            )}
            {segment.max_duration_hours !== null && (
              <MetaItem label="Max stay" value={`${segment.max_duration_hours}h`} />
            )}
          </div>
          <p className="rule-card-recommendation">{segment.recommended_action}</p>
        </div>
      )}

      <div className="rule-card-section">
        <h3>Restrictions</h3>
        {detailLoading ? (
          <p className="muted">Loading details…</p>
        ) : detail ? (
          <ul className="rule-list">
            {detail.human_readable_rules.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ul>
        ) : (
          <ul className="rule-list">
            {segment.restrictions_summary.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      {detail?.warnings && detail.warnings.length > 0 && (
        <div className="rule-card-section rule-card-warning">
          <h3>Warnings</h3>
          <ul>
            {detail.warnings.map((w, i) => (
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

function formatDistance(meters: number): string {
  if (meters < 100) return "< 1 min walk";
  const mins = Math.round(meters / 80); // ~80m/min walking pace
  return `~${mins} min walk`;
}
