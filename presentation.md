# SpotCheck — Technical Deep-Dive
## Parking Recommendation System for Fenway Park, Boston
---

## Section 1: Project Overview

---

### The Problem

Boston's Fenway neighbourhood has some of the most complex street parking rules in the city. Rules change by **day of week**, **time of day**, **season**, and **resident permit zone**.

**Why Boston specifically is hard:**
- Meter zones, sweeping bans, and resident permit areas overlap on the same block
- Rules vary by side of street, day of week, and time of year
- No consumer product evaluates all these constraints against a visitor's specific arrival time and duration

**The target user:** Anyone visiting Fenway Park — for a game, a concert, a restaurant — who needs to park on the street and avoid a ticket.

---

### The Solution

SpotCheck takes a visitor's destination, arrival time, stay duration, and permit status, evaluates every curated street segment in the Fenway neighbourhood against Boston's actual parking rules, and returns the **five closest legal options** ranked by a composite score weighing proximity, legal risk, and area demand.

Results are displayed on an interactive map with colour-coded markers, walk time estimates, plain-English explanations, and upfront risk warnings.

---

### Technology Stack

| Layer | Technology | Role |
|---|---|---|
| **Frontend** | React 18 + TypeScript + Vite | UI, state management, production bundling |
| **Maps** | Leaflet.js | Interactive map, custom rank markers |
| **Backend API** | FastAPI + Pydantic v2 (Python 3.12) | Request validation, recommendation logic |
| **Data** | Curated JSON + Boston.gov live enrichment | Base dataset + live meter and sweeping rules |
| **Deployment** | Vercel | Serverless function + static hosting, single domain |

---
---

## Section 2: System Architecture

---

### High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                     BROWSER                         │
│      Sidebar (search + results)  │  Leaflet Map     │
└──────────────────┬──────────────────────────────────┘
                   │  POST /recommendations
                   │  GET  /health
┌──────────────────▼──────────────────────────────────┐
│           VERCEL SERVERLESS FUNCTION                 │
│   Route Handler → Service → Rules + Ranking         │
│                      │                              │
│               Data Repository                       │
└──────────────────┬──────────────────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
  Base JSON    Enrichment    Boston.gov
  (always)     Overrides     (startup)
```

The frontend and backend live in the **same Vercel project, same domain** — eliminating CORS entirely in production.

---

### The Three Layers

**Frontend Layer**
- Captures user intent and renders ranked results with colour-coded map markers
- Drives map interactions: destination pin, fly-to animation, detail panel on selection
- Manages all loading, error, and empty states in a single root component

**Backend Layer**
- Validates every request through Pydantic schemas before touching any business logic
- Normalises arrival time to Boston's timezone, then runs the rule engine and ranking algorithm
- Returns structured results with human-readable explanations and risk warnings

**Data Layer**
- `fenway_segments.json` — hand-curated base, always present, version-controlled
- `enrichments/` — JSON overrides that patch specific segment rules by ID
- `boston_live.py` — fetches live Boston.gov data at startup; if any source fails, the service falls back to the layer below without interruption

---

### Request / Response Flow

**1.** User selects a preset landmark, arrival time, duration, and permit status.

**2.** Frontend sends `POST /recommendations` — destination coordinates, ISO timestamp, duration in minutes, permit flag.

**3.** Backend validates the request shape and normalises the arrival time to `America/New_York`.

**4.** The rule engine runs five sequential checks on each segment. First failure exits immediately — legal segments continue to scoring.

**5.** Legal segments are scored (65% proximity + 20% risk + 15% demand), sorted, and the top five are returned with walk times, pricing, summaries, and warnings.

**6.** Frontend renders result cards and map markers. Selecting a result animates the map to that segment and opens the detail panel.

---

### Key Architectural Decisions

| Decision | Why We Made It | Trade-Off |
|---|---|---|
| **In-memory JSON, no database** | 15 segments fit entirely in memory — zero I/O latency per request | Data updates require a redeployment; can't scale to thousands of segments without pre-filtering |
| **Static-first enrichment** | Live Boston.gov data is a bonus, not a dependency — service runs perfectly on curated data alone | Live enrichment runs at cold-start, adding latency; the right fix is a nightly pre-bake pipeline |
| **Single Vercel project** | Frontend and backend share a domain — no CORS configuration needed anywhere | Backend and frontend must deploy together; can't release them independently |

---
---

## Section 3: Backend

---

### Data Model

Each street **segment** captures everything needed to evaluate legality at a given time:

- **Identity + location:** Street name, cross streets, GPS centre point, and a polyline for map rendering
- **Rules:** Time windows (when parking is allowed, permit and meter flags), no-parking windows (sweeping, restrictions with optional seasonal dates), and max duration
- **Scoring inputs:** Parking type (metered / free / permit / mixed), demand signals (traffic and POI intensity 0–1), and a manual base-score modifier for tuning

---

### Rule Evaluation Engine

Five checks run in sequence. The first failure exits immediately — no partial passes.

| Check | What It Tests | Why This Position |
|---|---|---|
| **1. Time window** | Active window exists for this day and time? | Most common failure — cheapest to check |
| **2. Duration** | Stay fits within the maximum allowed? | Second most common; simple arithmetic |
| **3. Permit** | Window requires a permit the user lacks? | Less common; only fails a subset |
| **4. No-parking overlap** | Stay overlaps a sweeping or restriction window (with seasonal date logic)? | Most expensive — saved for last |
| **5. Upcoming restriction** | Restriction starts within 90 min of departure? | Warning only — never fails legality |

The order mirrors failure frequency crossed with compute cost — the most common failure is always checked first, at the lowest possible cost.

---

### Ranking Algorithm

Every segment that passes all five checks receives a composite score:

> **Score = 65% × Proximity + 20% × Risk + 15% × Demand** — lower is better

- **Proximity (65%)** normalises against a 300-metre threshold. Beyond that, all spots are treated as equally far — risk and demand become the tiebreakers. Proximity dominates because it's what users care about most.
- **Risk (20%)** starts from a base rate and increases for metered spots, mixed-signage areas, and each risk warning generated. A warning-free spot always outranks a warning-heavy one at equal distance.
- **Demand (15%)** averages traffic and POI pressure — a proxy for whether an open space will actually be available. Walk time is shown instead of raw distance because it's immediately actionable (distance ÷ 80 m/min, conservative pace).

---

### API Design

**`GET /health`** — Service status and a report on the most recent enrichment: sources checked, successes, and any errors.

**`POST /recommendations`** — Returns up to five ranked results, or an empty list with `rejection_reasons` explaining exactly what the user should change.

**Why FastAPI:** Pydantic validation runs automatically on every request; response serialisation is automatic; OpenAPI docs are generated at `/docs` with no extra work. Type hints are first-class throughout — the codebase is self-documenting.

**Error handling:** The API returns HTTP 200 even with zero results. "No legal spots" is a valid business outcome, not an error — and the `rejection_reasons` array ("Street sweeping until 11am", "Permit required on 3 segments") is as valuable to the user as a positive result.

---
---

## Section 4: Frontend

---

### Component Architecture

`App.tsx` owns all application state — results, loading, selected segment, filter, form visibility. Every child component is purely presentational: it receives props and fires callbacks, holding no shared state of its own. There's no Redux or Context — plain `useState` cleanly handles a single-page, single-session app.

**`useParking` custom hook** extracts the async fetch lifecycle so `App.tsx` calls `search(request)` and reads back `{ results, loading, error }` without knowing anything about HTTP or error handling. The hook is independently testable and reusable.

---

### Key UX Decisions

**Preset landmarks instead of geocoding** — Geocoding APIs require paid keys. Six hand-curated coordinates cover every Fenway arrival point with zero cost and deterministic results. A geocoding API can return different results for the same query on different days.

**Colour-coded markers instead of raw scores** — Green (≤ 0.35), amber (≤ 0.60), red (> 0.60) communicate quality instantly. A score of `0.312` means nothing to a user; colour means everything.

**Walk time instead of distance** — "1.8 minutes" is a decision; "142 metres" requires mental conversion. The map fly-to animation on selection creates the spatial connection between the list and the map — the moment the app feels like a product.

---

### Bridging Leaflet and React

Leaflet is imperative (`map.flyTo()`). React is declarative. They conflict.

The solution is a React component that **renders nothing** but lives inside the Leaflet map container, where it can access the live map instance. When the selected segment changes, it fires the Leaflet call as a React side effect. Map animations are driven by React state — no imperative code leaks outside the map boundary.

---

## Section 5: Scaling Considerations

---

### Current Ceiling

The recommendation engine is pure in-memory computation — sub-millisecond per segment, no database I/O. The architecture handles roughly **50,000 requests/day** on Vercel's free tier comfortably. The bottleneck is cold-start enrichment latency, not the core logic.

---

### To Scale

**Step 1 — PostgreSQL + PostGIS for the data layer**
At 1,000+ segments, in-memory evaluation of every segment per request becomes impractical. PostGIS enables a geospatial pre-filter: return only the 20 nearest segments before the rule engine runs. The rule engine itself doesn't change.

**Step 2 — Move enrichment offline**
A nightly pipeline fetches Boston.gov data, builds an enriched dataset, and writes it back. The serverless function loads the pre-built file — cold-start drops from ~3 seconds to under 100ms, and Boston.gov is never in the request path.

**Step 3 — Caching + real-time occupancy**
Parking rules change slowly — a cache keyed on segment + day + hour eliminates redundant computation. Integrating Boston's parking terminal API adds occupancy data, upgrading recommendations from "legally available" to "legally available and likely open."

---
