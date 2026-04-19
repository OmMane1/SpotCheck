import { useState } from "react";
import SearchForm from "./components/SearchForm";
import Map from "./components/Map";
import RuleCard from "./components/RuleCard";
import ResultsList from "./components/ResultsList";
import { useParking } from "./hooks/useParking";
import type { RecommendationRequest, LatLng } from "./types/parking";

export default function App() {
  const { results, loading, error, search } = useParking();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formCollapsed, setFormCollapsed] = useState(false);
  const [destination, setDestination] = useState<LatLng | null>(null);

  function handleSearch(request: RecommendationRequest) {
    setSelectedId(null);
    setFormCollapsed(true);
    setDestination(request.destination);
    search(request);
  }

  function handleSegmentSelect(id: string) {
    setSelectedId(id);
  }

  function handleBack() {
    setSelectedId(null);
  }

  function handleClose() {
    setSelectedId(null);
    setFormCollapsed(false);
  }

  const selectedResult = results?.results.find((r) => r.segment_id === selectedId) ?? null;
  const selectedRank = selectedResult ? results!.results.indexOf(selectedResult) : 0;

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

        {loading && (
          <div className="sidebar-loading">Searching Fenway…</div>
        )}

        {!loading && selectedResult ? (
          <RuleCard
            result={selectedResult}
            rank={selectedRank}
            onBack={handleBack}
            onClose={handleClose}
          />
        ) : !loading && results ? (
          <ResultsList
            results={results.results}
            rejectionReasons={results.rejection_reasons}
            selectedId={selectedId}
            onSelect={handleSegmentSelect}
          />
        ) : null}
      </aside>

      <main className="map-container">
        <Map
          results={results?.results ?? []}
          selectedId={selectedId}
          selectedResult={selectedResult}
          destination={destination}
          onSegmentSelect={handleSegmentSelect}
        />
      </main>
    </div>
  );
}
