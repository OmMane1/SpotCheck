export type RestrictionType = "no_parking" | "meter" | "permit_only" | "time_limit";

export type NeighborhoodName = "Fenway";

export interface TimeRestriction {
  days: string[];
  start_time: string;
  end_time: string;
  restriction_type: RestrictionType;
  permit_zone: string | null;
  rate_per_hour: number | null;
  max_duration_hours: number | null;
}

export interface StreetCleaning {
  days: string[];
  start_time: string;
  end_time: string;
  side: "north" | "south" | "both";
}

export interface GeoLine {
  type: "LineString";
  coordinates: [number, number][]; // [lon, lat]
}

export interface ScoreBreakdown {
  distance_penalty: number;
  safety_margin_penalty: number;
  cost_penalty: number;
  pressure_penalty: number;
}

export interface SegmentResult {
  id: string;
  street_name: string;
  neighborhood: NeighborhoodName;
  geometry: GeoLine;
  is_legal: boolean;
  legality_reasons: string[];
  availability_score: number; // 0.0–1.0
  score_breakdown: ScoreBreakdown;
  distance_meters: number;
  meter_rate: number | null;
  max_duration_hours: number | null;
  recommended_action: string;
  restrictions_summary: string[];
}

export interface SearchQuery {
  destination: string;
  arrival_time: string; // ISO 8601
  duration_hours: number;
  has_permit: boolean;
  permit_zone: string | null;
}

export interface SearchMeta {
  total_segments: number;
  legal_count: number;
  searched_at: string;
  destination_coords: [number, number]; // [lon, lat]
}

export interface SearchResponse {
  segments: SegmentResult[];
  meta: SearchMeta;
}

export interface SegmentDetail {
  id: string;
  street_name: string;
  neighborhood: NeighborhoodName;
  geometry: GeoLine;
  restrictions: TimeRestriction[];
  street_cleaning: StreetCleaning | null;
  warnings: string[];
  human_readable_rules: string[];
}
