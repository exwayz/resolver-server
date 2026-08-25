import os
import json
import re
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from groq import Groq

from resolver import load_entities, naive_scan, extract_candidates, apply_resolutions, build_groq_prompt_batched

app = FastAPI(title="War Era Name Resolver")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

ENTITIES = load_entities()
TOTAL = sum(len(m) for m in ENTITIES.values())

GROQ_KEY = os.getenv("GROQ_API_KEY", "")
groq_client = Groq(api_key=GROQ_KEY) if GROQ_KEY else None

BATCH_SIZE = 40


class ResolveRequest(BaseModel):
    text: str
    mode: str = "smart"
    blacklist: list[str] = []


class ResolveResponse(BaseModel):
    result: str
    matches_found: int
    matches_confirmed: int
    method: str


@app.get("/api/info")
def info():
    return {
        "total_entities": TOTAL,
        "categories": {cat: len(m) for cat, m in ENTITIES.items()},
        "groq_available": groq_client is not None,
    }


@app.post("/api/resolve", response_model=ResolveResponse)
def resolve(req: ResolveRequest):
    text = req.text
    if not text.strip():
        raise HTTPException(status_code=400, detail="Empty text")

    matches = naive_scan(text, ENTITIES, set(req.blacklist))

    if not matches:
        return ResolveResponse(result=text, matches_found=0, matches_confirmed=0, method="naive")

    if req.mode == "naive":
        result = apply_resolutions(text, [m for m in matches])
        return ResolveResponse(
            result=result,
            matches_found=len(matches),
            matches_confirmed=len(matches),
            method="naive",
        )

    if not groq_client:
        result = apply_resolutions(text, [m for m in matches])
        return ResolveResponse(
            result=result,
            matches_found=len(matches),
            matches_confirmed=len(matches),
            method="naive-fallback",
        )

    candidates = extract_candidates(text, matches)
    confirmed = []

    for batch_start in range(0, len(candidates), BATCH_SIZE):
        batch = candidates[batch_start : batch_start + BATCH_SIZE]
        prompt = build_groq_prompt_batched(text, batch, batch_start)

        try:
            response = groq_client.chat.completions.create(
                model="qwen/qwen3.6-27b",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=200,
            )
            raw = response.choices[0].message.content.strip()
            raw = re.sub(r"```json\s*|```\s*", "", raw)
            indices = json.loads(raw)
            for idx in indices:
                if isinstance(idx, int) and 0 <= idx < len(candidates):
                    c = candidates[idx]
                    confirmed.append({
                        "start": c["start"],
                        "end": c["end"],
                        "url": matches[idx]["url"],
                    })
        except Exception:
            for j, c in enumerate(batch):
                match_idx = batch_start + j
                if match_idx < len(matches):
                    confirmed.append({
                        "start": c["start"],
                        "end": c["end"],
                        "url": matches[match_idx]["url"],
                    })

    result = apply_resolutions(text, confirmed)
    return ResolveResponse(
        result=result,
        matches_found=len(matches),
        matches_confirmed=len(confirmed),
        method="smart",
    )
