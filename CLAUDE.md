# CLAUDE.md

Context for working on CityScan. Read this first; it should remove the need for a
briefing at the start of a session.

---

## 1. Project Overview

**CityScan turns residents into city sensors.** People report urban hazards —
potholes, broken streetlights, debris, flooding — by clicking a map, and every
report lands on a shared live map a municipality can work from.

The problem it actually solves is **duplicate reports**. The same pothole gets
filed eleven times and no reporter can tell it was already raised. CityScan
answers that in two tiers:

- **Tier 1 — deterministic.** An unresolved hazard of the *same* type within 50 m
  is a duplicate, full stop. A `$geoWithin` / `$centerSphere` query against a
  `2dsphere` index. Milliseconds, no network, works with the AI service down.
- **Tier 2 — judgement.** Runs only when nearby hazards are of a *different* type,
  where "debris" and "flooding" five metres apart may or may not be one problem.
  An LLM decides.

**Tier 2 fails open by design.** If the AI service is unreachable the report goes
through. A citizen must always be able to file, even when an optional dependency
is down — which is also why duplicate detection is not delegated to an automation
tool.

This is a portfolio project. Its backend architecture deliberately mirrors an
earlier Spring Boot project (SmartCollect) so the same layering reads identically
in two languages. **A local copy of SmartCollect lives at
`C:\Users\alone\Documents\CityScan\SmartCollect-master`** — read it rather than
guessing when the question is "how does SmartCollect do this".

---

## 2. Tech Stack

### backend/ — Express 5 + TypeScript (ESM)

| | |
|---|---|
| Runtime | Node 24, `"type": "module"`, `module: nodenext` |
| Framework | Express 5 |
| Database | MongoDB via Mongoose 9 |
| Validation | Zod 4 — the schema is the source, the type comes from `z.infer` |
| Auth | `jsonwebtoken` + `bcrypt` |
| Images | `sharp` to WebP, EXIF stripped |
| Security | `helmet`, `express-rate-limit`, CORS |
| Tests | Vitest + `supertest` + `mongodb-memory-server` (46 tests) |
| Strictness | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` |

### frontend/ — React 19 + Vite

| | |
|---|---|
| Framework | React 19, `react-router-dom` 7 |
| Build | Vite 7, `tsc -b && vite build` |
| Map | Leaflet 1.9 + `react-leaflet` 5, CARTO Voyager tiles |
| Styling | Bootstrap 5 plus `App.css` / `index.css` |
| Geocoding | Nominatim, no API key |
| Lint | ESLint 9 + `typescript-eslint` — **not yet wired into CI**, see section 7 |

### ai-service/ — FastAPI + Gemini

FastAPI, `uvicorn`, `google-generativeai`, Pillow. Two endpoints, both behind an
`X-API-Key` header — `POST /analyze` (describe a photo) and `POST /check-duplicate`
(tier 2 adjudication) — plus `GET /health`.

### Infrastructure

Vercel (frontend, live), MongoDB Atlas M0, GitHub Actions (CI and demo reset),
Docker Compose for the local database. Azure is the planned backend host.

---

## 3. Architecture & Structure

```
CityScan/
├── backend/src/
│   ├── routes/          URL mapping and guard chaining. The authorization
│   │                    policy is readable from these files alone.
│   ├── middleware/      auth · validate · requireRole · rateLimiter ·
│   │                    demoRestrict · asyncHandler · errorHandler
│   ├── controllers/     HTTP only. No try/catch, no hand-picked status codes.
│   ├── boundaries/      DTOs — the wire contract. Each exports its Zod schema
│   │                    and derives its type with z.infer.
│   ├── logic/           Service interfaces — what the application can do.
│   │   └── impl/        Implementations. ALL business logic lives here.
│   ├── converters/      Entity to Boundary. Where a password hash cannot leak.
│   ├── repositories/    Queries only. The $geoWithin radius maths lives here.
│   ├── data/            Mongoose schemas, enums, demo fixtures.
│   ├── errors/          Exceptions that carry their own HTTP status.
│   ├── config/          loadEnv → env (Zod-validated, frozen) → db
│   ├── scripts/         seedDemo · clearReports
│   ├── container.ts     Composition root — DI by hand, whole graph in one file.
│   ├── app.ts           Express assembly
│   └── server.ts        Entry point. loadEnv MUST be its first import.
│
├── frontend/src/        Mirrors SmartCollect's static/js layout
│   ├── core/            config · http · session · demoVault
│   ├── services/        authService · hazardService · aiService
│   ├── pages/           LoginPage · RegisterPage · AdminPage · MyReportsPage
│   ├── components/      MapComponent · ReportSidebar · NavBar · DemoBanner
│   ├── contexts/        AuthContext
│   └── data/            demoFixtures (mirrors the backend's)
├── frontend/public/markers/   8 self-hosted PNG marker icons
│
├── ai-service/app/main.py
├── docs/                cityscan-system-guide.html + PDF (Hebrew) ·
│                        demo-reset-schedule.md
└── .github/workflows/   ci.yml · demo-reset.yml
```

### The one rule

**Each layer knows only the one below it.** `data/` does not know `logic/` exists;
`logic/` does not know HTTP exists — no `req`, no `res`, no status codes. That is
what lets business logic be tested without a server and the LLM provider be
swapped without touching it.

Request path: `routes → middleware → controllers → logic/impl → repositories → data`,
with `converters` called on the way out.

The same rule holds on the frontend: **`core/` knows nothing about the domain.**
`UNRESOLVED`, `DUPLICATE_RADIUS_METERS` and `distanceMeters` live in
`services/hazardService.ts`, not in `core/config.ts`.

---

## 4. Commands

```bash
npm install --prefix backend
npm install --prefix frontend
npm install
```

```bash
npm run db:up --prefix backend
```

Starts the local MongoDB container. Needs Docker Desktop running; once per reboot.
`npm run db:down --prefix backend` stops it.

```bash
npm run seed:demo --prefix backend
```

```bash
npm run dev
```

Runs all three services together via `concurrently`. Individually:
`npm run dev --prefix backend` (nodemon + tsx), `npm run dev --prefix frontend`
(vite), `node scripts/start-ai.js`.

```bash
npm test --prefix backend
```

46 integration tests against a real disposable `mongod`. No Docker required.
`npm run test:watch --prefix backend` for watch mode.

```bash
npm run build --prefix frontend
```

`tsc -b && vite build`, so a type error fails the build. Backend build is
`npm run build --prefix backend` (tsc to `dist/`).

```bash
npx cross-env VITE_IS_DEMO=true npm run dev --prefix frontend
```

Runs the frontend in exactly the configuration the live deployment uses. Use this
before every merge — see section 7.

```bash
npm run lint --prefix frontend
```

Currently reports about ten pre-existing errors. Not in CI yet.

---

## 5. Coding Conventions

Derived from the existing code. Match them.

### Both codebases

- **TypeScript everywhere, strict.** No `any`. Use `unknown` plus a narrowing
  cast where a boundary is genuinely untyped.
- **`interface` for object shapes, `type` for unions and aliases.**
- **Comments explain *why*, never *what*.** Existing comments justify a decision
  or record a trap; none narrate the line below them. Match that density — sparse,
  but substantial where present.
- **Constants are named and hoisted** to the top of the module:
  `EARTH_RADIUS_METERS`, `DUPLICATE_CODE`, `WITHOUT_PHOTOS`.

### backend/ specifics

- **Semicolons, single quotes.** The frontend uses neither. Do not unify them.
- **Import paths end in `.js`** even for `.ts` files — required by ESM NodeNext.
- **Classes with constructor injection**, wired in `container.ts`. Dependencies
  are typed as the *interface* from `logic/`, never the implementation.
- **Controllers use arrow-function class properties** wrapped in `asyncHandler`,
  so `this` binds and rejections reach the error middleware.
- **Never choose a status code outside `errors/`.** Throw `NotFoundException`,
  `ConflictException`, `ForbiddenException` and so on. `middleware/errorHandler.ts`
  is the only place that writes an error response.
- **No module reads `process.env` at import time.** ESM evaluates imports before
  module bodies, so an early read sees an unloaded environment. Read from `config`
  inside functions.
- **`data/enums.ts` is the single definition** of each value set — the Mongoose
  schema, the Zod boundary and any runtime check all read from it.
- **Converters build boundaries field by field**, never by spreading an entity.
  That is what makes a password-hash leak structurally impossible.
- **Anything that changes coordinates must use `.save()`**, never
  `findOneAndUpdate`. Atomic operators bypass the `pre('save')` hook that keeps
  the GeoJSON `location` in sync, and the geo index goes stale silently.

### frontend/ specifics

- **No semicolons, single quotes.**
- **Function components with hooks.** Named function declarations for components,
  arrow functions for handlers.
- **Nothing calls `fetch` except `core/http.ts`** and `aiService`, which needs a
  non-JSON path. Components call services; services call `api`.
- **`core/session.ts` is the only module that names a storage key.**
- **Every service function must handle `IS_DEMO`** for as long as demo mode exists.
- **`VITE_*` variables are inlined into the shipped bundle.** They are public.
  Never put a secret behind one.

---

## 6. Features

| Feature | Implementation |
|---|---|
| Hazard reporting by map click | Leaflet click, stored as flat lat/lng plus a GeoJSON mirror |
| Duplicate prevention within 50 m | `$geoWithin` + `$centerSphere` on a `2dsphere` index |
| Ambiguous duplicate adjudication | Gemini, behind a server-side proxy |
| Automatic photo description | Gemini vision |
| Address autofill and search | Nominatim, forward and reverse |
| Live map updates | Server-Sent Events at `/hazards/stream` — built, **not yet consumed**; the map still polls every 8 s |
| Photo storage | `sharp` to WebP at roughly 10% of the original, EXIF including GPS stripped |
| Auth and roles | JWT + bcrypt, route-level role guards |
| Input validation | Zod schemas applied at the route boundary |
| Admin panel | Filter by status and type, search, change status |
| One-click demo access | Guest accounts; the demo admin is read-only |
| Nightly demo reset | `POST /demo/reset`, token-guarded, constant-time compare |

### API surface

`/auth/register` · `/auth/login` · `/auth/demo-login` · `/hazards` (GET, POST) ·
`/hazards/nearby` · `/hazards/stream` · `/hazards/:id` (GET, PATCH, DELETE) ·
`/hazards/mine` · `/hazards/admin/list` · `/hazards/admin/count` ·
`/hazards/check-same-hazard` · `/hazards/analyze-photo` · `/users/me` ·
`/health/db` · `/demo/reset`

Every error shares one shape, written in exactly one place:

```json
{ "message": "…", "status": 409, "timestamp": "…", "path": "/hazards", "code": "DUPLICATE_HAZARD" }
```

---

## 7. Current State — read before planning work

### The live demo is linked from a CV. It must work at every moment.

`https://city-scan-tawny.vercel.app` runs the **frontend alone** with
`VITE_IS_DEMO=true`. There is no deployed backend. Writes go to `localStorage`
through `core/demoVault.ts`, reads come back from it, seeded from
`frontend/src/data/demoFixtures.ts`.

**Do not delete demo mode until a backend is actually live.** The public site
depends on that code path.

Working protocol:

- All work on `develop`. `main` is what Vercel builds.
- **Before merging, run locally with `VITE_IS_DEMO=true`** and check: demo login,
  12 markers, the Dizengoff duplicate being rejected, the admin panel loading,
  zero console errors. A clean build does not prove the demo works.
- After merging, verify the live site within a minute or two.
- Recovery is Vercel Instant Rollback.

### Done

Layered backend refactor · 46 tests · CI green · stored-XSS fix in the map popup ·
self-hosted marker icons · CARTO basemap · non-blocking GPS notice · frontend
split into `core/` and `services/` · single up-to-date system guide in `docs/`.

### Not done

- **Backend and ai-service are not deployed.** The plan targets Azure for
  Students. Use `Standard_B2ats_v2` (AMD, x86-64): `B1s` is being retired and
  student subscriptions often cannot create it, and `B2pts_v2` is ARM and would
  require rebuilding every image. A public IPv4 costs about $3.65/month and is
  not covered by the free tier.
- **`demo-reset.yml` has its `schedule` commented out.** It failed every night
  against a server that does not exist. Restore it in the same commit that sets
  `DEMO_RESET_URL` and `DEMO_RESET_TOKEN`, after one manual `workflow_dispatch`
  run returns 200.
- **Frontend lint is not in CI** — about ten pre-existing errors in files that
  pending work rewrites. A red badge is worse than no badge.
- The map still polls every 8 s instead of using the existing SSE endpoint.

---

## 8. Security Rules — non-negotiable

- **Never commit an environment file.** Only `*.example` files are tracked.
  Verify with `git ls-files | grep env` before any commit that touches config.
- **Never put a secret behind a `VITE_` variable.** It ships in the bundle.
- **The Gemini key lives only in `ai-service`**, reached through the backend
  proxy. It must never reach the browser.
- **Do not add a `Co-Authored-By: Claude` trailer to commits.** The user asked
  for these commits to carry no AI attribution. No hook enforces this — it is on
  you to omit it.
- The demo reset endpoint is the most destructive code here. It is not registered
  at all unless `DEMO_RESET_ENABLED=true`, and it requires a constant-time token
  comparison.

---

## 9. Working Preferences

- **The user writes in Hebrew and expects Hebrew replies.** Code, comments,
  commit messages and this file stay in English.
- **Verify, do not assume.** Several bugs here were found only because something
  was actually run and inspected: a retired Gemini model that still appeared in
  `list_models()`, a seeder whose backdating silently did nothing twice, a
  bidirectional-text bug visible only in a rendered screenshot. Check the output
  before reporting success.
- Small changes, frequent merges. If something breaks there should be one suspect.
- The full working plan is at
  `C:\Users\alone\.claude\plans\gentle-coalescing-thunder.md`.
- The Hebrew system guide in `docs/` is the deep reference for architecture, the
  database layer and the tooling decisions.
