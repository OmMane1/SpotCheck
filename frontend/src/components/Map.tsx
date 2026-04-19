import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import SegmentLayer from "./SegmentLayer";
import type { RecommendationResult } from "../types/parking";

const FENWAY_CENTER: [number, number] = [42.3467, -71.0972];
const DEFAULT_ZOOM = 15;

interface MapProps {
  results: RecommendationResult[];
  selectedId: string | null;
  onSegmentSelect: (id: string) => void;
}

export default function Map({ results, selectedId, onSegmentSelect }: MapProps) {
  return (
    <div className="map-wrapper">
      <MapContainer
        center={FENWAY_CENTER}
        zoom={DEFAULT_ZOOM}
        className="leaflet-map"
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <SegmentLayer
          results={results}
          selectedId={selectedId}
          onSelect={onSegmentSelect}
        />
      </MapContainer>

      <Legend />
    </div>
  );
}

function Legend() {
  const items = [
    { color: "#22c55e", label: "Best Match (score ≤ 0.35)" },
    { color: "#f59e0b", label: "Good Option (score ≤ 0.60)" },
    { color: "#ef4444", label: "Fair Option" },
  ];

  return (
    <div className="map-legend">
      {items.map(({ color, label }) => (
        <div key={label} className="legend-item">
          <svg width="28" height="6">
            <line x1="0" y1="3" x2="28" y2="3" stroke={color} strokeWidth="4" />
          </svg>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
