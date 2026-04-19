from __future__ import annotations

from pathlib import Path

from app.core.ranking import calculate_distance_meters, calculate_score, estimate_walk_minutes
from app.core.rules import evaluate_segment
from app.data_access.repository import ParkingDataRepository
from app.models.parking import (
    ParkingRecommendationRequest,
    RecommendationResult,
    RecommendationsResponse,
)


class ParkingRecommendationService:
    def __init__(
        self,
        dataset_path: Path | None = None,
        enrichments_dir: Path | None = None,
    ) -> None:
        self.repository = ParkingDataRepository(
            dataset_path=dataset_path,
            enrichments_dir=enrichments_dir,
        )
        self.collection = self.repository.load_collection()

    def get_recommendations(
        self, request: ParkingRecommendationRequest
    ) -> RecommendationsResponse:
        results: list[RecommendationResult] = []
        rejection_reasons: list[str] = []

        for segment in self.collection.segments:
            evaluation = evaluate_segment(segment, request)
            if not evaluation.is_legal:
                for reason in evaluation.risk_warnings:
                    if reason not in rejection_reasons:
                        rejection_reasons.append(reason)
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
                    center=segment.center,
                    polyline=segment.polyline,
                )
            )

        results.sort(key=lambda item: item.score)
        top_results = results[:5]
        message = (
            "Found legal parking options near your destination."
            if top_results
            else "No legal parking found for this time and duration."
        )

        return RecommendationsResponse(
            neighborhood=self.collection.neighborhood,
            evaluated_at=request.arrival_time,
            results=top_results,
            message=message,
            rejection_reasons=rejection_reasons if not top_results else [],
        )
