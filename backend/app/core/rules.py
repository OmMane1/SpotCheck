from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.models.parking import (
    NoParkingWindow,
    ParkingRecommendationRequest,
    ParkingSegment,
    TimeWindow,
)

DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
WARNING_WINDOW_MINUTES = 90


@dataclass
class RuleEvaluation:
    is_legal: bool
    risk_score: float
    why_good: list[str]
    risk_warnings: list[str]
    rule_summary: str
    pricing: str


def evaluate_segment(
    segment: ParkingSegment, request: ParkingRecommendationRequest
) -> RuleEvaluation:
    arrival = request.arrival_time
    departure = arrival + timedelta(minutes=request.duration_minutes)
    why_good: list[str] = []
    warnings: list[str] = []

    allowed_window = _find_active_window(segment.rules.time_windows, arrival)
    if allowed_window is None or not allowed_window.parking_allowed:
        return RuleEvaluation(
            is_legal=False,
            risk_score=1.0,
            why_good=[],
            risk_warnings=["Parking is not allowed at the requested arrival time."],
            rule_summary="Not legal at requested time",
            pricing=_format_pricing(segment),
        )

    if request.duration_minutes > segment.rules.max_duration_minutes:
        return RuleEvaluation(
            is_legal=False,
            risk_score=1.0,
            why_good=[],
            risk_warnings=[
                f"Requested stay exceeds the {segment.rules.max_duration_minutes}-minute limit."
            ],
            rule_summary="Duration exceeds maximum stay",
            pricing=_format_pricing(segment),
        )

    if allowed_window.permit_required and not request.has_resident_permit:
        return RuleEvaluation(
            is_legal=False,
            risk_score=1.0,
            why_good=[],
            risk_warnings=["Resident permit required during this time window."],
            rule_summary="Resident permit required",
            pricing=_format_pricing(segment),
        )

    blocking_window = _find_blocking_window(segment.rules.no_parking_windows, arrival, departure)
    if blocking_window is not None:
        return RuleEvaluation(
            is_legal=False,
            risk_score=1.0,
            why_good=[],
            risk_warnings=[f"No parking due to {blocking_window.reason}."],
            rule_summary=f"Blocked by {blocking_window.reason}",
            pricing=_format_pricing(segment),
        )

    if segment.rules.metered:
        why_good.append(f"Metered parking with up to {segment.rules.max_duration_minutes} minutes allowed.")
    else:
        why_good.append(f"Parking allowed for up to {segment.rules.max_duration_minutes} minutes.")

    if not allowed_window.permit_required:
        why_good.append("No resident permit needed right now.")

    warning = _upcoming_restriction_warning(segment, departure)
    if warning:
        warnings.append(warning)

    for rule in segment.rules.special_rules:
        description = rule.description.strip()
        if description:
            warnings.append(description)

    risk_score = _calculate_risk_score(segment, warnings)
    summary = _build_rule_summary(segment, allowed_window)
    pricing = _format_pricing(segment)

    return RuleEvaluation(
        is_legal=True,
        risk_score=risk_score,
        why_good=why_good,
        risk_warnings=warnings,
        rule_summary=summary,
        pricing=pricing,
    )


def _find_active_window(windows: list[TimeWindow], when: datetime) -> TimeWindow | None:
    weekday = DAY_NAMES[when.weekday()]
    current_time = when.strftime("%H:%M")
    for window in windows:
        if weekday in window.days and window.start <= current_time < window.end:
            return window
    return None


def _find_blocking_window(
    windows: list[NoParkingWindow], arrival: datetime, departure: datetime
) -> NoParkingWindow | None:
    weekday = DAY_NAMES[arrival.weekday()]
    arrival_time = arrival.strftime("%H:%M")
    departure_time = departure.strftime("%H:%M")
    for window in windows:
        if weekday not in window.days:
            continue
        if arrival_time < window.end and departure_time > window.start:
            return window
    return None


def _upcoming_restriction_warning(segment: ParkingSegment, departure: datetime) -> str | None:
    weekday = DAY_NAMES[departure.weekday()]
    departure_time = departure.strftime("%H:%M")
    for window in segment.rules.no_parking_windows:
        if weekday not in window.days:
            continue
        restriction_time = _combine_date_and_time(departure, window.start)
        delta_minutes = int((restriction_time - departure).total_seconds() / 60)
        if 0 <= delta_minutes <= WARNING_WINDOW_MINUTES and departure_time <= window.start:
            return f"{window.reason.title()} starts at {window.start}."
    return None


def _combine_date_and_time(day: datetime, clock_time: str) -> datetime:
    hour, minute = [int(part) for part in clock_time.split(":")]
    return day.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _calculate_risk_score(segment: ParkingSegment, warnings: list[str]) -> float:
    risk = 0.15
    if segment.rules.metered:
        risk += 0.1
    if segment.parking_type == "mixed":
        risk += 0.1
    risk += min(len(warnings) * 0.08, 0.24)
    return min(risk, 1.0)


def _build_rule_summary(segment: ParkingSegment, window: TimeWindow) -> str:
    permit_text = "permit required" if window.permit_required else "no permit required"
    meter_text = "metered" if segment.rules.metered else "unmetered"
    return (
        f"{meter_text.capitalize()}, max {segment.rules.max_duration_minutes} minutes, "
        f"{permit_text}."
    )


def _format_pricing(segment: ParkingSegment) -> str:
    if not segment.rules.metered:
        return "Free"
    return f"${segment.rules.meter_rate_usd_per_hour:.2f}/hour"
