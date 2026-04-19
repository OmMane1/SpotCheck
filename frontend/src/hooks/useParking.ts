import { useState, useCallback } from "react";
import { getRecommendations } from "../utils/api";
import type { RecommendationRequest, RecommendationsResponse } from "../types/parking";

interface ParkingState {
  results: RecommendationsResponse | null;
  loading: boolean;
  error: string | null;
}

export function useParking() {
  const [state, setState] = useState<ParkingState>({
    results: null,
    loading: false,
    error: null,
  });

  const search = useCallback(async (request: RecommendationRequest) => {
    setState({ results: null, loading: true, error: null });
    try {
      const data = await getRecommendations(request);
      setState({ results: data, loading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed";
      setState({ results: null, loading: false, error: message });
    }
  }, []);

  return {
    results: state.results,
    loading: state.loading,
    error: state.error,
    search,
  };
}
