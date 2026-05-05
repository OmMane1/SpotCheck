# SpotCheck — Technical Deep-Dive
## Parking Recommendation System for Fenway Park, Boston
### CEO Technical Interview

---
---

## Section 1: Project Overview

---

### The Problem

Boston's Fenway neighbourhood has some of the most complex street parking rules in the city. Rules change by **day of week**, **time of day**, **season**, and **resident permit zone**. A visitor who parks legally at 6pm may return at 8pm to find a ticket — not because they did anything wrong at 6pm, but because a new restriction kicked in during their visit.

**Why Boston specifically is hard:**
- Meter zones enforce different rates and hour limits on the same block at different times
- Street sweeping bans are seasonal — active April through November — and apply to specific sides of specific streets
- Resident permit zones overlap with metered zones, creating rules that depend on whether you're a local
- No single consumer product evaluates all these constraints together for a visitor's exact arrival time and duration

**The target user:** Anyone visiting Fenway Park — for a game, a concert, a restaurant — who needs to park on the street and avoid a ticket.

---

### The Solution

SpotCheck takes a visitor's destination, arrival time, stay duration, and permit status, evaluates every curated street segment in the Fenway neighbourhood against Boston's actual parking rules, and returns the **five closest legal options** ranked by a composite score that weighs proximity, legal risk, and area demand.

The result is displayed on an interactive map with colour-coded markers, walk time estimates, plain-English explanations of why each spot was recommended, and upfront warnings about anything the user should watch out for.

---

### Technology Stack

| Layer | Technology | Role |
|---|---|---|
| **Frontend** | React 18 + TypeScript | UI, state management, user interaction |
| **Maps** | Leaflet.js | Interactive map rendering, custom markers |
| **Build Tool** | Vite | Development server, production bundling |
| **Backend API** | FastAPI (Python 3.12) | Request handling, recommendation logic |
| **Data Validation** | Pydantic v2 | Type-safe request/response models |
| **Base Dataset** | Curated JSON | 15+ hand-researched street segments |
| **Live Enrichment** | Boston.gov APIs | Meter policy, sweeping schedules, permit rules |
| **Deployment** | Vercel | Serverless function + static hosting, single domain |

---
---

## Section 2: System Architecture

---

### High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                     BROWSER                         │
│                                                     │
│      Sidebar (search + results)  │  Leaflet Map     │
│                                                     │
└──────────────────┬──────────────────────────────────┘
                   │
          POST /recommendations
          GET  /health
                   │
┌──────────────────▼──────────────────────────────────┐
│           VERCEL SERVERLESS FUNCTION                 │
│                                                     │
│   Route Handler → Service → Rules + Ranking         │
│                      │                              │
│               Data Repository                       │
│                                                     │
└──────────────────┬──────────────────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
  Base JSON    Enrichment    Boston.gov
  (always)     Overrides     (startup)
```

The frontend and backend live in the **same Vercel project, same domain**. This eliminates CORS entirely in production — the browser calls the same origin it loaded from.

---

### The Three Layers

**Frontend Layer**
- Captures user intent: destination, arrival time, duration, permit status
- Renders results as a ranked list with score colour-coding and walk time estimates
- Drives map interactions: destination pin, ranked markers, fly-to animation on selection
- Handles all loading, error, and empty states

**Backend Layer**
- Validates every incoming request through strict Pydantic schemas before touching any logic
- Normalises arrival time to Boston's timezone before any rule evaluation
- Runs the rule engine and ranking algorithm against the in-memory dataset
- Returns structured results with human-readable explanations and risk warnings

**Data Layer**
- `fenway_segments.json` — hand-curated base dataset, always available, version-controlled
- `enrichments/` — JSON override files that patch specific segment rules by ID
- `boston_live.py` — fetches live data from Boston.gov at startup (meter policy, sweeping schedule, permit rules), merges it as a third layer on top
- If any enrichment source fails, the service continues from the layer below — **the app never goes down because of a third-party outage**

---

### Request / Response Flow

**1.** User selects a preset landmark, picks an arrival time and duration, and optionally checks "I have a resident permit."

**2.** The frontend sends a `POST /recommendations` request with destination coordinates, arrival time as an ISO timestamp, duration in minutes, and the permit flag.

**3.** The backend validates the request shape. Malformed requests are rejected immediately with a clear error before any business logic runs.

**4.** Arrival time is normalised to `America/New_York`. Every rule in the dataset is expressed in Boston local time — timezone normalisation happens once here so the rest of the logic never has to think about it.

**5.** For each street segment in the dataset, the **rule evaluation engine** runs five sequential checks. The first failure immediately marks the segment as illegal. Legal segments continue.

**6.** For every segment that passes, the system calculates walking distance using the Haversine formula and computes a composite score (65% proximity, 20% risk, 15% demand).

**7.** All legal segments are sorted by score. The top five are packaged into a response with walk times, pricing, a plain-English rule summary, and risk warnings.

**8.** The frontend renders ranked result cards and map markers. The user selects a result; the map smoothly animates to that segment; the detail panel expands with the full explanation.

---

### Key Architectural Decisions

| Decision | Why We Made It | Trade-Off |
|---|---|---|
| **In-memory JSON, no database** | 15 segments fit entirely in memory; recommendation logic is pure computation with zero I/O latency | Can't scale beyond available serverless memory; data updates require a redeployment |
| **Fail-fast rule evaluation** | Ordered by compute cost and failure frequency — eliminates most segments in the first check | No partial results; a segment either passes all checks or disappears from results entirely |
| **Static-first enrichment** | Live Boston.gov data is a bonus, not a dependency — service runs perfectly on curated data alone | Cold-start enrichment adds latency on serverless; ideally this moves to a pre-baked pipeline |
| **Single Vercel project** | Frontend and backend share a domain — no CORS configuration needed in production | Backend and frontend must be deployed together; can't update them independently |
| **Preset destinations, no geocoding** | Six hand-curated coordinates cover every Fenway use case with zero API cost and zero ambiguity | Can't handle arbitrary addresses; limited to the six defined landmarks |

---
---

## Section 3: Backend Deep-Dive

---

### Data Model

Each street **segment** captures everything needed to evaluate whether parking is legal at a given time:

- **Location:** Street name, cross streets, GPS coordinates for the centre point, and a polyline of GPS points for map rendering
- **Parking type:** Metered, free, permit, or mixed — affects both the risk score and the pricing display
- **Time windows:** Named day ranges and clock-time ranges where parking is allowed, with flags for permit requirement and metering
- **No-parking windows:** Specific day + time ranges where parking is prohibited, with an optional seasonal date range (e.g. street sweeping only active April through November)
- **Demand signals:** Traffic level and POI intensity (0–1 scale) used in the ranking formula
- **Data lineage:** A confidence level (`curated`, `mixed`, or `live_verified`) and a full audit trail of what data came from where

---

### The Enrichment Pipeline

Data flows through three additive layers, each one patching the layer below:

**Layer 1 — Curated base (`fenway_segments.json`)**
Hand-researched from posted signs and official Boston parking maps. Highest confidence. Always present.

**Layer 2 — Manual overrides (`enrichments/`)**
JSON files that patch specific segment IDs with corrections or additional rules. Used for known gaps in the base data.

**Layer 3 — Live Boston.gov enrichment**
At cold-start, the service fetches meter policy, street sweeping schedules, and permit rules from Boston's public data endpoints. This layer updates time windows, no-parking windows, and meter rates where it finds matching data. If a fetch fails, that source is skipped and the segment retains its Layer 1 or 2 values. The `data_confidence` field updates to `live_verified` when all sources apply cleanly, or `mixed` if some fail.

---

### Rule Evaluation Engine

Five checks run in sequence. The first failure exits immediately — there is no "partial pass."

| Check | What It Tests | Why This Position |
|---|---|---|
| **1. Time window** | Is there an active window for this day and clock time? | Most common failure — eliminates the most segments cheapest |
| **2. Duration** | Does the requested stay fit within the maximum? | Second most common; simple arithmetic |
| **3. Permit** | Does the window require a permit the user doesn't have? | Less common; only fails a subset of users |
| **4. No-parking overlap** | Does the stay overlap any sweeping or restriction window, accounting for seasonal dates? | Most expensive check — saved for last |
| **5. Upcoming restriction** | Does a restriction start within 90 minutes of departure? | Warning only — never fails; runs after legality is confirmed |

**Why fail-fast matters:** A segment with no active time window should never reach the permit check. The order isn't arbitrary — it mirrors both how often each check actually fails and how cheap each check is to compute. The result is that illegal segments are eliminated as early as possible with the least work.

---

### Ranking Algorithm

Every segment that passes all five checks receives a composite score:

> **Score = 65% × Proximity + 20% × Risk + 15% × Demand**

**Lower score = better result.**

**Proximity (65%)** normalises distance against a 300-metre threshold. At 300 metres (roughly a four-minute walk) the proximity term reaches its maximum — spots beyond that distance are all treated as equally far, letting risk and demand differentiate between them. Proximity dominates because that's what users actually care about most.

**Risk (20%)** builds up from a base rate, adding weight for metered spots (where an expired meter means a ticket), mixed-signage areas (ambiguous rules), and any risk warnings the evaluation generated. A spot with no warnings near a meter scores better on risk than an equivalent spot with two warnings.

**Demand (15%)** averages traffic intensity and POI pressure from the segment's demand signals. It reflects how likely you are to actually find an open space — a legal spot on a high-demand block is less useful than one on a quieter street.

**Walk time** is derived from distance divided by 80 metres per minute — a deliberately conservative walking pace that accounts for crossing streets and locating the exact space. Walk time is displayed instead of raw distance because it's immediately actionable.

---

### API Design

**`GET /health`** — Returns service status and a report on the most recent data enrichment: which sources were checked, which succeeded, and any errors encountered.

**`POST /recommendations`** — Accepts destination, arrival time, duration, and permit status. Returns up to five ranked results or an empty list with `rejection_reasons` explaining why nothing was found.

**Why FastAPI:**
- Request validation is automatic through Pydantic — a malformed request never reaches business logic
- Response serialisation is automatic — the same domain objects used internally become the JSON response
- OpenAPI documentation is generated automatically at `/docs` — no manual schema maintenance
- Type hints are first-class, making the codebase self-documenting and IDE-friendly

**Error handling philosophy:**
The API returns HTTP 200 even when there are no legal spots. "No results" is a valid business outcome, not an error. A 404 would imply the endpoint is missing; a 204 would discard the `rejection_reasons` array that tells the user exactly what to change — try a later time, shorten the duration, or acknowledge the permit requirement. The information in a zero-result response is as useful as the information in a five-result response.

---
---

## Section 4: Frontend Deep-Dive

---

### Component Architecture

The application uses a **single container, many presentational components** pattern.

`App.tsx` owns all application state — search results, loading state, selected segment, parking filter, form visibility. Every child component receives data through props and communicates back through callbacks. No component below `App.tsx` holds shared state.

This makes the data flow auditable in one file and every child component independently testable. There's no Redux, no Zustand, no Context API — plain `useState` handles the complexity of a single-page, single-session app cleanly.

**Custom hook — `useParking`:** Extracts the async fetch lifecycle into a reusable unit. The hook manages the transition from loading to success or error, so `App.tsx` simply calls `search(request)` and reads back `{ results, loading, error }` without knowing anything about HTTP, error handling, or state transitions. The hook is independently testable and could be reused across multiple components if the app grew.

---

### Key Features and the Decisions Behind Them

**Six preset landmarks instead of free-text geocoding**
Geocoding APIs (Google Places, Mapbox) require paid keys with billing enabled. For a project scoped to one neighbourhood, six landmarks cover every realistic arrival point. Presets also give deterministic, tested coordinates — a geocoding API can return ambiguous results for the same query on different days.

**Colour-coded markers instead of raw scores**
A score of `0.312` is meaningless to a user at a glance. Green, amber, and red communicate quality instantly. The thresholds — green below 0.35, amber up to 0.60, red above — were calibrated against the scoring formula so that a truly close, safe spot is always green and a far or risky spot is always red.

**Walk time instead of distance in metres**
"142 metres" requires mental conversion. "1.8 minutes" is immediately comparable across options — the user can decide in one glance whether the gap between the second and third result is worth it.

**Map fly-to animation on segment selection**
When a user clicks a result card, the map smoothly animates to that segment's location in 0.4 seconds. This spatial connection between the list and the map is the moment the app feels like a product rather than a prototype. It keeps the user oriented without requiring them to hunt on the map for where the result is.

---

### Bridging Leaflet and React

Leaflet is an imperative library — you call `map.flyTo()`, `map.setZoom()`, and so on. React is declarative — you describe what the UI should look like and let React figure out the DOM. These two models conflict.

The solution is a component that renders nothing to the screen but lives inside the Leaflet map container where it can access the live map instance. When the selected segment changes, this component runs the imperative Leaflet call directly as a React side effect. The result: map animations are driven by React state changes, with no imperative code leaking outside the map boundary.

This pattern — a React component used purely as a side-effect host rather than a rendering unit — keeps the codebase clean and the concerns properly separated.

---

### Environment-Aware API Configuration

The API base URL resolves differently in three contexts, handled with two lines of configuration logic:

- **Local development with explicit override:** Reads from a `.env` file — useful if you need to point at a staging backend
- **Local development without override:** Defaults to `http://localhost:8000`, the local FastAPI server
- **Production (Vercel):** Empty string — calls the same origin the page loaded from, which routes to the serverless function

In development, Vite's built-in proxy forwards `/recommendations` and `/health` to the local backend. This means the browser always calls the same origin — no CORS configuration needed in either environment.

---
---

## Section 5: Technical Challenges & Solutions

---

### Challenge 1: Python 3.14 Breaking the Production Build

**The problem:** Vercel's build machines updated their default Python to 3.14. The `pydantic-core` package includes a compiled Rust extension built with a library that only supported Python up to 3.13 at the time. The build failed completely.

**The debugging path:** The Vercel build log clearly showed "Using CPython 3.14.3" followed by a Rust compilation error that named the exact version mismatch. The error message itself suggested the fix.

**The solution:** Adding a single environment variable to the Vercel build configuration forces the package installer to use Python 3.12, where pre-built wheels for `pydantic-core` exist and no compilation is needed.

**What we learned:** File-based Python version pins work in developer environments but are ignored by the package installer when it runs in isolated build directories. For CI/CD, explicit environment variables are more reliable than implicit convention-based configuration.

---

### Challenge 2: The Committed `.env` File

**The problem:** A local environment file containing `http://localhost:8000` was committed to the repository. Vite embeds environment variables at build time, so the production bundle shipped with a hardcoded reference to a developer's laptop. The app worked for the developer (whose backend was running locally) and showed an error for everyone else.

**The solution:** Remove the file from git tracking, add it to `.gitignore`, and update the API configuration to fall back gracefully when the variable is absent.

**What we learned:** `.gitignore` should be one of the first files created in any new project — before any environment files are created. The lesson is about process, not code.

---

### Challenge 3: Bridging Leaflet and React

**The problem:** Leaflet's map instance is imperative and lives outside React's component lifecycle. React has no built-in way to trigger `map.flyTo()` in response to a state change without breaking the component model.

**The solution:** A React component that renders nothing — it exists only to run inside the Leaflet map container where the map instance is accessible, and executes imperative map calls as React side effects when relevant state changes.

**Why it's elegant:** No imperative code escapes the map boundary, no awkward references are passed through the component tree, and the animation is driven by the same React state that drives everything else.

---
---

## Section 6: Scaling Considerations

---

### Current Ceiling

The current architecture handles approximately **50,000 requests per day** on Vercel's free tier before hitting invocation limits — comfortably above what a neighbourhood parking app would see. The recommendation engine itself is the fastest part of the stack: pure in-memory computation, no I/O, sub-millisecond per segment.

The bottleneck at scale is cold-start latency from the live enrichment fetches, not the core logic.

---

### The Path to Citywide Scale

**Step 1 — Replace JSON with PostgreSQL + PostGIS**

At 1,000+ segments, loading everything into memory and evaluating each one per request becomes impractical. PostGIS adds native geospatial indexing: a single query returns the 20 nearest segments to the destination before any rule evaluation runs. The rule engine itself doesn't change — it still evaluates the same five checks in the same order. Only the input changes from "all segments" to "20 nearest segments."

**Step 2 — Move enrichment offline**

Rather than fetching Boston.gov data at cold-start, a scheduled pipeline runs nightly: pull the latest city data, match it to segment IDs, write an enriched dataset. The serverless function loads the pre-built file. Cold-start time drops from up to three seconds to under 100ms. The live enrichment code still exists — it just runs as a batch job rather than inline.

**Step 3 — Add a caching layer**

Parking rules change slowly. A cache keyed on segment ID + day of week + hour would serve the majority of requests from memory without touching the database. The rule evaluation result for a given segment on a Tuesday at 7pm is the same for every user who asks. Redis would handle this cleanly.

**Step 4 — Real-time occupancy**

Currently SpotCheck tells you where it's *legal* to park, not where there's an *open space*. Boston's parking payment terminals expose an API. Polling every five minutes and storing occupancy rates would add a fourth scoring component — a legal, nearby, low-demand spot that's currently 90% full ranks below one that's 40% full.

**Step 5 — Geographic expansion**

The data model has no city-specific logic. Every field, every rule type, every enrichment mechanism works identically for Cambridge, Brookline, or any other city with published parking data. Expansion is a data problem: source the rules, encode them in the same structure, point the repository at the new file. The entire engineering stack deploys unchanged.

---
---

## Section 7: Technical Highlights

---

| Highlight | What It Is | Why It Matters |
|---|---|---|
| **Haversine Distance Formula** | Calculates true great-circle distance on Earth's curved surface | Correct at any geographic scale; shows awareness of coordinate geometry fundamentals |
| **String-Based Time Comparison** | Compares `"HH:MM"` strings directly rather than parsing datetime objects | Lexicographic order equals chronological order for zero-padded 24-hour time — elegant and fast |
| **Fail-Fast Rule Evaluation** | Returns on the first legal violation, ordered by failure frequency and compute cost | Eliminates most segments in the first check; clean, auditable control flow |
| **Null-Rendering React Component** | A React component that renders nothing but runs side effects inside the Leaflet map tree | Bridges imperative Leaflet with declarative React without leaking concerns |
| **Static-First Enrichment** | Live data is an overlay on a curated base — the service runs perfectly without any external source | Production reliability thinking: third-party outages don't take down the service |
| **Soft API Failures** | Zero-result responses return HTTP 200 with `rejection_reasons`, not a 404 | Rejection reasons are as useful as results — discarding them for a cleaner status code is the wrong trade-off |

---
---

## Section 8: Key Metrics & Outcomes

---

| Metric | Value | Significance |
|---|---|---|
| **Development time** | 3 hours | End-to-end, deployed to production |
| **Team size** | 2 developers | Full-stack coordination under time pressure |
| **Warm response time** | < 100ms | Pure in-memory computation, no database I/O |
| **Segments evaluated per request** | 15 (all of them) | Pre-filtering to nearest 20 is the first scaling step |
| **Rule checks per segment** | 5, in priority order | Ordered by failure frequency × compute cost |
| **Scoring weights** | 65 / 20 / 15 | User-centred: proximity dominates, safety guards, demand signals |
| **Data enrichment sources** | 3 (Boston.gov) | Meter policy, sweeping schedule, permit rules |
| **Deployment platform** | Vercel free tier | Zero infrastructure cost; production-grade CDN |

---
---

## Section 9: What I'd Do Differently

---

**Move enrichment offline from day one.** The current architecture fetches live data at cold-start, which adds latency on every serverless wake-up. A pre-baked enrichment pipeline would have been the right call from the start — the code to build it exists, it just needs to run as a batch job rather than inline.

**`.gitignore` before anything else.** The committed `.env` file is a process mistake, not a code mistake. The fix is to set up `.gitignore` before writing the first line of application code — especially before creating any environment files.

**Instrument from the start.** There is currently no telemetry — no logging of which results users navigate to, no tracking of whether enrichment succeeds or fails silently, no alerts if the Boston.gov endpoints change format. Knowing what's happening in production is the first thing I'd add after the core product works.

**Validate the scoring weights with data.** The 65/20/15 split is a reasoned prior, not a measured posterior. The architecture supports tuning, but the weights themselves need real clickthrough and outcome data to validate. That feedback loop doesn't exist yet.

---
---

## Section 10: Relevance to OptiSigns

---

The core engineering problems in SpotCheck map directly to challenges in a display scheduling and content delivery platform:

**Time-aware rule evaluation** — SpotCheck evaluates whether parking is legal at a specific moment given a complex set of overlapping rules. Display scheduling does the same thing: show this content between 9am and 5pm on weekdays, except during the blackout window on the 15th. The rule engine architecture — ordered checks, fail-fast evaluation, plain-English explanations — applies directly.

**Conditional logic with multiple overlapping constraints** — Permit zones, sweeping windows, and meter hours stack and conflict in the same way that targeting rules, audience segments, and scheduling windows stack and conflict in a content platform.

**React + TypeScript frontend** — The component architecture, state management approach, and custom hook pattern are directly applicable to any modern dashboard or management interface.

**FastAPI + Pydantic backend** — Typed, validated APIs with automatic documentation are production patterns that scale to multi-tenant enterprise platforms. The same approach that handles parking recommendation requests handles display configuration, campaign management, or analytics queries.

**Reliability thinking** — The static-first enrichment pipeline, the soft failure API design, and the graceful degradation from live data to curated data all reflect the same production mindset required in a platform where content not displaying correctly is a visible, customer-facing failure.

---

*SpotCheck — Built in 3 hours. Deployed to production. Designed to scale.*
