<div align="center">

# SpotCheck

**Real-time, rule-aware street parking recommendations for Fenway, Boston.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black?logo=vercel)](https://spot-check.vercel.app)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

---

![SpotCheck Demo](assets/demo.gif)

---

## Overview

Boston's Fenway neighbourhood enforces some of the city's most complex street parking rules — overlapping meter zones, resident permit restrictions, seasonal street-sweeping windows, and game-day demand spikes. SpotCheck solves this by evaluating every curated street segment against a user's **exact arrival time, stay duration, and permit status**, then returning the five closest legal options ranked by a composite proximity-risk-demand score.

Built in 3 hours at a hackathon by a two-person team. Deployed to production on Vercel.

---

## Features

- **Time-aware legality engine** — evaluates day-of-week, clock-time windows, permit zones, no-parking overlaps, and seasonal street-sweeping dates
- **Composite ranking** — scores each legal segment by walking distance (65%), rule risk (20%), and area demand (15%)
- **Risk transparency** — every recommendation includes human-readable "why it works" bullets and risk warnings
- **Interactive Leaflet map** — colour-coded rank markers (green / amber / red), smooth fly-to animation on selection, popups with full rule summary
- **Live data enrichment** — fetches Boston.gov meter policy, street-sweeping schedules, and permit rules at startup; falls back to curated dataset if sources are unavailable
- **Free / Metered filter** — filter results in real-time by parking type
- **Navigate button** — deep-links to Google Maps walking directions from current location

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI 0.115 + Pydantic v2 |
| Frontend | React 18 + TypeScript 5 + Vite |
| Maps | Leaflet.js + react-leaflet |
| Deployment | Vercel (serverless Python + static hosting) |
| Data | Curated JSON + Boston.gov live enrichment |
| Package management | uv (Python 3.12) |

---

## Architecture

```
Browser
  React SPA (Vite)
  SearchForm  ──POST /recommendations──>  Vercel Serverless Function
  Leaflet Map <──RecommendationsResponse──  FastAPI (api/index.py)
                                              │
                               ┌──────────────┼──────────────┐
                               ▼              ▼              ▼
                        Rules engine     Ranking        Data layer
                        (legality gate)  (Haversine +   (fenway_segments.json
                                          score formula)  + Boston.gov enrichment)
```

The frontend and backend share a single Vercel project. API routes (`/health`, `/recommendations`) are proxied to the Python serverless function; all other paths serve the React SPA. The base dataset (`fenway_segments.json`) is always available; Boston.gov enrichment runs once at cold-start and is never in the request path.

---

## Project Structure

```
SpotCheck/
├── api/
│   └── index.py                  # Vercel serverless entry point
├── backend/
│   └── app/
│       ├── main.py               # FastAPI app, CORS, lifespan hook
│       ├── config.py             # Pydantic settings
│       ├── api/
│       │   └── routes.py         # GET /health, POST /recommendations
│       ├── core/
│       │   ├── service.py        # Recommendation orchestration
│       │   ├── ranking.py        # Haversine distance + score calculation
│       │   └── rules.py          # Legal rule evaluation engine
│       ├── models/
│       │   └── parking.py        # All Pydantic domain models
│       └── data_access/
│           ├── repository.py     # Dataset loader + enrichment orchestrator
│           ├── sources.py        # JSON enrichment merger
│           ├── boston_live.py    # Boston.gov live data adapter
│           └── data/
│               ├── fenway_segments.json        # Curated base dataset
│               └── enrichments/
│                   ├── boston_rules.json
│                   └── demand_signals.json
├── frontend/
│   └── src/
│       ├── App.tsx               # Root component, layout, state
│       ├── components/
│       │   ├── SearchForm.tsx    # Destination / time / duration / permit
│       │   ├── ResultsList.tsx   # Ranked results display
│       │   ├── RuleCard.tsx      # Expanded segment detail panel
│       │   ├── Map.tsx           # Leaflet map container + hooks
│       │   ├── SegmentLayer.tsx  # Rank markers with score colours
│       │   └── ParkingFilter.tsx # Free / Metered filter pills
│       ├── hooks/
│       │   └── useParking.ts     # Data-fetching hook
│       ├── utils/
│       │   ├── api.ts            # Fetch wrapper + BASE_URL resolution
│       │   └── colors.ts         # Score-to-colour mapping
│       └── types/
│           └── parking.ts        # TypeScript interfaces (mirrors backend models)
├── vercel.json
├── requirements.txt
└── .python-version
```

---

## API Reference

### `POST /recommendations`

Returns up to 5 ranked legal parking options.

**Request**
```json
{
  "destination": { "lat": 42.3467, "lng": -71.0972 },
  "arrival_time": "2025-04-20T18:30:00",
  "duration_minutes": 120,
  "has_resident_permit": false
}
```

**Response**
```json
{
  "neighborhood": "Fenway",
  "evaluated_at": "2025-04-20T18:30:00-04:00",
  "results": [
    {
      "segment_id": "fenway-001",
      "street_name": "Brookline Ave",
      "from_street": "Yawkey Way",
      "to_street": "Van Ness St",
      "distance_meters": 142.3,
      "walk_minutes": 1.8,
      "score": 0.312,
      "why_good": ["Metered parking with up to 120 minutes", "Short walk to destination"],
      "risk_warnings": [],
      "rule_summary": "Metered, max 120 min, no permit required",
      "pricing": "$2.00/hour",
      "permit_required": false,
      "center": { "lat": 42.3468, "lng": -71.0965 },
      "polyline": [...]
    }
  ],
  "message": "Found 5 legal parking options.",
  "rejection_reasons": []
}
```

### `GET /health`

Returns service status and data enrichment report.

---

## Scoring Formula

```
score = 0.65 × min(distance_m / 300, 1.0)    # proximity  (dominant)
      + 0.20 × risk_score                      # legal risk
      + 0.15 × (traffic_level + poi_level) / 2 # area demand
      +        base_score_modifier              # manual tuning

risk_score  = 0.15 (base)
            + 0.10 if metered
            + 0.10 if mixed parking type
            + 0.08 per risk warning  (max +0.24)

walk_minutes = distance_m / 80    # 80 m/min walking pace
```

Lower score = better. Score colour thresholds: `≤ 0.35` green, `0.35–0.60` amber, `> 0.60` red.

---

## Local Development

### Prerequisites

- Python 3.12+
- Node.js 18+

### Backend

```bash
cd backend
pip install -r ../requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env` (do **not** commit this file):
```
VITE_API_BASE_URL=http://localhost:8000
```

```bash
npm run dev    # Vite dev server at http://localhost:5173
```

The Vite dev proxy automatically forwards `/health` and `/recommendations` to `http://127.0.0.1:8000`.

### Tests

```bash
cd backend
pytest tests/ -v
```

---

## Deployment

The app is deployed on Vercel as a single project:

- **Frontend** — built with `npm run build`, served as static files from `frontend/dist`
- **Backend** — `api/index.py` is a Vercel Python serverless function running FastAPI

Key deployment config (`vercel.json`):

```json
{
  "buildCommand": "cd frontend && npm install && npm run build",
  "outputDirectory": "frontend/dist",
  "build": { "env": { "UV_PYTHON": "3.12" } }
}
```

> `UV_PYTHON=3.12` is required because Vercel's build machines default to Python 3.14, which is incompatible with `pydantic-core`'s Rust extension (pyo3 supports up to Python 3.13).

---

## Environment Variables

| Variable | Scope | Default | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | Frontend build | `""` (same origin) | Override API base URL for local dev |
| `BOSTON_DATA_REFRESH_ENABLED` | Backend | `true` | Toggle Boston.gov live enrichment |
| `BOSTON_DATA_TIMEOUT_SECONDS` | Backend | `3.0` | HTTP timeout for external data sources |
| `UV_PYTHON` | Vercel build | — | Pin Python version for uv package install |

---

## Data Model

The base dataset (`fenway_segments.json`) covers 15+ hand-curated street segments around Fenway Park. Each segment includes:

- **Polyline** — list of lat/lng points for map rendering
- **TimeWindows** — day-of-week + clock-time ranges where parking is allowed, with permit and meter flags
- **NoParkingWindows** — restrictions with seasonal start/end dates (e.g. street sweeping April–November)
- **NearbyDemand** — traffic and POI hotness levels (0–1 scale)
- **SourceNotes** — full data-lineage audit trail per segment

Data confidence levels: `curated` (hand-researched) → `mixed` (partial live enrichment) → `live_verified` (all Boston.gov sources applied cleanly).

---

## Team

| Name | Role |
|---|---|
| Om Mane | Backend, deployment, architecture |
| Sumit | Frontend, map integration, UI |

---

*Built at a 3-hour hackathon. Deployed to production.*
