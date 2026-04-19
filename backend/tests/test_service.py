from pathlib import Path

from app.core.service import ParkingRecommendationService
from app.models.parking import LatLng, ParkingRecommendationRequest


DATASET_PATH = Path(__file__).resolve().parent.parent / "app" / "data" / "fenway_segments.json"


def build_request(
    *,
    arrival_time: str = "2026-04-21T17:30:00-04:00",
    duration_minutes: int = 90,
    has_resident_permit: bool = False,
) -> ParkingRecommendationRequest:
    return ParkingRecommendationRequest(
        destination=LatLng(lat=42.3460, lng=-71.0973),
        arrival_time=arrival_time,
        duration_minutes=duration_minutes,
        has_resident_permit=has_resident_permit,
    )


def test_recommendations_work_without_enrichment_directory() -> None:
    service = ParkingRecommendationService(
        dataset_path=DATASET_PATH,
        enrichments_dir=Path(__file__).resolve().parent / "missing_enrichments",
    )

    response = service.get_recommendations(build_request())

    assert response.neighborhood == "Fenway"
    assert response.results


def test_duration_limit_filters_out_segments() -> None:
    service = ParkingRecommendationService(dataset_path=DATASET_PATH)

    response = service.get_recommendations(build_request(duration_minutes=180))

    assert response.results == []
    assert "No legal parking options" in response.message


def test_permit_only_segments_are_filtered_for_non_permit_users() -> None:
    service = ParkingRecommendationService(dataset_path=DATASET_PATH)

    response = service.get_recommendations(
        build_request(arrival_time="2026-04-20T12:00:00-04:00")
    )

    segment_ids = {result.segment_id for result in response.results}

    assert "fenway-010" not in segment_ids


def test_upcoming_restrictions_surface_as_warnings() -> None:
    service = ParkingRecommendationService(dataset_path=DATASET_PATH)

    response = service.get_recommendations(
        build_request(arrival_time="2026-04-23T16:45:00-04:00", duration_minutes=75)
    )

    queensberry = next(
        result for result in response.results if result.segment_id == "fenway-007"
    )

    assert any("starts at" in warning for warning in queensberry.risk_warnings)


def test_ranking_prefers_lower_score_options_first() -> None:
    service = ParkingRecommendationService(dataset_path=DATASET_PATH)

    response = service.get_recommendations(build_request())
    scores = [result.score for result in response.results]

    assert scores == sorted(scores)
