# Fenway Parking API Contract

## Base endpoints

- `GET /health`
- `POST /recommendations`

## `POST /recommendations`

### Request body

```json
{
  "destination": {
    "lat": 42.3460,
    "lng": -71.0973
  },
  "arrival_time": "2026-04-21T17:30:00-04:00",
  "duration_minutes": 90,
  "has_resident_permit": false
}
```

### Response body

```json
{
  "neighborhood": "Fenway",
  "evaluated_at": "2026-04-21T17:30:00-04:00",
  "message": "Found legal parking options near your destination.",
  "results": [
    {
      "segment_id": "fenway-001",
      "street_name": "Brookline Ave",
      "from_street": "Park Dr",
      "to_street": "Jersey St",
      "distance_meters": 64.4,
      "walk_minutes": 1,
      "score": 0.42,
      "why_good": [
        "Metered parking with up to 120 minutes allowed.",
        "No resident permit needed right now."
      ],
      "risk_warnings": [
        "Heavy demand during Fenway Park events."
      ],
      "rule_summary": "Metered, max 120 minutes, no permit required.",
      "pricing": "$2.00/hour"
    }
  ]
}
```

## Notes

- API returns only legal options after applying time, duration, and permit checks.
- Ranking is heuristic-only and combines walking distance, rule risk, and static demand.
- Empty-result responses still return HTTP 200 with an empty `results` array and a helpful `message`.
