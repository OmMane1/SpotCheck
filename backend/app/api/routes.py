from fastapi import APIRouter

from app.core.service import ParkingRecommendationService
from app.models.parking import ParkingRecommendationRequest, RecommendationsResponse

router = APIRouter()
service = ParkingRecommendationService()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "fenway-parking-api"}


@router.post("/recommendations", response_model=RecommendationsResponse)
def recommend_parking(
    request: ParkingRecommendationRequest,
) -> RecommendationsResponse:
    return service.get_recommendations(request)
