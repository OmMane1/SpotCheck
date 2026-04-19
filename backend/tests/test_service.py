from pathlib import Path

from app.config import Settings
from app.core.service import ParkingRecommendationService
from app.data_access.boston_live import BostonLiveDataAdapter
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
        settings=Settings(boston_data_refresh_enabled=False),
    )

    response = service.get_recommendations(build_request())

    assert response.neighborhood == "Fenway"
    assert response.results


def test_duration_limit_filters_out_segments() -> None:
    service = ParkingRecommendationService(
        dataset_path=DATASET_PATH,
        settings=Settings(boston_data_refresh_enabled=False),
    )

    response = service.get_recommendations(build_request(duration_minutes=180))

    assert response.results == []
    assert "No legal parking found" in response.message


def test_permit_only_segments_are_filtered_for_non_permit_users() -> None:
    service = ParkingRecommendationService(
        dataset_path=DATASET_PATH,
        settings=Settings(boston_data_refresh_enabled=False),
    )

    response = service.get_recommendations(
        build_request(arrival_time="2026-04-20T12:00:00-04:00")
    )

    segment_ids = {result.segment_id for result in response.results}

    assert "fenway-010" not in segment_ids


def test_upcoming_restrictions_surface_as_warnings() -> None:
    service = ParkingRecommendationService(
        dataset_path=DATASET_PATH,
        settings=Settings(boston_data_refresh_enabled=False),
    )

    response = service.get_recommendations(
        build_request(arrival_time="2026-04-23T16:45:00-04:00", duration_minutes=75)
    )

    queensberry = next(
        result for result in response.results if result.segment_id == "fenway-007"
    )

    assert any("starts at" in warning for warning in queensberry.risk_warnings)


def test_ranking_prefers_lower_score_options_first() -> None:
    service = ParkingRecommendationService(
        dataset_path=DATASET_PATH,
        settings=Settings(boston_data_refresh_enabled=False),
    )

    response = service.get_recommendations(build_request())
    scores = [result.score for result in response.results]

    assert scores == sorted(scores)


def test_live_refresh_failure_still_falls_back_to_static_data(monkeypatch) -> None:
    def fail_fetch(self, url: str) -> str:
        raise RuntimeError(f"cannot fetch {url}")

    monkeypatch.setattr(BostonLiveDataAdapter, "fetch_text", fail_fetch)
    service = ParkingRecommendationService(
        dataset_path=DATASET_PATH,
        settings=Settings(boston_data_refresh_enabled=True, boston_data_timeout_seconds=0.1),
    )

    response = service.get_recommendations(build_request())
    snapshot = service.health_snapshot()

    assert response.results
    assert snapshot["data_refresh"]["used_fallback"] is True
    assert snapshot["data_refresh"]["errors"]


def test_meter_policy_parser_uses_boston_baseline(monkeypatch) -> None:
    sample_html = """
    You'll find meters throughout Boston. Most meters are active Monday through Saturday
    from 8 a.m. to 8 p.m.
    On Sundays and City holidays you can park for free.
    """

    monkeypatch.setattr(BostonLiveDataAdapter, "fetch_text", lambda self, url: sample_html)
    adapter = BostonLiveDataAdapter(Settings())
    policy = adapter.fetch_meter_policy()

    assert policy.days == ["mon", "tue", "wed", "thu", "fri", "sat"]
    assert policy.start == "08:00"
    assert policy.end == "20:00"
    assert policy.free_on_sundays_and_holidays is True


def test_street_sweeping_policy_parser_extracts_2026_start_date(monkeypatch) -> None:
    sample_html = """
    Daytime Street Cleaning Program runs from April 1 to November 30 in most Boston neighborhoods.
    For the 2026 season, street sweeping began on Monday, March 16 due to the inclement weather.
    """

    monkeypatch.setattr(BostonLiveDataAdapter, "fetch_text", lambda self, url: sample_html)
    adapter = BostonLiveDataAdapter(Settings())
    policy = adapter.fetch_street_sweeping_policy()

    assert policy.daytime_start_date.isoformat() == "2026-03-16"
