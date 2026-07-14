import os
import json
import re
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from groq import Groq

from resolver import load_entities, naive_scan, extract_candidates, apply_resolutions, build_groq_prompt_batched

load_dotenv()

app = FastAPI(title="War Era Name Resolver")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "ok"}


ENTITIES = load_entities()
TOTAL = sum(len(m) for m in ENTITIES.values())

GROQ_KEY = os.getenv("GROQ_API_KEY", "")
groq_client = Groq(api_key=GROQ_KEY) if GROQ_KEY else None

BATCH_SIZE = 40


class ResolveRequest(BaseModel):
    text: str
    mode: str = "smart"  # "smart" or "naive"


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

    matches = naive_scan(text, ENTITIES)

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

    # Smart mode — use Groq
    if not groq_client:
        # Fallback to naive if no API key
        result = apply_resolutions(text, [m for m in matches])
        return ResolveResponse(
            result=result,
            matches_found=len(matches),
            matches_confirmed=len(matches),
            method="naive-fallback",
        )

    # Process in batches
    candidates = extract_candidates(text, matches)
    confirmed = []

    for batch_start in range(0, len(candidates), BATCH_SIZE):
        batch = candidates[batch_start : batch_start + BATCH_SIZE]
        prompt = build_groq_prompt_batched(text, batch, batch_start)

        try:
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=200,
            )
            raw = response.choices[0].message.content.strip()
            # Parse JSON array from response
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
        except Exception as e:
            # On error, include this batch as naive
            for c in batch:
                confirmed.append({
                    "start": c["start"],
                    "end": c["end"],
                    "url": "",
                })

    result = apply_resolutions(text, confirmed)
    return ResolveResponse(
        result=result,
        matches_found=len(matches),
        matches_confirmed=len(confirmed),
        method="smart",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
