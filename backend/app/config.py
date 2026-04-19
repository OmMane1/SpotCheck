from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Settings(BaseModel):
    boston_data_refresh_enabled: bool = True
    boston_data_timeout_seconds: float = 3.0
    boston_street_sweeping_schedule_url: str | None = None
    google_places_api_key: str | None = None
    openrouter_api_key: str | None = None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        boston_data_refresh_enabled=_parse_bool(
            os.getenv("BOSTON_DATA_REFRESH_ENABLED"),
            default=True,
        ),
        boston_data_timeout_seconds=float(os.getenv("BOSTON_DATA_TIMEOUT_SECONDS", "3")),
        boston_street_sweeping_schedule_url=os.getenv("BOSTON_STREET_SWEEPING_SCHEDULE_URL"),
        google_places_api_key=os.getenv("GOOGLE_PLACES_API_KEY"),
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY"),
    )
