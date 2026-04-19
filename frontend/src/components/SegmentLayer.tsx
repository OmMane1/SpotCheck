import { Polyline, Tooltip } from "react-leaflet";
import type { SegmentResult } from "../types/parking";
import { scoreToColor, scoreToLabel, scoreToOpacity } from "../utils/colors";

interface SegmentLayerProps {
  segments: SegmentResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function SegmentLayer({ segments, selectedId, onSelect }: SegmentLayerProps) {
  return (
    <>
      {segments.map((seg) => {
        // GeoJSON is [lon, lat]; Leaflet expects [lat, lon]
        const positions = seg.geometry.coordinates.map(
          ([lon, lat]) => [lat, lon] as [number, number]
        );

        const color = scoreToColor(seg.availability_score, seg.is_legal);
        const opacity = scoreToOpacity(seg.availability_score, seg.is_legal);
        const isSelected = seg.id === selectedId;

        return (
          <Polyline
            key={seg.id}
            positions={positions}
            pathOptions={{
              color,
              opacity,
              weight: isSelected ? 8 : 5,
              dashArray: seg.is_legal ? undefined : "6 4",
            }}
            eventHandlers={{ click: () => onSelect(seg.id) }}
          >
            <Tooltip sticky>
              <strong>{seg.street_name}</strong>
              <br />
              {scoreToLabel(seg.availability_score, seg.is_legal)}
              {seg.is_legal && ` · Score ${Math.round(seg.availability_score * 100)}%`}
            </Tooltip>
          </Polyline>
        );
      })}
    </>
  );
}
