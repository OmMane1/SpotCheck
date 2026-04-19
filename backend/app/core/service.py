from __future__ import annotations

from pathlib import Path
from zoneinfo import ZoneInfo

from app.config import Settings, get_settings
from app.core.ranking import calculate_distance_meters, calculate_score, estimate_walk_minutes
from app.core.rules import evaluate_segment
from app.data_access.repository import ParkingDataRepository
from app.models.parking import (
    ParkingRecommendationRequest,
    RecommendationResult,
    RecommendationsResponse,
)

BOSTON_TZ = ZoneInfo("America/New_York")


class ParkingRecommendationService:
    def __init__(
        self,
        dataset_path: Path | None = None,
        enrichments_dir: Path | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.repository = ParkingDataRepository(
            dataset_path=dataset_path,
            enrichments_dir=enrichments_dir,
            settings=self.settings,
        )
        self.collection = self.repository.load_collection()

    def refresh_collection(self) -> None:
        self.collection = self.repository.load_collection()

    def get_recommendations(
        self, request: ParkingRecommendationRequest
    ) -> RecommendationsResponse:
        local_request = self._normalize_request_time(request)
        results: list[RecommendationResult] = []
        rejection_reasons: list[str] = []

        for segment in self.collection.segments:
            evaluation = evaluate_segment(segment, local_request)
            if not evaluation.is_legal:
                for reason in evaluation.risk_warnings:
                    if reason not in rejection_reasons:
                        rejection_reasons.append(reason)
                continue

            distance_meters = calculate_distance_meters(
                local_request.destination.lat,
                local_request.destination.lng,
                segment.center.lat,
                segment.center.lng,
            )
            walk_minutes = estimate_walk_minutes(distance_meters)
            score = calculate_score(segment, distance_meters, evaluation.risk_score)

            active_window = next(
                (w for w in segment.rules.time_windows if w.parking_allowed), None
            )
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
                    max_duration_minutes=segment.rules.max_duration_minutes,
                    permit_required=active_window.permit_required if active_window else False,
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
            evaluated_at=local_request.arrival_time,
            results=top_results,
            message=message,
            rejection_reasons=rejection_reasons if not top_results else [],
        )

    def health_snapshot(self) -> dict[str, object]:
        report = self.repository.last_refresh_report
        return {
            "status": "ok",
            "service": "fenway-parking-api",
            "data_refresh": {
                "enabled": report.refresh_enabled,
                "succeeded": report.refresh_succeeded,
                "used_fallback": report.used_fallback,
                "refreshed_at": report.refreshed_at,
                "sources_checked": report.sources_checked,
                "errors": report.errors,
            },
        }

    def _normalize_request_time(
        self, request: ParkingRecommendationRequest
    ) -> ParkingRecommendationRequest:
        arrival = request.arrival_time
        if arrival.tzinfo is None:
            local_arrival = arrival.replace(tzinfo=BOSTON_TZ)
        else:
            local_arrival = arrival.astimezone(BOSTON_TZ)
        return request.model_copy(update={"arrival_time": local_arrival})
