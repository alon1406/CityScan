# CityScan AI Service

External AI service for duplicate detection in hazard reports (same hazard/location).

## Installation

```bash
cd ai-service
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
# source venv/bin/activate
pip install -r requirements.txt
```

## Configuration

Set in `.env` (create the file if needed, do not rely only on .env.example):

- `GEMINI_API_KEY` — API key from https://ai.google.dev (required for duplicate detection)
- `PORT` — Port (default 8001)

## Running

**Run the full project (backend + frontend + ai-service):** From the `CityScan` root:

```bash
npm run dev
```

**Run only the AI service:**

```bash
cd ai-service
venv\Scripts\activate   # Windows
uvicorn app.main:app --reload --port 8001
```

## API

- **GET /health** — Health check.
- **POST /check-duplicate** — Check whether a new report describes the same hazard as an existing one.

### Request (POST /check-duplicate)

```json
{
  "existing_hazards": [
    { "_id": "abc123", "type": "pothole", "status": "open", "description": "Large pothole" }
  ],
  "new_report": {
    "type": "pothole",
    "description": "Big hole in the road",
    "address": "Main St 5"
  }
}
```

### Response

```json
{
  "is_duplicate": true,
  "matching_hazard_id": "abc123"
}
```

The CityScan backend calls this service when `AI_SERVICE_URL` is set (e.g. `http://localhost:8001`).
