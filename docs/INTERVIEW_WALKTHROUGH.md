# SpotCheck — CEO Technical Walkthrough
### Interview Prep Document

> **Important corrections up front:** Your brief mentioned Docker, Parquet files, Next.js, and LRU
> caching. None of these exist in this codebase. A CEO will spot fabricated tech immediately —
> this document is written against what is *actually* here. The real decisions are just as strong.

---

## 1. SYSTEM ARCHITECTURE OVERVIEW

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         BROWSER                                  │
│                                                                  │
│   ┌─────────────────┐        ┌──────────────────────────────┐   │
│   │   Sidebar        │        │        Leaflet Map           │   │
│   │  SearchForm      │        │  OpenStreetMap tiles         │   │
│   │  ResultsList     │        │  Colour-coded rank markers   │   │
│   │  RuleCard        │        │  Destination pin             │   │
│   └────────┬─────────┘        └──────────────────────────────┘   │
│            │  POST /recommendations                               │
│            │  GET  /health                                        │
└────────────┼─────────────────────────────────────────────────────┘
             │
             ▼  (same-origin on Vercel; Vite proxy in dev)
┌──────────────────────────────────────────────────────────────────┐
│               VERCEL SERVERLESS FUNCTION                         │
│                  api/index.py → FastAPI                          │
│                                                                  │
│   routes.py ──► service.py ──► rules.py   ranking.py            │
│                    │                                             │
│                    ▼                                             │
│            repository.py                                        │
│            ┌─────────────────────────────────┐                  │
│            │  fenway_segments.json (base)    │                  │
│            │  + boston_rules.json (override) │                  │
│            │  + demand_signals.json          │                  │
│            │  + boston_live.py (startup)     │                  │
│            └─────────────────────────────────┘                  │
└──────────────────────────────────────────────────────────────────┘
             ▲
             │  HTTP scrape at cold-start only
             ▼
       Boston.gov (meter policy, sweeping schedules, permit rules)
```

### How the Three Layers Interact

| Layer | Responsibility | Talks To |
|---|---|---|
| **Frontend** (React + Vite) | Captures user intent, renders results on map | Backend via HTTP |
| **Backend** (FastAPI) | Evaluates legality, scores segments, returns ranked list | Data layer at startup |
| **Data** (JSON + live enrichment) | Stores parking rules, time windows, restrictions | Loaded into memory |

**Critical design choice:** The data layer is fully in-memory. There is no database. The entire `fenway_segments.json` dataset is loaded on cold-start and held in a Python object. This means every recommendation request is a pure CPU operation — no I/O in the hot path.

### Request/Response Flow (Step by Step)

```
1. User picks landmark, arrival time, duration, permit status
         │
2. SearchForm calls getRecommendations() in api.ts
   → POST /recommendations  { destination, arrival_time, duration_minutes, has_resident_permit }
         │
3. FastAPI routes to ParkingRecommendationService.get_recommendations()
         │
4. arrival_time normalised → America/New_York timezone
         │
5. For each segment in the collection (~15 segments):
   a. evaluate_segment(segment, request)  → is_legal? risk_score? warnings?
   b. If legal: calculate_distance_meters(dest, segment.center)  [Haversine]
   c.           calculate_score(segment, distance, risk_score)
   d.           build RecommendationResult with walk time, pricing, summaries
         │
6. Sort by score (ascending — lower = better), return top 5
         │
7. React renders ResultsList + SegmentLayer markers on map
   → Marker colour = scoreToColor(score)
   → Click → RuleCard detail panel + MapFlyTo animation
```

### Why This Stack Makes Sense Together

- **FastAPI + Pydantic v2**: Request validation is zero-boilerplate. The same Pydantic models that validate the HTTP request are the domain objects that flow through the entire backend — no translation layer needed.
- **React + Vite**: Vite's dev server has a built-in proxy, so local development hits `localhost:8000` with no CORS configuration needed. The production build is pure static files — trivially hosted on Vercel's CDN.
- **Leaflet (not Google Maps)**: Zero API key required. For a hackathon with a $0 budget this was the only viable choice, and Leaflet is genuinely excellent for custom marker rendering.
- **Vercel single project**: Frontend static files + Python serverless function live in the same deploy, share the same domain, so the frontend calls the backend at the same origin — no CORS in production at all.

---

## 2. BACKEND DEEP-DIVE

### Data Model & Structure

**`fenway_segments.json` anatomy:**

```json
{
  "neighborhood": "Fenway",
  "generated_at": "2025-04-18T12:00:00",
  "segments": [
    {
      "id": "fenway-001",
      "street_name": "Brookline Ave",
      "from_street": "Yawkey Way",
      "to_street": "Van Ness St",
      "center": { "lat": 42.3468, "lng": -71.0965 },
      "polyline": [ {"lat": 42.346, "lng": -71.097}, ... ],
      "side": "right",
      "parking_type": "metered",
      "base_score_modifier": 0.0,
      "rules": {
        "max_duration_minutes": 120,
        "metered": true,
        "meter_rate_usd_per_hour": 2.0,
        "time_windows": [
          {
            "days": ["mon","tue","wed","thu","fri","sat"],
            "start": "08:00",
            "end": "20:00",
            "parking_allowed": true,
            "permit_required": false
          }
        ],
        "no_parking_windows": [
          {
            "days": ["tue"],
            "start": "08:00",
            "end": "11:00",
            "reason": "Street sweeping",
            "seasonal_start_date": "April 1",
            "seasonal_end_date": "November 30"
          }
        ]
      },
      "nearby_demand": { "traffic_level": 0.7, "poi_level": 0.9, "notes": "Near Fenway Park" },
      "data_confidence": "curated",
      "source_notes": [
        { "source": "manual", "kind": "sign_observation", "detail": "Verified on-site April 2025" }
      ]
    }
  ]
}
```

**Why JSON, not a database?**

This is a deliberate and defensible choice for the current scope:
- The full dataset is ~15 segments — fits in memory in microseconds
- Zero infrastructure overhead (no Postgres, no connection pooling, no migrations)
- The data changes rarely (parking rules don't change daily)
- Vercel serverless functions have no persistent storage anyway — a DB would require an external hosted service
- JSON is human-readable and directly version-controlled alongside the code

**The data enrichment pipeline (3 layers):**

```
Layer 1: fenway_segments.json
  └─ Hand-curated, always present, highest confidence

Layer 2: enrichments/ (boston_rules.json, demand_signals.json)
  └─ JSON override files that patch specific segment IDs
  └─ Applied by sources.py — deep-copies prevent mutation

Layer 3: boston_live.py (runs at cold-start)
  └─ Fetches Boston.gov meter policy, sweeping schedule, permit rules
  └─ Merges into existing segments if fetch succeeds
  └─ Sets data_confidence = "live_verified" or "mixed" based on errors
  └─ If all sources fail → falls back to Layer 1 transparently
```

**Note on the "three-tier" architecture:** This is not metadata → file mappings → actual data. It is curated → overrides → live enrichment. The architecture is additive, not hierarchical — each layer can fail independently without breaking the service.

### Core Business Logic: Rule Evaluation Engine

**File:** `backend/app/core/rules.py` → `evaluate_segment(segment, request)`

```python
def evaluate_segment(segment: ParkingSegment, request: ParkingRecommendationRequest) -> RuleEvaluation:
    arrival = request.arrival_time          # already tz-normalised by service layer
    departure = arrival + timedelta(minutes=request.duration_minutes)
    
    # --- Check 1: Is there an active time window? ---
    active_window = _find_active_window(segment.rules.time_windows, arrival)
    if active_window is None or not active_window.parking_allowed:
        return RuleEvaluation(is_legal=False, ...)  # FAIL FAST
    
    # --- Check 2: Does the duration fit? ---
    if segment.rules.max_duration_minutes and request.duration_minutes > segment.rules.max_duration_minutes:
        return RuleEvaluation(is_legal=False, ...)  # FAIL FAST
    
    # --- Check 3: Permit required? ---
    if active_window.permit_required and not request.has_resident_permit:
        return RuleEvaluation(is_legal=False, ...)  # FAIL FAST
    
    # --- Check 4: No-parking window overlap? ---
    for npw in segment.rules.no_parking_windows:
        if _windows_overlap(arrival, departure, npw):
            return RuleEvaluation(is_legal=False, ...)  # FAIL FAST
    
    # --- Check 5: Upcoming restriction within 90 min of departure? (WARNING only) ---
    for npw in segment.rules.no_parking_windows:
        if _restriction_starts_soon(departure, npw, window_minutes=90):
            warnings.append("Restriction starts within 90 min of your departure")
    
    return RuleEvaluation(is_legal=True, risk_score=..., why_good=[...], warnings=[...])
```

**Why this order of checks?**

Each check is ordered from cheapest-to-compute to most-expensive, and by most-common failure reason:
1. **Time window** — Most segments have restricted hours. This eliminates the largest number of segments with a single dict lookup.
2. **Duration** — Second most common failure (2-hour max meters are everywhere in Boston).
3. **Permit** — Only fails if user lacks a permit AND the window requires one — less common.
4. **No-parking overlap** — Requires iterating through a list and doing date/time range arithmetic — saved for last.
5. **Upcoming restriction** — Never fails; only generates warnings. Run only after legality is confirmed.

**Time window matching logic:**

```python
def _find_active_window(windows, arrival_time):
    day = arrival_time.strftime("%a").lower()     # "mon", "tue", etc.
    clock = arrival_time.strftime("%H:%M")        # "18:30"
    
    for window in windows:
        if day in window.days and window.start <= clock <= window.end:
            return window
    return None
```

Simple string comparison works here because both sides use `"HH:MM"` 24-hour format consistently. No datetime parsing needed in the hot comparison.

**No-parking overlap with seasonal dates:**

```python
def _windows_overlap(arrival, departure, npw):
    # First check seasonal applicability (April 1 – November 30 etc.)
    if npw.seasonal_start_date and npw.seasonal_end_date:
        if not _is_in_season(arrival, npw.seasonal_start_date, npw.seasonal_end_date):
            return False          # sweeping season hasn't started / already ended
    
    # Then check day + time overlap
    day = arrival.strftime("%a").lower()
    if day not in npw.days:
        return False
    
    npw_start = _parse_time(arrival.date(), npw.start)
    npw_end   = _parse_time(arrival.date(), npw.end)
    
    return arrival < npw_end and departure > npw_start  # standard interval overlap
```

**CEO will ask:** *"What happens if someone arrives during sweeping hours?"*
→ The segment is marked `is_legal=False` and completely excluded from results. It doesn't appear at all — we never show the user a spot that will get them ticked.

### Ranking Algorithm

**File:** `backend/app/core/ranking.py`

```python
def calculate_score(segment, distance_meters, risk_score) -> float:
    distance_component = min(distance_meters / 300, 1.0)
    demand_component   = (segment.nearby_demand.traffic_level + 
                          segment.nearby_demand.poi_level) / 2
    score = (
        0.65 * distance_component +
        0.20 * risk_score         +
        0.15 * demand_component   +
        segment.base_score_modifier
    )
    return round(score, 3)
```

**Why 65 / 20 / 15?**

These weights encode a specific user model:

- **65% proximity** — A parking app user's #1 need is "how far do I have to walk?" Anything beyond ~4 minutes walk and they'll circle the block. Proximity normalises at 300m (≈3.75 min walk) — beyond that the distance term is capped at 1.0 so farther spots never beat closer ones purely on other merits.
- **20% risk** — Legal safety matters, but a slightly riskier spot that's 50m away is still preferable to a perfectly safe spot 400m away. Risk can't override proximity.
- **15% demand** — Demand (traffic + POI pressure) is a proxy for how hard it'll be to actually *find* a space on the street. It's real signal, but secondary to physical proximity and safety.

**Haversine distance calculation:**

```python
def calculate_distance_meters(a: LatLng, b: LatLng) -> float:
    R = 6_371_000  # Earth radius in metres
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    dlat = math.radians(b.lat - a.lat)
    dlng = math.radians(b.lng - a.lng)
    
    x = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlng/2)**2
    return R * 2 * math.atan2(math.sqrt(x), math.sqrt(1-x))
```

For Fenway distances (all under 500m), Haversine is overkill — flat-earth Euclidean would give identical results. But Haversine is *correct* at any scale, and it's a 6-line function with no dependencies. No reason not to use it.

**Risk score components:**

```
risk_score = 0.15  (base — every spot has inherent parking risk)
           + 0.10  if metered (meters expire → ticket risk if late)
           + 0.10  if parking_type == "mixed" (ambiguous signage)
           + 0.08  per risk_warning (upcoming restriction, edge case, etc.)
             max from warnings: +0.24
```

**Trade-offs in the ranking approach:**

| What we gain | What we give up |
|---|---|
| Deterministic, explainable results | No ML-based personalisation |
| Zero latency (pure CPU, no I/O) | Can't learn from user behaviour |
| Easy to audit and tune weights | Weights require manual calibration |
| `base_score_modifier` lets data team tune per-segment | Requires domain knowledge to set modifiers correctly |

### API Design

**Why FastAPI over Flask?**

| Feature | FastAPI | Flask |
|---|---|---|
| Request validation | Pydantic v2, automatic | Manual |
| Response serialisation | Automatic from Pydantic model | Manual `jsonify()` |
| OpenAPI docs | Auto-generated at `/docs` | Requires flask-swagger |
| Async support | Native | Requires async extension |
| Type hints | First-class | Optional |

For a project where the entire backend is about structured data (typed requests, typed responses, typed domain models), FastAPI removes an entire class of boilerplate. The `@router.post("/recommendations", response_model=RecommendationsResponse)` decorator handles input validation, output serialisation, and API documentation in one line.

**Error handling strategy:**

SpotCheck uses a "soft failure" model: the API returns HTTP 200 even when no legal spots are found. The response body carries the status:

```json
{
  "results": [],
  "message": "No legal parking found at this time.",
  "rejection_reasons": [
    "Street sweeping on all metered segments until 11:00",
    "Permit required on 3 segments — you indicated no permit"
  ]
}
```

**Why HTTP 200 instead of 404?**

"No legal results" is not an error — it's a valid business outcome. A 404 would make the frontend think the endpoint is missing. A 422 would imply bad input. The request was valid; the parking rules are just prohibitive at this time. The `rejection_reasons` array tells the user exactly why and what to change.

---

## 3. FRONTEND DEEP-DIVE

### Component Architecture

```
App.tsx  (container — owns all state)
│
├── SearchForm.tsx         [presentational + local form state]
│     Inputs: destination preset, arrival datetime, duration slider, permit checkbox
│     Emits:  onSearch(ParkingRecommendationRequest)
│
├── ErrorBanner            [pure presentational]
│     Renders when error !== null
│
├── ParkingFilterBar.tsx   [presentational]
│     Emits: onChange("any" | "free" | "paid")
│
├── ResultsList.tsx        [presentational]
│     Props: results, selectedId, onSelect
│     Renders: ranked ResultCards
│
├── RuleCard.tsx           [presentational]
│     Props: result (single RecommendationResult)
│     Renders: expanded detail for selected segment
│
└── Map.tsx                [container — owns Leaflet instance]
      ├── TileLayer         OpenStreetMap
      ├── SegmentLayer.tsx  markers for each result
      ├── DestinationMarker blue pin at destination
      ├── MapRecenter       hook: pans on destination change
      └── MapFlyTo          hook: smooth fly-to on selection
```

**Container vs Presentational split:**

- `App.tsx` owns all application state. It's the single source of truth.
- All child components receive props and call callbacks. They own no shared state.
- This makes every component independently testable and the data flow auditable in one file.

### State in App.tsx

```typescript
const [results, setResults]           = useState<RecommendationsResponse | null>(null);
const [loading, setLoading]           = useState(false);
const [error, setError]               = useState<string | null>(null);
const [selectedId, setSelectedId]     = useState<string | null>(null);
const [formCollapsed, setFormCollapsed] = useState(false);
const [destination, setDestination]   = useState<LatLng | null>(null);
const [arrivalTime, setArrivalTime]   = useState<string | null>(null);
const [parkingFilter, setParkingFilter] = useState<"any" | "free" | "paid">("any");
```

No Redux, no Zustand, no Context. Plain `useState` in one component. For an app with one page and five states, any state management library would be over-engineering.

### useParking Hook

```typescript
// hooks/useParking.ts
export function useParking() {
    const [state, setState] = useState<ParkingState>({ results: null, loading: false, error: null });
    
    const search = async (request: RecommendationRequest) => {
        setState(s => ({ ...s, loading: true, error: null }));
        try {
            const results = await getRecommendations(request);
            setState({ results, loading: false, error: null });
        } catch (e) {
            setState({ results: null, loading: false, error: (e as Error).message });
        }
    };
    
    return { ...state, search };
}
```

**Why a custom hook?** It extracts the async fetch lifecycle (loading → success/error) from the component. `App.tsx` doesn't need to know about `try/catch`, state transitions, or the API client — it just calls `search(request)` and reads `{ results, loading, error }`. The hook is also independently reusable and testable.

### API Configuration (Environment-Aware)

```typescript
// utils/api.ts
const BASE_URL =
    import.meta.env.VITE_API_BASE_URL       // .env file (local dev)
    ?? (import.meta.env.DEV                 // Vite DEV flag?
        ? "http://127.0.0.1:8000"           // → fallback for local backend
        : "");                              // → same origin (Vercel production)
```

**Three environments handled with two lines:**
1. `VITE_API_BASE_URL` set → use that (any custom override)
2. Running in Vite dev mode → point to local FastAPI
3. Production build → empty string = same origin = Vercel serverless function

**Vite dev proxy** (`vite.config.ts`):
```typescript
server: {
    proxy: {
        "/recommendations": "http://127.0.0.1:8000",
        "/health":          "http://127.0.0.1:8000",
    }
}
```

This means in development, the browser calls `/recommendations` (same origin, no CORS), and Vite silently forwards it to the FastAPI process. Zero CORS configuration required in development.

### SearchForm: Preset Landmarks

```typescript
const DESTINATIONS = [
    { label: "Fenway Park (main gate)", coords: { lat: 42.3467, lng: -71.0972 } },
    { label: "Kenmore Square",          coords: { lat: 42.3502, lng: -71.0956 } },
    { label: "Lansdowne Street",        coords: { lat: 42.3462, lng: -71.0979 } },
    // ...
];
```

**Why presets instead of geocoding?**

- Google Places Geocoding API requires a paid key with billing enabled
- Mapbox Geocoding is free to a limit but requires signup and key management
- For a hackathon scoped to one neighbourhood, 6 landmarks cover every realistic use case
- Presets give deterministic, tested coordinates — a geocoding API can return ambiguous results

**CEO will ask:** *"What if I'm not going to Fenway Park specifically?"*
→ All six presets are within walking distance of each other in Fenway. The ranking engine handles the rest — if you pick Kenmore Square vs the main gate, the ranked segments will shift accordingly because the Haversine distance is calculated per-request.

### Map Integration

```typescript
// Map.tsx
<MapContainer
    center={[42.3467, -71.0972]}
    zoom={17}
    minZoom={16} maxZoom={18}
    maxBounds={FENWAY_BOUNDS}
    maxBoundsViscosity={1.0}    // hard boundary — can't drag outside Fenway
>
    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <SegmentLayer results={results} selectedId={selectedId} onSelect={onSelect} />
    {destination && <Marker position={[destination.lat, destination.lng]} icon={blueIcon} />}
    <MapRecenter destination={destination} />
    <MapFlyTo selectedId={selectedId} results={results} />
</MapContainer>
```

**Hooks inside the map:**

Leaflet's map instance (`useMap()`) is only accessible inside the `MapContainer` render tree. React hooks that call `useMap()` must therefore be *components* rendered inside the container — but they render nothing to the DOM. `MapRecenter` and `MapFlyTo` are components that exist purely to run imperative Leaflet code in response to React state changes.

```typescript
function MapFlyTo({ selectedId, results }) {
    const map = useMap();
    useEffect(() => {
        const result = results?.results.find(r => r.segment_id === selectedId);
        if (result) {
            map.flyTo([result.center.lat, result.center.lng], 18, { duration: 0.4 });
        }
    }, [selectedId]);
    return null;   // renders nothing
}
```

### Score Colour Mapping

```typescript
// utils/colors.ts
export function scoreToColor(score: number): string {
    if (score <= 0.35) return "#22c55e";   // green  — Best Match
    if (score <= 0.60) return "#f59e0b";   // amber  — Good Option
    return "#ef4444";                       // red    — Fair Option
}
```

**Why colour-code instead of showing the raw score?**

A score of `0.312` is meaningless to a user. Green/amber/red communicates "how good is this?" instantly. The raw score is used internally for sorting; the colour is the UX layer on top. This separation means if the scoring formula changes, the colour thresholds can be re-calibrated independently.

### Walk Time vs Distance

```typescript
walk_minutes = distance_m / 80   // 80 m/min ≈ casual walking pace
```

**Why walk time?**

"142 metres" requires mental conversion. "1.8 minutes" is immediately actionable — users can compare options ("do I want the 2-minute walk or the 4-minute walk?") and make a decision without arithmetic. The 80 m/min figure is deliberately conservative (typical is 83 m/min) to account for crossing streets and finding the exact spot.

---

## 4. DEPLOYMENT & INFRASTRUCTURE

### What Actually Exists (No Docker)

There is no Docker in this project. The brief mentioned Docker and multi-stage builds — that infrastructure was never built. The deployment story is:

- **Local dev:** `uvicorn app.main:app --reload` + `npm run dev` — two terminal windows
- **Production:** Vercel manages both the build and runtime environment

This was a deliberate simplification for a hackathon. Docker would add value if the team were multiple people with different OS environments, or if the app needed to run on a non-Vercel host.

### Vercel Configuration

```json
{
  "framework": null,
  "buildCommand": "cd frontend && npm install && npm run build",
  "outputDirectory": "frontend/dist",
  "build": { "env": { "UV_PYTHON": "3.12" } },
  "routes": [
    { "src": "/health",          "dest": "/api/index" },
    { "src": "/recommendations", "dest": "/api/index" },
    { "handle": "filesystem" },
    { "src": "/(.*)",            "dest": "/index.html" }
  ]
}
```

**Route order matters:**

1. `/health` and `/recommendations` are matched first → Python serverless function
2. `"handle": "filesystem"` → serve any real file that exists in `frontend/dist`
3. `"/(.*)"` catchall → `index.html` (enables React client-side routing)

Without rule 3, refreshing the browser on any non-root URL would 404.

**Why Vercel?**

| Requirement | Vercel | AWS Lambda | Heroku |
|---|---|---|---|
| Cost at hackathon scale | Free | Free (but complex setup) | Free tier deprecated |
| Python serverless | Yes (native) | Yes | Yes (dyno) |
| Static CDN for frontend | Yes (built-in) | Requires S3 + CloudFront | No |
| Deploy from git push | Yes | No (CI/CD needed) | Yes |
| Setup time | ~10 minutes | ~2 hours | ~30 minutes |

**The Python 3.14 deployment issue:**

Vercel's build machines updated to Python 3.14 as default. `pydantic-core 2.33.1` uses `pyo3 0.24.0` which only supports up to Python 3.13. The `.python-version` file was ignored because `uv` builds packages in isolated temp directories outside the repo root.

**Fix:** `"build": { "env": { "UV_PYTHON": "3.12" } }` in `vercel.json` — this injects the env var before the `uv pip install` step, forcing Python 3.12 for the entire build.

**CEO will ask:** *"How did you debug that?"*
→ The Vercel build log showed `Using CPython 3.14.3` followed by the `pyo3` compilation error. The error message itself said "Python interpreter version (3.14) is newer than PyO3's maximum supported version (3.13)". From there it was one env var fix.

### Development Workflow

```
Local dev environment:
  Terminal 1: cd backend && uvicorn app.main:app --reload --port 8000
  Terminal 2: cd frontend && npm run dev      (Vite on :5173)
  
  Browser hits localhost:5173
  Vite proxies /recommendations → localhost:8000
  FastAPI loads data from fenway_segments.json on startup

Production (Vercel):
  Git push to main
  Vercel builds frontend (npm run build)
  Vercel packages api/index.py as serverless function
  Both deployed to same domain → no CORS needed
```

---

## 5. KEY TECHNICAL DECISIONS & TRADE-OFFS

### Decision 1: In-Memory JSON Data Store

| | |
|---|---|
| **Problem** | Need parking rule data accessible on every request with zero latency |
| **Alternatives** | PostgreSQL, SQLite, Redis, Postgres with PostGIS |
| **Choice** | JSON file loaded into Python object at startup |
| **Gained** | Zero infrastructure cost, zero query latency, zero connection management |
| **Given up** | Can't scale beyond what fits in serverless memory (~50MB limit), no live updates without redeployment |

### Decision 2: Static-First Enrichment Pipeline

| | |
|---|---|
| **Problem** | Boston.gov data could improve accuracy but is unreliable |
| **Alternatives** | Always fetch live, cache in Redis, ignore live data |
| **Choice** | Fetch once at startup, overlay on curated base, fail gracefully |
| **Gained** | Service always responds, live data is a bonus not a dependency |
| **Given up** | Serverless functions can cold-start frequently — enrichment runs on each cold-start |

### Decision 3: Deterministic Rule-Based Scoring (No ML)

| | |
|---|---|
| **Problem** | How to rank parking options fairly |
| **Alternatives** | ML model trained on user preferences, collaborative filtering |
| **Choice** | Weighted formula with hand-tuned weights (0.65/0.20/0.15) |
| **Gained** | Fully explainable, zero training data needed, debuggable, deployable in 3 hours |
| **Given up** | Can't personalise to user preferences or learn from historical outcomes |

### Decision 4: Preset Landmarks, No Geocoding

| | |
|---|---|
| **Problem** | Users need to specify where they're going |
| **Alternatives** | Google Places API, Mapbox Geocoding, OpenStreetMap Nominatim |
| **Choice** | 6 hand-curated coordinate presets |
| **Gained** | Zero API cost, zero key management, deterministic coordinates, instant |
| **Given up** | Can't handle "I'm going to 15 Lansdowne St" — only the 6 presets |

### Decision 5: Same-Origin Vercel Deployment

| | |
|---|---|
| **Problem** | Frontend needs to call backend without CORS complexity |
| **Alternatives** | Separate Heroku backend + Netlify frontend, separate Vercel projects |
| **Choice** | Single Vercel project, routes proxied at the CDN level |
| **Gained** | No CORS headers needed in production, single deploy, single domain |
| **Given up** | Backend and frontend must be deployed together (can't update independently) |

---

## 6. KNOWN LIMITATIONS & HOW TO SCALE

### Current Limitations

- **Coverage:** 15 curated segments. Only useful if you're going to Fenway.
- **No real-time occupancy:** We know if parking is *legally allowed*, not if spaces are *physically available*.
- **Preset-only destinations:** Can't handle arbitrary addresses.
- **Serverless cold-start:** First request after idle takes 300–800ms while data loads. Subsequent requests are fast.
- **Brittle live enrichment:** `boston_live.py` scrapes HTML/CSV from Boston.gov. Any page redesign breaks it.
- **No user persistence:** No saved searches, no history, no favourites.
- **`frontend/.env` committed with localhost URL:** Causes production issues for anyone who clones the repo. Needs `.gitignore` fix.

### How to Scale It

**Step 1 — Data layer (if expanding beyond Fenway):**
Replace `fenway_segments.json` with PostgreSQL + PostGIS. PostGIS adds native geospatial queries:
```sql
SELECT * FROM segments
ORDER BY ST_Distance(center, ST_SetSRID(ST_MakePoint($lng, $lat), 4326))
LIMIT 20;
```
Instead of evaluating all segments, pre-filter to the 20 nearest. For city-wide coverage (1,000+ segments) this is essential.

**Step 2 — Caching:**
Add Redis with a composite key: `{segment_id}:{day_of_week}:{hour}`. Cache the legality result for each segment per time slot — recompute only when data changes.

**Step 3 — Real-time occupancy:**
Boston's parking payment terminals expose an API. Map terminal IDs to segment IDs, poll every 5 minutes, store occupancy rate in the data layer. Add `occupancy_rate` as a fourth scoring component.

**Step 4 — Geocoding:**
Replace the 6 presets with a Mapbox Geocoding call. Cost: $0.00075 per request at scale, negligible.

**Step 5 — Geographic expansion:**
The data model supports any city — `fenway_segments.json` is just one neighbourhood dataset. The entire pipeline works with a different JSON file. Expansion is a data problem, not an engineering problem.

---

## 7. BUGS ENCOUNTERED & HOW THEY WERE SOLVED

### Bug 1: Vercel Using Python 3.14

**Error:**
```
error: the configured Python interpreter version (3.14) is newer than
PyO3's maximum supported version (3.13)
```

**Debugging process:**
1. Build log showed `Using CPython 3.14.3` — immediately suspicious
2. `.python-version` file existed with `3.12` — should have worked
3. Investigation: `uv` builds packages in isolated temp directories (`/vercel/.cache/uv/builds-v0/.tmp.../`) — the repo root's `.python-version` is not on the path when `uv` builds from source
4. Fix: `UV_PYTHON=3.12` in `vercel.json` `build.env` injects the variable into the build environment before `uv` runs

**Lesson:** `.python-version` is a dev-environment convention. In CI/CD, explicit environment variables are more reliable than implicit file-based configuration.

### Bug 2: Frontend Calling `localhost:8000` in Production

**Symptom:** App worked for the developer, showed "port 8000 error" to everyone else.

**Root cause:** `frontend/.env` containing `VITE_API_BASE_URL=http://localhost:8000` was committed to git. Vite embeds env variables at build time — so the Vercel build embedded `localhost:8000` into the production bundle.

**Fix:** Remove `frontend/.env` from git tracking, add it to `.gitignore`. In production the env var is absent, `BASE_URL` falls back to `""` (same origin), and the app calls the Vercel serverless function correctly.

**Lesson:** `.env` files belong in `.gitignore` on day one. They should contain only local-machine-specific overrides, never values that are committed.

---

## 8. CODE QUALITY & BEST PRACTICES

### TypeScript Type Safety

The TypeScript interfaces in `types/parking.ts` mirror the Pydantic models in `parking.py` exactly:

```typescript
// TypeScript
interface RecommendationResult {
    segment_id: string;
    score: number;          // lower = better, 0–1 range
    walk_minutes: number;
    why_good: string[];
    risk_warnings: string[];
}
```

```python
# Pydantic
class RecommendationResult(BaseModel):
    segment_id: str
    score: float
    walk_minutes: float
    why_good: list[str]
    risk_warnings: list[str]
```

If the backend changes a field name, TypeScript will surface the mismatch at compile time in the frontend. This is a poor-man's contract test without needing a schema registry.

### Fail-Fast in Rules Engine

Every legality check returns immediately on failure:
```python
if active_window is None:
    return RuleEvaluation(is_legal=False, risk_score=1.0, ...)
```
No `elif` chains. No accumulated state. The first violation exits. This makes the control flow easy to follow and impossible to accidentally reach an illegal `is_legal=True` state through code paths.

### Data Immutability in Enrichment

```python
# sources.py
def apply_optional_enrichments(collection: SegmentCollection, ...) -> SegmentCollection:
    collection = collection.model_copy(deep=True)   # deep copy first
    for segment in collection.segments:
        # now safe to mutate
```

Enrichment files patch the segment collection, but they operate on a deep copy. The original loaded data is never mutated. If enrichment fails halfway through, the original collection is unaffected.

### Separation of Concerns

Each module has one job:
- `rules.py` — only asks "is this legal at this time?"
- `ranking.py` — only asks "how good is this legal spot?"
- `service.py` — orchestrates: loop → evaluate → score → sort → return
- `repository.py` — only knows about loading and merging data

None of these modules import from each other laterally. The dependency graph flows in one direction: `service` → `rules` + `ranking` + `repository`.

---

## 9. INTERESTING CODE SNIPPETS

### Snippet 1: The Haversine Formula

```python
def calculate_distance_meters(a: LatLng, b: LatLng) -> float:
    R = 6_371_000
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    dlat = math.radians(b.lat - a.lat)
    dlng = math.radians(b.lng - a.lng)
    x = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlng/2)**2
    return R * 2 * math.atan2(math.sqrt(x), math.sqrt(1-x))
```

**Why interesting:** Named after 19th-century navigator James Inman, this formula calculates great-circle distance accounting for Earth's curvature. At Fenway scale it makes no practical difference — but using it signals awareness that "distance on a sphere ≠ Euclidean distance" and means the code is correct at any geographic scale.

### Snippet 2: MapFlyTo as a Null-Rendering Component

```typescript
function MapFlyTo({ selectedId, results }: Props): null {
    const map = useMap();
    useEffect(() => {
        const r = results?.results.find(r => r.segment_id === selectedId);
        if (r) map.flyTo([r.center.lat, r.center.lng], 18, { duration: 0.4 });
    }, [selectedId]);
    return null;
}
```

**Why interesting:** This is a component that renders nothing. It exists only to access Leaflet's `useMap()` hook, which requires being inside the `MapContainer` component tree. It's an elegant solution to Leaflet's imperative API conflicting with React's declarative model — a React component is used as a side-effect host, not a rendering unit.

### Snippet 3: String-Based Time Comparison

```python
clock = arrival_time.strftime("%H:%M")     # "18:30"
if window.start <= clock <= window.end:    # "08:00" <= "18:30" <= "20:00"
    return window
```

**Why interesting:** This works because lexicographic ordering of `"HH:MM"` strings is identical to chronological ordering — `"08:00" < "18:30" < "20:00"` is true both alphabetically and temporally. A junior developer would reach for `datetime.combine()` and `timedelta`. This is both faster and more readable.

### Snippet 4: Score Normalisation Cap

```python
distance_component = min(distance_meters / 300, 1.0)
```

**Why interesting:** Without the `min(..., 1.0)` cap, a spot 600m away would score `2.0` on distance, and no amount of being "safe" or "low demand" could compensate — the score could exceed the 0–1 conceptual range. The cap ensures that all very-far spots are equal on distance (score 1.0), letting risk and demand differentiate among them.

### Snippet 5: Lifespan Hook for Startup Logic

```python
@asynccontextmanager
async def lifespan(_: FastAPI):
    service.refresh_collection()    # runs ONCE at startup
    yield                           # app serves requests
    # (cleanup would go here)

app = FastAPI(lifespan=lifespan)
```

**Why interesting:** This is FastAPI's modern replacement for `@app.on_event("startup")`. The `yield` divides setup from teardown — anything before `yield` runs at startup, anything after runs at shutdown. For SpotCheck, this means the JSON dataset and Boston.gov enrichment are loaded once, held in memory, and reused across all requests with zero per-request I/O cost.

### Snippet 6: Environment-Aware API Base URL

```typescript
const BASE_URL =
    import.meta.env.VITE_API_BASE_URL
    ?? (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");
```

**Why interesting:** This handles three deployment contexts in two lines with no `if/else`. It exploits JavaScript's nullish coalescing (`??`) and the fact that Vite sets `import.meta.env.DEV` automatically. A junior developer would write this as a switch statement or multiple `if` blocks.

---

## 10. INTERVIEW TALKING POINTS

### Key Numbers to Mention

| Metric | Value | Why it matters |
|---|---|---|
| Build time | 3 hours | Shows ability to ship under pressure |
| Time to first byte (warm) | < 100ms | Pure in-memory processing, no DB |
| Scoring weights | 65 / 20 / 15 | Shows intentional design thinking |
| Enrichment sources | 3 (Boston.gov) | Shows real-world data integration |
| Rule checks per segment | 5 (in priority order) | Shows algorithmic thinking |
| Python version issue | CPython 3.14 vs pyo3 | Shows debugging methodology |

### Impressive Technical Decisions Worth Highlighting

1. **Fail-fast rule evaluation** — ordered by both compute cost and failure frequency
2. **String-based time comparison** — leverages lexicographic ordering instead of datetime arithmetic
3. **MapFlyTo as a null-rendering component** — bridges React declarative model with Leaflet's imperative API
4. **Static-first data with graceful enrichment** — service never goes down because of a third-party outage
5. **Same-origin Vercel deployment** — eliminates CORS entirely in production

### Demonstrating Engineering Maturity

- **"We chose JSON over a database because..."** — shows you evaluated alternatives, not just grabbed the first tool
- **"The `.env` file was committed accidentally, which caused..."** — shows you know the production failure modes of your own decisions
- **"We normalise all times to America/New_York at the service layer before any rule check..."** — shows awareness of timezone bugs, a classic production incident category
- **"The enrichment runs at cold-start, not per-request, because..."** — shows understanding of latency budgets

### Problems Solved That Show Depth

- Diagnosing the `pyo3` / Python 3.14 build failure from a cryptic Vercel log
- Designing a rule evaluation engine that is correct for Boston's specific edge cases (seasonal street sweeping, permit zones that activate at different hours)
- Making Leaflet's imperative map API work naturally within React's declarative component model

### Growth Mindset Talking Points

- *"If I rebuilt this, the first thing I'd add is a proper `.gitignore` for `.env` files from the start"*
- *"The Boston.gov scraper is brittle — the right solution is a proper data pipeline that validates schema, not raw HTML scraping"*
- *"15 segments is enough to prove the concept but the architecture was designed so that expanding to 500+ segments only requires data work, not engineering work"*

### How SpotCheck Aligns with OptiSigns' Needs

*(Adapt these based on your knowledge of OptiSigns' stack and problems)*

- **Real-time data processing:** SpotCheck's rule engine evaluates time-sensitive data per-request — analogous to evaluating display rules ("show this ad between 9am and 5pm on weekdays")
- **Complex conditional logic:** Multi-condition rule evaluation with fallbacks directly maps to display scheduling, targeting rules, and content filters
- **TypeScript + React:** SpotCheck's frontend stack matches a modern SaaS dashboard exactly
- **FastAPI + Pydantic:** Production-proven pattern for typed, validated APIs — the same approach scales to multi-tenant enterprise APIs
- **Serverless deployment:** Demonstrates understanding of modern cloud-native infrastructure without requiring traditional server management

---

### Predicted CEO Questions & Suggested Answers

**"How does this handle a Red Sox game day?"**
> The `nearby_demand` field has a `poi_level` for Fenway Park set to 0.9 (high). This increases the demand component of every nearby segment's score, pushing lower-demand streets higher in results. What we don't have yet is event-aware demand that spikes on game days specifically — that would require an events API integration.

**"What happens if Boston.gov changes their website?"**
> The enrichment silently fails — `boston_live.py` catches all HTTP and parsing errors, logs them to `RefreshReport.errors`, and the service continues serving from the curated dataset. Users get slightly less fresh data, but they get an answer. I'd add monitoring alerts on enrichment failure rate as the next step.

**"Why not just use Google Maps?"**
> For displaying a map and calculating distances, Leaflet + OpenStreetMap is free, open-source, and fully capable. Google Maps charges per map load and per API call. For a hackathon, using Google Maps would require a credit card on file for a project that may get thousands of views. There's no functionality we needed that Google Maps provides that Leaflet doesn't.

**"Could this work for all of Boston?"**
> The architecture is ready for it — the data model supports any set of segments in any neighbourhood, and the rule engine has no Fenway-specific logic. Expanding coverage is purely a data work problem: research and encode the parking rules for each new neighbourhood. The hardest part would be keeping ~1,000 segments up-to-date as the city changes rules, which is where a proper ETL pipeline from city data sources would become essential.

**"What was the biggest mistake you made?"**
> Committing the `.env` file with `VITE_API_BASE_URL=http://localhost:8000`. It meant the production build was hardcoded to call my laptop. That's a Day 1 `.gitignore` rule — `.env` files should never be committed, and I've learned that's the kind of thing you set up before writing a single line of code.

---

*Document length: ~30–40 minutes of walkthrough material.*
*Prepared against actual codebase — no fabricated features included.*
