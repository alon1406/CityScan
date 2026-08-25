# CLAUDE.md

Start here. This file explains what CityScan is, how it is built, and the few
rules that are easy to break by accident.

---

## 1. What the project is

**CityScan lets residents report urban hazards on a shared map.** Someone sees a
pothole, a broken streetlight, debris or flooding, clicks the spot on the map,
and files a report. Everyone sees the same map; a municipality can work from it.

The interesting part is **duplicate detection**. The same pothole gets reported
eleven times and no one can tell it was already raised, so CityScan checks every
new report in two stages:

1. **Same type within 50 metres** → duplicate, rejected immediately. A database
   query. No AI, no network, works offline.
2. **Different type nearby** → genuinely ambiguous ("debris" and "flooding" five
   metres apart may be one problem or two), so an LLM decides.

If the AI is unreachable, stage 2 **lets the report through**. Reporting must
never depend on an optional service.

It is a portfolio project. The backend layering deliberately copies an earlier
Java/Spring project called SmartCollect, so the same architecture reads the same
way in two languages. That project is on disk at
`C:\Users\alone\Documents\CityScan\SmartCollect-master` — read it instead of
guessing when a question is "how does SmartCollect do this".

---

## 2. Functional requirements

What the system does.

| # | Requirement |
|---|---|
| F1 | A visitor can view all hazards on a map without signing in |
| F2 | A user can register, sign in, and sign out |
| F3 | A visitor can sign in with one click as a demo user or demo admin |
| F4 | A signed-in user can file a hazard by clicking a location on the map |
| F5 | A report has a type, coordinates, and optionally a description, an address and photos |
| F6 | The address is filled in automatically from the coordinates, and can be searched |
| F7 | The system rejects a report that duplicates an unresolved one within 50 m |
| F8 | Ambiguous nearby reports of a different type are judged by an LLM |
| F9 | A photo can be described automatically by AI |
| F10 | A user can see a list of their own reports |
| F11 | An admin can see every report, filter by status and type, search, and change status |
| F12 | The admin navigation shows a live count of open reports |
| F13 | Deleting a report also deletes its photo files |
| F14 | The map reflects new reports without a manual refresh |
| F15 | The public demo can be reset to its seeded state |

**Two of these exist in the API but have no UI yet.** `PATCH /hazards/:id` and
`DELETE /hazards/:id` accept the reporter or an admin, and deletion removes the
photo files (F13) — but `MyReportsPage` is read-only, and the frontend has no
delete call at all. The admin page is the only place that mutates, and only to
change status. If you are asked to "fix editing", it is not broken; it was never
built on the client.

---

## 3. Non-functional requirements

How well it has to do it. Each of these is implemented somewhere specific.

### Security
- Passwords stored as bcrypt hashes, never plain text.
- The password hash is `select: false` in the schema, so a normal query does not
  even load it, and converters build responses field by field so it cannot leak.
- Every route input validated with Zod before it reaches a controller.
- Route-level role guards; the authorization policy is readable from `routes/`.
- `helmet` headers and rate limiting on write endpoints.
- **The Gemini API key never reaches the browser.** The frontend calls the
  backend, the backend calls the AI service.

### Privacy
- Uploaded photos have all metadata stripped, including **EXIF GPS**. The report
  already carries coordinates; there is no reason to also publish the exact spot
  the reporter was standing.

### Performance
- Radius queries are backed by a `2dsphere` index instead of scanning documents.
- List endpoints exclude photos from the response.
- Photos are compressed to WebP at roughly 10% of the original size.
- A connection pool of 10, and a 10-second database timeout so a dead database
  fails loudly instead of hanging.

### Reliability
- Duplicate detection stage 2 fails open — an unreachable AI never blocks a report.
- All errors are rendered in one place, in one shape.
- If saving a report fails after its photos were written, the photos are deleted
  rather than left orphaned on disk.

### Maintainability
- Strict layering, one direction only (section 4).
- Services depend on interfaces, wired in one file (`container.ts`).
- Enums defined once and read by the schema, the validation and the runtime.
- 46 integration tests against a real, disposable database.

### Portability
- Environment profiles (`development` / `production` / `test`), validated at boot.
- Local database runs in Docker; production points at MongoDB Atlas.

### Known limits
- List endpoints are capped at 500 rows with no real pagination.
- Live updates assume a single backend instance.

---

## 4. Architecture — layers

The backend is built in strict layers, copied from SmartCollect.

**One rule holds it together: each layer knows only the layer below it.**
`data/` does not know `logic/` exists. `logic/` does not know HTTP exists — no
`req`, no `res`, no status codes anywhere in it. That is what lets business logic
be tested without starting a server, and the AI provider be swapped without
touching it.

```
    incoming request
           │
           ▼
    routes/          which URL, which guards
           │
           ▼
    middleware/      auth → validation → role → rate limit
           │
           ▼
    controllers/     HTTP only: read input, call service, send result
           │
           ▼
    logic/impl/      ALL business rules live here
           │  │
           │  └────▶ converters/     entity → response object
           ▼
    repositories/    database queries only
           │
           ▼
    data/            Mongoose schemas → MongoDB
```

The frontend follows the same idea in a smaller way:

```
    pages/ + components/     what the user sees
           │
           ▼
    services/                one file per domain: auth, hazards, ai
           │
           ▼
    core/                    config, http, session, demo storage
```

**`core/` knows nothing about the domain.** It has no idea what a pothole is.
Domain constants like the 50-metre radius live in `services/hazardService.ts`.

---

## 5. Project structure

```
CityScan/
│
├── backend/                Express 5 + TypeScript
│   └── src/
│       ├── routes/         URL mapping and guards
│       ├── middleware/     auth, validation, roles, rate limit, errors
│       ├── controllers/    HTTP only
│       ├── boundaries/     request/response shapes + Zod schemas
│       ├── logic/          service interfaces
│       │   └── impl/       the implementations — all business logic
│       ├── converters/     entity ⇄ response object
│       ├── repositories/   database queries
│       ├── data/           Mongoose schemas, enums, demo fixtures
│       ├── errors/         exceptions carrying their own HTTP status
│       ├── config/         environment profiles + DB connection
│       ├── scripts/        seeding, cleanup
│       ├── container.ts    wires everything together
│       ├── app.ts          Express setup
│       └── server.ts       entry point
│
├── frontend/               React 19 + Vite
│   ├── public/markers/     8 map marker icons, hosted by us
│   └── src/
│       ├── core/           config · http · session · demoVault
│       ├── services/       authService · hazardService · aiService
│       ├── pages/          Login · Register · Admin · MyReports
│       ├── components/     MapComponent · ReportSidebar · NavBar · DemoBanner
│       ├── contexts/       AuthContext
│       └── data/           demo fixtures
│
├── ai-service/             FastAPI + Gemini
│   └── app/main.py
│
├── docs/                   Hebrew system guide (HTML + PDF)
├── .github/workflows/      CI, demo reset
└── docker-compose.dev.yml  local MongoDB
```

---

## 6. Tech stack

| Part | Uses |
|---|---|
| Frontend | React 19, Vite 7, TypeScript, React Router 7, Leaflet + CARTO tiles, Bootstrap 5 |
| Backend | Node 24, Express 5, TypeScript (ESM), Mongoose 9, Zod 4, JWT, bcrypt, sharp, helmet |
| AI service | Python 3.12, FastAPI, Google Gemini |
| Database | MongoDB (local Docker in dev, Atlas M0 in production) |
| Tests | Vitest, supertest, mongodb-memory-server |
| Hosting | Vercel (frontend, live), Azure planned for the backend |
| CI | GitHub Actions |

---

## 7. Commands

```bash
npm install --prefix backend && npm install --prefix frontend && npm install
```

```bash
npm run db:up --prefix backend
```
Starts the local MongoDB container. Needs Docker Desktop. Once per reboot.

```bash
npm run seed:demo --prefix backend
```
Fills the database with 15 sample hazards.

```bash
npm run dev
```
Runs backend, frontend and AI service together. Open http://localhost:5173 and
click **Sign in as Admin (Demo)**.

```bash
npm test --prefix backend
```
46 integration tests against a real disposable database. No Docker needed.

```bash
npm run build --prefix frontend
```
Type-checks and builds. Backend build is `npm run build --prefix backend`.

```bash
npx cross-env VITE_IS_DEMO=true npm run dev --prefix frontend
```
Runs the frontend exactly as the live site does. **Use this before every merge**
— see section 9.

---

## 8. Coding conventions

- **TypeScript, strict. No `any`.**
- **Backend uses semicolons, frontend does not.** Do not unify them.
- **Backend imports must end in `.js`** even for `.ts` files. Required by ESM.
- **Never pick an HTTP status outside `errors/`.** Throw `NotFoundException`,
  `ConflictException`, and so on; one middleware turns them into responses.
- **Never read `process.env` at the top of a module.** Read from `config` inside
  a function — imports run before the environment is loaded.
- **Converters build responses field by field**, never by spreading an entity.
  That is what makes a password leak structurally impossible.
- **Anything that changes coordinates must use `.save()`**, never
  `findOneAndUpdate`. Atomic updates skip the hook that keeps the geo field in
  sync, and the index goes stale with no error at all.
- **Only `core/http.ts` calls `fetch`.** Components call services, services call it.
- **Comments explain *why*, not *what*.** Sparse, but substantial where present.

---

## 9. Things that are easy to break

### The live demo is linked to a CV. It must work at all times.

`https://city-scan-tawny.vercel.app` runs **the frontend alone**. There is no
deployed backend yet. Reports are saved to `localStorage` by `core/demoVault.ts`.

- **Do not delete demo mode until a backend is actually live.** The public site
  depends on that code.
- Work on `develop`. `main` is what Vercel builds.
- **Before merging**, run with `VITE_IS_DEMO=true` and check: demo login works,
  12 markers appear, a second pothole on Dizengoff is rejected, the admin page
  loads, and the console is clean. A successful build does not prove this.
- After merging, check the live site.
- If something breaks: Vercel Instant Rollback.

### Security rules

- **Never commit a `.env` file.** Only `*.example` files belong in git. Check
  with `git ls-files | grep env`.
- **Never put a secret in a `VITE_` variable** — those are compiled into the
  public bundle.
- **Do not add a `Co-Authored-By: Claude` trailer to commits.** Nothing enforces
  this automatically.

### Current state

Done: layered backend, 46 tests, green CI, XSS fix, self-hosted map icons, CARTO
basemap, frontend split into `core/` and `services/`.

Not done: backend and AI service are not deployed; the nightly demo reset is
switched off until they are; the map still polls every 8 seconds instead of using
the SSE endpoint that already exists; frontend lint is not in CI (10 known errors).

### How to work here

The user writes in Hebrew and expects Hebrew replies; code and commits stay in
English. **Verify instead of assuming** — several bugs here were only found by
actually running something and looking at the output. Small changes, frequent
merges.

Deeper reference: the Hebrew guide in `docs/`.
