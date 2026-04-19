from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert "data_refresh" in response.json()


def test_recommendations_endpoint_returns_valid_payload() -> None:
    response = client.post(
        "/recommendations",
        json={
            "destination": {"lat": 42.3460, "lng": -71.0973},
            "arrival_time": "2026-04-21T17:30:00-04:00",
            "duration_minutes": 90,
            "has_resident_permit": False,
        },
    )

    body = response.json()

    assert response.status_code == 200
    assert body["neighborhood"] == "Fenway"
    assert len(body["results"]) <= 5
    assert all("segment_id" in result for result in body["results"])
