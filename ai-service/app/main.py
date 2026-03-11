"""
CityScan AI Service — duplicate hazard detection + image analysis via Google Gemini.
Run: uvicorn app.main:app --reload --port 8001

Security: Set AI_SERVICE_API_KEY and CORS_ORIGINS in production.
Protected endpoints (/analyze, /check-duplicate) require X-API-Key header.
"""
import base64
import json
import os
import re
from typing import Optional

import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

if os.environ.get("GEMINI_API_KEY"):
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])

# CORS: set CORS_ORIGINS to comma-separated origins (e.g. https://yourapp.vercel.app,http://localhost:3000).
# Empty or unset = no browser cross-origin access (server-to-server only).
_cors_origins = os.environ.get("CORS_ORIGINS", "").strip()
CORS_ORIGINS = [o.strip() for o in _cors_origins.split(",") if o.strip()]

app = FastAPI(title="CityScan AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,  # Set CORS_ORIGINS in .env (e.g. https://yourapp.vercel.app,http://localhost:3000)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> None:
    """Require X-API-Key header when AI_SERVICE_API_KEY is set (production)."""
    expected = os.environ.get("AI_SERVICE_API_KEY", "").strip()
    if not expected:
        return  # No key configured: allow (local dev)
    if not x_api_key or not secrets_compare(x_api_key, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")


def secrets_compare(a: str, b: str) -> bool:
    """Constant-time comparison to avoid timing leaks."""
    if len(a) != len(b):
        return False
    return sum(ord(x) ^ ord(y) for x, y in zip(a, b)) == 0


# --- Request/Response models (snake_case for Python API) ---

class ExistingHazard(BaseModel):
    _id: str
    type: str
    status: str
    description: Optional[str] = None


class NewReport(BaseModel):
    type: str
    description: Optional[str] = None
    address: Optional[str] = None


class CheckDuplicateRequest(BaseModel):
    existing_hazards: list[ExistingHazard]
    new_report: NewReport


class CheckDuplicateResponse(BaseModel):
    is_duplicate: bool
    matching_hazard_id: Optional[str] = None


class AnalyzeRequest(BaseModel):
    """Base64 image (data URL or raw base64)."""
    image: str


class AnalyzeResponse(BaseModel):
    description: str


def check_same_hazard(existing_hazards: list[ExistingHazard], new_report: NewReport) -> CheckDuplicateResponse:
    """Call Google Gemini to determine if the new report describes the same hazard as an existing one."""
    if not os.environ.get("GEMINI_API_KEY") or not existing_hazards:
        return CheckDuplicateResponse(is_duplicate=False, matching_hazard_id=None)

    existing_list = "\n".join(
        f"- ID: {h._id}, type: {h.type}, status: {h.status}"
        + (f", description: {h.description}" if h.description else "")
        for h in existing_hazards
    )

    new_desc = f", description: {new_report.description}" if new_report.description else ""
    new_addr = f", address/street: {new_report.address}" if new_report.address else ""
    prompt = f"""You are a duplicate detector for urban hazard reports (potholes, broken streetlights, etc.).

Existing open hazards in the same area:
{existing_list}

New report: type={new_report.type}{new_desc}{new_addr}

Is the new report describing the SAME hazard as one of the existing ones? Same street/location + same type of problem = likely same. Different type or clearly different location = not duplicate.

Reply with ONLY a JSON object, no other text: {{"isDuplicate": true or false, "matchingHazardId": "the _id string" or null}}
If isDuplicate is true, matchingHazardId must be one of the IDs from the list. If false, matchingHazardId must be null."""

    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        resp = model.generate_content(prompt, generation_config={"temperature": 0})
        content = (resp.text or "").strip()
        if not content:
            return CheckDuplicateResponse(is_duplicate=False, matching_hazard_id=None)

        json_match = re.search(r"\{[\s\S]*\}", content)
        if not json_match:
            return CheckDuplicateResponse(is_duplicate=False, matching_hazard_id=None)

        parsed = json.loads(json_match.group())
        is_dup = bool(parsed.get("isDuplicate"))
        match_id = parsed.get("matchingHazardId")
        if is_dup and match_id and any(h._id == match_id for h in existing_hazards):
            return CheckDuplicateResponse(is_duplicate=True, matching_hazard_id=match_id)
        return CheckDuplicateResponse(is_duplicate=False, matching_hazard_id=None)

    except Exception as e:
        print("check_same_hazard error:", e)
        return CheckDuplicateResponse(is_duplicate=False, matching_hazard_id=None)


def _analyze_hazard_image(image_b64: str) -> str:
    """Use Gemini vision to describe the hazard in the image. Returns a short description."""
    if not os.environ.get("GEMINI_API_KEY"):
        return ""
    raw = image_b64.strip()
    mime_type = "image/jpeg"
    if raw.startswith("data:"):
        prefix, _, raw = raw.partition(",")
        if "image/png" in prefix:
            mime_type = "image/png"
        elif "image/webp" in prefix:
            mime_type = "image/webp"
    if not raw:
        return ""
    try:
        image_bytes = base64.b64decode(raw)
    except Exception:
        return ""
    try:
        import io
        import PIL.Image
        img = PIL.Image.open(io.BytesIO(image_bytes))
        model = genai.GenerativeModel("gemini-1.5-flash")
        resp = model.generate_content(
            [
                "This image is from a citizen report of an urban hazard (pothole, broken streetlight, debris, flooding, etc.). "
                "In one or two short sentences, describe what you see: the type of hazard and its condition. "
                "Write in plain English, no bullet points.",
                img,
            ],
            generation_config={"temperature": 0.3},
        )
        return (resp.text or "").strip() or ""
    except ImportError:
        # No PIL: try inline_data dict with bytes
        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            resp = model.generate_content(
                [
                    "This image is from a citizen report of an urban hazard. In one or two short sentences, describe what you see.",
                    {"inline_data": {"mime_type": mime_type, "data": image_bytes}},
                ],
                generation_config={"temperature": 0.3},
            )
            return (resp.text or "").strip() or ""
        except Exception as e:
            print("analyze image error (no PIL):", e)
            return ""
    except Exception as e:
        print("analyze image error:", e)
        return ""


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(body: AnalyzeRequest, _: None = Depends(require_api_key)):
    """Analyze a hazard photo and return an AI-generated description (for demo mode)."""
    if not os.environ.get("GEMINI_API_KEY"):
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not set. Add it to ai-service/.env")
    desc = _analyze_hazard_image(body.image)
    return AnalyzeResponse(description=desc or "No description generated.")


@app.post("/check-duplicate", response_model=CheckDuplicateResponse)
def check_duplicate(body: CheckDuplicateRequest, _: None = Depends(require_api_key)):
    """Check if the new report is a duplicate of an existing hazard in the same area."""
    return check_same_hazard(body.existing_hazards, body.new_report)
