import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import SegmentLayer from "./SegmentLayer";
import type { RecommendationResult, LatLng } from "../types/parking";

const FENWAY_CENTER: [number, number] = [42.3467, -71.0972];
const DEFAULT_ZOOM = 17;
const MIN_ZOOM = 16;
const MAX_ZOOM = 18;
const FENWAY_BOUNDS: [[number, number], [number, number]] = [
  [42.340, -71.106],
  [42.355, -71.085],
];

const destinationIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:16px;height:16px;
    background:#2563eb;
    border:3px solid white;
    border-radius:50%;
    box-shadow:0 2px 8px rgba(0,0,0,0.35)
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

interface MapProps {
  results: RecommendationResult[];
  selectedId: string | null;
  selectedResult: RecommendationResult | null;
  destination: LatLng | null;
  onSegmentSelect: (id: string) => void;
}

function MapRecenter({ destination }: { destination: LatLng | null }) {
  const map = useMap();
  if (destination) {
    map.setView([destination.lat, destination.lng], DEFAULT_ZOOM, { animate: true });
  }
  return null;
}

// Flies to a selected pin whenever selectedResult changes
function MapFlyTo({ result }: { result: RecommendationResult | null }) {
  const map = useMap();
  useEffect(() => {
    if (result?.center) {
      map.flyTo([result.center.lat, result.center.lng], 18, { duration: 0.4 });
    }
  }, [result?.segment_id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function Map({ results, selectedId, selectedResult, destination, onSegmentSelect }: MapProps) {
  return (
    <div className="map-wrapper">
      <MapContainer
        center={FENWAY_CENTER}
        zoom={DEFAULT_ZOOM}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        maxBounds={FENWAY_BOUNDS}
        maxBoundsViscosity={1.0}
        className="leaflet-map"
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        <MapRecenter destination={destination} />
        <MapFlyTo result={selectedResult} />

        {destination && (
          <Marker position={[destination.lat, destination.lng]} icon={destinationIcon} />
        )}

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
    { color: "#22c55e", label: "Best Match" },
    { color: "#f59e0b", label: "Good Option" },
    { color: "#ef4444", label: "Fair Option" },
  ];

  return (
    <div className="map-legend">
      {items.map(({ color, label }) => (
        <div key={label} className="legend-item">
          <div style={{
            width: 14, height: 14, background: color,
            border: "2px solid white", borderRadius: "50%",
            boxShadow: "0 1px 4px rgba(0,0,0,0.3)", flexShrink: 0,
          }} />
          <span>{label}</span>
        </div>
      ))}
      <div className="legend-item">
        <div style={{
          width: 14, height: 14, background: "#2563eb",
          border: "2px solid white", borderRadius: "50%",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)", flexShrink: 0,
        }} />
        <span>Your destination</span>
      </div>
    </div>
  );
}
