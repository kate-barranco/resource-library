#!/usr/bin/env python3
"""
Deduplicates data/raw/live.json by normalized URL, merging rows that were
filed under multiple thematic sheet tabs into a single resource record with
a merged categories[] list.

Source: data/raw/live.json (output of extract.py)
Output: data/raw/live_deduped.json

Run: python3 scripts/dedup.py
"""
import json
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "raw" / "live.json"
OUT = ROOT / "data" / "raw" / "live_deduped.json"


def normalize_url(url):
    parts = urlsplit(url.strip())
    scheme = parts.scheme.lower() or "https"
    netloc = parts.netloc.lower()
    path = parts.path.rstrip("/")
    return urlunsplit((scheme, netloc, path, parts.query, ""))


def main():
    rows = json.loads(SRC.read_text())

    groups = {}
    order = []
    for row in rows:
        key = normalize_url(row["url"])
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(row)

    merged = []
    for i, key in enumerate(order, start=1):
        group = groups[key]
        # Canonical title = longest title among duplicates (most descriptive).
        title = max((r["title"] for r in group), key=len)

        categories = []
        for r in group:
            if r["category"] not in categories:
                categories.append(r["category"])

        type_variants = []
        for r in group:
            if r["type_raw"] and r["type_raw"] not in type_variants:
                type_variants.append(r["type_raw"])

        notes = [r["note"] for r in group if r["note"]]
        extra_tags = [r["extra_tag_text"] for r in group if r["extra_tag_text"]]
        hubs = [r["hub"] for r in group if r["hub"]]
        years = [r["year"] for r in group if r["year"]]
        sheets = []
        for r in group:
            if r["sheet"] not in sheets:
                sheets.append(r["sheet"])

        merged.append({
            "id": f"CFT-{i:04d}",
            "title": title,
            "url": group[0]["url"],
            "primary_category": categories[0],
            "categories": categories,
            "type_normalized": group[0]["type_normalized"],
            "type_raw_variants": type_variants,
            "note": notes[0] if notes else "",
            "extra_tag_text": extra_tags[0] if extra_tags else "",
            "hub": hubs[0] if hubs else "",
            "year": years[0] if years else "",
            "source_sheets": sheets,
            "merged_from_count": len(group),
        })

    OUT.write_text(json.dumps(merged, indent=2, ensure_ascii=False))
    print(f"live.json: {len(rows)} rows -> live_deduped.json: {len(merged)} unique resources")
    dupes = [m for m in merged if m["merged_from_count"] > 1]
    print(f"{len(dupes)} resources were merged from multiple sheet rows")


if __name__ == "__main__":
    main()
