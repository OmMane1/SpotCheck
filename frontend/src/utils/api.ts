import type {
  HealthResponse,
  RecommendationRequest,
  RecommendationsResponse,
} from "../types/parking";

// In local Vite dev, default to the backend on port 8000.
// In production/serverless, keep same-origin unless explicitly overridden.
const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export function getRecommendations(
  request: RecommendationRequest
): Promise<RecommendationsResponse> {
  return apiFetch<RecommendationsResponse>("/recommendations", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/health");
}
