import { Polyline, CircleMarker, Tooltip } from "react-leaflet";
import type { RecommendationResult } from "../types/parking";
import { scoreToColor, scoreToLabel, scoreToOpacity, rankLabel } from "../utils/colors";

interface SegmentLayerProps {
  results: RecommendationResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function SegmentLayer({ results, selectedId, onSelect }: SegmentLayerProps) {
  return (
    <>
      {results.map((result, index) => {
        const color = scoreToColor(result.score);
        const opacity = scoreToOpacity(result.score);
        const isSelected = result.segment_id === selectedId;

        // Render full polyline if backend provides it, otherwise fall back to a marker
        if (result.polyline && result.polyline.length >= 2) {
          const positions = result.polyline.map(
            ({ lat, lng }) => [lat, lng] as [number, number]
          );
          return (
            <Polyline
              key={result.segment_id}
              positions={positions}
              pathOptions={{ color, opacity, weight: isSelected ? 8 : 5 }}
              eventHandlers={{ click: () => onSelect(result.segment_id) }}
            >
              <SegmentTooltip result={result} rank={index} />
            </Polyline>
          );
        }

        if (result.center) {
          return (
            <CircleMarker
              key={result.segment_id}
              center={[result.center.lat, result.center.lng]}
              radius={isSelected ? 12 : 8}
              pathOptions={{ color, fillColor: color, fillOpacity: opacity, weight: 2 }}
              eventHandlers={{ click: () => onSelect(result.segment_id) }}
            >
              <SegmentTooltip result={result} rank={index} />
            </CircleMarker>
          );
        }

        // No geometry in response yet — ask backend partner to add center + polyline
        return null;
      })}
    </>
  );
}

function SegmentTooltip({ result, rank }: { result: RecommendationResult; rank: number }) {
  return (
    <Tooltip sticky>
      <strong>{result.street_name}</strong>
      <br />
      {rankLabel(rank)} · {scoreToLabel(result.score)}
      <br />
      {result.pricing} · ~{result.walk_minutes} min walk
    </Tooltip>
  );
}
