import L from "leaflet";
import { Marker, Popup } from "react-leaflet";
import type { RecommendationResult } from "../types/parking";
import { scoreToColor, scoreToLabel, rankLabel } from "../utils/colors";

interface SegmentLayerProps {
  results: RecommendationResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function createPinIcon(rank: number, color: string, isSelected: boolean) {
  const size = isSelected ? 42 : 34;
  const fontSize = isSelected ? 16 : 13;
  const shadow = isSelected
    ? "0 4px 14px rgba(0,0,0,0.55)"
    : "0 2px 8px rgba(0,0,0,0.38)";
  const border = isSelected ? "3px solid white" : "2px solid white";

  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;
      height:${size}px;
      background:${color};
      border:${border};
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:${fontSize}px;
      font-weight:800;
      color:#fff;
      font-family:system-ui,sans-serif;
      box-shadow:${shadow};
      cursor:pointer;
    ">${rank + 1}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h (${minutes} min)`;
  return `${h}h ${m}m (${minutes} min)`;
}

export default function SegmentLayer({ results, selectedId, onSelect }: SegmentLayerProps) {
  return (
    <>
      {results.map((result, index) => {
        if (!result.center) return null;

        const color = scoreToColor(result.score);
        const isSelected = result.segment_id === selectedId;
        const icon = createPinIcon(index, color, isSelected);

        return (
          <Marker
            key={result.segment_id}
            position={[result.center.lat, result.center.lng]}
            icon={icon}
            eventHandlers={{ click: () => onSelect(result.segment_id) }}
            zIndexOffset={isSelected ? 1000 : index * -1}
          >
            <Popup className="pin-popup" closeButton={false} offset={[0, -20]}>
              <div className="pin-popup-inner">
                <div className="pin-popup-header">
                  <span className="pin-popup-rank" style={{ color }}>
                    {rankLabel(index)}
                  </span>
                  <span className="pin-popup-label" style={{ background: color }}>
                    {scoreToLabel(result.score)}
                  </span>
                </div>
                <p className="pin-popup-street">{result.street_name}</p>
                <p className="pin-popup-cross">{result.from_street} → {result.to_street}</p>
                <div className="pin-popup-meta">
                  <span>🚶 ~{result.walk_minutes} min</span>
                  <span>💰 {result.pricing}</span>
                  <span>⏱ {formatDuration(result.max_duration_minutes)}</span>
                </div>
                <p className="pin-popup-hint">← See full details in the sidebar</p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
