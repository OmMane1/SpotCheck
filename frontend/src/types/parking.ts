export interface LatLng {
  lat: number;
  lng: number;
}

export interface RecommendationRequest {
  destination: LatLng;
  arrival_time: string; // ISO 8601
  duration_minutes: number; // 1–240
  has_resident_permit: boolean;
}

// Backend returns only legal results — no is_legal field needed
// score: lower is better (0 = closest + safest, ~1 = far + risky)
export interface RecommendationResult {
  segment_id: string;
  street_name: string;
  from_street: string;
  to_street: string;
  distance_meters: number;
  walk_minutes: number;
  score: number;
  why_good: string[];
  risk_warnings: string[];
  rule_summary: string;
  pricing: string;
  max_duration_minutes: number;
  permit_required: boolean;
  center?: LatLng;
  polyline?: LatLng[];
}

export interface RecommendationsResponse {
  neighborhood: string;
  evaluated_at: string;
  results: RecommendationResult[]; // sorted ascending by score (index 0 = best)
  message: string;
  rejection_reasons: string[]; // populated when results is empty
}

// Preset destinations for SearchForm (avoids live geocoding dependency)
export interface PresetDestination {
  label: string;
  coords: LatLng;
}
