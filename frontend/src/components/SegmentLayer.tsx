import { CircleMarker, Tooltip } from "react-leaflet";
import type { RecommendationResult } from "../types/parking";
import { scoreToColor, scoreToLabel, rankLabel } from "../utils/colors";

interface SegmentLayerProps {
  results: RecommendationResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function SegmentLayer({ results, selectedId, onSelect }: SegmentLayerProps) {
  return (
    <>
      {results.map((result, index) => {
        if (!result.center) return null;

        const color = scoreToColor(result.score);
        const isSelected = result.segment_id === selectedId;

        return (
          <CircleMarker
            key={result.segment_id}
            center={[result.center.lat, result.center.lng]}
            radius={isSelected ? 18 : 13}
            pathOptions={{
              color: "#fff",
              weight: 2.5,
              fillColor: color,
              fillOpacity: isSelected ? 1 : 0.85,
            }}
            eventHandlers={{ click: () => onSelect(result.segment_id) }}
          >
            <Tooltip sticky>
              <strong>{result.street_name}</strong>
              <br />
              {rankLabel(index)} · {scoreToLabel(result.score)}
              <br />
              {result.pricing} · ~{result.walk_minutes} min walk
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}
