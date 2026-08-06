import re
import os
import json

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

CATEGORY_PREFIXES = {
    "country":  "/country",
    "region":   "/region",
    "alliance": "/alliance",
    "party":    "/party",
    "mu":       "/mu",
    "user":     "/user",
}

CATEGORY_FILES = {
    "country":  "AllCountriesLink.md",
    "region":   "allRegion.md",
    "alliance": "allAlliances.md",
    "party":    "allParties.md",
    "mu":       "allMU.md",
    "user":     "allUsers.md",
}


def load_entities(data_dir=None):
    """Load all entity files and return {category: {name: url}}."""
    d = data_dir or DATA_DIR
    entities = {}
    for cat, filename in CATEGORY_FILES.items():
        filepath = os.path.join(d, filename)
        mapping = {}
        if os.path.exists(filepath):
            prefix = CATEGORY_PREFIXES[cat]
            with open(filepath, "r", encoding="utf-8") as f:
                for line in f:
                    m = re.search(
                        r"\[(.+)\]\(" + re.escape(prefix) + r"/([^)]+)\)", line
                    )
                    if m:
                        name = m.group(1).replace(" *", "")
                        uid = m.group(2)
                        mapping[name] = f"{prefix}/{uid}"
        entities[cat] = mapping
    return entities


def naive_scan(text, entities):
    """
    Left-to-right greedy scan. Returns list of (start, end, name, url, category)
    sorted by position. No context filtering — matches everything.
    """
    # Build combined list sorted longest-first
    combined = []
    for cat, mapping in entities.items():
        for name, url in mapping.items():
            combined.append((name, url, cat))
    combined.sort(key=lambda x: len(x[0]), reverse=True)

    matches = []
    i = 0
    while i < len(text):
        matched = False
        for name, url, cat in combined:
            if text[i : i + len(name)] == name:
                bo = (i == 0) or not text[i - 1].isalnum()
                end = i + len(name)
                ao = (end == len(text)) or not text[end].isalnum()
                if bo and ao:
                    matches.append({
                        "start": i,
                        "end": end,
                        "name": name,
                        "url": url,
                        "category": cat,
                    })
                    i = end
                    matched = True
                    break
        if not matched:
            i += 1
    return matches


def extract_candidates(text, matches, context_chars=60):
    """For each match, extract the surrounding context window."""
    candidates = []
    for m in matches:
        start = max(0, m["start"] - context_chars)
        end = min(len(text), m["end"] + context_chars)
        ctx = text[start : m["start"]] + ">>>" + text[m["start"] : m["end"]] + "<<<" + text[m["end"] : end]
        candidates.append({
            "start": m["start"],
            "end": m["end"],
            "name": m["name"],
            "category": m["category"],
            "context": ctx,
        })
    return candidates


def apply_resolutions(text, confirmed):
    """Apply confirmed resolutions to text. confirmed = list of {start, end, url}."""
    # Sort by position descending so we replace from end to start
    confirmed.sort(key=lambda x: x["start"], reverse=True)
    result = text
    for c in confirmed:
        result = result[: c["start"]] + c["url"] + " " + result[c["end"] :]
    return result


def build_groq_prompt(text, candidates):
    """Build the prompt for Groq to filter false positives."""
    candidate_lines = []
    for i, c in enumerate(candidates):
        candidate_lines.append(
            f'{i}. [{c["category"]}] "{c["name"]}" — context: {c["context"]}'
        )

    candidate_block = "\n".join(candidate_lines)

    prompt = f"""You are a text resolver for a gaming platform (War Era).

Given a text and a list of candidate entity names found by naive string matching, determine which candidates are ACTUALLY being used as entity references (country, region, alliance, party, military unit, or player username) versus being used as ordinary words.

 Rules:
- A name is an ENTITY REFERENCE if the context makes clear it refers to a specific game entity (country, region, alliance, party, military unit, or player username).
- A name is NOT an entity if it's clearly used as a regular English word (e.g., "chaos" meaning disorder, "reunion" meaning gathering, "air" meaning atmosphere).
- Player usernames may contain underscores and numbers (e.g., "Player_Name_XIII").
- Pay attention to capitalization, surrounding words, and sentence structure.
- If ambiguous, lean towards entity reference (the game uses these names in narrative text).

TEXT:
{text}

CANDIDATES:
{candidate_block}

Return ONLY a JSON array of the indices (0-based) of candidates that ARE real entity references. No explanation.
Example: [0, 2, 5]

If none are real, return: []"""

    return prompt


def build_groq_prompt_batched(text, batch_candidates, batch_offset):
    """Build prompt for a batch of candidates."""
    candidate_lines = []
    for i, c in enumerate(batch_candidates):
        idx = batch_offset + i
        candidate_lines.append(
            f'{idx}. [{c["category"]}] "{c["name"]}" — context: {c["context"]}'
        )

    candidate_block = "\n".join(candidate_lines)

    prompt = f"""You are a text resolver for a gaming platform (War Era).

Given a text and candidate entity names found by string matching, determine which are ACTUALLY entity references vs ordinary English words.

 Rules:
- Entity reference: context clearly refers to a game entity (country, region, alliance, party, military unit, or player username).
- NOT entity: used as a regular word (e.g., "chaos" = disorder, "reunion" = gathering, "air" = atmosphere, "After Party" = social event).
- Player usernames may contain underscores and numbers (e.g., "Player_Name_XIII").
- Capitalization and surrounding words matter.
- If ambiguous, lean towards entity reference.

TEXT:
{text}

CANDIDATES:
{candidate_block}

Return ONLY a JSON array of the indices that ARE real entity references. Example: [0, 2, 5]
If none, return: []"""

    return prompt
