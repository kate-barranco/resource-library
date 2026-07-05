#!/usr/bin/env python3
"""
Copies the built dataset + config into site/data/ so the static site can
fetch them as plain relative-path JSON/binary assets (no build tooling
needed to view the site -- just open site/index.html or serve the folder).

Run: python3 scripts/sync_site_data.py  (also runs as part of `npm run rebuild-data`)
"""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE_DATA = ROOT / "site" / "data"
SITE_DATA.mkdir(parents=True, exist_ok=True)

FILES = [
    ROOT / "data" / "processed" / "resources.json",
    ROOT / "data" / "processed" / "embeddings.bin",
    ROOT / "data" / "processed" / "embeddings_meta.json",
    ROOT / "data" / "config" / "categories.json",
    ROOT / "data" / "config" / "tag_vocabulary.json",
]

def main():
    for f in FILES:
        if not f.exists():
            print(f"WARNING: missing {f}, skipping")
            continue
        dest = SITE_DATA / f.name
        shutil.copy2(f, dest)
        print(f"copied {f.name} -> {dest.relative_to(ROOT)}")

if __name__ == "__main__":
    main()
