#!/usr/bin/env python3
"""
Merges the 34 batched blurb-enrichment outputs (data/blurbs/output/batch_*.json)
into data/raw/live_deduped.json, producing the final resource dataset used by
the site and the embedding precompute script.

Source:
  data/raw/live_deduped.json       -- 1071 deduped resources (structural fields)
  data/blurbs/output/batch_*.json  -- enrichment fields (blurb, tags, type_display,
                                       confidence, ambiguous_note?, title_clean?)
Output:
  data/processed/resources.json

Run: python3 scripts/merge_blurbs.py
"""
import json
import glob
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "data" / "raw" / "live_deduped.json"
OUT_DIR = ROOT / "data" / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUT_DIR / "resources.json"

ENRICH_FIELDS = ["blurb", "tags", "type_display", "confidence", "ambiguous_note", "title_clean"]

# The 34 batch agents each independently labeled type_display, producing ~44
# distinct one-off values (e.g. "Blog Post", "Social Post", "Speech/Talk").
# Consolidate into a clean, small facet matching the prototype's register
# (which used only Article/Report/Book/Framework/Tool/Academic Paper).
TYPE_DISPLAY_MAP = {
    "Essay": "Article", "Opinion": "Article", "Blog Post": "Article",
    "Audio Essay": "Article",
    "Policy Document": "Report", "Fact Sheet": "Report", "Working Paper": "Report",
    "Press Release": "Report",
    "Documentary Film": "Video/Talk", "Speech/Talk": "Video/Talk", "Slide Deck": "Video/Talk",
    "Case Study": "Academic Paper",
    "Organization": "Resource Hub",
    "Book Excerpt": "Book",
    "Manifesto": "Framework", "Practice Guide": "Framework",
    "Toolkit": "Tool", "Facilitation Tool": "Tool", "Interactive Tool": "Tool",
    "Workbook": "Tool", "Curriculum": "Tool", "Course": "Tool", "Interactive Story": "Tool",
    "Profile": "Interview", "Transcript": "Interview",
    "Social Post": "Social Media Post",
    "Document": "Other", "Glossary": "Other", "Event Announcement": "Other",
    "Poem": "Other", "Infographic": "Other", "Data": "Other", "Photo Gallery": "Other",
}


def normalize_type_display(value):
    return TYPE_DISPLAY_MAP.get(value, value)


TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
    "emc", "campaign_id", "instance_id", "nl", "regi_id", "segment_id", "te", "user_id",
    "ref", "fbclid", "gclid", "mc_cid", "mc_eid", "smid", "partner",
}


def strip_tracking_params(url):
    """Canonicalization key for catching near-duplicate URLs that differ only
    by email/social tracking params (utm_*, campaign_id, etc). Deliberately
    looser than dedup.py's normalize_url (which preserves query strings,
    since those are load-bearing for e.g. YouTube ?v= or Google Drive links)."""
    parts = urlsplit(url.strip())
    path = parts.path.rstrip("/")
    q = [(k, v) for k, v in parse_qsl(parts.query) if k.lower() not in TRACKING_PARAMS]
    return urlunsplit(("https", parts.netloc.lower(), path, urlencode(q), ""))


def dedup_near_duplicate_urls(records):
    """Collapse resources whose URLs are identical once tracking params are
    stripped (same article, captured twice under different email-link
    variants). Keeps the https/cleaner-URL copy; merges categories/tags."""
    groups = {}
    order = []
    for r in records:
        key = strip_tracking_params(r["url"])
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(r)

    result = []
    dropped = []
    for key in order:
        group = groups[key]
        if len(group) == 1:
            result.append(group[0])
            continue
        # Prefer https scheme, then shortest (cleanest) URL, then lowest id.
        group.sort(key=lambda r: (not r["url"].startswith("https"), len(r["url"]), r["id"]))
        keeper, *rest = group
        for field in ["categories"]:
            for r in rest:
                for v in r.get(field, []):
                    if v not in keeper[field]:
                        keeper[field].append(v)
        for r in rest:
            for t in r.get("tags", []):
                if t not in keeper.get("tags", []):
                    keeper.setdefault("tags", []).append(t)
        dropped.extend(r["id"] for r in rest)
        result.append(keeper)

    if dropped:
        print(f"Collapsed {len(dropped)} near-duplicate URL(s) (tracking-param variants): {dropped}")
    return result


def main():
    base_records = json.loads(BASE.read_text())

    enrichment = {}
    for f in sorted(glob.glob(str(ROOT / "data" / "blurbs" / "output" / "batch_*.json"))):
        batch = json.loads(Path(f).read_text())
        for rec in batch:
            if rec["id"] in enrichment:
                raise ValueError(f"duplicate id {rec['id']} found in {f}")
            enrichment[rec["id"]] = rec

    missing = []
    merged = []
    for base in base_records:
        enrich = enrichment.get(base["id"])
        if enrich is None:
            missing.append(base["id"])
            continue

        record = dict(base)
        if "title_clean" in enrich:
            record["title"] = enrich["title_clean"]
        for field in ["blurb", "tags", "type_display", "confidence", "ambiguous_note"]:
            if field in enrich:
                record[field] = enrich[field]
        if "type_display" in record:
            record["type_display"] = normalize_type_display(record["type_display"])
        merged.append(record)

    if missing:
        print(f"WARNING: {len(missing)} resources had no enrichment data: {missing}")

    merged = dedup_near_duplicate_urls(merged)

    OUT.write_text(json.dumps(merged, indent=2, ensure_ascii=False))
    print(f"Merged {len(merged)} resources -> {OUT}")

    confidence_counts = {}
    for r in merged:
        c = r.get("confidence", "unknown")
        confidence_counts[c] = confidence_counts.get(c, 0) + 1
    print("Confidence breakdown:", confidence_counts)


if __name__ == "__main__":
    main()
