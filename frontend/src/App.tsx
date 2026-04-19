import { useState } from "react";
import SearchForm from "./components/SearchForm";
import Map from "./components/Map";
import RuleCard from "./components/RuleCard";
import { useParking } from "./hooks/useParking";
import type { RecommendationRequest } from "./types/parking";

export default function App() {
  const { results, loading, error, search } = useParking();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function handleSearch(request: RecommendationRequest) {
    setSelectedId(null);
    search(request);
  }

  function handleSegmentSelect(id: string) {
    setSelectedId(id);
  }

  function handleCloseCard() {
    setSelectedId(null);
  }

  const selectedResult = results?.results.find((r) => r.segment_id === selectedId) ?? null;
  const selectedRank = selectedResult
    ? results!.results.indexOf(selectedResult)
    : 0;

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <SearchForm onSearch={handleSearch} loading={loading} />

        {error && (
          <div className="error-banner">
            Could not reach the server. Is the backend running on port 8000?
          </div>
        )}

        {selectedResult ? (
          <RuleCard
            result={selectedResult}
            rank={selectedRank}
            onClose={handleCloseCard}
          />
        ) : results ? (
          <div className="results-hint">
            {results.results.length > 0 ? (
              <>
                <p>
                  <strong>{results.results.length}</strong> legal option
                  {results.results.length !== 1 ? "s" : ""} found in{" "}
                  <strong>{results.neighborhood}</strong>.
                </p>
                <p className="muted">Click a segment on the map for details.</p>
              </>
            ) : (
              <p className="muted">{results.message}</p>
            )}
          </div>
        ) : null}
      </aside>

      <main className="map-container">
        {loading && <div className="loading-overlay">Searching…</div>}
        <Map
          results={results?.results ?? []}
          selectedId={selectedId}
          onSegmentSelect={handleSegmentSelect}
        />
      </main>
    </div>
  );
}
