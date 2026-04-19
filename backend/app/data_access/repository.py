from __future__ import annotations

import json
from pathlib import Path

from app.models.parking import SegmentCollection

from .sources import apply_optional_enrichments


class ParkingDataRepository:
    def __init__(
        self,
        dataset_path: Path | None = None,
        enrichments_dir: Path | None = None,
    ) -> None:
        data_dir = Path(__file__).resolve().parent.parent / "data"
        self.dataset_path = dataset_path or data_dir / "fenway_segments.json"
        self.enrichments_dir = enrichments_dir or data_dir / "enrichments"

    def load_collection(self) -> SegmentCollection:
        with self.dataset_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)

        enriched_payload = apply_optional_enrichments(payload, self.enrichments_dir)
        return SegmentCollection.model_validate(enriched_payload)
