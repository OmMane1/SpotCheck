from __future__ import annotations

import json
from pathlib import Path

from app.core.ranking import calculate_distance_meters, calculate_score, estimate_walk_minutes
from app.core.rules import evaluate_segment
from app.models.parking import (
    ParkingRecommendationRequest,
    RecommendationResult,
    RecommendationsResponse,
    SegmentCollection,
)


class ParkingRecommendationService:
    def __init__(self, dataset_path: Path | None = None) -> None:
        default_path = Path(__file__).resolve().parent.parent / "data" / "fenway_segments.json"
        self.dataset_path = dataset_path or default_path
        self.collection = self._load_collection()

    def get_recommendations(
        self, request: ParkingRecommendationRequest
    ) -> RecommendationsResponse:
        results: list[RecommendationResult] = []

        for segment in self.collection.segments:
            evaluation = evaluate_segment(segment, request)
            if not evaluation.is_legal:
                continue

            distance_meters = calculate_distance_meters(
                request.destination.lat,
                request.destination.lng,
                segment.center.lat,
                segment.center.lng,
            )
            walk_minutes = estimate_walk_minutes(distance_meters)
            score = calculate_score(segment, distance_meters, evaluation.risk_score)

            results.append(
                RecommendationResult(
                    segment_id=segment.id,
                    street_name=segment.street_name,
                    from_street=segment.from_street,
                    to_street=segment.to_street,
                    distance_meters=round(distance_meters, 1),
                    walk_minutes=walk_minutes,
                    score=score,
                    why_good=evaluation.why_good,
                    risk_warnings=evaluation.risk_warnings,
                    rule_summary=evaluation.rule_summary,
                    pricing=evaluation.pricing,
                )
            )

        results.sort(key=lambda item: item.score)
        top_results = results[:5]
        message = (
            "Found legal parking options near your destination."
            if top_results
            else "No legal parking options found for that time and duration."
        )

        return RecommendationsResponse(
            neighborhood=self.collection.neighborhood,
            evaluated_at=request.arrival_time,
            results=top_results,
            message=message,
        )

    def _load_collection(self) -> SegmentCollection:
        with self.dataset_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return SegmentCollection.model_validate(payload)
