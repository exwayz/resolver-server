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
}

CATEGORY_FILES = {
    "country":  "AllCountriesLink.md",
    "region":   "allRegion.md",
    "alliance": "allAlliances.md",
    "party":    "allParties.md",
    "mu":       "allMU.md",
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
                        r"\[([^\]]+)\]\(" + re.escape(prefix) + r"/([^)]+)\)", line
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

    prompt = f"""You are a text resolver for a gaming platform called War Era.

The platform uses real-world country names, region names, alliance names, party names, and military unit names as in-game entities. Players write news articles about wars, politics, and alliances using these entity names.

Given a text and candidate entity names found by string matching, decide which are real entity references.

ACCEPT as entity reference if:
- It's a country name (Pakistan, India, USA, etc.) used in a war/politics context
- It's a region name used in a geographic/battle context
- It's an alliance, party, or military unit name referenced in game context
- The text discusses wars, battles, diplomacy, politics, or economy

REJECT as false positive ONLY if:
- It's a punctuation/formatting character used as a separator (e.g., "---", "===", "***")
- It's a username with underscores (e.g., "Player_Name_XIII")
- It's clearly an ordinary English word with no game context (e.g., "reunion" meaning gathering, "air" meaning atmosphere)
- It's a random short string or abbreviation with zero game context

IMPORTANT: Country names like Pakistan, India, USA, etc. in a war/news context are ALWAYS real entity references. Do NOT reject them.

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

    prompt = f"""You are a text resolver for a gaming platform called War Era.

The platform uses real-world country names, region names, alliance names, party names, and military unit names as in-game entities. Players write news articles about wars, politics, and alliances using these entity names.

Given a text and candidate entity names found by string matching, decide which are real entity references.

ACCEPT as entity reference if:
- It's a country name (Pakistan, India, USA, etc.) used in a war/politics context
- It's a region name used in a geographic/battle context
- It's an alliance, party, or military unit name referenced in game context
- The text discusses wars, battles, diplomacy, politics, or economy

REJECT as false positive ONLY if:
- It's a punctuation/formatting character used as a separator (e.g., "---", "===", "***")
- It's a username with underscores (e.g., "Player_Name_XIII")
- It's clearly an ordinary English word with no game context (e.g., "reunion" meaning gathering, "air" meaning atmosphere)
- It's a random short string or abbreviation with zero game context

IMPORTANT: Country names like Pakistan, India, USA, etc. in a war/news context are ALWAYS real entity references. Do NOT reject them.

TEXT:
{text}

CANDIDATES:
{candidate_block}

Return ONLY a JSON array of the indices (0-based) of candidates that ARE real entity references. Example: [0, 2, 5]
If none are real, return: []"""

    return prompt
