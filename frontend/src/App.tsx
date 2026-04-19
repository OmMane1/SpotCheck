import { useState } from "react";
import SearchForm from "./components/SearchForm";
import Map from "./components/Map";
import RuleCard from "./components/RuleCard";
import { useParking } from "./hooks/useParking";
import type { SearchQuery } from "./types/parking";

export default function App() {
  const {
    results,
    searchLoading,
    searchError,
    detail,
    detailLoading,
    search,
    fetchDetail,
    clearDetail,
  } = useParking();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  function handleSearch(query: SearchQuery) {
    setSelectedId(null);
    clearDetail();
    search(query);
  }

  function handleSegmentSelect(id: string) {
    setSelectedId(id);
    fetchDetail(id);
  }

  function handleCloseCard() {
    setSelectedId(null);
    clearDetail();
  }

  const selectedSegment = results?.segments.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <SearchForm onSearch={handleSearch} loading={searchLoading} />

        {searchError && (
          <div className="error-banner">
            Could not reach the server. Check the backend is running.
          </div>
        )}

        {selectedSegment && (
          <RuleCard
            segment={selectedSegment}
            detail={detail}
            detailLoading={detailLoading}
            onClose={handleCloseCard}
          />
        )}

        {!selectedSegment && results && (
          <div className="results-hint">
            <p>
              Found <strong>{results.meta.legal_count}</strong> legal spots out of{" "}
              <strong>{results.meta.total_segments}</strong> segments.
            </p>
            <p className="muted">Click any segment on the map for details.</p>
          </div>
        )}
      </aside>

      <main className="map-container">
        {searchLoading && <div className="loading-overlay">Searching…</div>}
        <Map
          segments={results?.segments ?? []}
          meta={results?.meta ?? null}
          selectedId={selectedId}
          onSegmentSelect={handleSegmentSelect}
        />
      </main>
    </div>
  );
}
