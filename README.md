<<<<<<< HEAD
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
=======
# CityScan

**Turn every citizen into a city sensor.** CityScan is a map-based platform where residents report urban hazards—potholes, broken streetlights, debris, flooding—and see them on a live, shared map. One place for reports, one view for the city: fewer duplicate tickets, clearer priorities, and a single source of truth for what needs fixing.

> **🤖 AI-powered:** CityScan uses **AI (Google Gemini)** to detect duplicate reports: when you report a hazard, the system checks whether the same issue was already reported within **50m** and shows a clear message — *"This hazard was already reported; no need to report it again on the map"* — and blocks duplicate submissions.

---

## Why CityScan?

Municipalities drown in duplicate reports; residents don't know if someone already reported the same pothole. CityScan fixes both:

- **Report** — Sign in, pick a spot on the map (or search by address), choose a hazard type, add a description and photos, and submit. Your report is stored and linked to your account.
- **See what's already there** — All open hazards appear on the map. When you open the report form at a location, you see existing reports nearby and can skip submitting a duplicate.
- **AI-backed duplicate check** — An optional service (Google Gemini) checks whether your new report describes the same hazard as an existing one (e.g. the same pothole on the same street). The app can suggest “this may already be reported” so you can skip or submit anyway.

**Result:** fewer duplicate tickets, better prioritization for maintenance, and one up-to-date map of hazards for everyone.

---

## How It Works

1. **Frontend (React + Vite)**  
   - Asks for the user’s location and shows an interactive map (Leaflet/OpenStreetMap).  
   - User can search by address (Nominatim) or click on the map to choose a spot.  
   - Hazards from the backend are shown as markers; the user’s position and the selected report location are highlighted.  
   - To report: user opens the report sidebar, fills type/description (and optionally photos), and submits. The app calls the backend only when the user is signed in.  
   - Before submitting, the app fetches “nearby” open hazards. If the AI service is enabled, it can also suggest “this might be the same hazard” and offer to skip submitting.

2. **Backend (Node.js + Express + MongoDB)**  
   - **Auth:** Register and login (JWT). Only authenticated users can create, update, or delete their own reports.  
   - **Hazards:** Create, list, get one, update, delete. List supports filters (e.g. status, type).  
   - **Nearby:** `GET /hazards/nearby?latitude=&longitude=&radiusMeters=` returns open/in-progress hazards within a radius (GeoJSON + 2dsphere index).  
   - **Duplicate check:** `POST /hazards/check-same-hazard` accepts the draft report and calls the external AI service; it returns whether it looks like a duplicate and, if so, which hazard id.  
   - All new/updated hazards are stored with coordinates and an optional GeoJSON `location` for geo queries.

3. **AI service (Python + FastAPI + Gemini)**  
   - Separate microservice that receives “existing hazards in this area” + “new report” and asks Google Gemini whether the new report describes the same hazard as one of the existing ones.  
   - Returns `is_duplicate` and optional `matching_hazard_id`.  
   - If the backend has `AI_SERVICE_URL` set, it calls this service; otherwise the duplicate-check endpoint still works but always returns “not duplicate.”

4. **Real-time feel**  
   - The frontend polls the hazards list every few seconds so that new reports from other users appear on the map without refreshing the page.

End-to-end: **User A** reports a pothole → backend saves it → **User B** opens the report form at the same spot → sees “X open hazards in this area” and, if AI is on, “this may be the same hazard” → can skip submitting or submit anyway. The map shows all hazards for everyone.

---

## Flow diagrams

### High-level: User → Frontend → Backend → DB / AI

```mermaid
flowchart LR
    subgraph User
        U[User]
    end
    subgraph Frontend["Frontend (React)"]
        Map[Map + report sidebar]
        Auth[Login / register]
    end
    subgraph Backend["Backend (Express)"]
        API[API: hazards, auth, users]
    end
    subgraph Data
        DB[(MongoDB)]
        AI[AI service - Gemini]
    end
    U --> Map
    U --> Auth
    Map --> API
    Auth --> API
    API --> DB
    API --> AI
```

### Detailed: Report submission and duplicate check

```mermaid
sequenceDiagram
    participant User
    participant FE as Frontend
    participant BE as Backend
    participant DB as MongoDB
    participant AI as AI Service (Gemini)

    User->>FE: Pick location + hazard type + description
    FE->>BE: GET /hazards/nearby (lat, lng, radius)
    BE->>DB: Geo query (GeoJSON)
    DB-->>BE: Nearby hazards list
    BE-->>FE: Nearby hazards

    opt If AI enabled
        FE->>BE: POST /hazards/check-same-hazard (draft)
        BE->>AI: POST /check-duplicate (existing + new report)
        AI-->>BE: is_duplicate, matching_hazard_id
        BE-->>FE: Is duplicate?
        FE->>User: "Looks like same hazard — continue anyway?"
    end

    User->>FE: Submit report
    FE->>BE: POST /hazards (JWT + report data)
    BE->>DB: Save new hazard
    DB-->>BE: OK
    BE-->>FE: Hazard created
    FE->>User: Report appears on map
```

### Polling: how the map stays up to date

```mermaid
flowchart TD
    subgraph Frontend
        Poll[Periodic GET /hazards]
        Map[Update map markers]
    end
    subgraph Backend
        List[List hazards]
    end
    subgraph DB
        MongoDB[(MongoDB)]
    end
    Poll --> List
    List --> MongoDB
    List --> Map
```

---

## Project structure

### Root

| Path | Description |
|------|-------------|
| **`package.json`** | Scripts to run all services: `npm run dev` starts backend, frontend, and ai-service in parallel via `concurrently`. |
| **`scripts/start-ai.js`** | Node script that starts the AI service (Python): looks for `venv` in `ai-service/` and runs `uvicorn` on port 8001. |

---

### `frontend/` — React + TypeScript + Vite

Web app: interactive map, hazard reporting, and auth.

| Path | Description |
|------|-------------|
| **`src/App.tsx`** | App entry: React Router and main pages. |
| **`src/main.tsx`** | React bootstrap (wraps app in AuthProvider and Router). |
| **`src/index.css`**, **`src/App.css`** | Global and app styles. |
| **`src/contexts/AuthContext.tsx`** | Global auth state: token, user, login, register, logout. |
| **`src/api/client.ts`** | HTTP client for API: auth and hazards (list, nearby, check-same-hazard, create, update, delete). |
| **`src/components/MapComponent.tsx`** | Leaflet/OpenStreetMap map: hazard markers, user location, address search (Nominatim), click to pick a point. |
| **`src/components/ReportSidebar.tsx`** | Report sidebar: hazard type, description, photos; calls nearby and check-same-hazard before submit; submits report to backend. |
| **`src/components/NavBar.tsx`** | Top nav: links and login/register. |
| **`src/pages/LoginPage.tsx`** | Login page (email + password). |
| **`src/pages/RegisterPage.tsx`** | Register page. |
| **`vite.config.ts`**, **`tsconfig.*.json`** | Vite and TypeScript config. |
| **`package.json`** | Dependencies: React, React Router, Leaflet, react-leaflet, Bootstrap, etc. |

---

### `backend/` — Node.js + Express + MongoDB

REST API: auth, users, hazards (including nearby and check-same-hazard), and logs.

| Path | Description |
|------|-------------|
| **`src/app.ts`** | Express app: CORS, helmet, JSON, rate limiting; mounts routes; global error handler; DB connect and server start. |
| **`src/config/db.ts`** | MongoDB connection (Mongoose); uses `MONGODB_URI` or `MONGO_URI`. |
| **`src/routes/index.ts`** | Exports all routers: health, auth, users, hazards, logs. |
| **`src/routes/auth.ts`** | POST `/auth/register`, POST `/auth/login`; returns JWT + user. |
| **`src/routes/users.ts`** | User endpoints. |
| **`src/routes/hazards.ts`** | GET `/`, GET `/nearby`, GET `/:id`, POST `/check-same-hazard` (public); POST `/`, PATCH `/:id`, DELETE `/:id` (auth required). |
| **`src/routes/logs.ts`** | Log endpoints. |
| **`src/routes/health.ts`** | Health check. |
| **`src/controllers/auth.ts`** | Register/login logic (bcrypt, JWT). |
| **`src/controllers/users.ts`** | User logic. |
| **`src/controllers/hazards.ts`** | Hazard CRUD; listNearby (geo query); checkSameHazard — calls AI service when `AI_SERVICE_URL` is set. |
| **`src/controllers/logs.ts`** | Log logic. |
| **`src/services/aiServiceClient.ts`** | HTTP client for AI service: sends existing hazards + new report; returns is_duplicate and matching_hazard_id. |
| **`src/services/jwt.ts`** | JWT sign and verify. |
| **`src/models/User.ts`** | Mongoose user schema (email, hashed password, etc.). |
| **`src/models/Hazard.ts`** | Mongoose hazard schema: type, status, coordinates, location (GeoJSON), description; 2dsphere index for nearby. |
| **`src/models/Log.ts`** | Log schema. |
| **`src/models/index.ts`** | Model exports. |
| **`src/middleware/auth.middleware.ts`** | JWT auth middleware; attaches user to request. |
| **`src/middleware/validate.ts`** | Body/params validation. |
| **`src/middleware/rateLimiter.ts`** | Rate limiting (global and auth). |
| **`src/middleware/index.ts`** | Middleware exports. |
| **`.env`** | `MONGODB_URI`, `JWT_SECRET`, `PORT`, `FRONTEND_URL`, `AI_SERVICE_URL`. |

---

### `ai-service/` — Python + FastAPI + Google Gemini

Microservice for duplicate detection: decides if a new report describes the same hazard as an existing one.

| Path | Description |
|------|-------------|
| **`app/main.py`** | FastAPI app: CORS; models (ExistingHazard, NewReport, CheckDuplicateRequest/Response); single endpoint `POST /check-duplicate`. |
| **`app/__init__.py`** | Package init. |
| **`requirements.txt`** | fastapi, uvicorn, google-generativeai, pydantic, python-dotenv. |
| **`.env`** | `GEMINI_API_KEY` — without it, the service always returns “not duplicate”. |
| **`venv/`** | Python venv (created manually; used by `scripts/start-ai.js`). |

**Flow:** Backend sends `existing_hazards` and `new_report` → service builds a prompt for Gemini → Gemini returns whether it’s the same hazard → service returns `is_duplicate` and optional `matching_hazard_id`.

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, React Router, Leaflet, Bootstrap.  
- **Backend:** Node.js, Express, TypeScript, Mongoose, JWT, bcrypt.  
- **Database:** MongoDB (with GeoJSON for “nearby” queries).  
- **AI:** Python 3, FastAPI, Google Gemini (e.g. `gemini-1.5-flash`).  

---

## Getting Started

### Prerequisites

- **Node.js** (v18+)
- **npm**
- **MongoDB** (local or Atlas connection string)
- **Python 3** (for ai-service; venv is created in `ai-service/`)

### 1. Install dependencies

From the **project root** (`CityScan/`):

```bash
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

For the AI service (first time only):

```bash
cd ai-service
python -m venv venv
# Windows:
venv\Scripts\activate
venv\Scripts\pip install -r requirements.txt
# Linux/macOS:
# source venv/bin/activate && pip install -r requirements.txt
cd ..
```

### 2. Environment files

Create and fill `.env` where needed (use `.env.example` as a template).

| Location        | File            | Required variables |
|----------------|-----------------|--------------------|
| **backend**    | `backend/.env`  | `MONGODB_URI`, `JWT_SECRET`. Optional: `PORT`, `FRONTEND_URL`, `AI_SERVICE_URL`. |
| **frontend**   | `frontend/.env` | Optional: `VITE_API_URL=http://localhost:5000` (default is already 5000). For public demo without backend: `VITE_IS_DEMO=true`. |
| **ai-service**| `ai-service/.env` | Optional: `GEMINI_API_KEY` (from [Google AI](https://ai.google.dev)). Without it, duplicate check always returns “not duplicate”. |

- **Backend** reads `MONGODB_URI` (and optionally `MONGO_URI`) for the database.  
- **Backend** uses `AI_SERVICE_URL` (e.g. `http://localhost:8001`) to call the AI service; if unset, check-same-hazard still works but does not call AI.

### 3. Run everything

From the **project root**:

```bash
npm run dev
```

This starts:

- **Backend** — `http://localhost:5000`
- **Frontend** — Vite dev server (e.g. `http://localhost:5173` or next free port)
- **AI service** — `http://localhost:8001`

Open the frontend URL in the browser. You can register, sign in, and start reporting hazards on the map.

### Run individual services

- Backend only: `npm run dev --prefix backend`
- Frontend only: `npm run dev --prefix frontend`
- AI only: `cd ai-service && venv\Scripts\activate && uvicorn app.main:app --reload --port 8001` (Windows; adjust for Linux/macOS)

---

## API overview (backend)

| Method | Path | Description |
|--------|------|-------------|
| POST   | `/auth/register` | Register (email, password, optional name). Returns JWT + user. |
| POST   | `/auth/login`    | Login. Returns JWT + user. |
| GET    | `/hazards`      | List hazards (optional: `limit`, `status`, `type`). Public. |
| GET    | `/hazards/nearby` | Open/in-progress hazards near a point (`latitude`, `longitude`, `radiusMeters`). Public. |
| POST   | `/hazards/check-same-hazard` | Body: type, description?, latitude, longitude, address?. Returns isDuplicate, optional matchingHazardId. Calls AI service if configured. |
| POST   | `/hazards`       | Create hazard (auth). Body: type, latitude, longitude, description?. |
| GET    | `/hazards/:id`  | Get one hazard. Public. |
| PATCH  | `/hazards/:id`  | Update hazard (auth; reporter only). |
| DELETE | `/hazards/:id`  | Delete hazard (auth; reporter only). |

---

## Database (MongoDB)

The backend uses **MongoDB** and connects with `MONGODB_URI` from `.env`. Data is stored in the database named **`cityscan`** (or set `MONGODB_DB_NAME`).

- **Connection:** Ensure `MONGODB_URI` is set (e.g. `mongodb+srv://user:pass@cluster.mongodb.net/`). No spaces before/after the value.
- **MongoDB Atlas:** In Network Access, allow your IP (or `0.0.0.0/0` for testing). Check that the user has read/write access to the database.
- **First run:** The app creates the database and collections on first write (e.g. when you register or create a hazard).

---

## Dual-Mode: Demo vs Full Backend

The app supports two modes so you can run a **live public demo without any backend**, while keeping the full Node.js/MongoDB backend for local development and GitHub.

**What was implemented:**

- A global `IS_DEMO` flag (from `VITE_IS_DEMO` in the frontend env). When true, the API client in `frontend/src/api/client.ts` intercepts all data-fetching and data-mutating calls.
- **GET requests:** Still call the backend when available; the response is then merged with the `demo_vault` in `localStorage`. If the backend is down, only vault data is used so the UI still works after refresh.
- **POST/PATCH/DELETE:** No backend calls; updates are applied only to `demo_vault`, and the client returns mock success so the UI behaves as if the backend accepted the change.
- A **DemoBanner** component is shown when demo mode is on, with the message: *Demo mode active: changes are saved in your browser only.*
- `.gitignore` is set to exclude `.env` and `.env.*` so secrets and local demo flags are not committed.

### Environment flag

- **Vite (this project):** Set `VITE_IS_DEMO=true` in `frontend/.env` to enable demo mode.
- **Create React App:** You would use `REACT_APP_IS_DEMO=true`; the same logic applies in the frontend.

When `IS_DEMO` is true, the frontend uses a global constant (from the env) and intercepts all API usage in `frontend/src/api/client.ts`.

### Behavior when demo mode is on

| Request type | Behavior |
|--------------|----------|
| **GET** (hazards, nearby, admin list, etc.) | Tries to fetch from the real API once to populate the UI. The result is then merged with any changes stored in `localStorage` under the key `demo_vault`. If the API is unavailable (e.g. no backend), only `demo_vault` data is used. |
| **POST / PATCH / DELETE** | No backend calls. Updates are written to `demo_vault` in `localStorage`, and the client returns a mock successful response. |

So in demo mode:

- Login, register, and “Sign in as Admin/User (demo)” return mock tokens and users so the UI works without auth endpoints.
- Creating a report or updating a hazard status only updates `demo_vault`; nothing is sent to the server.
- Refreshing the page keeps those changes, because they are read from `demo_vault` and merged back into the data the UI displays.

### UI indicator

When `VITE_IS_DEMO=true`, a yellow **DemoBanner** at the top of the app shows: *“Demo mode active: changes are saved in your browser only.”* so users know data is local only.

### Summary

- **Demo mode (`VITE_IS_DEMO=true`):** No backend required. All mutations are stored in `localStorage`; GETs merge API data (if any) with `demo_vault`. Safe for a public demo or static hosting.
- **Normal mode (flag unset or false):** All requests go to your Node.js/MongoDB backend as usual.

Backend and AI service code remain unchanged on GitHub; only the frontend switches behavior based on the env flag.

---

## Demo login (when using the full backend)

The login page offers two demo buttons when the backend is available:

- **Sign in as Admin (demo)** — logs in as demo admin (`admin-demo@cityscan.demo`). The backend may restrict some actions in its own demo mode.
- **Sign in as User (demo)** — logs in as a regular demo user (`demouser@cityscan.demo`).

**Setup (only if you run the backend):** Ensure these users exist in MongoDB with password `demo123`. For the demo admin, set `role: "admin"`. Example (MongoDB shell or Compass):

```js
// Create or update demo admin (role admin)
db.users.updateOne(
  { email: "admin-demo@cityscan.demo" },
  { $set: { email: "admin-demo@cityscan.demo", role: "admin", name: "admin-demo" } },
  { upsert: true }
)
```

The demo user can be created by registering from the app or by inserting a user document with a bcrypt-hashed password.

---

## License

See repository or project metadata.
>>>>>>> temp-fix
