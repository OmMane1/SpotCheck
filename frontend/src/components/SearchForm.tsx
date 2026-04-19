import { useState } from "react";
import type { RecommendationRequest, PresetDestination } from "../types/parking";

const DESTINATIONS: PresetDestination[] = [
  { label: "Fenway Park", coords: { lat: 42.3467, lng: -71.0972 } },
  { label: "Kenmore Square", coords: { lat: 42.3484, lng: -71.0944 } },
  { label: "Lansdowne Street", coords: { lat: 42.3463, lng: -71.0990 } },
  { label: "Yawkey Way", coords: { lat: 42.3462, lng: -71.0977 } },
  { label: "Boylston St & Fenway", coords: { lat: 42.3458, lng: -71.0982 } },
  { label: "Park Drive", coords: { lat: 42.3440, lng: -71.0944 } },
];

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatTimeSummary(isoLocal: string): string {
  const d = new Date(isoLocal);
  return d.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

interface SearchFormProps {
  onSearch: (request: RecommendationRequest, destinationLabel: string) => void;
  loading: boolean;
  collapsed: boolean;
  onExpand: () => void;
}

export default function SearchForm({ onSearch, loading, collapsed, onExpand }: SearchFormProps) {
  const [destinationIndex, setDestinationIndex] = useState(0);
  const [arrivalTime, setArrivalTime] = useState(toLocalDatetimeValue(new Date()));
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [hasPermit, setHasPermit] = useState(false);

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    onSearch(
      {
        destination: DESTINATIONS[destinationIndex].coords,
        arrival_time: new Date(arrivalTime).toISOString(),
        duration_minutes: durationMinutes,
        has_resident_permit: hasPermit,
      },
      DESTINATIONS[destinationIndex].label
    );
  }

  if (collapsed) {
    return (
      <div className="search-summary" onClick={onExpand} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onExpand()}>
        <div className="search-summary-content">
          <span className="search-summary-dest">📍 {DESTINATIONS[destinationIndex].label}</span>
          <span className="search-summary-details">
            {formatTimeSummary(arrivalTime)} · {formatDuration(durationMinutes)}
            {hasPermit ? " · Permit" : ""}
          </span>
        </div>
        <span className="search-summary-edit">Edit ✎</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="search-form">
      <h1 className="app-title">SpotCheck</h1>
      <p className="app-subtitle">Find legal parking in Fenway — avoid the ticket.</p>

      <label className="field-label">
        Destination
        <select
          value={destinationIndex}
          onChange={(e) => setDestinationIndex(Number(e.target.value))}
          className="field-input"
        >
          {DESTINATIONS.map((d, i) => (
            <option key={d.label} value={i}>{d.label}</option>
          ))}
        </select>
      </label>

      <label className="field-label">
        Arrival Time
        <input
          type="datetime-local"
          value={arrivalTime}
          onChange={(e) => setArrivalTime(e.target.value)}
          className="field-input"
          required
        />
      </label>

      <label className="field-label">
        Duration: <strong>{formatDuration(durationMinutes)}</strong>
        <input
          type="range"
          min={15}
          max={240}
          step={15}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
          className="field-range"
        />
      </label>

      <label className="field-label checkbox-label">
        <input
          type="checkbox"
          checked={hasPermit}
          onChange={(e) => setHasPermit(e.target.checked)}
        />
        I have a resident permit
      </label>

      <button type="submit" className="search-btn" disabled={loading}>
        {loading ? "Searching…" : "Find Parking"}
      </button>
    </form>
  );
}
