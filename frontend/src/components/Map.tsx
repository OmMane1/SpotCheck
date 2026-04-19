import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import SegmentLayer from "./SegmentLayer";
import type { SegmentResult, SearchMeta } from "../types/parking";

const FENWAY_CENTER: [number, number] = [42.3467, -71.0972];
const DEFAULT_ZOOM = 15;

interface MapProps {
  segments: SegmentResult[];
  meta: SearchMeta | null;
  selectedId: string | null;
  onSegmentSelect: (id: string) => void;
}

// Recenter map when search returns a new destination
function MapController({ meta }: { meta: SearchMeta | null }) {
  const map = useMap();
  if (meta) {
    const [lon, lat] = meta.destination_coords;
    map.setView([lat, lon], DEFAULT_ZOOM, { animate: true });
  }
  return null;
}

export default function Map({ segments, meta, selectedId, onSegmentSelect }: MapProps) {
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
        <MapController meta={meta} />
        <SegmentLayer
          segments={segments}
          selectedId={selectedId}
          onSelect={onSegmentSelect}
        />
      </MapContainer>

      <Legend />

      {meta && (
        <div className="map-summary">
          {meta.legal_count} legal of {meta.total_segments} segments
        </div>
      )}
    </div>
  );
}

function Legend() {
  const items = [
    { color: "#22c55e", label: "Likely Available" },
    { color: "#f59e0b", label: "Maybe Available" },
    { color: "#ef4444", label: "Low Confidence" },
    { color: "#dc2626", label: "Illegal / Restricted", dashed: true },
  ];

  return (
    <div className="map-legend">
      {items.map(({ color, label, dashed }) => (
        <div key={label} className="legend-item">
          <svg width="28" height="6">
            <line
              x1="0" y1="3" x2="28" y2="3"
              stroke={color}
              strokeWidth="4"
              strokeDasharray={dashed ? "5 3" : undefined}
            />
          </svg>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
