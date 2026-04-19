import { useState } from "react";
import SearchForm from "./components/SearchForm";
import Map from "./components/Map";
import RuleCard from "./components/RuleCard";
import ResultsList from "./components/ResultsList";
import ParkingFilterBar, { type ParkingFilter } from "./components/ParkingFilter";
import { useParking } from "./hooks/useParking";
import type { RecommendationRequest, LatLng, RecommendationResult } from "./types/parking";

function applyFilter(
  results: RecommendationResult[],
  filter: ParkingFilter
): RecommendationResult[] {
  if (filter === "free") return results.filter((r) => r.pricing === "Free");
  if (filter === "paid") return results.filter((r) => r.pricing !== "Free");
  return results;
}

export default function App() {
  const { results, loading, error, search } = useParking();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formCollapsed, setFormCollapsed] = useState(false);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [parkingFilter, setParkingFilter] = useState<ParkingFilter>("any");
  const [arrivalTime, setArrivalTime] = useState<string | null>(null);

  function handleSearch(request: RecommendationRequest) {
    setSelectedId(null);
    setFormCollapsed(true);
    setDestination(request.destination);
    setArrivalTime(request.arrival_time);
    search(request);
  }

  function handleFilterChange(f: ParkingFilter) {
    setParkingFilter(f);
    setSelectedId(null);
  }

  function handleBack() {
    setSelectedId(null);
  }

  function handleClose() {
    setSelectedId(null);
    setFormCollapsed(false);
  }

  const allResults = results?.results ?? [];
  const filteredResults = applyFilter(allResults, parkingFilter);
  const selectedResult =
    filteredResults.find((r) => r.segment_id === selectedId) ?? null;
  const selectedRank = selectedResult ? filteredResults.indexOf(selectedResult) : 0;

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <SearchForm
          onSearch={handleSearch}
          loading={loading}
          collapsed={formCollapsed}
          onExpand={() => setFormCollapsed(false)}
        />

        {error && (
          <div className="error-banner">
            Could not reach the server. Is the backend running on port 8000?
          </div>
        )}

        {loading && <div className="sidebar-loading">Searching Fenway...</div>}

        {!loading && results && (
          <ParkingFilterBar value={parkingFilter} onChange={handleFilterChange} />
        )}

        {!loading && selectedResult ? (
          <RuleCard
            result={selectedResult}
            rank={selectedRank}
            arrivalTime={arrivalTime}
            onBack={handleBack}
            onClose={handleClose}
          />
        ) : !loading && results ? (
          <ResultsList
            results={filteredResults}
            rejectionReasons={results.rejection_reasons}
            selectedId={selectedId}
            arrivalTime={arrivalTime}
            onSelect={setSelectedId}
          />
        ) : null}
      </aside>

      <main className="map-container">
        <Map
          results={filteredResults}
          selectedId={selectedId}
          selectedResult={selectedResult}
          destination={destination}
          onSegmentSelect={setSelectedId}
        />
      </main>
    </div>
  );
}
