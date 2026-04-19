# Fenway Parking Backend

Small Python API for hackathon parking recommendations around Fenway.

The backend is static-first: `fenway_segments.json` is the base source of truth, and optional offline enrichment files can adjust rules or demand signals without becoming runtime dependencies.

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

If enrichment files are missing or incomplete, the API still serves recommendations from the base Fenway dataset.

## Endpoints

- `GET /health`
- `POST /recommendations`

## AI

OpenRouter is intentionally not used in the runtime request path. If added later, use it only for offline normalization or explanation generation.
