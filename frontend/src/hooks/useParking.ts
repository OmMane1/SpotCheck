import { useState, useCallback } from "react";
import { searchParking, getSegmentDetail } from "../utils/api";
import type { SearchQuery, SearchResponse, SegmentDetail } from "../types/parking";

interface ParkingSearchState {
  results: SearchResponse | null;
  loading: boolean;
  error: string | null;
}

interface SegmentDetailState {
  detail: SegmentDetail | null;
  loading: boolean;
  error: string | null;
}

export function useParking() {
  const [searchState, setSearchState] = useState<ParkingSearchState>({
    results: null,
    loading: false,
    error: null,
  });

  const [detailState, setDetailState] = useState<SegmentDetailState>({
    detail: null,
    loading: false,
    error: null,
  });

  const search = useCallback(async (query: SearchQuery) => {
    setSearchState({ results: null, loading: true, error: null });
    try {
      const data = await searchParking(query);
      setSearchState({ results: data, loading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed";
      setSearchState({ results: null, loading: false, error: message });
    }
  }, []);

  const fetchDetail = useCallback(async (segmentId: string) => {
    setDetailState({ detail: null, loading: true, error: null });
    try {
      const data = await getSegmentDetail(segmentId);
      setDetailState({ detail: data, loading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load details";
      setDetailState({ detail: null, loading: false, error: message });
    }
  }, []);

  const clearDetail = useCallback(() => {
    setDetailState({ detail: null, loading: false, error: null });
  }, []);

  return {
    results: searchState.results,
    searchLoading: searchState.loading,
    searchError: searchState.error,
    detail: detailState.detail,
    detailLoading: detailState.loading,
    detailError: detailState.error,
    search,
    fetchDetail,
    clearDetail,
  };
}
