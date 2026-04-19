import { useState } from "react";
import type { SearchQuery } from "../types/parking";

// Preset destinations so we don't depend on a live geocoding API
const DESTINATIONS = [
  "Fenway Park",
  "Kenmore Square",
  "Lansdowne Street",
  "Yawkey Way",
  "Boylston Street (Fenway)",
  "Park Drive",
];

const PERMIT_ZONES = ["1A", "1B", "E4", "E5", "E18"];

interface SearchFormProps {
  onSearch: (query: SearchQuery) => void;
  loading: boolean;
}

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export default function SearchForm({ onSearch, loading }: SearchFormProps) {
  const [destination, setDestination] = useState(DESTINATIONS[0]);
  const [arrivalTime, setArrivalTime] = useState(toLocalDatetimeValue(new Date()));
  const [durationHours, setDurationHours] = useState(2);
  const [hasPermit, setHasPermit] = useState(false);
  const [permitZone, setPermitZone] = useState<string | null>(null);

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    onSearch({
      destination,
      arrival_time: new Date(arrivalTime).toISOString(),
      duration_hours: durationHours,
      has_permit: hasPermit,
      permit_zone: hasPermit ? permitZone : null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="search-form">
      <h1 className="app-title">SpotCheck</h1>
      <p className="app-subtitle">Find legal parking in Fenway — avoid the ticket.</p>

      <label className="field-label">
        Destination
        <select
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          className="field-input"
        >
          {DESTINATIONS.map((d) => (
            <option key={d} value={d}>{d}</option>
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
        Duration: <strong>{durationHours}h</strong>
        <input
          type="range"
          min={0.5}
          max={8}
          step={0.5}
          value={durationHours}
          onChange={(e) => setDurationHours(Number(e.target.value))}
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

      {hasPermit && (
        <label className="field-label">
          Permit Zone
          <select
            value={permitZone ?? ""}
            onChange={(e) => setPermitZone(e.target.value || null)}
            className="field-input"
          >
            <option value="">Select zone…</option>
            {PERMIT_ZONES.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </label>
      )}

      <button type="submit" className="search-btn" disabled={loading}>
        {loading ? "Searching…" : "Find Parking"}
      </button>
    </form>
  );
}
