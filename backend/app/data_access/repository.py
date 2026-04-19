from __future__ import annotations

import json
from pathlib import Path

from app.config import Settings, get_settings
from app.models.parking import SegmentCollection

from .boston_live import BostonLiveDataAdapter, RefreshReport
from .sources import apply_optional_enrichments


class ParkingDataRepository:
    def __init__(
        self,
        dataset_path: Path | None = None,
        enrichments_dir: Path | None = None,
        settings: Settings | None = None,
    ) -> None:
        data_dir = Path(__file__).resolve().parent.parent / "data"
        self.dataset_path = dataset_path or data_dir / "fenway_segments.json"
        self.enrichments_dir = enrichments_dir or data_dir / "enrichments"
        self.settings = settings or get_settings()
        self.live_adapter = BostonLiveDataAdapter(self.settings)
        self.last_refresh_report = RefreshReport(
            refresh_enabled=self.settings.boston_data_refresh_enabled,
            refresh_succeeded=False,
            used_fallback=True,
            refreshed_at=None,
            errors=[],
            sources_checked=[],
        )

    def load_collection(self) -> SegmentCollection:
        with self.dataset_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)

        enriched_payload = apply_optional_enrichments(payload, self.enrichments_dir)
        live_payload, report = self.live_adapter.apply_live_updates(
            enriched_payload,
            self.enrichments_dir,
        )
        self.last_refresh_report = report
        return SegmentCollection.model_validate(live_payload)
