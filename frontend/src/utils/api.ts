import type { RecommendationRequest, RecommendationsResponse } from "../types/parking";

// Empty string = same origin (correct for Vercel). Set VITE_API_BASE_URL=http://localhost:8000 in .env for local dev.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

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
