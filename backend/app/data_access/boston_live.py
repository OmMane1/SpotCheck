from __future__ import annotations

import csv
import io
import json
import re
from copy import deepcopy
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from app.config import Settings


DAY_MAP = {
    "monday": "mon",
    "mon": "mon",
    "tuesday": "tue",
    "tue": "tue",
    "wednesday": "wed",
    "wed": "wed",
    "thursday": "thu",
    "thu": "thu",
    "friday": "fri",
    "fri": "fri",
    "saturday": "sat",
    "sat": "sat",
    "sunday": "sun",
    "sun": "sun",
}

METER_URL = "https://www.boston.gov/pt-br/departments/parking-clerk/how-do-parking-meters-work"
SWEEPING_URL = "https://www.boston.gov/departments/public-works/street-sweeping-city"
PERMIT_URL = "https://www.boston.gov/departments/parking-clerk/resident-parking-permits"


@dataclass
class RefreshReport:
    refresh_enabled: bool
    refresh_succeeded: bool
    used_fallback: bool
    refreshed_at: str | None
    errors: list[str]
    sources_checked: list[str]


@dataclass
class MeterPolicy:
    days: list[str]
    start: str
    end: str
    free_on_sundays_and_holidays: bool


@dataclass
class StreetSweepingPolicy:
    daytime_start_date: date | None
    daytime_end_date: date | None
    schedule_url: str | None


@dataclass
class PermitPolicy:
    signs_without_time_all_day: bool
    signs_without_day_full_week: bool


class BostonLiveDataAdapter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def apply_live_updates(
        self, payload: dict[str, Any], local_enrichments_dir: Path
    ) -> tuple[dict[str, Any], RefreshReport]:
        if not self.settings.boston_data_refresh_enabled:
            return deepcopy(payload), RefreshReport(
                refresh_enabled=False,
                refresh_succeeded=False,
                used_fallback=True,
                refreshed_at=None,
                errors=[],
                sources_checked=[],
            )

        merged = deepcopy(payload)
        errors: list[str] = []
        sources_checked: list[str] = []
        refreshed_at = datetime.now().isoformat()

        meter_policy = None
        permit_policy = None
        sweeping_policy = None
        schedule_rows: list[dict[str, str]] = []

        try:
            meter_policy = self.fetch_meter_policy()
            sources_checked.append(METER_URL)
        except Exception as exc:  # pragma: no cover
            errors.append(f"meter_policy: {exc}")

        try:
            sweeping_policy = self.fetch_street_sweeping_policy()
            sources_checked.append(SWEEPING_URL)
        except Exception as exc:  # pragma: no cover
            errors.append(f"street_sweeping: {exc}")

        if sweeping_policy and sweeping_policy.schedule_url:
            try:
                schedule_rows = self.fetch_sweeping_schedule_rows(sweeping_policy.schedule_url)
                sources_checked.append(sweeping_policy.schedule_url)
            except Exception as exc:  # pragma: no cover
                errors.append(f"street_sweeping_schedule: {exc}")

        try:
            permit_policy = self.fetch_permit_policy()
            sources_checked.append(PERMIT_URL)
        except Exception as exc:  # pragma: no cover
            errors.append(f"permit_policy: {exc}")

        local_rules = self._read_local_rule_enrichment(local_enrichments_dir / "boston_rules.json")
        for segment in merged.get("segments", []):
            updates_applied = False
            segment.setdefault("source_notes", [])

            if meter_policy is not None and segment.get("parking_type") in {"metered", "mixed"}:
                if self._needs_meter_fallback(segment):
                    segment["rules"]["time_windows"] = [
                        {
                            "days": meter_policy.days,
                            "start": meter_policy.start,
                            "end": meter_policy.end,
                            "parking_allowed": True,
                            "permit_required": False,
                        }
                    ]
                    updates_applied = True
                segment["source_notes"].append(
                    {
                        "source": "boston_meter_policy",
                        "kind": "meter_baseline",
                        "detail": (
                            "Meter baseline verified from Boston meter policy: "
                            f"{', '.join(meter_policy.days)} {meter_policy.start}-{meter_policy.end}; "
                            "free on Sundays and City holidays."
                        ),
                    }
                )

            if sweeping_policy is not None:
                segment["rules"]["no_parking_windows"] = self._apply_street_sweeping_policy(
                    segment,
                    sweeping_policy,
                    schedule_rows,
                    local_rules,
                )
                segment["source_notes"].append(
                    {
                        "source": "boston_street_sweeping",
                        "kind": "seasonal_rules",
                        "detail": "Street sweeping season refreshed from Boston Public Works.",
                    }
                )
                updates_applied = True

            if permit_policy is not None and segment.get("parking_type") == "permit":
                self._apply_permit_policy(segment, permit_policy)
                segment["source_notes"].append(
                    {
                        "source": "boston_resident_permits",
                        "kind": "permit_semantics",
                        "detail": (
                            "Permit-only logic aligned to Boston resident parking rules, "
                            "including default all-day/all-week sign semantics when unspecified."
                        ),
                    }
                )
                updates_applied = True

            if updates_applied:
                segment["last_verified_at"] = refreshed_at
                segment["data_confidence"] = "mixed" if errors else "live_verified"

        return merged, RefreshReport(
            refresh_enabled=True,
            refresh_succeeded=len(errors) < 3,
            used_fallback=bool(errors),
            refreshed_at=refreshed_at,
            errors=errors,
            sources_checked=sources_checked,
        )

    def fetch_meter_policy(self) -> MeterPolicy:
        html = self.fetch_text(METER_URL)
        match = re.search(
            r"Most meters are active Monday through Saturday from (\d{1,2}) a\.m\. to (\d{1,2}) p\.m\.",
            html,
            re.IGNORECASE,
        )
        if match is None:
            raise ValueError("Could not parse Boston meter baseline.")

        return MeterPolicy(
            days=["mon", "tue", "wed", "thu", "fri", "sat"],
            start=f"{int(match.group(1)):02d}:00",
            end=f"{self._normalize_hour_to_24(match.group(2), 'pm'):02d}:00",
            free_on_sundays_and_holidays="On Sundays and City holidays" in html,
        )

    def fetch_street_sweeping_policy(self) -> StreetSweepingPolicy:
        html = self.fetch_text(SWEEPING_URL)
        start_date = self._parse_sweeping_start_date(html)
        end_date = date(start_date.year, 11, 30) if start_date else None
        return StreetSweepingPolicy(
            daytime_start_date=start_date,
            daytime_end_date=end_date,
            schedule_url=self._extract_schedule_url(html)
            or self.settings.boston_street_sweeping_schedule_url,
        )

    def fetch_permit_policy(self) -> PermitPolicy:
        html = self.fetch_text(PERMIT_URL)
        return PermitPolicy(
            signs_without_time_all_day="Signs that do not have time restrictions mean they are in effect all day and night." in html,
            signs_without_day_full_week="Signs that do not have day restrictions mean they are in effect seven days a week." in html,
        )

    def fetch_sweeping_schedule_rows(self, url: str) -> list[dict[str, str]]:
        raw = self.fetch_text(url)
        if url.lower().endswith(".json") or raw.lstrip().startswith("{") or raw.lstrip().startswith("["):
            data = json.loads(raw)
            rows = data if isinstance(data, list) else data.get("results", data.get("data", []))
            return [self._normalize_row(row) for row in rows if isinstance(row, dict)]

        reader = csv.DictReader(io.StringIO(raw))
        return [self._normalize_row(row) for row in reader if row]

    def fetch_text(self, url: str) -> str:
        request = Request(
            url,
            headers={
                "User-Agent": "FenwayParkingFinder/0.1",
                "Accept": "text/html,application/json,text/csv;q=0.9,*/*;q=0.8",
            },
        )
        with urlopen(request, timeout=self.settings.boston_data_timeout_seconds) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace")

    def _parse_sweeping_start_date(self, html: str) -> date | None:
        exact_match = re.search(
            r"For the 2026 season, street sweeping began on [A-Za-z]+, ([A-Za-z]+ \d{1,2})",
            html,
            re.IGNORECASE,
        )
        if exact_match:
            return datetime.strptime(f"{exact_match.group(1)} 2026", "%B %d %Y").date()

        generic_match = re.search(
            r"runs from ([A-Za-z]+ \d{1,2}) to ([A-Za-z]+ \d{1,2})",
            html,
            re.IGNORECASE,
        )
        if generic_match:
            current_year = datetime.now().year
            return datetime.strptime(f"{generic_match.group(1)} {current_year}", "%B %d %Y").date()
        return None

    def _extract_schedule_url(self, html: str) -> str | None:
        match = re.search(r'href="(https://data\.boston\.gov[^"]+)"', html, re.IGNORECASE)
        return match.group(1) if match else None

    def _apply_street_sweeping_policy(
        self,
        segment: dict[str, Any],
        policy: StreetSweepingPolicy,
        schedule_rows: list[dict[str, str]],
        local_rules: dict[str, dict[str, Any]],
    ) -> list[dict[str, Any]]:
        matched = self._match_schedule_rows(segment, schedule_rows)
        windows = matched or deepcopy(segment["rules"].get("no_parking_windows", []))
        local_override = local_rules.get(segment["id"])
        if local_override and local_override.get("rules", {}).get("no_parking_windows"):
            windows = deepcopy(local_override["rules"]["no_parking_windows"])

        for window in windows:
            if "street sweeping" not in window.get("reason", "").lower():
                continue
            if policy.daytime_start_date is not None:
                window["seasonal_start_date"] = policy.daytime_start_date.isoformat()
            if policy.daytime_end_date is not None:
                window["seasonal_end_date"] = policy.daytime_end_date.isoformat()
        return windows

    def _apply_permit_policy(self, segment: dict[str, Any], policy: PermitPolicy) -> None:
        for window in segment["rules"].get("time_windows", []):
            window["permit_required"] = True
            if not window.get("days") and policy.signs_without_day_full_week:
                window["days"] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
            if not window.get("start") and not window.get("end") and policy.signs_without_time_all_day:
                window["start"] = "00:00"
                window["end"] = "23:59"

    def _match_schedule_rows(
        self,
        segment: dict[str, Any],
        schedule_rows: list[dict[str, str]],
    ) -> list[dict[str, Any]]:
        matches: list[dict[str, Any]] = []
        street_name = segment["street_name"].lower()
        for row in schedule_rows:
            row_name = (row.get("street_name") or "").lower()
            if street_name not in row_name and row_name not in street_name:
                continue
            day_token = DAY_MAP.get((row.get("day") or "").strip().lower())
            if not day_token or not row.get("start") or not row.get("end"):
                continue
            matches.append(
                {
                    "days": [day_token],
                    "start": row["start"],
                    "end": row["end"],
                    "reason": row.get("reason") or "street sweeping",
                }
            )
        return matches

    def _normalize_row(self, row: dict[str, Any]) -> dict[str, str]:
        normalized = {str(key).strip().lower(): str(value).strip() for key, value in row.items()}
        return {
            "street_name": normalized.get("street_name")
            or normalized.get("street")
            or normalized.get("streetname")
            or normalized.get("road")
            or "",
            "day": normalized.get("day") or normalized.get("weekday") or normalized.get("sweep_day") or "",
            "start": self._normalize_time_string(
                normalized.get("start")
                or normalized.get("from")
                or normalized.get("start_time")
                or normalized.get("time_from")
                or ""
            ),
            "end": self._normalize_time_string(
                normalized.get("end")
                or normalized.get("to")
                or normalized.get("end_time")
                or normalized.get("time_to")
                or ""
            ),
            "reason": normalized.get("reason") or "street sweeping",
        }

    def _normalize_time_string(self, value: str) -> str:
        cleaned = value.strip().lower().replace(".", "")
        if not cleaned:
            return ""
        if re.fullmatch(r"\d{2}:\d{2}", cleaned):
            return cleaned
        match = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)", cleaned)
        if not match:
            return value.strip()
        hour = self._normalize_hour_to_24(match.group(1), match.group(3))
        minute = match.group(2) or "00"
        return f"{hour:02d}:{minute}"

    def _normalize_hour_to_24(self, value: str, meridiem: str) -> int:
        hour = int(value)
        if meridiem == "pm" and hour != 12:
            hour += 12
        if meridiem == "am" and hour == 12:
            hour = 0
        return hour

    def _needs_meter_fallback(self, segment: dict[str, Any]) -> bool:
        return not bool(segment.get("rules", {}).get("time_windows"))

    def _read_local_rule_enrichment(self, path: Path) -> dict[str, dict[str, Any]]:
        if not path.exists():
            return {}
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return {segment["id"]: segment for segment in payload.get("segments", []) if "id" in segment}
