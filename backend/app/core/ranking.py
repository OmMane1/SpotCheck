from __future__ import annotations

import math

from app.models.parking import ParkingSegment


def calculate_distance_meters(
    origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float
) -> float:
    radius_meters = 6_371_000
    lat1 = math.radians(origin_lat)
    lat2 = math.radians(dest_lat)
    d_lat = math.radians(dest_lat - origin_lat)
    d_lng = math.radians(dest_lng - origin_lng)

    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(d_lng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_meters * c


def estimate_walk_minutes(distance_meters: float) -> int:
    return max(1, round(distance_meters / 80))


def calculate_score(
    segment: ParkingSegment, distance_meters: float, risk_score: float
) -> float:
    # Use a tighter distance normalization so nearby Fenway searches
    # respond more noticeably to small destination changes.
    distance_component = min(distance_meters / 300, 1.0)
    demand_component = (
        segment.nearby_demand.traffic_level + segment.nearby_demand.poi_level
    ) / 2
    score = (
        0.65 * distance_component
        + 0.2 * risk_score
        + 0.15 * demand_component
        + segment.base_score_modifier
    )
    return round(score, 3)
