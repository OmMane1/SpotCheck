import { useState, useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import SegmentLayer from "./SegmentLayer";
import DrivingRoute from "./DrivingRoute";
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

const userLocationIcon = L.divIcon({
  className: "",
  html: `<div class="user-dot-outer"><div class="user-dot-inner"></div></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

interface MapProps {
  results: RecommendationResult[];
  selectedId: string | null;
  selectedResult: RecommendationResult | null;
  destination: LatLng | null;
  userLocation: LatLng | null;
  onLocate: (loc: LatLng) => void;
  onSegmentSelect: (id: string) => void;
}

function MapRecenter({ destination }: { destination: LatLng | null }) {
  const map = useMap();
  if (destination) {
    map.setView([destination.lat, destination.lng], DEFAULT_ZOOM, { animate: true });
  }
  return null;
}

function MapFlyTo({ result }: { result: RecommendationResult | null }) {
  const map = useMap();
  useEffect(() => {
    if (result?.center) {
      map.flyTo([result.center.lat, result.center.lng], 18, { duration: 0.4 });
    }
  }, [result?.segment_id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function Map({
  results,
  selectedId,
  selectedResult,
  destination,
  userLocation,
  onLocate,
  onSegmentSelect,
}: MapProps) {
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);

  function handleLocate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    setLocateError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onLocate({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setLocateError(true);
      },
      { timeout: 10000 }
    );
  }

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

        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon} />
        )}

        {userLocation && selectedResult?.center && (
          <DrivingRoute from={userLocation} to={selectedResult.center} />
        )}

        <SegmentLayer
          results={results}
          selectedId={selectedId}
          onSelect={onSegmentSelect}
        />
      </MapContainer>

      <button
        className={`locate-btn ${locating ? "locate-btn--loading" : ""} ${locateError ? "locate-btn--error" : ""}`}
        onClick={handleLocate}
        disabled={locating}
        title="Show driving route from your location"
      >
        {locating ? "Locating…" : locateError ? "Location denied" : "📍 Navigate to spot"}
      </button>

      <Legend showRoute={!!userLocation && !!selectedResult} />
    </div>
  );
}

function Legend({ showRoute }: { showRoute: boolean }) {
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
      {showRoute && (
        <div className="legend-item">
          <div style={{
            width: 20, height: 4, background: "#2563eb",
            borderRadius: 2, flexShrink: 0,
            backgroundImage: "repeating-linear-gradient(90deg, #2563eb 0 8px, transparent 8px 14px)",
          }} />
          <span>Driving route</span>
        </div>
      )}
    </div>
  );
}
