# Fenway Parking Backend

Small Python API for hackathon parking recommendations around Fenway.

The backend is static-first: `fenway_segments.json` is the base source of truth, and Boston public data can refresh the local rule cache at startup without becoming a request-time dependency.

## Run

```bash
pip install -r ..\requirements.txt
uvicorn app.main:app --reload
```

Run from the `backend` directory.

## Data flow

- Base data: `app/data/fenway_segments.json`
- Optional rule enrichments: `app/data/enrichments/boston_rules.json`
- Optional demand enrichments: `app/data/enrichments/demand_signals.json`
- Optional live startup refresh: Boston parking meter, street sweeping, and resident permit pages

If enrichment files are missing or incomplete, the API still serves recommendations from the base Fenway dataset.

## Environment

- `BOSTON_DATA_REFRESH_ENABLED=true|false`
- `BOSTON_DATA_TIMEOUT_SECONDS=3`
- `BOSTON_STREET_SWEEPING_SCHEDULE_URL=` optional override for a public schedule download URL
- `GOOGLE_PLACES_API_KEY=` reserved, unused
- `OPENROUTER_API_KEY=` reserved, unused

## Endpoints

- `GET /health`
- `POST /recommendations`

## AI

OpenRouter is intentionally not used in the runtime request path. If added later, use it only for offline normalization or explanation generation.
