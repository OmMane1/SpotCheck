import L from "leaflet";
import { Marker, Tooltip } from "react-leaflet";
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
      transition:transform 0.1s;
    ">${rank + 1}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
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
            <Tooltip direction="top" offset={[0, -20]}>
              <strong>{result.street_name}</strong>
              <br />
              {rankLabel(index)} · {scoreToLabel(result.score)}
              <br />
              {result.pricing} · ~{result.walk_minutes} min walk
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
