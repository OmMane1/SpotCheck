from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any


def apply_optional_enrichments(
    payload: dict[str, Any], enrichments_dir: Path
) -> dict[str, Any]:
    merged = deepcopy(payload)
    segments = {segment["id"]: segment for segment in merged.get("segments", [])}

    for filename in ("boston_rules.json", "demand_signals.json"):
        path = enrichments_dir / filename
        if not path.exists():
            continue

        try:
            with path.open("r", encoding="utf-8") as handle:
                enrichment = json.load(handle)
        except (OSError, json.JSONDecodeError):
            continue

        for segment_update in enrichment.get("segments", []):
            segment = segments.get(segment_update.get("id"))
            if not segment:
                continue
            _merge_segment(segment, segment_update)

    return merged


def _merge_segment(base_segment: dict[str, Any], segment_update: dict[str, Any]) -> None:
    if "nearby_demand" in segment_update:
        base_segment["nearby_demand"] = {
            **base_segment.get("nearby_demand", {}),
            **segment_update["nearby_demand"],
        }

    if "rules" in segment_update:
        base_segment["rules"] = {
            **base_segment.get("rules", {}),
            **segment_update["rules"],
        }

    if "base_score_modifier" in segment_update:
        base_segment["base_score_modifier"] = segment_update["base_score_modifier"]

    if "last_verified_at" in segment_update:
        base_segment["last_verified_at"] = segment_update["last_verified_at"]

    if "source_notes" in segment_update:
        existing_notes = base_segment.get("source_notes", [])
        base_segment["source_notes"] = [*existing_notes, *segment_update["source_notes"]]
