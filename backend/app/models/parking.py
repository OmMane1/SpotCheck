from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class LatLng(BaseModel):
    lat: float
    lng: float


class TimeWindow(BaseModel):
    days: list[str]
    start: str
    end: str
    parking_allowed: bool
    permit_required: bool = False


class NoParkingWindow(BaseModel):
    days: list[str]
    start: str
    end: str
    reason: str


class SpecialRule(BaseModel):
    type: str
    description: str


class NearbyDemand(BaseModel):
    traffic_level: float = Field(ge=0, le=1)
    poi_level: float = Field(ge=0, le=1)
    notes: str


class SourceNote(BaseModel):
    source: str
    kind: str
    detail: str


class SegmentRules(BaseModel):
    max_duration_minutes: int
    metered: bool
    meter_rate_usd_per_hour: float
    time_windows: list[TimeWindow]
    no_parking_windows: list[NoParkingWindow]
    special_rules: list[SpecialRule]


class ParkingSegment(BaseModel):
    id: str
    street_name: str
    from_street: str
    to_street: str
    center: LatLng
    polyline: list[LatLng] = Field(default_factory=list)
    side: Literal["left", "right", "both"]
    parking_type: Literal["metered", "free", "permit", "mixed"]
    base_score_modifier: float = 0.0
    rules: SegmentRules
    nearby_demand: NearbyDemand
    source_notes: list[SourceNote] = Field(default_factory=list)
    last_verified_at: datetime | None = None


class SegmentCollection(BaseModel):
    neighborhood: str
    generated_at: datetime
    segments: list[ParkingSegment]


class ParkingRecommendationRequest(BaseModel):
    destination: LatLng
    arrival_time: datetime
    duration_minutes: int = Field(gt=0, le=240)
    has_resident_permit: bool = False


class RecommendationResult(BaseModel):
    segment_id: str
    street_name: str
    from_street: str
    to_street: str
    distance_meters: float
    walk_minutes: int
    score: float
    why_good: list[str]
    risk_warnings: list[str]
    rule_summary: str
    pricing: str
    center: LatLng
    polyline: list[LatLng] = Field(default_factory=list)


class RecommendationsResponse(BaseModel):
    neighborhood: str
    evaluated_at: datetime
    results: list[RecommendationResult]
    message: str
    rejection_reasons: list[str] = []  # populated when results is empty
